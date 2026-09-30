"""
Uniform error responses for the whole API.

Every error body has the shape:

    {"detail": "<human readable message>", "code": "<machine code>", "errors": {...}}

`errors` is only present for field-level validation errors.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import ProtectedError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class Conflict(exceptions.APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The request conflicts with the current state of the resource."
    default_code = "conflict"


class InsufficientStock(Conflict):
    default_detail = "Insufficient stock for one or more products."
    default_code = "insufficient_stock"

    def __init__(self, items):
        # items: list of {"product_id", "product_name", "requested", "available"}
        self.items = items
        names = ", ".join(
            f"{i['product_name']} (requested {i['requested']}, available {i['available']})" for i in items
        )
        super().__init__(detail=f"Insufficient stock: {names}.")


def _first_message(data):
    """Extract a readable top-level message from a DRF validation payload."""
    if isinstance(data, list) and data:
        return _first_message(data[0])
    if isinstance(data, dict) and data:
        key, value = next(iter(data.items()))
        msg = _first_message(value)
        return msg if key in ("non_field_errors", "detail") else f"{key}: {msg}"
    return str(data)


def api_exception_handler(exc, context):
    # Translate Django-level exceptions into DRF ones first.
    if isinstance(exc, Http404):
        exc = exceptions.NotFound("The requested resource was not found.")
    elif isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(exc.message_dict if hasattr(exc, "error_dict") else exc.messages)
    elif isinstance(exc, ProtectedError):
        exc = Conflict(
            "This record is referenced by existing orders and cannot be deleted. Mark it inactive instead.",
            code="protected",
        )
    elif isinstance(exc, IntegrityError):
        exc = Conflict("The operation violates a data integrity constraint.", code="integrity_error")

    response = exception_handler(exc, context)
    if response is None:
        return None  # Unhandled -> Django's 500 handler.

    if isinstance(exc, exceptions.ValidationError):
        body = {
            "detail": _first_message(exc.detail),
            "code": "validation_error",
            "errors": exc.detail if isinstance(exc.detail, dict) else {"non_field_errors": exc.detail},
        }
    else:
        detail = response.data.get("detail", str(exc)) if isinstance(response.data, dict) else response.data
        codes = exc.get_codes() if hasattr(exc, "get_codes") else None
        code = codes if isinstance(codes, str) else getattr(exc, "default_code", "error")
        body = {"detail": str(detail), "code": code}
        if isinstance(exc, InsufficientStock):
            body["items"] = exc.items

    response.data = body
    return response
