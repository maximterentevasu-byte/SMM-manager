from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.database import engine, Base
from app.api import auth, businesses, onboarding, content, platforms, subscriptions


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="SMM Platform API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/auth",          tags=["auth"])
app.include_router(businesses.router,    prefix="/api/businesses",    tags=["businesses"])
app.include_router(onboarding.router,    prefix="/api/onboarding",    tags=["onboarding"])
app.include_router(content.router,       prefix="/api/content",       tags=["content"])
app.include_router(platforms.router,     prefix="/api/platforms",     tags=["platforms"])
app.include_router(subscriptions.router, prefix="/api/subscriptions", tags=["subscriptions"])


@app.get("/")
async def root():
    return {"message": "SMM Platform API работает ✓", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}