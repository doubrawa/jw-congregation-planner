import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { fsKennung, fsLeiterZuteilung, fsTag, fsTerminText } from '../data/fs'
import {
  currentWeekIndex,
  fromIso,
  meetingDateText,
  meetingOffset,
  meetingTime,
} from '../data/meeting-dates'
import { gehoertZu, MEETING_TABS } from '../data/helpers'
import { assignmentsInMeeting } from '../data/planning'
import { LOCALES } from '../i18n/langs'
import { relativeDayLabel } from '../i18n/relative-time'
import { aufgabenLabel, useT } from '../i18n/useT'
import type { MeetingKey } from '../data/types'
import { PlanungsKarte } from './PlanungsKarte'
import './dashboard.css'
import { versatzAbMontag } from '../data/meeting-dates'

/** Eine Zeile im Block „Aktuelle Woche": eine Zusammenkunft oder ein eigener Treffpunkt. */
interface WochenZeile {
  key: string
  name: string
  datum: string
  /** Bin ich hier eingeteilt? */
  meins: boolean
  /** Tage ab Montag — zum Sortieren. */
  tag: number
  /** Minuten ab Mitternacht — zum Sortieren am selben Tag. */
  minute: number
}

/** „19:00" → 1140. Ohne lesbare Uhrzeit 0: dann zählt nur der Tag. */
function minuteDesTages(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Start (Screen 1, Landeseite nach dem Login): bündelt das Wichtigste — Gruß,
 * die eigene nächste Aufgabe (mit Bestätigen/S-89), die aktuelle Woche im
 * Überblick, Mitteilungen und offene Bestätigungen.
 * Ruhiger „Programmheft-Deckblatt"-Stil (Vorschlag 1a).
 *
 * **Nach Rolle sortiert, nicht nach Person** (T95). Bis dahin stand für alle
 * dasselbe in derselben Reihenfolge, und die Arbeit des Planers kam als letzte
 * Zeile — unter seinem eigenen Verkündiger-Teil. Jetzt steht für ihn die
 * Planungs-Karte direkt unter dem Gruß. Seine eigenen unbestätigten Aufgaben
 * verliert er dabei nicht aus dem Blick: Die legt ihm ohnehin das Blatt beim
 * Öffnen vor (T69), und die Karte schrumpft auf eine Zeile, wenn nichts zu tun
 * ist. Verkündiger und Gruppenaufseher sehen den Bildschirm wie bisher.
 */
export function DashboardScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu, tp } = i18n
  const me = state.persons.find((p) => p.id === state.personId)
  // Ein neuer Render, sobald der Tag wechselt — sonst stünde nach einer Nacht im
  // Hintergrund noch der gestrige Gruß über der gestrigen Woche.
  const tag = useKalendertag()

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

  // Aktuelle Woche für „Diese Woche"; Fallback auf die gerade gewählte Woche,
  // falls heute in keine geladene Woche fällt. Gerechnet, nicht aus
  // `week.current` gelesen: das Flag setzt nur der Demo-Datensatz und wird nie
  // nachgeführt.
  const curIdx = currentWeekIndex(state.weeks, fromIso(tag))
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
    week ? shortDate(meetingDateText(week, weekIdx, tab, state.congregation.times)) : ''

  /*
   * **Die eigenen Treffpunkte dieser Woche** (T95).
   *
   * Der Wochenblock lief nur über die beiden Zusammenkünfte. Ein
   * Treffpunkt-Leiter sah seine Einteilung in der Karte darüber, sobald sie die
   * nächste war — im Wochenüberblick darunter nie: zwei Stellen auf einem
   * Bildschirm, die verschieden viel von derselben Woche wussten.
   *
   * Nur die **eigenen**, nicht alle: Zu den Zusammenkünften geht jeder, eine
   * Zeile „frei" sagt dort etwas. Treffpunkte gibt es mehrere am Tag, und eine
   * Liste fremder Termine wäre Wand statt Auskunft — die steht im Programm.
   * Wem eine Leitung gehört, entscheiden die beiden Stellen, die das für jeden
   * Treffpunkt entscheiden — wie beim DU-Chip im Programm: `fsLeiterZuteilung`
   * (ein Freitext-Leiter gehört niemandem) und `gehoertZu` (Id vor Name).
   */
  const kennung = week ? fsKennung(week, state.fsBase, weekIdx) : ''
  const meineTreffpunkte =
    me && week
      ? (state.fsWeeks[weekIdx] ?? []).filter((inst) => gehoertZu(fsLeiterZuteilung(inst), me))
      : []

  /*
   * Die Zeilen **in der Folge der Woche**: Ein Treffpunkt am Montag gehört vor
   * die Zusammenkunft am Dienstag. Angehängt stünde er hinter dem Sonntag, und
   * der Block läse sich nicht mehr als Woche. Tag und Uhrzeit der
   * Zusammenkünfte kommen aus denselben Quellen wie ihr Termin darüber
   * (Abweichung vor eigenem Termin vor Einstellungen).
   */
  const zeilen: WochenZeile[] = week
    ? [
        ...MEETING_TABS.map((tab) => ({
          key: tab,
          name: tab === 'mid' ? t.tabMid : t.tabWe,
          datum: meetingDate(tab),
          meins: me ? assignmentsInMeeting(week[tab], me, state.services).length > 0 : false,
          tag: meetingOffset(week, tab, state.congregation.times),
          minute: minuteDesTages(meetingTime(week, tab, state.congregation.times)),
        })),
        ...meineTreffpunkte.map((inst) => ({
          key: `fs|${inst.id}`,
          name: t.tabFs,
          // Mit Ort: Anders als bei den Zusammenkünften sagt erst er, wohin
          // man kommt.
          datum: tp(fsTerminText(fsTag(kennung, inst.wd), inst)),
          meins: true,
          tag: versatzAbMontag(inst.wd),
          minute: minuteDesTages(inst.time),
        })),
      ].sort((a, b) => a.tag - b.tag || a.minute - b.minute)
    : []

  return (
    <section className="screen dash">
      <div className="dash-eyebrow">{heute}</div>
      <h1 className="dash-greeting">
        {gruss},<br />
        {me?.fn ?? ''}
      </h1>

      {/* Der Planer sieht seine Arbeit zuerst (T95). Wer nicht plant, dürfte
          den Screen dahinter gar nicht betreten. */}
      {state.planner && <PlanungsKarte />}

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
          {zeilen.map((z) => (
            <div key={z.key} className="dash-week-row" data-zeile={z.key}>
              <div>
                <div className="dash-week-name">{z.name}</div>
                <div className="dash-week-date">{z.datum}</div>
              </div>
              {z.meins ? (
                <span className="dash-week-chip">{t.dashDeineAufgabe}</span>
              ) : (
                <span className="dash-week-frei">{t.freiChip}</span>
              )}
            </div>
          ))}
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
    </section>
  )
}
