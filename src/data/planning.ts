/**
 * Zuteilungslogik — Kernregeln aus dem Design-Handoff ("Interaktionen &
 * Verhalten"): nur Qualifizierte, Abwesende blockiert, Auslastung über alle
 * geladenen Wochen, Auto-Zuteilung wählt geringste Auslastung, Reinigung
 * rotiert über die Predigtdienstgruppen (Wochenindex mod Gruppenzahl),
 * Gastredner-Slots werden übersprungen.
 *
 * Alle Funktionen sind pur (Eingaben bleiben unverändert) — geeignet für
 * den Reducer und später direkt testbar.
 */

import { istAbwesend, KEINE_ABWESENHEIT, type AbsenceSet } from './absence'
import { allePlaetze, gespeicherteHelfer, platzKey } from './plaetze'
import { programmPlaetze, RATGEBER_ROLLE, ratgeberSlot, slotsOf } from './aux-class'
import {
  dieselbePerson,
  displayName,
  gehoertZu,
  gehoertZuKennung,
  isGuestRole,
  isPlainPublisher,
  klonWoche,
  istArt,
  istBlockSektion,
  isQualified,
  isSong,
  istAusgefallen,
  MEETING_TABS,
  partnerGenderOk,
  idAufloeser,
  ROLE_GUEST_SPEAKER,
  ROLE_OWN_SPEAKER,
  rolleBasis,
  rolleMitHerkunft,
  serviceQualKey,
  type Zuteilung,
} from './helpers'
import { lastFenster, laufendeWoche, partWorkload, tieHash, wochenAbstand, workloadOf } from './auslastung'
import { istVorbei, meetingDateMs, meetingDateText } from './meeting-dates'
import {
  helferKey,
  punktKey,
  punktStamm,
  ratgeberKey,
  schluesselTeile,
} from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { ersteZahl } from './ziffern'
import type {
  ConfirmationMap,
  Group,
  Meeting,
  MeetingAssignment,
  MeetingKey,
  MeetingTimes,
  MeetingSlotSelection,
  MyTask,
  PartItem,
  Person,
  S89Payload,
  Service,
  SlotAssignment,
  SlotSelection,
  SubstituteReq,
  TaskStatus,
  Week,
} from './types'

/**
 * Rollen, die die Auto-Zuteilung nicht besetzt (kommen von außen).
 *
 * Das Vokabular selbst steht in `helpers.ts` — dort, wo `gehoertZu` entscheidet,
 * wem eine Zuteilung gehört, und wo es deshalb gebraucht wird (`helpers.ts` ist
 * die untere Schicht und darf nicht auf `planning.ts` zugreifen). Gefragt wird
 * über `isGuestRole` — eine zweite Abschrift des Ausdrucks wäre eine zweite
 * Gelegenheit, das Vokabular zu ändern und hier zu vergessen.
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

/** Aktueller Name auf einem Slot ("" = offen). */
export function slotValue(weeks: Week[], sel: MeetingSlotSelection): string {
  const meeting = weeks[sel.wi]?.[sel.tab]
  if (!meeting) return ''
  if (sel.kind === 'ratgeber') return meeting.auxRatgeber?.name ?? ''
  if (sel.kind === 'part') {
    const item = meeting.sections[sel.si]?.items[sel.ii]
    return !item || isSong(item) ? '' : (slotsOf(item, sel.aux === true)[sel.ni]?.name ?? '')
  }
  return meeting.helpers[sel.svc]?.[sel.pos]?.name ?? ''
}

/**
 * Alle Zuteilungen, die `name` in dieser Zusammenkunft schon hat (Programmpunkte
 * + Hilfsdienste), außer dem gerade bearbeiteten Slot `exclude`. Damit sieht der
 * Planer beim Zuteilen, wen er am selben Tag nicht versehentlich doppelt verplant.
 */
export function assignmentsInMeeting(
  meeting: Meeting,
  person: Person,
  services: Service[],
  exclude?: SlotSelection,
): MeetingAssignment[] {
  const out: MeetingAssignment[] = []
  // Programm (beide Räume) und Ratgeber in einem Durchlauf: die Plätze der
  // Zusätzlichen Klasse sind gleichwertige Zuteilungen. Ohne sie blieb der
  // Hinweis „heute schon zugeteilt" aus, das Dashboard zeigte „frei" für
  // jemanden, der in der Klasse eingeteilt war, und takeSubstitute übersah den
  // Konflikt.
  for (const platz of allePlaetze(meeting)) {
    if (!gehoertZu(platz.slot, person)) continue
    if (platz.art === 'ratgeber') {
      out.push({ text: RATGEBER_ROLLE, lang: 'u' })
      continue
    }
    const { slot, si, item, ii, ni, aux } = platz
    if (
      exclude?.kind === 'part' &&
      exclude.si === si &&
      exclude.ii === ii &&
      exclude.ni === ni &&
      (exclude.aux === true) === aux
    ) {
      continue
    }
    const rolle = slot.rolle ?? ''
    // Rolle bevorzugen (Vorsitz/Gebet/Leiter/Leser …), sonst den Titel.
    if (rolle) out.push({ text: rolle, lang: 'u' })
    else out.push({ text: item.title, lang: 'p' })
  }
  // Hilfsdienste über **alles Gespeicherte**, nicht nur bis `svc.count`: Wer
  // hinter einer nachträglich verkleinerten Platzzahl steht, ist an diesem Tag
  // trotzdem eingeteilt (siehe `gespeicherteHelfer`).
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    arr.forEach((slot, pos) => {
      if (!gehoertZu(slot, person)) return
      if (exclude?.kind === 'helper' && exclude.svc === svc.key && exclude.pos === pos) return
      out.push({ text: svc.name, lang: 'u' })
    })
  }
  return out
}

/** Setzt einen Slot auf `name` ("" = Zuteilung entfernen). */
export function assignSlot(
  weeks: Week[],
  sel: MeetingSlotSelection,
  name: string,
  rolle?: string,
  pid?: string,
  herkunft?: string,
): Week[] {
  const next = klonWoche(weeks, sel.wi)
  if (!next) return weeks
  // Zeigt die Auswahl ins Leere — die Woche ist aus dem geladenen Fenster
  // gerutscht, der Punkt wurde nebenher gelöscht —, bleibt alles, wie es war.
  // Vorher warf der Zugriff, und das mitten im Reducer (T42).
  const meeting = next[sel.wi]?.[sel.tab]
  if (!meeting) return weeks
  if (sel.kind === 'ratgeber') {
    meeting.auxRatgeber = { ...ratgeberSlot(meeting), name }
    if (name && pid) meeting.auxRatgeber.pid = pid
    else delete meeting.auxRatgeber.pid
  } else if (sel.kind === 'part') {
    const item = meeting.sections[sel.si]?.items[sel.ii]
    // Kein Punkt, ein Lied oder kein solcher Platz: nichts zu setzen. Dann die
    // **Eingabe** zurückgeben, nicht den unveränderten Klon — Reducer und
    // persist.ts entscheiden über die Identität, ob gespeichert werden muss.
    // Ein gleicher, aber neuer Klon löste ein Schreiben ohne Änderung aus.
    if (!item || isSong(item)) return weeks
    const slot = slotsOf(item, sel.aux === true)[sel.ni]
    if (!slot) return weeks
    slot.name = name
    // Person-Id als stabile Identität mitführen; beim Entfernen bzw. bei
    // externen Rednern (kein pid) das Feld sauber löschen.
    if (name && pid) slot.pid = pid
    else delete slot.pid
    // Rolle und Herkunft getrennt: die Rolle trägt die Regel, die Versammlung
    // wird nur angezeigt. Ein leerer Wert löscht das Feld, statt eine leere
    // Zeichenkette zu hinterlassen.
    if (rolle !== undefined) slot.rolle = rolle
    if (herkunft !== undefined) {
      if (herkunft) slot.herkunft = herkunft
      else delete slot.herkunft
    }
  } else {
    const arr = meeting.helpers[sel.svc] ?? []
    while (arr.length <= sel.pos) arr.push({ name: '' })
    arr[sel.pos] = name && pid ? { name, pid } : { name }
    meeting.helpers[sel.svc] = arr
  }
  return next
}

/**
 * Offene Zuteilungen in einer Ansicht (Programmpunkte + Hilfsdienst-Plätze).
 * Die Plätze der Zusätzlichen Klasse zählen mit — sie sind ebenso zu besetzen;
 * ohne sie meldete der Planen-Kopf „alles zugeteilt", während die halbe Klasse
 * noch offen wäre. Ist keine eingerichtet, gibt es sie schlicht nicht.
 */
