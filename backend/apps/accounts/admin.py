from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["username", "email", "role", "can_delete", "is_active", "date_joined"]
    list_filter = ["role", "is_active"]
    fieldsets = BaseUserAdmin.fieldsets + (("Role", {"fields": ("role", "can_delete")}),)
    add_fieldsets = BaseUserAdmin.add_fieldsets + (("Role", {"fields": ("email", "role")}),)
