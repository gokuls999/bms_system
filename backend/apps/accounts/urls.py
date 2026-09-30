from django.urls import re_path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import LoginView, LogoutView, MeView, RegisterView

# Trailing slash is optional so both /api/auth/login and /api/auth/login/ work.
urlpatterns = [
    re_path(r"^register/?$", RegisterView.as_view(), name="register"),
    re_path(r"^login/?$", LoginView.as_view(), name="login"),
    re_path(r"^logout/?$", LogoutView.as_view(), name="logout"),
    re_path(r"^refresh/?$", TokenRefreshView.as_view(), name="token-refresh"),
    re_path(r"^me/?$", MeView.as_view(), name="me"),
]
