import { useApp } from '../app/context'
import type { Person } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { aufgabenLabel, useT } from '../i18n/useT'
import { personTimeline, type TimelineEntry } from './person-timeline'

/**
 * Zeitleiste der Zuteilungen einer Person (Personen-Detail, zwischen
 * Stammdaten und Aufgabenbereichen): je Eintrag Datum und Art der Aufgabe,
 * vergangene blasser. Ohne Zuteilungen bleibt die Karte ganz weg.
 */
export function PersonTimeline({ person }: { person: Person }) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const entries = personTimeline(person, state)
  if (entries.length === 0) return null

  // Einheitlich für beide Arten: Wochentag, Datum und — sofern hinterlegt —
  // die Uhrzeit („Dienstag, 8. September · 19:00").
  const wann = (e: TimelineEntry): string => {
    const tag = e.datum.toLocaleDateString(LOCALES[state.lang], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
    return e.zeit ? `${tag} · ${e.zeit}` : tag
  }

  return (
    <div className="panel panel--pb10" data-farbe="gold">
      <div className="panel-label pers-zeit-label">{t.navAufgaben}</div>
      <ol className="pers-zeit">
        {entries.map((e) => (
          <li key={e.key} className={e.vergangen ? 'pers-zeit-row is-past' : 'pers-zeit-row'}>
            <span className="pers-zeit-dot" aria-hidden="true" />
            <div className="pers-zeit-datum">{wann(e)}</div>
            <div className="pers-zeit-art">
              {e.kind === 'meeting'
                ? aufgabenLabel({ title: e.titel, rolle: e.rolle }, i18n)
                : `${t.privTreffpunkt} · ${tu(e.ort)}`}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
