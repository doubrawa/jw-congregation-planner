/**
 * Gruppenbesuche des Dienstaufsehers (T120, Phase 2) — reine Logik.
 *
 * Ein Besuch (`Gruppenbesuch`) ist eine Woche und eine Gruppe. Er hat **keine
 * eigene Aufgabe**: Der Besucher wird Leiter der Treffpunkte dieser Gruppe in
 * dieser Woche, und alles Weitere — Zusage, Erinnerung, „Plan senden", die
 * Nachricht „Zuteilung zurückgezogen" — läuft über den Treffpunkt wie bei jedem
 * anderen Leiter. Diese Datei sagt nur, **wo** er einzutragen ist, wie es um
 * einen Besuch steht und was beim Anlegen eines neuen vorgeschlagen wird —
 * angelegt wird jeder von Hand.
 *
 * Treffpunkte gibt es nur für geladene Wochen (`fsWeeks[wi]` gehört zu
 * `weeks[wi]`). Ein Besuch in einer späteren Woche ist **vorgemerkt**: Er nennt
 * vorab die Treffpunkte laut Grundplan und wird eingetragen, sobald die Woche
 * importiert ist (`besucheInNeueWoche`, aufgerufen von `addImportedWeek`).
 *
 * Alle Funktionen sind pur und geben Unberührtem seine Referenz zurück — daran
 * erkennt `persist.ts`, welche Wochen zu schreiben sind.
 */

import { istAbwesendAm } from './absence'
import { fsSetLeader, fsTag, fsTagVorbei, genFsWeek } from './fs'
import { displayName } from './helpers'
import { fromIso, monatNach, montagNach, tagNach } from './meeting-dates'
import type { Absence, FsInstance, FsRule, Group, Gruppenbesuch, Person, Week } from './types'

/** Die Treffpunkte der besuchten Gruppe in einer Woche. */
export function gruppenTreffpunkte(woche: readonly FsInstance[], grp: string): FsInstance[] {
  return woche.filter((inst) => inst.grp === grp)
}

/** Besuche aufsteigend nach Woche, bei gleicher Woche nach Gruppe — die Reihenfolge im Zustand. */
export function nachWoche(besuche: readonly Gruppenbesuch[]): Gruppenbesuch[] {
  return [...besuche].sort((a, b) => a.woche.localeCompare(b.woche) || a.grp.localeCompare(b.grp))
}

/**
 * Den Besucher eines Besuchs in dessen Woche eintragen.
 *
 * `ersetzen`: false trägt nur dort ein, wo **niemand** leitet. Ein Treffpunkt
 * mit anderem Leiter bleibt, wie er ist — ob der Besucher ihn übernimmt,
 * entscheidet der Planer (`besuchUebernehmen` ruft mit true). Ohne Besucher
 * (Person gelöscht) oder in einer Woche, die nicht geladen ist: unverändert.
 */
export function besuchEintragen(
  fsWeeks: FsInstance[][],
  kennungen: readonly string[],
  besuch: Gruppenbesuch,
  persons: readonly Person[],
  ersetzen = false,
): FsInstance[][] {
  const wi = kennungen.indexOf(besuch.woche)
  const woche = fsWeeks[wi]
  const besucher = besuch.pid ? persons.find((p) => p.id === besuch.pid) : undefined
  if (!woche || !besucher) return fsWeeks
  let neu = fsWeeks
  for (const inst of gruppenTreffpunkte(woche, besuch.grp)) {
    if (inst.lpid === besucher.id) continue
    if (inst.leader && !ersetzen) continue
    neu = fsSetLeader(neu, wi, inst.id, displayName(besucher), besucher.id)
  }
  return neu
}

/**
 * Einen Besuch austragen: Wo der Besucher die Treffpunkte der Gruppe leitet,
 * wird der Platz wieder frei. Ein anderer Leiter bleibt — er kam nicht durch
 * den Besuch dorthin.
 *
 * **Der Besucher selbst geht überall**, auch wo er den Treffpunkt schon vor
 * dem Besuch leitete (etwa aus der Auto-Zuteilung) — `besuchEintragen` hat
 * diesen Platz übersprungen, und ein Platz merkt sich nicht, woher sein Leiter
 * kam. So entschieden am 3.10.2026: Der Fall ist selten, der Planer sieht den
 * leeren Platz und besetzt ihn neu, und ein bestätigter Leiter erfährt es über
 * den Entzug. Es genau zu unterscheiden, bräuchte am Besuch eine Liste der
 * Plätze, die er gefüllt hat — eine Spalte mehr im Schema.
 */
export function besuchAustragen(
  fsWeeks: FsInstance[][],
  kennungen: readonly string[],
  besuch: Gruppenbesuch,
): FsInstance[][] {
  const wi = kennungen.indexOf(besuch.woche)
  const woche = fsWeeks[wi]
  if (!woche || !besuch.pid) return fsWeeks
  let neu = fsWeeks
  for (const inst of gruppenTreffpunkte(woche, besuch.grp)) {
    if (inst.lpid === besuch.pid) neu = fsSetLeader(neu, wi, inst.id, '')
  }
  return neu
}

