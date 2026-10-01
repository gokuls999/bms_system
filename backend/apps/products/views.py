from django.db.models import Count
from rest_framework import viewsets

from apps.core.permissions import IsAdminToDelete

from .filters import ProductFilter
from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    """Categories - Admin and Staff can create/edit; only Admins can delete. Not paginated (dropdown list)."""

    serializer_class = CategorySerializer
    permission_classes = [IsAdminToDelete]
    pagination_class = None
    search_fields = ["name"]

    def get_queryset(self):
        return Category.objects.annotate(product_count=Count("products")).order_by("name")


class ProductViewSet(viewsets.ModelViewSet):
    """
    Products - Admin and Staff can create and edit; only Admins can delete.

    Stock is only decremented through order creation (see orders.services), never
    by clients racing on PUT stock_quantity.
    """

    queryset = Product.objects.select_related("category")
    serializer_class = ProductSerializer
    permission_classes = [IsAdminToDelete]
    filterset_class = ProductFilter
    search_fields = ["name", "sku", "category__name"]
    ordering_fields = ["name", "price", "stock_quantity", "created_at", "id"]
