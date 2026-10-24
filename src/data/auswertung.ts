/**
 * **Auswertung der Zuteilungen** (T126, Entwurf auf der Leinwand „Auswertung der
 * Zuteilungen", 16.10.2026): wer zu oft, zu selten oder einseitig eingeteilt
 * ist, wer lange wartet, wo die Plätze knapp sind, wer die Treffpunkte leitet,
 * wo sich Aufgaben ballen — und wo die Bereiche einer Person nicht stimmen.
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
 *  - **Was dem Vorsitz folgt** (Anfangsgebet, am Wochenende das Lesen des
 *    Wachtturms, Vortrag des Vorsitzenden, `folgtDemVorsitzIn`), zählt nicht,
 *    solange es der Vorsitzende selbst hat: Es kam mit dem Vorsitz. Spricht ein
 *    anderer das Anfangsgebet oder liest ein anderer, zählt es — ebenso das
 *    Lesen des Vorsitzenden, der das Studium selbst leitet.
 *  - **Der feste Wachtturm-Studium-Leiter** zählt nicht, solange die
 *    Versammlung einen hat (`wtLeiterZuerst`): Der Platz rotiert nicht.
 *  - **Absagen zählen nach derselben Regel** (`zaehltDerPlatz`): Eine Absage
 *    auf einem Platz, der selbst nicht zählt, höbe den Anteil ihres Bereichs
 *    ohne Grund (Review 17.10.2026).
 *  - **Erwartet** ist, was auf jemanden käme, wenn **jeder Platz** gleich auf
 *    alle verteilt wäre, die ihn in dieser Zusammenkunft hätten haben können:
 *    die den Bereich haben, da sind, schon dabei sind und nicht auf einem
 *    festen Platz stehen (`grundlage`). Eine Einteilung in einem Bereich, den
 *    die Person nicht hat, zählt nicht gegen sie — sie steht unter „Bereich
 *    ergänzen?" (`ohneBereich`).
 *  - **Hilfsdienste** vergibt die Automatik nach der Gesamtlast (`byTotal`):
 *    Wer viele Aufgaben hat, bekommt weniger. Verglichen wird dort deshalb die
 *    Summe aus Aufgaben und Hilfsdiensten.
 *
 * **Die Jahresprobe vom 18.10.2026** (ein Jahr echter Daten, intern gerechnet)
 * fand rund ein Drittel Fehlalarme; daher stammen die feste Rolle in der
 * Erwartung, „dabei seit", die Einteilungen ohne Bereich, die Erwartung beim
 * Einseitigen, die Ballungen nur mit Hilfsdienst und dies: **Wartezeiten,
 * Engpässe und die Pflege der Bereiche rechnen immer über das ganze Jahr**
 * (`JAHR`), gleich welcher Zeitraum gewählt ist. Gewartet wird seit dem letzten
 * Mal, nicht seit Beginn eines Fensters, und der übliche Abstand ist eine
 * Eigenschaft des Bereichs — im Fenster gemessen war er zu kurz und hing von
 * dessen Länge ab (Gebet 9, 7 und 2,5 Wochen bei 12, 6 und 3 Monaten statt
 * gerechneter 18).
 *
 * Alles hier ist rein: Eingabe sind die Daten der App, Ausgabe Zahlen je
 * Person-Id und Bereichsschlüssel. Namen und Beschriftungen setzt die Ansicht.
 */

import { schluesselTeile } from '../../supabase/functions/_shared/aufgaben-schluessel.ts'
import { istAbwesend, type AbsenceSet } from './absence'
import { idAufloeser, isQualified, isSpeakerRole, istArt, istAusgefallen, MEETING_TABS } from './helpers'
import { meetingOffset, montagVon, tagNach, versatzAbMontag, wochenZwischen } from './meeting-dates'
import { allePlaetze, platzKey, platzMitZusage, type Platz } from './plaetze'
import { bereichVon, folgtDemVorsitzIn, vorsitzPlatz } from './planning'
import type { Absage, FsInstance, Group, MeetingKey, MeetingTimes, Person, Service, Week } from './types'

/** Die Zeiträume zur Wahl, in Monaten — und wie viele Wochen jeder umfasst. */
export const ZEITRAEUME = [12, 6, 3] as const
export type Zeitraum = (typeof ZEITRAEUME)[number]
export const ZEITRAUM_WOCHEN: Record<Zeitraum, number> = { 12: 52, 6: 26, 3: 13 }
/** Über diesen Zeitraum rechnen Wartezeiten, Engpässe und die Pflege der Bereiche — immer. */
export const JAHR: Zeitraum = 12

/** Mehr als die Hälfte über der Erwartung ist „zu oft", weniger als die Hälfte „zu selten". */
export const OBERE_GRENZE = 1.5
export const UNTERE_GRENZE = 0.5
/** … und dazu mindestens so viele daneben — sonst ist eine 2 bei erwarteten 1 schon „zu oft". */
export const MINDESTABSTAND = 3
/**
 * Einseitig: so viel in einem Bereich, ab so vielen Zuteilungen — und dazu um
 * mehr als die Hälfte über dem Anteil, den der Bereich bei ihm haben sollte
 * (`OBERE_GRENZE`): Wer Mikrofone und Bibellesung hat, hat zwangsläufig vor
 * allem Mikrofone (Jahresprobe 18.10.2026).
 */
export const UEBERWIEGT_AB = 2 / 3
export const EINSEITIG_AB = 6
/** „Nie dran" zählt nur, wo die anderen den Bereich im Schnitt mindestens so oft hatten. */
export const NIE_AB_SCHNITT = 4
/** „Bereich ergänzen?": so oft im Jahr in einem Bereich eingeteilt, den die Person nicht hat. */
export const OHNE_BEREICH_AB = 2
/** „Bereich noch aktuell?": so viele Plätze wären im Jahr auf die Person gekommen, und sie war nie dran. */
export const NIE_GENUTZT_AB = MINDESTABSTAND

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
  /** Der Tag, für den gerechnet wird (ISO) — die Wochen einer Person trennen daran Gehaltenes von Geplantem. */
  heute: string
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
  return { von, bis, wochen, montage, heute }
}

/** Eine gezählte Absage: wer und in welchem Bereich — `null`, wenn es den Platz nicht mehr gibt. */
export interface AbsageEinteilung {
  pid: string
  bereich: string | null
  /** Index der Woche in `weeks` — die Wochen einer Person zeigen die Absage an ihrem Platz. */
  wi: number
  /** Die Zusammenkunft — `null` beim Treffpunkt, der keine ist. */
  tab: MeetingKey | null
}

/** Der Bereich, unter dem ein abgesagter Treffpunkt zählt (`p.priv.treffpunkt`). */
export const TREFFPUNKT_BEREICH = 'treffpunkt'

/** Erwartet je Bereich und Person: Bereich → Person-Id → Plätze. */
export type Erwartung = ReadonlyMap<string, ReadonlyMap<string, number>>

