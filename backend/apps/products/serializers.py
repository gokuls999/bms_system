from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework import serializers

from apps.core.exceptions import Conflict

from .models import Category, Product

DUPLICATE_SKU = "A product with this SKU already exists."
STALE_PRODUCT = (
    "This product was changed by someone else since you opened it (for example, an order reduced "
    "its stock). Reload it and try again."
)


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Category
        fields = ["id", "name", "created_at", "product_count"]
        read_only_fields = ["id", "created_at"]
        extra_kwargs = {"name": {"error_messages": {"unique": "A category with this name already exists."}}}

    def validate_name(self, value):
        value = value.strip()
        qs = Category.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return value


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    is_low_stock = serializers.SerializerMethodField()
    # Optimistic locking: clients send back the `updated_at` they loaded. If the
    # row changed in the meantime (e.g. an order reduced stock), the save is
    # rejected with 409 instead of silently overwriting the newer stock value.
    expected_updated_at = serializers.DateTimeField(write_only=True, required=False)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "sku",
            "category",
            "category_name",
            "price",
            "stock_quantity",
            "status",
            "is_low_stock",
            "created_at",
            "updated_at",
            "expected_updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            # We validate uniqueness ourselves (case-insensitively), so drop DRF's
            # auto-generated case-sensitive UniqueValidator.
            "sku": {"validators": []},
            "category": {
                "error_messages": {
                    "does_not_exist": "Selected category does not exist.",
                    "incorrect_type": "Select a valid category.",
                }
            },
            "stock_quantity": {
                "min_value": 0,
                "error_messages": {"min_value": "Stock quantity cannot be negative."},
            },
            "price": {
                "min_value": Decimal("0.01"),
                "error_messages": {"min_value": "Price must be greater than zero."},
            },
        }

    def get_is_low_stock(self, obj) -> bool:
        return obj.stock_quantity <= settings.LOW_STOCK_THRESHOLD

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Product name cannot be blank.")
        return value

    def validate_sku(self, value):
        value = value.strip().upper()
        if not value:
            raise serializers.ValidationError("SKU cannot be blank.")
        if not all(ch.isalnum() or ch in "-_" for ch in value):
            raise serializers.ValidationError("SKU may contain only letters, digits, '-' and '_'.")
        qs = Product.objects.filter(sku__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(DUPLICATE_SKU, code="duplicate_sku")
        return value

    # The pre-check above gives a friendly error in the common case; the unique
    # index catches the race where two requests create the same SKU at once.
    def _save_guarding_sku(self, fn, *args):
        try:
            with transaction.atomic():
                return fn(*args)
        except IntegrityError as exc:
            if "sku" in str(exc).lower():
                raise serializers.ValidationError({"sku": [DUPLICATE_SKU]})
            raise

    def create(self, validated_data):
        validated_data.pop("expected_updated_at", None)
        return self._save_guarding_sku(super().create, validated_data)

    def update(self, instance, validated_data):
        expected = validated_data.pop("expected_updated_at", None)

        def locked_update():
            # Lock the row so no order can change it between the check and the write.
            current = Product.objects.select_for_update().get(pk=instance.pk)
            if expected is not None and current.updated_at != expected:
                raise Conflict(STALE_PRODUCT, code="stale_product")
            return super(ProductSerializer, self).update(current, validated_data)

        return self._save_guarding_sku(locked_update)
