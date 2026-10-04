/**
 * Warn-Banner im Planen: Konflikte (Abwesenheit, Doppelbelegung) und offene
 * Slots der ganzen Woche (beide Zusammenkünfte). Reine Ableitung aus dem
 * State — kein eigener Zustand.
 */

import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { engpaesse, offenTrotzAllem } from '../data/bedarf'
import { fsWeekConflicts } from '../data/fs'
import { istAusgefallen, serviceQualKey } from '../data/helpers'
import { openSlotLabels, type Conflict } from '../data/planning'
import { useKonflikte } from './useKonflikte'
import { wochentagNameAusWd } from './wochentage'
import { privLabel } from '../personen/priv-label'
import type { MeetingKey, MeetingTab, QualificationKey } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'

/** "Wochenende"/"unter der Woche" für die Banner-Zeilen. */
function tabName(t: Dict, tab: MeetingTab | undefined): string {
  return tab === 'we' ? t.tabWe : t.tabMid
}

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

/** Konflikt-Banner der aktuellen Zusammenkunft (Abwesende, Doppelbelegung). */
export function ConflictsBanner({ tab }: { tab: MeetingKey }) {
  const { t } = useT()
  const { liste: conflicts } = useKonflikte(tab)
  if (conflicts.length === 0) return null

  /*
   * Alle Zeilen stehen da, ohne Aufklapper (T81). Der Schalter „+{n} weitere"
   * kürzte einzig die Serien — die gibt es nicht mehr, und was übrig ist, ist
   * jedes Mal wenig und jedes Mal wichtig.
   */
  const shownConflicts = [
    ...conflicts.filter((c) => c.kind === 'absent'),
    ...conflicts.filter((c) => c.kind === 'double'),
    ...conflicts.filter((c) => c.kind === 'helperTask'),
  ]

  const conflictText = (c: Conflict): string => {
    if (c.kind === 'absent') return fill(t.konfliktAbsent, { name: c.name, tab: tabName(t, c.tab) })
    if (c.kind === 'double')
      return fill(t.konfliktDouble, { name: c.name, n: c.count ?? 2, tab: tabName(t, c.tab) })
    return fill(t.konfliktHelperTask, { name: c.name, tab: tabName(t, c.tab) })
  }

  return (
    <div className="plan-banner-box plan-conflicts">
      <BannerKopf zeichen="!" titel={t.konflikteTitle} anzahl={conflicts.length} />
      {shownConflicts.map((c, i) => (
        <div key={i} className="plan-conflict-row">
          <span className="plan-conflict-dot" data-kind={c.kind} />
          <span className="plan-conflict-text">{conflictText(c)}</span>
        </div>
      ))}
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

/**
 * Banner der offenen (unbesetzten) Aufgaben/Hilfsdienste der aktuellen
 * Zusammenkunft. `tpw` übersetzt Programmpunkt-Titel in die Anzeigesprache.
 */
export function OpenSlotsBanner({ tab, tpw }: { tab: MeetingKey; tpw: (s: string) => string }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const rawWeek = state.weeks[state.week]
  /*
   * Gemerkt und **vor** den frühen Ausstiegen — der Wochenstreifen zeichnet
   * drei Wochen (vorige, aktuelle, nächste), und jeder Dispatch rendert sie
   * neu: ein Toast, der nach 2,4 Sekunden von selbst verschwindet, kostete
   * sonst drei volle Durchläufe über alle Plätze der Zusammenkunft.
   * Eine entfallende Woche hat nichts offen (T30).
   */
  const openSlots = useMemo(
    () =>
      rawWeek && !istAusgefallen(rawWeek, tab) ? openSlotLabels(rawWeek[tab], state.services) : [],
    [rawWeek, tab, state.services],
  )
  const openTotal = openSlots.reduce((sum, slot) => sum + slot.n, 0)
  if (openTotal === 0) return null

  return (
    <div className="plan-banner-box plan-open">
      <BannerKopf zeichen="?" titel={t.offeneTitle} anzahl={openTotal} />
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

/**
 * **Was gar nicht besetzbar ist** — nicht zu verwechseln mit „offene
 * Zuteilungen" darüber. Die sagen, was der Planer noch nicht getan hat; hier
 * steht, was er auch nicht tun *kann*: Für diesen Bereich sind an diesem Tag
 * weniger Leute da als Plätze zu besetzen sind.
 *
 * Ohne den Hinweis sucht er den Fehler bei sich oder bei der Auto-Zuteilung —
 * die lässt die Plätze nämlich kommentarlos offen, und warum, sieht man ihr
 * nicht an. Deshalb nennt jede Zeile auch den Grund: „8 von 10 fehlen".
 *
 * Steht **über** dem Offene-Zuteilungen-Banner: Es erklärt einen Teil von
 * dessen Zahl, und die Erklärung gehört vor die Aufzählung.
 */
export function EngpassBanner({ tab }: { tab: MeetingKey }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const abwesend = useAbwesend()
  const rawWeek = state.weeks[state.week]
  /*
   * Wie oben gemerkt: `engpaesse` läuft je Bereich zweimal über alle Personen
   * — bei 300 Personen und fünfzehn Bereichen rund 9 000 Schritte, mal drei
   * für den Wochenstreifen, bei jedem Dispatch.
   * Eine entfallende Woche hat nichts zu besetzen (T30).
   */
  const treffer = useMemo(
    () =>
      rawWeek && !istAusgefallen(rawWeek, tab)
        ? engpaesse(rawWeek[tab], state.services, state.persons, abwesend, state.week, tab)
        : [],
    [rawWeek, tab, state.services, state.persons, abwesend, state.week],
  )
  if (treffer.length === 0) return null

  /**
   * Beschriftung eines Bereichs: der Name des Hilfsdienstes, wie ihn die
   * Versammlung angelegt hat (`tu`, denn er ist Datum, kein UI-Text), sonst
   * die feste Bereichs-Beschriftung aus dem Wörterbuch.
   */
  const bereichName = (key: string): string => {
    const svc = state.services.find((s) => serviceQualKey(s.key) === key)
    if (svc) return tu(svc.name)
    return privLabel(t, key as QualificationKey)
  }

  return (
    <div className="plan-banner-box plan-engpass">
      <BannerKopf zeichen="!" titel={t.engpassTitle} anzahl={offenTrotzAllem(treffer)} />
      {treffer.map((e) => (
        <div key={e.key} className="plan-conflict-row">
          <span className="plan-conflict-dot" data-kind="engpass" />
          <span className="plan-conflict-text">
            {fill(t.engpassZeile, {
              bereich: bereichName(e.key),
              b: e.benoetigt,
              v: e.verfuegbar,
              a: e.qualifiziert - e.verfuegbar,
              q: e.qualifiziert,
            })}
          </span>
        </div>
      ))}
    </div>
  )
}