export interface Grundlage {
  fenster: Zeitfenster
  einteilungen: Einteilung[]
  /** Besetzte, gezählte Plätze je Bereich. */
  plaetze: ReadonlyMap<string, number>
  /** Zusammenkünfte, die im Zeitraum stattfanden. */
  zusammenkuenfte: number
  /** Je Person: in wie vielen davon sie da und schon dabei war. */
  verfuegbar: ReadonlyMap<string, number>
  /**
   * **Erwartet je Bereich und Person** — Platz für Platz: Jeder gezählte Platz
   * verteilt sich gleich auf alle, die ihn in seiner Zusammenkunft hätten
   * haben können. Wer im Bereich nie in Frage kam, fehlt.
   */
  erwartet: Erwartung
  /**
   * Je Person die Zusammenkünfte (`montag|tab`), in denen sie eingeteilt werden
   * konnte: da, schon dabei, ohne festen Platz. Nur diese Wochen zählen zur
   * Wartezeit.
   */
  einteilbar: ReadonlyMap<string, ReadonlySet<string>>
  /** Die Montage der Wochen im Zeitraum, in denen wenigstens eine Zusammenkunft stattfand. */
  gehalten: readonly string[]
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

/**
 * **Seit wann eine Person dabei ist** (Jahresprobe 18.10.2026): der Montag der
 * ersten Woche, in der sie irgendwo stand — auf einem Platz, gezählt oder
 * nicht, als Leiter eines Treffpunkts oder mit einer Absage —, über alle
 * geladenen Wochen vor der laufenden (`bis`). Vorher wird von ihr nichts
 * erwartet: Ein zugezogener Ältester stand sonst für die Monate vor seinem
 * Umzug unter „zu selten" und „einseitig".
 *
 * Wer nie irgendwo stand, ist von Anfang an dabei — sonst fiele niemand auf,
 * den die Planer nie eingeteilt haben. Auch nicht, wer erst geplant ist: Wen
 * der Planer auf „Lange Wartezeit" hin einteilt, der steht dort als „geplant",
 * statt rückwirkend aus der Rechnung zu fallen. Der Preis (vom Betreiber so
 * gewählt): Wer lange übersehen und dann einmal eingeteilt wurde, gilt erst ab
 * da als dabei.
 */
function dabeiSeit(
  weeks: readonly Week[],
  fsWeeks: readonly (readonly FsInstance[])[],
  persons: readonly Person[],
  services: readonly Service[],
  absagen: readonly Absage[],
  bis: string,
): Map<string, string> {
  const wer = idAufloeser(persons)
  const bekannt = new Set(persons.map((p) => p.id))
  const seit = new Map<string, string>()
  const merken = (pid: string | undefined, montag: string): void => {
    if (!pid || !bekannt.has(pid) || montag >= bis) return
    const bisher = seit.get(pid)
    if (bisher === undefined || montag < bisher) seit.set(pid, montag)
  }
  weeks.forEach((week, wi) => {
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      for (const platz of allePlaetze(week[tab], services)) merken(wer(platz.slot), week.start)
    }
    for (const inst of fsWeeks[wi] ?? []) if (!inst.lext) merken(inst.lpid, week.start)
  })
  for (const a of absagen) {
    const teile = schluesselTeile(a.taskKey)
    if (teile) merken(a.personId, teile.woche)
  }
  return seit
}

/**
 * Jeder gezählte Platz einer Zusammenkunft verteilt sich gleich auf alle, die
 * ihn hätten haben können (`frei`) und den Bereich haben. Hat ihn keiner, kommt
 * er auf niemanden — er bleibt trotzdem ein Platz des Bereichs.
 */
function erwartungVerteilen(plaetze: readonly Einteilung[], frei: readonly Person[], erwartet: Map<string, Map<string, number>>): void {
  const jeBereich = new Map<string, number>()
  for (const e of plaetze) if (e.bereich) jeBereich.set(e.bereich, (jeBereich.get(e.bereich) ?? 0) + 1)
  for (const [bereich, anzahl] of jeBereich) {
    const kandidaten = frei.filter((p) => isQualified(p, bereich))
    if (kandidaten.length === 0) continue
    const je = erwartet.get(bereich) ?? new Map<string, number>()
    for (const p of kandidaten) je.set(p.id, (je.get(p.id) ?? 0) + anzahl / kandidaten.length)
    erwartet.set(bereich, je)
  }
}

