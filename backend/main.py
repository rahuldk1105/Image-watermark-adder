"""
FastAPI Backend for Bulk Image Watermarker
Provides REST API endpoints for preview and bulk watermarking
"""

import os
import sys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Literal, Optional
import uvicorn

from watermark import (
    apply_watermark,
    image_to_base64,
    base64_to_image,
    remove_background,
    PositionType
)
from PIL import Image

app = FastAPI(title="Bulk Image Watermarker API")

# Enable CORS for Electron renderer
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WatermarkSettings(BaseModel):
    position: PositionType = "bottom-right"
    size_percent: float = 20.0
    opacity: int = 100
    padding: int = 20
    remove_bg: bool = False
    bg_threshold: int = 240


class PreviewRequest(BaseModel):
    image: str  # Base64 encoded image
    watermark: str  # Base64 encoded watermark
    settings: WatermarkSettings


class PreviewResponse(BaseModel):
    preview: str  # Base64 encoded preview image


class ApplyRequest(BaseModel):
    images: List[dict]  # List of {path, data} or just paths
    watermark: str  # Base64 encoded watermark
    settings: WatermarkSettings
    output_dir: str


class ApplyResponse(BaseModel):
    success: bool
    processed: int
    failed: int
    message: str


class RemoveBgRequest(BaseModel):
    image: str  # Base64 encoded image
    threshold: int = 240


class RemoveBgResponse(BaseModel):
    image: str  # Base64 encoded image with background removed


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "message": "Watermark API is running"}


@app.post("/remove-background", response_model=RemoveBgResponse)
async def remove_background_endpoint(request: RemoveBgRequest):
    """
    Remove background from an image.
    """
    try:
        # Decode image
        image = base64_to_image(request.image)
        
        # Remove background
        result = remove_background(image, request.threshold)
        
        # Convert to base64
        result_base64 = image_to_base64(result, "PNG")
        
        return RemoveBgResponse(image=result_base64)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/preview", response_model=PreviewResponse)
async def generate_preview(request: PreviewRequest):
    """
    Generate a preview of the watermarked image.
    Returns base64 encoded preview image.
    """
    try:
        # Decode images from base64
        image = base64_to_image(request.image)
        watermark = base64_to_image(request.watermark)
        
        # Remove background from watermark if requested
        if request.settings.remove_bg:
            watermark = remove_background(watermark, request.settings.bg_threshold)
        
        # Apply watermark
        result = apply_watermark(
            image=image,
            watermark=watermark,
            position=request.settings.position,
            size_percent=request.settings.size_percent,
            opacity=request.settings.opacity,
            padding=request.settings.padding
        )
        
        # Convert to base64
        preview_base64 = image_to_base64(result, "PNG")
        
        return PreviewResponse(preview=preview_base64)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/apply", response_model=ApplyResponse)
async def apply_watermark_bulk(request: ApplyRequest):
    """
    Apply watermark to all provided images and save to output directory.
    """
    try:
        # Ensure output directory exists
        os.makedirs(request.output_dir, exist_ok=True)
        
        # Decode watermark
        watermark = base64_to_image(request.watermark)
        
        # Remove background from watermark if requested
        if request.settings.remove_bg:
            watermark = remove_background(watermark, request.settings.bg_threshold)
        
        processed = 0
        failed = 0
        
        for img_data in request.images:
            try:
                # Get image path and data
                file_path = img_data.get("path", "")
                image_base64 = img_data.get("data", "")
                
                if not image_base64:
                    failed += 1
                    continue
                
                # Decode image
                image = base64_to_image(image_base64)
                original_mode = image.mode
                
                # Apply watermark
                result = apply_watermark(
                    image=image,
                    watermark=watermark,
                    position=request.settings.position,
                    size_percent=request.settings.size_percent,
                    opacity=request.settings.opacity,
                    padding=request.settings.padding
                )
                
                # Get original filename
                filename = os.path.basename(file_path) if file_path else f"image_{processed + 1}.png"
                output_path = os.path.join(request.output_dir, filename)
                
                # Determine format from extension
                ext = os.path.splitext(filename)[1].lower()
                
                if ext in ['.jpg', '.jpeg']:
                    # Convert to RGB for JPEG
                    if result.mode == 'RGBA':
                        background = Image.new('RGB', result.size, (255, 255, 255))
                        background.paste(result, mask=result.split()[3])
                        result = background
                    result.save(output_path, 'JPEG', quality=98)
                else:
                    # Save as PNG (lossless)
                    result.save(output_path, 'PNG')
                
                processed += 1
                
            except Exception as e:
                print(f"Error processing image: {e}")
                failed += 1
        
        return ApplyResponse(
            success=True,
            processed=processed,
            failed=failed,
            message=f"Successfully processed {processed} images. {failed} failed."
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def main():
    """Run the FastAPI server"""
    # Get port from environment or use default
    port = int(os.environ.get("WATERMARK_API_PORT", 8765))
    
    print(f"Starting Watermark API on port {port}...")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="warning"
    )


if __name__ == "__main__":
    main()
