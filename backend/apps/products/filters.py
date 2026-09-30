import django_filters
from django.conf import settings

from .models import Product


class ProductFilter(django_filters.FilterSet):
    low_stock = django_filters.BooleanFilter(method="filter_low_stock")
    min_price = django_filters.NumberFilter(field_name="price", lookup_expr="gte")
    max_price = django_filters.NumberFilter(field_name="price", lookup_expr="lte")

    class Meta:
        model = Product
        fields = ["category", "status"]

    def filter_low_stock(self, queryset, name, value):
        if value is None:
            return queryset
        lookup = {"stock_quantity__lte": settings.LOW_STOCK_THRESHOLD}
        return queryset.filter(**lookup) if value else queryset.exclude(**lookup)
