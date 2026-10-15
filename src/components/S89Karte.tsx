import { Zeichen } from '../bausteine/Zeichen'
import { useT } from '../i18n/useT'
import type { S89Payload } from '../data/types'

/**
 * Der Inhalt eines S-89-Zettels — Zeilen und Fußnote, ohne Rahmenwerk.
 *
 * Zwei Stellen zeigen ihn: das Blatt aus „Meine Aufgaben" und dem Zuteilen
 * (`S89Sheet`) und der Druckbogen (`druck/S89Druck`). Sie unterscheiden sich in
 * dem, was **um** den Zettel steht — im Zettel selbst dürfen sie sich nicht
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
        {/*
          Der Ort wie auf dem Formular: beide Räume, der richtige angekreuzt
          (Entwurf `GDruckS89`). Bis 2026-08 stand hier die Konstante
          „Hauptsaal" — auf jedem Zettel, auch wenn der Teil in der
          Zusätzlichen Klasse stattfand. Vorgelesen wird nur der angekreuzte.
        */}
        <div className="s89-row s89-row--ort">
          <div className="s89-label">{t.s89Ort}</div>
          <div className="s89-value s89-orte">
            <Ort an={!payload.aux}>{t.auxHauptsaal}</Ort>
            <Ort an={payload.aux === true}>{t.auxKlasse}</Ort>
          </div>
        </div>
      </div>
      <p className="s89-note">{t.s89Note}</p>
    </>
  )
}

function Ort({ an, children }: { an: boolean; children: string }) {
  return (
    <span className={an ? 's89-ort is-an' : 's89-ort'} aria-hidden={an ? undefined : true}>
      <span className="s89-ort-zeichen">{an && <Zeichen name="haken" />}</span>
      {children}
    </span>
  )
}