export function countOpenSlots(meeting: Meeting, services: Service[]): number {
  let count = 0
  for (const platz of allePlaetze(meeting, services)) if (!platz.slot?.name) count++
  return count
}

/**
 * Steht auf einem Platz noch dieselbe Besetzung? Leer bleibt leer; sonst
 * entscheidet `dieselbePerson` — die Person-Id, wo beide Seiten eine tragen.
 */
function gleicheBesetzung(
  a: { name: string; pid?: string } | undefined,
  b: { name: string; pid?: string } | undefined,
): boolean {
  const vorher = { name: a?.name ?? '', pid: a?.pid }
  const nachher = { name: b?.name ?? '', pid: b?.pid }
  if (!vorher.name || !nachher.name) return vorher.name === nachher.name
  return dieselbePerson(vorher, nachher)
}

/**
 * task_keys aller Slots, deren Besetzung sich zwischen zwei Ständen derselben
 * Zusammenkunft geändert hat (Zuteilen, Entfernen, Auto-Zuteilung). Für diese
 * Slots wird der Bestätigungs-Status abgeräumt — sonst erbt die neu
 * eingeteilte Person ein fremdes „bestätigt“/„verhindert“.
 *
 * **Verglichen wird die Person, nicht der Name** (15. September 2026). Am Namen
 * gemessen erbte ein Namensvetter mit anderer Person-Id die Zusage seines
 * Vorgängers — und die Ampel im Planen zeigte ihn grün, obwohl er nie gefragt
 * worden war. Dieselbe Rangfolge wie bei den Treffpunkten
 * (`fsVerwaisteZusagen`) und beim Entzug (`entzogeneZusagen`).
 *
 * **Der Punkt von vorher wird über seine Kennung gesucht, nicht über seine
 * Stelle in der Liste.** Hier stand `prev.sections[si]?.items[ii]` — dieselbe
 * Position, ein anderer Punkt, sobald eine Aktion umsortiert und zuteilt
 * zugleich. Der Schlüssel wurde längst über die Kennung gebildet; nur diese
 * Hälfte war noch positionsbasiert, und sie hätte die Zusage des falschen
 * Punkts abgeräumt.
 */
export function changedSlotKeys(
  prev: Meeting,
  next: Meeting,
  services: Service[],
  woche: string,
  tab: MeetingKey,
): string[] {
  const keys: string[] = []
  const vorherNachKennung = new Map<string, PartItem>()
  for (const section of prev.sections) {
    for (const item of section.items) if (!isSong(item)) vorherNachKennung.set(item.iid, item)
  }
  for (const platz of allePlaetze(next, services)) {
    if (platz.art === 'programm') {
      const prevItem = vorherNachKennung.get(platz.item.iid)
      const vorher = prevItem ? slotsOf(prevItem, platz.aux) : []
      if (!gleicheBesetzung(vorher[platz.ni], platz.slot)) keys.push(platzKey(platz, woche, tab))
    } else if (platz.art === 'helper') {
      const prevArr = prev.helpers[platz.svc.key] ?? []
      if (!gleicheBesetzung(prevArr[platz.pos], platz.slot)) keys.push(platzKey(platz, woche, tab))
    }
    // Der Ratgeber steht darunter, nicht hier: Ein Durchlauf über **eine**
    // Seite sähe nicht, dass es ihn vorher gab und jetzt nicht mehr.
  }
  if (!gleicheBesetzung(prev.auxRatgeber, next.auxRatgeber)) {
    keys.push(ratgeberKey(woche, tab))
  }
  return keys
}

/** Offener Slot fürs Planen-Banner (lang wie MeetingAssignment: 'u'|'p'). */
export interface OpenSlot {
  text: string
  lang: 'u' | 'p'
  /**
   * Rolle hinter dem Titel („Versammlungsbibelstudium · Leiter"), **immer**
   * App-Sprache. Sie steht als eigenes Feld und nicht im Text, weil beide
   * Hälften aus verschiedenen Wörterbüchern kommen: der Titel aus der Sprache
   * der Versammlung (`tpw`), die Rolle aus der des Lesers (`tu`). In einem
   * String zusammengefügt bekäme eine der beiden die falsche.
   */
  rolle?: string
  n: number // Anzahl offener Plätze (Hilfsdienste können mehrere haben)
}

/**
 * Offene Slots einer Zusammenkunft mit Beschriftung — gleiche Konvention wie
 * assignmentsInMeeting: Rolle bevorzugt (App-Sprache), sonst Titel
 * (Programmsprache); Hilfsdienste je Dienst gebündelt mit Anzahl.
 */
export function openSlotLabels(meeting: Meeting, services: Service[]): OpenSlot[] {
  const out: OpenSlot[] = []
  // Derselbe Durchlauf, den `countOpenSlots` zählt — vorher nannte der
  // Planen-Kopf eine höhere Zahl, als das Banner darunter auflistete.
  // Hilfsdienste werden gebündelt: ein Eintrag je Dienst mit seiner Anzahl.
  const offenJeDienst = new Map<Service, number>()
  for (const platz of allePlaetze(meeting, services)) {
    if (platz.slot?.name) continue
    if (platz.art === 'helper') {
      offenJeDienst.set(platz.svc, (offenJeDienst.get(platz.svc) ?? 0) + 1)
      continue
    }
    if (platz.art === 'ratgeber') {
      out.push({ text: RATGEBER_ROLLE, lang: 'u', n: 1 })
      continue
    }
    // Dieselbe Regel wie in der Aufgabenliste (`zuteilungsLabel`), nur in zwei
    // Atomen statt einem — Titel und Rolle kommen aus verschiedenen Sprachen
    // (siehe OpenSlot.rolle).
    const rolle = rolleMitHerkunft(platz.slot) ?? ''
    out.push(
      rolle && istBlockSektion(platz.section)
        ? { text: rolle, lang: 'u', n: 1 }
        : { text: platz.item.title, lang: 'p', rolle: rolle || undefined, n: 1 },
    )
  }
  for (const [svc, n] of offenJeDienst) out.push({ text: svc.name, lang: 'u', n })
  return out
}

export interface AutoAssignResult {
  weeks: Week[]
  count: number // Anzahl vergebener Zuteilungen
  newly: string[] // neu vergebene Personennamen (Mitteilungstexte, Tests)
  unfilled: number // offen gebliebene Slots ohne passenden/freien Kandidaten
}

/** Umfang der Auto-Zuteilung: nur Programmpunkte, nur Hilfsdienste, oder beides. */
export type AssignScope = 'all' | 'parts' | 'helpers'

/**
 * **Wer kommt in Frage, und wie ausgelastet ist er?**
 *
 * Die eine Hälfte der Auto-Zuteilung. Sie kennt die Kandidaten, führt die
 * Strichlisten und entscheidet die Reihenfolge — sie weiß aber nichts davon,
 * welche Plätze es gibt. Die andere Hälfte (die fünf Schritte darunter) weiß
 * das und fragt hier nur „wer?".
 *
 * Bis September 2026 stand beides in **einer** Funktion von 319 Zeilen, mit
 * fünf durchnummerierten Abschnitten und einer `if (doParts) {`-Klammer, deren
 * Rumpf nicht eingerückt war. Wer die Reinigungsrotation ändern wollte, las
 * vorher zweihundert Zeilen Strichlisten, Tie-Break und Schülerteil-Regeln.
 */
interface Waehler {
  /** Beste noch freie Person für einen Platz — `null`, wenn niemand passt. */
  pick(
    kind: 'part' | 'helper',
    priv: string | null | undefined,
    opts?: { extra?: (p: Person) => boolean; byTotal?: boolean; malus?: (p: Person) => boolean },
  ): Person | null
  /** Fester Wachtturm-Studium-Leiter, sonst Vertreter, sonst normale Auswahl. */
  pickConductor(): Person | null
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
  /** Gruppe, die in dieser Woche reinigt — `null` ohne konfigurierte Gruppen. */
  cleaningGroup: Group | null
  /** Was dieser Lauf vergeben hat. */
  readonly ergebnis: { count: number; newly: string[] }
}

