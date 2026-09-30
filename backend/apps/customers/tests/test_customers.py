from rest_framework import status

from apps.core.testing import BaseAPITestCase, make_customer, make_product
from apps.customers.models import Customer
from apps.orders.services import create_order


class CustomerAPITests(BaseAPITestCase):
    def test_staff_crud(self):
        payload = {"name": "Rahul", "email": "rahul@x.com", "phone": "+91 98765 43210", "address": "Kochi"}
        res = self.staff_client.post("/api/customers/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        cid = res.data["id"]
        self.assertEqual(res.data["status"], "active")
        self.assertIn("created_at", res.data)

        self.assertEqual(self.staff_client.get(f"/api/customers/{cid}/").data["name"], "Rahul")

        res = self.staff_client.put(f"/api/customers/{cid}/", {**payload, "name": "Rahul N"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["name"], "Rahul N")

        res = self.staff_client.post(f"/api/customers/{cid}/deactivate/")
        self.assertEqual(res.data["status"], "inactive")

        self.assertEqual(self.staff_client.delete(f"/api/customers/{cid}/").status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.staff_client.get(f"/api/customers/{cid}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_validation(self):
        make_customer(email="dup@x.com")
        res = self.staff_client.post(
            "/api/customers/", {"name": "", "email": "DUP@x.com", "phone": "abc"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(set(res.data["errors"]), {"name", "email", "phone"})

    def test_search_filter_pagination(self):
        for i in range(12):
            make_customer(name=f"Customer {i}", status=Customer.Status.INACTIVE if i % 3 == 0 else "active")
        make_customer(name="Anjali Menon", email="anjali@x.com")

        res = self.staff_client.get("/api/customers/?search=anjali")
        self.assertEqual(res.data["count"], 1)

        res = self.staff_client.get("/api/customers/?status=inactive")
        self.assertEqual(res.data["count"], 4)

        res = self.staff_client.get("/api/customers/?page=2&page_size=5")
        self.assertEqual(res.data["count"], 13)
        self.assertEqual(res.data["total_pages"], 3)
        self.assertEqual(len(res.data["results"]), 5)

    def test_cannot_delete_customer_with_orders(self):
        customer = make_customer()
        create_order(customer=customer, items=[{"product": make_product().pk, "quantity": 1}])
        res = self.staff_client.delete(f"/api/customers/{customer.pk}/")
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data["code"], "protected")
        self.assertTrue(Customer.objects.filter(pk=customer.pk).exists())

    def test_not_found(self):
        res = self.staff_client.get("/api/customers/99999/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(res.data["code"], "not_found")
