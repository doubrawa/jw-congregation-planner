/**
 * **Auswertung der Zuteilungen** (T126, Entwurf auf der Leinwand „Auswertung der
 * Zuteilungen", 16.10.2026): wer zu oft, zu selten oder einseitig eingeteilt
 * ist, wer lange wartet, wer die Treffpunkte leitet, wo sich Aufgaben ballen.
 *
 * Gerechnet aus den geladenen Wochen — höchstens ein Jahr (T125) —, gespeichert
 * wird nichts. Gemessen wird so, wie die Automatik verteilt (`waehler` in
 * planning.ts); sonst zeigte die Seite eine andere Gerechtigkeit als die, nach
 * der verteilt wird:
 *
 *  - **Gezählt wird jeder Platz, der eine Zusage kennt** (`platzMitZusage`):
 *    ohne Kreisaufseher, ohne die Gruppen der Reinigung, nur in
 *    Zusammenkünften, die stattfanden (T30).
 *  - **Der öffentliche Vortrag** zählt nicht, ob Gastredner oder eigener
 *    Redner (`isSpeakerRole`) — Betreiber 17.10.2026: „man hat so selten einen
 *    Vortrag in der eigenen Versammlung". Er trägt `vortrag` wie der Vortrag
 *    unter „Schätze"; gezählt, stünde er dort mit.
 *  - **Was dem Vorsitz folgt** (Anfangsgebet, Vortrag des Vorsitzenden,
 *    `folgtDemVorsitz`), zählt nicht, solange es der Vorsitzende selbst hat: Es
 *    kam mit dem Vorsitz. Spricht ein anderer das Anfangsgebet, zählt es.
 *  - **Der feste Wachtturm-Studium-Leiter** zählt nicht, solange die
 *    Versammlung einen hat (`wtLeiterZuerst`): Der Platz rotiert nicht.
 *  - **Absagen zählen nach derselben Regel** (`zaehltDerPlatz`): Eine Absage
 *    auf einem Platz, der selbst nicht zählt, höbe den Anteil ihres Bereichs
 *    ohne Grund (Review 17.10.2026).
 *  - **Erwartet** ist, was auf jemanden käme, wenn die Plätze jedes seiner
 *    Bereiche gleich auf alle verteilt wären, die ihn haben — anteilig nach den
 *    Zusammenkünften, in denen jemand nicht abwesend war.
 *  - **Hilfsdienste** vergibt die Automatik nach der Gesamtlast (`byTotal`):
 *    Wer viele Aufgaben hat, bekommt weniger. Verglichen wird dort deshalb die
 *    Summe aus Aufgaben und Hilfsdiensten.
 *
 * Alles hier ist rein: Eingabe sind die Daten der App, Ausgabe Zahlen je
 * Person-Id und Bereichsschlüssel. Namen und Beschriftungen setzt die Ansicht.
 */

import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { folgtDemVorsitz } from '../../supabase/functions/_shared/planung.ts'
import { istAbwesend, type AbsenceSet } from './absence'
import { idAufloeser, isQualified, isSpeakerRole, istArt, istAusgefallen, MEETING_TABS } from './helpers'
import { montagVon, tagNach, wochenZwischen } from './meeting-dates'
import { allePlaetze, platzKey, platzMitZusage, type Platz } from './plaetze'
import { bereichVon, vorsitzPlatz } from './planning'
import type { Absage, FsInstance, Group, MeetingKey, Person, Service, Week } from './types'

/** Die Zeiträume zur Wahl, in Monaten — und wie viele Wochen jeder umfasst. */
export const ZEITRAEUME = [12, 6, 3] as const
export type Zeitraum = (typeof ZEITRAEUME)[number]
export const ZEITRAUM_WOCHEN: Record<Zeitraum, number> = { 12: 52, 6: 26, 3: 13 }

/** Mehr als die Hälfte über der Erwartung ist „zu oft", weniger als die Hälfte „zu selten". */
export const OBERE_GRENZE = 1.5
export const UNTERE_GRENZE = 0.5
/** … und dazu mindestens so viele daneben — sonst ist eine 2 bei erwarteten 1 schon „zu oft". */
export const MINDESTABSTAND = 3
/** Einseitig: so viel in einem Bereich, ab so vielen Zuteilungen. */
export const UEBERWIEGT_AB = 2 / 3
export const EINSEITIG_AB = 6
/** „Nie dran" zählt nur, wo die anderen den Bereich im Schnitt mindestens so oft hatten. */
export const NIE_AB_SCHNITT = 4
/** Ohne Aufgaben in diesen Bereichen fällt niemand unter „Schulungsaufgaben". */
export const SCHULUNG = new Set(['schulung', 'schulungPartner', 'schulungVortrag'])

/** Ist der Bereich ein Hilfsdienst (`svc:<dienst>`, `serviceQualKey`)? */
export function istHilfsdienstBereich(bereich: string): boolean {
  return bereich.startsWith('svc:')
}

function median(werte: readonly number[]): number | null {
  if (werte.length === 0) return null
  const s = [...werte].sort((x, y) => x - y)
  const mitte = Math.floor(s.length / 2)
  return s.length % 2 ? s[mitte]! : (s[mitte - 1]! + s[mitte]!) / 2
}

/* ---- Grundlage: wer hatte wann welchen Platz ------------------------------ */

/** Ein gezählter Platz: wer, wann, in welchem Bereich. */
export interface Einteilung {
  pid: string
  /** Index der Woche in `weeks`. */
  wi: number
  /** Montag der Woche (ISO). */
  start: string
  tab: MeetingKey
  /** Der Aufgabenbereich (`bereichVon`) — `null` für einen Platz ohne (Altbestand ohne `bereichsKey`). */
  bereich: string | null
  hilfsdienst: boolean
}

export interface Zeitfenster {
  /** Erster Montag im Zeitraum (ISO). */
  von: string
  /** Montag der laufenden Woche (ISO) — er gehört nicht mehr dazu. */
  bis: string
  /** Die Indizes der Wochen im Zeitraum, aufsteigend. */
  wochen: number[]
  /** Ihre Montage (ISO), in derselben Reihenfolge — für die Felder je Woche. */
  montage: string[]
}

