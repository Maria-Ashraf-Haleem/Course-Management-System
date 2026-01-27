from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl, field_validator
from typing import List
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "Dentist Web"
    ENVIRONMENT: str = "dev"

    # Auth
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    # DB
    DATABASE_URL: str = "sqlite:///./dentist.db"

    # CORS
    ALLOWED_CORS_ORIGINS: List[AnyHttpUrl] | List[str] = ["*"]

    # Files
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 20
    ALLOWED_FILE_TYPES: List[str] = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".zip"]

    @field_validator("ALLOWED_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            if v.strip() == "*":
                return ["*"]
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
