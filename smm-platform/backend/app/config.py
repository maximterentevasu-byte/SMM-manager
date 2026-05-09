from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    SECRET_KEY: str
    FERNET_KEY: str
    ANTHROPIC_API_KEY: str
    OPENAI_API_KEY: str = ""
    VK_APP_ID: str = ""
    VK_APP_SECRET: str = ""
    S3_BUCKET: str = "smm-platform-media"
    S3_ENDPOINT: str = "https://storage.yandexcloud.net"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "ru-central1"

    class Config:
        env_file = ".env"

settings = Settings()
