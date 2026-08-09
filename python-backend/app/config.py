import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    supabase_url: str = os.environ.get("SUPABASE_URL", "")
    publishable_key: str = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    service_role_key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    materials_bucket: str = os.environ.get("MATERIALS_BUCKET", "materials")
    cors_origins: list[str] = [
        o.strip()
        for o in os.environ.get("CORS_ORIGINS", "http://localhost:8080").split(",")
        if o.strip()
    ]

    def validate(self) -> None:
        missing = [
            name
            for name, value in (
                ("SUPABASE_URL", self.supabase_url),
                ("SUPABASE_PUBLISHABLE_KEY", self.publishable_key),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(f"Missing environment variable(s): {', '.join(missing)}")


settings = Settings()
