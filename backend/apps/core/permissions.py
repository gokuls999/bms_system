from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_admin(user):
    return bool(user and user.is_authenticated and getattr(user, "is_admin_role", False))


class IsAdmin(BasePermission):
    """Only users with the Admin role."""

    message = "Only administrators can perform this action."

    def has_permission(self, request, view):
        return is_admin(request.user)


class CanDeleteRecords(BasePermission):
    """
    Any authenticated user can read, create and edit. Deleting requires the Admin
    role, or a Staff account that an Admin has granted the `can_delete` permission.
    """

    message = "You don't have permission to delete this. Ask an administrator."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return request.method != "DELETE" or getattr(user, "can_delete_records", False)


class IsAdminOrReadOnly(BasePermission):
    """Any authenticated user can read; only Admins can write."""

    message = "Only administrators can modify this resource."

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or is_admin(request.user)
