from rest_framework import status

from apps.core.testing import BaseAPITestCase, make_product
from apps.products.models import Category, Product


class ProductAPITests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name="Electronics")

    def payload(self, **overrides):
        data = {"name": "Mouse", "sku": "el-001", "category": self.category.pk, "price": "599.00", "stock_quantity": 5}
        data.update(overrides)
        return data

    def test_admin_crud(self):
        res = self.admin_client.post("/api/products/", self.payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["sku"], "EL-001")  # normalised
        self.assertEqual(res.data["category_name"], "Electronics")
        pid = res.data["id"]

        res = self.admin_client.put(f"/api/products/{pid}/", self.payload(price="649.50"), format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertEqual(res.data["price"], "649.50")

        self.assertEqual(self.admin_client.delete(f"/api/products/{pid}/").status_code, status.HTTP_204_NO_CONTENT)

    def test_staff_can_create_and_edit_but_not_delete(self):
        res = self.staff_client.post("/api/products/", self.payload(), format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        pid = res.data["id"]

        res = self.staff_client.patch(f"/api/products/{pid}/", {"price": "700.00"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        res = self.staff_client.delete(f"/api/products/{pid}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(res.data["code"], "permission_denied")
        self.assertTrue(Product.objects.filter(pk=pid).exists())

    def test_staff_with_delete_permission_can_delete_product(self):
        self.staff.can_delete = True
        self.staff.save()
        product = make_product(category=self.category)
        self.assertEqual(self.staff_client.delete(f"/api/products/{product.pk}/").status_code, 204)

    def test_staff_categories_create_but_not_delete(self):
        res = self.staff_client.post("/api/categories/", {"name": "Toys"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        res = self.staff_client.delete(f"/api/categories/{res.data['id']}/")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_duplicate_sku_case_insensitive(self):
        make_product(sku="EL-001")
        res = self.admin_client.post("/api/products/", self.payload(sku=" el-001 "), format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["errors"]["sku"], ["A product with this SKU already exists."])

    def test_update_keeping_own_sku_is_allowed(self):
        p = make_product(sku="EL-001", category=self.category)
        res = self.admin_client.patch(f"/api/products/{p.pk}/", {"sku": "el-001", "name": "Renamed"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)

    def test_stock_and_price_validation(self):
        res = self.admin_client.post("/api/products/", self.payload(stock_quantity=-1, price="0"), format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("stock_quantity", res.data["errors"])
        self.assertIn("price", res.data["errors"])

    def test_stale_edit_after_order_is_rejected(self):
        from apps.core.testing import make_customer
        from apps.orders.services import create_order

        product = make_product(category=self.category, stock=4)
        loaded = self.admin_client.get(f"/api/products/{product.pk}/").data  # admin opens the edit form

        create_order(customer=make_customer(), items=[{"product": product.pk, "quantity": 3}])  # stock 4 -> 1

        res = self.admin_client.put(
            f"/api/products/{product.pk}/",
            {**self.payload(sku=loaded["sku"], stock_quantity=loaded["stock_quantity"], price="650.00"),
             "expected_updated_at": loaded["updated_at"]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(res.data["code"], "stale_product")
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 1)  # the stale "4" was NOT written back

    def test_edit_with_current_version_succeeds(self):
        product = make_product(category=self.category, stock=4)
        loaded = self.admin_client.get(f"/api/products/{product.pk}/").data
        res = self.admin_client.patch(
            f"/api/products/{product.pk}/",
            {"price": "650.00", "expected_updated_at": loaded["updated_at"]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK, res.data)
        self.assertNotEqual(res.data["updated_at"], loaded["updated_at"])
        self.assertNotIn("expected_updated_at", res.data)

    def test_unknown_category_message(self):
        res = self.admin_client.post("/api/products/", self.payload(category=99999), format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["errors"]["category"], ["Selected category does not exist."])

    def test_search_category_filter_low_stock(self):
        other = Category.objects.create(name="Furniture")
        make_product(name="Wireless Mouse", category=self.category, stock=50)
        make_product(name="Chair", category=other, stock=2)
        make_product(name="Desk", category=other, stock=40)

        self.assertEqual(self.staff_client.get("/api/products/?search=mouse").data["count"], 1)
        self.assertEqual(self.staff_client.get(f"/api/products/?category={other.pk}").data["count"], 2)
        self.assertEqual(self.staff_client.get("/api/products/?low_stock=true").data["count"], 1)

    def test_category_in_use_cannot_be_deleted(self):
        make_product(category=self.category)
        res = self.admin_client.delete(f"/api/categories/{self.category.pk}/")
        self.assertEqual(res.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(Product.objects.count(), 1)
