"""
Watermark Core Logic
Applies watermarks to images using Pillow (PIL)
"""

from PIL import Image
import io
import base64
from typing import Tuple, Literal

PositionType = Literal["top-left", "top-right", "bottom-left", "bottom-right", "center"]


def remove_background(image: Image.Image, threshold: int = 240) -> Image.Image:
    """
    Remove white/light background from an image by making it transparent.
    
    Args:
        image: PIL Image
        threshold: Brightness threshold (0-255). Pixels brighter than this become transparent.
        
    Returns:
        PIL Image with transparent background
    """
    # Convert to RGBA
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    
    # Get pixel data
    data = image.getdata()
    new_data = []
    
    for pixel in data:
        r, g, b, a = pixel
        # Calculate brightness
        brightness = (r + g + b) / 3
        
        # If pixel is very bright (close to white), make it transparent
        if brightness > threshold:
            new_data.append((r, g, b, 0))
        else:
            new_data.append(pixel)
    
    # Create new image with modified data
    result = Image.new('RGBA', image.size)
    result.putdata(new_data)
    
    return result


def calculate_position(
    image_size: Tuple[int, int],
    watermark_size: Tuple[int, int],
    position: PositionType,
    padding: int
) -> Tuple[int, int]:
    """
    Calculate the x, y position for the watermark based on position type.
    
    Args:
        image_size: (width, height) of the base image
        watermark_size: (width, height) of the watermark
        position: Position type string
        padding: Padding in pixels from edges
        
    Returns:
        (x, y) coordinates for watermark placement
    """
    img_width, img_height = image_size
    wm_width, wm_height = watermark_size
    
    positions = {
        "top-left": (padding, padding),
        "top-right": (img_width - wm_width - padding, padding),
        "bottom-left": (padding, img_height - wm_height - padding),
        "bottom-right": (img_width - wm_width - padding, img_height - wm_height - padding),
        "center": ((img_width - wm_width) // 2, (img_height - wm_height) // 2)
    }
    
    return positions.get(position, positions["bottom-right"])


def resize_watermark(
    watermark: Image.Image,
    target_width: int
) -> Image.Image:
    """
    Resize watermark maintaining aspect ratio.
    
    Args:
        watermark: PIL Image of the watermark
        target_width: Target width in pixels
        
    Returns:
        Resized PIL Image
    """
    if watermark.width == 0:
        return watermark
        
    aspect_ratio = watermark.height / watermark.width
    target_height = int(target_width * aspect_ratio)
    
    return watermark.resize(
        (target_width, target_height),
        Image.Resampling.LANCZOS
    )


def apply_opacity(watermark: Image.Image, opacity: int) -> Image.Image:
    """
    Apply opacity to watermark using alpha channel.
    
    Args:
        watermark: PIL Image (RGBA)
        opacity: Opacity value 0-100
        
    Returns:
        PIL Image with adjusted opacity
    """
    if watermark.mode != 'RGBA':
        watermark = watermark.convert('RGBA')
    
    # Split into channels
    r, g, b, a = watermark.split()
    
    # Apply opacity to alpha channel
    opacity_factor = opacity / 100.0
    a = a.point(lambda x: int(x * opacity_factor))
    
    # Merge back
    return Image.merge('RGBA', (r, g, b, a))


def apply_watermark(
    image: Image.Image,
    watermark: Image.Image,
    position: PositionType = "bottom-right",
    size_percent: float = 20.0,
    opacity: int = 100,
    padding: int = 20
) -> Image.Image:
    """
    Apply watermark to an image.
    
    Args:
        image: Base PIL Image
        watermark: Watermark PIL Image
        position: Position type
        size_percent: Watermark width as percentage of image width
        opacity: Opacity 0-100
        padding: Padding in pixels
        
    Returns:
        PIL Image with watermark applied
    """
    # Ensure image is in RGBA mode for compositing
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    
    # Ensure watermark is RGBA
    if watermark.mode != 'RGBA':
        watermark = watermark.convert('RGBA')
    
    # Calculate target watermark width based on percentage
    target_width = int(image.width * (size_percent / 100.0))
    target_width = max(1, target_width)  # Ensure at least 1 pixel
    
    # Resize watermark
    watermark_resized = resize_watermark(watermark, target_width)
    
    # Apply opacity
    watermark_with_opacity = apply_opacity(watermark_resized, opacity)
    
    # Calculate position
    x, y = calculate_position(
        image.size,
        watermark_with_opacity.size,
        position,
        padding
    )
    
    # Ensure position is within bounds
    x = max(0, min(x, image.width - watermark_with_opacity.width))
    y = max(0, min(y, image.height - watermark_with_opacity.height))
    
    # Create a copy to avoid modifying original
    result = image.copy()
    
    # Paste watermark with alpha mask
    result.paste(
        watermark_with_opacity,
        (x, y),
        watermark_with_opacity
    )
    
    return result


def image_to_base64(image: Image.Image, format: str = "PNG") -> str:
    """
    Convert PIL Image to base64 string.
    
    Args:
        image: PIL Image
        format: Output format (PNG, JPEG)
        
    Returns:
        Base64 encoded string with data URI prefix
    """
    buffer = io.BytesIO()
    
    # Convert to RGB for JPEG
    if format.upper() == "JPEG" and image.mode == 'RGBA':
        # Create white background
        background = Image.new('RGB', image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[3])
        image = background
    
    image.save(buffer, format=format, quality=98)
    buffer.seek(0)
    
    mime_type = "image/png" if format.upper() == "PNG" else "image/jpeg"
    base64_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return f"data:{mime_type};base64,{base64_str}"


def base64_to_image(base64_string: str) -> Image.Image:
    """
    Convert base64 string to PIL Image.
    
    Args:
        base64_string: Base64 encoded string (with or without data URI prefix)
        
    Returns:
        PIL Image
    """
    # Remove data URI prefix if present
    if ',' in base64_string:
        base64_string = base64_string.split(',')[1]
    
    image_data = base64.b64decode(base64_string)
    return Image.open(io.BytesIO(image_data))
