import { Icons } from './Icons'

function ProcessingPanel({
    downloadZip,
    onToggleZip,
    uploadS3,
    onToggleS3,
    s3Available,
    accessCodeRequired,
    accessCode,
    onAccessCodeChange,
    onApply,
    isProcessing,
    progress,
    message,
    uploads,
    canApply,
    imageCount
}) {
    return (
        <div className="action-panel">
            <div className="action-panel-content">
                <div className="output-path">
                    <Icons.Folder size={18} className="output-icon" />
                    <div className="output-path-info">
                        <span className="output-label">Output</span>
                        <div className="output-options">
                            <label>
                                <input type="checkbox" checked={downloadZip} onChange={onToggleZip} />
                                Download (ZIP)
                            </label>
                            <label
                                className={s3Available ? '' : 'disabled'}
                                title={s3Available ? 'Upload to Amazon S3' : 'Amazon S3 is not configured on the server'}
                            >
                                <input
                                    type="checkbox"
                                    checked={uploadS3}
                                    disabled={!s3Available}
                                    onChange={onToggleS3}
                                />
                                Upload to Amazon S3
                            </label>
                            {uploadS3 && accessCodeRequired && (
                                <input
                                    type="password"
                                    className="access-code"
                                    placeholder="Upload access code"
                                    value={accessCode}
                                    onChange={(e) => onAccessCodeChange(e.target.value)}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <button
                    className="btn-primary"
                    onClick={onApply}
                    disabled={!canApply || isProcessing || (!downloadZip && !uploadS3) ||
                        (uploadS3 && accessCodeRequired && !accessCode)}
                >
                    {isProcessing ? (
                        <>
                            <Icons.Spinner size={18} />
                            Processing...
                        </>
                    ) : (
                        <>
                            <Icons.Play size={16} />
                            Apply Watermark
                            {imageCount > 0 && <span className="btn-badge">{imageCount}</span>}
                        </>
                    )}
                </button>
            </div>

            {isProcessing && (
                <div className="progress-container">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="progress-text">
                        Processing images...
                    </div>
                </div>
            )}

            {message && (
                <div className={`message message-${message.type}`}>
                    {message.type === 'success' ? (
                        <Icons.Check size={16} />
                    ) : (
                        <Icons.AlertTriangle size={16} />
                    )}
                    <span>{message.text}</span>
                </div>
            )}

            {uploads.length > 0 && (
                <div className="s3-links">
                    {uploads.map((u) => (
                        <a key={u.key} href={u.url} target="_blank" rel="noreferrer">
                            <Icons.Download size={12} /> {u.name}
                        </a>
                    ))}
                </div>
            )}
        </div>
    )
}

export default ProcessingPanel
