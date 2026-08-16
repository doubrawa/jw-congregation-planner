import { useT } from '../i18n/useT'
import type { S89Payload } from '../data/types'

/**
 * Der Inhalt eines S-89-Zettels — Zeilen und Fußnote, ohne Rahmenwerk.
 *
 * Zwei Stellen zeigen ihn: das Sheet aus „Meine Aufgaben" (`S89Sheet`) und der
 * Druckbogen des Planers (`planen/S89Bogen`). Sie unterscheiden sich in dem, was
 * **um** den Zettel steht — im Zettel selbst dürfen sie sich nicht
 * unterscheiden, sonst zeigt das Papier etwas anderes als der Bildschirm.
 */
export function S89Karte({ payload }: { payload: S89Payload }) {
  const { t, tp } = useT()
  const rows: Array<[string, string]> = [
    [t.s89Name, payload.name],
    ...(payload.partner ? ([[t.s89Partner, payload.partner]] as [string, string][]) : []),
    [t.s89Datum, tp(payload.date)],
    [t.s89Aufgabe, tp(payload.type)],
    ...(payload.point ? ([[t.s89Punkt, tp(payload.point)]] as [string, string][]) : []),
    // Der Ort stand hier bis 2026-08 als Konstante „Hauptsaal" — auf jedem
    // Zettel, auch wenn der Teil in der Zusätzlichen Klasse stattfand.
    [t.s89Ort, payload.aux ? t.auxKlasse : t.auxHauptsaal],
  ]

  return (
    <>
      <div className="s89-box">
        {rows.map(([label, value]) => (
          <div key={label} className="s89-row">
            <div className="s89-label">{label}</div>
            <div className="s89-value">{value}</div>
          </div>
        ))}
      </div>
      <p className="s89-note">{t.s89Note}</p>
    </>
  )
}
