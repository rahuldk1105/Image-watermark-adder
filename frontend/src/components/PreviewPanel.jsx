import { Icons } from './Icons'

function PreviewPanel({ images, selectedIndex, previewImage, report, isLoading, onSelectImage }) {

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
                                <option key={img.id} value={index}>
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
                            src={selectedImage.url}
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

            {report && previewImage && !isLoading && (
                <div className="algorithm-report">
                    <span className="report-title">
                        {report.scores ? 'Smart placement chose' : 'Placed at'}{' '}
                        <strong>{report.position.replace('-', ' ')}</strong>
                    </span>
                    {report.scores && (
                        <div className="report-scores">
                            {Object.entries(report.scores)
                                .sort((a, b) => a[1] - b[1])
                                .map(([name, score]) => (
                                    <span
                                        key={name}
                                        className={name === report.position ? 'chosen' : ''}
                                        title="Mean Sobel gradient magnitude (lower = smoother)"
                                    >
                                        {name.replace('-', ' ')}: {score.toFixed(1)}
                                    </span>
                                ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default PreviewPanel
