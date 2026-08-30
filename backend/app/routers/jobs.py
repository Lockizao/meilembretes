from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.schemas import JobRunResult
from app.services.reminders import run_daily_job

router = APIRouter(prefix="/jobs", tags=["jobs"])
settings = get_settings()


@router.post("/run-daily", response_model=JobRunResult)
async def run_daily(
    x_job_token: str | None = Header(default=None, alias="X-Job-Token"),
    db: AsyncSession = Depends(get_db),
) -> JobRunResult:
    if x_job_token != settings.job_secret_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Token inválido")

    result = await run_daily_job(db)
    return JobRunResult(**result)
