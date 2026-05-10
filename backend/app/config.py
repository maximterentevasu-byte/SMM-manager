from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    SECRET_KEY: str
    FERNET_KEY: str

    ANTHROPIC_API_KEY: str
    OPENAI_API_KEY: str = ""

    KANDINSKY_API_KEY: str = ""
    KANDINSKY_SECRET_KEY: str = ""

    VK_APP_ID: str = ""
    VK_APP_SECRET: str = ""

    S3_BUCKET: str = ""
    S3_ENDPOINT: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "ru-central1"

    # Resend — https://resend.com (рекомендуется)
    RESEND_API_KEY: str = ""

    # SMTP — резервный вариант (может не работать из Railway)
    SMTP_HOST: str = "smtp.mail.ru"
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # ЮКасса — https://yookassa.ru/developers
    YOOKASSA_SHOP_ID: str = ""
    YOOKASSA_SECRET_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()