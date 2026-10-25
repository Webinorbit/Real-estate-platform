"""Property.roomLayout: the agency's real floor plan for the 3D designer (null = generate an indicative one).

Revision ID: 0002
Revises: 0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("Property", sa.Column("roomLayout", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("Property", "roomLayout")
