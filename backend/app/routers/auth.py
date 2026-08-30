from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, LoginResponse
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

limiter = Limiter(key_func=get_remote_address)

COOKIE_NAME = "access_token"


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> LoginResponse:
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token(subject=user.email)

    # Em producao, frontend e backend ficam em subdominios diferentes de
    # onrender.com - que esta na Public Suffix List, entao o navegador trata
    # isso como cross-site "de verdade". SameSite=Lax bloqueia o cookie em
    # chamadas fetch/XHR cross-site (so libera em navegacao top-level), por
    # isso o login "nao pegava": o POST /auth/login ate funcionava, mas o
    # cookie nunca era reenviado nas chamadas seguintes. SameSite=None (que
    # exige Secure=True, ja garantido por is_production) resolve isso; em dev
    # local (mesma origem, http) mantemos Lax, que e mais restritivo/seguro e
    # nao tem esse problema por nao ser cross-site.
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="none" if settings.is_production else "lax",
        secure=settings.is_production,
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )

    return LoginResponse(email=user.email)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> Response:
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        samesite="none" if settings.is_production else "lax",
        secure=settings.is_production,
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
