"""Baseline schema (identical to the original Prisma 0001_init migration).

Revision ID: 0001
Revises:
"""

from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL = Path(__file__).resolve().parents[1] / "sql" / "0001_init.sql"


def upgrade() -> None:
    op.get_bind().exec_driver_sql(SQL.read_text())


def downgrade() -> None:
    raise NotImplementedError("The baseline cannot be downgraded")
