import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { Saal } from '../bausteine/Saal'
import { Spur } from '../bausteine/Spur'
import { zusammenkunftName } from '../components/anlass-name'
import { engpaesse } from '../data/bedarf'
import { istAusgefallen } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import { openSlotLabels, type Conflict, type ConflictKind } from '../data/planning'
import { besetztVon, besetzung, saalLagen, type PlatzLage } from '../data/saal'
import type { MeetingKey } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { bereichsName } from '../personen/priv-label'
import { spurDerWoche, wochenZahlen } from './plan-spur'
import { LAGE_KLASSE } from './platz-anzeige'
import { useKonflikte } from './useKonflikte'

/**
 * **Wie weit die Woche ist** (T121, Entwurf `GPlanen`): Zuteilen, Senden,
 * Zusagen — die Zahlen aus denselben Funktionen wie Saal und „Plan senden"
 * (`wochenZahlen`).
 */
export function PlanSpur({ tab }: { tab: MeetingKey }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const week = state.weeks[state.week]
  const fsWeek = state.fsWeeks[state.week]
  const { services, confirmations, persoenlich, sentLog } = state
  const zeiten = state.congregation.times
  /*
   * Gemerkt: Der Wochenstreifen zeichnet drei Wochen, und jeder Dispatch
   * rendert sie neu — `offeneMeldungen` läuft dabei über alle Plätze der
   * Woche und das ganze Tagebuch.
   */
  // Fällt die Zusammenkunft aus (T30), gibt es nichts zu besetzen, zu senden
  // oder zuzusagen.
  const zahlen = useMemo(
    () =>
      week && !istAusgefallen(week, tab)
        ? wochenZahlen(week, fsWeek, tab, { services, confirmations, persoenlich, sentLog, zeiten }, fromIso(tag))
        : null,
    [week, fsWeek, tab, services, confirmations, persoenlich, sentLog, zeiten, tag],
  )
  if (!zahlen) return null
  // „Zusagen" führt zu den Zusagen der Woche (Entwurf `GPlanen`: `ziele`).
  const zuDenZusagen = (): void => dispatch({ type: 'setTab', tab: 'zusagen' })
  return <Spur schritte={spurDerWoche(zahlen, t, { zusagen: zuDenZusagen })} label={t.spurWoche} />
}

/**
 * Die Konflikte in fester Reihenfolge: Abwesenheit zuerst — die Person kommt
 * gar nicht —, dann Doppelbelegung, dann Hilfsdienst und Aufgabe. Sonst wanderte
 * die schwerste Meldung je nach Datenlage an eine andere Stelle.
 */
const KONFLIKT_RANG: Partial<Record<ConflictKind, number>> = { absent: 0, double: 1, helperTask: 2 }

/** Die Legende in der Reihenfolge des Entwurfs. */
const LEGENDE: ReadonlyArray<readonly [PlatzLage, 'zusageBestaetigt' | 'zusageWartet' | 'lageProblem' | 'offenWort']> = [
  ['voll', 'zusageBestaetigt'],
  ['wartet', 'zusageWartet'],
  ['problem', 'lageProblem'],
  ['offen', 'offenWort'],
]

/**
 * **Die Besetzung der Zusammenkunft** (T121, Entwurf `GPlanen`): der Saal —
 * voll zugesagt, blass wartend, rot ein Problem, gestrichelt offen —, die Zahl,
 * die Legende und darunter, was zu klären ist: wer abwesend oder doppelt
 * eingeteilt ist, was mangels Leuten nicht besetzbar ist, was noch offen ist.
 *
 * Steht an der Stelle der früheren Banner (Konflikte, nicht besetzbar, offene
 * Zuteilungen) und ihrer Legende; deren Zahlen und Sätze bleiben dieselben.
 */
