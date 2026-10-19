"""
Watermark Core Logic (OpenCV)

Implements the Image Watermark Generation algorithm:

    Step 1  Decode the host image I (H x W x 3, BGR) and prepare the watermark W
            - logo watermark: decoded as BGRA
            - text watermark: rendered with cv2.putText onto a transparent canvas
    Step 2  (optional) Background removal on the logo:
            alpha(x, y) = 0 where gray(x, y) > T          (T = threshold)
    Step 3  Scale W so that width(W) = width(I) * s / 100, keeping aspect ratio
    Step 4  Choose the position (x, y):
            - fixed anchor (top-left ... bottom-right), or
            - "auto": Smart Placement. Compute the Sobel gradient magnitude
              G = sqrt(Gx^2 + Gy^2) of I, build its integral image S, and for each
              of the 9 candidate anchors score the region R it would cover by
                  score(R) = mean(G over R)      (O(1) per candidate via S)
              The candidate with the lowest score is the flattest / least detailed
              area, so the watermark hides the least image content and stays legible.
    Step 5  Alpha blending on the region of interest:
            a(x, y) = (alpha_W(x, y) / 255) * (opacity / 100)
            O(x, y) = (1 - a) * I(x, y) + a * W(x, y)
    Step 6  Encode O (PNG lossless / JPEG q=98) and optionally upload to Amazon S3.
"""

import base64
from typing import Dict, List, Literal, Optional, Tuple

import cv2
import numpy as np

PositionType = Literal[
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
    "auto",
]

ANCHORS: List[str] = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
]

# Preference order used to break ties in Smart Placement (corners first)
TIE_BREAK = ["bottom-right", "bottom-left", "top-right", "top-left",
             "bottom-center", "top-center", "center-right", "center-left", "center"]


# ---------------------------------------------------------------------------
# Step 1 - decoding / watermark preparation
# ---------------------------------------------------------------------------

def decode_image(data: bytes, keep_alpha: bool = False) -> np.ndarray:
    """Decode raw image bytes into a BGR (or BGRA) numpy array."""
    buffer = np.frombuffer(data, dtype=np.uint8)
    flag = cv2.IMREAD_UNCHANGED if keep_alpha else cv2.IMREAD_COLOR
    image = cv2.imdecode(buffer, flag)
    if image is None:
        raise ValueError("Unsupported or corrupted image")
    return image


def to_bgra(image: np.ndarray) -> np.ndarray:
    """Convert a grayscale / BGR / BGRA image to BGRA."""
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGRA)
    if image.shape[2] == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    return image


def hex_to_bgr(color: str) -> Tuple[int, int, int]:
    """Convert '#rrggbb' to an OpenCV BGR tuple."""
    color = color.lstrip("#")
    if len(color) != 6:
        return (255, 255, 255)
    r, g, b = (int(color[i:i + 2], 16) for i in (0, 2, 4))
    return (b, g, r)


# cv2.putText's Hershey fonts only cover ASCII; map common symbols to ASCII
TEXT_REPLACEMENTS = {"\u00a9": "(c)", "\u00ae": "(R)", "\u2122": "TM",
                     "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'",
                     "\u201c": '"', "\u201d": '"'}


def to_ascii_text(text: str) -> str:
    """Prepare text for cv2.putText; reject characters the Hershey fonts cannot draw."""
    for symbol, replacement in TEXT_REPLACEMENTS.items():
        text = text.replace(symbol, replacement)
    unsupported = sorted({ch for ch in text if not (" " <= ch <= "~")})
    if unsupported:
        raise ValueError("Text watermark supports ASCII characters only; unsupported: "
                         + " ".join(unsupported))
    return text


