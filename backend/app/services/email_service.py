import re
import json
import urllib.request
import urllib.error
from app.config import settings


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Отправляет письмо через Brevo API используя urllib"""

    if settings.BREVO_API_KEY:
        sender_email = settings.SMTP_FROM or "no-reply@smmplatform.pro"

        payload = json.dumps({
            "sender": {"name": "smmplatform", "email": sender_email},
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": html_body,
        }).encode("utf-8")

        req = urllib.request.Request(
            "https://api.brevo.com/v3/smtp/email",
            data=payload,
            headers={
                "api-key": settings.BREVO_API_KEY,
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                status = response.status
                if status in (200, 201):
                    print(f"[EMAIL OK] Brevo → {to} (status={status})")
                    return True
                else:
                    body = response.read().decode()
                    print(f"[EMAIL ERROR] Brevo status={status}: {body}")
                    return False

        except urllib.error.HTTPError as e:
            body = e.read().decode()
            print(f"[EMAIL ERROR] Brevo HTTP {e.code}: {body}")
            return False
        except urllib.error.URLError as e:
            print(f"[EMAIL ERROR] Brevo URL error: {e.reason}")
            return False
        except TimeoutError:
            print(f"[EMAIL ERROR] Brevo timeout after 10s")
            return False
        except Exception as e:
            print(f"[EMAIL ERROR] Brevo {type(e).__name__}: {e}")
            return False

    # Mock режим — BREVO_API_KEY не задан
    codes = re.findall(r'\d{6}', html_body)
    code_str = codes[0] if codes else '???'
    print(f"[EMAIL MOCK] BREVO_API_KEY not set. To: {to} | Code: {code_str}")
    return True


def _base_template(content: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;
              border:1px solid #E5E7EB;overflow:hidden;
              box-shadow:0 4px 24px rgba(13,27,42,0.07);">
    <div style="background:#0D1B2A;padding:20px 32px;text-align:center;">
      <span style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.5px;
                   font-family:'Segoe UI',Arial,sans-serif;">
        smm<span style="color:#3478F6;">platform</span>
      </span>
    </div>
    {content}
    <div style="padding:16px 32px;background:#F5F7FA;border-top:1px solid #E5E7EB;text-align:center;">
      <p style="color:#9CA3AF;font-size:11px;margin:0;">
        © 2026 smmplatform.pro · AI-платформа для системного SMM
      </p>
    </div>
  </div>
</body>
</html>"""


def send_verification_code(to: str, code: str, name: str = "") -> bool:
    print(f"[EMAIL] Sending code {code} to {to}")
    subject = "Ваш код подтверждения — smmplatform"
    content = f"""
    <div style="padding:32px;">
      <h1 style="font-size:20px;font-weight:700;color:#0D1B2A;margin:0 0 8px;">
        Подтвердите email
      </h1>
      <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6;">
        {'Привет, ' + name + '! Введите' if name else 'Введите'} этот код для входа в smmplatform:
      </p>
      <div style="background:#EAF4FF;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0D1B2A;
                     font-family:'Courier New',monospace;">
          {code}
        </span>
      </div>
      <p style="color:#9CA3AF;font-size:12px;margin:0;line-height:1.6;">
        Код действителен <strong>15 минут</strong>.<br>
        Если вы не регистрировались — просто проигнорируйте это письмо.
      </p>
    </div>"""
    return send_email(to, subject, _base_template(content))


def send_password_reset_code(to: str, code: str) -> bool:
    print(f"[EMAIL] Sending reset code {code} to {to}")
    subject = "Сброс пароля — smmplatform"
    content = f"""
    <div style="padding:32px;">
      <h1 style="font-size:20px;font-weight:700;color:#0D1B2A;margin:0 0 8px;">
        Сброс пароля
      </h1>
      <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6;">
        Вы запросили смену пароля. Введите этот код на странице восстановления:
      </p>
      <div style="background:#EAF4FF;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#0D1B2A;
                     font-family:'Courier New',monospace;">
          {code}
        </span>
      </div>
      <p style="color:#9CA3AF;font-size:12px;margin:0;line-height:1.6;">
        Код действителен <strong>15 минут</strong>.<br>
        Если вы не запрашивали смену пароля — просто проигнорируйте это письмо.
      </p>
    </div>"""
    return send_email(to, subject, _base_template(content))


def send_welcome_email(to: str, plan: str) -> bool:
    plan_names = {
        "demo": "Демо (3 дня)",
        "start": "Старт",
        "business": "Бизнес",
        "pro": "Про",
    }
    subject = "Добро пожаловать в smmplatform!"
    content = f"""
    <div style="padding:32px;">
      <h1 style="font-size:22px;font-weight:700;color:#0D1B2A;margin:0 0 12px;">
        Добро пожаловать!
      </h1>
      <p style="color:#6B7280;font-size:15px;margin:0 0 8px;">
        Ваш аккаунт активирован.
      </p>
      <p style="color:#6B7280;font-size:15px;margin:0 0 24px;">
        Тариф: <strong style="color:#0D1B2A;">{plan_names.get(plan, plan)}</strong>
      </p>
      <a href="https://smmplatform.pro/onboarding"
         style="display:inline-block;padding:13px 28px;background:#3478F6;color:#fff;
                border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
        Начать работу →
      </a>
    </div>"""
    return send_email(to, subject, _base_template(content))


def send_subscription_expiring(to: str, days_left: int) -> bool:
    if days_left == 1:
        days_str = "1 день"
    elif days_left < 5:
        days_str = f"{days_left} дня"
    else:
        days_str = f"{days_left} дней"

    subject = f"Подписка истекает через {days_str} — smmplatform"
    content = f"""
    <div style="padding:32px;">
      <h1 style="font-size:20px;font-weight:700;color:#0D1B2A;margin:0 0 12px;">
        Подписка истекает через {days_str}
      </h1>
      <p style="color:#6B7280;font-size:14px;margin:0 0 24px;line-height:1.6;">
        Продлите подписку, чтобы автопостинг и аналитика продолжали работать без перерывов.
      </p>
      <a href="https://smmplatform.pro/plans"
         style="display:inline-block;padding:13px 28px;background:#3478F6;color:#fff;
                border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
        Продлить подписку →
      </a>
    </div>"""
    return send_email(to, subject, _base_template(content))