export function grundlage(eingabe: {
  weeks: readonly Week[]
  /** Die Treffpunkte je Woche, parallel zu `weeks` — für „dabei seit". */
  fsWeeks?: readonly (readonly FsInstance[])[]
  persons: readonly Person[]
  services: readonly Service[]
  abwesend: AbsenceSet
  fenster: Zeitfenster
  /** Absagen (T126) — wer welchen Platz abgesagt hat, auch wenn er neu besetzt ist. */
  absagen?: readonly Absage[]
}): Grundlage {
  const { weeks, persons, services, abwesend, fenster } = eingabe
  const liste = eingabe.absagen ?? []
  const wer = idAufloeser(persons)
  const bekannt = new Set(persons.map((p) => p.id))
  const festerLeiter = persons.some((p) => p.priv.wtLeiter)
  const seit = dabeiSeit(weeks, eingabe.fsWeeks ?? [], persons, services, liste, fenster.bis)
  const verfuegbar = new Map<string, number>(persons.map((p) => [p.id, 0]))
  const erwartet = new Map<string, Map<string, number>>()
  const einteilbar = new Map<string, Set<string>>()
  const gehalten: string[] = []
  // Jeder Platz über seinen Schlüssel — für die Absagen, die nur den Schlüssel
  // kennen. Auch ein leerer: Hat der Planer den Absagenden nur ausgetragen,
  // steht dort noch niemand, der Bereich ist trotzdem der des Platzes. Die
  // Woche jedes Montags im Zeitraum dazu.
  const platzJeSchluessel = new Map<string, PlatzFuerAbsagen | null>()
  const wocheJeMontag = new Map<string, number>()
  let zusammenkuenfte = 0

  /**
   * Die gezählten Plätze einer Zusammenkunft, die stattfindet, nach `ziel` —
   * zurück kommt, wer dort auf einem Platz steht, der nicht zählt.
   */
  const zaehlen = (week: Week, wi: number, tab: MeetingKey, ziel: Einteilung[]): Set<string> => {
    const meeting = week[tab]
    const vorsitzSlot = vorsitzPlatz(meeting)
    const vorsitz: VorsitzDerZusammenkunft = { pid: wer(vorsitzSlot), key: null }
    const fest = new Set<string>()
    for (const platz of allePlaetze(meeting, services)) {
      const key = platzKey(platz, week.start, tab)
      if (vorsitzSlot && platz.slot === vorsitzSlot) vorsitz.key = key
      if (!zaehltDerPlatz(platz, festerLeiter)) {
        platzJeSchluessel.set(key, null)
        const pid = wer(platz.slot)
        if (pid && bekannt.has(pid)) fest.add(pid)
        continue
      }
      const bereich = bereichVon(platz) ?? null
      const folgt = platz.art === 'programm' && folgtDemVorsitzIn(meeting, platz.section, platz.slot)
      platzJeSchluessel.set(key, { bereich, vorsitz: folgt ? vorsitz : null })
      if (!platzMitZusage(platz)) continue
      const pid = wer(platz.slot)
      // Was dem Vorsitz folgt und der Vorsitzende selbst hat, kam mit dem Vorsitz.
      if (!pid || !bekannt.has(pid) || (folgt && pid === vorsitz.pid)) continue
      ziel.push({ pid, wi, start: week.start, tab, bereich, hilfsdienst: platz.art === 'helper' })
    }
    return fest
  }

  const einteilungen: Einteilung[] = []
  for (const wi of fenster.wochen) {
    const week = weeks[wi]
    if (!week) continue
    wocheJeMontag.set(week.start, wi)
    let stattgefunden = false
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) continue
      stattgefunden = true
      zusammenkuenfte++
      const hier: Einteilung[] = []
      // Wer auf einem festen Platz steht (der feste Studienleiter, der eigene
      // Redner), kann in dieser Zusammenkunft nichts anderes übernehmen — von
      // ihm wird dort nichts erwartet (Jahresprobe: Der feste Leiter „wartete
      // lange" auf den Vorsitz am Wochenende).
      const fest = zaehlen(week, wi, tab, hier)
      einteilungen.push(...hier)
      const frei: Person[] = []
      for (const p of persons) {
        if (istAbwesend(abwesend, p.id, wi, tab)) continue
        const ab = seit.get(p.id)
        if (ab !== undefined && week.start < ab) continue
        verfuegbar.set(p.id, (verfuegbar.get(p.id) ?? 0) + 1)
        if (fest.has(p.id)) continue
        frei.push(p)
        const menge = einteilbar.get(p.id) ?? new Set<string>()
        menge.add(`${week.start}|${tab}`)
        einteilbar.set(p.id, menge)
      }
      erwartungVerteilen(hier, frei, erwartet)
    }
    if (stattgefunden) gehalten.push(week.start)
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
  const abgesagt = new Set(liste.map((a) => `${a.personId}|${a.taskKey}`))
  const absagen: AbsageEinteilung[] = []
  for (const a of liste) {
    if (!bekannt.has(a.personId)) continue
    const teile = schluesselTeile(a.taskKey)
    const wi = teile ? wocheJeMontag.get(teile.woche) : undefined
    if (!teile || wi === undefined) continue
    if (teile.art === 'fs') {
      absagen.push({ pid: a.personId, bereich: TREFFPUNKT_BEREICH, wi, tab: null })
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
    absagen.push({ pid: a.personId, bereich: platz?.bereich ?? null, wi, tab: teile.tab })
  }
  return { fenster, einteilungen, plaetze, zusammenkuenfte, verfuegbar, erwartet, einteilbar, gehalten, geplant, absagen }
}

/** Was auf die Person in diesem Bereich erwartet wurde. */
function erwartetVon(g: Grundlage, bereich: string, pid: string): number {
  return g.erwartet.get(bereich)?.get(pid) ?? 0
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

/* ---- Kennzahlen ------------------------------------------------------------ */

export interface Kennzahlen {
  zuteilungen: number
  /**
   * Personen mit mindestens einem Bereich, der im Zeitraum Plätze hatte — ohne
   * wen, der den ganzen Zeitraum fehlte oder noch nicht dabei war: Von ihm wird
   * nichts erwartet.
   */
  mitBereichen: number
  eingeteilt: number
  /** Mit Bereich, aber im ganzen Zeitraum nie eingeteilt — obwohl da. */
  nie: number
}

/** War die Person im Zeitraum wenigstens in einer Zusammenkunft da und schon dabei? */
function warDa(g: Grundlage, p: Person): boolean {
  return (g.verfuegbar.get(p.id) ?? 0) > 0
}

export function kennzahlen(g: Grundlage, persons: readonly Person[]): Kennzahlen {
  const je = new Map<string, number>()
  for (const e of g.einteilungen) je.set(e.pid, (je.get(e.pid) ?? 0) + 1)
  // Wer den ganzen Zeitraum fehlte, steht nicht unter „nie dran".
  const mitBereich = persons.filter((p) => je.has(p.id) || (warDa(g, p) && bereicheVon(g, p).length > 0))
  const eingeteilt = mitBereich.filter((p) => je.has(p.id)).length
  return { zuteilungen: g.einteilungen.length, mitBereichen: mitBereich.length, eingeteilt, nie: mitBereich.length - eingeteilt }
}

/* ---- Zu oft, zu selten ----------------------------------------------------- */

/**
 * Was verglichen wird: die Aufgaben, oder alles mit den Hilfsdiensten. Die
 * Schulungsaufgaben allein verglich die Seite bis zur Jahresprobe auch — bei
 * Erwartungen von ein bis vier im Jahr meldete das nie etwas.
 */
export type Vergleich = 'aufgaben' | 'hilfsdienste'
export const VERGLEICHE: readonly Vergleich[] = ['aufgaben', 'hilfsdienste']
export type Lage = 'oft' | 'rahmen' | 'selten'

export interface VerteilungsZeile {
  pid: string
  /** Gezählte Zuteilungen in den eigenen Bereichen — bei den Hilfsdiensten samt Aufgaben. */
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
}

/** Liegt `n` bei dieser Erwartung über, in oder unter dem Üblichen? */
export function lageVon(n: number, erwartet: number): Lage {
  if (n > OBERE_GRENZE * erwartet && n - erwartet >= MINDESTABSTAND) return 'oft'
  if (n < UNTERE_GRENZE * erwartet && erwartet - n >= MINDESTABSTAND) return 'selten'
  return 'rahmen'
}

function gehoertZumVergleich(bereich: string, vergleich: Vergleich): boolean {
  return vergleich === 'hilfsdienste' || !istHilfsdienstBereich(bereich)
}

export function verteilung(g: Grundlage, persons: readonly Person[], vergleich: Vergleich): Verteilung {
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
      // Eine Einteilung in einem Bereich, den die Person nicht hat, zählt nicht
      // gegen ihre Erwartung — sie steht unter „Bereich ergänzen?".
      if (!e.bereich || !isQualified(p, e.bereich) || !gehoertZumVergleich(e.bereich, vergleich)) continue
      n++
      if (e.hilfsdienst) hilfsdienste++
    }
    let summe = 0
    for (const b of bereiche) if (gehoertZumVergleich(b, vergleich)) summe += erwartetVon(g, b, p.id)
    zeilen.push({ pid: p.id, n, erwartet: summe, hilfsdienste, lage: lageVon(n, summe) })
  }
  const verhaeltnis = (z: VerteilungsZeile): number => (z.erwartet > 0 ? z.n / z.erwartet : z.n)
  const nach = (lage: Lage) => zeilen.filter((z) => z.lage === lage)
  return {
    vergleich,
    oft: nach('oft').sort((a, b) => verhaeltnis(b) - verhaeltnis(a)),
    rahmen: nach('rahmen').sort((a, b) => b.n - a.n || b.erwartet - a.erwartet),
    selten: nach('selten').sort((a, b) => verhaeltnis(a) - verhaeltnis(b)),
  }
}

