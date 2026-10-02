"""Runtime configuration. Everything comes from environment variables (a repo-root .env is loaded for local development)."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")


def env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


def is_production() -> bool:
    return (env("APP_ENV") or env("NODE_ENV") or "development") == "production"


def database_url() -> str:
    raw = env("DATABASE_URL", "postgresql://postgres@127.0.0.1:5433/realestate")
    # Prisma-style URLs may carry "?schema=public"; the SQLAlchemy driver URL differs only in the scheme.
    raw = raw.split("?schema=")[0]
    if raw.startswith("postgres://"):
        raw = "postgresql://" + raw[len("postgres://"):]
    if raw.startswith("postgresql://"):
        raw = "postgresql+psycopg://" + raw[len("postgresql://"):]
    return raw


def auth_secret() -> str:
    secret = env("AUTH_SECRET")
    if not secret or len(secret) < 16:
        raise RuntimeError("AUTH_SECRET must be set (16+ chars)")
    return secret


def tenant_switch_allowed() -> bool:
    return not is_production() or env("ALLOW_TENANT_SWITCH") == "true"


def upload_root() -> Path:
    path = Path(env("UPLOAD_DIR", "./storage/uploads"))
    return (path if path.is_absolute() else ROOT / path).resolve()


ROOT_DOMAIN = lambda: (env("ROOT_DOMAIN", "localhost") or "localhost").lower()  # noqa: E731
