"""
Description: Portfolio API endpoints.
File Path: excelerate_api/api/portfolio.py
"""

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class Portfolio(BaseModel):
    """Portfolio model."""

    id: str
    name: str


@router.get("/", response_model=List[Portfolio])
async def get_portfolios():
    """Get all available portfolios."""
    return [
        Portfolio(id="alder", name="Alder"),
        Portfolio(id="white_rabbit", name="White Rabbit"),
    ]


@router.get("/{portfolio_id}", response_model=Portfolio)
async def get_portfolio(portfolio_id: str):
    """Get portfolio by ID."""
    portfolios = {
        "alder": Portfolio(id="alder", name="Alder"),
        "white_rabbit": Portfolio(id="white_rabbit", name="White Rabbit"),
    }

    if portfolio_id not in portfolios:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    return portfolios[portfolio_id]