/**
 * **Die abgeschlossenen Wochen eines Zeitraums** — bis vor die laufende Woche:
 * Was noch kommt, ist geplant, nicht gehalten.
 */
export function zeitfenster(weeks: readonly Week[], anzahlWochen: number, heute: string): Zeitfenster {
  const bis = montagVon(heute)
  const von = tagNach(bis, -7 * anzahlWochen)
  const wochen: number[] = []
  const montage: string[] = []
  weeks.forEach((w, wi) => {
    if (w.start < von || w.start >= bis) return
    wochen.push(wi)
    montage.push(w.start)
  })
  return { von, bis, wochen, montage }
}

/** Eine gezählte Absage: wer und in welchem Bereich — `null`, wenn es den Platz nicht mehr gibt. */
export interface AbsageEinteilung {
  pid: string
  bereich: string | null
}

/** Der Bereich, unter dem ein abgesagter Treffpunkt zählt (`p.priv.treffpunkt`). */
export const TREFFPUNKT_BEREICH = 'treffpunkt'

export interface Grundlage {
  fenster: Zeitfenster
  einteilungen: Einteilung[]
  /** Besetzte, gezählte Plätze je Bereich. */
  plaetze: ReadonlyMap<string, number>
  /** Zusammenkünfte, die im Zeitraum stattfanden. */
  zusammenkuenfte: number
  /** Je Person: in wie vielen davon sie nicht abwesend war. */
  verfuegbar: ReadonlyMap<string, number>
  /**
   * Je Person die Montage der Wochen im Zeitraum, in denen sie in keiner
   * Zusammenkunft da war, die stattfand — sie zählen nicht zur Wartezeit.
   */
  ganzAbwesend: ReadonlyMap<string, ReadonlySet<string>>
  /**
   * Was ab der laufenden Woche schon eingeteilt ist, gezählt wie die
   * Zuteilungen: Wer im Bereich schon geplant ist, wartet nicht.
   */
  geplant: Einteilung[]
  /** Die Absagen im Zeitraum (T126, aufgezeichnet seit 17.10.2026). */
  absagen: AbsageEinteilung[]
}

/**
 * **Zählt dieser Platz als Zuteilung — gleich, wer ihn hält?** Eine Regel für
 * die Zuteilungen und für die Absagen (siehe Kopf): der öffentliche Vortrag
 * nicht, die Reinigung nicht (sie geht an Gruppen), der Leiter des
 * Wachtturm-Studiums nicht, solange die Versammlung einen festen hat. Was dem
 * Vorsitz folgt, hängt dazu an der Person — das prüft `grundlage`.
 */
function zaehltDerPlatz(platz: Platz, festerLeiter: boolean): boolean {
  if (platz.art === 'helper') return !platz.svc.groups
  if (isSpeakerRole(platz.slot.rolle)) return false
  return !(festerLeiter && platz.art === 'programm' && istArt(platz.section, 'wtStudium') && platz.slot.rolle === 'Leiter')
}

/** Der Vorsitz einer Zusammenkunft: wer ihn hat und unter welchem Schlüssel. */
interface VorsitzDerZusammenkunft {
  pid: string | undefined
  key: string | null
}

/**
 * Ein Platz, wie ihn eine Absage braucht: sein Bereich — und der Vorsitz, wenn
 * der Platz ihm folgt. Im Verzeichnis steht `null` für einen Platz, der nicht
 * zählt (`zaehltDerPlatz`).
 */
interface PlatzFuerAbsagen {
  bereich: string | null
  vorsitz: VorsitzDerZusammenkunft | null
}

