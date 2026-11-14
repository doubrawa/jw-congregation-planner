/**
 * Wer steht im Zuteilungs-Sheet zur Auswahl — und in welcher Reihenfolge?
 *
 * Aus `AssignSheet.tsx` herausgelöst: dort lagen Filter, Geschlechtsregeln,
 * Auslastung und Sortierung mitten im JSX und waren dadurch nicht prüfbar. Die
 * Regeln sind aber dieselben, nach denen auch die Auto-Zuteilung entscheidet
 * (`planung/waehler.ts`) — nur eben mit dem Planer statt dem Algorithmus als
 * Entscheider. Wo sie auseinanderlaufen, entsteht genau die Art Fehler, die
 * niemand bemerkt: der Gesprächsführer wurde hier immer im Hauptsaal gesucht,
 * auch wenn es um einen Platz der Zusätzlichen Klasse ging.
 *
 * Rein: keine Hooks, kein Dispatch. Die Texte kommen als Wörterbuch herein.
 */

import type { AppState } from '../app/context'
import { diensteDerSprache } from '../app/useDienste'
import { abwesenheitAm, istAbwesend, type AbsenceSet } from '../data/absence'
import { fsLeiterZuteilung, fsTag } from '../data/fs'
import { treffpunktTitel } from '../components/treffpunkt-beschriftung'
import {
  displayName,
  gehoertZu,
  idAufloeser,
  istAusgefallen,
  personCompare,
  reinigungsGruppen,
  ROLE_CIRCUIT,
} from '../data/helpers'
import { lastFenster, workloadOf } from '../data/auslastung'
import { meetingDate } from '../data/meeting-dates'
import { platzDerAuswahl } from '../data/plaetze'
import { rangfolgeFuer } from '../data/planung/automatik'
import { passtAufPlatz } from '../data/planung/eignung'
import { assignmentsInMeeting, zuletztImBereich } from '../data/planung/zuteilen'
import type { Absence, MeetingAssignment, MeetingKey, Person, SlotSelection } from '../data/types'
import { ROLE_KEY, type Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'

export interface Candidate {
  key: string
  /** Anzeigename (Gruppen: übersetzt). */
  name: string
  /** In die Woche geschriebener kanonischer Name (Gruppen: „Gruppe N"). */
  assignName: string
  /**
   * Was die Zeile über die Person sagt, wenn nichts Dringenderes ansteht: die
   * Stellung, bei Gruppen Aufseher und Mitglieder.
   */
  sub: string
  /** Schon an diesem Tag zugeteilt — Hinweis auf Doppelbelegung. */
  today: MeetingAssignment[]
  absent: boolean
  /** Die Abwesenheit, die den Termin trifft — für „abwesend 7.–11. September". */
  abwesenheit?: Absence
  /**
   * Aufgaben im Lastfenster (`workloadOf` über `LOAD_WEEKS` Wochen) — die
   * Punkte rechts in der Zeile. Dieselbe Zahl, nach der „Automatisch"
   * sortiert. Fehlt bei Gruppen und Treffpunkten: Dort zählt die Automatik
   * anders (die Reinigung rotiert, Treffpunkte haben `fsLast`).
   */
  last?: number
  /** Der „Vorschlag": die Person, die „Automatisch" hier wählen würde (`rangfolgeFuer`). */
  vorschlag: boolean
  /**
   * Wochen, seit die Person zuletzt in diesem Bereich dran war
   * (`zuletztImBereich`) — `null`, wenn im geladenen Bestand davor nie; fehlt,
   * wo es nichts zu zählen gibt (Treffpunkte, Gruppen, Platz ohne Bereich).
   */
  zuletzt?: number | null
  /** Was die Person am anderen Tag dieser Woche schon hat („So Saalordner") — fehlt, wenn nichts. */
  andererTag?: { tab: MeetingKey; aufgaben: MeetingAssignment[] }
}

/**
 * Was die Kandidatenliste aus dem Zustand braucht (erleichtert das Testen) —
 * und genau das, woran das Blatt sie neu rechnet (`AssignSheet`). Hing sie am
 * ganzen Zustand, rechnete sie bei jedem Toast und jedem Farbschema-Wechsel
 * neu (Review, Planen #2, 16.10.2026).
 */
export type KandidatenDaten = Pick<
  AppState,
  // `lang` gehört dazu, seit die Liste in der Sprache des Lesers sortiert
  // (`personCompare`) — sie steht im Zuteilungs-Sheet und wird dort gesucht.
  // `congregation` für den Tag der Zusammenkunft, an dem eine Abwesenheit
  // gemessen wird.
  'weeks' | 'persons' | 'groups' | 'services' | 'fsWeeks' | 'absences' | 'lang' | 'congregation'
>

export function kandidaten(
  state: KandidatenDaten,
  sel: SlotSelection,
  abwesend: AbsenceSet,
  t: Dict,
  tu: (s: string) => string,
): Candidate[] {
  if (sel.kind === 'fs') return fsKandidaten(state, sel, t, tu)
  if (sel.groups) return gruppenKandidaten(state, t, tu)
  if (kreisaufseherPlatz(state, sel)) return []
  return personenKandidaten(state, sel, abwesend, t)
}

/**
 * **Ein Platz des Kreisaufsehers** (Dienstvortrag, Schlussvortrag; T62) — dort
 * steht keine Person zur Wahl, nur sein Name als Freitext. Er steht in keiner
 * Personenliste, und wer ihn vertritt, hält den gewöhnlichen Punkt: Dann ist
 * es keine Kreisaufseher-Woche mehr.
 *
 * Bis zum 16.10.2026 bot das Blatt hier die Ältesten und Dienstamtgehilfen an
 * wie am Redner-Platz. Ein Tipp machte den Platz zum „Redner", Entfernen danach
 * zum „Gastredner" — der Punkt des Kreisaufsehers war aus der Woche
 * verschwunden, und nichts führte zurück.
 */
function kreisaufseherPlatz(state: KandidatenDaten, sel: Exclude<SlotSelection, { kind: 'fs' }>): boolean {
  if (sel.kind !== 'part' || !sel.guest) return false
  const meeting = state.weeks[sel.wi]?.[sel.tab]
  return Boolean(meeting && platzDerAuswahl(meeting, state.services, sel)?.slot?.rolle === ROLE_CIRCUIT)
}

/**
 * Treffpunkt-Leiter: treffpunkt-qualifiziert; „schon heute" ist ein anderer
 * Treffpunkt am selben Wochentag, den die Person bereits leitet.
 */
function fsKandidaten(
  state: KandidatenDaten,
  sel: Extract<SlotSelection, { kind: 'fs' }>,
  t: Dict,
  tu: (s: string) => string,
): Candidate[] {
  const inst = state.fsWeeks[sel.wi]?.find((i) => i.id === sel.instId)
  // Derselbe Montag, mit dem `fsWeekConflicts` rechnet: der der Woche selbst.
  // Über eine Rechnung aus der Ordnungszahl widersprachen sich Konfliktbanner
  // und Kandidatenblatt bei einer Lücke im Bestand um sieben Tage.
  const tag = inst ? fsTag(state.weeks[sel.wi]?.start ?? '', inst.wd) : null
  const schonHeute = (person: Person): MeetingAssignment[] => {
    if (!inst) return []
    const out: MeetingAssignment[] = []
    for (const o of state.fsWeeks[sel.wi] ?? []) {
      if (o.id === sel.instId || o.wd !== inst.wd) continue
      // Über `gehoertZu`, Id vor Name: Ein Gleichnamiger leitet nicht, was der
      // andere leitet — und ein Freitext-Leiter (`lext`) ist nicht diese
      // Person, er heißt nur so (`fsLeiterZuteilung`).
      if (!gehoertZu(fsLeiterZuteilung(o), person)) continue
      out.push({ text: `${o.time} · ${treffpunktTitel(o, state.groups, { t, tu })}`, lang: 'u' })
    }
    return out
  }
  // **Erst filtern, dann sortieren.** Umgekehrt vergleicht `personCompare` —
  // und mit ihm `localeCompare` — auch alle, die gleich wegfallen; bei 300
  // Personen und einer Handvoll Treffpunkt-Leitern ist das die überwiegende
  // Mehrzahl der Vergleiche. Die Reihenfolge ist dieselbe: Sortieren einer
  // Teilmenge ist das Sortieren der ganzen Menge ohne die Weggelassenen.
  return state.persons
    .filter(passtAufPlatz(state, sel))
    .sort((a, b) => personCompare(a, b, state.lang))
    .map((p): Candidate => {
      const name = displayName(p)
      // Am Tag DIESES Treffpunkts, nicht in der ganzen Woche.
      const abwesenheit = tag ? abwesenheitAm(state.absences, p.id, tag) : undefined
      return {
        key: p.id,
        name,
        assignName: name,
        sub: t[ROLE_KEY[p.role]],
        today: schonHeute(p),
        absent: abwesenheit !== undefined,
        abwesenheit,
        vorschlag: false,
      }
    })
    .sort((a, b) => Number(a.absent) - Number(b.absent))
}

/**
 * Reinigung u. Ä.: die Predigtdienstgruppen statt einzelner Personen — nur
 * die, die reinigen (`reinigungsGruppen`). Eine herausgenommene steht nicht
 * zur Wahl, wie eine Person ohne den Bereich eines Dienstes.
 */
function gruppenKandidaten(
  state: KandidatenDaten,
  t: Dict,
  tu: (s: string) => string,
): Candidate[] {
  const sub = (id: string, overseerId: string | null): string => {
    const aufseher = state.persons.find((p) => p.id === overseerId)
    const n = state.persons.filter((p) => p.grp === id).length
    const label = fill(t.mitgliederN, { n })
    return aufseher ? `${displayName(aufseher)} · ${label}` : label
  }
  return reinigungsGruppen(state.groups).map((group) => ({
    key: group.id,
    name: tu(group.name),
    assignName: group.name,
    sub: sub(group.id, group.overseerId),
    today: [],
    absent: false,
    vorschlag: false,
  }))
}

function personenKandidaten(
  state: KandidatenDaten,
  sel: Exclude<SlotSelection, { kind: 'fs' }>,
  abwesend: AbsenceSet,
  t: Dict,
): Candidate[] {
  // Wer überhaupt in Frage kommt — dieselbe Regel, nach der beim Ändern einer
  // Person ihre künftigen Plätze frei werden (`passtAufPlatz`, T182).
  const passt = passtAufPlatz(state, sel)
  // Die Punkte zählen über dasselbe Fenster, nach dem „Automatisch" sortiert
  // (`lastFenster`: nach Datum, nicht nach Position).
  const fenster = lastFenster(state.weeks, sel.wi)
  // Die Woche gibt es, sonst wäre das Sheet nicht offen; ohne sie bleiben die
  // Hinweise zum Tag einfach aus.
  const week = state.weeks[sel.wi]
  const meeting = week?.[sel.tab]
  // Wen „Automatisch" hier nähme, in seiner Reihenfolge (T121, Phase 5d): Die
  // erste ist der Vorschlag, die übrigen stehen in derselben Ordnung darunter.
  const rang = new Map(
    rangfolgeFuer(state.weeks, sel, state.persons, state.services, state.groups, abwesend).map((p, i) => [p.id, i]),
  )
  const zuletzt = sel.priv ? zuletztImBereich(state.weeks, sel.wi, sel.priv, state.services, idAufloeser(state.persons)) : null
  // Was jemand am anderen Tag dieser Woche schon hat — sofern er stattfindet.
  const andererTab: MeetingKey = sel.tab === 'mid' ? 'we' : 'mid'
  const anderes = week && !istAusgefallen(week, andererTab) ? week[andererTab] : undefined
  // Der Tag, an dem `abwesend` misst (`buildAbsences`) — für den Zeitraum dazu.
  const termin = week ? meetingDate(week, sel.tab, state.congregation.times) : undefined
  // „An diesem Tag schon: …" nennt mehrere Hilfsdienste alphabetisch.
  const dienste = diensteDerSprache(state.services, state.lang)
  /**
   * Die Stufen der Liste: erst, wen die Automatik nähme, dann wer sonst frei
   * ist, dann wer an diesem Tag schon dran ist, zuletzt die Abwesenden —
   * innerhalb einer Stufe in der Rangfolge der Automatik, sonst alphabetisch.
   */
  const stufe = (c: Candidate): number => (c.absent ? 3 : c.today.length > 0 ? 2 : rang.has(c.key) ? 0 : 1)
  // Erst filtern, dann sortieren (siehe `fsKandidaten`): Sortiert werden
  // müssen nur die Qualifizierten. Alphabetisch, danach stabil nach Stufe und
  // Rang.
  return state.persons
    .filter(passt)
    .sort((a, b) => personCompare(a, b, state.lang))
    .map((p): Candidate => {
      const name = displayName(p)
      const absent = istAbwesend(abwesend, p.id, sel.wi, sel.tab)
      const dort = anderes ? assignmentsInMeeting(anderes, p, dienste) : []
      return {
        key: p.id,
        name,
        assignName: name,
        sub: t[ROLE_KEY[p.role]],
        today: meeting ? assignmentsInMeeting(meeting, p, dienste, sel) : [],
        absent,
        abwesenheit: absent && termin ? abwesenheitAm(state.absences, p.id, termin) : undefined,
        last: workloadOf(fenster, p, state.services),
        vorschlag: rang.get(p.id) === 0,
        zuletzt: zuletzt ? (zuletzt.get(p.id) ?? null) : undefined,
        andererTag: dort.length > 0 ? { tab: andererTab, aufgaben: dort } : undefined,
      }
    })
    .sort((a, b) => stufe(a) - stufe(b) || (rang.get(a.key) ?? 0) - (rang.get(b.key) ?? 0))
}