function waehler(
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
  const woche = laufendeWoche(weeks, weekIndex)
  const cleaningGroup = groups.length ? (groups[woche % groups.length] ?? null) : null
  const cleaningLeaders = new Set<string>()
  for (const pid of [cleaningGroup?.overseerId, cleaningGroup?.assistantId]) {
    if (pid && persons.some((p) => p.id === pid)) cleaningLeaders.add(pid)
  }
  const HELPER_MALUS = 1e6

  // Auflöser Zuteilung → Person-Id; alle Mengen und Strichlisten unten sind
  // nach Id geführt, nicht nach Name (siehe idAufloeser).
  const werIst = idAufloeser(persons)

  // Wer in dieser Zusammenkunft schon eingeteilt ist. Nach Id: zwei Personen
  // desselben Namens sperrten sich sonst gegenseitig, obwohl nur eine dran ist.
  //
  // Über **alle vier Platzsorten**: die Plätze der Zusätzlichen Klasse sind
  // gleichwertige Zuteilungen. Gelesen wurde hier lange nur `item.names` — wer
  // von Hand in die Klasse eingeteilt war, fehlte in dieser Menge und bekam vom
  // nächsten Lauf zusätzlich einen Platz im Hauptsaal. Dieselbe Person zur
  // selben Zeit in zwei Räumen, und niemand sah es: die Klasse steht in der
  // Ansicht daneben, nicht darin.
  const used = new Set<string>()
  const merken = (slot: Zuteilung | undefined): void => {
    const id = werIst(slot)
    if (id) used.add(id)
  }
  for (const platz of allePlaetze(meeting)) merken(platz.slot)
  // Hilfsdienste über **alles Gespeicherte**: Wer hinter einer nachträglich
  // verkleinerten Platzzahl steht, ist trotzdem eingeteilt und darf nicht
  // zusätzlich drankommen.
  for (const { slot } of gespeicherteHelfer(meeting)) merken(slot)

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

  const pick: Waehler['pick'] = (kind, priv, opts = {}) => {
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
    if (candidates.length === 0) return null
    candidates.sort(
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
    return candidates[0] ?? null
  }

  return {
    werIst,
    cleaningGroup,
    ergebnis,
    pick,

    pickConductor() {
      const designated = (flag: 'wtLeiter' | 'wtVertreter'): Person | undefined =>
        persons.find(
          (p) => p.priv[flag] && !istAbwesend(abwesend, p.id, weekIndex, tab) && !used.has(p.id),
        )
      return designated('wtLeiter') ?? designated('wtVertreter') ?? pick('part', 'studium')
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
 * als letzte Wahl (Malus); Partner zusätzlich gleiches Geschlecht wie der Führer.
 */
function schuelerteilOpts(
  item: PartItem,
  slot: SlotAssignment,
  aux: boolean,
  persons: Person[],
): { extra?: (p: Person) => boolean; byTotal?: boolean; malus?: (p: Person) => boolean } {
  if (slot.male) return { extra: (p: Person) => !p.female }
  if (slot.bereichsKey === 'schulung') {
    return { byTotal: true, malus: (p: Person) => !isPlainPublisher(p) }
  }
  if (slot.bereichsKey === 'schulungPartner') {
    // Der Gesprächspartner muss zum Führer DESSELBEN Raums passen — sonst
    // richtete sich die Zusätzliche Klasse nach dem Hauptsaal.
    const leadPlatz = slotsOf(item, aux).find((n) => n.bereichsKey === 'schulung')
    // Über `gehoertZu`, nicht über den Namen: Trägt der Führer-Platz eine
    // `pid` — und das tut er, sobald ihn jemand zugeteilt hat —, ist sie der
    // Anhalt. Am Namen allein entschied die Reihenfolge der Personenliste,
    // wer als Führer gilt; bei zwei Gleichnamigen verschiedenen Geschlechts
    // richtete sich die Partnerwahl danach nach dem Falschen.
    const lead = leadPlatz?.name ? persons.find((p) => gehoertZu(leadPlatz, p)) : undefined
    return {
      byTotal: true,
      malus: (p: Person) => !isPlainPublisher(p),
      extra: (p: Person) => partnerGenderOk(lead, p),
    }
  }
  return {}
}

/**
 * 1) Den Wachtturm-Studium-Leiter zuerst reservieren, damit ihn kein anderer
 *    Platz wegnimmt. Nur das Wochenende hat diesen Abschnitt.
 *
 * Alle fünf Schritte geben zurück, wie viele Plätze sie offen lassen mussten.
 */
function wtLeiterZuerst(meeting: Meeting, w: Waehler): number {
  let unfilled = 0
  for (const section of meeting.sections) {
    if (!istArt(section, 'wtStudium')) continue
    for (const item of section.items) {
      if (isSong(item)) continue
      for (const slot of item.names) {
        if (slot.rolle !== 'Leiter' || slot.name) continue
        const person = w.pickConductor()
        if (person) w.vergeben('part', person, slot)
        else unfilled++
      }
    }
  }
  return unfilled
}

/**
 * 2) Die übrigen Programmpunkte — beide Räume in derselben Schleife: Ihre
 *    Plätze sind gleichwertige Aufgaben und teilen sich die Sperrliste mit dem
 *    Hauptsaal; niemand kann zur selben Zeit in beiden Räumen sein.
 *
 * Das Anfangsgebet bleibt aus und wird in Schritt 4 an den Vorsitz gekoppelt.
 */
function programmpunkteBesetzen(meeting: Meeting, w: Waehler, persons: Person[]): number {
  let unfilled = 0
  for (const { slot, section, item, aux } of programmPlaetze(meeting)) {
    if (slot.name || isGuestRole(slot.rolle)) continue
    if (istArt(section, 'eroeffnung') && slot.rolle === 'Gebet') continue
    // Schülerteile (gold): Geschlecht/Partner/Verteilung berücksichtigen.
    const person = w.pick('part', slot.bereichsKey, schuelerteilOpts(item, slot, aux, persons))
    if (person) w.vergeben('part', person, slot)
    else unfilled++
  }
  return unfilled
}

/**
 * 3) Der Ratgeber der Zusätzlichen Klasse — eigener Bereich, eine Person je
 *    Zusammenkunft, und nur, wenn die Woche überhaupt eine Klasse hat.
 */
function ratgeberBesetzen(meeting: Meeting, w: Waehler): number {
  const ratgeber = meeting.auxRatgeber
  if (!ratgeber || ratgeber.name) return 0
  const person = w.pick('part', 'ratgeber')
  if (!person) return 1
  w.vergeben('part', person, ratgeber)
  return 0
}

/**
 * 4) Der Vorsitz betet zu Beginn (Standard, von Hand änderbar) — die einzige
 *    erlaubte Doppel-Aufgabe. Gekoppelt wird nur, solange das Gebet offen ist.
 */
function gebetAnVorsitz(meeting: Meeting, w: Waehler, persons: Person[]): void {
  const opening = meeting.sections.find((s) => istArt(s, 'eroeffnung'))
  if (!opening) return
  const openingSlots = opening.items.flatMap((i) => (isSong(i) ? [] : i.names))
  const vorsitzSlot = openingSlots.find((s) => s.rolle === 'Vorsitz')
  const gebet = openingSlots.find((s) => s.rolle === 'Gebet')
  if (!vorsitzSlot?.name || !gebet || gebet.name) return
  gebet.name = vorsitzSlot.name
  if (vorsitzSlot.pid) gebet.pid = vorsitzSlot.pid // dieselbe Person betet
  w.mitzaehlen(persons.find((p) => p.id === w.werIst(vorsitzSlot)))
}

/**
 * 5) Die Hilfsdienste — zuletzt, damit Helfer und Aufgaben sich über die
 *    Sperrliste gegenseitig ausschließen; ausgewählt wird nach Gesamtlast.
 */
function hilfsdiensteBesetzen(
  meeting: Meeting,
  services: Service[],
  w: Waehler,
  /** Laufende Kalenderwoche (`laufendeWoche`), nicht die Position im Fenster. */
  woche: number,
): number {
  let unfilled = 0
  for (const svc of services) {
    const arr = meeting.helpers[svc.key] ?? []
    for (let pos = 0; pos < svc.count; pos++) {
      if (arr[pos]?.name) continue
      while (arr.length <= pos) arr.push({ name: '' })
      // Auch eine Lücke in der Reihe bekommt einen Platz — sonst bliebe sie
      // `undefined` und die Zuteilung liefe ins Leere.
      const platz = arr[pos] ?? { name: '' }
      arr[pos] = platz
      if (svc.groups) {
        // Reinigung rotiert über die echten Predigtdienstgruppen (keine Person,
        // daher keine pid); ohne konfigurierte Gruppen Fallback auf 1–3.
        platz.name = w.cleaningGroup ? w.cleaningGroup.name : `Gruppe ${1 + (woche % 3)}`
        delete platz.pid
        w.mitzaehlen()
        continue
      }
      const person = w.pick('helper', serviceQualKey(svc.key))
      if (person) w.vergeben('helper', person, platz)
      else unfilled++
    }
    meeting.helpers[svc.key] = arr
  }
  return unfilled
}

/**
 * Auto-Zuteilung für eine Woche+Meeting. Regeln (siehe README/Design):
 *  - Kandidaten: qualifiziert, in dieser Woche anwesend, noch nicht in diesem
 *    Meeting eingeteilt. Niemand bekommt Hilfsdienst UND Programmpunkt am
 *    selben Tag (gemeinsame Sperrliste; Ausnahme Vorsitz+Gebet).
 *  - Ausgeglichene Verteilung über zwei mitlaufende „Strichlisten“ innerhalb
 *    eines gleitenden Fensters (±LOAD_RADIUS Wochen um die geplante Woche):
 *      • Aufgaben (Programmpunkte) werden nach der reinen **Aufgaben**-Last
 *        verteilt — unabhängig von Hilfsdiensten, damit sie regelmäßig bleiben.
 *      • Hilfsdienste nach der **Gesamt**-Last — wer viele Aufgaben hat, bekommt
 *        weniger Hilfsdienste (aber nicht umgekehrt).
 *    Bei Gleichstand fairer, deterministischer Tie-Break.
 *  - Vorsitz betet zu Beginn: Anfangsgebet wird als Standard an die
 *    Vorsitz-Person gekoppelt (die einzige erlaubte Doppel-Aufgabe).
 *  - Fester Wachtturm-Studium-Leiter (bzw. Vertreter bei Abwesenheit) wird
 *    zuerst reserviert, damit ihn kein anderer Slot „wegnimmt“.
 *  - Nicht besetzbare Slots bleiben offen (kein Kandidat verfügbar).
 *
 * Die Reihenfolge der fünf Schritte ist bedeutungstragend: Jeder verkleinert
 * das Feld für den nächsten.
 */
export function autoAssignMeeting(
  weeks: Week[],
  weekIndex: number,
  tab: MeetingKey,
  persons: Person[],
  services: Service[],
  groups: Group[] = [],
  scope: AssignScope = 'all',
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
): AutoAssignResult {
  const next = klonWoche(weeks, weekIndex)
  if (!next) return { weeks, count: 0, newly: [], unfilled: 0 }
  // Entfällt die Zusammenkunft, gibt es nichts zu besetzen (T30). Ohne diese
  // Zeile verteilte „Automatisch zuteilen" Aufgaben für einen Abend, an dem
  // niemand zusammenkommt — und benachteiligte die Gewählten anschließend bei
  // der nächsten echten Zusammenkunft, weil sie als ausgelastet gälten.
  const meeting = next[weekIndex]?.[tab]
  if (!meeting || istAusgefallen(next[weekIndex], tab)) {
    return { weeks, count: 0, newly: [], unfilled: 0 }
  }

  const w = waehler(weeks, weekIndex, tab, meeting, persons, services, groups, abwesend)
  let unfilled = 0

  // Umfang: Programmpunkte (Aufgaben) und/oder Hilfsdienste getrennt zuteilbar.
  if (scope !== 'helpers') {
    unfilled += wtLeiterZuerst(meeting, w)
    unfilled += programmpunkteBesetzen(meeting, w, persons)
    unfilled += ratgeberBesetzen(meeting, w)
    gebetAnVorsitz(meeting, w, persons)
  }
  if (scope !== 'parts') {
    unfilled += hilfsdiensteBesetzen(meeting, services, w, laufendeWoche(weeks, weekIndex))
  }

  return { weeks: next, count: w.ergebnis.count, newly: w.ergebnis.newly, unfilled }
}

/**
 * Leert die Zuteilungen einer Woche+Meeting — das Gegenstück zur Auto-Zuteilung.
 * `scope`:
 *  - 'parts'   entfernt die Namen der Programmpunkte. Externe Redner
 *    (Gastredner/Kreisaufseher) bleiben stehen, genau wie die Auto-Zuteilung sie
 *    nicht besetzt — sie kommen von außen und werden manuell eingetragen.
 *  - 'helpers' entfernt die Namen aller Hilfsdienste (inkl. Reinigungsgruppe).
 * Programmstruktur, Rollen, Vortragsthemen und Lieder bleiben unverändert.
 * Pur — die Eingabe bleibt unangetastet. `count` = Anzahl geleerter Slots.
 */
export function clearAssignments(
  weeks: Week[],
  weekIndex: number,
  tab: MeetingKey,
  scope: Exclude<AssignScope, 'all'>,
): { weeks: Week[]; count: number } {
  const next = klonWoche(weeks, weekIndex)
  if (!next) return { weeks, count: 0 }
  const meeting = next[weekIndex]?.[tab]
  if (!meeting) return { weeks, count: 0 }
  let count = 0
  if (scope === 'parts') {
    // Programm (beide Räume) und Ratgeber: „Leeren" meint die Aufgaben dieser
    // Ansicht, und die Zusätzliche Klasse gehört dazu. Ohne `services`, denn
    // die Hilfsdienste sind der andere Umfang.
    //
    // Geändert wird an Ort und Stelle: `klonWoche` hat die Woche tief kopiert,
    // die Plätze aus dem Durchlauf gehören also schon zur neuen Fassung.
    for (const platz of allePlaetze(meeting)) {
      const slot = platz.slot
      if (isGuestRole(slot.rolle)) continue // externer Redner bleibt
      if (!slot.name) continue
      slot.name = ''
      delete slot.pid
      // Ein geleerter Redner-Platz fällt auf „Gastredner" zurück — den
      // Ausgangszustand aus dem Import. Bliebe er auf „Redner" stehen, wäre er
      // ein offener Slot, den die Auto-Zuteilung besetzt; den Redner des
      // öffentlichen Vortrags vereinbart man aber, man verlost ihn nicht.
      // Derselbe Rückfall wie beim „Entfernen".
      if (rolleBasis(slot.rolle) === ROLE_OWN_SPEAKER) slot.rolle = ROLE_GUEST_SPEAKER
      count++
    }
  } else {
    // Über alles Gespeicherte — auch hinter einer verkleinerten Platzzahl und
    // zu Diensten, die es nicht mehr gibt: „leeren" heißt leeren.
    for (const { slot } of gespeicherteHelfer(meeting)) {
      if (!slot.name) continue
      slot.name = ''
      delete slot.pid
      count++
    }
  }
  return { weeks: next, count }
}

/**
 * Baut die S-89-Nutzlast für einen belegten Schulungs-Slot (Schulungsaufgabe
 * oder Bibellesung). Liefert null, wenn der Slot leer ist oder keine
 * Schulungsaufgabe (Leser/Leiter zählen nicht). Rahmen und Schulungspunkt
 * werden aus der Meta-Zeile geparst.
 */
export function buildS89ForSlot(
  weeks: Week[],
  sel: MeetingSlotSelection,
  zeiten: MeetingTimes,
): S89Payload | null {
  if (sel.kind !== 'part') return null
  const week = weeks[sel.wi]
  const item = week?.[sel.tab].sections[sel.si]?.items[sel.ii]
  if (!week || !item || isSong(item)) return null
  const raum = sel.aux === true
  const slot = slotsOf(item, raum)[sel.ni]
  const current = slot?.name ?? ''
  if (!current) return null
  // Woran ein Schulungsplatz erkannt wird: am **Bereich**, nicht am Titel.
  // `item.title.startsWith('Bibellesung')` stand hier allein — und traf bei
  // einer fremdsprachigen Versammlung nie, denn der Import übernimmt den Titel
  // wörtlich aus der Zielsprache („Lectura de la Biblia"). Die Bibellesung bekam
  // dort **keinen S-89-Zettel**, ohne Fehler und ohne Hinweis; dieselbe Familie
  // wie T61 (Bibelstudium am deutschen Titel gesucht). Den Bereich vergibt der
  // Import in jeder Sprache (`bereichsKey: 'bibellesung'`, parse.ts).
  const isStudent = sel.priv === 'schulung' || sel.priv === 'schulungPartner' || sel.priv === 'bibellesung'
  if (!isStudent) return null
  // Hauptteilnehmer (schulung) und Gesprächspartner (schulungPartner) stehen als
  // getrennte Slots im selben Punkt.
  const schulungsPlatz = slotsOf(item, raum).find((n) => n.bereichsKey === 'schulung')
  /*
   * **Ohne Schüler kein Zettel.**
   *
   * Der S-89 gehört dem Schüler; der Gesprächspartner steht nur mit darauf und
   * bekommt eine Abschrift. Ist der Schüler-Platz dieses Punkts noch offen und
   * nur der Partner zugeteilt — der Planer fängt beim Partner an, oder der
   * Schüler wird wieder entfernt —, fiel `leadName` leer aus und der
   * Rückfall `|| current` setzte den **Partner** an die Stelle des Schülers:
   * Der Zettel nannte dieselbe Person zweimal, als Schülerin und als
   * Gesprächspartnerin, und der Druckbogen legte ihn gleich zweimal aus.
   *
   * Der Rückfall bleibt, wofür er gedacht ist: Die **Bibellesung** hat gar
   * keinen `schulung`-Platz (ihr Platz trägt `bibellesung`), dort ist der
   * aktuelle Name der des Schülers.
   */
  if (schulungsPlatz && !schulungsPlatz.name) return null
  const leadName = schulungsPlatz?.name ?? ''
  const partnerName = slotsOf(item, raum).find((n) => n.bereichsKey === 'schulungPartner')?.name ?? ''
  const metaFrags = (item.meta ?? '').split(' · ')
  // Der Rahmen („Von Haus zu Haus") — **an der Form erkannt, nicht am Wort**.
  //
  // Hier standen die drei deutschen Wendungen als Aufzählung. In einer
  // fremdsprachigen Versammlung steht im Meta „De casa en casa" oder „‏מבית
  // לבית", und der Zettel ging ohne Rahmen hinaus — der Schüler erfuhr nicht,
  // in welchem Rahmen er seine Aufgabe halten soll.
  //
  // Der Import setzt die Meta-Zeile als „[Rahmen ·] Zeit [· Quelle]" zusammen
  // und gewinnt den Rahmen bereits sprachunabhängig (`settingOf` in parse.ts:
  // der kurze Satz nach der Zeitklammer, **ohne Ziffer**). Genau daran ist er
  // auch hier wieder zu erkennen: Dauer und Quellenangabe tragen immer eine
  // Zahl, in welcher Schrift auch immer („٣ دق", „lmd lección 1"), der Rahmen
  // nie.
  const setting = metaFrags.find((f) => f !== '' && ersteZahl(f) === null) ?? ''
  // Der Schulungspunkt — die **Quelle** der Meta-Zeile, also das Stück hinter
  // der Dauer.
  //
  // Hier stand `/^(th|lmd) /`. Das Publikationskürzel ist aber keine Konstante:
  // zh/ja/ko/ar/he/fa/ur übersetzen es mit („th" → 教励, „教导", „הר"), und dort
  // ging der Schulungspunkt verloren — der Schüler bekam einen Zettel ohne den
  // Punkt, an dem er arbeiten soll. Nebenbei fehlte `lff`, obwohl es dieselbe
  // Rolle spielt wie `th`/`lmd`.
  //
  // Die Zerlegung nutzt dieselbe Zusicherung, auf der schon `itemMinutes`
  // ruht: Der Import setzt die Zeile als „[Rahmen ·] Zeit [· Quelle]" zusammen,
  // der Rahmen trägt nie eine Ziffer — die erste Zahl ist also immer die Dauer,
  // und was danach steht, ist die Quelle.
  const zeitIdx = metaFrags.findIndex((f) => ersteZahl(f) !== null)
  const point = (zeitIdx >= 0 ? metaFrags[zeitIdx + 1] : undefined) ?? ''
  return {
    name: leadName || current, // Bibellesung hat keinen schulung-Slot → aktueller Name
    partner: partnerName,
    date: meetingDateText(week, sel.tab, zeiten),
    type: item.title + (setting ? ` · ${setting}` : ''),
    point,
    // Der Ort stand hier frueher gar nicht im Modell — das Formular zeigte
    // immer 'Hauptsaal'. Jetzt kommt er aus der tatsaechlichen Zuteilung.
    aux: raum,
  }
}

/**
 * Alle S-89-Zettel einer Woche — für den Druckbogen (T71).
 *
 * Schulungsaufgaben gibt es nur unter der Woche, deshalb nur `mid`. Gelaufen
 * wird über **beide Räume**: Die Zusätzliche Klasse ist überall gleichberechtigt,
 * und ihre Zettel sind sogar die, bei denen der Ort auf dem Papier zählt.
 *
 * **Ein Zettel je Aufgabe — mit Partner zwei.** Ein Gespräch hat zwei Plätze
 * (Schüler und Partner); `buildS89ForSlot` liefert für beide denselben Zettel,
 * er nennt ja beide Namen. Gezählt wird deshalb die **Aufgabe**, nicht der
 * Platz — sonst hinge die Zahl daran, wie viele Plätze ein Punkt zufällig hat.
 * Und weil beide je einen Zettel in die Hand bekommen, wird er zweimal
 * gedruckt: derselbe Inhalt, zwei Blattstücke.
 *
 * Die Reihenfolge ist die des Programms: So liegen die Zettel hinterher in der
 * Reihenfolge, in der die Teile drankommen.
 */
export function alleS89DerWoche(
  weeks: Week[],
  wi: number,
  zeiten: MeetingTimes,
  /** Bei einem Gespräch zwei Zettel drucken — einen für den Partner. */
  partnerZweimal = true,
): S89Payload[] {
  const week = weeks[wi]
  if (!week) return []
  const out: S89Payload[] = []
  // Je Aufgabe und Raum genau ein Zettel: der erste Platz, für den einer
  // entsteht, deckt den Punkt ab (der Gesprächspartner steht mit darauf).
  // `programmPlaetze` liefert die Plätze eines Punkts zusammenhängend, deshalb
  // genügt es, sich den zuletzt erledigten Raum zu merken.
  let erledigt = ''
  for (const { si, ii, ni, aux, slot } of programmPlaetze(week.mid)) {
    const raum = `${si}|${ii}|${aux}`
    if (raum === erledigt) continue
    const zettel = buildS89ForSlot(weeks, {
      kind: 'part', wi, tab: 'mid', si, ii, ni,
      aux: aux || undefined,
      label: '', priv: slot.bereichsKey ?? null, groups: false,
    }, zeiten)
    if (zettel) {
      // Mit Gesprächspartner zweimal: beide bekommen einen in die Hand.
      out.push(zettel, ...(partnerZweimal && zettel.partner ? [zettel] : []))
      erledigt = raum
    }
  }
  return out
}

/* ---- Aufgaben-Ableitung ---------------------------------------------------
 * „Meine Aufgaben" werden aus den Wochen-Zuteilungen berechnet. Der
 * Bestätigungs-Status hängt am stabilen `task_key` (Kennung des Punkts, T37):
 * Einfügen, Löschen und Verschieben von Programmpunkten lassen ihn in Ruhe.
 */

/**
 * Index der Woche mit dieser Kennung — `-1`, wenn sie nicht geladen ist.
 *
 * Das Gegenstück zum Umbau: Wer aus einem Schlüssel wieder eine Woche braucht,
 * schlägt sie hier nach, statt die Zahl als Index zu missbrauchen. Nicht
 * geladen heißt nicht ungültig — die Woche kann außerhalb des Ladefensters
 * liegen (WEEK_LIMIT), und ihr Schlüssel bleibt trotzdem richtig.
 */
export function wochenIndex(weeks: readonly Week[], woche: string): number {
  return woche ? weeks.findIndex((w) => w.start === woche) : -1
}

/*
 * Die Erzeuger der `task_key` stehen im geteilten Modul (siehe den Kopf von
 * `aufgaben-schluessel.ts`): Die Edge Functions bauen dieselben Schlüssel und
 * können nicht aus `src/` lesen. Die App erreicht sie von hier — unter
 * denselben Namen.
 */
export { punktKey, ratgeberKey, helferKey }

/**
 * Schlüssel im Versand-Tagebuch: Platz **und** Name.
 *
 * Der Name gehört dazu, weil ein Platz die Person wechseln kann. Teilt der
 * Planer um, ist es ein anderer Schlüssel — die neue Person zählt als noch
 * nicht benachrichtigt und bekommt beim nächsten „Plan senden" ihre Nachricht.
 * Der Name statt der Person-Id, weil auch Plätze ohne `pid` vorkommen
 * (Altdaten, Hilfsdienste als reine Zeichenkette); die Function bildet ihn
 * genauso.
 */
export function sentKey(taskKey: string, name: string): string {
  return `${taskKey} ${name}`
}

/**
 * Woche und Zusammenkunft eines task_key — jeder beginnt mit `<wi>|<tab>|…`,
 * gleich ob Programmpunkt, Ratgeber oder Hilfsdienst. null bei Fremdformaten.
 */
export function taskKeyWeek(key: string): { woche: string; tab: MeetingKey } | null {
  const teile = schluesselTeile(key)
  return teile && teile.art !== 'fs' ? { woche: teile.woche, tab: teile.tab } : null
}

/**
 * Ist der Termin vorbei, auf den sich dieser `task_key` bezieht? (T77)
 *
 * Für Mitteilungen: „Ersatz gesucht", „Erinnerung" und dergleichen beziehen
 * sich auf einen Platz an einem bestimmten Tag — ist der herum, interessieren
 * sie niemanden mehr. Die Mitteilung trägt den Schlüssel ihrer Aufgabe und
 * damit die Antwort.
 *
 * Ohne erkennbaren Schlüssel: **false**. Wer nichts über den Termin weiß, lässt
 * die Zeile stehen — lieber eine zu viel als eine, die noch gebraucht wird.
 */
export function taskKeyVorbei(
  key: string,
  weeks: Week[],
  zeiten: MeetingTimes,
  heute = new Date(),
): boolean {
  const teil = taskKeyWeek(key)
  if (!teil) return false
  const week = weeks[wochenIndex(weeks, teil.woche)]
  if (week) return istVorbei(meetingDateMs(week, teil.tab, zeiten), heute)
  // Woche nicht geladen (der Ladebereich deckt ein Jahr um heute ab, siehe
  // lib/data.ts). Auch dann nicht geraten, sondern gerechnet: Der Schlüssel
  // trägt den Montag, die Zusammenkunft liegt spätestens sechs Tage später.
  const montag = Date.parse(teil.woche)
  return Number.isNaN(montag) ? false : istVorbei(montag + 6 * 864e5, heute)
}

/** Zerlegt einen Hilfsdienst-task_key; null, wenn es kein Hilfsdienst-Key ist. */
export function helperKeyParts(
  key: string,
): { woche: string; tab: MeetingKey; svc: string; pos: number } | null {
  const teile = schluesselTeile(key)
  return teile?.art === 'helper' ? teile : null
}

/**
 * Offene Ersatzgesuche für `me`: Hilfsdienst-Slots, deren Bearbeiter „verhindert"
 * gemeldet hat und für die `me` qualifiziert (gleicher Dienst), nicht selbst der
 * Absager und in der Woche nicht abwesend ist. Nächste zuerst.
 */
export function deriveSubstituteReqs(
  weeks: Week[],
  services: Service[],
  confirmations: ConfirmationMap,
  me: Person,
  zeiten: MeetingTimes,
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
): SubstituteReq[] {
  const out: SubstituteReq[] = []
  const svcByKey = new Map(services.map((s) => [s.key, s]))
  for (const [key, status] of Object.entries(confirmations)) {
    if (status !== 'verhindert') continue
    const parts = helperKeyParts(key)
    if (!parts) continue
    const svc = svcByKey.get(parts.svc)
    if (!svc || svc.groups) continue
    if (!isQualified(me, serviceQualKey(parts.svc))) continue
    const wi = wochenIndex(weeks, parts.woche)
    if (wi < 0) continue // Woche nicht geladen — dazu ist nichts zu sagen
    if (istAbwesend(abwesend, me.id, wi, parts.tab)) continue
    const week = weeks[wi]
    // Entfällt die Zusammenkunft, gibt es nichts zu vertreten (T30) — dieselbe
    // Grenze, die `eachAssignedSlot` für die eigenen Aufgaben zieht und die die
    // Edge Function `substitute` serverseitig durchsetzt ('meeting-cancelled').
    // Sie fehlte allein hier: Sagte jemand ab und wurde die Woche danach
    // gestrichen (Kongress, Saal belegt), stand das Gesuch weiter im
    // Aufgaben-Blatt und legte sich beim Öffnen sogar als Modal vor
    // (`vorzulegen`). Wer darauf zusagte, bekam vom Server ein 409 und davon
    // nur einen Speicherfehler zu sehen.
    if (istAusgefallen(week, parts.tab)) continue
    const meeting = week?.[parts.tab]
    const slot = meeting?.helpers[parts.svc]?.[parts.pos]
    /*
     * Der eigene Slot ist keiner, für den man einspringt — **über `gehoertZu`**,
     * nicht über den Namen.
     *
     * Hier stand `slot.name === myName`. Sagt der gleichnamige Bruder ab, hieß
     * das „das bin ich" und sein Gesuch verschwand: Ausgerechnet der, der ihn
     * am ehesten vertreten könnte (gleiche Qualifikation, gleiche Versammlung),
     * bekam es nie zu sehen. Trägt der Slot eine `pid`, entscheidet sie.
     */
    if (!meeting || !slot?.name || gehoertZu(slot, me)) continue // eigener/leerer Slot
    out.push({
      key,
      svc: parts.svc,
      title: svc.name,
      date: meetingDateText(week, parts.tab, zeiten),
      at: meetingDateMs(week, parts.tab, zeiten),
      declinedBy: slot.name,
      // Was ich an dem Tag schon habe — vor dem Klick, nicht im Toast danach.
      // Der offene Platz selbst zählt nicht mit (`exclude`).
      schonHeute: assignmentsInMeeting(meeting, me, services, {
        kind: 'helper', wi, tab: parts.tab, svc: parts.svc, pos: parts.pos,
        label: '', priv: null, groups: false,
      }),
    })
  }
  return out.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity))
}

/**
 * Bestätigungen eines gelöschten Programmpunkts — alle seine Plätze, beide
 * Räume.
 *
 * **Das ist alles, was Einfügen, Löschen und Verschieben an Bestätigungen noch
 * anfassen.** Hier standen drei Funktionen: Beim Einfügen und Löschen mussten
 * die Schlüssel aller folgenden Punkte umbenannt, beim Verschieben zwei
 * Schlüssel getauscht werden — alles nur, weil die Position im Schlüssel stand
 * (T16). Seit der Punkt seine eigene Kennung trägt, verschiebt sich nichts
 * mehr; verfallen kann nur, was wirklich verschwindet.
 */
export function itemZusagenKeys(
  map: ConfirmationMap,
  woche: string,
  tab: MeetingKey,
  iid: string,
): string[] {
  const praefixe = [punktStamm(woche, tab, iid, false), punktStamm(woche, tab, iid, true)]
  return Object.keys(map).filter((key) => praefixe.some((p) => key.startsWith(p)))
}

/**
 * Besucht alle belegten Slots (Programmpunkte + Hilfsdienste) aller Wochen.
 *
 * `visit` bekommt den Platz selbst (Name, Id, Rolle): Wem er gehört,
 * entscheidet der Aufrufer mit `gehoertZuKennung` — nicht aus Name und Id
 * einzeln nachgebaut.
 */
export function eachAssignedSlot(
  weeks: Week[],
  services: Service[],
  zeiten: MeetingTimes,
  visit: (slot: SlotAssignment, key: string, task: () => MyTask) => void,
): void {
  weeks.forEach((week, wi) => {
    for (const tab of MEETING_TABS) {
      // Entfällt die Zusammenkunft, gibt es dazu nichts zu bestätigen, zu
      // erinnern oder zu vertreten (T30). Die Zuteilungen bleiben in den Daten
      // stehen — sie sind nicht verwaist, sie ruhen nur, solange nichts
      // stattfindet.
      if (istAusgefallen(week, tab)) continue
      const meeting = week[tab]
      // Echtes Datum der Zusammenkunft (nur bei importierten Wochen) → Countdown.
      const at = meetingDateMs(week, tab, zeiten)
      // **Ein Durchlauf für alle vier Platzsorten.** Die Plätze der Zusätzlichen
      // Klasse sind gleichwertige Aufgaben (bestätigen, erinnern, S-89), nur mit
      // eigenem Schlüssel und eigenem Ort; der Ratgeber und die Hilfsdienste
      // ebenso. Hier standen dafür drei Schleifen untereinander.
      for (const platz of allePlaetze(meeting, services)) {
        const slot = platz.slot
        if (!slot?.name) continue
        // Gastredner/Kreisaufseher kommen von außen — kein Bestätigungs-Flow.
        if (isGuestRole(slot.rolle)) continue
        // Die Reinigungs-Rotation ist keine persönliche Aufgabe, sondern eine
        // Gruppe.
        if (platz.art === 'helper' && platz.svc.groups) continue
        const key = platzKey(platz, week.start, tab)
        visit(slot, key, () => {
          const gemeinsam = { id: key, date: meetingDateText(week, tab, zeiten), at, status: 'offen' as const }
          if (platz.art === 'ratgeber') {
            // Die Bezeichnung **ist** die Rolle — App-Sprache, kein Titel.
            return { ...gemeinsam, title: '', rolle: RATGEBER_ROLLE, s89: null }
          }
          if (platz.art === 'helper') {
            // Dienstnamen zeigt die App in der Sprache des Lesers — so hält es
            // auch `SubstituteReq.title` („Anzeige über tu").
            return { ...gemeinsam, title: '', rolle: platz.svc.name, s89: null }
          }
          const { section, si, item, ii, ni, aux } = platz
          const rolle = rolleMitHerkunft(slot) ?? ''
          const sel: SlotSelection = {
            kind: 'part', wi, tab, si, ii, ni, aux: aux || undefined,
            label: '', priv: slot.bereichsKey ?? null, groups: false,
          }
          // Zwei Hälften statt einer: der Titel gehört in die Sprache der
          // Versammlung, die Rolle in die des Lesers (siehe MyTask.rolle).
          // In Eröffnung/Abschluss trägt die Rolle allein — der Titel benennt
          // dort den ganzen Block (`istBlockAbschnitt`).
          return {
            ...gemeinsam,
            title: rolle && istBlockSektion(section) ? '' : item.title,
            ...(rolle ? { rolle } : {}),
            s89: buildS89ForSlot(weeks, sel, zeiten),
          }
        })
      }
    }
  })
}

/**
 * Beide Hälften einer Aufgabe zu **einem kanonisch deutschen** Text —
 * für alles, was keinen Übersetzer dazwischen hat: die Mitteilung an den Planer
 * und die Zeitleiste im Personen-Detail. Die Oberfläche nimmt stattdessen
 * `aufgabenLabel` (i18n/useT.ts) und übersetzt jede Hälfte für sich.
 */
export function aufgabenBezeichnung(task: Pick<MyTask, 'title' | 'rolle'>): string {
  return [task.title, task.rolle].filter(Boolean).join(' · ')
}

/**
 * Aufgaben einer Person (Anzeigename) aus den Wochen-Zuteilungen, in
 * Programmreihenfolge; Status aus der ConfirmationMap (fehlt = offen).
 */
export function deriveMyTasks(
  weeks: Week[],
  services: Service[],
  personName: string,
  confirmations: ConfirmationMap,
  zeiten: MeetingTimes,
  personId?: string,
): MyTask[] {
  const tasks: MyTask[] = []
  if (!personName && !personId) return tasks
  eachAssignedSlot(weeks, services, zeiten, (slot, key, task) => {
    if (!gehoertZuKennung(slot, personId, personName)) return
    tasks.push({ ...task(), status: zusageStatus(confirmations, key) })
  })
  return tasks
}

/**
 * Stand der Zusage **eines Platzes** — keine Zeile heißt „offen".
 *
 * Eine Stelle für beide Seiten: „Meine Aufgaben" des Eingeteilten und der
 * Ampel-Punkt am Chip des Planers lesen hier. So sieht der Planer genau das,
 * was der Verkündiger bei sich stehen hat.
 *
 * **Je Platz, nicht je Person.** Bis zum 14. September 2026 zeigte der Chip
 * eine Personen-Markierung: „…" an *jedem* Platz einer Person, solange sie
 * *irgendwo* noch etwas offen hatte — auch in einer anderen oder längst
 * vergangenen Woche. Ein bestätigter Vorsitz stand deshalb als unbestätigt
 * da, und eine Absage sah aus wie eine ausstehende Antwort.
 */
export function zusageStatus(confirmations: ConfirmationMap, key: string): TaskStatus {
  return confirmations[key] ?? 'offen'
}

/**
 * Kennung einer Person in einer Zuteilung — für die Konfliktprüfung.
 *
 * Die Person-Id, wo vorhanden — sonst der Anzeigename mit Präfix, damit ein
 * Name nie versehentlich wie eine Id aussieht. Zwei Personen desselben Namens
 * bleiben so auseinander, und ein Umbenennen ändert nichts.
 */
export function kennungVon(name: string, pid?: string): string {
  return pid ?? `name:${name}`
}

/* ---- Konfliktprüfungen (Planen) ------------------------------------------
 * Warnungen für den Planer, aus den Wochen abgeleitet: jemand ist trotz
 * Abwesenheit eingeteilt oder mehrfach in derselben Zusammenkunft. Reine
 * Ableitung, keine Persistenz.
 *
 * **Die Serie ist weg, nicht vergessen** (T81). „X ist 3 Wochen in Folge
 * eingeteilt" stand hier jahrelang und war der häufigste Eintrag des Banners —
 * in einer kleinen Versammlung ist das der Normalfall, kein Missstand. Eine
 * Warnung, die fast immer steht, bringt der Planer sich ab und übersieht
 * daneben die, auf die es ankommt. Was hier bleibt, nennt nur noch Dinge, die
 * so nicht bleiben können. Die Auslastung selbst ist damit nicht aus dem Blick:
 * die Auto-Zuteilung rechnet sie (`partLoad`/`anyDist`), und das Personen-Sheet
 * zeigt sie in den Quadraten.
 */

export type ConflictKind = 'absent' | 'double' | 'helperTask' | 'fsAbsent' | 'fsDouble'

export interface Conflict {
  kind: ConflictKind
  name: string // Anzeigename der Person
  /**
   * Wen es betrifft — Person-Id, sonst `name:<Anzeigename>` (`kennungVon`).
   *
   * Der Anzeigename allein reichte nicht: das Banner nennt den Konflikt, die
   * Zuteilung darunter wird danach markiert, und bei zwei Personen desselben
   * Namens leuchtete sonst auch die falsche auf — dieselbe Verwechslung, die
   * T57 aus der Zählung genommen hat.
   */
  kennung: string
  tab?: MeetingKey // betroffene Zusammenkunft (absent/double/helperTask)
  count?: number // double: Hilfsdienste in der Zusammenkunft
  // Treffpunkte haben keine Zusammenkunft, sondern einen eigenen Wochentag und
  // Ort — beides gehört in den Hinweis, sonst weiß der Planer nicht, welchen
  // der Treffpunkte dieser Woche er ansehen soll.
  wd?: number // fsAbsent/fsDouble: Wochentag (0=So … 6=Sa)
  ort?: string // fsAbsent: Ort des Treffpunkts
}

/**
 * Die belegten Plätze einer Zusammenkunft, nach Art getrennt — **ein**
 * Durchlauf über `allePlaetze` für alle Fragen der Konfliktprüfung. Vier
 * Funktionen liefen hier je für sich über dieselben Plätze.
 *
 * Ohne Lieder, ohne externe Slots (Gastredner/Kreisaufseher) und ohne die
 * Gruppen-Rotation — die sind keine zuteilbaren Personen.
 */
interface Belegungen {
  /** Programmpunkte beider Räume samt Ratgeber (mit Duplikaten). Wer im
   * Hauptsaal UND in der Zusätzlichen Klasse steht, ist zur selben Zeit an zwei
   * Orten — genau das soll die Prüfung finden. */
  programm: Belegung[]
  /** Hilfsdienste. */
  helper: Belegung[]
  /**
   * Belegte Kennungen **je Raum** — Hauptsaal, Zusätzliche Klasse und der
   * Ratgeber-Platz getrennt, für die Doppelungen unter den Programmpunkten,
   * die wirklich unmöglich sind. Zwei Punkte **im selben** Raum sind es nicht
   * (Vorsitz und Anfangsgebet) — deshalb reicht eine einzige Menge nicht aus.
   *
   * Der Ratgeber steht für sich, obwohl er in der Klasse sitzt: Er begleitet
   * **die ganze Reihe**, ist also die einzige Zuteilung, die jede andere im
   * selben Raum ausschließt. Ein Schüler seiner Klasse kann nicht zugleich
   * sein eigener Ratgeber sein.
   */
  haupt: Map<string, string>
  klasse: Map<string, string>
  ratgeber: Belegung | null
}

function belegungen(meeting: Meeting, services: Service[], wer: IdVon): Belegungen {
  const out: Belegungen = { programm: [], helper: [], haupt: new Map(), klasse: new Map(), ratgeber: null }
  for (const platz of allePlaetze(meeting, services)) {
    const slot = platz.slot
    if (!slot?.name || isGuestRole(slot.rolle)) continue
    if (platz.art === 'helper') {
      if (!platz.svc.groups) out.helper.push(belegung(slot, wer))
      continue
    }
    const b = belegung(slot, wer)
    out.programm.push(b)
    if (platz.art === 'ratgeber') out.ratgeber = b
    else (platz.aux ? out.klasse : out.haupt).set(b.kennung, b.name)
  }
  return out
}

/**
 * Eine belegte Stelle mit ihrer **Kennung**: die Person-Id, wo auflösbar, sonst
 * ein Namensschlüssel. Gezählt wird über die Kennung, angezeigt der Name.
 *
 * Ohne diese Trennung zählte die Konfliktprüfung über den Anzeigenamen: zwei
 * Personen desselben Namens galten als eine und lösten füreinander „doppelt
 * eingeteilt" aus. Der Namensschlüssel trägt ein Präfix, damit er nie
 * versehentlich mit einer echten Id zusammenfällt.
 */
interface Belegung {
  kennung: string
  name: string
}
type IdVon = (z: Zuteilung | undefined) => string | undefined

function belegung(z: Zuteilung, wer: IdVon): Belegung {
  const name = z.name ?? ''
  return { kennung: wer(z) ?? `name:${name}`, name }
}

/**
 * Konflikte der Woche `wi`: Abwesende trotz Zuteilung und Mehrfach-Zuteilung in
 * einer Zusammenkunft. Reihenfolge: absent, double/helperTask.
 *
 * `tab` grenzt die Prüfung auf eine Zusammenkunft ein (das Planen zeigt Konflikte
 * je Reiter). Ohne `tab` werden beide Zusammenkünfte geprüft (Wochen-Gesamtzahl
 * fürs Dashboard).
 */
export function weekConflicts(
  weeks: Week[],
  wi: number,
  persons: Person[],
  services: Service[],
  tab?: MeetingKey,
  abwesend: AbsenceSet = KEINE_ABWESENHEIT,
): Conflict[] {
  const week = weeks[wi]
  if (!week) return []
  const conflicts: Conflict[] = []
  const werIst = idAufloeser(persons)
  const nachId = new Set(persons.map((p) => p.id))
  // Entfallene Zusammenkünfte fallen heraus (T30): wer an einem Tag nicht
  // drankommt, ist dort weder doppelt eingeteilt noch abwesend-und-eingeteilt.
  // Ein Warnbanner über eine Zusammenkunft, die gar nicht stattfindet, wäre
  // Lärm — und verdeckt die echten Konflikte daneben.
  const tabs = (tab ? [tab] : MEETING_TABS).filter((tb) => !istAusgefallen(week, tb))
  const belegt = new Map(tabs.map((tb) => [tb, belegungen(week[tb], services, werIst)] as const))

  // absent: in dieser Woche abwesend, aber eingeteilt
  for (const [tb, { programm, helper }] of belegt) {
    const gesehen = new Set<string>()
    for (const b of [...programm, ...helper]) {
      if (gesehen.has(b.kennung)) continue
      gesehen.add(b.kennung)
      if (nachId.has(b.kennung) && istAbwesend(abwesend, b.kennung, wi, tb)) {
        conflicts.push({ kind: 'absent', name: b.name, kennung: b.kennung, tab: tb })
      }
    }
  }

  // helperTask / double: gleiche Person mehrfach in einer Zusammenkunft.
  // helperTask = Hilfsdienst UND Programmpunkt am selben Tag (die vom Nutzer
  // vorgegebene Regel — bei manueller Zuteilung nicht automatisch verhindert);
  // double = mehrere Hilfsdienste am selben Tag. Zwei Programmpunkte (z. B.
  // Vorsitz + Anfangsgebet) sind bewusst KEIN Konflikt.
  for (const [tb, { programm, helper, haupt, klasse, ratgeber }] of belegt) {
    // Gezählt wird über die Kennung, angezeigt der Name — zwei Personen
    // desselben Namens sind zwei Einträge, nicht einer mit doppelter Zahl.
    const namen = new Map<string, string>()
    const zaehle = (aus: Belegung[]): Map<string, number> => {
      const m = new Map<string, number>()
      for (const b of aus) {
        m.set(b.kennung, (m.get(b.kennung) ?? 0) + 1)
        namen.set(b.kennung, b.name)
      }
      return m
    }
    const partCounts = zaehle(programm)
    const helperCounts = zaehle(helper)
    /*
     * **Zwei Räume zur selben Zeit.**
     *
     * `programm` zählt Hauptsaal und Klasse zusammen — genau der Fall, den die
     * Prüfung finden soll. Sie fand ihn nicht: Zwei Programmpunkte sind bewusst
     * kein Konflikt (Vorsitz und Anfangsgebet), und damit fiel auch der Mensch
     * durch, der zugleich im Hauptsaal und in der Zusätzlichen Klasse stand.
     *
     * Die Automatik verhindert es seit je (`autoassign.klasse.test.ts`:
     * „Niemand steht zur selben Zeit in zwei Räumen"); von Hand blieb es
     * möglich, und niemand sagte etwas. Erst der Ratgeber-Platz und die zweite
     * Reihe haben den Fall überhaupt geschaffen.
     *
     * Gemeldet als `double`: Der Satz dazu — „{name} ist {n}× in einer
     * Zusammenkunft" — trifft es, und ein eigener Schlüssel hieße 34
     * Übersetzungen für eine Aussage, die schon dasteht.
     */
    /**
     * Zwei Plätze, die einander ausschließen?
     *
     *  - **Beide Räume**: zur selben Zeit an zwei Orten.
     *  - **Ratgeber und irgendein Programmpunkt**: Er begleitet die ganze
     *    Reihe seiner Klasse. Im Hauptsaal wäre er gar nicht da; in seiner
     *    eigenen Klasse wäre er sein eigener Ratgeber. Die Automatik verhindert
     *    beides seit je (`used` kennt den Ratgeber-Platz), von Hand blieb es
     *    möglich — und der Ratgeber steht in der Ansicht neben dem Programm,
     *    nicht darin.
     */
    const raumKonflikt = (kennung: string): boolean => {
      if (klasse.has(kennung) && haupt.has(kennung)) return true
      if (ratgeber?.kennung !== kennung) return false
      return haupt.has(kennung) || klasse.has(kennung)
    }
    for (const kennung of new Set([...partCounts.keys(), ...helperCounts.keys()])) {
      const pc = partCounts.get(kennung) ?? 0
      const hc = helperCounts.get(kennung) ?? 0
      const name = namen.get(kennung) ?? ''
      /*
       * Die beiden Meldungen schließen einander **nicht** aus, und das ist der
       * Punkt: Sie sagen Verschiedenes. „Ist n× in einer Zusammenkunft" nennt
       * die Menge, „Aufgabe und Hilfsdienst zugleich" die Art — der Planer
       * löst beides unterschiedlich auf.
       *
       * Hier stand ein `else if`: Der neue Raumkonflikt verdrängte damit die
       * Hilfsdienst-Warnung. Wer im Hauptsaal stand, in der Klasse stand und
       * zusätzlich als Ordner eingetragen war, bekam nur noch die Zahl zu
       * sehen.
       */
      const raum = raumKonflikt(kennung)
      if (raum) conflicts.push({ kind: 'double', name, kennung, tab: tb, count: pc + hc })
      if (pc >= 1 && hc >= 1) conflicts.push({ kind: 'helperTask', name, kennung, tab: tb })
      // Zwei Hilfsdienste allein sind ihre eigene Doppelung — es sei denn, die
      // Zeile darüber hat sie mitgezählt.
      else if (!raum && hc >= 2) conflicts.push({ kind: 'double', name, kennung, tab: tb, count: hc })
    }
  }

  // Hier stand die Serie („3 Wochen in Folge"), siehe Kopf des Abschnitts.

  return conflicts
}
