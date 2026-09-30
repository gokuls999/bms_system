from django.contrib import admin

from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ["product", "product_name", "sku", "unit_price", "quantity", "line_total"]
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["id", "customer", "subtotal", "discount_amount", "total_amount", "created_at"]
    list_select_related = ["customer"]
    inlines = [OrderItemInline]
    readonly_fields = ["subtotal", "discount_amount", "total_amount", "created_by"]

    def has_change_permission(self, request, obj=None):
        return False
