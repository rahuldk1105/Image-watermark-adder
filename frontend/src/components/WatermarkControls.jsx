import { ANCHORS } from '../lib/watermark'

function WatermarkControls({ settings, onChange }) {

    const handleChange = (key, value) => {
        onChange({ ...settings, [key]: value })
    }

    return (
        <div>
            {/* Position */}
            <div className="control-group">
                <div className="control-label">
                    Position
                </div>
                <button
                    className={`smart-btn ${settings.position === 'auto' ? 'active' : ''}`}
                    onClick={() => handleChange('position', 'auto')}
                >
                    Smart placement (auto)
                </button>
                <div className="position-grid">
                    {ANCHORS.map((anchor) => (
                        <button
                            key={anchor}
                            className={`position-btn ${settings.position === anchor ? 'active' : ''}`}
                            data-position={anchor}
                            onClick={() => handleChange('position', anchor)}
                            title={anchor.replace('-', ' ')}
                        />
                    ))}
                </div>
                <p className="control-hint">
                    Smart placement picks the least detailed region of each image
                </p>
            </div>

            {/* Size */}
            <div className="control-group">
                <div className="control-label">
                    Size
                    <span className="control-value">{settings.size_percent}%</span>
                </div>
                <input
                    type="range"
                    className="slider"
                    min="5"
                    max="80"
                    step="1"
                    value={settings.size_percent}
                    onChange={(e) => handleChange('size_percent', parseInt(e.target.value))}
                />
            </div>

            {/* Opacity */}
            <div className="control-group">
                <div className="control-label">
                    Opacity
                    <span className="control-value">{settings.opacity}%</span>
                </div>
                <input
                    type="range"
                    className="slider"
                    min="0"
                    max="100"
                    step="1"
                    value={settings.opacity}
                    onChange={(e) => handleChange('opacity', parseInt(e.target.value))}
                />
            </div>

            {/* Padding */}
            <div className="control-group">
                <div className="control-label">
                    Padding (pixels)
                </div>
                <input
                    type="number"
                    className="number-input"
                    min="0"
                    max="500"
                    value={settings.padding}
                    onChange={(e) => handleChange('padding', parseInt(e.target.value) || 0)}
                />
            </div>

            {settings.watermark_type === 'logo' && (
                <>
                    {/* Divider */}
                    <div className="control-divider"></div>

                    {/* Background Removal */}
                    <div className="control-group">
                        <label className="toggle-label">
                            <input
                                type="checkbox"
                                className="toggle-input"
                                checked={settings.remove_bg}
                                onChange={(e) => handleChange('remove_bg', e.target.checked)}
                            />
                            <span className="toggle-switch"></span>
                            <span className="toggle-text">Remove Background</span>
                        </label>
                        <p className="control-hint">
                            Removes white/light background from watermark
                        </p>
                    </div>

                    {/* Background Threshold (only show when remove_bg is enabled) */}
                    {settings.remove_bg && (
                        <div className="control-group">
                            <div className="control-label">
                                Threshold
                                <span className="control-value">{settings.bg_threshold}</span>
                            </div>
                            <input
                                type="range"
                                className="slider"
                                min="180"
                                max="255"
                                step="1"
                                value={settings.bg_threshold}
                                onChange={(e) => handleChange('bg_threshold', parseInt(e.target.value))}
                            />
                            <p className="control-hint">
                                Higher = more aggressive removal
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default WatermarkControls
