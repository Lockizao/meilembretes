"""fix postgres enum values (cancelado, dasn_simei)

Os valores CANCELADO (em StatusObrigacao) e DASN_SIMEI (em TipoObrigacao)
foram adicionados nos models depois da migration inicial, mas como o
desenvolvimento roda contra SQLite (onde Enum vira TEXT livre, sem
validacao), isso nunca gerou uma migration de verdade - e passou despercebido
ate rodar contra Postgres real, onde Enum e um tipo nativo que precisa de
ALTER TYPE explicito pra ganhar valores novos.

Revision ID: a1b2c3d4e5f6
Revises: 7618d98adc77
Create Date: 2026-08-30 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '7618d98adc77'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite nao tem enum nativo (o Enum do SQLAlchemy vira so uma coluna
        # TEXT), entao nao ha nada pra alterar - o valor novo ja "existe"
        # simplesmente por nao haver validacao de tipo nenhuma.
        return

    # IF NOT EXISTS deixa isso seguro de rodar de novo (ex: se essa migration
    # for aplicada em um banco que por algum motivo ja tenha um dos valores).
    op.execute("ALTER TYPE statusobrigacao ADD VALUE IF NOT EXISTS 'CANCELADO'")
    op.execute("ALTER TYPE tipoobrigacao ADD VALUE IF NOT EXISTS 'DASN_SIMEI'")


def downgrade() -> None:
    """Downgrade schema."""
    # Postgres nao suporta remover valor de enum sem recriar o tipo do zero
    # (e recriar exigiria migrar todas as linhas que já usam esses valores) -
    # downgrade nao é suportado por esse motivo.
    raise NotImplementedError(
        "Remover valor de enum no Postgres exige recriar o tipo - downgrade nao suportado."
    )
