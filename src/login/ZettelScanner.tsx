import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useT'
import { leserFuer } from './qr-leser'

/** So oft wird ein Bild gelesen. Öfter bringt nichts und kostet am Handy Akku. */
const TAKT_MS = 150

/**
 * **Den Zettel scannen** (T121, Phase 8): die Kamera, darüber ein Rahmen, und
 * sobald ein QR-Code darin steht, geht sein Text an `onGefunden`. Was er
 * bedeutet, entscheidet der Aufrufer — hier wird nichts geöffnet.
 *
 * Eigene Datei, nachgeladen: Wer nie scannt, lädt weder sie noch `jsqr`.
 */
export default function ZettelScanner({ onGefunden, onAbbrechen }: { onGefunden: (text: string) => void; onAbbrechen: () => void }) {
  const { t } = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [kameraFehlt, setKameraFehlt] = useState(false)
  // Der Rückruf ändert sich mit jedem Zeichnen; die Kamera soll nicht jedes Mal neu starten.
  const gefunden = useRef(onGefunden)
  gefunden.current = onGefunden

  useEffect(() => {
    let aus = false
    let strom: MediaStream | null = null
    let wecker: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      try {
        strom = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch {
        if (!aus) setKameraFehlt(true)
        return
      }
      const video = videoRef.current
      if (aus || !video) {
        strom.getTracks().forEach((spur) => spur.stop())
        return
      }
      video.srcObject = strom
      await video.play().catch(() => {})
      const lesen = await leserFuer()
      const leinwand = document.createElement('canvas')
      const schritt = async (): Promise<void> => {
        if (aus) return
        const text = video.readyState >= 2 ? await lesen(video, leinwand) : null
        if (aus) return
        if (text) {
          gefunden.current(text)
          return
        }
        wecker = setTimeout(() => void schritt(), TAKT_MS)
      }
      void schritt()
    })()
    return () => {
      aus = true
      clearTimeout(wecker)
      strom?.getTracks().forEach((spur) => spur.stop())
    }
  }, [])

  return (
    <div className="scanner">
      {kameraFehlt ? (
        <p className="feld-fehler" role="alert">
          {t.kameraFehlt}
        </p>
      ) : (
        <>
          <div className="scanner-bild">
            {/* Stumm und inline: Sonst spielt das iPhone es nur im Vollbild ab. */}
            <video ref={videoRef} className="scanner-video" muted playsInline aria-label={t.zettelScannen} />
            <span className="scanner-rahmen" aria-hidden="true" />
          </div>
          <p className="klein-text">{t.scannenHinweis}</p>
        </>
      )}
      <button type="button" className="knopf-leise" onClick={onAbbrechen}>
        {t.abbrechen}
      </button>
    </div>
  )
}
