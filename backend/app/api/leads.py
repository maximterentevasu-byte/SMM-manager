import uuid
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.models import Lead

log = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class LeadRequest(BaseModel):
    name: str
    email: EmailStr
    phone: str


@router.post("")
@limiter.limit("5/hour")
async def create_lead(request: Request, data: LeadRequest, db: AsyncSession = Depends(get_db)):
    lead = Lead(
        id=uuid.uuid4(),
        name=data.name.strip(),
        email=data.email,
        phone=data.phone.strip(),
    )
    db.add(lead)
    await db.commit()
    log.info(f"[LEAD] New lead saved: {data.email}")
    try:
        from app.services.email_service import send_lead_notification
        send_lead_notification(data.name, data.email, data.phone)
    except Exception as e:
        log.warning(f"[LEAD] Email notification failed: {e}")
    return {"status": "ok"}
