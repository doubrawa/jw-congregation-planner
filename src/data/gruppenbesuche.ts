/**
 * Gruppenbesuche des Dienstaufsehers (T120, Phase 2) — reine Logik.
 *
 * Ein Besuch (`Gruppenbesuch`) ist eine Woche und eine Gruppe. Er hat **keine
 * eigene Aufgabe**: Der Besucher wird Leiter der Treffpunkte dieser Gruppe in
 * dieser Woche, und alles Weitere — Zusage, Erinnerung, „Plan senden", die
 * Nachricht „Zuteilung zurückgezogen" — läuft über den Treffpunkt wie bei jedem
 * anderen Leiter. Diese Datei sagt nur, **wo** er einzutragen ist, wie es um
 * einen Besuch steht und wie man reihum verteilt.
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
import { fromIso, isoDay, montagNach } from './meeting-dates'
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

/* ---- Reihum verteilen ---- */

/**
 * Wie viele Monate „Reihum verteilen" auf einmal plant. Ein halbes Jahr: weit
 * genug, dass die Gruppen ihre Besuche früh kennen (der Gruppenaufseher kündigt
 * sie an, od Kap. 5 Abs. 41), kurz genug, dass Abwesenheiten schon eingetragen
 * sein können.
 */
export const VERTEILEN_MONATE = 6

/**
 * Der Monat eines Besuchs („2026-10"): der seines **Wochenendes**. Der
 * Dienstaufseher besucht je Monat an einem Wochenende eine Gruppe — eine Woche
 * vom 28. September bis 4. Oktober gehört damit zum Oktober.
 */
export function besuchsMonat(woche: string): string {
  const samstag = fromIso(woche)
  samstag.setDate(samstag.getDate() + 5)
  return isoDay(samstag).slice(0, 7)
}

function naechsterMonat(monat: string): string {
  const [y = 0, m = 1] = monat.split('-').map(Number)
  return isoDay(new Date(y, m, 1, 12)).slice(0, 7)
}

/**
 * Welches Wochenende im Monat „Reihum verteilen" nimmt (4.10.2026): das erste
 * bis vierte oder das letzte. Bis dahin war es immer das erste, an dem es ging
 * — „das ist auch nicht gut".
 */
export type Wochenende = 1 | 2 | 3 | 4 | 'letztes'

/** Die Wahl, in der Reihenfolge der Auswahl. */
export const WOCHENENDEN: readonly Wochenende[] = [1, 2, 3, 4, 'letztes']

/** Das wievielte Wochenende seines Monats eine Besuchswoche hat; das fünfte heißt „letztes". */
export function besuchsWochenende(woche: string): Wochenende {
  const i = montageImMonat(besuchsMonat(woche)).indexOf(woche)
  return i === 0 ? 1 : i === 1 ? 2 : i === 2 ? 3 : i === 3 ? 4 : 'letztes'
}

/**
 * Die Vorgabe beim Verteilen: das Wochenende des **jüngsten** Besuchs — wer
 * unten einen Besuch am dritten Wochenende anlegt, verteilt danach am dritten
 * weiter. Gespeichert wird sie nicht, der Plan selbst trägt sie (wie den
 * Besucher). Ohne Besuch das erste.
 */
export function vorgabeWochenende(besuche: readonly Gruppenbesuch[]): Wochenende {
  const juengster = nachWoche(besuche).at(-1)
  return juengster ? besuchsWochenende(juengster.woche) : 1
}

/**
 * Die Wochen eines Monats in der Reihenfolge, in der „Reihum verteilen" sie
 * versucht: das gewählte Wochenende zuerst, dann die übrigen nach Abstand —
 * bei gleichem Abstand das spätere. Ein Besuch rückt eher nach hinten als nach
 * vorn; am ersten Samstag liegt oft der Versammlungstreffpunkt.
 */
function wochenNachWahl(montage: readonly string[], wahl: Wochenende): string[] {
  const ziel = wahl === 'letztes' ? montage.length - 1 : Math.min(wahl, montage.length) - 1
  return montage
    .map((woche, i) => ({ woche, i, abstand: Math.abs(i - ziel) }))
    .sort((a, b) => a.abstand - b.abstand || b.i - a.i)
    .map((x) => x.woche)
}

/**
 * Die Monate, die „Reihum verteilen" füllt: sechs ab dem Monat nach dem
 * jüngsten Besuch, frühestens ab dem laufenden. Planen zeigt genau diese zum
 * Auslassen an — dieselbe Rechnung, damit dort steht, was dann geschieht.
 */
export function verteilenMonate(besuche: readonly Gruppenbesuch[], heute = new Date()): string[] {
  const juengster = nachWoche(besuche).at(-1)
  const diesenMonat = isoDay(heute).slice(0, 7)
  const ab = juengster ? naechsterMonat(besuchsMonat(juengster.woche)) : diesenMonat
  let monat = ab > diesenMonat ? ab : diesenMonat
  const out: string[] = []
  for (let i = 0; i < VERTEILEN_MONATE; i++, monat = naechsterMonat(monat)) out.push(monat)
  return out
}

/**
 * Die Wochen zur Wahl — beim Hinzufügen und beim Verlegen eines Besuchs: ab
 * dieser Woche ein halbes Jahr und mindestens bis einen Monat hinter die
 * Woche des Besuchs. Einen Besuch, den „Reihum verteilen" weiter hinten
 * angelegt hat, gibt es so samt seinen Nachbarwochen zur Wahl.
 */
