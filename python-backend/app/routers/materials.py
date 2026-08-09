import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from ..config import settings
from ..deps import CurrentUser, get_current_user, require_teacher
from ..schemas import EventCreate, MaterialResponse, SignedUrlResponse

router = APIRouter(prefix="/api/materials", tags=["materials"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SIGNED_URL_TTL = 60 * 10


@router.get("", response_model=list[MaterialResponse])
def list_materials(
    regulation: str | None = Query(default=None),
    subject_id: str | None = Query(default=None),
    mine: bool = Query(default=False),
    user: CurrentUser = Depends(get_current_user),
) -> list[MaterialResponse]:
    query = user.client.table("materials").select(
        "id, title, regulation, subject_id, teacher_id, file_path, created_at"
    )
    if regulation:
        query = query.eq("regulation", regulation)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    if mine:
        query = query.eq("teacher_id", user.id)
    rows = query.order("created_at", desc=True).execute()
    return [MaterialResponse(**row) for row in rows.data]


@router.post("", response_model=MaterialResponse, status_code=201)
async def upload_material(
    title: str = Form(..., min_length=1, max_length=200),
    subject_id: str = Form(...),
    regulation: str = Form(...),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_teacher),
) -> MaterialResponse:
    if file.content_type != "application/pdf":
        raise HTTPException(415, "Only PDF files are accepted")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "File exceeds the 20MB limit")

    file_path = f"{user.id}/{uuid.uuid4()}.pdf"
    storage = user.client.storage.from_(settings.materials_bucket)
    try:
        storage.upload(file_path, content, {"content-type": "application/pdf"})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Upload failed: {exc}") from exc

    rows = (
        user.client.table("materials")
        .insert(
            {
                "teacher_id": user.id,
                "subject_id": subject_id,
                "regulation": regulation,
                "title": title,
                "file_path": file_path,
            }
        )
        .execute()
    )
    if not rows.data:
        storage.remove([file_path])
        raise HTTPException(400, "Could not save material record")
    return MaterialResponse(**rows.data[0])


@router.get("/{material_id}/signed-url", response_model=SignedUrlResponse)
def signed_url(
    material_id: str, user: CurrentUser = Depends(get_current_user)
) -> SignedUrlResponse:
    material = _get_material(user, material_id)
    signed = user.client.storage.from_(settings.materials_bucket).create_signed_url(
        material["file_path"], SIGNED_URL_TTL
    )
    url = signed.get("signedURL") or signed.get("signedUrl")
    if not url:
        raise HTTPException(404, "Could not sign this file")
    return SignedUrlResponse(url=url, expires_in=SIGNED_URL_TTL)


@router.get("/{material_id}/file")
def stream_material(
    material_id: str,
    mode: str = Query(default="inline", pattern="^(inline|download)$"),
    user: CurrentUser = Depends(get_current_user),
):
    """Same-origin proxy so browsers never hit the storage domain directly."""
    material = _get_material(user, material_id)
    try:
        content = user.client.storage.from_(settings.materials_bucket).download(
            material["file_path"]
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(404, "File not found") from exc

    safe_title = "".join(c for c in material["title"] if c.isalnum() or c in " -_") or "material"
    disposition = f'{"attachment" if mode == "download" else "inline"}; filename="{safe_title}.pdf"'
    return StreamingResponse(
        iter([content]),
        media_type="application/pdf",
        headers={
            "content-disposition": disposition,
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
        },
    )


@router.post("/events", status_code=201)
def record_event(payload: EventCreate, user: CurrentUser = Depends(get_current_user)) -> dict:
    user.client.table("material_events").insert(
        {
            "material_id": payload.material_id,
            "student_id": user.id,
            "event_type": payload.event_type,
        }
    ).execute()
    return {"ok": True}


def _get_material(user: CurrentUser, material_id: str) -> dict:
    rows = (
        user.client.table("materials")
        .select("id, title, file_path")
        .eq("id", material_id)
        .execute()
    )
    if not rows.data:
        raise HTTPException(404, "Material not found")
    return rows.data[0]
