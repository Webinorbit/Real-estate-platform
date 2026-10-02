import pytest
from sqlalchemy import delete, func, select, update

from app.db import SessionLocal, bind_tenant
from app.models import Broker, Lead, Property, Tenant


@pytest.fixture()
def db():
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


def tenant_ids(db):
    return {t.slug: t.id for t in db.scalars(select(Tenant)).all()}


def test_unbound_session_sees_every_tenant(db):
    assert len(set(db.scalars(select(Property.tenantId)).all())) >= 2


def test_selects_are_scoped(db):
    ids = tenant_ids(db)
    bind_tenant(db, ids["skyline"])
    assert set(db.scalars(select(Property.tenantId)).all()) == {ids["skyline"]}


def test_aggregates_and_group_by_are_scoped(db):
    ids = tenant_ids(db)
    total_all = db.scalar(select(func.count(Property.id)))
    bind_tenant(db, ids["heritage"])
    mine = db.scalar(select(func.count(Property.id)))
    assert 0 < mine < total_all
    rows = db.execute(select(Lead.brokerId, func.count(Lead.id)).group_by(Lead.brokerId)).all()
    brokers = {b.id for b in db.scalars(select(Broker)).all()}
    assert all(bid is None or bid in brokers for bid, _ in rows)


def test_lookup_by_foreign_id_returns_nothing(db):
    ids = tenant_ids(db)
    foreign = db.scalar(select(Property.id).where(Property.tenantId == ids["urbannest"]).limit(1))
    bind_tenant(db, ids["skyline"])
    assert db.get(Property, foreign) is None
    assert db.scalars(select(Property).where(Property.id == foreign)).first() is None


def test_bulk_update_and_delete_cannot_touch_other_tenants(db):
    ids = tenant_ids(db)
    foreign = db.scalar(select(Property.id).where(Property.tenantId == ids["urbannest"]).limit(1))
    bind_tenant(db, ids["skyline"])
    assert db.execute(update(Property).where(Property.id == foreign).values(views=999999)).rowcount == 0
    assert db.execute(delete(Property).where(Property.id == foreign)).rowcount == 0
    db.rollback()


def test_new_rows_are_stamped_and_cross_tenant_writes_blocked(db):
    ids = tenant_ids(db)
    bind_tenant(db, ids["skyline"])
    b = Broker(name="x", email="x@x.test", capacity=1, weight=1)
    db.add(b)
    db.flush()
    assert b.tenantId == ids["skyline"]
    db.rollback()

    bad = Broker(tenantId=ids["heritage"], name="y", email="y@y.test", capacity=1, weight=1)
    db.add(bad)
    with pytest.raises(PermissionError):
        db.flush()
    db.rollback()
