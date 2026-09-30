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

    def test_staff_read_only(self):
        make_product()
        self.assertEqual(self.staff_client.get("/api/products/").status_code, status.HTTP_200_OK)
        res = self.staff_client.post("/api/products/", self.payload(), format="json")
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
