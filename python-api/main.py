"""Main entry point for the Excelerate API."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from excelerate_api.api.portfolio import router as portfolio_router

# Create FastAPI app
app = FastAPI(
    title="Excelerate API",
    description="API for Excelerate Desktop application",
    version="0.1.0",
)

# Allow requests from Tauri app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["tauri://localhost", "http://localhost:1420"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(portfolio_router, prefix="/api/portfolio", tags=["Portfolio"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "message": "API is running"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
