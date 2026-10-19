/**
 * Cloudflare Worker for Image Watermark Generation.
 *
 *  - Serves the React app (static assets from frontend/dist)
 *  - GET  /api/health  -> reports whether Amazon S3 storage is configured
 *  - POST /api/upload  -> stores a watermarked image in Amazon S3
 *
 * Watermarking itself runs in the browser (frontend/src/lib/watermark.js);
 * the Worker only signs and forwards the finished image to S3 so the AWS keys
 * never reach the client.
 *
 * Configuration:
 *   vars:     S3_BUCKET, AWS_REGION, S3_PREFIX (optional)
 *   secrets:  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *             UPLOAD_ACCESS_CODE (optional: required in the X-Upload-Code header)
 *   bindings: UPLOAD_LIMITER (rate limit per client IP)
 *
 * Upload abuse protection: same-origin requests only, a per-IP rate limit, and
 * optionally a shared access code so only people you give it to can write to S3.
 */

import { AwsClient } from 'aws4fetch'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
const ALLOWED_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg' }
const PRESIGNED_URL_TTL = 3600

function json(body, status = 200) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function s3Configured(env) {
    return Boolean(env.S3_BUCKET && env.AWS_REGION && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)
}

function safeName(name, ext) {
    const base = (name || 'image')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(0, 80) || 'image'
    return `${base}.${ext}`
}

function objectUrl(env, key) {
    const path = key.split('/').map(encodeURIComponent).join('/')
    return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${path}`
}

/** Constant-time string comparison for the access code. */
function safeEqual(a, b) {
    const encoder = new TextEncoder()
    const x = encoder.encode(a)
    const y = encoder.encode(b)
    let diff = x.length ^ y.length
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
    }
    return diff === 0
}

/** Returns an error Response when the caller may not upload, otherwise null. */
async function checkUploadAccess(request, env) {
    const origin = request.headers.get('Origin')
    if (!origin || origin !== new URL(request.url).origin) {
        return json({ error: 'Uploads are only accepted from this site' }, 403)
    }

    if (env.UPLOAD_ACCESS_CODE &&
        !safeEqual(request.headers.get('X-Upload-Code') || '', env.UPLOAD_ACCESS_CODE)) {
        return json({ error: 'Invalid upload access code' }, 401)
    }

    if (env.UPLOAD_LIMITER) {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
        const { success } = await env.UPLOAD_LIMITER.limit({ key: ip })
        if (!success) {
            return json({ error: 'Too many uploads, try again in a minute' }, 429)
        }
    }
    return null
}

async function handleUpload(request, env) {
    if (!s3Configured(env)) {
        return json({ error: 'Amazon S3 is not configured' }, 503)
    }
    const denied = await checkUploadAccess(request, env)
    if (denied) return denied

    const contentType = (request.headers.get('Content-Type') || '').split(';')[0].trim()
    const ext = ALLOWED_TYPES[contentType]
    if (!ext) {
        return json({ error: 'Only PNG and JPEG images can be uploaded' }, 415)
    }
    const declared = Number(request.headers.get('Content-Length') || 0)
    if (declared > MAX_UPLOAD_BYTES) {
        return json({ error: 'Image is larger than 25 MB' }, 413)
    }

    const body = await request.arrayBuffer()
    if (body.byteLength === 0 || body.byteLength > MAX_UPLOAD_BYTES) {
        return json({ error: 'Image is empty or larger than 25 MB' }, 413)
    }

    const name = safeName(new URL(request.url).searchParams.get('name'), ext)
    const date = new Date().toISOString().slice(0, 10).replaceAll('-', '/')
    const key = `${env.S3_PREFIX || 'watermarked/'}${date}/${crypto.randomUUID().slice(0, 8)}-${name}`

    const aws = new AwsClient({
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        region: env.AWS_REGION,
        service: 's3'
    })

    const put = await aws.fetch(objectUrl(env, key), {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body
    })
    if (!put.ok) {
        console.error('S3 upload failed', put.status, await put.text())
        return json({ error: `S3 upload failed (${put.status})` }, 502)
    }

    // Presigned GET link so the user can open the stored copy
    const signed = await aws.sign(
        `${objectUrl(env, key)}?X-Amz-Expires=${PRESIGNED_URL_TTL}`,
        { method: 'GET', aws: { signQuery: true } }
    )

    return json({ bucket: env.S3_BUCKET, key, url: signed.url })
}

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url)

        if (pathname === '/api/health') {
            return json({
                status: 'ok',
                engine: 'browser',
                s3: s3Configured(env),
                access_code_required: Boolean(env.UPLOAD_ACCESS_CODE)
            })
        }
        if (pathname === '/api/upload') {
            if (request.method !== 'POST') {
                return json({ error: 'Method not allowed' }, 405)
            }
            return handleUpload(request, env)
        }
        if (pathname.startsWith('/api/')) {
            return json({ error: 'Not found' }, 404)
        }

        return env.ASSETS.fetch(request)
    }
}