export function grundlage(eingabe: {
  weeks: readonly Week[]
  persons: readonly Person[]
  services: readonly Service[]
  abwesend: AbsenceSet
  fenster: Zeitfenster
  /** Absagen (T126) — wer welchen Platz abgesagt hat, auch wenn er neu besetzt ist. */
  absagen?: readonly Absage[]
}): Grundlage {
  const { weeks, persons, services, abwesend, fenster } = eingabe
  const wer = idAufloeser(persons)
  const bekannt = new Set(persons.map((p) => p.id))
  const festerLeiter = persons.some((p) => p.priv.wtLeiter)
  const verfuegbar = new Map<string, number>(persons.map((p) => [p.id, 0]))
  const ganzAbwesend = new Map<string, Set<string>>()
  // Jeder Platz über seinen Schlüssel — für die Absagen, die nur den Schlüssel
  // kennen. Auch ein leerer: Hat der Planer den Absagenden nur ausgetragen,
  // steht dort noch niemand, der Bereich ist trotzdem der des Platzes. Die
  // Woche jedes Montags im Zeitraum dazu.
  const platzJeSchluessel = new Map<string, PlatzFuerAbsagen | null>()
  const wocheJeMontag = new Map<string, number>()
  let zusammenkuenfte = 0

  /** Die gezählten Plätze einer Zusammenkunft, die stattfindet, nach `ziel`. */
  const zaehlen = (week: Week, wi: number, tab: MeetingKey, ziel: Einteilung[]): void => {
    const meeting = week[tab]
    const vorsitzSlot = vorsitzPlatz(meeting)
    const vorsitz: VorsitzDerZusammenkunft = { pid: wer(vorsitzSlot), key: null }
    for (const platz of allePlaetze(meeting, services)) {
      const key = platzKey(platz, week.start, tab)
      if (vorsitzSlot && platz.slot === vorsitzSlot) vorsitz.key = key
      if (!zaehltDerPlatz(platz, festerLeiter)) {
        platzJeSchluessel.set(key, null)
        continue
      }
      const bereich = bereichVon(platz) ?? null
      const folgt = platz.art === 'programm' && folgtDemVorsitz(platz.section, platz.slot)
      platzJeSchluessel.set(key, { bereich, vorsitz: folgt ? vorsitz : null })
      if (!platzMitZusage(platz)) continue
      const pid = wer(platz.slot)
      // Was dem Vorsitz folgt und der Vorsitzende selbst hat, kam mit dem Vorsitz.
      if (!pid || !bekannt.has(pid) || (folgt && pid === vorsitz.pid)) continue
      ziel.push({ pid, wi, start: week.start, tab, bereich, hilfsdienst: platz.art === 'helper' })
    }
  }

  const einteilungen: Einteilung[] = []
  for (const wi of fenster.wochen) {
    const week = weeks[wi]
    if (!week) continue
    wocheJeMontag.set(week.start, wi)
    const da = new Set<string>()
    let gehalten = false
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      gehalten = true
      zusammenkuenfte++
      for (const p of persons) {
        if (istAbwesend(abwesend, p.id, wi, tab)) continue
        verfuegbar.set(p.id, (verfuegbar.get(p.id) ?? 0) + 1)
        da.add(p.id)
      }
      zaehlen(week, wi, tab, einteilungen)
    }
    // Ganz abwesend ist, wer in keiner Zusammenkunft der Woche da war — eine
    // Woche, in der alles ausfiel, zählt für niemanden.
    if (!gehalten) continue
    for (const p of persons) {
      if (da.has(p.id)) continue
      const montage = ganzAbwesend.get(p.id) ?? new Set<string>()
      montage.add(week.start)
      ganzAbwesend.set(p.id, montage)
    }
  }
  const plaetze = new Map<string, number>()
  for (const e of einteilungen) if (e.bereich) plaetze.set(e.bereich, (plaetze.get(e.bereich) ?? 0) + 1)

  // Ab der laufenden Woche, was schon eingeteilt ist — nach derselben Regel.
  const geplant: Einteilung[] = []
  weeks.forEach((week, wi) => {
    if (week.start < fenster.bis) return
    for (const tab of MEETING_TABS) if (!istAusgefallen(week, tab)) zaehlen(week, wi, tab, geplant)
  })

  // Gezählt wird eine Absage in einer Zusammenkunft, die stattfand, von einer
  // Person der Versammlung, auf einem Platz, der zählt — wie die Zuteilungen.
  // Ein Treffpunkt zählt unter „Treffpunkte leiten"; seine Woche reicht, den
  // Tag kennen nur die Treffpunkt-Wochen.
  const liste = eingabe.absagen ?? []
  const abgesagt = new Set(liste.map((a) => `${a.personId}|${a.taskKey}`))
  const absagen: AbsageEinteilung[] = []
  for (const a of liste) {
    if (!bekannt.has(a.personId)) continue
    const teile = schluesselTeile(a.taskKey)
    const wi = teile ? wocheJeMontag.get(teile.woche) : undefined
    if (!teile || wi === undefined) continue
    if (teile.art === 'fs') {
      absagen.push({ pid: a.personId, bereich: TREFFPUNKT_BEREICH })
      continue
    }
    const week = weeks[wi]
    if (!week || istAusgefallen(week, teile.tab)) continue
    const platz = platzJeSchluessel.get(a.taskKey)
    if (platz === null) continue
    // Was dem Vorsitz folgt, sagt der Vorsitzende mit dem Vorsitz ab: Er hat
    // ihn noch, oder er hat ihn mit abgesagt (dann sitzt dort ein anderer).
    // Gezählt ist es mit der Absage des Vorsitzes.
    const vorsitz = platz?.vorsitz
    if (vorsitz && (vorsitz.pid === a.personId || (vorsitz.key !== null && abgesagt.has(`${a.personId}|${vorsitz.key}`)))) continue
    // Einen Platz, den es nicht mehr gibt, zählt die Person — ein Bereich ist nicht zu sagen.
    absagen.push({ pid: a.personId, bereich: platz?.bereich ?? null })
  }
  return { fenster, einteilungen, plaetze, zusammenkuenfte, verfuegbar, ganzAbwesend, geplant, absagen }
}

/**
 * **Erwartet je Bereich und Person**: die Plätze des Bereichs, verteilt auf alle,
 * die ihn haben — jeder nach den Zusammenkünften, in denen er da war.
 */
function erwartungen(g: Grundlage, persons: readonly Person[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const [bereich, anzahl] of g.plaetze) {
    const qualifiziert = persons.filter((p) => isQualified(p, bereich))
    const summe = qualifiziert.reduce((s, p) => s + (g.verfuegbar.get(p.id) ?? 0), 0)
    const je = new Map<string, number>()
    for (const p of qualifiziert) je.set(p.id, summe > 0 ? (anzahl * (g.verfuegbar.get(p.id) ?? 0)) / summe : 0)
    out.set(bereich, je)
  }
  return out
}

/** Die Bereiche mit Plätzen im Zeitraum, die eine Person hat. */
function bereicheVon(g: Grundlage, p: Person): string[] {
  return [...g.plaetze.keys()].filter((b) => isQualified(p, b))
}

/** Die Einteilungen je Person — einmal gruppiert, statt je Person über alle zu laufen. */
function einteilungenJePerson(g: Grundlage): Map<string, Einteilung[]> {
  const out = new Map<string, Einteilung[]>()
  for (const e of g.einteilungen) {
    const liste = out.get(e.pid)
    if (liste) liste.push(e)
    else out.set(e.pid, [e])
  }
  return out
}

/** Wie oft jede Person in jedem Bereich dran war: Person → Bereich → Anzahl. */
function anzahlJeBereich(g: Grundlage): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const e of g.einteilungen) {
    if (!e.bereich) continue
    const je = out.get(e.pid) ?? new Map<string, number>()
    je.set(e.bereich, (je.get(e.bereich) ?? 0) + 1)
    out.set(e.pid, je)
  }
  return out
}

/* ---- Kennzahlen und Last --------------------------------------------------- */

export interface LastZeile {
  pid: string
  n: number
}

export interface Kennzahlen {
  zuteilungen: number
  /**
   * Personen mit mindestens einem Bereich, der im Zeitraum Plätze hatte — ohne
   * wen, der den ganzen Zeitraum fehlte: Von ihm wird nichts erwartet.
   */
  mitBereichen: number
  eingeteilt: number
  /** Mit Bereich, aber im ganzen Zeitraum nie eingeteilt — obwohl da. */
  nie: number
  /** Anteil der zehn mit den meisten Zuteilungen (0 bis 1). */
  anteilOben: number
  /** Je Person mit Bereich die Zuteilungen, die meisten zuerst. */
  last: LastZeile[]
}

