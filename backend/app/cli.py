"""CLI utilitario do backend.

Uso:
    python -m app.cli create-admin --email voce@exemplo.com --password senha-forte
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import User
from app.security import hash_password


async def _create_admin(email: str, password: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(email=email, hashed_password=hash_password(password))
            db.add(user)
            print(f"Usuário criado: {email}")
        else:
            user.hashed_password = hash_password(password)
            print(f"Senha atualizada para usuário existente: {email}")

        await db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create_admin_parser = subparsers.add_parser("create-admin", help="Cria ou atualiza o usuário administrador")
    create_admin_parser.add_argument("--email", required=True)
    create_admin_parser.add_argument("--password", required=True)

    args = parser.parse_args()

    if args.command == "create-admin":
        asyncio.run(_create_admin(args.email, args.password))


if __name__ == "__main__":
    main()
