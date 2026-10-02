import pytest
from fastapi.testclient import TestClient

from app.main import app


def make_client(email: str | None = None, tenant_host: str | None = None, password: str = "demo1234") -> TestClient:
    client = TestClient(app, headers={"x-tenant-host": tenant_host} if tenant_host else None)
    if email:
        res = client.post("/api/auth/login", json={"email": email, "password": password})
        assert res.status_code == 200, res.text
    return client


@pytest.fixture()
def anon():
    return make_client()


@pytest.fixture()
def owner():
    return make_client("owner@skyline.demo")
