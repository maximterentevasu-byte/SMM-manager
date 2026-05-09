import smtplib
import ssl
from email.header import Header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import re
from app.config import settings


def send_email(to: str, subject: str, html_body: str) -> bool:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print(f"[EMAIL MOCK] To: {to}")
        codes = re.findall(r'\b\d{6}\b', html_body)
        if codes:
            print(f"[EMAIL MOCK] KOD: {codes[0]}")
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        if settings.SMTP_PORT == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, context=context) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                server.ehlo()
                server.starttls()
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.send_message(msg)
        print(f"[EMAIL OK] Отправлено на {to}")
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False


def send_verification_code(to: str, code: str, name: str = "") -> bool:
    subject = "SMM Platform: kod podtverzhdeniya"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #EAE8E2;overflow:hidden;">
    <div style="padding:28px 32px 0;">
      <h1 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">
        Podtverdite email
      </h1>
      <p style="color:#888;font-size:14px;margin:0 0 24px;">
        Vvedite etot kod dlya vhoda v SMM Platform:
      </p>
    </div>
    <div style="margin:0 32px;padding:24px;background:#F8F7F4;border-radius:12px;text-align:center;">
      <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#1a1a1a;font-family:'Courier New',monospace;">
        {code}
      </span>
    </div>
    <div style="padding:20px 32px 28px;">
      <p style="color:#aaa;font-size:12px;margin:0;">
        Kod deystvitelen 15 minut.
      </p>
    </div>
  </div>
</body></html>"""
    print(f"[EMAIL] Sending code {code} to {to}")
    return send_email(to, subject, html)


def send_welcome_email(to: str, plan: str) -> bool:
    subject = "Welcome to SMM Platform!"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #EAE8E2;padding:32px;">
    <h1 style="font-size:22px;font-weight:700;color:#1a1a1a;">Welcome!</h1>
    <p style="color:#555;font-size:14px;">Plan: {plan}</p>
    <a href="http://localhost:3000/onboarding"
       style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">
      Start onboarding
    </a>
  </div>
</body></html>"""
    return send_email(to, subject, html)


def send_subscription_expiring(to: str, days_left: int) -> bool:
    subject = f"SMM Platform: subscription expires in {days_left} days"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8F7F4;font-family:Arial,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #EAE8E2;padding:32px;">
    <h1 style="font-size:20px;font-weight:700;color:#1a1a1a;">Subscription expires in {days_left} days</h1>
    <a href="http://localhost:3000/billing"
       style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">
      Renew subscription
    </a>
  </div>
</body></html>"""
    return send_email(to, subject, html)