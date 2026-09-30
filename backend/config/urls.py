from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import UserViewSet
from apps.customers.views import CustomerViewSet
from apps.dashboard.views import DashboardView
from apps.orders.views import OrderViewSet
from apps.products.views import CategoryViewSet, ProductViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("customers", CustomerViewSet, basename="customer")
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("orders", OrderViewSet, basename="order")


def api_not_found(request, *args, **kwargs):
    return JsonResponse({"detail": "Endpoint not found.", "code": "not_found"}, status=404)


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls")),
    re_path(r"^api/dashboard/?$", DashboardView.as_view(), name="dashboard"),
    path("api/", include(router.urls)),
    re_path(r"^api/.*$", api_not_found),
]
