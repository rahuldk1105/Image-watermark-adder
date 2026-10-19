# Image Watermark Generation

**Domain:** AWS · **Keywords:** Image Watermarking, Python, OpenCV, Amazon S3, Cloud Storage

Digital images shared online are easy to misuse and copy. This project embeds a **text or logo
watermark** onto images at a **suitable position** with **adjustable transparency**, using
**Python and OpenCV** for image reading, blending and saving, and uploads the watermarked
images to **Amazon S3** for reliable, scalable and secure cloud storage.

The project ships in two forms that run the same algorithm:

| Part | Technology | Purpose |
|------|------------|---------|
| `backend/` | Python, OpenCV, NumPy, FastAPI, boto3 | Reference implementation of the algorithm, REST API and CLI, S3 upload |
| `frontend/` | React + Vite, HTML Canvas | Web UI; runs a step-for-step port of the algorithm in the browser |
| `worker/` | Cloudflare Workers, aws4fetch | Hosts the web app and signs uploads to Amazon S3 (AWS keys stay server-side) |

## The algorithm

Implemented in `backend/watermark.py` (OpenCV) and mirrored in `frontend/src/lib/watermark.js`.

**Input:** host image *I*, watermark (logo image or text), position, size *s*, opacity *α*, padding *p*.
**Output:** watermarked image *O* (and its S3 object key).

1. **Read / prepare** — decode *I* with `cv2.imdecode`. A logo is read with its alpha channel
   (BGRA); a text watermark is rendered with `cv2.putText` on a transparent canvas, with a dark
   outline so it stays readable on light and dark backgrounds (ASCII text only; `©` is written as `(c)`).
2. **Background removal (optional, logos)** — convert the logo to grayscale and make every pixel
   brighter than threshold *T* transparent: `alpha(x, y) = 0 if gray(x, y) > T`.
3. **Scaling** — resize the watermark so its width is *s %* of the image width, keeping the aspect
   ratio (`cv2.INTER_AREA` to shrink, `cv2.INTER_CUBIC` to enlarge).
4. **Position selection**
   - *Fixed:* one of 9 anchors (top/center/bottom × left/center/right), offset by padding *p*.
   - *Smart placement (`auto`):* finds the "suitable position" automatically.
     1. Compute the Sobel gradients *Gx*, *Gy* of the grayscale image and the edge strength
        *G = √(Gx² + Gy²)*.
     2. Build the integral image *S* of *G* (`cv2.integral`), so the sum over any rectangle costs
        O(1): `sum = S(y2,x2) − S(y1,x2) − S(y2,x1) + S(y1,x1)`.
     3. For each of the 9 anchors, score the rectangle the watermark would cover:
        `score = sum(G over region) / area`.
     4. Pick the anchor with the **lowest** score — the flattest, least detailed area — so the
        watermark hides the least image content and remains legible. Ties prefer corners.
5. **Alpha blending** — on the region of interest only:
   `a(x, y) = (alpha_W(x, y) / 255) · α`, `O(x, y) = (1 − a) · I(x, y) + a · W(x, y)`.
6. **Save / store** — encode PNG (lossless) or JPEG (quality 98) with `cv2.imencode`, then upload
   to Amazon S3 under `watermarked/YYYY/MM/DD/<id>-<name>` and return a presigned download link.

**Complexity:** O(N) for an image of N pixels (one Sobel pass, one integral image, one blend of the
watermark region); scoring all 9 candidate positions is O(1) each.

The placement report (chosen anchor and every candidate's score) is returned by the API and shown
under the preview in the web app.

## Run the Python / OpenCV backend

```bash
cd backend
pip install -r requirements.txt

# Command line
python cli.py photo.jpg --text "© R. Adithya" --position auto --opacity 60
python cli.py photos/*.jpg --logo logo.png --remove-bg --out output/ --upload

# REST API on http://127.0.0.1:8765  (docs at /docs)
python main.py

# Tests
pip install pytest && python -m pytest -q tests
```

For `--upload` / `upload_to_s3`, set `S3_BUCKET`, `AWS_REGION` and AWS credentials
(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or any other boto3 credential source).

### API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Status and whether S3 is configured |
| `/preview` | POST | `{image, watermark?, settings}` → `{preview, report}` |
| `/apply` | POST | `{images: [{name, data}], watermark?, settings, upload_to_s3?}` → per-image results, S3 keys |

`settings`: `watermark_type` (`logo` / `text`), `text`, `text_color`, `position`
(9 anchors or `auto`), `size_percent`, `opacity` (0–100), `padding`, `remove_bg`, `bg_threshold`.

## Run the web app locally

Requires Node.js 20+.

```bash
npm install          # also installs frontend/ dependencies
npm run dev          # UI only, http://localhost:5173
npm run preview      # UI + Worker API via wrangler dev, http://localhost:8787
```

For S3 uploads in `wrangler dev`, create `.dev.vars` (git-ignored):

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
UPLOAD_ACCESS_CODE=...   # optional
```

and set `S3_BUCKET` / `AWS_REGION` in `wrangler.jsonc`.

## Deploy to Cloudflare Workers

```bash
npx wrangler login
npm run deploy                                   # builds frontend/ and deploys the Worker
npx wrangler secret put AWS_ACCESS_KEY_ID        # only needed for S3 uploads
npx wrangler secret put AWS_SECRET_ACCESS_KEY
```

The app is served at `https://image-watermark-generation.<your-subdomain>.workers.dev`.

**Deploy on every push** — pick one:

- *Cloudflare Workers Builds:* Cloudflare dashboard → Workers & Pages → Create → Import a
  repository → choose this repo. Build command `npm run build`, deploy command `npx wrangler deploy`.
- *GitHub Actions:* add repository secrets `CLOUDFLARE_API_TOKEN` (template "Edit Cloudflare
  Workers") and `CLOUDFLARE_ACCOUNT_ID`. `.github/workflows/deploy.yml` runs the tests and deploys
  from `main`.

### Amazon S3 setup

1. Create a bucket (e.g. in `ap-south-1`), keep "Block all public access" on.
2. Create an IAM user with only `s3:PutObject` and `s3:GetObject` on `arn:aws:s3:::<bucket>/watermarked/*`.
3. Put its keys in the Worker secrets (above) and set `S3_BUCKET` / `AWS_REGION` in `wrangler.jsonc`.

The Worker accepts only PNG/JPEG uploads up to 25 MB and returns a presigned link valid for one hour.
To stop strangers from filling the bucket, uploads must come from the site itself, are limited to
30 per minute per IP, and — recommended for a public URL — require an access code:
`npx wrangler secret put UPLOAD_ACCESS_CODE`. The web app then asks for the code before uploading.

## Project structure

```
├── backend/
│   ├── watermark.py        # OpenCV implementation of the algorithm
│   ├── s3_storage.py       # Amazon S3 upload (boto3)
│   ├── main.py             # FastAPI server
│   ├── cli.py              # Command-line tool
│   ├── tests/              # pytest unit tests
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── lib/watermark.js  # Browser port of the algorithm
│       ├── App.jsx
│       └── components/
├── worker/src/index.js     # Cloudflare Worker (static assets + S3 upload API)
├── wrangler.jsonc          # Cloudflare Worker configuration
└── .github/workflows/      # Tests and Cloudflare deployment
```
