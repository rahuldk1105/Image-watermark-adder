/**
 * Browser implementation of the watermarking algorithm.
 *
 * A step-for-step port of backend/watermark.py (Python + OpenCV) so the web
 * version deployed on Cloudflare runs entirely in the visitor's browser:
 *
 *   1. decode host image I, prepare watermark W (logo, or text drawn on canvas)
 *   2. optional background removal: alpha = 0 where gray > T
 *   3. scale W to s% of the image width (aspect ratio kept)
 *   4. position: fixed anchor, or Smart Placement - the anchor whose region has
 *      the lowest mean Sobel gradient magnitude (integral image, O(1) per region)
 *   5. alpha blending: O = (1 - a) * I + a * W,  a = alpha_W / 255 * opacity
 *   6. encode (PNG lossless / JPEG q=0.98)
 */

export const ANCHORS = [
    'top-left', 'top-center', 'top-right',
    'center-left', 'center', 'center-right',
    'bottom-left', 'bottom-center', 'bottom-right'
]

const TIE_BREAK = [
    'bottom-right', 'bottom-left', 'top-right', 'top-left',
    'bottom-center', 'top-center', 'center-right', 'center-left', 'center'
]

function createCanvas(width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
}

// ---------------------------------------------------------------------------
// Step 1 - decoding / watermark preparation
// ---------------------------------------------------------------------------

export async function loadBitmap(source) {
    const blob = source instanceof Blob ? source : await (await fetch(source)).blob()
    return createImageBitmap(blob)
}

/** Draw a bitmap/canvas into a new canvas, optionally scaled to width x height. */
function toCanvas(source, width = source.width, height = source.height) {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
    return canvas
}

/** Render a text watermark on a transparent canvas (white fill, dark outline). */
export function renderTextWatermark(text, color = '#ffffff', outline = true) {
    const value = (text || '').trim() || 'Watermark'
    const fontSize = 160
    const font = `600 ${fontSize}px "Inter", "Segoe UI", Arial, sans-serif`
    const measure = createCanvas(1, 1).getContext('2d')
    measure.font = font
    const metrics = measure.measureText(value)
    const stroke = outline ? Math.round(fontSize / 12) : 0
    const margin = stroke + 4
    const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2

    const canvas = createCanvas(
        Math.ceil(metrics.width + 2 * margin),
        Math.ceil(ascent + descent + 2 * margin)
    )
    const ctx = canvas.getContext('2d')
    ctx.font = font
    ctx.textBaseline = 'alphabetic'
    if (outline) {
        ctx.lineJoin = 'round'
        ctx.lineWidth = stroke
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.63)'
        ctx.strokeText(value, margin, margin + ascent)
    }
    ctx.fillStyle = color
    ctx.fillText(value, margin, margin + ascent)
    return canvas
}

// ---------------------------------------------------------------------------
// Step 2 - background removal
// ---------------------------------------------------------------------------

/** alpha = 0 where gray > threshold (gray uses OpenCV's BGR2GRAY weights). */
export function removeBackground(canvas, threshold = 240) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        if (gray > threshold) d[i + 3] = 0
    }
    ctx.putImageData(img, 0, 0)
    return canvas
}

export function buildWatermark(settings, logoBitmap) {
    if (settings.watermark_type === 'text') {
        return renderTextWatermark(settings.text, settings.text_color)
    }
    if (!logoBitmap) return null
    const canvas = toCanvas(logoBitmap)
    return settings.remove_bg ? removeBackground(canvas, settings.bg_threshold) : canvas
}

// ---------------------------------------------------------------------------
// Step 4 - positioning (fixed anchors + Smart Placement)
// ---------------------------------------------------------------------------

export function anchorPosition(imgW, imgH, wmW, wmH, position, padding) {
    let [vertical, horizontal] = position.split('-')
    if (position === 'center') horizontal = 'center'

    const xs = { left: padding, center: Math.floor((imgW - wmW) / 2), right: imgW - wmW - padding }
    const ys = { top: padding, center: Math.floor((imgH - wmH) / 2), bottom: imgH - wmH - padding }
    const x = xs[horizontal] ?? xs.right
    const y = ys[vertical] ?? ys.bottom
    return {
        x: Math.max(0, Math.min(x, imgW - wmW)),
        y: Math.max(0, Math.min(y, imgH - wmH))
    }
}

