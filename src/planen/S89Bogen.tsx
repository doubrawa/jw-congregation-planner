import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { S89Karte } from '../components/S89Karte'
import { alleS89DerWoche } from '../data/planning'
import { useT } from '../i18n/useT'
import { seiten } from './s89-seiten'
import './print-s89.css'

/**
 * Druckbogen der S-89-Zettel einer Woche — 4 oder 6 auf ein A4 (T71).
 *
 * Auf dem Bildschirm steht nur die Leiste mit der Zahl und dem Knopf; der Bogen
 * selbst ist unsichtbar und erscheint erst im Druck (`print-s89.css`). So
 * braucht es keine zweite Ansicht, die man pflegen müsste, und was auf dem
 * Papier steht, ist derselbe Baustein wie im Sheet (`S89Karte`).
 *
 * **Warum ein Kennzeichen am Wurzelelement statt einfach `@media print`:** Das
 * Programm hat seinen eigenen Ausdruck (`programm/print.css`). Zwei Regelwerke,
 * die beide „alles außer mir ausblenden" sagen, hebeln sich gegenseitig aus.
 * `data-print="s89"` sagt, welcher der beiden gemeint ist — gesetzt beim Klick,
 * abgeräumt, wenn der Druckdialog durch ist (`afterprint`).
 *
 * **Gedruckt wird die Woche, die gerade offen ist** — dieselbe Regel wie beim
 * Programm-Ausdruck. Schulungsaufgaben gibt es nur unter der Woche; der Bogen
 * hängt deshalb nicht am Reiter.
 */
export function S89Bogen() {
  const { state } = useApp()
  const { t } = useT()
  const [proSeite, setProSeite] = useState<4 | 6>(6)
  const zettel = alleS89DerWoche(state.weeks, state.week, state.congregation.meetings)

  // Nach dem Druck das Kennzeichen wieder weg — sonst druckte der nächste
  // Ctrl+P-Versuch im Programm still die Zettel.
  useEffect(() => {
    const auf = () => {
      delete document.documentElement.dataset.print
    }
    window.addEventListener('afterprint', auf)
    return () => {
      window.removeEventListener('afterprint', auf)
      auf()
    }
  }, [])

  if (zettel.length === 0) return null

  const drucken = () => {
    document.documentElement.dataset.print = 's89'
    window.print()
  }

  return (
    <>
      <div className="panel panel--pb14 s89-druck" data-farbe="neutral2">
        <h2 className="panel-label">S-89</h2>
        <div className="s89-druck-row">
          {/* „6 × S-89" statt eines Satzes: Die Zahl und der Formularname sagen
              es in jeder Sprache, ohne einen neuen Wörterbuch-Schlüssel (der
              hieße 34 Übersetzungen). */}
          <span className="s89-druck-count">{zettel.length} × S-89</span>
          <div className="s89-druck-ctl" role="group" aria-label={t.drucken}>
            {/* Die Zahlen sprechen für sich — der Knopf daneben sagt, wozu. */}
            {([4, 6] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={proSeite === n ? 's89-druck-n is-active' : 's89-druck-n'}
                aria-pressed={proSeite === n}
                onClick={() => setProSeite(n)}
              >
                {n}
              </button>
            ))}
            <button type="button" className="s89-druck-btn" onClick={drucken}>
              {t.drucken}
            </button>
          </div>
        </div>
      </div>

      {/*
        Je Blatt eine Tabelle (siehe `seiten`), `role="presentation"` und
        `aria-hidden`: Dieser Bogen ist nur für Papier da — am Bildschirm zeigt
        ihn niemand, und in der Vorlese-Reihenfolge hätte er nichts zu suchen.
      */}
      <div className="s89-bogen" data-pro-seite={proSeite} aria-hidden="true">
        {seiten(zettel, proSeite).map((reihen, si) => (
          <table key={si} className="s89-seite" role="presentation">
            <tbody>
              {reihen.map((reihe, ri) => (
                <tr key={ri}>
                  {reihe.map((z, ci) => (
                    <td key={ci}>
                      {z && (
                        <div className="s89-zettel">
                          <div className="s89-eyebrow">S-89</div>
                          <S89Karte payload={z} />
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </>
  )
}
