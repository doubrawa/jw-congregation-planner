/**
 * Warn-Banner im Planen: Konflikte (Abwesenheit, Doppelbelegung, Serien) und
 * offene Slots der ganzen Woche (beide Zusammenkünfte). Reine Ableitung aus dem
 * State — kein eigener Zustand.
 */

import { useState } from 'react'
import { useApp } from '../app/context'
import { fsDate, fsWeekConflicts } from '../data/fs'
import { istAusgefallen } from '../data/helpers'
import { openSlotLabels, type Conflict } from '../data/planning'
import { useKonflikte } from './useKonflikte'
import type { MeetingKey, MeetingTab } from '../data/types'
import { LOCALES } from '../i18n/langs'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'

/** "Wochenende"/"unter der Woche" für die Banner-Zeilen. */
function tabName(t: Dict, tab: MeetingTab | undefined): string {
  return tab === 'we' ? t.tabWe : t.tabMid
}

/** Serien-Konflikte (streak) auf so viele Zeilen begrenzen; Rest → „+N weitere". */
const STREAK_SHOWN = 2

/** Konflikt-Banner der aktuellen Zusammenkunft (Abwesende, Doppelbelegung, Serien). */
export function ConflictsBanner({ tab }: { tab: MeetingKey }) {
  const { t } = useT()
  const { liste: conflicts } = useKonflikte(tab)
  // Aufgeklappt bleibt es, bis der Planer wieder zuklappt — auch über den
  // Wochenwechsel hinweg. Wer die vollständige Liste sehen wollte, will sie
  // in der nächsten Woche meist auch.
  const [offen, setOffen] = useState(false)
  if (conflicts.length === 0) return null

  const reihenfolge = [
    ...conflicts.filter((c) => c.kind === 'absent'),
    ...conflicts.filter((c) => c.kind === 'double'),
    ...conflicts.filter((c) => c.kind === 'streak'),
    ...conflicts.filter((c) => c.kind === 'helperTask'),
  ]
  // Gekürzt wird nur bei den Serien: sie sind die häufigsten und die am
  // wenigsten dringenden. Ausgelassen wird nichts mehr — der Rest steht eine
  // Berührung weiter.
  const gekuerzt = [
    ...conflicts.filter((c) => c.kind === 'absent'),
    ...conflicts.filter((c) => c.kind === 'double'),
    ...conflicts.filter((c) => c.kind === 'streak').slice(0, STREAK_SHOWN),
    ...conflicts.filter((c) => c.kind === 'helperTask'),
  ]
  const shownConflicts = offen ? reihenfolge : gekuerzt
  const hiddenConflicts = conflicts.length - gekuerzt.length

  const conflictText = (c: Conflict): string => {
    if (c.kind === 'absent') return fill(t.konfliktAbsent, { name: c.name, tab: tabName(t, c.tab) })
    if (c.kind === 'double')
      return fill(t.konfliktDouble, { name: c.name, n: c.count ?? 2, tab: tabName(t, c.tab) })
    if (c.kind === 'helperTask')
      return fill(t.konfliktHelperTask, { name: c.name, tab: tabName(t, c.tab) })
    return fill(t.konfliktStreak, { name: c.name, n: c.count ?? 3 })
  }

  return (
    <div className="plan-conflicts">
      <div className="plan-banner-head">
        <span className="plan-banner-badge">!</span>
        <span className="plan-banner-title">{t.konflikteTitle}</span>
        <span className="plan-banner-count">{conflicts.length}</span>
      </div>
      {shownConflicts.map((c, i) => (
        <div key={i} className="plan-conflict-row">
          <span className="plan-conflict-dot" data-kind={c.kind} />
          <span className="plan-conflict-text">{conflictText(c)}</span>
        </div>
      ))}
      {hiddenConflicts > 0 && (
        /*
         * Die Zeile war bisher toter Text: sie nannte eine Zahl und ließ den
         * Planer damit stehen. Jetzt klappt sie die übrigen Serien auf.
         * Beschriftung bleibt `konfMehr` — auch aufgeklappt sagt sie, worum es
         * bei diesen Zeilen geht; die Richtung des Winkels sagt den Zustand,
         * `aria-expanded` sagt ihn den Vorlesern.
         */
        <button
          type="button"
          className={offen ? 'plan-conflict-more is-open' : 'plan-conflict-more'}
          aria-expanded={offen}
          onClick={() => setOffen((v) => !v)}
        >
          {fill(t.konfMehr, { n: hiddenConflicts })}
          <span className="plan-conflict-chev" aria-hidden="true">
            ›
          </span>
        </button>
      )}
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
    state.fsBase,
    onlyGroup,
  )
  if (conflicts.length === 0) return null

  const wochentag = (wd: number | undefined): string =>
    wd === undefined || !state.fsBase
      ? ''
      : fsDate(state.fsBase, 0, wd).toLocaleDateString(LOCALES[state.lang], { weekday: 'long' })

  const text = (c: Conflict): string => {
    if (c.kind === 'fsAbsent') {
      const wo = [wochentag(c.wd), c.ort].filter(Boolean).join(' · ')
      return fill(t.konfliktAbsent, { name: c.name, tab: wo })
    }
    return [c.name, t.sheetSchonHeute, wochentag(c.wd)].filter(Boolean).join(' · ')
  }

  return (
    <div className="plan-conflicts">
      <div className="plan-banner-head">
        <span className="plan-banner-badge">!</span>
        <span className="plan-banner-title">{t.konflikteTitle}</span>
        <span className="plan-banner-count">{conflicts.length}</span>
      </div>
      {conflicts.map((c, i) => (
        <div key={i} className="plan-conflict-row">
          <span className="plan-conflict-dot" data-kind={c.kind} />
          <span className="plan-conflict-text">{text(c)}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Banner der offenen (unbesetzten) Aufgaben/Hilfsdienste der aktuellen
 * Zusammenkunft. `tpw` übersetzt Programmpunkt-Titel in die Anzeigesprache.
 */
export function OpenSlotsBanner({ tab, tpw }: { tab: MeetingKey; tpw: (s: string) => string }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const rawWeek = state.weeks[state.week]
  if (!rawWeek) return null

  if (istAusgefallen(rawWeek, tab)) return null // entfällt → nichts offen (T30)

  const openSlots = openSlotLabels(rawWeek[tab], state.services)
  const openTotal = openSlots.reduce((sum, slot) => sum + slot.n, 0)
  if (openTotal === 0) return null

  return (
    <div className="plan-open">
      <div className="plan-banner-head">
        <span className="plan-banner-badge">?</span>
        <span className="plan-banner-title">{t.offeneTitle}</span>
        <span className="plan-banner-count">{openTotal}</span>
      </div>
      {openSlots.map((slot, i) => (
        <div key={i} className="plan-open-row">
          <span className="plan-open-label" dir="auto">
            {slot.lang === 'u' ? tu(slot.text) : tpw(slot.text)}
            {/* Die Rolle kommt aus dem Wörterbuch des Lesers, der Titel aus dem
                der Versammlung — deshalb getrennt übersetzt und erst hier
                zusammengesetzt (siehe OpenSlot.rolle). */}
            {slot.rolle ? ` · ${tu(slot.rolle)}` : ''}
            {slot.n > 1 ? ` ×${slot.n}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
