from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, anon_client, get_current_user
from ..schemas import (
    LoginRequest,
    ProfileResponse,
    RegisterRequest,
    RegulationUpdate,
    SessionResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _role_for(user: CurrentUser) -> str | None:
    rows = user.client.table("user_roles").select("role").eq("user_id", user.id).execute()
    return rows.data[0]["role"] if rows.data else None


@router.post("/register", response_model=SessionResponse)
def register(payload: RegisterRequest) -> SessionResponse:
    """Sign up. The `handle_new_user` trigger creates the profile and role row."""
    client = anon_client()
    try:
        result = client.auth.sign_up(
            {
                "email": payload.email,
                "password": payload.password,
                "options": {
                    "data": {"full_name": payload.full_name, "role": payload.role},
                },
            }
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc

    if result.session is None or result.user is None:
        raise HTTPException(202, "Check your email to confirm the account before signing in.")

    return SessionResponse(
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
        user_id=result.user.id,
        role=payload.role,
    )


@router.post("/login", response_model=SessionResponse)
def login(payload: LoginRequest) -> SessionResponse:
    client = anon_client()
    try:
        result = client.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(401, "Invalid email or password") from exc

    if result.session is None or result.user is None:
        raise HTTPException(401, "Invalid email or password")

    client.postgrest.auth(result.session.access_token)
    rows = (
        client.table("user_roles").select("role").eq("user_id", result.user.id).execute()
    )

    return SessionResponse(
        access_token=result.session.access_token,
        refresh_token=result.session.refresh_token,
        user_id=result.user.id,
        role=rows.data[0]["role"] if rows.data else None,
    )


@router.get("/me", response_model=ProfileResponse)
def me(user: CurrentUser = Depends(get_current_user)) -> ProfileResponse:
    rows = (
        user.client.table("profiles")
        .select("id, full_name, regulation")
        .eq("id", user.id)
        .execute()
    )
    if not rows.data:
        raise HTTPException(404, "Profile not found")
    profile = rows.data[0]
    return ProfileResponse(role=_role_for(user), **profile)


@router.put("/me/regulation", response_model=ProfileResponse)
def set_regulation(
    payload: RegulationUpdate, user: CurrentUser = Depends(get_current_user)
) -> ProfileResponse:
    rows = (
        user.client.table("profiles")
        .update({"regulation": payload.regulation})
        .eq("id", user.id)
        .execute()
    )
    if not rows.data:
        raise HTTPException(404, "Profile not found")
    return ProfileResponse(role=_role_for(user), **rows.data[0])