/** Mean Sobel gradient magnitude under each anchor's region (lower = smoother). */
export function regionScores(imageData, wmW, wmH, padding) {
    const { width: w, height: h, data } = imageData
    const gray = new Float32Array(w * h)
    for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
        gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }

    // Reflect-101 border, same default as OpenCV's Sobel
    const rx = (x) => (x < 0 ? -x : x >= w ? 2 * w - x - 2 : x)
    const ry = (y) => (y < 0 ? -y : y >= h ? 2 * h - y - 2 : y)

    // Integral image of the gradient magnitude, (w + 1) x (h + 1)
    const stride = w + 1
    const integral = new Float64Array(stride * (h + 1))
    for (let y = 0; y < h; y++) {
        const y0 = ry(y - 1) * w, y1 = y * w, y2 = ry(y + 1) * w
        let rowSum = 0
        for (let x = 0; x < w; x++) {
            const x0 = rx(x - 1), x2 = rx(x + 1)
            const gx = (gray[y0 + x2] + 2 * gray[y1 + x2] + gray[y2 + x2])
                - (gray[y0 + x0] + 2 * gray[y1 + x0] + gray[y2 + x0])
            const gy = (gray[y2 + x0] + 2 * gray[y2 + x] + gray[y2 + x2])
                - (gray[y0 + x0] + 2 * gray[y0 + x] + gray[y0 + x2])
            rowSum += Math.sqrt(gx * gx + gy * gy)
            integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum
        }
    }

    const rw = Math.min(wmW, w), rh = Math.min(wmH, h)
    const area = rw * rh
    const scores = {}
    for (const name of ANCHORS) {
        const { x, y } = anchorPosition(w, h, rw, rh, name, padding)
        const total = integral[(y + rh) * stride + x + rw] - integral[y * stride + x + rw]
            - integral[(y + rh) * stride + x] + integral[y * stride + x]
        scores[name] = Math.round((total / area) * 1000) / 1000
    }
    return scores
}

export function choosePosition(scores) {
    return [...TIE_BREAK].sort((a, b) => scores[a] - scores[b] || TIE_BREAK.indexOf(a) - TIE_BREAK.indexOf(b))[0]
}

// ---------------------------------------------------------------------------
// Step 5 - alpha blending
// ---------------------------------------------------------------------------

export function alphaBlend(imageData, wmData, x, y, opacity) {
    const out = imageData.data
    const wm = wmData.data
    const factor = Math.max(0, Math.min(opacity, 100)) / 100
    const w = Math.min(wmData.width, imageData.width - x)
    const h = Math.min(wmData.height, imageData.height - y)
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const s = (j * wmData.width + i) * 4
            const a = (wm[s + 3] / 255) * factor
            if (a === 0) continue
            const d = ((y + j) * imageData.width + (x + i)) * 4
            // Uint8ClampedArray rounds and clamps to 0-255 on assignment
            out[d] = (1 - a) * out[d] + a * wm[s]
            out[d + 1] = (1 - a) * out[d + 1] + a * wm[s + 1]
            out[d + 2] = (1 - a) * out[d + 2] + a * wm[s + 2]
        }
    }
    return imageData
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

/**
 * Watermark one image.
 * @param {ImageBitmap} bitmap   host image
 * @param {HTMLCanvasElement} watermark  prepared watermark (buildWatermark)
 * @param {object} settings
 * @param {number} maxSize  optional longest-side limit (used for fast previews)
 * @returns {{canvas: HTMLCanvasElement, report: object}}
 */
export function applyWatermark(bitmap, watermark, settings, maxSize = Infinity) {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const imgW = Math.max(1, Math.round(bitmap.width * scale))
    const imgH = Math.max(1, Math.round(bitmap.height * scale))
    const padding = Math.round(settings.padding * scale)

    const canvas = toCanvas(bitmap, imgW, imgH)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const imageData = ctx.getImageData(0, 0, imgW, imgH)

    // Step 3 - scale the watermark, keeping it inside the image
    let wmW = Math.max(1, Math.round(imgW * settings.size_percent / 100))
    let wmH = Math.max(1, Math.round(wmW * watermark.height / watermark.width))
    if (wmH > imgH) {
        wmW = Math.max(1, Math.round(wmW * imgH / wmH))
        wmH = imgH
    }
    const wmData = toCanvas(watermark, wmW, wmH)
        .getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, wmW, wmH)

    // Step 4 - position
    let position = settings.position
    let scores = null
    if (position === 'auto') {
        scores = regionScores(imageData, wmW, wmH, padding)
        position = choosePosition(scores)
    }
    const { x, y } = anchorPosition(imgW, imgH, wmW, wmH, position, padding)

    // Step 5 - blend
    alphaBlend(imageData, wmData, x, y, settings.opacity)
    ctx.putImageData(imageData, 0, 0)

    return { canvas, report: { position, x, y, width: wmW, height: wmH, scores } }
}

// ---------------------------------------------------------------------------
// Step 6 - encoding
// ---------------------------------------------------------------------------

export function outputType(fileName) {
    return /\.(jpe?g)$/i.test(fileName) ? 'image/jpeg' : 'image/png'
}

export function encodeCanvas(canvas, mime) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
            mime,
            0.98
        )
    })
}

/** Output file name: PNG for everything except JPEG inputs. */
export function outputName(fileName) {
    if (/\.(jpe?g|png)$/i.test(fileName)) return fileName
    return fileName.replace(/\.[^.]+$/, '') + '.png'
}
