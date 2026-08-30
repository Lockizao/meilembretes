"""Atalho para `python -m app.cli create-admin`.

Uso:
    python scripts/create_admin.py --email voce@exemplo.com --password senha-forte
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.cli import main  # noqa: E402

if __name__ == "__main__":
    main()
