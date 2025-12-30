import { useCallback } from 'react'
import { Icons } from './Icons'

function ImageUploader({
    images,
    selectedIndex,
    onSelect,
    onSelectImage,
    onRemove,
    onClear,
    isLoading,
    uploadProgress
}) {

    const handleClick = async () => {
        if (isLoading) return
        if (window.electronAPI) {
            const paths = await window.electronAPI.selectImages()
            if (paths.length > 0) {
                onSelect(paths)
            }
        }
    }

    const handleDragOver = useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()
        if (isLoading) return

        const files = Array.from(e.dataTransfer.files)
        const imagePaths = files
            .filter(f => /\.(jpg|jpeg|png|webp|bmp)$/i.test(f.name))
            .map(f => f.path)

        if (imagePaths.length > 0) {
            onSelect(imagePaths)
        }
    }, [onSelect, isLoading])

    const progressPercent = uploadProgress.total > 0
        ? Math.round((uploadProgress.current / uploadProgress.total) * 100)
        : 0

    return (
        <div>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-loading">
                    <div className="upload-loading-content">
                        <Icons.Spinner size={24} />
                        <div className="upload-loading-info">
                            <span className="upload-loading-text">
                                Loading images...
                            </span>
                            <span className="upload-loading-count">
                                {uploadProgress.current} of {uploadProgress.total}
                            </span>
                        </div>
                    </div>
                    <div className="upload-progress-bar">
                        <div
                            className="upload-progress-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Upload Zone */}
            {!isLoading && (
                <div
                    className={`upload-zone ${images.length > 0 ? 'has-content' : ''}`}
                    onClick={handleClick}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    <div className="upload-zone-icon">
                        <Icons.Upload size={32} />
                    </div>
                    <div className="upload-zone-text">
                        {images.length === 0
                            ? 'Click to browse or drag files here'
                            : 'Add more images'
                        }
                    </div>
                    {images.length > 0 && (
                        <div className="upload-zone-count">
                            {images.length} image{images.length !== 1 ? 's' : ''} selected
                        </div>
                    )}
                </div>
            )}

            {/* Image List */}
            {images.length > 0 && !isLoading && (
                <>
                    <div className="image-list" style={{ marginTop: '12px' }}>
                        {images.map((img, index) => (
                            <div
                                key={img.path}
                                className={`image-list-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => onSelectImage(index)}
                            >
                                <img src={img.data} alt={img.name} />
                                <span>{img.name}</span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onRemove(index)
                                    }}
                                    title="Remove"
                                    className="btn-icon"
                                >
                                    <Icons.X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    <button
                        className="btn-secondary btn-full"
                        onClick={onClear}
                        style={{ marginTop: '12px' }}
                    >
                        <Icons.Trash size={14} />
                        Clear All
                    </button>
                </>
            )}
        </div>
    )
}

export default ImageUploader
