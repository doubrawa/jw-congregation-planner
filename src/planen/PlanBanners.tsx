/**
 * Warn-Banner im Planen der Treffpunkte, Besuche und Schichten. Reine
 * Ableitung aus dem State — kein eigener Zustand.
 *
 * Die Banner der Zusammenkünfte (Konflikte, nicht besetzbar, offene
 * Zuteilungen) stehen seit T121 in der Besetzung der Woche (`BesetzungKarte`)
 * unter „Zu klären".
 */

import { useApp } from '../app/context'
import { fsWeekConflicts } from '../data/fs'
import type { Conflict } from '../data/planning'
import { wochentagNameAusWd } from './wochentage'
import { fill, useT } from '../i18n/useT'

/**
 * Kopfzeile eines Banners: Zeichen (`!` Konflikt, `?` offen), Titel und Zahl.
 * Fünf Banner trugen dieselben drei Zeilen — hier stehen sie einmal.
 */
export function BannerKopf({ zeichen, titel, anzahl }: { zeichen: '!' | '?'; titel: string; anzahl: number }) {
  return (
    <div className="plan-banner-head">
      <span className="plan-banner-badge">{zeichen}</span>
      <span className="plan-banner-title">{titel}</span>
      <span className="plan-banner-count">{anzahl}</span>
    </div>
  )
}

/**
 * Konflikt-Banner der Treffpunkte — eigenes Banner, weil Treffpunkte eine
 * eigene Datenquelle sind und im Predigtdienst-Reiter stehen, nicht bei den
 * Zusammenkünften.
 *
 * Die Texte kommen ohne neue Wörterbuch-Schlüssel aus: `konfliktAbsent` passt
 * wörtlich (nur die Ortsangabe tritt an die Stelle der Zusammenkunft), und die
 * Doppelbelegung setzt sich aus `sheetSchonHeute` zusammen. Ein neuer Schlüssel
 * hieße 34 Übersetzungen — und eine erfundene ist schlimmer als eine
 * zusammengesetzte aus geprüften Bausteinen.
 */
export function FsConflictsBanner({ onlyGroup }: { onlyGroup: string | null }) {
  const { state } = useApp()
  const { t } = useT()
  const conflicts = fsWeekConflicts(
    state.fsWeeks,
    state.week,
    state.persons,
    state.absences,
    state.weeks[state.week]?.start ?? '',
    onlyGroup,
  )
  if (conflicts.length === 0) return null

  const wochentag = (wd: number | undefined): string =>
    wd === undefined ? '' : wochentagNameAusWd(wd, state.lang)

  const text = (c: Conflict): string => {
    if (c.kind === 'fsAbsent') {
      const wo = [wochentag(c.wd), c.ort].filter(Boolean).join(' · ')
      return fill(t.konfliktAbsent, { name: c.name, tab: wo })
    }
    return [c.name, t.sheetSchonHeute, wochentag(c.wd)].filter(Boolean).join(' · ')
  }

  return (
    <div className="plan-banner-box plan-conflicts">
      <BannerKopf zeichen="!" titel={t.konflikteTitle} anzahl={conflicts.length} />
      {conflicts.map((c, i) => (
        <div key={i} className="plan-conflict-row">
          <span className="plan-conflict-dot" data-kind={c.kind} />
          <span className="plan-conflict-text">{text(c)}</span>
        </div>
      ))}
    </div>
  )
}