/**
 * Die vorgemerkten Besuche einer frisch importierten Woche eintragen.
 *
 * Nur leere Plätze — eine gerade aus dem Grundplan erzeugte Woche hat ohnehin
 * keine anderen. Ohne Besuch in dieser Woche dieselbe Referenz.
 */
export function besucheInNeueWoche(
  woche: FsInstance[],
  start: string,
  besuche: readonly Gruppenbesuch[],
  persons: readonly Person[],
): FsInstance[] {
  let neu = [woche]
  for (const besuch of besuche) {
    if (besuch.woche === start) neu = besuchEintragen(neu, [start], besuch, persons)
  }
  return neu[0] ?? woche
}

/**
 * Wie es um einen Besuch steht — in dieser Rangfolge geprüft:
 *
 * - `vorbei`: Die Treffpunkte der Woche sind gewesen (ohne Treffpunkt: die
 *   Woche ist um). Vergangenes meldet keinen Konflikt mehr.
 * - `keinTreffpunkt`: Die Gruppe trifft sich in dieser Woche nicht — etwa am
 *   ersten Samstag, wenn dort ein Versammlungstreffpunkt liegt (`skipCong`).
 * - `vorgemerkt`: Die Woche ist noch nicht geladen; eingetragen wird beim Import.
 * - `andererLeiter`: Ein Treffpunkt der Gruppe hat schon einen anderen Leiter.
 * - `offen`: Ein Treffpunkt der Gruppe hat noch gar keinen Leiter — etwa, weil
 *   er erst nach dem Besuch im Grundplan entstand.
 * - `eingetragen`: Der Besucher leitet alle Treffpunkte der Gruppe.
 */
export type BesuchsArt = 'vorbei' | 'keinTreffpunkt' | 'vorgemerkt' | 'andererLeiter' | 'offen' | 'eingetragen'

export interface BesuchsStand {
  art: BesuchsArt
  /** Die Treffpunkte der Gruppe in dieser Woche — geladen, sonst laut Grundplan. */
  treffpunkte: FsInstance[]
  /** Woche noch nicht geladen: Die Treffpunkte stammen aus dem Grundplan. */
  lautGrundplan: boolean
  /** Bei `andererLeiter`: wer dort leitet. */
  andererLeiter: string | null
  /** Der Besucher ist an einem der Treffpunkt-Tage abwesend. */
  abwesend: boolean
}

/** Was `besuchStand` aus dem Zustand braucht. */
export interface BesuchsLage {
  kennungen: readonly string[]
  fsWeeks: readonly FsInstance[][]
  fsRules: FsRule[]
  absences: readonly Absence[]
}

/**
 * Die Lage aus dem Zustand. Stand bis zum 3.10.2026 fünfmal von Hand
 * zusammengesetzt (Reducer, Planen, Ansehen, Planungs-Karte, Reiterleiste).
 */
export function besuchsLage(state: {
  weeks: readonly Pick<Week, 'start'>[]
  fsWeeks: readonly FsInstance[][]
  fsRules: FsRule[]
  absences: readonly Absence[]
}): BesuchsLage {
  return {
    kennungen: state.weeks.map((w) => w.start),
    fsWeeks: state.fsWeeks,
    fsRules: state.fsRules,
    absences: state.absences,
  }
}

export function besuchStand(besuch: Gruppenbesuch, lage: BesuchsLage, heute = new Date()): BesuchsStand {
  const wi = lage.kennungen.indexOf(besuch.woche)
  const geladen = wi >= 0 ? lage.fsWeeks[wi] : undefined
  const treffpunkte = gruppenTreffpunkte(geladen ?? genFsWeek(besuch.woche, lage.fsRules), besuch.grp)
  // Ohne Treffpunkt zählt das Ende der Woche: der Sonntag (Wochentag 0).
  const vorbei = treffpunkte.length
    ? treffpunkte.every((inst) => fsTagVorbei(besuch.woche, inst.wd, heute))
    : fsTagVorbei(besuch.woche, 0, heute)
  // Vergangenes fragt die Abwesenheiten gar nicht erst: Die Liste der Besuche
  // wächst mit den Jahren, und ein vorbeigegangener meldet nichts mehr.
  const abwesend =
    !vorbei &&
    besuch.pid !== null &&
    treffpunkte.some((inst) => {
      const tag = fsTag(besuch.woche, inst.wd)
      return tag !== null && istAbwesendAm(lage.absences, besuch.pid ?? undefined, tag)
    })
  const basis = { treffpunkte, lautGrundplan: !geladen, andererLeiter: null, abwesend }
  if (vorbei) return { ...basis, art: 'vorbei' }
  if (!treffpunkte.length) return { ...basis, art: 'keinTreffpunkt' }
  if (!geladen) return { ...basis, art: 'vorgemerkt' }
  const fremd = treffpunkte.find((inst) => inst.leader && inst.lpid !== besuch.pid)
  if (fremd) return { ...basis, art: 'andererLeiter', andererLeiter: fremd.leader }
  if (treffpunkte.some((inst) => !inst.leader)) return { ...basis, art: 'offen' }
  return { ...basis, art: 'eingetragen' }
}

