import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { zipSync } from 'fflate'
import { Icons } from './components/Icons'
import ImageUploader from './components/ImageUploader'
import WatermarkUploader from './components/WatermarkUploader'
import WatermarkControls from './components/WatermarkControls'
import PreviewPanel from './components/PreviewPanel'
import ProcessingPanel from './components/ProcessingPanel'
import {
    applyWatermark,
    buildWatermark,
    encodeCanvas,
    loadBitmap,
    outputName,
    outputType
} from './lib/watermark'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const PREVIEW_MAX_SIZE = 1600

let nextId = 0

function uniqueName(name, used) {
    let candidate = name
    let n = 1
    while (used.has(candidate.toLowerCase())) {
        candidate = name.replace(/(\.[^.]+)?$/, `-${n++}$1`)
    }
    used.add(candidate.toLowerCase())
    return candidate
}

function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function App() {
    // Image state
    const [images, setImages] = useState([])
    const [watermark, setWatermark] = useState(null)
    const [selectedImageIndex, setSelectedImageIndex] = useState(0)

    // Duplicate detection
    const [duplicates, setDuplicates] = useState([])
    const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)

    // Watermark settings
    const [settings, setSettings] = useState({
        watermark_type: 'logo',
        text: '© Your Name',
        text_color: '#ffffff',
        position: 'bottom-right',
        size_percent: 20,
        opacity: 100,
        padding: 20,
        remove_bg: false,
        bg_threshold: 240
    })

    // Preview state
    const [previewImage, setPreviewImage] = useState(null)
    const [previewReport, setPreviewReport] = useState(null)
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)

    // Image loading state
    const [isLoadingImages, setIsLoadingImages] = useState(false)
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })

    // Output / processing state
    const [downloadZip, setDownloadZip] = useState(true)
    const [uploadS3, setUploadS3] = useState(false)
    const [s3Available, setS3Available] = useState(false)
    const [s3Uploads, setS3Uploads] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [processProgress, setProcessProgress] = useState(0)
    const [processMessage, setProcessMessage] = useState(null)

    // Debounce ref for preview
    const previewTimeoutRef = useRef(null)

    // Ask the Cloudflare Worker whether Amazon S3 storage is configured
    useEffect(() => {
        fetch(`${API_BASE}/api/health`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setS3Available(Boolean(data?.s3)))
            .catch(() => setS3Available(false))
    }, [])

    // Release the previous preview blob URL
    useEffect(() => () => {
        if (previewImage) URL.revokeObjectURL(previewImage)
    }, [previewImage])

    const watermarkCanvas = useMemo(
        () => buildWatermark(settings, watermark?.bitmap),
        [settings.watermark_type, settings.text, settings.text_color,
            settings.remove_bg, settings.bg_threshold, watermark]
    )

    const generatePreview = useCallback(async () => {
        const selectedImage = images[selectedImageIndex]

        if (!selectedImage || !watermarkCanvas) {
            setPreviewImage(null)
            setPreviewReport(null)
            return
        }

        setIsLoadingPreview(true)

        try {
            const bitmap = await createImageBitmap(selectedImage.file)
            const { canvas, report } = applyWatermark(bitmap, watermarkCanvas, settings, PREVIEW_MAX_SIZE)
            bitmap.close()
            const blob = await encodeCanvas(canvas, 'image/png')
            setPreviewImage(URL.createObjectURL(blob))
            setPreviewReport(report)
        } catch (error) {
            console.error('Preview error:', error)
            setPreviewImage(null)
            setPreviewReport(null)
        } finally {
            setIsLoadingPreview(false)
        }
    }, [images, selectedImageIndex, watermarkCanvas, settings])

    // Generate preview with debounce when settings change
    useEffect(() => {
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current)
        }
        previewTimeoutRef.current = setTimeout(generatePreview, 250)

        return () => {
            if (previewTimeoutRef.current) {
                clearTimeout(previewTimeoutRef.current)
            }
        }
    }, [generatePreview])

    const handleImagesSelected = async (files) => {
        setIsLoadingImages(true)
        setUploadProgress({ current: 0, total: files.length })

        const newImages = []
        const newDuplicates = []
        const existingNames = new Set(images.map(img => img.name.toLowerCase()))

        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            setUploadProgress({ current: i + 1, total: files.length })
            const nameLower = file.name.toLowerCase()

            if (existingNames.has(nameLower)) {
                newDuplicates.push(file.name)
            } else {
                existingNames.add(nameLower)
                newImages.push({ id: ++nextId, name: file.name, file, url: URL.createObjectURL(file) })
            }
        }

        setIsLoadingImages(false)
        setUploadProgress({ current: 0, total: 0 })

        if (newImages.length > 0) {
            setImages(prev => [...prev, ...newImages])
        }

        if (newDuplicates.length > 0) {
            setDuplicates(prev => [...prev, ...newDuplicates])
            setShowDuplicateWarning(true)
        }
    }

    const handleWatermarkSelected = async (file) => {
        try {
            const bitmap = await loadBitmap(file)
            if (watermark) URL.revokeObjectURL(watermark.url)
            setWatermark({ name: file.name, url: URL.createObjectURL(file), bitmap })
        } catch (error) {
            console.error('Error reading watermark:', error)
        }
    }

    const handleClearWatermark = () => {
        if (watermark) URL.revokeObjectURL(watermark.url)
        setWatermark(null)
    }

    const handleRemoveImage = (index) => {
        URL.revokeObjectURL(images[index].url)
        setImages(prev => prev.filter((_, i) => i !== index))
        if (selectedImageIndex >= index && selectedImageIndex > 0) {
            setSelectedImageIndex(prev => prev - 1)
        }
    }

    const handleClearImages = () => {
        images.forEach(img => URL.revokeObjectURL(img.url))
        setImages([])
        setSelectedImageIndex(0)
        setPreviewImage(null)
        setPreviewReport(null)
        setDuplicates([])
        setShowDuplicateWarning(false)
    }

    const handleDismissDuplicateWarning = () => {
        setShowDuplicateWarning(false)
        setDuplicates([])
    }

    const uploadToS3 = async (blob, name) => {
        const response = await fetch(`${API_BASE}/api/upload?name=${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: { 'Content-Type': blob.type },
            body: blob
        })
        if (!response.ok) {
            throw new Error((await response.text()) || `Upload failed (${response.status})`)
        }
        return response.json()
    }

    // Process images one at a time in the browser
    const handleApplyWatermark = async () => {
        if (images.length === 0 || !watermarkCanvas) return

        setIsProcessing(true)
        setProcessProgress(0)
        setProcessMessage(null)
        setS3Uploads([])

        let processed = 0
        let failed = 0
        let uploadError = null
        const zipEntries = {}
        const usedNames = new Set()
        const uploads = []

        try {
            for (let i = 0; i < images.length; i++) {
                const img = images[i]
                setProcessProgress(Math.round((i / images.length) * 100))
                // Let the progress bar repaint between images
                await new Promise(resolve => setTimeout(resolve, 0))

                try {
                    const bitmap = await createImageBitmap(img.file)
                    const { canvas } = applyWatermark(bitmap, watermarkCanvas, settings)
                    bitmap.close()
                    const mime = outputType(img.name)
                    const blob = await encodeCanvas(canvas, mime)
                    const name = uniqueName(outputName(img.name), usedNames)

                    if (downloadZip) {
                        zipEntries[name] = new Uint8Array(await blob.arrayBuffer())
                    }
                    if (uploadS3) {
                        try {
                            const result = await uploadToS3(blob, name)
                            uploads.push({ name, ...result })
                        } catch (err) {
                            uploadError = err.message
                            throw err
                        }
                    }
                    processed++
                } catch (err) {
                    console.error('Error processing image:', img.name, err)
                    failed++
                }
            }

            if (downloadZip && processed > 0) {
                // Images are already compressed, so store them without re-compressing
                downloadBlob(new Blob([zipSync(zipEntries, { level: 0 })], { type: 'application/zip' }),
                    'watermarked-images.zip')
            }

            setProcessProgress(100)
            setS3Uploads(uploads)
            setProcessMessage({
                type: failed > 0 ? 'error' : 'success',
                text: `Processed ${processed} image${processed !== 1 ? 's' : ''}` +
                    (uploads.length > 0 ? `, ${uploads.length} uploaded to Amazon S3` : '') +
                    '.' +
                    (failed > 0 ? ` ${failed} failed${uploadError ? ` (${uploadError})` : ''}.` : '')
            })
        } catch (error) {
            console.error('Processing error:', error)
            setProcessMessage({
                type: 'error',
                text: `Error: ${error.message}`
            })
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="app">
            <header className="app-header">
                <div className="header-brand">
                    <div className="logo">
                        <Icons.Layers size={22} />
                    </div>
                    <h1>Image Watermark Generation</h1>
                </div>
                <div className="header-meta">
                    <span className="version">v3.0.0</span>
                </div>
            </header>

            {/* Duplicate Warning Banner */}
            {showDuplicateWarning && (
                <div className="duplicate-warning">
                    <div className="duplicate-warning-content">
                        <Icons.AlertTriangle size={20} className="warning-icon" />
                        <div className="duplicate-warning-text">
                            <strong>{duplicates.length} duplicate image{duplicates.length > 1 ? 's' : ''} skipped</strong>
                            <span className="duplicate-names">
                                {duplicates.slice(0, 3).join(', ')}
                                {duplicates.length > 3 && ` and ${duplicates.length - 3} more`}
                            </span>
                        </div>
                        <div className="duplicate-warning-actions">
                            <button className="btn-dismiss" onClick={handleDismissDuplicateWarning}>
                                <Icons.X size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="app-main">
                {/* Left Sidebar - File Uploads */}
                <aside className="sidebar sidebar-left">
                    <div className="sidebar-section">
                        <div className="section-header">
                            <Icons.Images size={16} />
                            <h3>Source Images</h3>
                        </div>
                        <ImageUploader
                            images={images}
                            selectedIndex={selectedImageIndex}
                            onSelect={handleImagesSelected}
                            onSelectImage={setSelectedImageIndex}
                            onRemove={handleRemoveImage}
                            onClear={handleClearImages}
                            isLoading={isLoadingImages}
                            uploadProgress={uploadProgress}
                        />
                    </div>

                    <div className="sidebar-section">
                        <div className="section-header">
                            <Icons.Stamp size={16} />
                            <h3>Watermark</h3>
                        </div>
                        <WatermarkUploader
                            settings={settings}
                            onChange={setSettings}
                            watermark={watermark}
                            onSelect={handleWatermarkSelected}
                            onClear={handleClearWatermark}
                        />
                    </div>
                </aside>

                {/* Center - Preview */}
                <div className="preview-panel">
                    <PreviewPanel
                        images={images}
                        selectedIndex={selectedImageIndex}
                        previewImage={previewImage}
                        report={previewReport}
                        isLoading={isLoadingPreview}
                        onSelectImage={setSelectedImageIndex}
                    />

                    <ProcessingPanel
                        downloadZip={downloadZip}
                        onToggleZip={() => setDownloadZip(v => !v)}
                        uploadS3={uploadS3}
                        onToggleS3={() => setUploadS3(v => !v)}
                        s3Available={s3Available}
                        onApply={handleApplyWatermark}
                        isProcessing={isProcessing}
                        progress={processProgress}
                        message={processMessage}
                        uploads={s3Uploads}
                        canApply={images.length > 0 && watermarkCanvas !== null}
                        imageCount={images.length}
                    />
                </div>

                {/* Right Sidebar - Watermark Settings */}
                <aside className="sidebar sidebar-right">
                    <div className="sidebar-scrollable">
                        <div className="section-header">
                            <Icons.Settings size={16} />
                            <h3>Watermark Settings</h3>
                        </div>
                        <WatermarkControls
                            settings={settings}
                            onChange={setSettings}
                        />
                    </div>
                </aside>
            </main>
        </div>
    )
}

export default App
