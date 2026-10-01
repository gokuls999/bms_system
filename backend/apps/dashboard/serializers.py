"""Response shape of GET /api/dashboard/ (used for the OpenAPI docs)."""

from rest_framework import serializers

from apps.orders.serializers import OrderListSerializer
from apps.products.serializers import ProductSerializer


class SalesTrendPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    sales = serializers.DecimalField(max_digits=14, decimal_places=2)
    orders = serializers.IntegerField()


class TopProductSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    product_name = serializers.CharField()
    sku = serializers.CharField()
    quantity = serializers.IntegerField()
    revenue = serializers.DecimalField(max_digits=14, decimal_places=2)


class DashboardSerializer(serializers.Serializer):
    total_customers = serializers.IntegerField()
    active_customers = serializers.IntegerField()
    total_products = serializers.IntegerField()
    low_stock_threshold = serializers.IntegerField()
    low_stock_count = serializers.IntegerField()
    low_stock_products = ProductSerializer(many=True)
    total_orders = serializers.IntegerField()
    total_sales = serializers.DecimalField(max_digits=14, decimal_places=2)
    recent_orders = OrderListSerializer(many=True)
    sales_trend = SalesTrendPointSerializer(many=True)
    top_products = TopProductSerializer(many=True)
