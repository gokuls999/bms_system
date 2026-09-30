"""
Seed demo users and sample business data.

    python manage.py seed_demo            # create demo data (skips if already seeded)
    python manage.py seed_demo --reset    # wipe customers/products/orders first
"""

import random
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.orders.services import create_order
from apps.products.models import Category, Product

User = get_user_model()

DEMO_USERS = [
    ("admin", "admin@bms.local", "Admin@12345", User.Role.ADMIN, "Asha", "Admin"),
    ("staff", "staff@bms.local", "Staff@12345", User.Role.STAFF, "Sam", "Staff"),
]

CATALOG = {
    "Electronics": [
        ("Wireless Mouse", 599, 45),
        ("Mechanical Keyboard", 3499, 18),
        ("USB-C Hub 7-in-1", 1899, 7),
        ("27-inch Monitor", 15999, 4),
        ("Bluetooth Speaker", 2499, 25),
    ],
    "Stationery": [
        ("A4 Notebook (Pack of 5)", 350, 120),
        ("Gel Pen Set", 180, 200),
        ("Desk Organizer", 799, 9),
        ("Sticky Notes", 99, 300),
    ],
    "Furniture": [
        ("Ergonomic Office Chair", 12499, 6),
        ("Standing Desk", 24999, 3),
        ("Bookshelf", 5499, 11),
    ],
    "Groceries": [
        ("Filter Coffee 500g", 450, 60),
        ("Green Tea (100 bags)", 399, 8),
        ("Basmati Rice 5kg", 725, 40),
        ("Cold-Pressed Coconut Oil 1L", 380, 2),
    ],
    "Apparel": [
        ("Cotton T-Shirt", 499, 80),
        ("Denim Jacket", 2299, 14),
        ("Running Shoes", 3999, 10),
    ],
}

CUSTOMERS = [
    ("Arun Kumar", "Kochi, Kerala"),
    ("Rahul Nair", "Thiruvananthapuram, Kerala"),
    ("Anjali Menon", "Kozhikode, Kerala"),
    ("Priya Sharma", "Bengaluru, Karnataka"),
    ("Vikram Singh", "Jaipur, Rajasthan"),
    ("Sneha Reddy", "Hyderabad, Telangana"),
    ("Mohammed Faisal", "Chennai, Tamil Nadu"),
    ("Deepa Iyer", "Mumbai, Maharashtra"),
    ("Karthik Raj", "Coimbatore, Tamil Nadu"),
    ("Neha Gupta", "New Delhi, Delhi"),
    ("Joseph Thomas", "Thrissur, Kerala"),
    ("Lakshmi Pillai", "Kollam, Kerala"),
    ("Rohan Das", "Kolkata, West Bengal"),
    ("Fathima Beevi", "Malappuram, Kerala"),
    ("Suresh Babu", "Madurai, Tamil Nadu"),
]


class Command(BaseCommand):
    help = "Seed demo users, categories, products, customers and orders."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing business data first.")

    def handle(self, *args, reset=False, **options):
        rng = random.Random(42)

        for username, email, password, role, first, last in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=username, defaults={"email": email, "role": role, "first_name": first, "last_name": last}
            )
            if created:
                user.set_password(password)
                user.is_staff = role == User.Role.ADMIN  # allow Django admin site access
                user.save()
            self.stdout.write(f"User {username!r} ({role}) {'created' if created else 'already exists'}")

        if reset:
            Order.objects.all().delete()
            Product.objects.all().delete()
            Category.objects.all().delete()
            Customer.objects.all().delete()
        elif Product.objects.exists():
            self.stdout.write(self.style.WARNING("Business data already present - skipping (use --reset)."))
            return

        with transaction.atomic():
            products = []
            for idx, (cat_name, items) in enumerate(CATALOG.items(), start=1):
                category = Category.objects.create(name=cat_name)
                prefix = cat_name[:3].upper()
                for n, (name, price, stock) in enumerate(items, start=1):
                    products.append(
                        Product.objects.create(
                            name=name,
                            sku=f"{prefix}-{idx}{n:03d}",
                            category=category,
                            price=Decimal(price),
                            # Pad stock so seeded orders don't drain it; low-stock items stay low.
                            stock_quantity=stock + 20,
                        )
                    )

            customers = []
            for i, (name, city) in enumerate(CUSTOMERS):
                first = name.split()[0].lower()
                customers.append(
                    Customer.objects.create(
                        name=name,
                        email=f"{first}{i + 1}@example.com",
                        phone=f"+91 98{rng.randint(10000000, 99999999)}",
                        address=city,
                        status=Customer.Status.INACTIVE if i in (12, 14) else Customer.Status.ACTIVE,
                    )
                )

            staff = User.objects.get(username="staff")
            active_customers = [c for c in customers if c.status == Customer.Status.ACTIVE]
            now = timezone.now()
            for _ in range(28):
                picks = rng.sample(products, rng.randint(1, 3))
                discount = rng.choice([0, 0, 50, 100, 250])
                order = create_order(
                    customer=rng.choice(active_customers),
                    items=[{"product": p.pk, "quantity": rng.randint(1, 3)} for p in picks],
                    discount_value=discount,
                    user=staff,
                )
                # Spread demo orders over the last two weeks for the sales trend.
                Order.objects.filter(pk=order.pk).update(
                    created_at=now - timedelta(days=rng.randint(0, 13), hours=rng.randint(0, 10))
                )

            # Restore the intended low-stock levels after seeding orders.
            for product, (_, _, stock) in zip(products, [i for items in CATALOG.values() for i in items]):
                Product.objects.filter(pk=product.pk).update(stock_quantity=stock)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {Category.objects.count()} categories, {Product.objects.count()} products, "
                f"{Customer.objects.count()} customers, {Order.objects.count()} orders."
            )
        )
