from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

DUPLICATE_EMAIL = "A user with this email already exists."


def validate_unique_email(value, instance=None):
    """Case-insensitive email uniqueness check with a friendly message."""
    value = value.strip().lower()
    qs = User.objects.filter(email__iexact=value)
    if instance is not None:
        qs = qs.exclude(pk=instance.pk)
    if qs.exists():
        raise serializers.ValidationError(DUPLICATE_EMAIL)
    return value


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "role", "can_delete", "is_active", "date_joined",
        ]
        read_only_fields = ["id", "date_joined"]


class RegisterSerializer(serializers.ModelSerializer):
    """
    Public self-registration. New accounts are always created with the Staff role;
    only an Admin can grant the Admin role (via the users endpoint).
    """

    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "password", "role"]
        read_only_fields = ["id", "role"]
        # Uniqueness is checked case-insensitively in validate_email, with our own message.
        extra_kwargs = {"email": {"validators": []}}

    def validate_email(self, value):
        return validate_unique_email(value)

    def validate(self, attrs):
        candidate = User(**{k: v for k, v in attrs.items() if k != "password"})
        try:
            validate_password(attrs["password"], candidate)
        except Exception as exc:  # django.core.exceptions.ValidationError
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(role=User.Role.STAFF, **validated_data)


class AdminUserSerializer(UserSerializer):
    """Used by Admins to create/update users, including the role."""

    password = serializers.CharField(write_only=True, required=False, style={"input_type": "password"})

    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ["password"]
        extra_kwargs = {"email": {"validators": []}}

    def validate_email(self, value):
        return validate_unique_email(value, self.instance)

    def validate_password(self, value):
        try:
            validate_password(value)
        except Exception as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        if not password:
            raise serializers.ValidationError({"password": ["This field is required."]})
        return User.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=["password"])
        return user


class LoginSerializer(TokenObtainPairSerializer):
    """Returns the user profile together with the token pair."""

    default_error_messages = {"no_active_account": "Invalid username or password."}

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["username"] = user.username
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = UserSerializer(self.user).data
        return data
