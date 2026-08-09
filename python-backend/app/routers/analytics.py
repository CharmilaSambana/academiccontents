from collections import defaultdict

from fastapi import APIRouter, Depends

from ..deps import CurrentUser, require_teacher
from ..schemas import MaterialStats

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/teacher", response_model=list[MaterialStats])
def teacher_stats(user: CurrentUser = Depends(require_teacher)) -> list[MaterialStats]:
    """Unique students who viewed / downloaded each of the teacher's materials.

    Shape matches what the recharts bar chart on the faculty dashboard expects.
    """
    materials = (
        user.client.table("materials")
        .select("id, title, regulation, subject_id")
        .eq("teacher_id", user.id)
        .execute()
    ).data
    if not materials:
        return []

    subject_ids = list({m["subject_id"] for m in materials})
    subjects = (
        user.client.table("subjects").select("id, name").in_("id", subject_ids).execute()
    ).data
    subject_names = {s["id"]: s["name"] for s in subjects}

    material_ids = [m["id"] for m in materials]
    events = (
        user.client.table("material_events")
        .select("material_id, student_id, event_type")
        .in_("material_id", material_ids)
        .execute()
    ).data

    unique: dict[tuple[str, str], set[str]] = defaultdict(set)
    for event in events:
        unique[(event["material_id"], event["event_type"])].add(event["student_id"])

    return [
        MaterialStats(
            material_id=m["id"],
            title=m["title"],
            subject=subject_names.get(m["subject_id"], "Unknown"),
            regulation=m["regulation"],
            views=len(unique[(m["id"], "view")]),
            downloads=len(unique[(m["id"], "download")]),
        )
        for m in materials
    ]
