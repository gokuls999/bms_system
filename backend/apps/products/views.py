from django.db.models import Count
from rest_framework import viewsets

from apps.core.permissions import IsAdminOrReadOnly

from .filters import ProductFilter
from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    """Categories - readable by everyone, writable by Admins. Not paginated (small list for dropdowns)."""

    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]
    pagination_class = None
    search_fields = ["name"]

    def get_queryset(self):
        return Category.objects.annotate(product_count=Count("products")).order_by("name")


class ProductViewSet(viewsets.ModelViewSet):
    """
    Products - readable by all authenticated users, writable by Admins only.

    Stock is only decremented through order creation (see orders.services), never
    by clients racing on PUT stock_quantity.
    """

    queryset = Product.objects.select_related("category")
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]
    filterset_class = ProductFilter
    search_fields = ["name", "sku", "category__name"]
    ordering_fields = ["name", "price", "stock_quantity", "created_at", "id"]
