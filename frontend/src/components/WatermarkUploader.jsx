import { useCallback, useRef } from 'react'
import { Icons } from './Icons'

const LOGO_PATTERN = /\.(png|jpe?g|webp)$/i

function WatermarkUploader({ settings, onChange, watermark, onSelect, onClear }) {
    const inputRef = useRef(null)
    const isText = settings.watermark_type === 'text'

    const handleChange = (key, value) => {
        onChange({ ...settings, [key]: value })
    }

    const handleInputChange = (e) => {
        const file = e.target.files?.[0]
        if (file && LOGO_PATTERN.test(file.name)) {
            onSelect(file)
        }
        e.target.value = ''
    }

    const handleDragOver = useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()
    }, [])

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        e.stopPropagation()

        const imageFile = Array.from(e.dataTransfer.files).find(f => LOGO_PATTERN.test(f.name))
        if (imageFile) {
            onSelect(imageFile)
        }
    }, [onSelect])

    return (
        <div>
            {/* Watermark type */}
            <div className="segmented">
                <button
                    className={!isText ? 'active' : ''}
                    onClick={() => handleChange('watermark_type', 'logo')}
                >
                    Logo
                </button>
                <button
                    className={isText ? 'active' : ''}
                    onClick={() => handleChange('watermark_type', 'text')}
                >
                    Text
                </button>
            </div>

            {isText ? (
                <div className="text-watermark">
                    <input
                        type="text"
                        className="number-input"
                        placeholder="© Your Name"
                        maxLength={60}
                        value={settings.text}
                        onChange={(e) => handleChange('text', e.target.value)}
                    />
                    <label className="color-field">
                        <span>Text colour</span>
                        <input
                            type="color"
                            value={settings.text_color}
                            onChange={(e) => handleChange('text_color', e.target.value)}
                        />
                    </label>
                </div>
            ) : (
                <>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        hidden
                        onChange={handleInputChange}
                    />
                    <div
                        className={`upload-zone upload-zone-compact ${watermark ? 'has-content' : ''}`}
                        onClick={() => inputRef.current?.click()}
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
                            <img src={watermark.url} alt="Watermark" />
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
                </>
            )}
        </div>
    )
}

export default WatermarkUploader
