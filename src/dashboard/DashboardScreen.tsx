import { useApp } from '../app/context'
import { CURRENT_PERSON_ID } from '../data/demo'
import { displayName } from '../data/helpers'
import { assignmentsInMeeting, countOpenSlots, weekConflicts } from '../data/planning'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import type { MeetingTab } from '../data/types'
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
  const { t, tu, tp } = useT()
  const me = state.persons.find((p) => p.id === (state.personId ?? CURRENT_PERSON_ID))
  const myName = me ? displayName(me) : null

  // Tageszeit-Gruß + lokalisiertes Datum (Wochentag · Tag · Monat, Großbuchstaben).
  const hour = new Date().getHours()
  const gruss = hour < 11 ? t.grussMorgen : hour < 18 ? t.grussTag : t.grussAbend
  const heute = new Date()
    .toLocaleDateString(LOCALES[state.lang], { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  const nextTask = state.myTasks[0] ?? null
  const unread = state.notifs.filter((n) => !n.read).length
  const toConfirm = state.myTasks.filter((task) => task.status === 'offen').length

  // Aktuelle Woche (current) für „Diese Woche" + Planer-Kachel; Fallback auf die
  // gerade gewählte Woche, falls keine als current markiert ist.
  const curIdx = state.weeks.findIndex((w) => w.current)
  const week = curIdx >= 0 ? state.weeks[curIdx] : (state.weeks[state.week] ?? null)

  const shortDate = (s: string): string => tp(s).split(' · ').slice(0, 2).join(' · ')

  const openSlots = week
    ? countOpenSlots(week.mid, state.services) + countOpenSlots(week.we, state.services)
    : 0
  const conflicts =
    curIdx >= 0 ? weekConflicts(state.weeks, curIdx, state.persons, state.services).length : 0

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
            {nextTask.chip && <span className="dash-hero-chip">{tu(nextTask.chip)}</span>}
          </div>
          <div className="dash-hero-title">{tp(nextTask.title)}</div>
          <div className="dash-hero-date">{tp(nextTask.date)}</div>
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
          {(['mid', 'we'] as MeetingTab[]).map((tab) => {
            const meeting = tab === 'mid' ? week.mid : week.we
            const has = myName
              ? assignmentsInMeeting(meeting, myName, state.services).length > 0
              : false
            return (
              <div key={tab} className="dash-week-row">
                <div>
                  <div className="dash-week-name">{tab === 'mid' ? t.tabMid : t.tabWe}</div>
                  <div className="dash-week-date">{shortDate(meeting.date)}</div>
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
