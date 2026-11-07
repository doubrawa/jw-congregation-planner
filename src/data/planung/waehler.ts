/**
 * Der Wähler der Auto-Zuteilung: wer für einen Platz in Frage kommt und in
 * welcher Reihenfolge — Strichlisten, Abstände, Reinigungs-Malus und die
 * Regeln der Schülerteile.
 */

import { istAbwesend, type AbsenceSet } from '../absence'
import { allePlaetze, gespeicherteHelfer } from '../plaetze'
import { programmPlaetze, slotsOf } from '../aux-class'
import {
  displayName,
  isPlainPublisher,
  isQualified,
  istAusgefallen,
  MEETING_TABS,
  passtZumPaar,
  idAufloeser,
  reinigungsGruppen,
  serviceQualKey,
  type Zuteilung,
} from '../helpers'
import { lastFenster, laufendeWoche, partWorkload, tieHash, wochenAbstand, workloadOf } from '../auslastung'
import { festerWtLeiter } from './vorsitz'
import type { Group, Meeting, MeetingKey, PartItem, Person, Service, SlotAssignment, Week } from '../types'

/**
 * **Wer kommt in Frage, und wie ausgelastet ist er?**
 *
 * Die eine Hälfte der Auto-Zuteilung. Sie kennt die Kandidaten, führt die
 * Strichlisten und entscheidet die Reihenfolge — sie weiß aber nichts davon,
 * welche Plätze es gibt. Die andere Hälfte (die fünf Schritte in `automatik.ts`) weiß
 * das und fragt hier nur „wer?".
 *
 * Bis September 2026 stand beides in **einer** Funktion von 319 Zeilen, mit
 * fünf durchnummerierten Abschnitten und einer `if (doParts) {`-Klammer, deren
 * Rumpf nicht eingerückt war. Wer die Reinigungsrotation ändern wollte, las
 * vorher zweihundert Zeilen Strichlisten, Tie-Break und Schülerteil-Regeln.
 */

/**
 * Abstand (in Wochen) zur nächstgelegenen Einteilung je Person, gemessen über
 * **alle** geladenen Wochen — einmal nur für Aufgaben (`part`), einmal für
 * Aufgaben und Hilfsdienste (`any`). Wer nirgends vorkommt, fehlt in der Karte
 * und gilt als unendlich weit weg, kommt also zuerst.
 *
 * Warum zusätzlich zum Fenster: die Strichliste zählt nur ±LOAD_RADIUS Wochen. Bei
 * Schulungsaufgaben stehen dort fast alle Schwestern bei null, weil es mehr
 * Schwestern als Plätze gibt — die Zahl unterscheidet dann nichts mehr, und
 * ohne weiteres Kriterium entschiede der Tie-Break-Hash, der zwar streut, aber
 * nicht fragt, wer seit einem halben Jahr wartet. Der Abstand tut genau das.
 *
 * Gemessen wird der Betrag, nicht „davor": Wochen lassen sich in beliebiger
 * Reihenfolge planen. Wer in der Nachbarwoche schon eingeteilt ist, soll auch
 * dann hinten anstehen, wenn diese Woche die frühere ist.
 *
 * `je` misst dasselbe noch einmal **je Bereich** (Bereichsschlüssel des Slots,
 * bei Hilfsdiensten der Bereich des Dienstes). Denn gleich viele Aufgaben heißt
 * noch nicht gleich behandelt: die Strichliste zählt Gesprächsführer und
 * Gesprächspartner beide als eine Aufgabe, und wer im Ranking knapp vorn steht,
 * bekommt jede Woche den Führer-Platz, wer knapp dahinter steht, immer den
 * Partner-Platz. Über ein Jahr gemessen reichte das von „1× geführt / 9×
 * Partnerin" bis „8× / 2×", bei identischer Gesamtzahl. Dasselbe bei Brüdern,
 * die Bibellesung und Leser können.
 */
