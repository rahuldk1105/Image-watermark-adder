import { useState, useEffect, useCallback, useRef } from 'react'
import { Icons } from './components/Icons'
import ImageUploader from './components/ImageUploader'
import WatermarkUploader from './components/WatermarkUploader'
import WatermarkControls from './components/WatermarkControls'
import PreviewPanel from './components/PreviewPanel'
import ProcessingPanel from './components/ProcessingPanel'

const API_URL = 'http://127.0.0.1:8765'

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
        position: 'bottom-right',
        size_percent: 20,
        opacity: 100,
        padding: 20,
        remove_bg: false,
        bg_threshold: 240
    })

    // Preview state
    const [previewImage, setPreviewImage] = useState(null)
    const [isLoadingPreview, setIsLoadingPreview] = useState(false)

    // Image loading state
    const [isLoadingImages, setIsLoadingImages] = useState(false)
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })

    // Processing state
    const [outputDir, setOutputDir] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const [processProgress, setProcessProgress] = useState(0)
    const [processMessage, setProcessMessage] = useState(null)

    // Debounce ref for preview
    const previewTimeoutRef = useRef(null)

    // Initialize output directory
    useEffect(() => {
        const initOutputDir = async () => {
            if (window.electronAPI) {
                try {
                    const dir = await window.electronAPI.getDefaultOutputDir()
                    setOutputDir(dir)
                } catch (error) {
                    console.error('Error getting default output dir:', error)
                }
            }
        }
        initOutputDir()
    }, [])

    // Generate preview with debounce when settings change
    useEffect(() => {
        // Clear previous timeout
        if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current)
        }

        // Set new debounced timeout (300ms delay)
        previewTimeoutRef.current = setTimeout(() => {
            generatePreview()
        }, 300)

        // Cleanup
        return () => {
            if (previewTimeoutRef.current) {
                clearTimeout(previewTimeoutRef.current)
            }
        }
    }, [settings, watermark, selectedImageIndex, images])

    const generatePreview = async () => {
        const selectedImage = images[selectedImageIndex]

        if (!selectedImage || !watermark) {
            setPreviewImage(null)
            return
        }

        setIsLoadingPreview(true)

        try {
            const response = await fetch(`${API_URL}/preview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: selectedImage.data,
                    watermark: watermark.data,
                    settings: settings
                })
            })

            if (!response.ok) {
                throw new Error('Preview generation failed')
            }

            const data = await response.json()
            setPreviewImage(data.preview)
        } catch (error) {
            console.error('Preview error:', error)
            setPreviewImage(null)
        } finally {
            setIsLoadingPreview(false)
        }
    }

    const handleImagesSelected = async (filePaths) => {
        if (!window.electronAPI) return

        setIsLoadingImages(true)
        setUploadProgress({ current: 0, total: filePaths.length })

        const newImages = []
        const newDuplicates = []
        const existingNames = new Set(images.map(img => img.name.toLowerCase()))

        for (let i = 0; i < filePaths.length; i++) {
            const path = filePaths[i]
            setUploadProgress({ current: i + 1, total: filePaths.length })

            try {
                const imageData = await window.electronAPI.readImageAsBase64(path)
                const nameLower = imageData.name.toLowerCase()

                if (existingNames.has(nameLower)) {
                    newDuplicates.push(imageData.name)
                } else {
                    existingNames.add(nameLower)
                    newImages.push(imageData)
                }
            } catch (error) {
                console.error('Error reading image:', error)
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

    const handleWatermarkSelected = async (filePath) => {
        if (!window.electronAPI || !filePath) return

        try {
            const watermarkData = await window.electronAPI.readImageAsBase64(filePath)
            setWatermark(watermarkData)
        } catch (error) {
            console.error('Error reading watermark:', error)
        }
    }

    const handleRemoveImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index))
        if (selectedImageIndex >= index && selectedImageIndex > 0) {
            setSelectedImageIndex(prev => prev - 1)
        }
    }

    const handleClearImages = () => {
        setImages([])
        setSelectedImageIndex(0)
        setPreviewImage(null)
        setDuplicates([])
        setShowDuplicateWarning(false)
    }

    const handleDismissDuplicateWarning = () => {
        setShowDuplicateWarning(false)
        setDuplicates([])
    }

    const handleRemoveDuplicates = () => {
        const seen = new Set()
        const uniqueImages = images.filter(img => {
            const nameLower = img.name.toLowerCase()
            if (seen.has(nameLower)) {
                return false
            }
            seen.add(nameLower)
            return true
        })

        setImages(uniqueImages)
        setShowDuplicateWarning(false)
        setDuplicates([])

        if (selectedImageIndex >= uniqueImages.length) {
            setSelectedImageIndex(Math.max(0, uniqueImages.length - 1))
        }
    }

    const handleSelectOutputDir = async () => {
        if (!window.electronAPI) return

        const dir = await window.electronAPI.selectOutputDirectory()
        if (dir) {
            setOutputDir(dir)
        }
    }

    // Process images one at a time to avoid string length issues
    const handleApplyWatermark = async () => {
        if (images.length === 0 || !watermark || !outputDir) return

        setIsProcessing(true)
        setProcessProgress(0)
        setProcessMessage(null)

        let processed = 0
        let failed = 0

        try {
            for (let i = 0; i < images.length; i++) {
                const img = images[i]
                setProcessProgress(Math.round(((i) / images.length) * 100))

                try {
                    const response = await fetch(`${API_URL}/apply`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            images: [{
                                path: img.path,
                                data: img.data
                            }],
                            watermark: watermark.data,
                            settings: settings,
                            output_dir: outputDir
                        })
                    })

                    if (response.ok) {
                        processed++
                    } else {
                        failed++
                    }
                } catch (err) {
                    console.error('Error processing image:', img.name, err)
                    failed++
                }
            }

            setProcessProgress(100)
            setProcessMessage({
                type: 'success',
                text: `Successfully processed ${processed} images.${failed > 0 ? ` ${failed} failed.` : ''}`
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
                    <h1>Bulk Image Watermarker</h1>
                </div>
                <div className="header-meta">
                    <span className="version">v2.2.0</span>
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
                            <button className="btn-warning" onClick={handleRemoveDuplicates}>
                                Remove All Duplicates
                            </button>
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
                            onSelect={(paths) => handleImagesSelected(paths)}
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
                            watermark={watermark}
                            onSelect={handleWatermarkSelected}
                            onClear={() => setWatermark(null)}
                        />
                    </div>
                </aside>

                {/* Center - Preview */}
                <div className="preview-panel">
                    <PreviewPanel
                        images={images}
                        selectedIndex={selectedImageIndex}
                        previewImage={previewImage}
                        isLoading={isLoadingPreview}
                        onSelectImage={setSelectedImageIndex}
                    />

                    <ProcessingPanel
                        outputDir={outputDir}
                        onChangeDir={handleSelectOutputDir}
                        onApply={handleApplyWatermark}
                        isProcessing={isProcessing}
                        progress={processProgress}
                        message={processMessage}
                        canApply={images.length > 0 && watermark !== null}
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
