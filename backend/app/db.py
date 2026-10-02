"""Engine, sessions and tenant isolation.

A session can be bound to a tenant (`bind_tenant`). From then on every SELECT/UPDATE/DELETE touching a tenant-owned
model is filtered by `tenantId`, and every new row is stamped with it: one tenant can never read or write
another tenant's data, even if a query forgets its own filter. This is the Python equivalent of the Prisma
`scoped()` extension the app used before.
"""

from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker, with_loader_criteria

from app.config import database_url
from app.models import Base, TenantOwned

engine = create_engine(database_url(), pool_pre_ping=True, pool_size=10, max_overflow=10, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


def bind_tenant(session: Session, tenant_id: str) -> Session:
    if not tenant_id:
        raise ValueError("bind_tenant(): tenant_id is required")
    session.info["tenant_id"] = tenant_id
    return session


def _tenant_models() -> list[type]:
    global _TENANT_MODELS
    if not _TENANT_MODELS:
        _TENANT_MODELS = [m.class_ for m in Base.registry.mappers if issubclass(m.class_, TenantOwned)]
    return _TENANT_MODELS


_TENANT_MODELS: list[type] = []


@event.listens_for(Session, "do_orm_execute")
def _scope_queries(state):
    tenant_id = state.session.info.get("tenant_id")
    if not tenant_id:
        return
    if state.is_select or state.is_update or state.is_delete:
        state.statement = state.statement.options(
            *(with_loader_criteria(cls, cls.tenantId == tenant_id, include_aliases=True) for cls in _tenant_models())
        )


@event.listens_for(Session, "before_flush")
def _stamp_tenant(session, flush_context, instances):
    tenant_id = session.info.get("tenant_id")
    if not tenant_id:
        return
    for obj in list(session.new):
        if isinstance(obj, TenantOwned):
            if getattr(obj, "tenantId", None) in (None, ""):
                obj.tenantId = tenant_id
            elif obj.tenantId != tenant_id:
                raise PermissionError("Cross-tenant write blocked")


def get_db() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