function assignmentDistance(
  weeks: Week[],
  weekIndex: number,
  wer: (z: Zuteilung | undefined) => string | undefined,
): { part: Map<string, number>; any: Map<string, number>; je: Map<string, Map<string, number>> } {
  const part = new Map<string, number>()
  const any = new Map<string, number>()
  const je = new Map<string, Map<string, number>>()
  const merkenJe = (bereich: string | undefined, id: string | undefined, d: number): void => {
    if (!bereich || !id) return
    let map = je.get(bereich)
    if (!map) { map = new Map(); je.set(bereich, map) }
    if ((map.get(id) ?? Infinity) > d) map.set(id, d)
  }
  const ziel = weeks[weekIndex]
  if (!ziel) return { part, any, je }
  for (const week of weeks) {
    // In Wochen gemessen, nicht in Einträgen (T36) — sonst zählt eine fehlende
    // Woche als Nachbarwoche.
    const d = wochenAbstand(week, ziel)
    const merken = (map: Map<string, number>, id: string | undefined): void => {
      if (id && (map.get(id) ?? Infinity) > d) map.set(id, d)
    }
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue // entfällt → keine Zuteilung (T30)
      const meeting = week[tab]
      const ratgeber = wer(meeting.auxRatgeber)
      merken(part, ratgeber)
      merken(any, ratgeber)
      merkenJe('ratgeber', ratgeber, d)
      for (const { slot } of programmPlaetze(meeting)) {
        const id = wer(slot)
        merken(part, id)
        merken(any, id)
        merkenJe(slot.bereichsKey, id, d)
      }
      for (const [key, arr] of Object.entries(meeting.helpers)) {
        for (const slot of arr) {
          const id = wer(slot)
          merken(any, id)
          merkenJe(serviceQualKey(key), id, d)
        }
      }
    }
  }
  return { part, any, je }
}

/**
 * Was die Wahl für einen Platz zusätzlich bestimmt: eine Bedingung (`extra`),
 * die Gesamtlast statt der Aufgabenlast (`byTotal`), ein Kreis, der nur als
 * letzte Wahl drankommt (`malus`).
 */
interface WahlOptionen {
  extra?: (p: Person) => boolean
  byTotal?: boolean
  malus?: (p: Person) => boolean
}

export interface Waehler {
  /** Beste noch freie Person für einen Platz — `null`, wenn niemand passt. */
  pick(kind: 'part' | 'helper', priv: string | null | undefined, opts?: WahlOptionen): Person | null
  /** Alle noch freien Personen für einen Platz, die beste zuerst — `pick` ist die erste. */
  rangfolge(kind: 'part' | 'helper', priv: string | null | undefined, opts?: WahlOptionen): Person[]
  /** Fester Wachtturm-Studium-Leiter, sonst Vertreter, sonst normale Auswahl. */
  pickConductor(): Person | null
  /** Dieselbe Wahl als Rangfolge: der feste Leiter (oder sein Vertreter) vor allen anderen. */
  rangfolgeLeiter(): Person[]
  /** Person auf den Platz setzen: eintragen, sperren, Strichlisten fortschreiben. */
  vergeben(kind: 'part' | 'helper', person: Person, slot: SlotAssignment): void
  /**
   * Eine Zuteilung, die keine Auswahl war — das Anfangsgebet folgt dem Vorsitz,
   * die Reinigung der Gruppe. Gezählt wird sie trotzdem; die Strichlisten
   * wachsen nur mit, wenn eine Person dahintersteht.
   */
  mitzaehlen(person?: Person): void
  /** Auflöser Zuteilung → Person-Id (nach Id, nicht nach Name). */
  werIst: (slot: Zuteilung | undefined) => string | undefined
  /**
   * Was die Reinigung in dieser Woche bekommt: die Gruppe der Rotation, ohne
   * angelegte Gruppen „Gruppe 1–3" — und nichts (`null`), wenn jede Gruppe aus
   * der Reinigung genommen ist. Dann bleibt ihr Platz offen.
   */
  reinigung: string | null
  /** Was dieser Lauf vergeben hat. */
  readonly ergebnis: { count: number; newly: string[] }
}

/**
 * **Wer in dieser Zusammenkunft reinigt** — für den Malus der Reinigung: die
 * Gruppen in den Plätzen der Gruppen-Dienste, auch eine inzwischen aus der
 * Reinigung genommene (sie bleibt eingetragen, bis der Platz neu besetzt wird);
 * ein noch leerer Platz bekommt gleich die Gruppe der Rotation (`rotation`).
 * Bis zum 18.10.2026 galt der Malus allein der Rotation — stand eine andere
 * Gruppe im Platz, bekam deren Aufseher Hilfsdienste, und der Aufseher der
 * Rotation wurde geschont, obwohl er nicht reinigte.
 */
