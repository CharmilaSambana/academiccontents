from fastapi import APIRouter, Depends, HTTPException, Query

from ..deps import CurrentUser, get_current_user, require_teacher
from ..schemas import SubjectCreate, SubjectResponse

router = APIRouter(prefix="/api/subjects", tags=["subjects"])


@router.get("", response_model=list[SubjectResponse])
def list_subjects(
    regulation: str | None = Query(default=None),
    mine: bool = Query(default=False, description="Only subjects owned by the caller"),
    user: CurrentUser = Depends(get_current_user),
) -> list[SubjectResponse]:
    query = user.client.table("subjects").select("id, name, code, regulation, teacher_id")
    if regulation:
        query = query.eq("regulation", regulation)
    if mine:
        query = query.eq("teacher_id", user.id)
    rows = query.order("name").execute()
    return [SubjectResponse(**row) for row in rows.data]


@router.post("", response_model=SubjectResponse, status_code=201)
def create_subject(
    payload: SubjectCreate, user: CurrentUser = Depends(require_teacher)
) -> SubjectResponse:
    rows = (
        user.client.table("subjects")
        .insert(
            {
                "teacher_id": user.id,
                "name": payload.name,
                "code": payload.code,
                "regulation": payload.regulation,
            }
        )
        .execute()
    )
    if not rows.data:
        raise HTTPException(400, "Could not create subject")
    return SubjectResponse(**rows.data[0])


@router.delete("/{subject_id}", status_code=204)
def delete_subject(subject_id: str, user: CurrentUser = Depends(require_teacher)) -> None:
    user.client.table("subjects").delete().eq("id", subject_id).eq(
        "teacher_id", user.id
    ).execute()
