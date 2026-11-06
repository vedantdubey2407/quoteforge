from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.documents import router as documents_router
from app.api.costing import router as costing_router
from app.api.routing import router as routing_router
from app.api.historical import router as historical_router

app = FastAPI(
    title="QuoteForge API",
    description="Manufacturing RFQ and quotation costing platform",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://quoteforge-beta.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Welcome to QuoteForge API"}


@app.get("/health")
def health():
    return {"status": "healthy"}


app.include_router(costing_router)
app.include_router(documents_router)
app.include_router(routing_router)
app.include_router(historical_router)
