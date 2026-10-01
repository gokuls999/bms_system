"""
Order business logic.

Concurrency strategy (assignment section 9)
-------------------------------------------
Order creation runs inside a single database transaction that takes a row-level
lock (SELECT ... FOR UPDATE) on every product being ordered *before* reading its
stock. A second transaction ordering any of the same products blocks on that lock
until the first one commits or rolls back, and then re-reads the already
decremented stock. So with stock = 5, "A orders 4" and "B orders 3" are
serialised: whichever locks first succeeds, the other sees stock = 1 and is
rejected with 409 insufficient_stock.

* Locks are acquired in primary-key order, so two orders touching overlapping
  product sets cannot deadlock each other.
* The decrement itself uses an F() expression (UPDATE ... SET stock = stock - n).
* A CHECK (stock_quantity >= 0) constraint on the table is the final safety net:
  even a code path that forgot to lock could never persist negative inventory.
* Product edits use optimistic locking (see ProductSerializer.update): an edit
  form opened before an order reduced stock cannot write the old stock back.
"""

from collections import OrderedDict
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.exceptions import InsufficientStock
from apps.customers.models import Customer
from apps.products.models import Product

from .models import Order, OrderItem

CENT = Decimal("0.01")


def money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass
class Totals:
    subtotal: Decimal
    discount_amount: Decimal
    total_amount: Decimal


def calculate_totals(lines, discount_type, discount_value):
    """
    lines: iterable of (unit_price, quantity).
    Returns Totals; raises ValidationError if the discount is invalid.
    """
    subtotal = money(sum((Decimal(price) * qty for price, qty in lines), Decimal("0")))
    discount_value = Decimal(discount_value or 0)

    if discount_value < 0:
        raise ValidationError({"discount_value": ["Discount cannot be negative."]})

    if discount_type == Order.DiscountType.PERCENT:
        if discount_value > 100:
            raise ValidationError({"discount_value": ["Percentage discount cannot exceed 100%."]})
        discount_amount = money(subtotal * discount_value / 100)
    else:
        discount_amount = money(discount_value)
        if discount_amount > subtotal:
            raise ValidationError({"discount_value": [f"Discount (₹{discount_amount}) cannot exceed the subtotal (₹{subtotal})."]})

    return Totals(subtotal=subtotal, discount_amount=discount_amount, total_amount=subtotal - discount_amount)


def _merge_lines(items):
    """Collapse duplicate product lines into one line per product (order preserved)."""
    merged = OrderedDict()
    for item in items:
        pid = item["product"].pk if isinstance(item["product"], Product) else int(item["product"])
        merged[pid] = merged.get(pid, 0) + int(item["quantity"])
    return merged


def _check_products(products_by_id, quantities):
    missing = [pid for pid in quantities if pid not in products_by_id]
    if missing:
        raise ValidationError({"items": [f"Product(s) not found: {', '.join(map(str, missing))}."]})

    inactive = [p.name for pid, p in products_by_id.items() if p.status != Product.Status.ACTIVE]
    if inactive:
        raise ValidationError({"items": [f"Product(s) not available for sale: {', '.join(inactive)}."]})

    shortages = [
        {"product_id": pid, "product_name": p.name, "requested": quantities[pid], "available": p.stock_quantity}
        for pid, p in products_by_id.items()
        if quantities[pid] > p.stock_quantity
    ]
    if shortages:
        raise InsufficientStock(shortages)


def preview_order(*, items, discount_type, discount_value):
    """Compute totals and validate stock without locking or persisting anything."""
    quantities = _merge_lines(items)
    products = {p.pk: p for p in Product.objects.filter(pk__in=quantities.keys())}
    _check_products(products, quantities)
    totals = calculate_totals(
        [(products[pid].price, qty) for pid, qty in quantities.items()], discount_type, discount_value
    )
    lines = [
        {
            "product": pid,
            "product_name": products[pid].name,
            "sku": products[pid].sku,
            "unit_price": products[pid].price,
            "quantity": qty,
            "line_total": money(products[pid].price * qty),
            "available": products[pid].stock_quantity,
        }
        for pid, qty in quantities.items()
    ]
    return lines, totals


def create_order(*, customer, items, discount_type=Order.DiscountType.AMOUNT, discount_value=0, notes="", user=None):
    if not items:
        raise ValidationError({"items": ["An order must contain at least one product."]})
    if customer.status != Customer.Status.ACTIVE:
        raise ValidationError({"customer": ["Orders cannot be placed for an inactive customer."]})

    quantities = _merge_lines(items)

    with transaction.atomic():
        # Row-level locks, taken in a deterministic order to avoid deadlocks.
        locked = Product.objects.select_for_update().filter(pk__in=quantities.keys()).order_by("pk")
        products = {p.pk: p for p in locked}

        # Stock is read *after* the lock is held, so it cannot change under us.
        _check_products(products, quantities)

        totals = calculate_totals(
            [(products[pid].price, qty) for pid, qty in quantities.items()], discount_type, discount_value
        )

        order = Order.objects.create(
            customer=customer,
            created_by=user,
            subtotal=totals.subtotal,
            discount_type=discount_type,
            discount_value=money(discount_value or 0),
            discount_amount=totals.discount_amount,
            total_amount=totals.total_amount,
            notes=notes,
        )
        OrderItem.objects.bulk_create(
            [
                OrderItem(
                    order=order,
                    product=products[pid],
                    product_name=products[pid].name,
                    sku=products[pid].sku,
                    unit_price=products[pid].price,
                    quantity=qty,
                    line_total=money(products[pid].price * qty),
                )
                for pid, qty in quantities.items()
            ]
        )
        # Bumping updated_at lets open product-edit forms detect that stock changed.
        now = timezone.now()
        for pid, qty in quantities.items():
            Product.objects.filter(pk=pid).update(stock_quantity=F("stock_quantity") - qty, updated_at=now)

    return order
