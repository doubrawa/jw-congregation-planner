/**
 * Wer steht im Zuteilungs-Sheet zur Auswahl — und in welcher Reihenfolge?
 *
 * Aus `AssignSheet.tsx` herausgelöst: dort lagen Filter, Geschlechtsregeln,
 * Auslastung und Sortierung mitten im JSX und waren dadurch nicht prüfbar. Die
 * Regeln sind aber dieselben, nach denen auch die Auto-Zuteilung entscheidet
 * (`planning.ts`) — nur eben mit dem Planer statt dem Algorithmus als
 * Entscheider. Wo sie auseinanderlaufen, entsteht genau die Art Fehler, die
 * niemand bemerkt: der Gesprächsführer wurde hier immer im Hauptsaal gesucht,
 * auch wenn es um einen Platz der Zusätzlichen Klasse ging.
 *
 * Rein: keine Hooks, kein Dispatch. Die Texte kommen als Wörterbuch herein.
 */

import type { AppState } from '../app/context'
import { istAbwesend, istAbwesendAm, type AbsenceSet } from '../data/absence'
import { slotsOf } from '../data/aux-class'
import { fsKennung, fsLast, fsTag } from '../data/fs'
import {
  displayName,
  gehoertZu,
  idAufloeser,
  initials,
  isQualified,
  isSong,
  lastFenster,
  LOAD_WEEKS,
  loadWindow,
  partnerGenderOk,
  personCompare,
  workloadOf,
  type WeekLoad,
} from '../data/helpers'
import { assignmentsInMeeting, type MeetingAssignment } from '../data/planning'
import type { Person, SlotSelection } from '../data/types'
import { ROLE_KEY, type Dict } from '../i18n/ui'
import { fill } from '../i18n/useT'

export interface Candidate {
  key: string
  /** Anzeigename (Gruppen: übersetzt). */
  name: string
  /** In die Woche geschriebener kanonischer Name (Gruppen: „Gruppe N"). */
  assignName: string
  initials: string
  sub: string
  /** Schon an diesem Tag zugeteilt — Hinweis auf Doppelbelegung. */
  today: MeetingAssignment[]
  absent: boolean
  /**
   * Der „frei"-Chip: **im Lastfenster dieser Liste nichts zu tun.**
   *
   * Welches Fenster das ist, hängt an der Liste, und das ist kein Versehen:
   * Zusammenkünfte und Treffpunkte sind zwei getrennte Größen mit zwei
   * Strichlisten (`workloadOf` bzw. `fsLast`) und zwei verschieden breiten
   * Fenstern (`LOAD_WEEKS` bzw. `FS_LOAD_WEEKS`). Der Chip meint jeweils die,
   * nach der auch die Automatik dieses Platzes wählt — sonst behauptet er
   * etwas, das die Entscheidung daneben nicht trägt.
   */
  free: boolean
  /** Belegung der 5 Wochen (aktuelle ±2) für die Mini-Quadrate. */
  load?: WeekLoad[]
}

/** Was die Kandidatenliste aus dem Zustand braucht (erleichtert das Testen). */
export type KandidatenDaten = Pick<
  AppState,
  'weeks' | 'persons' | 'groups' | 'services' | 'fsWeeks' | 'fsBase' | 'absences'
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
  return personenKandidaten(state, sel, abwesend, t)
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
  // „frei" heißt hier: leitet im Treffpunkt-Lastfenster keinen Treffpunkt —
  // dieselbe Strichliste, nach der auch die Automatik wählt. Vorher stand hier
  // `workloadOf` über alle geladenen Wochen, also die Zusammenkunfts-Last: die
  // falsche Größe und der falsche Zeitraum (siehe `fsLast`).
  const fsLastFenster = fsLast(state.fsWeeks, sel.wi, idAufloeser(state.persons))
  // Derselbe Montag, mit dem `fsWeekConflicts` rechnet. Über `fsBase + wi·7`
  // widersprachen sich Konfliktbanner und Kandidatenblatt bei einer Lücke im
  // Bestand um sieben Tage — bei derselben Frage, am selben Treffpunkt.
  const tag = inst ? fsTag(fsKennung(state.weeks[sel.wi], state.fsBase, sel.wi), inst.wd) : null
  const schonHeute = (name: string): MeetingAssignment[] => {
    if (!inst) return []
    const out: MeetingAssignment[] = []
    for (const o of state.fsWeeks[sel.wi] ?? []) {
      // `o.lext`: Ein Freitext-Leiter blockiert keinen Gleichnamigen — er ist
      // nicht diese Person, er heißt nur so.
      if (o.id === sel.instId || o.wd !== inst.wd || o.lext || o.leader !== name) continue
      const ttl = o.grp === '' ? t.fsVers : (state.groups.find((g) => g.id === o.grp)?.name ?? o.grp)
      out.push({ text: `${o.time} · ${tu(ttl)}`, lang: 'u' })
    }
    return out
  }
  return [...state.persons]
    .sort(personCompare)
    .filter((p) => isQualified(p, 'treffpunkt'))
    .map((p) => {
      const name = displayName(p)
      return {
        key: p.id,
        initials: initials(p),
        name,
        assignName: name,
        sub: t[ROLE_KEY[p.role]],
        today: schonHeute(name),
        // Am Tag DIESES Treffpunkts, nicht in der ganzen Woche.
        absent: tag ? istAbwesendAm(state.absences, p.id, tag) : false,
        free: (fsLastFenster.get(p.id) ?? 0) === 0,
      }
    })
    .sort((a, b) => Number(a.absent) - Number(b.absent))
}

