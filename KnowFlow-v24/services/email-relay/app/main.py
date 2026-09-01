import html
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field


app = FastAPI(title="KnowFlow SMTP Relay", docs_url=None, redoc_url=None)


class SmtpConfig(BaseModel):
    host: str = Field(min_length=3, max_length=253)
    port: int = Field(ge=1, le=65535)
    username: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=6, max_length=500)
    use_ssl: bool = True
    use_starttls: bool = False


class MailMessage(BaseModel):
    from_email: EmailStr
    from_name: str = Field(min_length=1, max_length=80)
    to: EmailStr
    subject: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=1, max_length=100_000)
    html: str = Field(default="", max_length=200_000)


class RelayRequest(BaseModel):
    smtp: SmtpConfig
    message: MailMessage


def require_token(authorization: str | None) -> None:
    expected = os.environ.get("MAIL_RELAY_TOKEN", "")
    supplied = authorization.removeprefix("Bearer ") if authorization else ""
    if not expected or supplied != expected:
        raise HTTPException(status_code=401, detail="relay authorization failed")


def validate_host(host: str) -> None:
    allowed = {value.strip().lower() for value in os.environ.get("SMTP_ALLOWED_HOSTS", "smtp.qq.com").split(",") if value.strip()}
    if host.lower() not in allowed:
        raise HTTPException(status_code=400, detail="smtp host is not allowed")


@app.get("/health")
def health():
    return {"ok": True, "service": "knowflow-email-relay"}


@app.post("/send")
def send(payload: RelayRequest, authorization: str | None = Header(default=None)):
    require_token(authorization)
    validate_host(payload.smtp.host)
    if payload.smtp.use_ssl and payload.smtp.use_starttls:
        raise HTTPException(status_code=400, detail="SSL and STARTTLS cannot both be enabled")

    message = EmailMessage()
    message["From"] = formataddr((payload.message.from_name, str(payload.message.from_email)))
    message["To"] = str(payload.message.to)
    message["Subject"] = payload.message.subject
    message.set_content(payload.message.text)
    if payload.message.html:
        message.add_alternative(payload.message.html, subtype="html")

    context = ssl.create_default_context()
    try:
        if payload.smtp.use_ssl:
            with smtplib.SMTP_SSL(payload.smtp.host, payload.smtp.port, timeout=25, context=context) as client:
                client.login(payload.smtp.username, payload.smtp.password)
                client.send_message(message)
        else:
            with smtplib.SMTP(payload.smtp.host, payload.smtp.port, timeout=25) as client:
                client.ehlo()
                if payload.smtp.use_starttls:
                    client.starttls(context=context)
                    client.ehlo()
                client.login(payload.smtp.username, payload.smtp.password)
                client.send_message(message)
    except (smtplib.SMTPException, OSError) as error:
        raise HTTPException(status_code=502, detail=f"smtp delivery failed: {html.escape(str(error))[:240]}") from error
    return {"ok": True}
