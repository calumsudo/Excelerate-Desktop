# excelerate_api/api/file_processing.py
"""
Description: File processing API endpoints.
File Path: excelerate_api/api/file_processing.py
"""

import os
import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()


class ProcessingResult(BaseModel):
    """File processing result model."""

    success: bool
    funder: Optional[str] = None
    totals: Optional[Dict[str, float]] = None
    error: Optional[str] = None


@router.post("/upload", response_model=ProcessingResult)
async def process_uploaded_file(
    file: UploadFile = File(...),
    portfolio_id: str = Form(...),
    manual_funder: Optional[str] = Form(None),
):
    """
    Process an uploaded file for a specific portfolio.

    Args:
        file: The uploaded file
        portfolio_id: Portfolio ID (alder or white_rabbit)
        manual_funder: Optional funder name to skip classification
    """
    try:
        # Validate portfolio
        if portfolio_id not in ["alder", "white_rabbit"]:
            raise HTTPException(status_code=400, detail="Invalid portfolio ID")

        # Save uploaded file to temp location
        with NamedTemporaryFile(
            delete=False, suffix=Path(file.filename).suffix
        ) as temp_file:
            shutil.copyfileobj(file.file, temp_file)
            temp_path = Path(temp_file.name)

        # TODO: Implement actual file processing using the parsers
        # For now, return a mock result
        if manual_funder:
            funder = manual_funder
        else:
            # Mock classification - in the real implementation this would use the classifier
            funder = "ClearView" if "clear" in file.filename.lower() else "EFIN"

        # Return mock processing result
        return ProcessingResult(
            success=True,
            funder=funder,
            totals={"gross": 10000.0, "net": 9000.0, "fee": 1000.0},
        )

    except Exception as e:
        return ProcessingResult(success=False, error=str(e))
    finally:
        # Clean up temp file
        file.file.close()
        if "temp_path" in locals():
            os.unlink(temp_path)


class FunderInfo(BaseModel):
    """Funder information model."""

    id: str
    name: str
    supports_multi_file: bool = False


@router.get("/funders/{portfolio_id}", response_model=List[FunderInfo])
async def get_portfolio_funders(portfolio_id: str):
    """Get available funders for a portfolio."""
    # Validate portfolio
    if portfolio_id not in ["alder", "white_rabbit"]:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    # Shared funders
    shared_funders = [
        FunderInfo(id="ACS", name="ACS"),
        FunderInfo(id="BHB", name="BHB"),
        FunderInfo(id="Boom", name="Boom"),
        FunderInfo(id="Kings", name="Kings"),
        FunderInfo(id="EFIN", name="EFIN"),
        FunderInfo(id="ClearView", name="ClearView", supports_multi_file=True),
        FunderInfo(id="BIG", name="BIG"),
    ]

    # Alder-specific funders
    if portfolio_id == "alder":
        return shared_funders + [FunderInfo(id="Vesper", name="Vesper")]

    # White Rabbit has only shared funders
    return shared_funders
