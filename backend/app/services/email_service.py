import smtplib
import ssl
import re
from email.header import Header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Отправляет письмо через SMTP или Resend API"""

    # Resend API
    if settings.RESEND_API_KEY:
        try:
            import httpx
            response = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.SMTP_FROM or "onboarding@resend.dev",
                    "to": [to],
                    "subject": subject,
                    "html": html_body,
                },
                timeout=10,
            )
            if response.status_code in (200, 201):
                print(f"[EMAIL OK] Resend → {to}")
                return True
            else:
                print(f"[EMAIL ERROR] Resend {response.status_code}: {response.text}")
        except Exception as e:
            print(f"[EMAIL ERROR] Resend: {e}")
        return False

    # SMTP (Gmail / Yandex / Mail.ru / любой)
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = Header(subject, "utf-8")
            msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
            msg["To"] = to
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            if settings.SMTP_PORT == 465:
                # SSL
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context) as server:
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.send_message(msg)
            else:
                # STARTTLS (Gmail port 587, Outlook port 587)
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.send_message(msg)

            print(f"[EMAIL OK] SMTP → {to}")
            return True

        except Exception as e:
            print(f"[EMAIL ERROR] SMTP: {e}")
            return False

    # Mock режим — код в логах
    print(f"[EMAIL MOCK] To: {to} | Subject: {subject}")
    codes = re.findall(r'\b\d{6}\b', html_body)
    if codes:
        print(f"[EMAIL MOCK] KOD: {codes[0]}")
    return True


def send_verification_code(to: str, code: str, name: str = "") -> bool:
    subject = "Ваш код подтверждения — SMM Platform"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;
              border:1px solid #EAE8E2;overflow:hidden;">
    <div style="padding:28px 32px 0;">
      <div style="font-size:28px;margin-bottom:8px;">&#127829;</div>
      <h1 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">
        Подтвердите email
      </h1>
      <p style="color:#888;font-size:14px;margin:0 0 24px;line-height:1.6;">
        {'Привет, ' + name + '! Введите' if name else 'Введите'} этот код для входа в SMM Platform:
      </p>
    </div>
    <div style="margin:0 32px;padding:24px;background:#F8F7F4;border-radius:12px;text-align:center;">
      <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a1a1a;
                   font-family:'Courier New',monospace;">
        {code}
      </span>
    </div>
    <div style="padding:20px 32px 28px;">
      <p style="color:#aaa;font-size:12px;margin:0;line-height:1.6;">
        Код действителен <strong>15 минут</strong>.<br>
        Если вы не запрашивали код — просто проигнорируйте это письмо.
      </p>
    </div>
  </div>
</body>
</html>"""
    print(f"[EMAIL] Sending code {code} to {to}")
    return send_email(to, subject, html)


def send_welcome_email(to: str, plan: str) -> bool:
    plan_names = {
        "demo": "Демо (3 дня)",
        "start": "Старт",
        "business": "Бизнес",
        "pro": "Про"
    }
    subject = "Добро пожаловать в SMM Platform!"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;
              border:1px solid #EAE8E2;overflow:hidden;">
    <div style="padding:32px;">
      <h1 style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 12px;">
        Добро пожаловать!
      </h1>
      <p style="color:#555;font-size:15px;margin:0 0 8px;">
        Ваш аккаунт активирован.
      </p>
      <p style="color:#555;font-size:15px;margin:0 0 24px;">
        Тариф: <strong>{plan_names.get(plan, plan)}</strong>
      </p>
      <a href="https://frontend-production-2875.up.railway.app/onboarding"
         style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#fff;
                border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
        Начать онбординг
      </a>
    </div>
  </div>
</body>
</html>"""
    return send_email(to, subject, html)


def send_subscription_expiring(to: str, days_left: int) -> bool:
    if days_left == 1:
        days_str = "1 день"
    elif days_left < 5:
        days_str = f"{days_left} дня"
    else:
        days_str = f"{days_left} дней"

    subject = f"Подписка истекает через {days_str} — SMM Platform"
    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;
              border:1px solid #EAE8E2;overflow:hidden;">
    <div style="padding:32px;">
      <h1 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 12px;">
        Подписка истекает через {days_str}
      </h1>
      <p style="color:#555;font-size:14px;margin:0 0 24px;line-height:1.6;">
        Продлите подписку чтобы автопостинг продолжал работать без перерывов.
      </p>
      <a href="https://frontend-production-2875.up.railway.app/plans"
         style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#fff;
                border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
        Продлить подписку
      </a>
    </div>
  </div>
</body>
</html>"""
    return send_email(to, subject, html)