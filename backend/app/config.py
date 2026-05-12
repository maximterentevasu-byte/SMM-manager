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

    # Brevo (бывший Sendinblue) — рекомендуется для Railway
    # Регистрация: https://brevo.com → API Keys
    # Бесплатно: 300 писем/день без домена
    BREVO_API_KEY: str = ""

    # Resend — требует верифицированный домен
    RESEND_API_KEY: str = ""

    # SMTP — заблокирован Railway (оставляем для локальной разработки)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # ЮКасса
    YOOKASSA_SHOP_ID: str = ""
    YOOKASSA_SECRET_KEY: str = ""

    # Gemini (Google) — генерация изображений через Imagen 3
    GEMINI_API_KEY: str = ""

    # Telegram Analytics (MTProto — отдельно от Bot API)
    # Получить: https://my.telegram.org → API development tools
    TG_API_ID: int = 0
    TG_API_HASH: str = ""
    # Сессия генерируется один раз: python -c "from telethon.sync import TelegramClient; c=TelegramClient('s',API_ID,API_HASH); c.start(); print(c.session.save())"
    TG_STRING_SESSION: str = ""

    class Config:
        env_file = ".env"


settings = Settings()