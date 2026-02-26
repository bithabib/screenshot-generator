import { useState, useCallback } from 'react'
import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import './App.css'

const PRESETS = {
  'iPhone 6.9"': { width: 1320, height: 2868 },
  'iPhone 6.9" Land': { width: 2868, height: 1320 },
  'iPhone 6.7"': { width: 1290, height: 2796 },
  'iPhone 6.7" Land': { width: 2796, height: 1290 },
  'iPhone 6.5"': { width: 1260, height: 2736 },
  'iPhone 6.5" Land': { width: 2736, height: 1260 },
  'iPad 12.9"': { width: 2048, height: 2732 },
  'iPad 11"': { width: 1668, height: 2388 },
  'Android Phone': { width: 1080, height: 1920 },
  'Android Tablet': { width: 1920, height: 1200 },
  'Custom': { width: 1290, height: 2796 },
}

const BG_COLORS = [
  '#F28B82', '#FBBC04', '#FFF475', '#CCFF90', '#A7FFEB',
  '#CBF0F8', '#AECBFA', '#D7AEFB', '#E8EAED', '#2D2D2D',
  '#1A73E8', '#34A853', '#EA4335', '#FF6D01', '#46BDC6',
]

const WORD_COLORS = [
  '#FFFFFF', '#000000', '#F28B82', '#FBBC04', '#FFF475',
  '#CCFF90', '#A7FFEB', '#AECBFA', '#D7AEFB', '#1A73E8',
  '#34A853', '#EA4335', '#FF6D01', '#46BDC6',
]