/**
 * Steht bei diesem Besuch etwas zu klären? Vergangenes nicht mehr, und ein
 * vorgemerkter Besuch nur, wenn schon jetzt feststeht, dass er nicht aufgeht
 * (kein Treffpunkt, Besucher abwesend oder gelöscht).
 */
export function besuchHatKonflikt(besuch: Gruppenbesuch, stand: BesuchsStand): boolean {
  if (stand.art === 'vorbei') return false
  return (
    besuch.pid === null ||
    stand.abwesend ||
    stand.art === 'keinTreffpunkt' ||
    stand.art === 'andererLeiter' ||
    stand.art === 'offen'
  )
}

/* ---- Ein neuer Besuch ---- */

/**
 * Der Monat eines Besuchs („2026-10"): der seines **Wochenendes**. Der
 * Dienstaufseher besucht je Monat an einem Wochenende eine Gruppe — eine Woche
 * vom 28. September bis 4. Oktober gehört damit zum Oktober.
 */
export function besuchsMonat(woche: string): string {
  return tagNach(woche, 5).slice(0, 7)
}

/** Die Montage der Wochen, deren Samstag im Monat liegt — aufsteigend. */
function montageImMonat(monat: string): string[] {
  const erster = `${monat}-01`
  const montage: string[] = []
  const ersterSamstag = tagNach(erster, (6 - fromIso(erster).getDay() + 7) % 7)
  for (let samstag = ersterSamstag; samstag.startsWith(monat); samstag = tagNach(samstag, 7)) {
    montage.push(tagNach(samstag, -5))
  }
  return montage
}

/**
 * Dasselbe Wochenende im nächsten Monat: das wievielte es im Monat des Besuchs
 * war, so im nächsten — das fünfte heißt „letztes" und bleibt das letzte.
 */
function gleichesWochenendeImNaechstenMonat(woche: string): string | undefined {
  const monat = besuchsMonat(woche)
  const nr = montageImMonat(monat).indexOf(woche)
  const naechste = montageImMonat(monatNach(monat))
  // Jeder Monat hat mindestens vier Samstage — das erste bis vierte gibt es immer.
  return nr >= 0 && nr < 4 ? naechste[nr] : naechste.at(-1)
}

/**
 * **Was beim Anlegen eines Besuchs schon dasteht** (13.10.2026). Angelegt wird
 * von Hand — „es soll keinen automatismus geben … maximal 12 termine im jahr"
 * —, vorbelegt mit dem, was der Planer vermutlich eingibt:
 *
 * - die Gruppe, die **am längsten nicht dran** war (noch nie besuchte zuerst,
 *   in ihrer Reihenfolge) — ein schon geplanter Besuch zählt mit,
 * - die Woche **einen Monat nach dem letzten Besuch** (dasselbe Wochenende im
 *   nächsten Monat), frühestens diese,
 * - der Besucher des letzten Besuchs, der einen hat.
 *
 * Ob der Besucher noch Treffpunkte leiten darf, prüft das Blatt — es kennt die
 * Auswahl.
 */
export function besuchVorschlag(
  besuche: readonly Gruppenbesuch[],
  groups: readonly Group[],
  dieseWoche: string,
): { woche: string; grp: string | null; pid: string | null } {
  const reihe = nachWoche(besuche)
  const zuletzt = new Map<string, string>()
  for (const b of reihe) zuletzt.set(b.grp, b.woche)
  // Stabil sortiert: Bei gleichem „zuletzt" (noch nie) bleibt die Reihenfolge der Gruppen.
  const grp = groups.map((g) => g.id).sort((a, b) => (zuletzt.get(a) ?? '').localeCompare(zuletzt.get(b) ?? ''))[0]
  const letzter = reihe.at(-1)
  const naechste = letzter ? gleichesWochenendeImNaechstenMonat(letzter.woche) : undefined
  return {
    woche: naechste && naechste >= dieseWoche ? naechste : dieseWoche,
    grp: grp ?? null,
    pid: reihe.findLast((b) => b.pid !== null)?.pid ?? null,
  }
}

/** Wie weit die Wochen zur Wahl reichen: ein halbes Jahr. */
const AUSWAHL_WOCHEN = 30

/**
 * Die Wochen zur Wahl — beim Anlegen und beim Verlegen eines Besuchs: ab
 * dieser Woche ein halbes Jahr und mindestens bis einen Monat hinter die
 * Woche des Besuchs (oder des Vorschlags), damit sie samt Nachbarwochen dasteht.
 */
export function besuchsWochenAuswahl(dieseWoche: string, woche = dieseWoche): string[] {
  const halbesJahr = montagNach(dieseWoche, AUSWAHL_WOCHEN - 1)
  const nachBesuch = montagNach(woche, 4)
  const bis = halbesJahr > nachBesuch ? halbesJahr : nachBesuch
  const out: string[] = []
  for (let w = dieseWoche; w <= bis; w = montagNach(w, 1)) out.push(w)
  return out
}
