"""
Command-line interface for the watermarking algorithm.

Examples:
    python cli.py photo.jpg --text "© R. Adithya" --position auto
    python cli.py photos/*.jpg --logo logo.png --opacity 60 --out output/ --upload
"""

import argparse
import json
import os

import cv2

import s3_storage
from watermark import ANCHORS, apply_watermark, build_watermark, encode_image


def main():
    parser = argparse.ArgumentParser(description="Image Watermark Generation (OpenCV)")
    parser.add_argument("images", nargs="+", help="input image files")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--logo", help="logo watermark image (PNG with transparency works best)")
    source.add_argument("--text", help="text watermark")
    parser.add_argument("--color", default="#ffffff", help="text colour (#rrggbb)")
    parser.add_argument("--position", default="auto", choices=ANCHORS + ["auto"])
    parser.add_argument("--size", type=float, default=20.0, help="watermark width, %% of image width")
    parser.add_argument("--opacity", type=int, default=70, help="0-100")
    parser.add_argument("--padding", type=int, default=20)
    parser.add_argument("--remove-bg", action="store_true", help="remove white logo background")
    parser.add_argument("--threshold", type=int, default=240)
    parser.add_argument("--out", default="output", help="output folder")
    parser.add_argument("--upload", action="store_true", help="upload results to Amazon S3")
    args = parser.parse_args()

    logo = cv2.imread(args.logo, cv2.IMREAD_UNCHANGED) if args.logo else None
    if args.logo and logo is None:
        parser.error(f"cannot read logo: {args.logo}")
    watermark = build_watermark(
        "logo" if args.logo else "text", logo=logo, text=args.text or "",
        text_color=args.color, remove_bg=args.remove_bg, bg_threshold=args.threshold,
    )
    os.makedirs(args.out, exist_ok=True)

    for path in args.images:
        image = cv2.imread(path, cv2.IMREAD_COLOR)
        if image is None:
            print(f"skip {path}: cannot read")
            continue
        result, report = apply_watermark(image, watermark, args.position,
                                         args.size, args.opacity, args.padding)
        ext = os.path.splitext(path)[1].lower()
        data, mime = encode_image(result, "jpeg" if ext in (".jpg", ".jpeg") else "png")
        out_path = os.path.join(args.out, os.path.basename(path))
        with open(out_path, "wb") as f:
            f.write(data)
        print(f"{path} -> {out_path}  {json.dumps(report)}")
        if args.upload:
            print("  uploaded:", s3_storage.upload_image(data, os.path.basename(path), mime)["key"])


if __name__ == "__main__":
    main()
