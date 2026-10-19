"""
FastAPI Backend for Image Watermark Generation
Python + OpenCV implementation of the watermarking algorithm, with Amazon S3 upload.
"""

import os
from typing import List, Literal, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import s3_storage
from watermark import (
    PositionType,
    apply_watermark,
    base64_to_bytes,
    build_watermark,
    bytes_to_data_uri,
    decode_image,
    encode_image,
)

app = FastAPI(title="Image Watermark Generation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class WatermarkSettings(BaseModel):
    watermark_type: Literal["logo", "text"] = "logo"
    text: str = "© Watermark"
    text_color: str = "#ffffff"
    position: PositionType = "bottom-right"
    size_percent: float = 20.0
    opacity: int = 100
    padding: int = 20
    remove_bg: bool = False
    bg_threshold: int = 240


class PreviewRequest(BaseModel):
    image: str  # Base64 encoded image
    watermark: Optional[str] = None  # Base64 encoded logo (not needed for text)
    settings: WatermarkSettings


class ImageItem(BaseModel):
    name: str
    data: str  # Base64 encoded image


class ApplyRequest(BaseModel):
    images: List[ImageItem]
    watermark: Optional[str] = None
    settings: WatermarkSettings
    upload_to_s3: bool = False


def prepare_watermark(settings: WatermarkSettings, logo_b64: Optional[str]):
    logo = decode_image(base64_to_bytes(logo_b64), keep_alpha=True) if logo_b64 else None
    return build_watermark(
        settings.watermark_type,
        logo=logo,
        text=settings.text,
        text_color=settings.text_color,
        remove_bg=settings.remove_bg,
        bg_threshold=settings.bg_threshold,
    )


def run(image_b64: str, watermark, settings: WatermarkSettings):
    image = decode_image(base64_to_bytes(image_b64))
    return apply_watermark(
        image,
        watermark,
        position=settings.position,
        size_percent=settings.size_percent,
        opacity=settings.opacity,
        padding=settings.padding,
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "engine": "opencv", "s3": s3_storage.is_configured()}


@app.post("/preview")
async def generate_preview(request: PreviewRequest):
    """Return a PNG preview plus the algorithm's placement report."""
    try:
        watermark = prepare_watermark(request.settings, request.watermark)
        result, report = run(request.image, watermark, request.settings)
        data, mime = encode_image(result, "png")
        return {"preview": bytes_to_data_uri(data, mime), "report": report}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/apply")
async def apply_watermark_bulk(request: ApplyRequest):
    """Watermark every image and optionally upload the results to Amazon S3."""
    if request.upload_to_s3 and not s3_storage.is_configured():
        raise HTTPException(status_code=400, detail="S3_BUCKET is not configured")
    try:
        watermark = prepare_watermark(request.settings, request.watermark)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    results = []
    for item in request.images:
        try:
            result, report = run(item.data, watermark, request.settings)
            ext = os.path.splitext(item.name)[1].lower()
            data, mime = encode_image(result, "jpeg" if ext in (".jpg", ".jpeg") else "png")
            entry = {"name": item.name, "ok": True, "report": report,
                     "data": bytes_to_data_uri(data, mime)}

            if request.upload_to_s3:
                entry["s3"] = s3_storage.upload_image(data, item.name, mime)
            results.append(entry)
        except Exception as e:
            results.append({"name": item.name, "ok": False, "error": str(e)})

    processed = sum(1 for r in results if r["ok"])
    return {"processed": processed, "failed": len(results) - processed, "results": results}


def main():
    port = int(os.environ.get("WATERMARK_API_PORT", 8765))
    host = os.environ.get("WATERMARK_API_HOST", "127.0.0.1")
    print(f"Starting Watermark API on {host}:{port}...")
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
