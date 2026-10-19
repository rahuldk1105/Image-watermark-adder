import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from watermark import (alpha_blend, anchor_position, apply_watermark,  # noqa: E402
                       remove_background, render_text_watermark)


def busy_image_with_flat_corner():
    rng = np.random.default_rng(0)
    image = rng.integers(0, 256, (400, 600, 3), dtype=np.uint8)
    image[250:, :250] = 128  # flat bottom-left area
    return image


def test_alpha_blend_formula():
    image = np.full((10, 10, 3), 100, np.uint8)
    wm = np.zeros((4, 4, 4), np.uint8)
    wm[..., :3] = 200
    wm[..., 3] = 255
    out = alpha_blend(image, wm, 2, 3, opacity=50)
    assert out[3, 2, 0] == 150          # (1 - 0.5) * 100 + 0.5 * 200
    assert out[0, 0, 0] == 100          # outside the ROI untouched


def test_anchor_positions():
    assert anchor_position((100, 80), (20, 10), "top-left", 5) == (5, 5)
    assert anchor_position((100, 80), (20, 10), "bottom-right", 5) == (75, 65)
    assert anchor_position((100, 80), (20, 10), "center", 5) == (40, 35)
    assert anchor_position((100, 80), (20, 10), "bottom-center", 5) == (40, 65)


def test_smart_placement_picks_flat_region():
    _, report = apply_watermark(busy_image_with_flat_corner(), render_text_watermark("Test"),
                                position="auto", size_percent=25, padding=10)
    assert report["position"] == "bottom-left"
    assert report["scores"]["bottom-left"] < report["scores"]["top-right"]


def test_remove_background():
    logo = np.full((5, 5, 3), 255, np.uint8)
    logo[2, 2] = 0
    out = remove_background(logo, 240)
    assert out[0, 0, 3] == 0 and out[2, 2, 3] == 255


def test_text_watermark_maps_symbols_and_rejects_unsupported():
    from watermark import to_ascii_text
    assert to_ascii_text("© Adithya ™") == "(c) Adithya TM"
    try:
        to_ascii_text("ஆதித்யா")
    except ValueError as e:
        assert "ASCII" in str(e)
    else:
        raise AssertionError("expected ValueError")
