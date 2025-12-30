import { Icons } from './Icons'

function PreviewPanel({ images, selectedIndex, previewImage, isLoading, onSelectImage }) {

    const selectedImage = images[selectedIndex]

    return (
        <div className="preview-content-wrapper">
            <div className="preview-header">
                <div className="preview-header-left">
                    <Icons.Eye size={16} />
                    <h2>Preview</h2>
                </div>
                {images.length > 1 && (
                    <div className="image-selector">
                        <span className="selector-label">Viewing:</span>
                        <select
                            value={selectedIndex}
                            onChange={(e) => onSelectImage(parseInt(e.target.value))}
                        >
                            {images.map((img, index) => (
                                <option key={img.path} value={index}>
                                    {img.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div className="preview-content">
                {isLoading ? (
                    <div className="preview-loading">
                        <Icons.Spinner size={40} />
                        <span>Generating preview...</span>
                    </div>
                ) : previewImage ? (
                    <div className="preview-image-container">
                        <img
                            src={previewImage}
                            alt="Preview"
                            className="preview-image"
                        />
                    </div>
                ) : selectedImage ? (
                    <div className="preview-image-container">
                        <img
                            src={selectedImage.data}
                            alt="Original"
                            className="preview-image preview-image-original"
                        />
                        <div className="preview-original-badge">Original</div>
                    </div>
                ) : (
                    <div className="preview-placeholder">
                        <Icons.Images size={64} className="placeholder-icon" />
                        <h3>No preview available</h3>
                        <p>Upload images and a watermark to see the preview</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default PreviewPanel
