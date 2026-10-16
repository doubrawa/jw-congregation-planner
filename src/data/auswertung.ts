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
 *    ohne Gastredner und Kreisaufseher, ohne die Gruppen der Reinigung, nur in
 *    Zusammenkünften, die stattfanden (T30).
 *  - **Was dem Vorsitz folgt** (Anfangsgebet, Vortrag des Vorsitzenden,
 *    `folgtDemVorsitz`), zählt nicht, solange es der Vorsitzende selbst hat: Es
 *    kam mit dem Vorsitz. Spricht ein anderer das Anfangsgebet, zählt es.
 *  - **Der feste Wachtturm-Studium-Leiter** zählt nicht, solange die
 *    Versammlung einen hat (`wtLeiterZuerst`): Der Platz rotiert nicht.
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

import { folgtDemVorsitz } from '../../supabase/functions/_shared/planung.ts'
import { istAbwesend, type AbsenceSet } from './absence'
import { gehoertZu, idAufloeser, isQualified, istArt, istAusgefallen, MEETING_TABS } from './helpers'
import { montagVon, tagNach } from './meeting-dates'
import { allePlaetze, platzMitZusage, type Platz } from './plaetze'
import { bereichVon, vorsitzPlatz } from './planning'
import type { FsInstance, Group, Meeting, MeetingKey, Person, Service, Week } from './types'

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

const TAG_MS = 864e5

/** Ist der Bereich ein Hilfsdienst (`svc:<dienst>`, `serviceQualKey`)? */
export function istHilfsdienstBereich(bereich: string): boolean {
  return bereich.startsWith('svc:')
}

/** Ganze Wochen von Montag `a` bis Montag `b` (beide ISO). */
function wochenZwischen(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / (7 * TAG_MS))
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
  /** Der Aufgabenbereich (`bereichVon`) — `null` für einen Platz ohne, etwa den Vortrag am Sonntag. */
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
}

/**
 * **Die abgeschlossenen Wochen eines Zeitraums** — bis vor die laufende Woche:
 * Was noch kommt, ist geplant, nicht gehalten.
 */
export function zeitfenster(weeks: readonly Week[], anzahlWochen: number, heute: string): Zeitfenster {
  const bis = montagVon(heute)
  const von = tagNach(bis, -7 * anzahlWochen)
  const wochen: number[] = []
  weeks.forEach((w, wi) => {
    if (w.start >= von && w.start < bis) wochen.push(wi)
  })
  return { von, bis, wochen }
}

export interface Grundlage {
  fenster: Zeitfenster
  einteilungen: Einteilung[]
  /** Besetzte, gezählte Plätze je Bereich. */
  plaetze: ReadonlyMap<string, number>
  /** Zusammenkünfte, die im Zeitraum stattfanden. */
  zusammenkuenfte: number
  /** Je Person: in wie vielen davon sie nicht abwesend war. */
  verfuegbar: ReadonlyMap<string, number>
}

/**
 * Hatte der Vorsitzende diesen Platz, weil er dem Vorsitz folgt? Dann kam er mit
 * dem Vorsitz und zählt nicht ein zweites Mal.
 */
function folgtGehaltenDemVorsitz(
  meeting: Meeting,
  platz: Platz,
  persons: readonly Person[],
  wer: ReturnType<typeof idAufloeser>,
): boolean {
  if (platz.art !== 'programm' || !folgtDemVorsitz(platz.section, platz.slot)) return false
  const vorsitz = vorsitzPlatz(meeting)
  if (!vorsitz?.name) return false
  const pid = wer(platz.slot)
  const person = persons.find((p) => p.id === pid)
  return person !== undefined && gehoertZu(vorsitz, person)
}