/** Reinigung u. Ä.: die Predigtdienstgruppen statt einzelner Personen. */
function gruppenKandidaten(
  state: KandidatenDaten,
  t: Dict,
  tu: (s: string) => string,
): Candidate[] {
  const sub = (id: string, ov: string | null): string => {
    const aufseher = state.persons.find((p) => p.id === ov)
    const n = state.persons.filter((p) => p.grp === id).length
    const label = n === 1 ? t.mitglied1 : fill(t.mitgliederN, { n })
    return aufseher ? `${displayName(aufseher)} · ${label}` : label
  }
  return state.groups.map((group) => {
    const num = group.name.replace(/\D/g, '')
    return {
      key: group.id,
      initials: num ? `G${num}` : 'G',
      name: tu(group.name),
      assignName: group.name,
      sub: sub(group.id, group.ov),
      today: [],
      absent: false,
      free: false,
    }
  })
}

function personenKandidaten(
  state: KandidatenDaten,
  sel: Exclude<SlotSelection, { kind: 'fs' }>,
  abwesend: AbsenceSet,
  t: Dict,
): Candidate[] {
  const geschlechtOk = geschlechtsPruefung(state, sel)
  // Auslastung über dasselbe Fenster wie die Mini-Quadrate daneben — dieselbe
  // Funktion, nicht dieselbe Absicht: `slice` schnitt nach Position, die
  // Quadrate rechnen nach Datum (siehe `lastFenster`).
  const fenster = lastFenster(state.weeks, sel.wi)
  // Die Woche gibt es, sonst wäre das Sheet nicht offen; ohne sie bleibt der
  // Hinweis „heute schon zugeteilt" einfach aus.
  const meeting = state.weeks[sel.wi]?.[sel.tab]
  return [...state.persons]
    .sort(personCompare) // alphabetisch; Abwesende wandern stabil ans Ende
    .filter((p) => (!sel.priv || isQualified(p, sel.priv)) && geschlechtOk(p))
    .map((p) => {
      const name = displayName(p)
      const last = workloadOf(fenster, p, state.services)
      const lastLabel =
        last === 1
          ? fill(t.aufgabeInW, { w: LOAD_WEEKS })
          : fill(t.aufgabenInW, { n: last, w: LOAD_WEEKS })
      return {
        key: p.id,
        initials: initials(p),
        name,
        assignName: name,
        sub: `${t[ROLE_KEY[p.role]]} · ${lastLabel}`,
        today: meeting ? assignmentsInMeeting(meeting, p, state.services, sel) : [],
        absent: istAbwesend(abwesend, p.id, sel.wi, sel.tab),
        free: last === 0,
        // Dieselbe Platzgrenze wie `last` eine Zeile darüber — sonst zeigt
        // dieselbe Zeile „frei" und daneben ein belegtes Quadrat.
        load: loadWindow(state.weeks, p, sel.wi, state.services),
      }
    })
    .sort((a, b) => Number(a.absent) - Number(b.absent))
}

/**
 * Geschlechtsregeln der Schülerteile: der Platz selbst kann brüder-only sein
 * (Vortrag, Ratgeber), und ein Gesprächspartner muss zum Gesprächsführer
 * passen — zum Führer **desselben Raums**. Wurde er immer im Hauptsaal
 * gesucht, richtete sich die Zusätzliche Klasse nach dem falschen Platz; die
 * Auto-Zuteilung macht es richtig und begründet es ausdrücklich (planning.ts).
 */
function geschlechtsPruefung(
  state: KandidatenDaten,
  sel: Exclude<SlotSelection, { kind: 'fs' }>,
): (p: Person) => boolean {
  if (sel.kind !== 'part') return () => true
  const item = state.weeks[sel.wi]?.[sel.tab].sections[sel.si]?.items[sel.ii]
  if (!item || isSong(item)) return () => true
  const plaetze = slotsOf(item, sel.aux === true)
  const platz = plaetze[sel.ni]
  const fuehrerPlatz =
    sel.priv === 'schulungPartner'
      ? plaetze.find((n, i) => i !== sel.ni && n.bereichsKey === 'schulung')
      : undefined
  // Über `gehoertZu`, nicht über den Namen: Trägt der Führer-Platz eine
  // `pid` — und das tut er, sobald ihn jemand zugeteilt hat —, ist sie der
  // Anhalt. Am Namen allein entschied die Reihenfolge der Personenliste,
  // wer als Führer gilt; bei zwei Gleichnamigen verschiedenen Geschlechts
  // richtete sich die Partnerwahl danach nach dem Falschen.
  const fuehrer = fuehrerPlatz?.name
    ? state.persons.find((p) => gehoertZu(fuehrerPlatz, p))
    : undefined
  return (p: Person) => {
    if (platz?.male && p.female) return false
    if (sel.priv === 'schulungPartner' && !partnerGenderOk(fuehrer, p)) return false
    return true
  }
}
