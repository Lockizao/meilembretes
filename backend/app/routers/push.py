from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_current_user
from app.models import PushSubscription, User
from app.schemas import PushSubscribeRequest, PushUnsubscribeRequest, VapidPublicKeyOut

router = APIRouter(prefix="/push", tags=["push"])
settings = get_settings()


@router.get("/vapid-public-key", response_model=VapidPublicKeyOut)
async def get_vapid_public_key() -> VapidPublicKeyOut:
    return VapidPublicKeyOut(public_key=settings.vapid_public_key)


@router.post("/subscribe")
async def subscribe(
    body: PushSubscribeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    result = await db.execute(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    existing = result.scalar_one_or_none()

    if existing is not None:
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
        existing.user_id = user.id
        existing.last_used_at = datetime.now(timezone.utc)
    else:
        subscription = PushSubscription(
            user_id=user.id,
            endpoint=body.endpoint,
            p256dh=body.keys.p256dh,
            auth=body.keys.auth,
        )
        db.add(subscription)

    await db.commit()
    return {"ok": True}


@router.delete("/subscribe", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    body: PushUnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    result = await db.execute(
        select(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == user.id,
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription is not None:
        await db.delete(subscription)
        await db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