function reinigendeGruppen(meeting: Meeting, services: Service[], groups: Group[], rotation: Group | null): Group[] {
  const namen = new Set<string>()
  for (const svc of services) {
    if (!svc.groups) continue
    for (let pos = 0; pos < svc.count; pos++) {
      const name = meeting.helpers[svc.key]?.[pos]?.name || rotation?.name
      if (name) namen.add(name)
    }
  }
  return groups.filter((g) => namen.has(g.name))
}

/**
 * **Wer in dieser Zusammenkunft schon eingeteilt ist** — als Person-Ids. Nach
 * Id: zwei Personen desselben Namens sperrten sich sonst gegenseitig, obwohl
 * nur eine dran ist.
 *
 * Über **alle vier Platzsorten**: die Plätze der Zusätzlichen Klasse sind
 * gleichwertige Zuteilungen. Gelesen wurde hier lange nur `item.names` — wer
 * von Hand in die Klasse eingeteilt war, fehlte in dieser Menge und bekam vom
 * nächsten Lauf zusätzlich einen Platz im Hauptsaal. Dieselbe Person zur
 * selben Zeit in zwei Räumen, und niemand sah es: die Klasse steht in der
 * Ansicht daneben, nicht darin. Die Hilfsdienste über **alles Gespeicherte**:
 * Wer hinter einer nachträglich verkleinerten Platzzahl steht, ist trotzdem
 * eingeteilt und darf nicht zusätzlich drankommen.
 *
 * Damit beginnt die Sperrliste der Automatik (`waehler`), und dasselbe fragt
 * der feste Studienleiter einer neuen Woche (`festenWtLeiterEintragen`).
 */
export function eingeteilte(meeting: Meeting, werIst: (z: Zuteilung | undefined) => string | undefined): Set<string> {
  const ids = new Set<string>()
  const merken = (slot: Zuteilung | undefined): void => {
    const id = werIst(slot)
    if (id) ids.add(id)
  }
  for (const platz of allePlaetze(meeting)) merken(platz.slot)
  for (const { slot } of gespeicherteHelfer(meeting)) merken(slot)
  return ids
}

