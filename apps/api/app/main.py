from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from apps.api.app.middleware.limits import RequestLimits
from apps.api.app.config import get_settings
from apps.api.app.privacy import configure_logging
from apps.api.app.routes.api import router
from apps.api.app.services.models import get_model_service

@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging(log_raw_text=get_settings().legalfly_log_raw_text)
    get_model_service().startup()
    yield

def create_app():
    settings=get_settings()
    app=FastAPI(title="The Legal Fly API",description="Computational fly-wiring experiment. Not consciousness or legal advice.",version="0.2.0",lifespan=lifespan)
    app.add_middleware(RequestLimits,per_minute=settings.legalfly_requests_per_minute)
    app.add_middleware(CORSMiddleware,allow_origins=["*"] if settings.cors_allow_all else settings.cors_origin_list or ["http://localhost:3000"],
                       allow_credentials=False,allow_methods=["GET","POST","OPTIONS"],allow_headers=["*"])
    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request,exc: RequestValidationError):
        return JSONResponse(status_code=422,content={"detail":[{"loc":e["loc"],"type":e["type"],"msg":e["msg"]} for e in exc.errors()]})
    app.include_router(router)
    return app
app=create_app()
