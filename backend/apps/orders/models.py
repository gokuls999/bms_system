from decimal import Decimal

from django.conf import settings
from django.db import models

ORDER_NUMBER_OFFSET = 1000


class Order(models.Model):
    class DiscountType(models.TextChoices):
        AMOUNT = "amount", "Flat amount"
        PERCENT = "percent", "Percentage"

    customer = models.ForeignKey("customers.Customer", on_delete=models.PROTECT, related_name="orders")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="orders"
    )
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.AMOUNT)
    # What the user entered (a rupee amount or a percentage) ...
    discount_value = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    # ... and the resulting rupee amount actually deducted.
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(discount_amount__gte=0), name="order_discount_non_negative"),
            models.CheckConstraint(condition=models.Q(total_amount__gte=0), name="order_total_non_negative"),
        ]

    @property
    def order_number(self):
        return f"#{ORDER_NUMBER_OFFSET + self.pk}" if self.pk else None

    def __str__(self):
        return f"Order {self.order_number}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("products.Product", on_delete=models.PROTECT, related_name="order_items")
    # Snapshots taken at purchase time, so later edits to the product (price,
    # name, SKU) never change historical orders.
    product_name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField()
    line_total = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gt=0), name="order_item_quantity_positive"),
        ]

    def __str__(self):
        return f"{self.product_name} x {self.quantity}"
