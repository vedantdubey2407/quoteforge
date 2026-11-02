from fastapi import FastAPI

app = FastAPI(
    title="QuoteForge API",
    description="AI-powered RFQ and Manufacturing Cost Estimation Platform",
    version="1.0.0",
)


@app.get("/")
def home():
    return {"message": "Welcome to QuoteForge API", "status": "running"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
