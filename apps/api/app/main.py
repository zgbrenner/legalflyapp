from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from apps.api.app.config import get_settings
from apps.api.app.privacy import configure_logging
from apps.api.app.routes.api import router
from apps.api.app.services.models import get_model_service


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    configure_logging(log_raw_text=settings.legalfly_log_raw_text)
    get_model_service().startup()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="LegalFly API",
        description=(
            "Computational reservoir experiment using Drosophila-inspired connectivity "
            "for sensitive-information detection. Not consciousness. Not legal advice."
        ),
        version="0.1.0",
        lifespan=lifespan,
    )
    if settings.cors_allow_all:
        allow_origins = ["*"]
    else:
        allow_origins = settings.cors_origin_list or ["http://localhost:3000"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )
    app.include_router(router)
    return app


app = create_app()