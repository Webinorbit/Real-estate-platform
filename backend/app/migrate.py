"""Schema migrations. Databases created by the earlier Prisma setup already contain the baseline schema, so they are stamped, not re-created."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.config import database_url

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return cfg


def run() -> None:
    cfg = _config()
    engine = create_engine(database_url())
    try:
        tables = set(inspect(engine).get_table_names())
    finally:
        engine.dispose()

    if "Tenant" in tables and "alembic_version" not in tables:
        command.stamp(cfg, "0001")
    command.upgrade(cfg, "head")
