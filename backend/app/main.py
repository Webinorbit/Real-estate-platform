import importlib
import logging
import pkgutil
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import routers
from app.errors import UserError
from app.routing.worker import start_sla_worker, stop_sla_worker

log = logging.getLogger("app")


class ApiGZipMiddleware:
    """Compresses JSON from /api/*; /uploads/* are already-compressed images and are passed through untouched."""

    def __init__(self, app):
        self.app = app
        self.gzip = GZipMiddleware(app, minimum_size=1024)

    async def __call__(self, scope, receive, send):
        use_gzip = scope["type"] == "http" and scope["path"].startswith("/api/")
        await (self.gzip if use_gzip else self.app)(scope, receive, send)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_sla_worker()
    yield
    stop_sla_worker()


def create_app() -> FastAPI:
    app = FastAPI(title="WebInOrbit Real Estate API", version="1.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)

    @app.exception_handler(UserError)
    async def user_error(_req: Request, exc: UserError):
        return JSONResponse({"error": exc.message, **exc.extra}, status_code=exc.status)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_req: Request, exc: StarletteHTTPException):
        return JSONResponse({"error": exc.detail if isinstance(exc.detail, str) else "Request failed"}, status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_req: Request, exc: RequestValidationError):
        fields = {}
        for issue in exc.errors():
            loc = [str(p) for p in issue["loc"] if p not in ("body", "query", "path")]
            fields[loc[0] if loc else "form"] = issue["msg"]
        first = next(iter(fields.values()), "Invalid request")
        return JSONResponse({"error": first, "fields": fields}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(_req: Request, exc: Exception):
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse({"error": "Something went wrong"}, status_code=500)

    app.add_middleware(ApiGZipMiddleware)

    for mod in pkgutil.iter_modules(routers.__path__):
        app.include_router(importlib.import_module(f"app.routers.{mod.name}").router)

    @app.get("/api/health")
    def health():
        return {"ok": True}

    return app


app = create_app()
