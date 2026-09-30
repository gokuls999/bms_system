import re

from rest_framework import serializers

from .models import Customer

PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-]{6,18}[0-9]$")


class CustomerSerializer(serializers.ModelSerializer):
    order_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Customer
        fields = ["id", "name", "email", "phone", "address", "status", "created_at", "updated_at", "order_count"]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {"email": {"error_messages": {"unique": "A customer with this email already exists."}}}

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name cannot be blank.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        qs = Customer.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A customer with this email already exists.")
        return value

    def validate_phone(self, value):
        value = value.strip()
        if not PHONE_RE.match(value):
            raise serializers.ValidationError("Enter a valid phone number (8-20 digits, optional leading +).")
        return value
