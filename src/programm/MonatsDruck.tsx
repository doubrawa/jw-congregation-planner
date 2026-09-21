import { createContext, useContext, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { MitWoche } from '../components/WeekStrip'
import { useT } from '../i18n/useT'
import { monatsName, wochenDesMonats } from './druck'
import './print-monat.css'

/**
 * **Den ganzen Monat drucken** (T105) — für den Aushang.
 *
 * Gedruckt wird jede Woche des Monats (`wochenDesMonats`) **mit demselben
 * Baustein, der auch die einzelne Woche druckt**: dieselben Bereiche, dieselben
 * Namen, dieselben Regeln aus `print.css` — nur mehrfach hintereinander. Ein
 * eigenes Monatsblatt liefe sonst mit der Zeit vom Wochen-Ausdruck weg, und es
 * gäbe zwei Stellen, an denen man einen Fehler auf dem Papier suchen müsste.
 *
 * Am Bildschirm ist der Block unsichtbar; er erscheint nur im Druck, und nur
 * unter dem Kennzeichen `data-print="monat"` (`print-monat.css`). Er entsteht
 * erst beim Klick und verschwindet wieder, wenn der Druckdialog durch ist —
 * fünf Wochen Programm im DOM, die niemand sieht, sollen nicht dauernd
 * mitlaufen.
 */
export function MonatsDruck({ monat, children }: { monat: string; children: ReactNode }) {
  const { state } = useApp()
  const { t } = useT()
  const wochen = wochenDesMonats(state.weeks, monat)
  const reiter = state.tab === 'we' ? t.tabWe : state.tab === 'fs' ? t.fsShort : t.tabMid
  return (
    <div
      className={state.tab === 'mid' ? 'monat-druck monat-druck--seitenweise' : 'monat-druck'}
      aria-hidden="true"
      inert
    >
      <div className="monat-kopf">
        <span>{state.congregation.name}</span>
        <span>
          {reiter} · {monatsName(monat, state.lang)}
        </span>
      </div>
      {wochen.map((wi) => (
        <div key={state.weeks[wi]?.start ?? wi} className="monat-woche">
          <MitWoche week={wi}>{children}</MitWoche>
        </div>
      ))}
    </div>
  )
}

/**
 * Wer den Monat drucken lässt — gesetzt vom Programm-Bildschirm, gerufen aus
 * der Druck-Auswahl in einer der drei Wochen des Streifens.
 *
 * Ein Kontext statt einer Eigenschaft: Zwischen Bildschirm und Knopf liegen
 * der Wochenstreifen (der seinen Inhalt dreimal zeichnet) und je nach Reiter
 * zwei verschiedene Bausteine. Ohne Bildschirm dahinter — etwa in einem Test,
 * der nur die Woche rendert — gibt es keinen Monatsdruck, und die Auswahl
 * bietet ihn nicht an.
 */
export const MonatDruckenContext = createContext<((monat: string) => void) | null>(null)

export function useMonatDrucken(): ((monat: string) => void) | null {
  return useContext(MonatDruckenContext)
}
