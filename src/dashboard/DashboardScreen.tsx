import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Zeitleiste, type ZeitZeile } from '../components/Zeitleiste'
import { abwesenheitsArt, zeitleisteDatum } from '../components/zeitleiste-gemeinsam'
import { fromIso } from '../data/meeting-dates'
import { LOCALES } from '../i18n/langs'
import { relativeDayLabel } from '../i18n/relative-time'
import { aufgabenLabel, useT } from '../i18n/useT'
import { dashTimeline } from './dash-timeline'
import { PlanungsKarte } from './PlanungsKarte'
import './dashboard.css'

/**
 * Start (Screen 1, Landeseite nach dem Login): bündelt das Wichtigste — Gruß,
 * die eigene Zeitleiste der nächsten zwei Wochen, Mitteilungen und offene
 * Bestätigungen. Ruhiger „Programmheft-Deckblatt"-Stil (Vorschlag 1a).
 *
 * **Nach Rolle sortiert, nicht nach Person** (T95). Bis dahin stand für alle
 * dasselbe in derselben Reihenfolge, und die Arbeit des Planers kam als letzte
 * Zeile — unter seinem eigenen Verkündiger-Teil. Jetzt steht für ihn die
 * Planungs-Karte direkt unter dem Gruß. Seine eigenen unbestätigten Aufgaben
 * verliert er dabei nicht aus dem Blick: Die legt ihm ohnehin das Blatt beim
 * Öffnen vor (T69), und die Karte schrumpft auf eine Zeile, wenn nichts zu tun
 * ist. Verkündiger und Gruppenaufseher sehen den Bildschirm wie bisher.
 *
 * **Eine Leiste statt zweier Karten.** Hier standen „Deine nächste Aufgabe" und
 * „Aktuelle Woche": die erste Aufgabe groß, darunter die beiden Zusammenkünfte
 * der laufenden Woche mit „Deine Aufgabe" oder „frei". Das beantwortete die
 * Frage, mit der man den Start öffnet, nur halb — die zweite Aufgabe stand
 * nirgends, und was nach Sonntag kommt, erst recht nicht. Jetzt steht dort die
 * Zeitleiste aus dem Personen-Detail, dieselbe Form, mit den eigenen Aufgaben
 * und Abwesenheiten der **nächsten zwei Wochen** (`dash-timeline.ts` sagt,
 * welche). Was der Woche fehlte — der eigene Treffpunkt am Mittwoch, die
 * Zuteilung in der Folgewoche — steht damit von selbst da. Die Zusammenkünfte,
 * in denen man frei ist, stehen nicht mehr auf dem Start: Wann sie sind, sagt
 * das Programm; hier geht es um das, was einen selbst angeht.
 */
export function DashboardScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tp } = i18n
  const me = state.persons.find((p) => p.id === state.personId)
  // Ein neuer Render, sobald der Tag wechselt — sonst stünde nach einer Nacht im
  // Hintergrund noch der gestrige Gruß über dem gestrigen Zeitfenster.
  const tag = useKalendertag()

  // Tageszeit-Gruß + lokalisiertes Datum (Wochentag · Tag · Monat, Großbuchstaben).
  const hour = new Date().getHours()
  const gruss = hour < 11 ? t.grussMorgen : hour < 18 ? t.grussTag : t.grussAbend
  const heute = new Date()
    .toLocaleDateString(LOCALES[state.lang], { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  const unread = state.notifs.filter((n) => !n.read).length
  const toConfirm = state.myTasks.filter((task) => task.status === 'offen').length

  /*
   * Fenster **und** Zeilen in einem Zug gemerkt: Die Leiste baut je Aufgabe
   * Knöpfe, und die entstünden sonst bei jedem Render neu — gerechnet war dann
   * nur die Auswahl, nicht das, was daraus wird.
   *
   * Gemerkt am Tag, nicht an der Uhrzeit: Das Fenster verschiebt sich um
   * Mitternacht, und `useKalendertag` stößt dann den Render an.
   */
  const zeilen: ZeitZeile[] = useMemo(() => {
    const eintraege = dashTimeline(state.myTasks, state.absences, state.personId, fromIso(tag))
    return eintraege.map((e) => {
      const band = {
        ...(e.abwOben ? { abwOben: true } : {}),
        ...(e.abwUnten ? { abwUnten: true } : {}),
        ...(e.vergangen ? { vergangen: true } : {}),
      }
      if (e.kind === 'abw') {
        return {
          key: e.key,
          wann: zeitleisteDatum(e.datum, state.lang),
          art: abwesenheitsArt(e.grund, t.abwesendChip),
          abw: true,
          ...band,
        }
      }
      const { task } = e
      // Live-Countdown aus dem Datum (Intl); ohne Datum kein Chip.
      const countdown = relativeDayLabel(task.at, state.lang)
      return {
        key: e.key,
        wann: tp(task.date),
        art: <span className="dash-zeit-titel">{aufgabenLabel(task, i18n)}</span>,
        ...band,
        oeffnen: () => dispatch({ type: 'openMyTask', id: task.id }),
        aktionen: (
          <>
            {task.status === 'offen' && (
              <button
                type="button"
                className="dash-confirm"
                onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
              >
                ✓ {t.bestaetigen}
              </button>
            )}
            {task.status === 'bestätigt' && (
              <span className="dash-badge dash-badge--best">✓ {t.bestaetigt}</span>
            )}
            {task.status === 'verhindert' && (
              <span className="dash-badge dash-badge--verh">{t.verhindertChip}</span>
            )}
            {task.s89 && (
              <button
                type="button"
                className="dash-s89"
                onClick={() => task.s89 && dispatch({ type: 'openS89', payload: task.s89 })}
              >
                {t.s89Open} ›
              </button>
            )}
          </>
        ),
        ...(countdown ? { ende: <span className="dash-zeit-chip">{countdown}</span> } : {}),
      }
    })
  }, [state.myTasks, state.absences, state.personId, state.lang, tag, dispatch, i18n, t, tp])

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

      {/* Der Leerzustand heißt: wirklich nichts geplant — nicht „nichts in den
          nächsten zwei Wochen". Steht etwas dahinter, nennt die Leiste es
          (siehe `dashTimeline`). */}
      <Zeitleiste
        label={t.naechsteAufgaben}
        farbe="acc"
        lead
        zeilen={zeilen}
        leer={<div className="dash-leer-text">{t.dashKeineAufgabe}</div>}
      />

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
