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

    # SMTP — работает с любым провайдером
    # Gmail:     host=smtp.gmail.com     port=587
    # Yandex:    host=smtp.yandex.ru     port=465
    # Mail.ru:   host=smtp.mail.ru       port=465
    # Outlook:   host=smtp.office365.com port=587
    SMTP_HOST: str = "smtp.yandex.ru"
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