export function grundlage(eingabe: {
  weeks: readonly Week[]
  persons: readonly Person[]
  services: readonly Service[]
  abwesend: AbsenceSet
  fenster: Zeitfenster
}): Grundlage {
  const { weeks, persons, services, abwesend, fenster } = eingabe
  const wer = idAufloeser(persons)
  const bekannt = new Set(persons.map((p) => p.id))
  const festerLeiter = persons.some((p) => p.priv.wtLeiter)
  const einteilungen: Einteilung[] = []
  const plaetze = new Map<string, number>()
  const verfuegbar = new Map<string, number>(persons.map((p) => [p.id, 0]))
  let zusammenkuenfte = 0

  for (const wi of fenster.wochen) {
    const week = weeks[wi]
    if (!week) continue
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      const meeting = week[tab]
      zusammenkuenfte++
      for (const p of persons) {
        if (!istAbwesend(abwesend, p.id, wi, tab)) verfuegbar.set(p.id, (verfuegbar.get(p.id) ?? 0) + 1)
      }
      for (const platz of allePlaetze(meeting, services)) {
        if (!platzMitZusage(platz)) continue
        if (folgtGehaltenDemVorsitz(meeting, platz, persons, wer)) continue
        if (festerLeiter && platz.art === 'programm' && istArt(platz.section, 'wtStudium') && platz.slot.rolle === 'Leiter') continue
        const pid = wer(platz.slot)
        if (!pid || !bekannt.has(pid)) continue
        const bereich = bereichVon(platz) ?? null
        if (bereich) plaetze.set(bereich, (plaetze.get(bereich) ?? 0) + 1)
        einteilungen.push({ pid, wi, start: week.start, tab, bereich, hilfsdienst: platz.art === 'helper' })
      }
    }
  }
  return { fenster, einteilungen, plaetze, zusammenkuenfte, verfuegbar }
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

/* ---- Kennzahlen und Last --------------------------------------------------- */

export interface LastZeile {
  pid: string
  n: number
}

export interface Kennzahlen {
  zuteilungen: number
  /** Personen mit mindestens einem Bereich, der im Zeitraum Plätze hatte. */
  mitBereichen: number
  eingeteilt: number
  /** Mit Bereich, aber im ganzen Zeitraum nie eingeteilt. */
  nie: number
  /** Anteil der zehn mit den meisten Zuteilungen (0 bis 1). */
  anteilOben: number
  /** Je Person mit Bereich die Zuteilungen, die meisten zuerst. */
  last: LastZeile[]
}

export const OBEN_ANZAHL = 10

