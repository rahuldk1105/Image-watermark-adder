# Bulk Image Watermarker

A professional Windows desktop application for bulk image watermarking. Built with Electron, React, and Python (FastAPI + Pillow).

![App Screenshot](assets/screenshot.png)

## Features

- ✅ **Bulk Upload** - Upload multiple images at once
- ✅ **Live Preview** - See watermark changes in real-time
- ✅ **Configurable Settings**:
  - Position (top-left, top-right, bottom-left, bottom-right, center)
  - Size (percentage of image width)
  - Opacity (0-100%)
  - Padding (pixels from edge)
- ✅ **Lossless Export** - JPG at 98% quality, PNG lossless
- ✅ **Offline** - Works completely offline, no internet required
- ✅ **Single Executable** - Easy to share and install

## Tech Stack

| Component | Technology |
|-----------|------------|
| Desktop Shell | Electron |
| Frontend | React + Vite |
| Backend | Python + FastAPI |
| Image Processing | Pillow (PIL) |
| Packaging | PyInstaller + electron-builder |

## Project Structure

```
├── backend/
│   ├── main.py           # FastAPI server
│   ├── watermark.py      # Core watermark logic
│   ├── requirements.txt  # Python dependencies
│   └── watermark.spec    # PyInstaller configuration
├── electron/
│   ├── main.js           # Electron main process
│   └── preload.js        # IPC bridge
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main React component
│   │   ├── index.css     # Global styles
│   │   └── components/   # React components
│   ├── index.html
│   └── package.json
├── assets/               # App icons
├── package.json          # Root package.json
└── README.md
```

## Development Setup

### Prerequisites

- **Node.js** v18+ (with npm)
- **Python** 3.9+ (with pip)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "Image watermark adder"
```

### 2. Install Node Dependencies

```bash
npm install
```

This will also install frontend dependencies via `postinstall`.

### 3. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
cd ..
```

### 4. Run in Development Mode

Open **two terminals**:

**Terminal 1 - Start Python Backend:**
```bash
cd backend
python main.py
```
The backend runs on `http://127.0.0.1:8765`

**Terminal 2 - Start Electron + React:**
```bash
npm run dev
```

## Building for Production

### Step 1: Build Python Backend

First, build the Python backend into a standalone executable:

```bash
cd backend
pip install pyinstaller
pyinstaller watermark.spec --noconfirm
```

This creates `backend/dist/watermark-backend.exe`

### Step 2: Build React Frontend

```bash
npm run build:frontend
```

Or:
```bash
cd frontend
npm run build
```

### Step 3: Build Windows Executable

```bash
npm run build:electron
```

Or run all steps at once:
```bash
npm run build
```

The final executable will be in the `dist/` folder.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/preview` | POST | Generate watermark preview (returns base64) |
| `/apply` | POST | Apply watermark to all images |

### Preview Request

```json
{
  "image": "data:image/png;base64,...",
  "watermark": "data:image/png;base64,...",
  "settings": {
    "position": "bottom-right",
    "size_percent": 20,
    "opacity": 100,
    "padding": 20
  }
}
```

### Apply Request

```json
{
  "images": [
    {"path": "/path/to/image.jpg", "data": "data:image/jpeg;base64,..."}
  ],
  "watermark": "data:image/png;base64,...",
  "settings": { ... },
  "output_dir": "/path/to/output"
}
```

## Configuration

### electron-builder (in package.json)

The build configuration is in `package.json` under the `build` key:

- `appId`: Application identifier
- `productName`: Display name
- `files`: Files to include
- `extraResources`: Python backend executable
- `win`: Windows-specific settings

## Troubleshooting

### Backend won't start

- Ensure Python 3.9+ is installed
- Check if port 8765 is available
- Run `pip install -r requirements.txt` in the backend folder

### Preview not updating

- Check browser console for errors
- Verify backend is running on port 8765
- Check that watermark image is valid PNG/JPG

### Build fails

- Ensure PyInstaller built successfully
- Check that `backend/dist/watermark-backend.exe` exists
- Run `npm install` in root and frontend folders

## License

MIT License - Feel free to use, modify, and distribute.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request
