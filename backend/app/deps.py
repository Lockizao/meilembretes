from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import jwt

from app.database import get_db
from app.models import User
from app.security import decode_access_token


async def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não autenticado",
    )
    if not access_token:
        raise credentials_exception

    try:
        payload = decode_access_token(access_token)
    except jwt.PyJWTError:
        raise credentials_exception

    email = payload.get("sub")
    if not email:
        raise credentials_exception

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception

    return user
