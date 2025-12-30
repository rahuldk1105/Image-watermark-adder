import { Icons } from './Icons'

function ProcessingPanel({
    outputDir,
    onChangeDir,
    onApply,
    isProcessing,
    progress,
    message,
    canApply,
    imageCount
}) {
    return (
        <div className="action-panel">
            <div className="action-panel-content">
                <div className="output-path">
                    <Icons.Folder size={18} className="output-icon" />
                    <div className="output-path-info">
                        <span className="output-label">Output folder</span>
                        <span className="output-path-text">{outputDir || 'Not selected'}</span>
                    </div>
                    <button className="btn-change-folder" onClick={onChangeDir}>
                        Change
                    </button>
                </div>

                <button
                    className="btn-primary"
                    onClick={onApply}
                    disabled={!canApply || isProcessing || !outputDir}
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
        </div>
    )
}

export default ProcessingPanel