export const OBEN_ANZAHL = 10

/** War die Person im Zeitraum wenigstens in einer Zusammenkunft da? */
function warDa(g: Grundlage, p: Person): boolean {
  return (g.verfuegbar.get(p.id) ?? 0) > 0
}

export function kennzahlen(g: Grundlage, persons: readonly Person[]): Kennzahlen {
  const je = new Map<string, number>()
  for (const e of g.einteilungen) je.set(e.pid, (je.get(e.pid) ?? 0) + 1)
  // Wer den ganzen Zeitraum fehlte, steht weder unter „nie dran" noch in der Last.
  const mitBereich = persons.filter((p) => je.has(p.id) || (warDa(g, p) && bereicheVon(g, p).length > 0))
  const last = mitBereich
    .map((p) => ({ pid: p.id, n: je.get(p.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.pid.localeCompare(b.pid))
  const zuteilungen = g.einteilungen.length
  const oben = last.slice(0, OBEN_ANZAHL).reduce((s, z) => s + z.n, 0)
  return {
    zuteilungen,
    mitBereichen: mitBereich.length,
    eingeteilt: last.filter((z) => z.n > 0).length,
    nie: last.filter((z) => z.n === 0).length,
    anteilOben: zuteilungen > 0 ? oben / zuteilungen : 0,
    last,
  }
}

/* ---- Zu oft, zu selten ----------------------------------------------------- */

/** Was verglichen wird: alle Aufgaben, nur die Schulungsaufgaben, oder mit den Hilfsdiensten. */
export type Vergleich = 'aufgaben' | 'schulung' | 'hilfsdienste'
export const VERGLEICHE: readonly Vergleich[] = ['aufgaben', 'schulung', 'hilfsdienste']
export type Lage = 'oft' | 'rahmen' | 'selten'

export interface VerteilungsZeile {
  pid: string
  /** Gezählte Zuteilungen — bei den Hilfsdiensten samt Aufgaben. */
  n: number
  erwartet: number
  /** Davon Hilfsdienste (nur beim Vergleich mit den Hilfsdiensten von Belang). */
  hilfsdienste: number
  lage: Lage
}

export interface Verteilung {
  vergleich: Vergleich
  oft: VerteilungsZeile[]
  rahmen: VerteilungsZeile[]
  selten: VerteilungsZeile[]
  /** Das Ende der Achse: die größte Zahl oder die obere Grenze, wer darüber liegt. */
  max: number
}

/** Liegt `n` bei dieser Erwartung über, in oder unter dem Üblichen? */
export function lageVon(n: number, erwartet: number): Lage {
  if (n > OBERE_GRENZE * erwartet && n - erwartet >= MINDESTABSTAND) return 'oft'
  if (n < UNTERE_GRENZE * erwartet && erwartet - n >= MINDESTABSTAND) return 'selten'
  return 'rahmen'
}

function gehoertZumVergleich(bereich: string, vergleich: Vergleich): boolean {
  if (vergleich === 'schulung') return SCHULUNG.has(bereich)
  if (vergleich === 'aufgaben') return !istHilfsdienstBereich(bereich)
  return true
}

export function verteilung(g: Grundlage, persons: readonly Person[], vergleich: Vergleich): Verteilung {
  const erwartet = erwartungen(g, persons)
  const jePerson = einteilungenJePerson(g)
  const zeilen: VerteilungsZeile[] = []
  for (const p of persons) {
    const bereiche = bereicheVon(g, p)
    // Wer im Vergleich mitzählt: bei den Hilfsdiensten, wer einen hat; sonst, wer einen Bereich des Vergleichs hat.
    const dabei = vergleich === 'hilfsdienste' ? bereiche.some(istHilfsdienstBereich) : bereiche.some((b) => gehoertZumVergleich(b, vergleich))
    if (!dabei) continue
    let n = 0
    let hilfsdienste = 0
    for (const e of jePerson.get(p.id) ?? []) {
      if (!e.bereich || !gehoertZumVergleich(e.bereich, vergleich)) continue
      n++
      if (e.hilfsdienst) hilfsdienste++
    }
    let summe = 0
    for (const b of bereiche) if (gehoertZumVergleich(b, vergleich)) summe += erwartet.get(b)?.get(p.id) ?? 0
    zeilen.push({ pid: p.id, n, erwartet: summe, hilfsdienste, lage: lageVon(n, summe) })
  }
  const verhaeltnis = (z: VerteilungsZeile): number => (z.erwartet > 0 ? z.n / z.erwartet : z.n)
  const nach = (lage: Lage) => zeilen.filter((z) => z.lage === lage)
  return {
    vergleich,
    oft: nach('oft').sort((a, b) => verhaeltnis(b) - verhaeltnis(a)),
    rahmen: nach('rahmen').sort((a, b) => b.n - a.n || b.erwartet - a.erwartet),
    selten: nach('selten').sort((a, b) => verhaeltnis(a) - verhaeltnis(b)),
    max: Math.max(1, ...zeilen.map((z) => Math.max(z.n, OBERE_GRENZE * z.erwartet))),
  }
}

/* ---- Einseitig ------------------------------------------------------------- */

export interface BereichsZahl {
  bereich: string
  n: number
  /** Wie oft die anderen mit diesem Bereich ihn im Schnitt hatten. */
  schnittAndere: number
}

export interface EinseitigZeile {
  pid: string
  gesamt: number
  /** Je Bereich der Person, die meisten zuerst. */
  bereiche: BereichsZahl[]
  /** Der Bereich mit zwei Dritteln und mehr — sonst `null`. */
  ueberwiegt: string | null
  /** Bereiche, die er hat und in denen er nie dran war, obwohl die anderen sie oft hatten. */
  nie: string[]
}

export function istEinseitig(z: EinseitigZeile): boolean {
  return z.ueberwiegt !== null || z.nie.length > 0
}

/**
 * Je Person mit zwei und mehr Bereichen: wie sich ihre Zuteilungen verteilen —
 * die einseitigen zuerst.
 */
export function einseitig(g: Grundlage, persons: readonly Person[]): EinseitigZeile[] {
  const zahl = anzahlJeBereich(g)
  const anzahl = (pid: string, bereich: string): number => zahl.get(pid)?.get(bereich) ?? 0
  const qualifiziert = new Map<string, Person[]>()
  for (const b of g.plaetze.keys()) qualifiziert.set(b, persons.filter((p) => isQualified(p, b)))

  const out: EinseitigZeile[] = []
  for (const p of persons) {
    const eigene = bereicheVon(g, p)
    // Wer den ganzen Zeitraum fehlte, war in keinem Bereich „nie dran".
    if (eigene.length < 2 || !warDa(g, p)) continue
    const bereiche = eigene
      .map((bereich) => {
        const andere = (qualifiziert.get(bereich) ?? []).filter((q) => q.id !== p.id)
        const summe = andere.reduce((s, q) => s + anzahl(q.id, bereich), 0)
        return { bereich, n: anzahl(p.id, bereich), schnittAndere: andere.length ? summe / andere.length : 0 }
      })
      .sort((a, b) => b.n - a.n)
    const gesamt = bereiche.reduce((s, b) => s + b.n, 0)
    const erster = bereiche[0]
    const ueberwiegt = erster && gesamt >= EINSEITIG_AB && erster.n / gesamt >= UEBERWIEGT_AB ? erster.bereich : null
    const nie = bereiche.filter((b) => b.n === 0 && b.schnittAndere >= NIE_AB_SCHNITT).map((b) => b.bereich)
    out.push({ pid: p.id, gesamt, bereiche, ueberwiegt, nie })
  }
  return out.sort((a, b) => Number(istEinseitig(b)) - Number(istEinseitig(a)) || b.gesamt - a.gesamt)
}

export interface Matrix {
  /** Die Bereiche mit Plätzen im Zeitraum, in der Reihenfolge der Spalten. */
  bereiche: string[]
  zeilen: { pid: string; einseitig: boolean; werte: (number | null)[] }[]
}

/**
 * **Wer bekommt was**: Person × Bereich. `null` heißt, er hat den Bereich nicht;
 * `0`, er hat ihn und war nie dran. `ordnung` gibt die Reihenfolge der Spalten
 * vor (Bereiche, die sie nicht kennt, kommen hinten an).
 */
export function matrix(g: Grundlage, persons: readonly Person[], zeilen: readonly EinseitigZeile[], ordnung: readonly string[]): Matrix {
  const rang = (b: string): number => {
    const i = ordnung.indexOf(b)
    return i < 0 ? ordnung.length : i
  }
  const bereiche = [...g.plaetze.keys()].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b))
  const zahl = anzahlJeBereich(g)
  const einseitigeIds = new Set(zeilen.filter(istEinseitig).map((z) => z.pid))
  return {
    bereiche,
    zeilen: persons
      .filter((p) => bereiche.some((b) => isQualified(p, b)))
      .map((p) => ({
        pid: p.id,
        einseitig: einseitigeIds.has(p.id),
        werte: bereiche.map((b) => (isQualified(p, b) ? (zahl.get(p.id)?.get(b) ?? 0) : null)),
      })),
  }
}

/* ---- Wartezeiten ----------------------------------------------------------- */

export interface Warten {
  pid: string
  /** Wochen seit dem letzten Mal bis zur laufenden Woche — `null`: nie im Zeitraum. */
  wochen: number | null
  /** Davon die Wochen, in denen die Person ganz fehlte (`Grundlage.ganzAbwesend`). */
  abwesend: number
  /**
   * Die Wartezeit, wie sie zählt: `wochen` ohne die abwesenden — `null`: nie im
   * Zeitraum. Danach wird sortiert und „wartet lange" entschieden (Betreiber
   * 17.10.2026: Abwesenheit und Geplantes zählen).
   */
  wartend: number | null
  /** Montag der Woche des letzten Mals (ISO). */
  zuletzt: string | null
  /** Montag der nächsten Woche, in der die Person im Bereich schon eingeteilt ist — wer geplant ist, wartet nicht. */
  geplant: string | null
  lange: boolean
}

export interface Schnell {
  pid: string
  /** Mittlerer Abstand in Wochen. */
  abstand: number
  mal: number
  /** Je Woche des Zeitraums: dran oder nicht. */
  wochen: boolean[]
}

export interface Wartezeiten {
  bereich: string
  /**
   * Der übliche Abstand zwischen zwei Malen derselben Person, in Wochen: der
   * mittlere der mittleren Abstände je Person — `null`, wenn niemand zweimal dran war.
   */
  ueblich: number | null
  warten: Warten[]
  schnell: Schnell[]
}

/** Länger als doppelt so lange wie üblich ist „wartet lange", höchstens halb so lange „schnell wieder". */
export const LANGE_AB = 2
export const SCHNELL_BIS = 0.5

export function wartezeiten(g: Grundlage, persons: readonly Person[], bereich: string): Wartezeiten {
  const male = new Map<string, string[]>()
  for (const e of g.einteilungen) {
    if (e.bereich !== bereich) continue
    const liste = male.get(e.pid) ?? []
    if (!liste.includes(e.start)) liste.push(e.start)
    male.set(e.pid, liste)
  }
  const abstaende = (starts: string[]): number[] => starts.slice(1).map((s, i) => wochenZwischen(starts[i]!, s))
  for (const liste of male.values()) liste.sort()
  // Üblich ist der Abstand, den die Person in der Mitte hat — je Person ihr
  // mittlerer, darüber der mittlere. Über alle Abstände zusammen bestimmte einer,
  // der jede Woche dran ist, das Übliche für alle.
  const jePerson = [...male.values()].map((liste) => median(abstaende(liste))).filter((x): x is number => x !== null)
  const ueblich = median(jePerson)

  const qualifiziert = persons.filter((p) => isQualified(p, bereich))
  // „Nie im Zeitraum" wartet nur dann lange, wenn auf ihn mindestens ein Platz
  // gekommen wäre — sonst stünde in einem seltenen Bereich jeder da.
  const plaetze = g.plaetze.get(bereich) ?? 0
  const verfuegbar = qualifiziert.reduce((s, p) => s + (g.verfuegbar.get(p.id) ?? 0), 0)
  const erwartet = (p: Person): number => (verfuegbar > 0 ? (plaetze * (g.verfuegbar.get(p.id) ?? 0)) / verfuegbar : 0)
  // Die nächste Woche, in der jemand im Bereich schon eingeteilt ist.
  const geplantAb = new Map<string, string>()
  for (const e of g.geplant) {
    if (e.bereich !== bereich) continue
    const bisher = geplantAb.get(e.pid)
    if (bisher === undefined || e.start < bisher) geplantAb.set(e.pid, e.start)
  }
  const warten = qualifiziert
    .map((p): Warten => {
      const liste = male.get(p.id)
      const zuletzt = liste?.at(-1) ?? null
      const wochen = zuletzt ? wochenZwischen(zuletzt, g.fenster.bis) : null
      // Wochen, in denen die Person ganz fehlte, zählen nicht zur Wartezeit.
      const abwesend = zuletzt ? [...(g.ganzAbwesend.get(p.id) ?? [])].filter((s) => s > zuletzt).length : 0
      const wartend = wochen === null ? null : wochen - abwesend
      const geplant = geplantAb.get(p.id) ?? null
      const lange = ueblich !== null && geplant === null && (wartend === null ? erwartet(p) >= 1 : wartend > LANGE_AB * ueblich)
      return { pid: p.id, wochen, abwesend, wartend, zuletzt, geplant, lange }
    })
    // Wer geplant ist, wartet nicht und steht hinten; sonst wer am längsten wartet zuerst.
    .sort(
      (a, b) =>
        Number(a.geplant !== null) - Number(b.geplant !== null) ||
        (b.wartend ?? Infinity) - (a.wartend ?? Infinity) ||
        a.pid.localeCompare(b.pid),
    )

  const schnell: Schnell[] = []
  if (ueblich !== null) {
    for (const p of qualifiziert) {
      const liste = male.get(p.id) ?? []
      if (liste.length < 3) continue
      const abstand = median(abstaende(liste))
      if (abstand === null || abstand > SCHNELL_BIS * ueblich) continue
      schnell.push({ pid: p.id, abstand, mal: liste.length, wochen: g.fenster.montage.map((s) => liste.includes(s)) })
    }
    schnell.sort((a, b) => a.abstand - b.abstand || b.mal - a.mal)
  }
  return { bereich, ueblich, warten, schnell }
}

/* ---- Treffpunkte ----------------------------------------------------------- */

export interface TreffpunktGruppe {
  /** Die Gruppe — `null` für die Treffpunkte der Versammlung. */
  gruppe: string | null
  /** Je Leiter, wie oft — wer Treffpunkte leiten kann und es nie tat, mit 0 bei seiner Gruppe. */
  zeilen: LastZeile[]
}

export function treffpunkte(
  fsWeeks: readonly (readonly FsInstance[])[],
  fenster: Zeitfenster,
  persons: readonly Person[],
  groups: readonly Group[],
): TreffpunktGruppe[] {
  const bekannt = new Set(persons.map((p) => p.id))
  // Gruppe (die Versammlung als `null`, auch bei leerer Kennung) → Leiter → wie oft.
  const zahl = new Map<string | null, Map<string, number>>()
  for (const wi of fenster.wochen) {
    for (const inst of fsWeeks[wi] ?? []) {
      if (!inst.lpid || inst.lext || !bekannt.has(inst.lpid)) continue
      const je = zahl.get(inst.grp || null) ?? new Map<string, number>()
      je.set(inst.lpid, (je.get(inst.lpid) ?? 0) + 1)
      zahl.set(inst.grp || null, je)
    }
  }
  const gruppe = (id: string | null): TreffpunktGruppe => {
    const zeilen = new Map(zahl.get(id))
    if (id !== null) {
      for (const p of persons) if (p.priv.treffpunkt && p.grp === id && !zeilen.has(p.id)) zeilen.set(p.id, 0)
    }
    return { gruppe: id, zeilen: [...zeilen].map(([pid, n]) => ({ pid, n })).sort((a, b) => b.n - a.n || a.pid.localeCompare(b.pid)) }
  }
  return [...groups.map((g) => gruppe(g.id)), gruppe(null)].filter((g) => g.zeilen.length > 0)
}

/* ---- Absagen --------------------------------------------------------------- */

export interface AbsagenZeile {
  bereich: string
  n: number
  /** Die gezählten Zuteilungen des Bereichs im Zeitraum — der Anteil bezieht sich darauf. */
  von: number
  /** `n / von`, höchstens 1: Derselbe Platz kann mehrmals abgesagt werden. */
  anteil: number
}

/** „Viele Absagen": mindestens so viele — und doppelt so viel Anteil wie jeder andere Bereich. */
export const VIELE_ABSAGEN_FAKTOR = 2

/**
 * **Absagen je Bereich** (Entwurf `HandyMehr`): wie viele Zuteilungen eines
 * Bereichs abgesagt wurden, gemessen an allen seinen Zuteilungen. Ein
 * Treffpunkt zählt gegen die geleiteten Treffpunkte (`treffpunktPlaetze`).
 * Die meisten zuerst.
 */
export function absagenJeBereich(g: Grundlage, treffpunktPlaetze: number): AbsagenZeile[] {
  const zahl = new Map<string, number>()
  for (const a of g.absagen) if (a.bereich) zahl.set(a.bereich, (zahl.get(a.bereich) ?? 0) + 1)
  return [...zahl]
    .map(([bereich, n]) => {
      const von = bereich === TREFFPUNKT_BEREICH ? treffpunktPlaetze : (g.plaetze.get(bereich) ?? 0)
      return { bereich, n, von, anteil: von > 0 ? Math.min(1, n / von) : 1 }
    })
    .sort((a, b) => b.n - a.n || b.anteil - a.anteil || a.bereich.localeCompare(b.bereich))
}

/** Fällt ein Bereich mit seinen Absagen auf? Mindestens drei, und doppelt so viel Anteil wie jeder andere. */
export function vieleAbsagen(zeilen: readonly AbsagenZeile[]): { zeile: AbsagenZeile; sonst: number }[] {
  return zeilen.flatMap((zeile) => {
    if (zeile.n < MINDESTABSTAND) return []
    const sonst = Math.max(0, ...zeilen.filter((z) => z !== zeile).map((z) => z.anteil))
    return zeile.anteil >= VIELE_ABSAGEN_FAKTOR * sonst ? [{ zeile, sonst }] : []
  })
}

/* ---- Ballungen ------------------------------------------------------------- */

export interface Ballungen {
  /** Zwei und mehr gezählte Plätze in einer Zusammenkunft (von Hand so eingeteilt). */
  zweimal: { pid: string; start: string; tab: MeetingKey; bereiche: (string | null)[] }[]
  /** Drei und mehr Wochen hintereinander im selben Bereich. */
  folge: { pid: string; bereich: string; ab: string; wochen: number }[]
}

export const FOLGE_AB = 3

export function ballungen(g: Grundlage): Ballungen {
  const jeZusammenkunft = new Map<string, Einteilung[]>()
  // Person → Bereich → die Montage, an denen sie dort dran war.
  const jeBereich = new Map<string, Map<string, string[]>>()
  for (const e of g.einteilungen) {
    const k = `${e.pid}|${e.start}|${e.tab}`
    jeZusammenkunft.set(k, [...(jeZusammenkunft.get(k) ?? []), e])
    if (e.bereich) {
      const bereiche = jeBereich.get(e.pid) ?? new Map<string, string[]>()
      const liste = bereiche.get(e.bereich) ?? []
      if (!liste.includes(e.start)) liste.push(e.start)
      bereiche.set(e.bereich, liste)
      jeBereich.set(e.pid, bereiche)
    }
  }
  const zweimal = [...jeZusammenkunft.values()]
    .filter((liste) => liste.length >= 2)
    .map((liste) => ({ pid: liste[0]!.pid, start: liste[0]!.start, tab: liste[0]!.tab, bereiche: liste.map((e) => e.bereich) }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.tab.localeCompare(b.tab))
  const folge: Ballungen['folge'] = []
  for (const [pid, bereiche] of jeBereich) {
    for (const [bereich, starts] of bereiche) {
      starts.sort()
      let ab = 0
      for (let i = 1; i <= starts.length; i++) {
        const weiter = i < starts.length && wochenZwischen(starts[i - 1]!, starts[i]!) === 1
        if (weiter) continue
        if (i - ab >= FOLGE_AB) folge.push({ pid, bereich, ab: starts[ab]!, wochen: i - ab })
        ab = i
      }
    }
  }
  folge.sort((a, b) => a.ab.localeCompare(b.ab) || a.pid.localeCompare(b.pid))
  return { zweimal, folge }
}

/* ---- Was auffällt ---------------------------------------------------------- */

export type Hinweis =
  | { art: 'selten' | 'oft'; pid: string; vergleich: Vergleich; n: number; erwartet: number }
  | { art: 'einseitig'; pid: string; zeile: EinseitigZeile }
  /** `wochen` seit dem letzten Mal steht im Text, `wartend` (ohne Abwesenheit) ordnet. */
  | { art: 'wartet'; pid: string; bereich: string; wochen: number | null; wartend: number | null; ueblich: number }
  /** Ein Bereich, keine Person: Ein Tipp führt zu den Absagen (T126). */
  | { art: 'absagen'; bereich: string; anteil: number; sonst: number }

/**
 * **Was auffällt**, das Wichtigste zuerst: zu selten, zu oft, einseitig, wartet
 * lange, viele Absagen. Je Person und Art nur der deutlichste Fall — wer in den
 * Aufgaben und mit den Hilfsdiensten zu selten dran ist, steht einmal da.
 */
export function hinweise(
  verteilungen: readonly Verteilung[],
  einseitige: readonly EinseitigZeile[],
  warten: readonly Wartezeiten[],
  absagen: readonly AbsagenZeile[] = [],
): Hinweis[] {
  const staerke = (n: number, e: number): number => (e > 0 ? Math.abs(n - e) / e : n)
  const besteJe = new Map<string, Extract<Hinweis, { art: 'selten' | 'oft' }>>()
  for (const v of verteilungen) {
    for (const z of [...v.selten, ...v.oft]) {
      const art = z.lage === 'oft' ? 'oft' : 'selten'
      const k = `${art}|${z.pid}`
      const bisher = besteJe.get(k)
      if (!bisher || staerke(z.n, z.erwartet) > staerke(bisher.n, bisher.erwartet)) {
        besteJe.set(k, { art, pid: z.pid, vergleich: v.vergleich, n: z.n, erwartet: z.erwartet })
      }
    }
  }
  const nachStaerke = (a: { n: number; erwartet: number }, b: { n: number; erwartet: number }) => staerke(b.n, b.erwartet) - staerke(a.n, a.erwartet)
  const selten = [...besteJe.values()].filter((h) => h.art === 'selten').sort(nachStaerke)
  const oft = [...besteJe.values()].filter((h) => h.art === 'oft').sort(nachStaerke)
  const einseitig: Hinweis[] = einseitige.filter(istEinseitig).map((zeile) => ({ art: 'einseitig', pid: zeile.pid, zeile }))

  const wartenJe = new Map<string, Extract<Hinweis, { art: 'wartet' }>>()
  const faktor = (h: { wartend: number | null; ueblich: number }) => (h.wartend === null ? Infinity : h.wartend / h.ueblich)
  for (const w of warten) {
    if (w.ueblich === null) continue
    for (const z of w.warten) {
      if (!z.lange) continue
      const kandidat = { art: 'wartet' as const, pid: z.pid, bereich: w.bereich, wochen: z.wochen, wartend: z.wartend, ueblich: w.ueblich }
      const bisher = wartenJe.get(z.pid)
      if (!bisher || faktor(kandidat) > faktor(bisher)) wartenJe.set(z.pid, kandidat)
    }
  }
  const wartet = [...wartenJe.values()].sort((a, b) => faktor(b) - faktor(a) || a.pid.localeCompare(b.pid))
  const viele: Hinweis[] = vieleAbsagen(absagen).map(({ zeile, sonst }) => ({ art: 'absagen', bereich: zeile.bereich, anteil: zeile.anteil, sonst }))
  return [...selten, ...oft, ...einseitig, ...wartet, ...viele]
}

/* ---- Eine Person ----------------------------------------------------------- */

/** Was eine Woche für eine Person war: Aufgabe vor Hilfsdienst vor abwesend vor nichts. */
export type WochenArt = 'aufgabe' | 'hilfsdienst' | 'abwesend' | null

export interface PersonBild {
  pid: string
  aufgaben: number
  erwartetAufgaben: number
  hilfsdienste: number
  /** Zusammenkünfte im Zeitraum, in denen sie abwesend war. */
  abwesend: number
  /** Ihre Absagen im Zeitraum (T126). */
  absagen: number
  /**
   * Je Bereich der Person: wie oft, wie oft erwartet, das letzte Mal (Montag,
   * ISO) und wie viele Wochen das vor der laufenden war.
   */
  bereiche: { bereich: string; n: number; erwartet: number; zuletzt: string | null; vorWochen: number | null }[]
  /** Je Woche des Zeitraums, die älteste zuerst. */
  wochen: WochenArt[]
}

export function personBild(g: Grundlage, weeks: readonly Week[], persons: readonly Person[], abwesend: AbsenceSet, pid: string): PersonBild | null {
  const p = persons.find((x) => x.id === pid)
  if (!p) return null
  const erwartet = erwartungen(g, persons)
  const eigene = g.einteilungen.filter((e) => e.pid === pid)
  const bereiche = bereicheVon(g, p)
    .map((bereich) => {
      const hier = eigene.filter((e) => e.bereich === bereich)
      const zuletzt = hier.reduce<string | null>((z, e) => (z === null || e.start > z ? e.start : z), null)
      return {
        bereich,
        n: hier.length,
        erwartet: erwartet.get(bereich)?.get(pid) ?? 0,
        zuletzt,
        vorWochen: zuletzt ? wochenZwischen(zuletzt, g.fenster.bis) : null,
      }
    })
    .sort((a, b) => b.n - a.n || b.erwartet - a.erwartet)
  let abwesendMal = 0
  const wochen = g.fenster.wochen.map((wi): WochenArt => {
    const week = weeks[wi]
    const hier = eigene.filter((e) => e.wi === wi)
    let weg = false
    for (const tab of MEETING_TABS) {
      if (week && !istAusgefallen(week, tab) && istAbwesend(abwesend, pid, wi, tab)) {
        abwesendMal++
        weg = true
      }
    }
    if (hier.some((e) => !e.hilfsdienst)) return 'aufgabe'
    if (hier.length > 0) return 'hilfsdienst'
    return weg ? 'abwesend' : null
  })
  const aufgabenBereiche = bereiche.filter((b) => !istHilfsdienstBereich(b.bereich))
  return {
    pid,
    aufgaben: eigene.filter((e) => !e.hilfsdienst && e.bereich).length,
    erwartetAufgaben: aufgabenBereiche.reduce((s, b) => s + b.erwartet, 0),
    hilfsdienste: eigene.filter((e) => e.hilfsdienst).length,
    abwesend: abwesendMal,
    absagen: g.absagen.filter((a) => a.pid === pid).length,
    bereiche,
    wochen,
  }
}

/* ---- Alles zusammen -------------------------------------------------------- */

export interface Auswertung {
  zeitraum: Zeitraum
  grundlage: Grundlage
  kennzahlen: Kennzahlen
  verteilungen: Record<Vergleich, Verteilung>
  einseitig: EinseitigZeile[]
  /** Je Bereich mit Plätzen. */
  wartezeiten: Wartezeiten[]
  treffpunkte: TreffpunktGruppe[]
  /** Je Bereich mit Absagen, die meisten zuerst (T126). */
  absagen: AbsagenZeile[]
  ballungen: Ballungen
  hinweise: Hinweis[]
}

export function auswerten(eingabe: {
  weeks: readonly Week[]
  fsWeeks: readonly (readonly FsInstance[])[]
  persons: readonly Person[]
  services: readonly Service[]
  groups: readonly Group[]
  abwesend: AbsenceSet
  absagen?: readonly Absage[]
  heute: string
  zeitraum: Zeitraum
}): Auswertung {
  const fenster = zeitfenster(eingabe.weeks, ZEITRAUM_WOCHEN[eingabe.zeitraum], eingabe.heute)
  const g = grundlage({ ...eingabe, fenster })
  const verteilungen = {
    aufgaben: verteilung(g, eingabe.persons, 'aufgaben'),
    schulung: verteilung(g, eingabe.persons, 'schulung'),
    hilfsdienste: verteilung(g, eingabe.persons, 'hilfsdienste'),
  }
  const einseitige = einseitig(g, eingabe.persons)
  const wartezeitenListe = [...g.plaetze.keys()].map((b) => wartezeiten(g, eingabe.persons, b))
  const treffpunktGruppen = treffpunkte(eingabe.fsWeeks, fenster, eingabe.persons, eingabe.groups)
  // Die geleiteten Treffpunkte — gegen sie zählen die abgesagten.
  const geleitet = treffpunktGruppen.reduce((s, gr) => s + gr.zeilen.reduce((t, z) => t + z.n, 0), 0)
  const absagenListe = absagenJeBereich(g, geleitet)
  return {
    zeitraum: eingabe.zeitraum,
    grundlage: g,
    kennzahlen: kennzahlen(g, eingabe.persons),
    verteilungen,
    einseitig: einseitige,
    wartezeiten: wartezeitenListe,
    treffpunkte: treffpunktGruppen,
    absagen: absagenListe,
    ballungen: ballungen(g),
    hinweise: hinweise(Object.values(verteilungen), einseitige, wartezeitenListe, absagenListe),
  }
}