/** Wer im Vergleich über seiner Erwartung liegt. */
function ueberDerErwartung(v: Verteilung): Set<string> {
  return new Set([...v.oft, ...v.rahmen, ...v.selten].filter((z) => z.n > z.erwartet).map((z) => z.pid))
}

/* ---- Einseitig ------------------------------------------------------------- */

export interface BereichsZahl {
  bereich: string
  n: number
  /** Was auf die Person in diesem Bereich erwartet wurde. */
  erwartet: number
  /** Wie oft die anderen mit diesem Bereich ihn im Schnitt hatten. */
  schnittAndere: number
}

export interface EinseitigZeile {
  pid: string
  gesamt: number
  /** Je Bereich der Person, die meisten zuerst. */
  bereiche: BereichsZahl[]
  /** Der Bereich mit zwei Dritteln und mehr, deutlich über seinem erwarteten Anteil — sonst `null`. */
  ueberwiegt: string | null
  /** Bereiche, die er hat und in denen er nie dran war, obwohl die anderen sie oft hatten. */
  nie: string[]
}

export function istEinseitig(z: EinseitigZeile): boolean {
  return z.ueberwiegt !== null || z.nie.length > 0
}

/**
 * Je Person mit zwei und mehr Bereichen: wie sich ihre Zuteilungen verteilen —
 * die einseitigen zuerst. `schonGemeldet` nennt je Person die Bereiche, die
 * schon „Bereich noch aktuell?" meldet (`nieGenutzt`): Dort steht nicht
 * zusätzlich „nie".
 */
export function einseitig(g: Grundlage, persons: readonly Person[], schonGemeldet: ReadonlyMap<string, readonly string[]> = new Map()): EinseitigZeile[] {
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
        return { bereich, n: anzahl(p.id, bereich), erwartet: erwartetVon(g, bereich, p.id), schnittAndere: andere.length ? summe / andere.length : 0 }
      })
      .sort((a, b) => b.n - a.n)
    const gesamt = bereiche.reduce((s, b) => s + b.n, 0)
    const erwartetGesamt = bereiche.reduce((s, b) => s + b.erwartet, 0)
    const erster = bereiche[0]
    // Der Anteil des stärksten Bereichs — gegen den Anteil, den er haben sollte.
    const anteil = erster && gesamt > 0 ? erster.n / gesamt : 0
    const sollAnteil = erster && erwartetGesamt > 0 ? erster.erwartet / erwartetGesamt : 0
    const ueberwiegt = erster && gesamt >= EINSEITIG_AB && anteil >= UEBERWIEGT_AB && anteil >= OBERE_GRENZE * sollAnteil ? erster.bereich : null
    // Nie dran zählt nur, wo auf ihn wenigstens ein Platz gekommen wäre — wer
    // erst kurz dabei ist, war in den Bereichen der anderen noch nicht „nie".
    const gemeldet = schonGemeldet.get(p.id) ?? []
    const nie = bereiche
      .filter((b) => b.n === 0 && b.schnittAndere >= NIE_AB_SCHNITT && b.erwartet >= 1 && !gemeldet.includes(b.bereich))
      .map((b) => b.bereich)
    out.push({ pid: p.id, gesamt, bereiche, ueberwiegt, nie })
  }
  return out.sort((a, b) => Number(istEinseitig(b)) - Number(istEinseitig(a)) || b.gesamt - a.gesamt)
}

/** Ein Feld der Tabelle Person × Bereich. */
export interface MatrixZelle {
  n: number
  /** Hat die Person den Bereich? Ohne ihn zählt `n` nicht gegen ihre Erwartung. */
  hat: boolean
}

export interface Matrix {
  /** Die Bereiche mit Plätzen im Zeitraum, in der Reihenfolge der Spalten. */
  bereiche: string[]
  zeilen: { pid: string; einseitig: boolean; zellen: MatrixZelle[] }[]
}

/**
 * **Wer bekommt was**: Person × Bereich — wie oft, und ob die Person den
 * Bereich hat. `ordnung` gibt die Reihenfolge der Spalten vor (Bereiche, die
 * sie nicht kennt, kommen hinten an). Eine Zeile hat, wer einen der Bereiche
 * hat oder in einem eingeteilt war.
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
      .filter((p) => zahl.has(p.id) || bereiche.some((b) => isQualified(p, b)))
      .map((p) => ({
        pid: p.id,
        einseitig: einseitigeIds.has(p.id),
        zellen: bereiche.map((b) => ({ n: zahl.get(p.id)?.get(b) ?? 0, hat: isQualified(p, b) })),
      })),
  }
}

/* ---- Engpässe -------------------------------------------------------------- */

export interface Engpass {
  bereich: string
  /** Die gezählten Plätze des Bereichs. */
  plaetze: number
  /**
   * Die Wochen, auf die sie sich verteilen: ab der ersten mit einem Platz des
   * Bereichs, jede, in der eine Zusammenkunft stattfand. Ab der ersten, weil
   * die App einen Bereich oft erst ab einem Tag kennt — aus New World
   * Scheduler kamen die Hilfsdienste fünf Monate zurück, das Programm zehn.
   */
  wochen: number
  jeWoche: number
  /** Wer den Bereich hat und wenigstens einmal für einen Platz in Frage kam. */
  personen: number
  /** Alle wie viele Wochen jeder dran wäre — `null`, wenn niemand den Bereich hat. */
  abstand: number | null
  /** Wie oft jeder im Jahr dran wäre — `null`, wenn niemand den Bereich hat. */
  jePersonJahr: number | null
}

/**
 * **Wie knapp ein Bereich ist** (Jahresprobe 18.10.2026): Plätze je Woche gegen
 * die Personen, die ihn haben. Ton und Video mit acht Personen heißt: jeder
 * alle fünf Wochen, zehnmal im Jahr. Der Abstand ist zugleich der übliche
 * Abstand der Wartezeiten.
 */
export function engpass(g: Grundlage, bereich: string): Engpass | null {
  const plaetze = g.plaetze.get(bereich) ?? 0
  if (plaetze === 0) return null
  let erste: string | null = null
  for (const e of g.einteilungen) if (e.bereich === bereich && (erste === null || e.start < erste)) erste = e.start
  const ab = erste ?? g.fenster.von
  const wochen = Math.max(1, g.gehalten.filter((m) => m >= ab).length)
  const jeWoche = plaetze / wochen
  const personen = g.erwartet.get(bereich)?.size ?? 0
  return {
    bereich,
    plaetze,
    wochen,
    jeWoche,
    personen,
    abstand: personen > 0 ? personen / jeWoche : null,
    jePersonJahr: personen > 0 ? (ZEITRAUM_WOCHEN[JAHR] * jeWoche) / personen : null,
  }
}

