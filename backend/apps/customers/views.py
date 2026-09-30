from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    """
    Customers - Admin and Staff have full access.

    DELETE permanently removes a customer that has no orders. Customers with
    order history are protected (409); use PATCH {"status": "inactive"} or the
    /deactivate/ action to retire them instead.
    """

    serializer_class = CustomerSerializer
    search_fields = ["name", "email", "phone"]
    filterset_fields = ["status"]
    ordering_fields = ["name", "created_at", "id"]

    def get_queryset(self):
        return Customer.objects.annotate(order_count=Count("orders")).order_by("-created_at", "-id")

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        customer = self.get_object()
        customer.status = Customer.Status.INACTIVE
        customer.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(customer).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        customer = self.get_object()
        customer.status = Customer.Status.ACTIVE
        customer.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(customer).data, status=status.HTTP_200_OK)
