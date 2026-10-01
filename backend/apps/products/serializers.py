from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework import serializers

from .models import Category, Product

DUPLICATE_SKU = "A product with this SKU already exists."


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
        return self._save_guarding_sku(super().create, validated_data)

    def update(self, instance, validated_data):
        return self._save_guarding_sku(super().update, instance, validated_data)
