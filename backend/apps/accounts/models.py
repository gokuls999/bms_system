from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        STAFF = "staff", "Staff"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STAFF)
    # Staff cannot delete customers/products/categories unless an Admin grants this.
    can_delete = models.BooleanField(
        default=False, help_text="Allow this staff member to delete customers, products and categories."
    )

    REQUIRED_FIELDS = ["email"]

    class Meta:
        ordering = ["id"]

    @property
    def is_admin_role(self):
        # Django superusers are always treated as application admins.
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def can_delete_records(self):
        return self.is_admin_role or self.can_delete

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)
