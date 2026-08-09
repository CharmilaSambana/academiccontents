"""Supabase client factories and request auth dependencies."""

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, create_client

from .config import settings


def anon_client() -> Client:
    """Publishable-key client. RLS applies as the `anon` role."""
    return create_client(settings.supabase_url, settings.publishable_key)


def admin_client() -> Client:
    """Service-role client. Bypasses RLS - privileged operations only."""
    if not settings.service_role_key:
        raise HTTPException(500, "SUPABASE_SERVICE_ROLE_KEY is not configured")
    return create_client(settings.supabase_url, settings.service_role_key)


@dataclass
class CurrentUser:
    id: str
    email: str | None
    token: str
    client: Client  # RLS-scoped client acting as this user


def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    """Validate the bearer token and return an RLS-scoped Supabase client."""
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()
    client = anon_client()

    try:
        result = client.auth.get_user(token)
    except Exception as exc:  # noqa: BLE001 - surfaced as 401
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    user = getattr(result, "user", None)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    # Make every PostgREST call run as this user so RLS policies apply.
    client.postgrest.auth(token)
    return CurrentUser(id=user.id, email=user.email, token=token, client=client)


def require_teacher(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    rows = (
        user.client.table("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "teacher")
        .execute()
    )
    if not rows.data:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Teacher role required")
    return user
