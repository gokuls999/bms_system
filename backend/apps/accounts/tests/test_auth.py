from rest_framework import status

from apps.core.testing import BaseAPITestCase, User


class AuthTests(BaseAPITestCase):
    def test_register_always_creates_staff(self):
        res = self.anon_client.post(
            "/api/auth/register",
            {"username": "newbie", "email": "New@Test.local", "password": "Sup3r!Secret", "role": "admin"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["role"], "staff")
        self.assertNotIn("password", res.data)
        self.assertEqual(User.objects.get(username="newbie").email, "new@test.local")

    def test_register_validation_errors(self):
        res = self.anon_client.post(
            "/api/auth/register", {"username": "x", "email": "staff@test.local", "password": "123"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["code"], "validation_error")
        self.assertIn("email", res.data["errors"])

    def test_duplicate_email_message_case_insensitive(self):
        res = self.anon_client.post(
            "/api/auth/register",
            {"username": "other", "email": "STAFF@test.local", "password": "Sup3r!Secret"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(res.data["errors"]["email"], ["A user with this email already exists."])

    def test_login_returns_tokens_and_user(self):
        res = self.anon_client.post(
            "/api/auth/login", {"username": "admin", "password": "Str0ng!Pass"}, format="json"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)
        self.assertEqual(res.data["user"]["role"], "admin")

    def test_login_bad_credentials(self):
        res = self.anon_client.post("/api/auth/login", {"username": "admin", "password": "wrong"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data["detail"], "Invalid username or password.")

    def test_protected_endpoint_requires_token(self):
        res = self.anon_client.get("/api/customers/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(res.data["code"], "not_authenticated")

    def test_jwt_access_and_logout_blacklists_refresh(self):
        tokens = self.anon_client.post(
            "/api/auth/login/", {"username": "staff", "password": "Str0ng!Pass"}, format="json"
        ).data
        self.anon_client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
        self.assertEqual(self.anon_client.get("/api/auth/me").data["username"], "staff")

        res = self.anon_client.post("/api/auth/logout", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_205_RESET_CONTENT)
        res = self.anon_client.post("/api/auth/refresh", {"refresh": tokens["refresh"]}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_token_rejected(self):
        self.anon_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-token")
        res = self.anon_client.get("/api/dashboard/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class RoleTests(BaseAPITestCase):
    def test_staff_cannot_delete_or_manage_users(self):
        victim = User.objects.create_user(username="victim", email="v@test.local", password="x")
        self.assertEqual(self.staff_client.delete(f"/api/users/{victim.pk}/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.staff_client.get("/api/users/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=victim.pk).exists())

    def test_delete_permission_never_allows_deleting_users(self):
        self.staff.can_delete = True
        self.staff.save()
        victim = User.objects.create_user(username="victim", email="v@test.local", password="x")
        self.assertEqual(self.staff_client.delete(f"/api/users/{victim.pk}/").status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_cannot_grant_themselves_delete_permission(self):
        res = self.staff_client.patch(f"/api/users/{self.staff.pk}/", {"can_delete": True}, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        res = self.anon_client.post(
            "/api/auth/register",
            {"username": "sneaky", "email": "s@test.local", "password": "Sup3r!Secret", "can_delete": True},
            format="json",
        )
        self.assertFalse(User.objects.get(username="sneaky").can_delete)

    def test_admin_can_delete_users_but_not_self(self):
        victim = User.objects.create_user(username="victim", email="v@test.local", password="x")
        self.assertEqual(self.admin_client.delete(f"/api/users/{victim.pk}/").status_code, status.HTTP_204_NO_CONTENT)
        res = self.admin_client.delete(f"/api/users/{self.admin.pk}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_can_create_admin(self):
        res = self.admin_client.post(
            "/api/users/",
            {"username": "boss", "email": "boss@test.local", "password": "Sup3r!Secret", "role": "admin"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED, res.data)
        self.assertEqual(res.data["role"], "admin")

    def test_unknown_api_route_is_json_404(self):
        res = self.admin_client.get("/api/nope/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(res.json()["code"], "not_found")
