import { useCallback } from 'react'
import { Icons } from './Icons'

function WatermarkUploader({ watermark, onSelect, onClear }) {

    const handleClick = async () => {
        if (window.electronAPI) {
            const path = await window.electronAPI.selectWatermark()
            if (path) {
                onSelect(path)
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

        const files = Array.from(e.dataTransfer.files)
        const imageFile = files.find(f => /\.(png|jpg|jpeg|webp)$/i.test(f.name))

        if (imageFile) {
            onSelect(imageFile.path)
        }
    }, [onSelect])

    return (
        <div>
            <div
                className={`upload-zone upload-zone-compact ${watermark ? 'has-content' : ''}`}
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                <div className="upload-zone-icon">
                    <Icons.Droplet size={28} />
                </div>
                <div className="upload-zone-text">
                    {watermark ? 'Click to change' : 'Select watermark logo'}
                </div>
            </div>

            {watermark && (
                <div className="watermark-preview">
                    <img src={watermark.data} alt="Watermark" />
                    <div className="watermark-preview-info">
                        <div className="watermark-preview-name">{watermark.name}</div>
                        <div className="watermark-preview-size">Watermark logo</div>
                    </div>
                    <button
                        className="btn-icon"
                        onClick={(e) => {
                            e.stopPropagation()
                            onClear()
                        }}
                        title="Remove"
                    >
                        <Icons.X size={16} />
                    </button>
                </div>
            )}
        </div>
    )
}

export default WatermarkUploader
