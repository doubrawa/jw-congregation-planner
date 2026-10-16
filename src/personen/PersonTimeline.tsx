import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { fromIso } from '../data/meeting-dates'
import { besuchsGruppe } from '../components/gruppenbesuch-anzeige'
import { Zeitleiste, type ZeitZeile } from '../components/Zeitleiste'
import { abwesenheitsArt, zeitleisteDatum } from '../components/zeitleiste-gemeinsam'
import type { Person } from '../data/types'
import { aufgabenLabel, useT } from '../i18n/useT'
import { personTimeline, type TimelineEntry } from './person-timeline'

/**
 * Zeitleiste einer Person: je Eintrag Datum und Art, vergangene blasser.
 *
 * Sie führt **beide Richtungen** zusammen — wann jemand dran ist (Zuteilungen,
 * geleitete Treffpunkte, Trolley-Termine, vorgemerkte Gruppenbesuche) und
 * wann er nicht kann (Abwesenheiten). Zwei Punkte markieren Beginn und Ende
 * eines Zeitraums, und die Strecke dazwischen ist eingefärbt: Was in diesen
 * Abschnitt fällt, liegt sichtbar darin.
 *
 * Entfernt wird eine Abwesenheit seit der Phase 6b in ihrer eigenen Karte
 * (`AbwesenheitenKarte`, wie im Entwurf `GPerson`); hier steht sie nur noch im
 * Zusammenhang. Ohne jeden Eintrag bleibt die Karte ganz weg.
 */
export function PersonTimeline({ person }: { person: Person }) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  // Was vergangen ist, misst der Kalendertag — er rückt um Mitternacht weiter,
  // auch wenn sich sonst nichts ändert (wie bei „Meine Aufgaben"). Bis zum
  // 16.10.2026 galt der Tag, an dem zuletzt gerechnet wurde.
  const tag = useKalendertag()
  /*
   * Gemerkt: `personTimeline` läuft über **alle** geladenen Wochen (bis zu 52,
   * zwei Zusammenkünfte je Woche).
   */
  const entries = useMemo(() => personTimeline(person, state, fromIso(tag)), [person, state, tag])

  const beschriftung = (e: TimelineEntry): string => {
    if (e.kind === 'meeting') return aufgabenLabel({ title: e.titel, rolle: e.rolle }, i18n)
    if (e.kind === 'fs') return `${t.privTreffpunkt} · ${tu(e.ort)}`
    // Der Name, wie die Versammlung ihn vergeben hat („Trolley 3") — er sagt,
    // was es ist; übersetzt wird er nicht.
    if (e.kind === 'trolley') return e.trolley || t.privZeugnis
    if (e.kind === 'besuch') return `${t.gbMarker} · ${besuchsGruppe(e, state.groups, tu)}`
    return abwesenheitsArt(e.grund, t.abwesendChip)
  }

  const zeilen: ZeitZeile[] = entries.map((e) => ({
    key: e.key,
    wann: zeitleisteDatum(e.datum, state.lang, e.zeit),
    art: beschriftung(e),
    abw: e.kind === 'abw',
    ...(e.abwOben ? { abwOben: true } : {}),
    ...(e.abwUnten ? { abwUnten: true } : {}),
    vergangen: e.vergangen,
  }))

  return <Zeitleiste label={t.zeitleiste} zeilen={zeilen} />
}
