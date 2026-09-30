from rest_framework import serializers

from apps.customers.models import Customer

from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ["id", "product", "product_name", "sku", "unit_price", "quantity", "line_total"]


class OrderListSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default=None)

    class Meta:
        model = Order
        fields = [
            "id",
            "order_number",
            "customer",
            "customer_name",
            "item_count",
            "subtotal",
            "discount_amount",
            "total_amount",
            "created_by_username",
            "created_at",
        ]


class OrderDetailSerializer(OrderListSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    customer_email = serializers.CharField(source="customer.email", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)

    class Meta(OrderListSerializer.Meta):
        fields = OrderListSerializer.Meta.fields + [
            "customer_email",
            "customer_phone",
            "discount_type",
            "discount_value",
            "notes",
            "items",
        ]


class OrderLineInputSerializer(serializers.Serializer):
    product = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(
        min_value=1,
        max_value=100000,
        error_messages={"min_value": "Quantity must be at least 1."},
    )


class _OrderInputBase(serializers.Serializer):
    items = OrderLineInputSerializer(many=True, allow_empty=False)
    discount_type = serializers.ChoiceField(choices=Order.DiscountType.choices, default=Order.DiscountType.AMOUNT)
    discount_value = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, default=0)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("An order must contain at least one product.")
        return value


class OrderPreviewSerializer(_OrderInputBase):
    pass


class OrderCreateSerializer(_OrderInputBase):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        error_messages={"does_not_exist": "Customer {pk_value} does not exist."},
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="", max_length=1000)

    def validate_customer(self, customer):
        if customer.status != Customer.Status.ACTIVE:
            raise serializers.ValidationError("Orders cannot be placed for an inactive customer.")
        return customer