export function kennzahlen(g: Grundlage, persons: readonly Person[]): Kennzahlen {
  const je = new Map<string, number>()
  for (const e of g.einteilungen) je.set(e.pid, (je.get(e.pid) ?? 0) + 1)
  const mitBereich = persons.filter((p) => bereicheVon(g, p).length > 0 || je.has(p.id))
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
  const zeilen: VerteilungsZeile[] = []
  for (const p of persons) {
    const bereiche = bereicheVon(g, p)
    // Wer im Vergleich mitzählt: bei den Hilfsdiensten, wer einen hat; sonst, wer einen Bereich des Vergleichs hat.
    const dabei = vergleich === 'hilfsdienste' ? bereiche.some(istHilfsdienstBereich) : bereiche.some((b) => gehoertZumVergleich(b, vergleich))
    if (!dabei) continue
    let n = 0
    let hilfsdienste = 0
    for (const e of g.einteilungen) {
      if (e.pid !== p.id || !e.bereich || !gehoertZumVergleich(e.bereich, vergleich)) continue
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
  const zahl = new Map<string, number>()
  for (const e of g.einteilungen) if (e.bereich) zahl.set(`${e.pid}|${e.bereich}`, (zahl.get(`${e.pid}|${e.bereich}`) ?? 0) + 1)
  const qualifiziert = new Map<string, Person[]>()
  for (const b of g.plaetze.keys()) qualifiziert.set(b, persons.filter((p) => isQualified(p, b)))

  const out: EinseitigZeile[] = []
  for (const p of persons) {
    const eigene = bereicheVon(g, p)
    if (eigene.length < 2) continue
    const bereiche = eigene
      .map((bereich) => {
        const andere = (qualifiziert.get(bereich) ?? []).filter((q) => q.id !== p.id)
        const summe = andere.reduce((s, q) => s + (zahl.get(`${q.id}|${bereich}`) ?? 0), 0)
        return { bereich, n: zahl.get(`${p.id}|${bereich}`) ?? 0, schnittAndere: andere.length ? summe / andere.length : 0 }
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
  const zahl = new Map<string, number>()
  for (const e of g.einteilungen) if (e.bereich) zahl.set(`${e.pid}|${e.bereich}`, (zahl.get(`${e.pid}|${e.bereich}`) ?? 0) + 1)
  const einseitigeIds = new Set(zeilen.filter(istEinseitig).map((z) => z.pid))
  return {
    bereiche,
    zeilen: persons
      .filter((p) => bereiche.some((b) => isQualified(p, b)))
      .map((p) => ({
        pid: p.id,
        einseitig: einseitigeIds.has(p.id),
        werte: bereiche.map((b) => (isQualified(p, b) ? (zahl.get(`${p.id}|${b}`) ?? 0) : null)),
      })),
  }
}

/* ---- Wartezeiten ----------------------------------------------------------- */

export interface Warten {
  pid: string
  /** Wochen seit dem letzten Mal bis zur laufenden Woche — `null`: nie im Zeitraum. */
  wochen: number | null
  /** Montag der Woche des letzten Mals (ISO). */
  zuletzt: string | null
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

export function wartezeiten(g: Grundlage, weeks: readonly Week[], persons: readonly Person[], bereich: string): Wartezeiten {
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
  const warten = qualifiziert
    .map((p): Warten => {
      const liste = male.get(p.id)
      const zuletzt = liste?.at(-1) ?? null
      const wochen = zuletzt ? wochenZwischen(zuletzt, g.fenster.bis) : null
      const lange = ueblich !== null && (wochen === null ? erwartet(p) >= 1 : wochen > LANGE_AB * ueblich)
      return { pid: p.id, wochen, zuletzt, lange }
    })
    .sort((a, b) => (b.wochen ?? Infinity) - (a.wochen ?? Infinity) || a.pid.localeCompare(b.pid))

  const starts = g.fenster.wochen.map((wi) => weeks[wi]?.start ?? '')
  const schnell: Schnell[] = []
  if (ueblich !== null) {
    for (const p of qualifiziert) {
      const liste = male.get(p.id) ?? []
      if (liste.length < 3) continue
      const abstand = median(abstaende(liste))
      if (abstand === null || abstand > SCHNELL_BIS * ueblich) continue
      schnell.push({ pid: p.id, abstand, mal: liste.length, wochen: starts.map((s) => liste.includes(s)) })
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
  const zahl = new Map<string, number>()
  const schluessel = (gruppe: string | null, pid: string): string => `${gruppe ?? ''}|${pid}`
  for (const wi of fenster.wochen) {
    for (const inst of fsWeeks[wi] ?? []) {
      if (!inst.lpid || inst.lext || !bekannt.has(inst.lpid)) continue
      const k = schluessel(inst.grp, inst.lpid)
      zahl.set(k, (zahl.get(k) ?? 0) + 1)
    }
  }
  const gruppe = (id: string | null): TreffpunktGruppe => {
    const zeilen = new Map<string, number>()
    for (const [k, n] of zahl) {
      const [g, pid] = k.split('|') as [string, string]
      if ((g || null) === id) zeilen.set(pid, n)
    }
    if (id !== null) {
      for (const p of persons) if (p.priv.treffpunkt && p.grp === id && !zeilen.has(p.id)) zeilen.set(p.id, 0)
    }
    return { gruppe: id, zeilen: [...zeilen].map(([pid, n]) => ({ pid, n })).sort((a, b) => b.n - a.n || a.pid.localeCompare(b.pid)) }
  }
  return [...groups.map((g) => gruppe(g.id)), gruppe(null)].filter((g) => g.zeilen.length > 0)
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
  const jeBereich = new Map<string, string[]>()
  for (const e of g.einteilungen) {
    const k = `${e.pid}|${e.start}|${e.tab}`
    jeZusammenkunft.set(k, [...(jeZusammenkunft.get(k) ?? []), e])
    if (e.bereich) {
      const kb = `${e.pid}|${e.bereich}`
      const liste = jeBereich.get(kb) ?? []
      if (!liste.includes(e.start)) liste.push(e.start)
      jeBereich.set(kb, liste)
    }
  }
  const zweimal = [...jeZusammenkunft.values()]
    .filter((liste) => liste.length >= 2)
    .map((liste) => ({ pid: liste[0]!.pid, start: liste[0]!.start, tab: liste[0]!.tab, bereiche: liste.map((e) => e.bereich) }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.tab.localeCompare(b.tab))
  const folge: Ballungen['folge'] = []
  for (const [k, starts] of jeBereich) {
    const [pid, bereich] = k.split('|') as [string, string]
    starts.sort()
    let ab = 0
    for (let i = 1; i <= starts.length; i++) {
      const weiter = i < starts.length && wochenZwischen(starts[i - 1]!, starts[i]!) === 1
      if (weiter) continue
      if (i - ab >= FOLGE_AB) folge.push({ pid, bereich, ab: starts[ab]!, wochen: i - ab })
      ab = i
    }
  }
  folge.sort((a, b) => a.ab.localeCompare(b.ab) || a.pid.localeCompare(b.pid))
  return { zweimal, folge }
}

/* ---- Was auffällt ---------------------------------------------------------- */

export type Hinweis =
  | { art: 'selten' | 'oft'; pid: string; vergleich: Vergleich; n: number; erwartet: number }
  | { art: 'einseitig'; pid: string; zeile: EinseitigZeile }
  | { art: 'wartet'; pid: string; bereich: string; wochen: number | null; ueblich: number }

/**
 * **Was auffällt**, das Wichtigste zuerst: zu selten, zu oft, einseitig, wartet
 * lange. Je Person und Art nur der deutlichste Fall — wer in den Aufgaben und
 * mit den Hilfsdiensten zu selten dran ist, steht einmal da.
 */
export function hinweise(
  verteilungen: readonly Verteilung[],
  einseitige: readonly EinseitigZeile[],
  warten: readonly Wartezeiten[],
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
  const faktor = (h: { wochen: number | null; ueblich: number }) => (h.wochen === null ? Infinity : h.wochen / h.ueblich)
  for (const w of warten) {
    if (w.ueblich === null) continue
    for (const z of w.warten) {
      if (!z.lange) continue
      const kandidat = { art: 'wartet' as const, pid: z.pid, bereich: w.bereich, wochen: z.wochen, ueblich: w.ueblich }
      const bisher = wartenJe.get(z.pid)
      if (!bisher || faktor(kandidat) > faktor(bisher)) wartenJe.set(z.pid, kandidat)
    }
  }
  const wartet = [...wartenJe.values()].sort((a, b) => faktor(b) - faktor(a) || a.pid.localeCompare(b.pid))
  return [...selten, ...oft, ...einseitig, ...wartet]
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
  const wartezeitenListe = [...g.plaetze.keys()].map((b) => wartezeiten(g, eingabe.weeks, eingabe.persons, b))
  return {
    zeitraum: eingabe.zeitraum,
    grundlage: g,
    kennzahlen: kennzahlen(g, eingabe.persons),
    verteilungen,
    einseitig: einseitige,
    wartezeiten: wartezeitenListe,
    treffpunkte: treffpunkte(eingabe.fsWeeks, fenster, eingabe.persons, eingabe.groups),
    ballungen: ballungen(g),
    hinweise: hinweise(Object.values(verteilungen), einseitige, wartezeitenListe),
  }
}
