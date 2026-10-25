/**
 * **Die Kopfzeile** (T121, Baustein `GKopf`) am Handy und am Tablet: links
 * der Menüknopf, dann Datum und Versammlung, rechts die Glocke. Am Desktop
 * gibt es keine — dort stehen Menü und Mitteilungen in der Leiste. Am Tablet
 * steht der Menüknopf in der schmalen Leiste, hier fällt er weg (CSS).
 *
 * Am Handy weicht sie zwei anderen Köpfen: beim Planen dem Kopf des Planens
 * (Kreuz, Titel, „Fertig", `PlanenKopf`), auf einer Unterseite wie den
 * Mitteilungen dem Kopf mit Zurück (`UnterseiteKopf`).
 */

import type { ReactNode } from 'react'
import { Zeichen } from '../bausteine/Zeichen'
import { fill, useT } from '../i18n/useT'
import '../bausteine/bausteine.css'
import './menue.css'

export function Kopfzeile({
  datum,
  versammlung,
  ungelesen,
  menueOffen,
  amHandyErsetzt,
  onMenue,
  onGlocke,
}: {
  /** „Montag, 7. September" */
  datum: string
  versammlung: string
  ungelesen: number
  menueOffen: boolean
  /** Am Handy steht ein anderer Kopf da (Planen, Unterseite). */
  amHandyErsetzt: boolean
  onMenue: () => void
  onGlocke: () => void
}) {
  const { t } = useT()
  const glocke = ungelesen > 0 ? `${t.mitteilungen}, ${fill(t.neuN, { n: ungelesen })}` : t.mitteilungen
  return (
    <header className={amHandyErsetzt ? 'kopfzeile kopfzeile--ersetzt' : 'kopfzeile'}>
      <button
        type="button"
        className="rund-knopf kopfzeile-menue"
        aria-label={t.menueLbl}
        aria-expanded={menueOffen}
        onClick={onMenue}
      >
        <Zeichen name="menue" />
      </button>
      <div className="kopfzeile-mitte">
        <span className="kopfzeile-datum">{datum}</span>
        <span className="kopfzeile-versammlung" dir="auto">
          {versammlung}
        </span>
      </div>
      <button type="button" className="rund-knopf kopfzeile-glocke" aria-label={glocke} onClick={onGlocke}>
        <Zeichen name="glocke" />
        {ungelesen > 0 && <span className="kopfzeile-neu" aria-hidden="true" />}
      </button>
    </header>
  )
}

/**
 * Der Kopf des Planens am Handy (Baustein `kopfPlanen`): Kreuz und „Fertig"
 * beenden beide das Planen — das Kreuz für die Gewohnheit, „Fertig" als Wort.
 */
export function PlanenKopf({ titel, onBeenden }: { titel: string; onBeenden: () => void }) {
  const { t } = useT()
  return (
    <header className="planenkopf">
      <button type="button" className="rund-knopf" aria-label={t.planenBeenden} onClick={onBeenden}>
        <Zeichen name="kreuz" />
      </button>
      <h1 className="planenkopf-titel">{titel}</h1>
      <button type="button" className="planen-knopf" onClick={onBeenden}>
        {t.fertig}
      </button>
    </header>
  )
}

/**
 * Der Kopf einer Unterseite am Handy (Entwurf `GMitteilungen`): Zurück wie die
 * Zurück-Taste (`zurueckWieDieTaste`) — von den Mitteilungen zu Start, unter
 * „Planung" eine Ebene hinauf (T144) —, rechts steht, was die Seite anbietet.
 * Ab dem Tablet steht wieder die Kopfzeile da.
 *
 * `titel` steht neben Zurück (Entwurf `kopfZurueck`): unter „Planung" der
 * Bereich, dessen Titelzeile am Handy fehlt (`Bereichstitel`; Betreiber
 * 25.10.2026: „die überschrift … sollte oben rechts vom zurück button sein").
 * Die Mitteilungen tragen ihren Titel groß auf der Seite.
 */
export function UnterseiteKopf({
  titel,
  onZurueck,
  children,
}: {
  titel?: string
  onZurueck: () => void
  children?: ReactNode
}) {
  const { t } = useT()
  return (
    <header className="unterseitenkopf">
      <button type="button" className="rund-knopf" aria-label={t.a11yZurueck} onClick={onZurueck}>
        <Zeichen name="zurueck" />
      </button>
      {titel && <h1 className="unterseitenkopf-titel">{titel}</h1>}
      {children}
    </header>
  )
}