def render_text_watermark(text: str, color: str = "#ffffff", outline: bool = True) -> np.ndarray:
    """
    Render a text watermark onto a transparent BGRA canvas using cv2.putText.
    The text is drawn large and later scaled (Step 3) like a logo.
    """
    text = to_ascii_text(text.strip()) or "Watermark"
    font = cv2.FONT_HERSHEY_DUPLEX
    scale, thickness = 4.0, 8
    stroke = thickness + 6 if outline else thickness
    (tw, th), baseline = cv2.getTextSize(text, font, scale, stroke)
    margin = stroke
    canvas = np.zeros((th + baseline + 2 * margin, tw + 2 * margin, 4), dtype=np.uint8)
    origin = (margin, margin + th)

    if outline:
        cv2.putText(canvas, text, origin, font, scale, (0, 0, 0, 160), stroke, cv2.LINE_AA)
    b, g, r = hex_to_bgr(color)
    cv2.putText(canvas, text, origin, font, scale, (b, g, r, 255), thickness, cv2.LINE_AA)
    return canvas


# ---------------------------------------------------------------------------
# Step 2 - background removal
# ---------------------------------------------------------------------------

def remove_background(watermark: np.ndarray, threshold: int = 240) -> np.ndarray:
    """Make bright (near white) pixels transparent: alpha = 0 where gray > T."""
    watermark = to_bgra(watermark).copy()
    gray = cv2.cvtColor(watermark[:, :, :3], cv2.COLOR_BGR2GRAY)
    watermark[:, :, 3][gray > threshold] = 0
    return watermark


# ---------------------------------------------------------------------------
# Step 3 - scaling
# ---------------------------------------------------------------------------

def resize_watermark(watermark: np.ndarray, target_width: int) -> np.ndarray:
    """Resize keeping aspect ratio (INTER_AREA to shrink, INTER_CUBIC to enlarge)."""
    h, w = watermark.shape[:2]
    target_width = max(1, int(target_width))
    target_height = max(1, round(target_width * h / w))
    interpolation = cv2.INTER_AREA if target_width < w else cv2.INTER_CUBIC
    return cv2.resize(watermark, (target_width, target_height), interpolation=interpolation)


# ---------------------------------------------------------------------------
# Step 4 - positioning (fixed anchors + Smart Placement)
# ---------------------------------------------------------------------------

