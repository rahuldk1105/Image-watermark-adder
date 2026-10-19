"""
Amazon S3 storage for watermarked images.

Configuration (environment variables):
    AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   credentials (or any boto3 credential source)
    AWS_REGION                                   e.g. ap-south-1
    S3_BUCKET                                    target bucket name
    S3_PREFIX                                    optional key prefix (default "watermarked/")
"""

import os
import uuid
from datetime import datetime, timezone
from typing import Optional


def is_configured() -> bool:
    return bool(os.environ.get("S3_BUCKET"))


def _client():
    import boto3  # imported lazily so the API runs without boto3 when S3 is unused
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION"))


def upload_image(data: bytes, filename: str, content_type: str) -> dict:
    """Upload bytes to S3 and return the object key plus a 1-hour presigned URL."""
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        raise RuntimeError("S3_BUCKET is not set")

    prefix = os.environ.get("S3_PREFIX", "watermarked/")
    stamp = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    key = f"{prefix}{stamp}/{uuid.uuid4().hex[:8]}-{os.path.basename(filename)}"

    client = _client()
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    url = client.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=3600
    )
    return {"bucket": bucket, "key": key, "url": url}
