from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import CanDeleteRecords

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    """
    Customers - Admin and Staff can create, view, edit and (de)activate.

    DELETE needs delete permission (Admins always; Staff only when an Admin
    grants it). It permanently removes a customer that has no orders; customers
    with order history are protected (409) and should be deactivated instead.
    """

    serializer_class = CustomerSerializer
    permission_classes = [CanDeleteRecords]
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