def anchor_position(
    image_size: Tuple[int, int],
    watermark_size: Tuple[int, int],
    position: str,
    padding: int
) -> Tuple[int, int]:
    """Return the top-left (x, y) of the watermark for a named anchor."""
    img_w, img_h = image_size
    wm_w, wm_h = watermark_size
    vertical, _, horizontal = position.partition("-")
    if position == "center":
        vertical, horizontal = "center", "center"

    xs = {"left": padding, "center": (img_w - wm_w) // 2, "right": img_w - wm_w - padding}
    ys = {"top": padding, "center": (img_h - wm_h) // 2, "bottom": img_h - wm_h - padding}

    x = xs.get(horizontal, xs["right"])
    y = ys.get(vertical, ys["bottom"])
    # Clamp inside the image
    x = max(0, min(x, img_w - wm_w))
    y = max(0, min(y, img_h - wm_h))
    return x, y


def region_scores(
    image: np.ndarray,
    watermark_size: Tuple[int, int],
    padding: int
) -> Dict[str, float]:
    """
    Smart Placement scoring: mean Sobel gradient magnitude of the region each
    anchor would cover, computed in O(1) per region with an integral image.
    Lower score = smoother area = better place for the watermark.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = cv2.magnitude(gx, gy)
    integral = cv2.integral(magnitude, sdepth=cv2.CV_64F)

    img_h, img_w = gray.shape
    wm_w, wm_h = min(watermark_size[0], img_w), min(watermark_size[1], img_h)
    area = float(wm_w * wm_h)

    scores = {}
    for name in ANCHORS:
        x, y = anchor_position((img_w, img_h), (wm_w, wm_h), name, padding)
        total = (integral[y + wm_h, x + wm_w] - integral[y, x + wm_w]
                 - integral[y + wm_h, x] + integral[y, x])
        scores[name] = round(float(total / area), 3)
    return scores


def choose_position(scores: Dict[str, float]) -> str:
    """Pick the anchor with the lowest score, breaking ties by TIE_BREAK order."""
    return min(TIE_BREAK, key=lambda name: (scores[name], TIE_BREAK.index(name)))


# ---------------------------------------------------------------------------
# Step 5 - alpha blending
# ---------------------------------------------------------------------------

def alpha_blend(image: np.ndarray, watermark: np.ndarray, x: int, y: int, opacity: int) -> np.ndarray:
    """O = (1 - a) * I + a * W on the region of interest, a = alpha_W * opacity."""
    result = image.copy()
    wm_h, wm_w = watermark.shape[:2]
    wm_h = min(wm_h, result.shape[0] - y)
    wm_w = min(wm_w, result.shape[1] - x)
    if wm_h <= 0 or wm_w <= 0:
        return result

    roi = result[y:y + wm_h, x:x + wm_w].astype(np.float32)
    overlay = watermark[:wm_h, :wm_w, :3].astype(np.float32)
    alpha = watermark[:wm_h, :wm_w, 3:4].astype(np.float32) / 255.0
    alpha *= max(0, min(opacity, 100)) / 100.0

    blended = (1.0 - alpha) * roi + alpha * overlay
    result[y:y + wm_h, x:x + wm_w] = np.clip(blended + 0.5, 0, 255).astype(np.uint8)
    return result


# ---------------------------------------------------------------------------
# Full pipeline
# ---------------------------------------------------------------------------

def apply_watermark(
    image: np.ndarray,
    watermark: np.ndarray,
    position: PositionType = "bottom-right",
    size_percent: float = 20.0,
    opacity: int = 100,
    padding: int = 20
) -> Tuple[np.ndarray, Dict]:
    """
    Apply a (BGRA) watermark to a BGR image.

    Returns the watermarked image and a small report describing the decision
    made by the algorithm (chosen position, coordinates and region scores).
    """
    if image.ndim == 3 and image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    watermark = to_bgra(watermark)

    target_width = int(image.shape[1] * size_percent / 100.0)
    scaled = resize_watermark(watermark, target_width)
    # Keep the watermark inside the image
    if scaled.shape[0] > image.shape[0]:
        scaled = resize_watermark(scaled, scaled.shape[1] * image.shape[0] / scaled.shape[0])

    wm_size = (scaled.shape[1], scaled.shape[0])
    img_size = (image.shape[1], image.shape[0])

    scores = None
    chosen = position
    if position == "auto":
        scores = region_scores(image, wm_size, padding)
        chosen = choose_position(scores)

    x, y = anchor_position(img_size, wm_size, chosen, padding)
    result = alpha_blend(image, scaled, x, y, opacity)

    report = {"position": chosen, "x": x, "y": y, "width": wm_size[0], "height": wm_size[1]}
    if scores is not None:
        report["scores"] = scores
    return result, report


def build_watermark(
    watermark_type: str,
    logo: Optional[np.ndarray] = None,
    text: str = "",
    text_color: str = "#ffffff",
    remove_bg: bool = False,
    bg_threshold: int = 240
) -> np.ndarray:
    """Prepare the BGRA watermark for either a logo or a text watermark."""
    if watermark_type == "text":
        return render_text_watermark(text, text_color)
    if logo is None:
        raise ValueError("A logo image is required for a logo watermark")
    logo = to_bgra(logo)
    return remove_background(logo, bg_threshold) if remove_bg else logo


# ---------------------------------------------------------------------------
# Step 6 - encoding helpers
# ---------------------------------------------------------------------------

def encode_image(image: np.ndarray, fmt: str = "png") -> Tuple[bytes, str]:
    """Encode to PNG (lossless) or JPEG (quality 98). Returns (bytes, mime)."""
    fmt = fmt.lower().lstrip(".")
    if fmt in ("jpg", "jpeg"):
        ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 98])
        mime = "image/jpeg"
    else:
        ok, buffer = cv2.imencode(".png", image)
        mime = "image/png"
    if not ok:
        raise ValueError("Could not encode image")
    return buffer.tobytes(), mime


def base64_to_bytes(base64_string: str) -> bytes:
    """Decode base64 (with or without a data URI prefix) to bytes."""
    if "," in base64_string:
        base64_string = base64_string.split(",", 1)[1]
    return base64.b64decode(base64_string)


def bytes_to_data_uri(data: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode('utf-8')}"