/** Alle Bereiche mit Plätzen, die knappsten zuerst — ohne Personen ganz vorn. */
export function engpaesse(g: Grundlage): Engpass[] {
  return [...g.plaetze.keys()]
    .flatMap((b) => engpass(g, b) ?? [])
    .sort((a, b) => (a.abstand ?? -1) - (b.abstand ?? -1) || b.jeWoche - a.jeWoche || a.bereich.localeCompare(b.bereich))
}

/* ---- Wartezeiten ----------------------------------------------------------- */

export interface Warten {
  pid: string
  /** Wochen seit dem letzten Mal bis zur laufenden Woche — `null`: im Jahr nie dran. */
  wochen: number | null
  /**
   * Davon die Wochen, in denen die Person nicht eingeteilt werden konnte:
   * abwesend, keine Zusammenkunft, ein fester Platz, noch nicht dabei.
   */
  nichtEinteilbar: number
  /**
   * Die Wartezeit, wie sie zählt: nur Wochen, in denen die Person hätte
   * drankommen können — wer im Jahr nie dran war, seit der ersten Woche des
   * Bereichs. Danach wird sortiert und „wartet lange" entschieden.
   */
  wartend: number
  /** Montag der Woche des letzten Mals (ISO). */
  zuletzt: string | null
  /** Montag der nächsten Woche, in der die Person im Bereich schon eingeteilt ist — wer geplant ist, wartet nicht. */
  geplant: string | null
  /** Liegt die Person über das Jahr insgesamt über ihrer Erwartung? Dann wartet sie nicht. */
  ueber: boolean
  lange: boolean
}

export interface Schnell {
  pid: string
  /** Mittlerer Abstand in Wochen. */
  abstand: number
  mal: number
  /** Je Woche des Jahres: dran oder nicht. */
  wochen: boolean[]
}

export interface Wartezeiten {
  bereich: string
  /**
   * Der übliche Abstand zwischen zwei Malen derselben Person, in Wochen: die
   * Personen mit dem Bereich geteilt durch die Plätze je Woche (`engpass`) —
   * `null`, wenn niemand den Bereich hat.
   */
  ueblich: number | null
  warten: Warten[]
  schnell: Schnell[]
}

/** Länger als doppelt so lange wie üblich ist „wartet lange", höchstens halb so lange „schnell wieder". */
export const LANGE_AB = 2
export const SCHNELL_BIS = 0.5

/**
 * **Wer wie lange wartet** — gerechnet über die Grundlage des Jahres
 * (`auswerten`). Gelistet ist, wer den Bereich hat und im Jahr wenigstens
 * einmal für einen Platz in Frage kam. Wer insgesamt über seiner Erwartung
 * liegt (`ueberErwartung`), wartet nicht: Die vielbeschäftigten Ältesten
 * „warteten lange" auf ein Gebet.
 */
