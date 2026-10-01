from django.db.models import Count
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .filters import OrderFilter
from .models import Order
from .serializers import (
    OrderCreateSerializer,
    OrderDetailSerializer,
    OrderListSerializer,
    OrderPreviewSerializer,
)


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    Orders - Admin and Staff. Orders are immutable once created (no PUT/DELETE),
    because they carry stock movements and price snapshots.
    """

    filterset_class = OrderFilter
    search_fields = ["customer__name", "customer__email", "items__product_name", "items__sku"]
    ordering_fields = ["created_at", "total_amount", "id"]

    def get_queryset(self):
        qs = (
            Order.objects.select_related("customer", "created_by")
            .annotate(item_count=Count("items", distinct=True))
            .order_by("-created_at", "-id")
        )
        if self.action == "retrieve":
            qs = qs.prefetch_related("items")
        return qs

    def get_serializer_class(self):
        if self.action == "retrieve":
            return OrderDetailSerializer
        if self.action == "create":
            return OrderCreateSerializer
        if self.action == "preview":
            return OrderPreviewSerializer
        return OrderListSerializer

    def filter_queryset(self, queryset):
        # Searching across order items joins a to-many relation; de-duplicate.
        qs = super().filter_queryset(queryset)
        return qs.distinct() if self.request.query_params.get("search") else qs

    @extend_schema(request=OrderCreateSerializer, responses={201: OrderDetailSerializer})
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = services.create_order(user=request.user, **serializer.validated_data)
        order = self.get_queryset().prefetch_related("items").get(pk=order.pk)
        return Response(OrderDetailSerializer(order).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        request=OrderPreviewSerializer,
        responses=inline_serializer(
            "OrderPreview",
            {
                "items": serializers.ListField(child=serializers.DictField()),
                "subtotal": serializers.CharField(),
                "discount_amount": serializers.CharField(),
                "total_amount": serializers.CharField(),
            },
        ),
        summary="Calculate totals and check stock without creating an order",
    )
    @action(detail=False, methods=["post"])
    def preview(self, request):
        """Server-side price calculation + stock check without creating anything."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lines, totals = services.preview_order(**serializer.validated_data)
        # Render money as fixed-point strings, like every other endpoint ("500.00").
        for line in lines:
            line["unit_price"] = f"{line['unit_price']:.2f}"
            line["line_total"] = f"{line['line_total']:.2f}"
        return Response(
            {
                "items": lines,
                "subtotal": f"{totals.subtotal:.2f}",
                "discount_amount": f"{totals.discount_amount:.2f}",
                "total_amount": f"{totals.total_amount:.2f}",
            }
        )