export function besuchsWochenAuswahl(dieseWoche: string, woche = dieseWoche): string[] {
  const halbesJahr = montagNach(dieseWoche, VERTEILEN_MONATE * 5 - 1)
  const nachBesuch = montagNach(woche, 4)
  const bis = halbesJahr > nachBesuch ? halbesJahr : nachBesuch
  const out: string[] = []
  for (let w = dieseWoche; w <= bis; w = montagNach(w, 1)) out.push(w)
  return out
}

/** Die Montage der Wochen, deren Samstag im Monat liegt — aufsteigend. */
function montageImMonat(monat: string): string[] {
  const [y = 0, m = 1] = monat.split('-').map(Number)
  const tag = new Date(y, m - 1, 1, 12)
  tag.setDate(tag.getDate() + ((6 - tag.getDay() + 7) % 7)) // erster Samstag
  const montage: string[] = []
  while (tag.getMonth() === m - 1) {
    const montag = new Date(tag)
    montag.setDate(tag.getDate() - 5)
    montage.push(isoDay(montag))
    tag.setDate(tag.getDate() + 7)
  }
  return montage
}

/**
 * **Reihum verteilen**: je Monat ein Besuch, die Gruppen der Reihe nach —
 * gemessen am od (Kap. 5 Abs. 36: „jeden Monat an einem Wochenende eine andere
 * Gruppe").
 *
 * - **Die Reihe ist eine Warteschlange**: Vorn steht die Gruppe, deren letzter
 *   Besuch am längsten her ist (noch nie besuchte zuerst, in ihrer
 *   Reihenfolge). Wer besucht wird, geht ans Ende. Ein Zeiger „nach der Gruppe
 *   des jüngsten Besuchs" ginge nur, solange nie eine Gruppe übersprungen
 *   wird — kommt eine spätere dran, weil die vordere im Monat keine Woche
 *   findet, besuchte er die spätere sonst gleich danach noch einmal.
 * - Begonnen wird im Monat nach dem jüngsten Besuch, frühestens im laufenden
 *   (`verteilenMonate`). Monate, die schon einen Besuch haben, bleiben, wie
 *   sie sind; **ausgelassene** (`auslassen`, 4.10.2026) bleiben leer, und die
 *   Reihe rückt nach — die Gruppe des ausgelassenen Monats kommt im nächsten.
 * - Je Monat das **gewählte Wochenende** (`wochenende`, sonst das erste), in
 *   dem sich die Gruppe trifft (geladen, sonst laut Grundplan) und der
 *   Besucher nicht abwesend ist; geht es dort nicht, das nächstgelegene
 *   (`wochenNachWahl`). Am ersten Samstag liegt oft ein
 *   Versammlungstreffpunkt, dann trifft es den zweiten.
 * - Nie zwei Gruppen in derselben Woche — der Besucher ist einer.
 * - Ein anderer Leiter in einer geladenen Woche hält die Verteilung **nicht**
 *   auf: Das ist ein Konflikt, den der Planer mit „Übernehmen" löst — so sieht
 *   er ihn, statt dass der Monat still leer bliebe.
 *
 * Gibt nur die **neuen** Besuche zurück.
 */
export function besucheVerteilen(args: {
  besuche: readonly Gruppenbesuch[]
  groups: readonly Group[]
  lage: BesuchsLage
  pid: string
  neueId: () => string
  wochenende?: Wochenende
  /** Monate („2026-12"), in denen kein Besuch stattfindet. */
  auslassen?: readonly string[]
  heute?: Date
}): Gruppenbesuch[] {
  const { besuche, groups, lage, pid, neueId, wochenende = 1, auslassen = [], heute = new Date() } = args
  const zuletzt = new Map<string, string>()
  for (const b of nachWoche(besuche)) zuletzt.set(b.grp, b.woche)
  // Stabil sortiert: Bei gleichem „zuletzt" (noch nie) bleibt die Reihenfolge der Gruppen.
  const reihe = groups.map((g) => g.id).sort((a, b) => (zuletzt.get(a) ?? '').localeCompare(zuletzt.get(b) ?? ''))
  const belegteWochen = new Set(besuche.map((b) => b.woche))
  const belegteMonate = new Set(besuche.map((b) => besuchsMonat(b.woche)))

  /** Die Woche im Monat, in der diese Gruppe besucht werden kann — sonst null. */
  const wocheFuer = (monat: string, grp: string): string | null => {
    for (const woche of wochenNachWahl(montageImMonat(monat), wochenende)) {
      if (belegteWochen.has(woche)) continue
      const stand = besuchStand({ id: '', woche, grp, pid }, lage, heute)
      if (stand.art === 'vorbei' || stand.art === 'keinTreffpunkt' || stand.abwesend) continue
      return woche
    }
    return null
  }

  const neu: Gruppenbesuch[] = []
  for (const monat of verteilenMonate(besuche, heute)) {
    if (belegteMonate.has(monat) || auslassen.includes(monat)) continue
    for (const grp of reihe) {
      const woche = wocheFuer(monat, grp)
      if (!woche) continue
      neu.push({ id: neueId(), woche, grp, pid })
      belegteWochen.add(woche)
      belegteMonate.add(monat)
      reihe.splice(reihe.indexOf(grp), 1)
      reihe.push(grp)
      break
    }
  }
  return neu
}
