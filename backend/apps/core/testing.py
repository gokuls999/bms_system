"""Shared helpers for API tests."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient, APITestCase

from apps.customers.models import Customer
from apps.products.models import Category, Product

User = get_user_model()


def make_user(username="staff", role=User.Role.STAFF, password="Str0ng!Pass"):
    return User.objects.create_user(username=username, email=f"{username}@test.local", password=password, role=role)


def make_customer(name="Arun", status=Customer.Status.ACTIVE, **kw):
    n = Customer.objects.count() + 1
    return Customer.objects.create(
        name=name, email=kw.pop("email", f"cust{n}@test.local"), phone="+91 9876543210", status=status, **kw
    )


def make_product(name="Product A", price="500", stock=10, sku=None, category=None, **kw):
    category = category or Category.objects.get_or_create(name="General")[0]
    n = Product.objects.count() + 1
    return Product.objects.create(
        name=name, sku=sku or f"SKU-{n}", category=category, price=Decimal(price), stock_quantity=stock, **kw
    )


def authed_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class BaseAPITestCase(APITestCase):
    def setUp(self):
        self.admin = make_user("admin", User.Role.ADMIN)
        self.staff = make_user("staff", User.Role.STAFF)
        self.admin_client = authed_client(self.admin)
        self.staff_client = authed_client(self.staff)
        self.anon_client = APIClient()