function App() {
  const [slides, setSlides] = useState([{ id: 0, image: null, text: 'Click to edit this text', wordColors: {} }])
  const [activeSlide, setActiveSlide] = useState(0)
  const [outputWidth, setOutputWidth] = useState(1290)
  const [outputHeight, setOutputHeight] = useState(2796)
  const [preset, setPreset] = useState('iPhone 6.7"')
  const [bgColor, setBgColor] = useState('#F28B82')
  const [useGradient, setUseGradient] = useState(false)
  const [gradientColor2, setGradientColor2] = useState('#FBBC04')
  const [gradientAngle, setGradientAngle] = useState(135)
  const [textColor, setTextColor] = useState('#FFFFFF')
  const [fontSize, setFontSize] = useState(6)
  const [fontWeight, setFontWeight] = useState('bold')
  const [exporting, setExporting] = useState(false)
  const [selectedWord, setSelectedWord] = useState(null)

  const addSlide = () => {
    setSlides(prev => [...prev, { id: Date.now(), image: null, text: 'Click to edit this text', wordColors: {} }])
    setActiveSlide(slides.length)
  }

  const removeSlide = (index) => {
    if (slides.length <= 1) return
    setSlides(prev => prev.filter((_, i) => i !== index))
    if (activeSlide >= slides.length - 1) setActiveSlide(Math.max(0, slides.length - 2))
    else if (activeSlide > index) setActiveSlide(activeSlide - 1)
  }

  const updateSlideText = (index, text) => {
    setSlides(prev => prev.map((s, i) => {
      if (i !== index) return s
      const oldWords = s.text.split(/\s+/).filter(Boolean)
      const newWords = text.split(/\s+/).filter(Boolean)
      const newWordColors = {}
      newWords.forEach((word, wi) => {
        if (s.wordColors[wi] && oldWords[wi] === word) {
          newWordColors[wi] = s.wordColors[wi]
        }
      })
      return { ...s, text, wordColors: newWordColors }
    }))
    setSelectedWord(null)
  }

  const setWordColor = (slideIndex, wordIndex, color) => {
    setSlides(prev => prev.map((s, i) => {
      if (i !== slideIndex) return s
      const newWordColors = { ...s.wordColors }
      if (color === null || color === textColor) {
        delete newWordColors[wordIndex]
      } else {
        newWordColors[wordIndex] = color
      }
      return { ...s, wordColors: newWordColors }
    }))
  }

  const handleImageUpload = (index, e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setSlides(prev => prev.map((s, i) => i === index ? { ...s, image: ev.target.result } : s))
    }
    reader.readAsDataURL(file)
  }

  const removeImage = (index) => {
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, image: null } : s))
  }

  const handlePresetChange = (name) => {
    setPreset(name)
    if (name !== 'Custom') {
      setOutputWidth(PRESETS[name].width)
      setOutputHeight(PRESETS[name].height)
    }
  }

  const getBg = () => {
    if (useGradient) return `linear-gradient(${gradientAngle}deg, ${bgColor}, ${gradientColor2})`
    return bgColor
  }

  // Canvas-based export — draws directly at the target pixel size
  const renderToCanvas = useCallback((slide) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const ctx = canvas.getContext('2d')

      // Draw background
      if (useGradient) {
        const angleRad = (gradientAngle - 90) * Math.PI / 180
        const x1 = outputWidth / 2 - Math.cos(angleRad) * outputWidth
        const y1 = outputHeight / 2 - Math.sin(angleRad) * outputHeight
        const x2 = outputWidth / 2 + Math.cos(angleRad) * outputWidth
        const y2 = outputHeight / 2 + Math.sin(angleRad) * outputHeight
        const grad = ctx.createLinearGradient(x1, y1, x2, y2)
        grad.addColorStop(0, bgColor)
        grad.addColorStop(1, gradientColor2)
        ctx.fillStyle = grad
      } else {
        ctx.fillStyle = bgColor
      }
      ctx.fillRect(0, 0, outputWidth, outputHeight)

      // Draw text — word by word with individual colors
      const textSizePx = fontSize * 0.6 * outputHeight / 100
      const fontStr = `${fontWeight} ${textSizePx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
      ctx.font = fontStr
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      const words = slide.text.split(/\s+/).filter(Boolean)
      const maxTextWidth = outputWidth * 0.85
      const spaceWidth = ctx.measureText(' ').width

      // Word-wrap into lines, tracking which word index each segment belongs to
      const lines = []
      let currentLine = []
      let currentLineWidth = 0

      words.forEach((word, wi) => {
        const wordWidth = ctx.measureText(word).width
        if (currentLine.length > 0 && currentLineWidth + spaceWidth + wordWidth > maxTextWidth) {
          lines.push([...currentLine])
          currentLine = [{ word, index: wi }]
          currentLineWidth = wordWidth
        } else {
          if (currentLine.length > 0) currentLineWidth += spaceWidth
          currentLine.push({ word, index: wi })
          currentLineWidth += wordWidth
        }
      })
      if (currentLine.length > 0) lines.push(currentLine)

      const lineHeight = textSizePx * 1.3
      const textTopPadding = outputHeight * 0.04
      let textY = textTopPadding

      lines.forEach((lineWords) => {
        // Calculate total line width for centering
        let lineWidth = 0
        lineWords.forEach((w, i) => {
          lineWidth += ctx.measureText(w.word).width
          if (i < lineWords.length - 1) lineWidth += spaceWidth
        })

        let x = (outputWidth - lineWidth) / 2
        lineWords.forEach((w, i) => {
          ctx.fillStyle = slide.wordColors[w.index] || textColor
          ctx.font = fontStr
          ctx.textAlign = 'left'
          ctx.fillText(w.word, x, textY)
          x += ctx.measureText(w.word).width
          if (i < lineWords.length - 1) x += spaceWidth
        })
        textY += lineHeight
      })

      const imageTop = textY + outputHeight * 0.02
      const imageHeight = outputHeight - imageTop

      // Draw uploaded image
      if (slide.image) {
        const img = new Image()
        img.onload = () => {
          // Cover fill: scale to fill the area, crop overflow
          const imgRatio = img.width / img.height
          const areaRatio = outputWidth / imageHeight
          let sx, sy, sw, sh
          if (imgRatio > areaRatio) {
            sh = img.height
            sw = img.height * areaRatio
            sx = (img.width - sw) / 2
            sy = 0
          } else {
            sw = img.width
            sh = img.width / areaRatio
            sx = 0
            sy = (img.height - sh) / 2
          }
          ctx.drawImage(img, sx, sy, sw, sh, 0, imageTop, outputWidth, imageHeight)
          resolve(canvas)
        }
        img.onerror = () => resolve(canvas)
        img.src = slide.image
      } else {
        resolve(canvas)
      }
    })
  }, [outputWidth, outputHeight, bgColor, useGradient, gradientColor2, gradientAngle, textColor, fontSize, fontWeight])

  const exportSingle = async (index) => {
    setExporting(true)
    try {
      const canvas = await renderToCanvas(slides[index])
      canvas.toBlob((blob) => {
        saveAs(blob, `screenshot_${index + 1}_${outputWidth}x${outputHeight}.png`)
        setExporting(false)
      }, 'image/png')
    } catch (err) {
      console.error('Export failed:', err)
      setExporting(false)
    }
  }

  const exportAll = async () => {
    setExporting(true)
    try {
      const zip = new JSZip()
      for (let i = 0; i < slides.length; i++) {
        const canvas = await renderToCanvas(slides[i])
        const dataUrl = canvas.toDataURL('image/png')
        zip.file(`screenshot_${i + 1}_${outputWidth}x${outputHeight}.png`, dataUrl.split(',')[1], { base64: true })
      }
      const content = await zip.generateAsync({ type: 'blob' })
      saveAs(content, `screenshots_${outputWidth}x${outputHeight}.zip`)
    } catch (err) {
      console.error('Export failed:', err)
    }
    setExporting(false)
  }

  const aspectRatio = outputWidth / outputHeight
  const previewH = 520
  const previewW = previewH * aspectRatio

  const activeSlideData = slides[activeSlide]
  const activeWords = activeSlideData ? activeSlideData.text.split(/\s+/).filter(Boolean) : []

  return (
    <div className="app">
      <header className="header">
        <h1>Screenshot Generator</h1>
        <p>Create screenshots for App Store & Google Play</p>
      </header>

      <div className="main-layout">
        {/* Controls */}
        <div className="controls-panel">
          <section className="control-section">
            <h3>Output Size</h3>
            <div className="preset-grid">
              {Object.keys(PRESETS).map((name) => (
                <button
                  key={name}
                  className={`preset-btn ${preset === name ? 'active' : ''}`}
                  onClick={() => handlePresetChange(name)}
                >
                  <span>{name}</span>
                  {name !== 'Custom' && <span className="preset-size">{PRESETS[name].width}x{PRESETS[name].height}</span>}
                </button>
              ))}
            </div>
            <div className="size-inputs">
              <div className="input-group">
                <label>Width (px)</label>
                <input type="number" value={outputWidth} onChange={(e) => { setOutputWidth(Number(e.target.value)); setPreset('Custom') }} min={100} max={4096} />
              </div>
              <span className="size-x">x</span>
              <div className="input-group">
                <label>Height (px)</label>
                <input type="number" value={outputHeight} onChange={(e) => { setOutputHeight(Number(e.target.value)); setPreset('Custom') }} min={100} max={4096} />
              </div>
            </div>
          </section>

          <section className="control-section">
            <h3>Background</h3>
            <div className="color-swatches">
              {BG_COLORS.map((c) => (
                <button key={c} className={`swatch ${bgColor === c ? 'active' : ''}`} style={{ backgroundColor: c }} onClick={() => setBgColor(c)} />
              ))}
            </div>
            <div className="input-group">
              <label>Custom Color</label>
              <div className="color-row">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                <input type="text" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="hex-input" />
              </div>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" checked={useGradient} onChange={(e) => setUseGradient(e.target.checked)} />
              Use Gradient
            </label>
            {useGradient && (
              <>
                <div className="input-group">
                  <label>Second Color</label>
                  <div className="color-row">
                    <input type="color" value={gradientColor2} onChange={(e) => setGradientColor2(e.target.value)} />
                    <input type="text" value={gradientColor2} onChange={(e) => setGradientColor2(e.target.value)} className="hex-input" />
                  </div>
                </div>
                <div className="input-group">
                  <label>Angle: {gradientAngle}deg</label>
                  <input type="range" min={0} max={360} value={gradientAngle} onChange={(e) => setGradientAngle(Number(e.target.value))} />
                </div>
              </>
            )}
          </section>

          <section className="control-section">
            <h3>Text Style</h3>
            <div className="input-group">
              <label>Default Color</label>
              <div className="color-row">
                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                <input type="text" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="hex-input" />
              </div>
            </div>
            <div className="input-group">
              <label>Size: {fontSize}%</label>
              <input type="range" min={2} max={10} step={0.5} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
            </div>
            <div className="input-group">
              <label>Weight</label>
              <select value={fontWeight} onChange={(e) => setFontWeight(e.target.value)}>
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="800">Extra Bold</option>
              </select>
            </div>

            {/* Per-word color */}
            <div className="word-color-section">
              <label className="input-label">Word Colors <span className="hint">(click a word to color it)</span></label>
              <div className="word-chips">
                {activeWords.map((word, i) => (
                  <button
                    key={i}
                    className={`word-chip ${selectedWord === i ? 'selected' : ''}`}
                    style={{
                      color: activeSlideData.wordColors[i] || textColor,
                      borderColor: selectedWord === i ? (activeSlideData.wordColors[i] || textColor) : 'transparent',
                    }}
                    onClick={() => setSelectedWord(selectedWord === i ? null : i)}
                  >
                    {word}
                  </button>
                ))}
              </div>
              {selectedWord !== null && selectedWord < activeWords.length && (
                <div className="word-color-picker">
                  <label className="input-label">Color for "{activeWords[selectedWord]}"</label>
                  <div className="color-swatches small">
                    {WORD_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`swatch small ${(activeSlideData.wordColors[selectedWord] || textColor) === c ? 'active' : ''}`}
                        style={{ backgroundColor: c }}
                        onClick={() => setWordColor(activeSlide, selectedWord, c)}
                      />
                    ))}
                  </div>
                  <div className="color-row">
                    <input
                      type="color"
                      value={activeSlideData.wordColors[selectedWord] || textColor}
                      onChange={(e) => setWordColor(activeSlide, selectedWord, e.target.value)}
                    />
                    <input
                      type="text"
                      value={activeSlideData.wordColors[selectedWord] || textColor}
                      onChange={(e) => setWordColor(activeSlide, selectedWord, e.target.value)}
                      className="hex-input"
                    />
                    <button className="reset-word-btn" onClick={() => setWordColor(activeSlide, selectedWord, null)}>
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="control-section">
            <h3>Export</h3>
            <button className="export-btn primary" onClick={() => exportSingle(activeSlide)} disabled={exporting}>
              {exporting ? 'Exporting...' : `Download Current (${outputWidth}x${outputHeight})`}
            </button>
            <button className="export-btn secondary" onClick={exportAll} disabled={exporting}>
              {exporting ? 'Exporting...' : `Download All as ZIP (${slides.length})`}
            </button>
          </section>
        </div>

        {/* Preview Area */}
        <div className="preview-panel">
          <div className="slides-row">
            {slides.map((slide, index) => (
              <div key={slide.id} className={`slide-card ${activeSlide === index ? 'active' : ''}`} onClick={() => setActiveSlide(index)}>
                <div className="slide-preview" style={{ width: previewW, height: previewH, background: getBg() }}>
                  {/* Title at top - editable */}
                  <div
                    className="slide-text"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => updateSlideText(index, e.target.innerText)}
                    style={{
                      fontSize: `${fontSize * 0.6 * previewH / 100}px`,
                      fontWeight,
                      color: textColor,
                    }}
                    dangerouslySetInnerHTML={{
                      __html: slide.text.split(/\s+/).filter(Boolean).map((word, i) =>
                        `<span style="color:${slide.wordColors[i] || textColor}">${word}</span>`
                      ).join(' ')
                    }}
                  />

                  {/* Image fills all remaining space */}
                  <div className="image-area">
                    {slide.image ? (
                      <img src={slide.image} alt="" className="full-image" />
                    ) : (
                      <div className="upload-zone">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(index, e)}
                          className="file-input"
                          id={`file-${slide.id}`}
                        />
                        <label htmlFor={`file-${slide.id}`} className="upload-label">
                          <span className="upload-icon">+</span>
                          <span>Drop screenshot here</span>
                          <span className="upload-hint">or click to browse</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {slide.image && (
                    <button className="btn-remove-img" onClick={(e) => { e.stopPropagation(); removeImage(index) }} title="Remove image">x</button>
                  )}
                  {slides.length > 1 && (
                    <button className="btn-remove-slide" onClick={(e) => { e.stopPropagation(); removeSlide(index) }}>Delete</button>
                  )}
                </div>
              </div>
            ))}

            <div className="add-slide" onClick={addSlide} style={{ width: previewW, height: previewH }}>
              <span className="add-icon">+</span>
              <span>Add Screenshot</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
