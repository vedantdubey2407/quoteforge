from fastapi import FastAPI

from app.api.costing import router as costing_router

app = FastAPI(
    title="QuoteForge API",
    description="Manufacturing RFQ and quotation costing platform",
    version="1.0.0",
)


@app.get("/")
def root():
    return {"message": "Welcome to QuoteForge API"}


@app.get("/health")
def health():
    return {"status": "healthy"}


app.include_router(costing_router)