export function waehler(
  weeks: Week[],
  weekIndex: number,
  tab: MeetingKey,
  meeting: Meeting,
  persons: Person[],
  services: Service[],
  groups: Group[],
  abwesend: AbsenceSet,
): Waehler {
  // Reinigungs-Regel: Aufseher und Gehilfe der Gruppe, die in dieser Woche
  // reinigt, sollen möglichst keinen weiteren Hilfsdienst bekommen (sie sind mit
  // der Reinigung beschäftigt). Umgesetzt als weicher Malus bei der
  // Hilfsdienst-Auswahl — greift nur, solange genug andere Kandidaten da sind.
  //
  // Gezählt wird im Kalender, nicht im Ladefenster (`laufendeWoche`): Das rutscht
  // mit jedem Import, und ab 52 Wochen reinigte sonst jede Woche dieselbe Gruppe.
  // Reihum geht es nur unter den Gruppen, die reinigen (`reinigungsGruppen`).
  const woche = laufendeWoche(weeks, weekIndex)
  const reihe = reinigungsGruppen(groups)
  const cleaningGroup = reihe.length ? (reihe[woche % reihe.length] ?? null) : null
  // Ohne angelegte Gruppen rotiert die Reinigung über „Gruppe 1–3". Sind welche
  // da und alle herausgenommen, reinigt keine — erfunden wird dann auch keine.
  const reinigung = cleaningGroup?.name ?? (groups.length === 0 ? `Gruppe ${1 + (woche % 3)}` : null)
  const cleaningLeaders = new Set<string>()
  for (const gruppe of reinigendeGruppen(meeting, services, groups, cleaningGroup)) {
    for (const pid of [gruppe.overseerId, gruppe.assistantId]) {
      if (pid && persons.some((p) => p.id === pid)) cleaningLeaders.add(pid)
    }
  }
  const HELPER_MALUS = 1e6

  // Auflöser Zuteilung → Person-Id; alle Mengen und Strichlisten unten sind
  // nach Id geführt, nicht nach Name (siehe idAufloeser).
  const werIst = idAufloeser(persons)

  // Wer in dieser Zusammenkunft schon eingeteilt ist — die Sperrliste, die der
  // Lauf in `vergeben` fortschreibt.
  const used = eingeteilte(meeting, werIst)

  // Gleitendes Fenster: nur ±LOAD_RADIUS Wochen um die geplante Woche zählen,
  // damit uralte Einteilungen die aktuelle Verteilung nicht verzerren. Dasselbe
  // Fenster, das im Zuteilungs-Sheet unter dem Namen steht („2 Aufgaben in 5
  // Wochen") — sonst sortiert die Automatik nach einer anderen Zahl, als der
  // Planer liest. Gemessen wird in Wochen, nicht in Einträgen (`lastFenster`).
  const windowWeeks = lastFenster(weeks, weekIndex)

  /*
   * Zwei Live-Strichlisten (Startwert aus dem Fenster, während des Laufs
   * hochgezählt): partLoad = nur Aufgaben, totalLoad = Aufgaben + Hilfsdienste.
   *
   * **Der Startwert wird gemerkt, nicht jedes Mal neu gezählt.** Hier stand
   * `partLoad.get(p.id) ?? partWorkload(windowWeeks, p)` — ein Rückfall ohne
   * Ablage: Wer noch nicht zugeteilt war, stand in keiner Liste, und seine Last
   * wurde bei **jedem** Blick neu über fünf Wochen gezählt. Angesehen wird sie
   * aber im Vergleicher von `sort`, also rund `n log n` Mal je Platz.
   *
   * Gemessen (300 Personen, alle qualifiziert, eine Zusammenkunft): 620 ms —
   * spürbar eingefrorene Oberfläche, und der Reducer läuft synchron im Klick.
   * Mit der Ablage sind es 21 ms. Am Ergebnis ändert sich nichts: `windowWeeks`
   * steht vor dem Lauf fest und wird nicht mitgeschrieben (`klonWoche` gibt
   * eine eigene Kopie zurück), die Zahl kann sich also gar nicht ändern —
   * fortgeschrieben wird sie ausschließlich in `vergeben`.
   */
  const partLoad = new Map<string, number>()
  const totalLoad = new Map<string, number>()
  const gemerkt = (liste: Map<string, number>, p: Person, zaehle: () => number): number => {
    const fertig = liste.get(p.id)
    if (fertig !== undefined) return fertig
    const wert = zaehle()
    liste.set(p.id, wert)
    return wert
  }
  const pl = (p: Person): number => gemerkt(partLoad, p, () => partWorkload(windowWeeks, p))
  const tl = (p: Person): number => gemerkt(totalLoad, p, () => workloadOf(windowWeeks, p, services))

  // Abstand zur nächstgelegenen Einteilung über ALLE geladenen Wochen — der
  // Tie-Break, sobald im Fenster mehrere bei null stehen (der Normalfall bei
  // Schulungsaufgaben: mehr Schwestern als Plätze). Ohne ihn entschiede dort
  // der Zufallshash und niemand fragt, wer am längsten wartet.
  const { part: partDist, any: anyDist, je: bereichDist } = assignmentDistance(weeks, weekIndex, werIst)

  /** Tie-Break-Wert je Person — für diesen Lauf konstant (siehe `sort` unten). */
  const tieWerte = new Map<string, number>()
  const tie = (p: Person): number =>
    gemerkt(tieWerte, p, () => tieHash(`${displayName(p)}|${woche}|${tab}`))

  const ergebnis = { count: 0, newly: [] as string[] }

  const rangfolge: Waehler['rangfolge'] = (kind, priv, opts = {}) => {
    // Aufgaben nach Aufgaben-Last, Hilfsdienste nach Gesamtlast. byTotal erzwingt
    // die Gesamtlast auch für Aufgaben — für Schülerteile, damit Schwestern (die
    // sonst wenig Last tragen) automatisch häufiger drankommen, Brüder aber nicht.
    const byTotal = opts.byTotal || kind === 'helper'
    const load = byTotal ? tl : pl
    const dist = (p: Person): number => (byTotal ? anyDist : partDist).get(p.id) ?? Infinity
    const distB = (p: Person): number =>
      (priv ? bereichDist.get(priv)?.get(p.id) : undefined) ?? Infinity
    // Malus (letzte Wahl): Reinigungs-Aufseher bei Hilfsdiensten; zusätzlich der
    // per opts.malus markierte Kreis (z. B. Älteste/DAG bei Gesprächsteilen).
    const eff = (p: Person): number => {
      let e = load(p)
      if (kind === 'helper' && cleaningLeaders.has(p.id)) e += HELPER_MALUS
      if (opts.malus?.(p)) e += HELPER_MALUS
      return e
    }
    const candidates = persons.filter(
      (p) =>
        (!priv || isQualified(p, priv)) &&
        !istAbwesend(abwesend, p.id, weekIndex, tab) &&
        (!opts.extra || opts.extra(p)) &&
        !used.has(p.id),
    )
    return candidates.sort(
      (a, b) =>
        eff(a) - eff(b) ||
        // Gleiche Last → wer am längsten nicht dran war, kommt zuerst.
        dist(b) - dist(a) ||
        // Danach erst der Bereich — nie davor: sonst rotiert jeder Bereich für
        // sich und dieselbe Person landet drei Wochen in Folge in dreien.
        distB(b) - distB(a) ||
        // Der Tie-Break-Schlüssel bleibt der Name: er soll sich lesbar aus der
        // Person ergeben und nicht aus einer zufälligen UUID, die bei jeder
        // Neuanlage eine andere Reihenfolge ergäbe. Einmal je Person statt
        // einmal je Vergleich — Woche und Reiter stehen für den ganzen Lauf
        // fest, der Wert kann sich also nicht ändern.
        tie(a) - tie(b),
    )
  }
  const pick: Waehler['pick'] = (kind, priv, opts) => rangfolge(kind, priv, opts)[0] ?? null

  const rangfolgeLeiter = (): Person[] => {
    const fest = festerWtLeiter(persons, (p) => !istAbwesend(abwesend, p.id, weekIndex, tab) && !used.has(p.id))
    const uebrige = rangfolge('part', 'studium')
    return fest ? [fest, ...uebrige.filter((p) => p.id !== fest.id)] : uebrige
  }

  return {
    werIst,
    reinigung,
    ergebnis,
    pick,
    rangfolge,
    rangfolgeLeiter,

    pickConductor() {
      return rangfolgeLeiter()[0] ?? null
    },

    vergeben(kind, person, slot) {
      slot.name = displayName(person)
      slot.pid = person.id
      used.add(person.id)
      totalLoad.set(person.id, tl(person) + 1)
      if (kind === 'part') partLoad.set(person.id, pl(person) + 1)
      ergebnis.newly.push(displayName(person))
      ergebnis.count++
    },

    mitzaehlen(person) {
      // Die Strichliste nur führen, wenn die Person auflösbar ist: bei einem
      // externen Vorsitz (kein Eintrag in `persons`) gibt es keine Auslastung
      // zu erhöhen — vorher landete dort der blanke Name als eigener Schlüssel.
      if (person) {
        totalLoad.set(person.id, tl(person) + 1)
        partLoad.set(person.id, pl(person) + 1)
      }
      ergebnis.count++
    },
  }
}