export function BesetzungKarte({ tab, tpw }: { tab: MeetingKey; tpw: (s: string) => string }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const abwesend = useAbwesend()
  const konflikte = useKonflikte(tab)
  const week = state.weeks[state.week]
  const { services, confirmations, persons } = state
  /*
   * Gemerkt und vor jedem Ausstieg, aus demselben Grund wie oben: `engpaesse`
   * läuft je Bereich zweimal über alle Personen. Eine ausgefallene
   * Zusammenkunft hat nichts zu besetzen (T30) — eine Zahl führte den Planer
   * an einen Plan, den es nicht gibt.
   */
  const da = week && !istAusgefallen(week, tab) ? week : null
  const b = useMemo(
    () =>
      da ? besetzung(da[tab], services, confirmations, da.start, tab, null, konflikte.betrifft) : null,
    [da, tab, services, confirmations, konflikte],
  )
  const offen = useMemo(() => (da ? openSlotLabels(da[tab], services) : []), [da, tab, services])
  const engpass = useMemo(
    () => (da ? engpaesse(da[tab], services, persons, abwesend, state.week, tab) : []),
    [da, tab, services, persons, abwesend, state.week],
  )
  if (!b) return null

  const konfliktListe = [...konflikte.liste].sort((x, y) => (KONFLIKT_RANG[x.kind] ?? 9) - (KONFLIKT_RANG[y.kind] ?? 9))
  const { besetzt, gesamt } = besetztVon(b)
  const zahl = `${t.saalBesetzung}: ${besetzt}/${gesamt}`
  const offenGesamt = offen.reduce((summe, slot) => summe + slot.n, 0)
  const bereichName = (key: string): string => bereichsName(key, services, t, tu)

  return (
    <section className="karte karte--held besetzung" aria-label={t.saalBesetzung}>
      <Saal lagen={saalLagen(b)} label={zahl} />
      <p className="besetzung-zahl">{zahl}</p>
      <ul className="besetzung-legende">
        {LEGENDE.map(([lage, wort]) => (
          <li key={lage} className={LAGE_KLASSE[lage]}>
            <span className="platz-punkt" aria-hidden="true" />
            {t[wort]}
          </li>
        ))}
      </ul>
      {(konfliktListe.length > 0 || engpass.length > 0 || offenGesamt > 0) && (
        <ul className="klaeren" aria-label={t.zuKlaeren}>
          {konfliktListe.map((c, i) => (
            <li key={`k${i}`} className="klaeren-zeile is-problem" data-art="konflikt">
              <span className="platz-punkt" aria-hidden="true" />
              {konfliktText(c, t)}
            </li>
          ))}
          {engpass.map((e) => (
            <li key={`e${e.key}`} className="klaeren-zeile is-problem" data-art="engpass">
              <span className="platz-punkt" aria-hidden="true" />
              {fill(t.engpassZeile, {
                bereich: bereichName(e.key),
                b: e.benoetigt,
                v: e.verfuegbar,
                a: e.qualifiziert - e.verfuegbar,
                q: e.qualifiziert,
              })}
            </li>
          ))}
          {offenGesamt > 0 && (
            <li className="klaeren-zeile is-offen" data-art="offen">
              <span className="platz-punkt" aria-hidden="true" />
              <span>
                {fill(t.offeneZut, { n: offenGesamt })}
                <span className="klaeren-wo" dir="auto">
                  {/* Die Rolle aus dem Wörterbuch des Lesers, der Titel aus dem
                      der Versammlung — getrennt übersetzt, erst hier
                      zusammengesetzt (siehe OpenSlot.rolle). */}
                  {offen
                    .map(
                      (slot) =>
                        `${slot.lang === 'u' ? tu(slot.text) : tpw(slot.text)}${slot.rolle ? ` · ${tu(slot.rolle)}` : ''}${slot.n > 1 ? ` ×${slot.n}` : ''}`,
                    )
                    .join(', ')}
                </span>
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}

/** Der Satz zu einem Konflikt der Zusammenkunft — wie im früheren Banner. */
function konfliktText(c: Conflict, t: Dict): string {
  const tabName = zusammenkunftName(c.tab ?? 'mid', t)
  if (c.kind === 'absent') return fill(t.konfliktAbsent, { name: c.name, tab: tabName })
  if (c.kind === 'double') return fill(t.konfliktDouble, { name: c.name, n: c.count ?? 2, tab: tabName })
  return fill(t.konfliktHelperTask, { name: c.name, tab: tabName })
}