export function wartezeiten(g: Grundlage, persons: readonly Person[], bereich: string, ueberErwartung: ReadonlySet<string> = new Set()): Wartezeiten {
  const ueblich = engpass(g, bereich)?.abstand ?? null
  const male = new Map<string, string[]>()
  // In welchen Zusammenkünften der Bereich Plätze hat — nur dort konnte man auf ihn warten.
  const tabs = new Set<MeetingKey>()
  let erste: string | null = null
  for (const e of g.einteilungen) {
    if (e.bereich !== bereich) continue
    tabs.add(e.tab)
    if (erste === null || e.start < erste) erste = e.start
    const liste = male.get(e.pid) ?? []
    if (!liste.includes(e.start)) liste.push(e.start)
    male.set(e.pid, liste)
  }
  const abstaende = (starts: string[]): number[] => starts.slice(1).map((s, i) => wochenZwischen(starts[i]!, s))
  for (const liste of male.values()) liste.sort()

  const qualifiziert = persons.filter((p) => isQualified(p, bereich) && g.erwartet.get(bereich)?.has(p.id))
  const tabListe = [...tabs]
  /** Konnte die Person in der Woche dieses Montags einen Platz des Bereichs bekommen? */
  const einteilbar = (pid: string, montag: string): boolean => {
    const menge = g.einteilbar.get(pid)
    return menge !== undefined && tabListe.some((tab) => menge.has(`${montag}|${tab}`))
  }
  // Die nächste Woche, in der jemand im Bereich schon eingeteilt ist.
  const geplantAb = new Map<string, string>()
  for (const e of g.geplant) {
    if (e.bereich !== bereich) continue
    const bisher = geplantAb.get(e.pid)
    if (bisher === undefined || e.start < bisher) geplantAb.set(e.pid, e.start)
  }
  const warten = qualifiziert
    .map((p): Warten => {
      const zuletzt = male.get(p.id)?.at(-1) ?? null
      // Gewartet wird seit dem letzten Mal — wer nie dran war, seit der ersten Woche des Bereichs.
      const ab = zuletzt ?? tagNach(erste ?? g.fenster.von, -7)
      const wochen = wochenZwischen(ab, g.fenster.bis)
      const nichtEinteilbar = g.fenster.montage.filter((m) => m > ab && !einteilbar(p.id, m)).length
      const wartend = wochen - nichtEinteilbar
      const geplant = geplantAb.get(p.id) ?? null
      const ueber = ueberErwartung.has(p.id)
      const lange = ueblich !== null && geplant === null && !ueber && wartend > LANGE_AB * ueblich
      return { pid: p.id, wochen: zuletzt ? wochen : null, nichtEinteilbar, wartend, zuletzt, geplant, ueber, lange }
    })
    // Wer geplant ist, wartet nicht und steht hinten; sonst wer am längsten wartet zuerst.
    .sort(
      (a, b) =>
        Number(a.geplant !== null) - Number(b.geplant !== null) ||
        b.wartend - a.wartend ||
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

/* ---- Pflege der Bereiche --------------------------------------------------- */

export interface OhneBereich {
  pid: string
  /** Je Bereich, den die Person nicht hat, wie oft sie dort eingeteilt war — die meisten zuerst. */
  bereiche: { bereich: string; n: number }[]
}

/**
 * **Eingeteilt ohne den Bereich** (Jahresprobe 18.10.2026): Wer im Jahr
 * mindestens zweimal in einem Bereich eingeteilt war, den er nicht hat, dem
 * fehlt der Bereich wohl bei den Personen — „Bereich ergänzen?". Gegen die
 * Erwartung zählen diese Einteilungen nicht (`verteilung`): Ein Ältester mit
 * drei Bereichen und zwölf Einteilungen in fünf anderen stand sonst als „zu
 * oft" da.
 */
export function ohneBereich(g: Grundlage, persons: readonly Person[]): OhneBereich[] {
  const zahl = anzahlJeBereich(g)
  const summe = (z: OhneBereich): number => z.bereiche.reduce((s, b) => s + b.n, 0)
  const out: OhneBereich[] = []
  for (const p of persons) {
    const bereiche = [...(zahl.get(p.id) ?? [])]
      .filter(([bereich, n]) => n >= OHNE_BEREICH_AB && !isQualified(p, bereich))
      .map(([bereich, n]) => ({ bereich, n }))
      .sort((a, b) => b.n - a.n || a.bereich.localeCompare(b.bereich))
    if (bereiche.length > 0) out.push({ pid: p.id, bereiche })
  }
  return out.sort((a, b) => summe(b) - summe(a) || a.pid.localeCompare(b.pid))
}

export interface NieGenutzt {
  pid: string
  /** Die Bereiche, in denen die Person im Jahr nie dran war, die erwartetsten zuerst. */
  bereiche: string[]
}

/**
 * **Ein Jahr nie dran** (Jahresprobe 18.10.2026): Hat jemand einen Bereich, in
 * dem auf ihn im Jahr mindestens drei Plätze gekommen wären, und war dort nie
 * dran, stimmt vielleicht der Bereich nicht mehr — „Bereich noch aktuell?".
 */
export function nieGenutzt(g: Grundlage, persons: readonly Person[]): NieGenutzt[] {
  const zahl = anzahlJeBereich(g)
  const out: NieGenutzt[] = []
  for (const p of persons) {
    const bereiche = bereicheVon(g, p)
      .filter((b) => !zahl.get(p.id)?.get(b) && erwartetVon(g, b, p.id) >= NIE_GENUTZT_AB)
      .sort((a, b) => erwartetVon(g, b, p.id) - erwartetVon(g, a, p.id) || a.localeCompare(b))
    if (bereiche.length > 0) out.push({ pid: p.id, bereiche })
  }
  return out.sort((a, b) => b.bereiche.length - a.bereiche.length || a.pid.localeCompare(b.pid))
}

export interface Pflege {
  ohneBereich: OhneBereich[]
  nieGenutzt: NieGenutzt[]
}

/* ---- Treffpunkte ----------------------------------------------------------- */

export interface TreffpunktGruppe {
  /** Die Gruppe — `null` für die Treffpunkte der Versammlung. */
  gruppe: string | null
  /** Je Leiter, wie oft — wer Treffpunkte leiten kann und es nie tat, mit 0 bei seiner Gruppe. */
  zeilen: LastZeile[]
}

export interface LastZeile {
  pid: string
  n: number
}

/**
 * **Wer die Treffpunkte leitet**, je Gruppe und für die Versammlung. Eine
 * Gruppe steht nur da, wenn sie im Zeitraum eigene Treffpunkte hatte — sonst
 * listete jede Gruppe einer Versammlung ohne Gruppentreffpunkte all ihre
 * Leiter mit „nie" (Jahresprobe 18.10.2026: sechs Gruppen, 16 Zeilen).
 */
export function treffpunkte(
  fsWeeks: readonly (readonly FsInstance[])[],
  fenster: Zeitfenster,
  persons: readonly Person[],
  groups: readonly Group[],
): TreffpunktGruppe[] {
  const bekannt = new Set(persons.map((p) => p.id))
  // Gruppe (die Versammlung als `null`, auch bei leerer Kennung) → Leiter → wie oft.
  const zahl = new Map<string | null, Map<string, number>>()
  // Die Gruppen mit eigenen Treffpunkten im Zeitraum — gleich, wer sie leitete.
  const mitTreffpunkt = new Set<string>()
  for (const wi of fenster.wochen) {
    for (const inst of fsWeeks[wi] ?? []) {
      if (inst.grp) mitTreffpunkt.add(inst.grp)
      if (!inst.lpid || inst.lext || !bekannt.has(inst.lpid)) continue
      const je = zahl.get(inst.grp || null) ?? new Map<string, number>()
      je.set(inst.lpid, (je.get(inst.lpid) ?? 0) + 1)
      zahl.set(inst.grp || null, je)
    }
  }
  const gruppe = (id: string | null): TreffpunktGruppe => {
    const zeilen = new Map(zahl.get(id))
    if (id !== null && mitTreffpunkt.has(id)) {
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
  /** Ein Hilfsdienst und noch ein Platz in derselben Zusammenkunft (von Hand so eingeteilt). */
  zweimal: { pid: string; start: string; tab: MeetingKey; bereiche: (string | null)[] }[]
  /** Drei und mehr Wochen hintereinander im selben Bereich. */
  folge: { pid: string; bereich: string; ab: string; wochen: number }[]
}

export const FOLGE_AB = 3

/**
 * **Wo sich Aufgaben ballen.** Zweimal in einer Zusammenkunft zählt nur mit
 * einem Hilfsdienst: Zwei Programmpunkte derselben Person sind meist ein
 * gewolltes Paar — in der Jahresprobe las der Vorsitzende am Wochenende in 25
 * von 26 Wochen den Wachtturm, dazu Vorsitz und Besprechung, Vortrag und
 * Gebet. Wer aber Leser ist und zugleich am Zoom sitzt, ist doppelt belegt.
 */
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
    .filter((liste) => liste.length >= 2 && liste.some((e) => e.hilfsdienst))
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
  /** Je Bereich, wer lange wartet — wer am längsten zuerst. Ein Tipp führt zu den Wartezeiten. */
  | { art: 'wartet'; bereich: string; pids: string[]; ueblich: number }
  /** Ein Bereich, keine Person: Ein Tipp führt zu den Absagen (T126). */
  | { art: 'absagen'; bereich: string; anteil: number; sonst: number }
  | { art: 'ohneBereich'; pid: string; bereiche: { bereich: string; n: number }[] }
  | { art: 'nieGenutzt'; pid: string; bereiche: string[] }

/**
 * **Was auffällt**, das Wichtigste zuerst: zu selten, zu oft, einseitig, wartet
 * lange, viele Absagen — dann die Pflege der Bereiche. Je Person und Art nur
 * der deutlichste Fall — wer in den Aufgaben und mit den Hilfsdiensten zu
 * selten dran ist, steht einmal da. Wer lange wartet, steht je Bereich: Einzeln
 * waren es in der Jahresprobe 22 bis 25 Zeilen.
 */
export function hinweise(
  verteilungen: readonly Verteilung[],
  einseitige: readonly EinseitigZeile[],
  warten: readonly Wartezeiten[],
  absagen: readonly AbsagenZeile[] = [],
  pflege: Pflege = { ohneBereich: [], nieGenutzt: [] },
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

  // Je Bereich, wer lange wartet. Vorn der Bereich, in dem die meisten warten —
  // bei gleich vielen der, in dem einer am längsten wartet.
  const wartet: Extract<Hinweis, { art: 'wartet' }>[] = []
  const laengste = new Map<string, number>()
  for (const w of warten) {
    if (w.ueblich === null) continue
    const lange = w.warten.filter((z) => z.lange).sort((a, b) => b.wartend - a.wartend || a.pid.localeCompare(b.pid))
    const erster = lange[0]
    if (!erster) continue
    laengste.set(w.bereich, erster.wartend / w.ueblich)
    wartet.push({ art: 'wartet', bereich: w.bereich, pids: lange.map((z) => z.pid), ueblich: w.ueblich })
  }
  const faktor = (h: { bereich: string }): number => laengste.get(h.bereich) ?? 0
  wartet.sort((a, b) => b.pids.length - a.pids.length || faktor(b) - faktor(a) || a.bereich.localeCompare(b.bereich))

  const viele: Hinweis[] = vieleAbsagen(absagen).map(({ zeile, sonst }) => ({ art: 'absagen', bereich: zeile.bereich, anteil: zeile.anteil, sonst }))
  const ohne: Hinweis[] = pflege.ohneBereich.map((z) => ({ art: 'ohneBereich', pid: z.pid, bereiche: z.bereiche }))
  const nie: Hinweis[] = pflege.nieGenutzt.map((z) => ({ art: 'nieGenutzt', pid: z.pid, bereiche: z.bereiche }))
  return [...selten, ...oft, ...einseitig, ...wartet, ...viele, ...ohne, ...nie]
}

/* ---- Eine Person ----------------------------------------------------------- */

/**
 * **Was eine Zusammenkunft für eine Person war** — ein Feld in ihren Wochen
 * (Entwurf `GWochenbildKalender`, 23.10.2026). Aufgabe und Hilfsdienst in
 * derselben Zusammenkunft sind „beides", dann kommt die Absage vor der
 * Abwesenheit. Bis dahin stand je Woche ein Feld da: Eine Aufgabe verdeckte
 * den Hilfsdienst, und von zwei Hilfsdiensten einer Woche blieb einer (Kachel
 * 32, im Bild 27 graue Felder). Eine ausgefallene Zusammenkunft sagt es — leer
 * sah ein Kongress aus wie eine Woche ohne Aufgabe.
 */
export type FeldArt = 'aufgabe' | 'hilfsdienst' | 'beides' | 'abgesagt' | 'abwesend' | 'ausgefallen' | null

/**
 * Was beim Monat steht: eine Aufgabe oder eine Absage mit ihrem Bereich —
 * `null`, wo keiner zu sagen ist. Ein geleiteter Treffpunkt ist eine Aufgabe
 * im Bereich `TREFFPUNKT_BEREICH` (Betreiber 24.10.2026: „Geleitete dazu").
 */
export interface WochenEintrag {
  art: 'aufgabe' | 'absage'
  bereich: string | null
  /** Steht der Tag noch aus? */
  geplant: boolean
}

/** Eine Woche einer Person: ihre beiden Zusammenkünfte als Felder und was sie darin hatte. */
export interface PersonWoche {
  /** Montag (ISO). */
  start: string
  felder: Record<MeetingKey, FeldArt>
  /**
   * Je Zusammenkunft: Steht sie noch aus? Nach dem Tag, nicht nach der Woche
   * (Betreiber 24.10.2026): Am Donnerstag ist der Dienstag der laufenden Woche
   * gehalten — gezählt wird er in den Kacheln trotzdem erst ab Montag, wie in
   * der ganzen Auswertung. Vorbei ist ein Tag ab dem Tag danach (`istVorbei`).
   */
  geplant: Record<MeetingKey, boolean>
  /** Aufgaben und Absagen in der Folge der Zusammenkünfte, dahinter die Treffpunkte. */
  eintraege: WochenEintrag[]
}

/** Das Feld einer Zusammenkunft, die stattfand: beides vor Aufgabe vor Hilfsdienst vor abgesagt vor abwesend. */
function feldArt(hier: readonly Einteilung[], abgesagt: boolean, abwesend: boolean): FeldArt {
  const aufgabe = hier.some((e) => !e.hilfsdienst)
  const hilfsdienst = hier.some((e) => e.hilfsdienst)
  if (aufgabe && hilfsdienst) return 'beides'
  if (aufgabe) return 'aufgabe'
  if (hilfsdienst) return 'hilfsdienst'
  if (abgesagt) return 'abgesagt'
  return abwesend ? 'abwesend' : null
}

export interface PersonBild {
  pid: string
  /** Aufgaben in den eigenen Bereichen — so, wie „Zu oft, zu selten" sie zählt. */
  aufgaben: number
  erwartetAufgaben: number
  hilfsdienste: number
  /** Zusammenkünfte im Zeitraum, in denen sie abwesend war. */
  abwesend: number
  /** Ihre Absagen im Zeitraum (T126). */
  absagen: number
  /**
   * Je Bereich der Person — und je Bereich, in dem sie ohne ihn eingeteilt war
   * (`hat: false`): wie oft, wie oft erwartet, das letzte Mal (Montag, ISO) und
   * wie viele Wochen das vor der laufenden war.
   */
  bereiche: { bereich: string; hat: boolean; n: number; erwartet: number; zuletzt: string | null; vorWochen: number | null }[]
  /**
   * Die Wochen des Zeitraums, die älteste zuerst — dahinter die ab der
   * laufenden, bis zur letzten, in der die Person eingeteilt oder abwesend ist
   * oder einen Treffpunkt leitet.
   */
  wochen: PersonWoche[]
}

/** Was die Wochen einer Person außer der Grundlage brauchen: die Treffpunkte (parallel zu `weeks`) und die Tage der Zusammenkünfte. */
export interface PersonUmfeld {
  fsWeeks: readonly (readonly FsInstance[])[]
  zeiten: MeetingTimes
}

export function personBild(
  g: Grundlage,
  weeks: readonly Week[],
  persons: readonly Person[],
  abwesend: AbsenceSet,
  pid: string,
  { fsWeeks, zeiten }: PersonUmfeld,
): PersonBild | null {
  const p = persons.find((x) => x.id === pid)
  if (!p) return null
  const eigene = g.einteilungen.filter((e) => e.pid === pid)
  const ohne = [...new Set(eigene.flatMap((e) => (e.bereich && !isQualified(p, e.bereich) ? [e.bereich] : [])))]
  const bereiche = [...bereicheVon(g, p), ...ohne]
    .map((bereich) => {
      const hier = eigene.filter((e) => e.bereich === bereich)
      const zuletzt = hier.reduce<string | null>((z, e) => (z === null || e.start > z ? e.start : z), null)
      return {
        bereich,
        hat: isQualified(p, bereich),
        n: hier.length,
        erwartet: erwartetVon(g, bereich, pid),
        zuletzt,
        vorWochen: zuletzt ? wochenZwischen(zuletzt, g.fenster.bis) : null,
      }
    })
    // Die eigenen Bereiche zuerst, darin die meisten zuerst.
    .sort((a, b) => Number(b.hat) - Number(a.hat) || b.n - a.n || b.erwartet - a.erwartet || a.bereich.localeCompare(b.bereich))
  const absagen = g.absagen.filter((a) => a.pid === pid)
  const geplant = g.geplant.filter((e) => e.pid === pid)
  /** Abwesend in einer Zusammenkunft, die stattfindet — nur die zählt. */
  const weg = (week: Week, wi: number, tab: MeetingKey): boolean => !istAusgefallen(week, tab) && istAbwesend(abwesend, pid, wi, tab)
  /** Die Treffpunkte, die die Person leitet — ohne Freitext-Leiter, wie `treffpunkte` sie zählt. */
  const geleitet = (wi: number): FsInstance[] => (fsWeeks[wi] ?? []).filter((inst) => inst.lpid === pid && !inst.lext)
  /** Steht der Tag noch aus? In den Wochen des Zeitraums nie; danach ab heute. */
  const steht = (kommendeWoche: boolean, week: Week, versatz: number): boolean => kommendeWoche && tagNach(week.start, versatz) >= g.fenster.heute
  const wocheVon = (wi: number, kommendeWoche: boolean, einteilungen: readonly Einteilung[]): PersonWoche[] => {
    const week = weeks[wi]
    if (!week) return []
    const felder: Record<MeetingKey, FeldArt> = { mid: null, we: null }
    const offen: Record<MeetingKey, boolean> = { mid: false, we: false }
    const eintraege: WochenEintrag[] = []
    for (const tab of MEETING_TABS) {
      if (istAusgefallen(week, tab)) {
        felder[tab] = 'ausgefallen'
        continue
      }
      offen[tab] = steht(kommendeWoche, week, meetingOffset(week, tab, zeiten))
      const hier = einteilungen.filter((e) => e.wi === wi && e.tab === tab)
      const abgesagt = absagen.filter((a) => a.wi === wi && a.tab === tab)
      for (const e of hier) if (!e.hilfsdienst) eintraege.push({ art: 'aufgabe', bereich: e.bereich, geplant: offen[tab] })
      for (const a of abgesagt) eintraege.push({ art: 'absage', bereich: a.bereich, geplant: false })
      felder[tab] = feldArt(hier, abgesagt.length > 0, weg(week, wi, tab))
    }
    // Ein Treffpunkt ist keine Zusammenkunft: Geleitet oder abgesagt steht er nur beim Monat.
    for (const inst of geleitet(wi)) eintraege.push({ art: 'aufgabe', bereich: TREFFPUNKT_BEREICH, geplant: steht(kommendeWoche, week, versatzAbMontag(inst.wd)) })
    for (const a of absagen) if (a.wi === wi && a.tab === null) eintraege.push({ art: 'absage', bereich: a.bereich, geplant: false })
    return [{ start: week.start, felder, geplant: offen, eintraege }]
  }
  // Was ansteht: ab der laufenden Woche bis zur letzten, in der die Person
  // eingeteilt oder abwesend ist oder einen Treffpunkt leitet — dahinter steht für sie nichts.
  const kommend: number[] = []
  let kommendBis = 0
  weeks.forEach((week, wi) => {
    if (week.start < g.fenster.bis) return
    kommend.push(wi)
    if (geplant.some((e) => e.wi === wi) || geleitet(wi).length > 0 || MEETING_TABS.some((tab) => weg(week, wi, tab))) kommendBis = kommend.length
  })
  let abwesendMal = 0
  for (const wi of g.fenster.wochen) {
    const week = weeks[wi]
    for (const tab of MEETING_TABS) if (week && weg(week, wi, tab)) abwesendMal++
  }
  const aufgabenBereiche = bereiche.filter((b) => b.hat && !istHilfsdienstBereich(b.bereich))
  return {
    pid,
    aufgaben: aufgabenBereiche.reduce((s, b) => s + b.n, 0),
    erwartetAufgaben: aufgabenBereiche.reduce((s, b) => s + b.erwartet, 0),
    hilfsdienste: eigene.filter((e) => e.hilfsdienst).length,
    abwesend: abwesendMal,
    absagen: absagen.length,
    bereiche,
    wochen: [
      ...g.fenster.wochen.flatMap((wi) => wocheVon(wi, false, eigene)),
      ...kommend.slice(0, kommendBis).flatMap((wi) => wocheVon(wi, true, geplant)),
    ],
  }
}

/* ---- Alles zusammen -------------------------------------------------------- */

export interface Auswertung {
  zeitraum: Zeitraum
  grundlage: Grundlage
  /** Die Grundlage des ganzen Jahres — dieselbe wie `grundlage`, wenn das Jahr gewählt ist. */
  jahr: Grundlage
  kennzahlen: Kennzahlen
  verteilungen: Record<Vergleich, Verteilung>
  einseitig: EinseitigZeile[]
  /** Je Bereich mit Plätzen im Jahr. */
  wartezeiten: Wartezeiten[]
  /** Je Bereich mit Plätzen im Jahr, die knappsten zuerst. */
  engpaesse: Engpass[]
  /** Bereiche, die bei einer Person fehlen oder ein Jahr ungenutzt sind. */
  pflege: Pflege
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
  const { persons } = eingabe
  const fenster = zeitfenster(eingabe.weeks, ZEITRAUM_WOCHEN[eingabe.zeitraum], eingabe.heute)
  const g = grundlage({ ...eingabe, fenster })
  // Wartezeiten, Engpässe und die Pflege der Bereiche über das ganze Jahr —
  // gleich, welcher Zeitraum gewählt ist.
  const jahr = eingabe.zeitraum === JAHR ? g : grundlage({ ...eingabe, fenster: zeitfenster(eingabe.weeks, ZEITRAUM_WOCHEN[JAHR], eingabe.heute) })
  const verteilungen = {
    aufgaben: verteilung(g, persons, 'aufgaben'),
    hilfsdienste: verteilung(g, persons, 'hilfsdienste'),
  }
  const pflege = { ohneBereich: ohneBereich(jahr, persons), nieGenutzt: nieGenutzt(jahr, persons) }
  const einseitige = einseitig(g, persons, new Map(pflege.nieGenutzt.map((z) => [z.pid, z.bereiche])))
  // Wer übers Jahr insgesamt über seiner Erwartung liegt, wartet nicht — bei
  // den Hilfsdiensten gemessen an der Gesamtlast, wie die Automatik sie verteilt.
  const imJahr = (v: Vergleich): Verteilung => (jahr === g ? verteilungen[v] : verteilung(jahr, persons, v))
  const ueber = { aufgaben: ueberDerErwartung(imJahr('aufgaben')), hilfsdienste: ueberDerErwartung(imJahr('hilfsdienste')) }
  const wartezeitenListe = [...jahr.plaetze.keys()].map((b) => wartezeiten(jahr, persons, b, istHilfsdienstBereich(b) ? ueber.hilfsdienste : ueber.aufgaben))
  const treffpunktGruppen = treffpunkte(eingabe.fsWeeks, fenster, persons, eingabe.groups)
  // Die geleiteten Treffpunkte — gegen sie zählen die abgesagten.
  const geleitet = treffpunktGruppen.reduce((s, gr) => s + gr.zeilen.reduce((t, z) => t + z.n, 0), 0)
  const absagenListe = absagenJeBereich(g, geleitet)
  return {
    zeitraum: eingabe.zeitraum,
    grundlage: g,
    jahr,
    kennzahlen: kennzahlen(g, persons),
    verteilungen,
    einseitig: einseitige,
    wartezeiten: wartezeitenListe,
    engpaesse: engpaesse(jahr),
    pflege,
    treffpunkte: treffpunktGruppen,
    absagen: absagenListe,
    ballungen: ballungen(g),
    hinweise: hinweise(Object.values(verteilungen), einseitige, wartezeitenListe, absagenListe, pflege),
  }
}
