from decimal import Decimal

from rest_framework import status

from apps.core.testing import BaseAPITestCase, make_customer, make_product
from apps.customers.models import Customer
from apps.orders.models import Order


class OrderAPITests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.customer = make_customer("Arun")
        self.a = make_product("Product A", price="500", stock=5)
        self.b = make_product("Product B", price="300", stock=10)

    def post_order(self, items, client=None, **extra):
        body = {"customer": self.customer.pk, "items": items, **extra}
        return (client or self.staff_client).post("/api/orders/", body, format="json")

    def test_assignment_example_totals(self):
        res = self.post_order(
            [{"product": self.a.pk, "quantity": 2}, {"product": self.b.pk, "quantity": 1}], discount_value="100"
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["subtotal"], "1300.00")
        self.assertEqual(res.data["discount_amount"], "100.00")
        self.assertEqual(res.data["total_amount"], "1200.00")
        self.assertEqual(len(res.data["items"]), 2)
        self.assertEqual(res.data["order_number"], f"#{1000 + res.data['id']}")

    def test_stock_decreases(self):
        self.post_order([{"product": self.a.pk, "quantity": 2}])
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock_quantity, 3)

    def test_duplicate_lines_are_merged(self):
        res = self.post_order([{"product": self.a.pk, "quantity": 2}, {"product": self.a.pk, "quantity": 3}])
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["items"][0]["quantity"], 5)
        self.a.refresh_from_db()
        self.assertEqual(self.a.stock_quantity, 0)

    def test_insufficient_stock_rejected_and_nothing_changes(self):
        res = self.post_order([{"product": self.b.pk, "quantity": 1}, {"product": self.a.pk, "quantity": 6}])
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data["code"], "insufficient_stock")
        self.assertEqual(res.data["items"][0]["available"], 5)
        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertEqual((self.a.stock_quantity, self.b.stock_quantity), (5, 10))
        self.assertEqual(Order.objects.count(), 0)

    def test_price_snapshot_is_retained(self):
        res = self.post_order([{"product": self.a.pk, "quantity": 1}])
        self.a.price = Decimal("999")
        self.a.name = "Renamed"
        self.a.save()
        detail = self.staff_client.get(f"/api/orders/{res.data['id']}/").data
        self.assertEqual(detail["items"][0]["unit_price"], "500.00")
        self.assertEqual(detail["items"][0]["product_name"], "Product A")
        self.assertEqual(detail["total_amount"], "500.00")

    def test_percent_discount(self):
        res = self.post_order([{"product": self.b.pk, "quantity": 3}], discount_type="percent", discount_value="10")
        self.assertEqual(res.data["discount_amount"], "90.00")
        self.assertEqual(res.data["total_amount"], "810.00")

    def test_invalid_discounts(self):
        res = self.post_order([{"product": self.b.pk, "quantity": 1}], discount_value="301")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("discount_value", res.data["errors"])
        res = self.post_order([{"product": self.b.pk, "quantity": 1}], discount_type="percent", discount_value="120")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_validation_errors(self):
        res = self.post_order([])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["errors"]["items"], ["An order must contain at least one product."])
        res = self.post_order([{"product": self.a.pk, "quantity": 0}])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.post_order([{"product": 99999, "quantity": 1}])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        res = self.staff_client.post("/api/orders/", {"customer": 99999, "items": []}, format="json")
        self.assertIn("customer", res.data["errors"])

    def test_inactive_customer_and_product(self):
        self.customer.status = Customer.Status.INACTIVE
        self.customer.save()
        res = self.post_order([{"product": self.a.pk, "quantity": 1}])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer", res.data["errors"])

        self.customer.status = Customer.Status.ACTIVE
        self.customer.save()
        self.a.status = "inactive"
        self.a.save()
        res = self.post_order([{"product": self.a.pk, "quantity": 1}])
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_preview_does_not_persist(self):
        res = self.staff_client.post(
            "/api/orders/preview/",
            {"items": [{"product": self.a.pk, "quantity": 2}], "discount_value": "100"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["total_amount"], "900.00")
        self.assertEqual(res.data["items"][0]["unit_price"], "500.00")
        self.assertEqual(Order.objects.count(), 0)

    def test_list_filter_and_404(self):
        other = make_customer("Rahul")
        self.post_order([{"product": self.a.pk, "quantity": 1}])
        self.staff_client.post(
            "/api/orders/", {"customer": other.pk, "items": [{"product": self.b.pk, "quantity": 1}]}, format="json"
        )
        self.assertEqual(self.staff_client.get("/api/orders/").data["count"], 2)
        self.assertEqual(self.staff_client.get(f"/api/orders/?customer={other.pk}").data["count"], 1)
        self.assertEqual(self.staff_client.get("/api/orders/?search=rahul").data["count"], 1)
        self.assertEqual(self.staff_client.get("/api/orders/424242/").status_code, status.HTTP_404_NOT_FOUND)

    def test_orders_are_immutable(self):
        res = self.post_order([{"product": self.a.pk, "quantity": 1}])
        oid = res.data["id"]
        self.assertEqual(self.admin_client.delete(f"/api/orders/{oid}/").status_code, 405)
        self.assertEqual(self.admin_client.put(f"/api/orders/{oid}/", {}, format="json").status_code, 405)

    def test_dashboard(self):
        self.post_order([{"product": self.a.pk, "quantity": 2}, {"product": self.b.pk, "quantity": 1}], discount_value="100")
        data = self.staff_client.get("/api/dashboard/").data
        self.assertEqual(data["total_customers"], 1)
        self.assertEqual(data["total_products"], 2)
        self.assertEqual(data["total_orders"], 1)
        self.assertEqual(Decimal(data["total_sales"]), Decimal("1200"))
        self.assertEqual(data["low_stock_count"], 2)  # stock 3 and 9, threshold 10
        self.assertEqual(data["recent_orders"][0]["customer_name"], "Arun")
        self.assertEqual(len(data["sales_trend"]), 14)
