import { useState } from 'react'
import { copyText } from '../lib/clipboard'
import { gestenLoeschen, gestenProtokollText } from '../lib/gesture-log'

/**
 * Versteckte Gesten-Diagnose: zeigt, was bei den letzten Wischbewegungen auf
 * DIESEM Gerät tatsächlich passiert ist.
 *
 * Grund für die Existenz: Gesten lassen sich am Rechner nur nachbilden. Ein
 * Wisch, der in Chrome mit Handy-Emulation sauber durchläuft, kann auf einem
 * Android-Handy abbrechen, weil der Browser die Bewegung fürs Scrollen
 * übernimmt. Ohne dieses Protokoll bleibt nur Raten.
 *
 * Eigene Datei, obwohl es im Profil erscheint: Das Profil ist eine
 * Nutzeroberfläche (übersetzt, barrierefrei), das hier ein Werkzeug für die
 * Fehlersuche (unübersetzt, bewusst schwer erreichbar). Zwei Gründe zu ändern
 * gehören nicht in dieselbe Datei — und die nächste Diagnose landet sonst nach
 * demselben Muster ebenfalls dort.
 *
 * Sichtbar erst nach fünf Antippern auf die Build-Zeile: Sie geht niemanden
 * außer der Fehlersuche etwas an, soll aber ohne Sonderfassung erreichbar sein.
 */
export function Diagnose() {
  const [tipps, setTipps] = useState(0)
  return (
    <>
      <p className="prof-build" onClick={() => setTipps((n) => n + 1)}>
        Build {__BUILD_ID__}
      </p>
      {tipps >= 5 && <Protokoll />}
    </>
  )
}

/** Der Protokolltext selbst — unübersetzt, er wird kopiert und weitergegeben. */
function Protokoll() {
  const [text, setText] = useState(gestenProtokollText)
  const [kopiert, setKopiert] = useState(false)
  const zeigen = () => setText(gestenProtokollText())
  return (
    <div className="prof-diag">
      <pre className="prof-diag-text">{text}</pre>
      <div className="prof-diag-btns">
        <button type="button" className="btn-outline" onClick={zeigen}>
          Aktualisieren
        </button>
        <button type="button" className="btn-outline" onClick={() => void copyText(text).then(setKopiert)}>
          {kopiert ? 'Kopiert' : 'Kopieren'}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            gestenLoeschen()
            zeigen()
          }}
        >
          Leeren
        </button>
      </div>
    </div>
  )
}