/**
 * Auswahl-Optionen für einen Schülerteil-Slot (gold): Vortrag → männlich;
 * Gesprächsführer/-partner → Gesamtlast (Schwestern zuerst), Älteste/DAG nur
 * als letzte Wahl (Malus); beide passend zum anderen Platz des Paars
 * (`passtZumPaar`) — gleich, welcher zuerst besetzt ist.
 */
export function schuelerteilOpts(
  item: PartItem,
  slot: SlotAssignment,
  aux: boolean,
  persons: Person[],
): WahlOptionen {
  if (slot.male) return nurBrueder()
  if (slot.bereichsKey === 'schulung' || slot.bereichsKey === 'schulungPartner') {
    return {
      byTotal: true,
      malus: (p: Person) => !isPlainPublisher(p),
      // Zum Gegenüber DESSELBEN Raums — sonst richtete sich die Zusätzliche
      // Klasse nach dem Hauptsaal.
      extra: passtZumPaar(slotsOf(item, aux), slot, persons),
    }
  }
  return {}
}

/** Ein Platz nur für Brüder (`male`) — Schülervortrag, Ratgeber. */
function nurBrueder(): WahlOptionen {
  return { extra: (p: Person) => !p.female }
}

/**
 * Der Ratgeber der Zusätzlichen Klasse trägt `male` (`ratgeberSlot`) — der Rat
 * gehört einem Ältesten. Die Automatik und die Rangfolge im Blatt fragten das
 * bis zum 16.10.2026 nicht, das Angebot freier Plätze schon: Eine Schwester mit
 * versehentlich gesetztem Bereich wurde Ratgeber.
 */
export function ratgeberOpts(ratgeber: SlotAssignment): WahlOptionen {
  return ratgeber.male ? nurBrueder() : {}
}
