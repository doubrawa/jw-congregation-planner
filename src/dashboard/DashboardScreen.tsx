import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { fsWeekConflicts, fsWochenKennungen } from '../data/fs'
import { currentWeekIndex, meetingDateText } from '../data/meeting-dates'
import { istAusgefallen, MEETING_TABS } from '../data/helpers'
import { assignmentsInMeeting, countOpenSlots, weekConflicts } from '../data/planning'
import { LOCALES } from '../i18n/langs'
import { relativeDayLabel } from '../i18n/relative-time'
import { aufgabenLabel, fill, useT } from '../i18n/useT'
import type { MeetingKey } from '../data/types'
import './dashboard.css'

/**
 * Start (Screen 1, Landeseite nach dem Login): bündelt das Wichtigste — Gruß,
 * die eigene nächste Aufgabe (mit Bestätigen/S-89), die aktuelle Woche im
 * Überblick, Mitteilungen und offene Bestätigungen. Planer sehen zusätzlich
 * eine Kachel mit offenen Zuteilungen und Konflikten der laufenden Woche.
 * Ruhiger „Programmheft-Deckblatt"-Stil (Vorschlag 1a).
 */
export function DashboardScreen() {
  const { state, dispatch } = useApp()
  const abwesend = useAbwesend()
  const i18n = useT()
  const { t, tu, tp } = i18n
  const me = state.persons.find((p) => p.id === state.personId)

  // Tageszeit-Gruß + lokalisiertes Datum (Wochentag · Tag · Monat, Großbuchstaben).
  const hour = new Date().getHours()
  const gruss = hour < 11 ? t.grussMorgen : hour < 18 ? t.grussTag : t.grussAbend
  const heute = new Date()
    .toLocaleDateString(LOCALES[state.lang], { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  const nextTask = state.myTasks[0] ?? null
  // Live-Countdown aus dem echten Datum (Intl); im Demo-Modus der feste Chip-Text.
  const nextChip = nextTask
    ? nextTask.at != null
      ? relativeDayLabel(nextTask.at, state.lang)
      : tu(nextTask.chip)
    : ''
  const unread = state.notifs.filter((n) => !n.read).length
  const toConfirm = state.myTasks.filter((task) => task.status === 'offen').length

  // Aktuelle Woche für „Diese Woche" + Planer-Kachel; Fallback auf die gerade
  // gewählte Woche, falls heute in keine geladene Woche fällt. Gerechnet, nicht
  // aus `week.current` gelesen: das Flag setzt nur der Demo-Datensatz und wird
  // nie nachgeführt — die Konfliktzahl stand deshalb dauerhaft auf 0.
  const curIdx = currentWeekIndex(state.weeks)
  // Der Index wird mitgeführt, nicht nur die Woche: `meetingDateText` rechnet
  // den Termin aus Startdatum und Wochentag und braucht dafür beides.
  const weekIdx = curIdx >= 0 ? curIdx : state.week
  const week = state.weeks[weekIdx] ?? null

  const shortDate = (s: string): string => tp(s).split(' · ').slice(0, 2).join(' · ')

  /**
   * Termin einer Zusammenkunft — **gerechnet**, nicht aus dem `date`-Feld
   * gelesen.
   *
   * Importierte Wochen tragen dort nur die Wochenspanne („7.–13. September"),
   * denn die Überschrift der jw.org-Seite nennt weder Wochentag noch Uhrzeit.
   * Hier stand `meeting.date` roh, und damit las „Diese Woche" zweimal
   * dieselbe Zeile: „unter der Woche · 7.–13. September" und daneben
   * „Wochenende · 7.–13. September". Genau dafür gibt es `meetingDateText`;
   * „Meine Aufgaben", das S-89-Formular, das Programm und die Erinnerungen
   * gehen längst darüber. Wochen mit eigenem Termin im `date`-Feld (Demo,
   * Gedächtnismahl) sind unberührt — der gilt dort weiterhin.
   */
  const meetingDate = (tab: MeetingKey): string =>
    week ? shortDate(meetingDateText(week, weekIdx, tab, state.congregation.meetings)) : ''

  // Entfallene Zusammenkünfte zählen nicht mit (T30): ihre Plätze sind nicht
  // „offen", sie werden gar nicht gebraucht. Sonst stünde auf dem Start-Bildschirm
  // eine Zahl, die niemand abarbeiten kann.
  const openSlots = week
    ? MEETING_TABS.reduce(
        (n, tab) => n + (istAusgefallen(week, tab) ? 0 : countOpenSlots(week[tab], state.services)),
        0,
      )
    : 0
  // Treffpunkte zählen mit: für den Planer ist „3 mögliche Konflikte" eine
  // Zahl über die ganze Woche, und ein abwesender Treffpunkt-Leiter ist genauso
  // einer wie ein abwesender Redner. Die Prüfung selbst bleibt getrennt —
  // andere Datenquelle, eigener Wochentag.
  const conflicts =
    curIdx >= 0
      ? weekConflicts(state.weeks, curIdx, state.persons, state.services, undefined, abwesend).length +
        fsWeekConflicts(
          state.fsWeeks,
          curIdx,
          state.persons,
          state.absences,
          fsWochenKennungen(state.weeks, state.fsBase)[curIdx] ?? '',
        ).length
      : 0

  return (
    <section className="screen dash">
      <div className="dash-eyebrow">{heute}</div>
      <h1 className="dash-greeting">
        {gruss},<br />
        {me?.fn ?? ''}
      </h1>

      {nextTask ? (
        <div className="dash-hero">
          <div className="dash-hero-head">
            <span className="dash-hero-label">{t.dashNextTask}</span>
            {nextChip && <span className="dash-hero-chip">{nextChip}</span>}
          </div>
          <button
            type="button"
            className="dash-hero-open"
            onClick={() => dispatch({ type: 'openMyTask', id: nextTask.id })}
          >
            <div className="dash-hero-title">{aufgabenLabel(nextTask, i18n)}</div>
            <div className="dash-hero-date">{tp(nextTask.date)}</div>
          </button>
          <div className="dash-hero-actions">
            {nextTask.status === 'offen' && (
              <button
                type="button"
                className="dash-confirm"
                onClick={() => dispatch({ type: 'confirmTask', id: nextTask.id })}
              >
                ✓ {t.bestaetigen}
              </button>
            )}
            {nextTask.status === 'bestätigt' && (
              <span className="dash-badge dash-badge--best">✓ {t.bestaetigt}</span>
            )}
            {nextTask.status === 'verhindert' && (
              <span className="dash-badge dash-badge--verh">{t.verhindertChip}</span>
            )}
            {nextTask.s89 && (
              <button
                type="button"
                className="dash-s89"
                onClick={() => nextTask.s89 && dispatch({ type: 'openS89', payload: nextTask.s89 })}
              >
                {t.s89Open} ›
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="dash-hero dash-hero--empty">
          <span className="dash-hero-label">{t.dashNextTask}</span>
          <div className="dash-hero-empty-text">{t.dashKeineAufgabe}</div>
        </div>
      )}

      {week && (
        <div className="dash-week">
          <div className="dash-week-label">{t.aktuelleWoche}</div>
          {MEETING_TABS.map((tab) => {
            const meeting = week[tab]
            const has = me ? assignmentsInMeeting(meeting, me, state.services).length > 0 : false
            return (
              <div key={tab} className="dash-week-row">
                <div>
                  <div className="dash-week-name">{tab === 'mid' ? t.tabMid : t.tabWe}</div>
                  <div className="dash-week-date">{meetingDate(tab)}</div>
                </div>
                {has ? (
                  <span className="dash-week-chip">{t.dashDeineAufgabe}</span>
                ) : (
                  <span className="dash-week-frei">{t.freiChip}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="dash-tiles">
        <button
          type="button"
          className="dash-tile dash-tile--acc"
          onClick={() => dispatch({ type: 'openNotifs' })}
        >
          <div className="dash-tile-label">{t.mitteilungen}</div>
          <div className="dash-tile-value">
            {unread} {t.neuSuffix}
          </div>
        </button>
        <button
          type="button"
          className="dash-tile dash-tile--wein"
          onClick={() => dispatch({ type: 'navigate', screen: 'aufgaben' })}
        >
          <div className="dash-tile-label">{t.dashZuBest}</div>
          <div className="dash-tile-value">
            {toConfirm} {t.navAufgaben}
          </div>
        </button>
      </div>

      {state.planner && week && (
        <button
          type="button"
          className="dash-plan"
          onClick={() => dispatch({ type: 'navigate', screen: 'planen' })}
        >
          <div>
            <div className="dash-plan-label">
              {t.dashPlanung} · {t.aktuelleWoche}
            </div>
            <div className="dash-plan-text">
              {openSlots === 0 && conflicts === 0
                ? t.dashAllesZugeteilt
                : `${fill(t.offeneZut, { n: openSlots })}${conflicts > 0 ? ` · ${fill(t.dashKonflikteN, { n: conflicts })}` : ''}`}
            </div>
          </div>
          <span className="dash-plan-arrow">›</span>
        </button>
      )}
    </section>
  )
}
