from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.customers.models import Customer
from apps.orders.models import Order
from apps.orders.serializers import OrderListSerializer
from apps.products.models import Product
from apps.products.serializers import ProductSerializer

SALES_TREND_DAYS = 14


def _money(value):
    # Match the serializers, which render decimals as fixed-point strings.
    return f"{(value or Decimal('0')):.2f}"


class DashboardView(APIView):
    def get(self, request):
        threshold = settings.LOW_STOCK_THRESHOLD
        low_stock_qs = Product.objects.select_related("category").filter(
            status=Product.Status.ACTIVE, stock_quantity__lte=threshold
        )
        order_stats = Order.objects.aggregate(count=Count("id"), sales=Sum("total_amount"))
        recent_orders = (
            Order.objects.select_related("customer", "created_by")
            .annotate(item_count=Count("items", distinct=True))
            .order_by("-created_at", "-id")[:5]
        )

        start = timezone.localdate() - timedelta(days=SALES_TREND_DAYS - 1)
        daily = {
            row["day"]: row
            for row in Order.objects.filter(created_at__date__gte=start)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(sales=Sum("total_amount"), orders=Count("id"))
        }
        sales_trend = [
            {
                "date": day.isoformat(),
                "sales": _money(daily.get(day, {}).get("sales")),
                "orders": daily.get(day, {}).get("orders") or 0,
            }
            for day in (start + timedelta(days=i) for i in range(SALES_TREND_DAYS))
        ]

        return Response(
            {
                "total_customers": Customer.objects.count(),
                "active_customers": Customer.objects.filter(status=Customer.Status.ACTIVE).count(),
                "total_products": Product.objects.count(),
                "low_stock_threshold": threshold,
                "low_stock_count": low_stock_qs.count(),
                "low_stock_products": ProductSerializer(low_stock_qs.order_by("stock_quantity", "name")[:10], many=True).data,
                "total_orders": order_stats["count"],
                "total_sales": _money(order_stats["sales"]),
                "recent_orders": OrderListSerializer(recent_orders, many=True).data,
                "sales_trend": sales_trend,
            }
        )
