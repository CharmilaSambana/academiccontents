from typing import Literal

from pydantic import BaseModel, EmailStr, Field

Regulation = Literal["R25", "R24", "R23", "R22"]
Role = Literal["student", "teacher"]
EventType = Literal["view", "download"]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    full_name: str = Field(min_length=1, max_length=120)
    role: Role = "student"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    user_id: str
    role: Role | None = None


class ProfileResponse(BaseModel):
    id: str
    full_name: str
    regulation: str | None = None
    role: Role | None = None


class RegulationUpdate(BaseModel):
    regulation: Regulation


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    code: str = Field(default="", max_length=32)
    regulation: Regulation


class SubjectResponse(BaseModel):
    id: str
    name: str
    code: str
    regulation: str
    teacher_id: str


class MaterialResponse(BaseModel):
    id: str
    title: str
    regulation: str
    subject_id: str
    teacher_id: str
    file_path: str
    created_at: str


class EventCreate(BaseModel):
    material_id: str
    event_type: EventType


class MaterialStats(BaseModel):
    material_id: str
    title: str
    subject: str
    regulation: str
    views: int
    downloads: int


class SignedUrlResponse(BaseModel):
    url: str
    expires_in: int
