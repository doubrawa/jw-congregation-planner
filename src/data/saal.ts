/**
 * **Der Saal auf dem Start** (T121): die Besetzung einer Zusammenkunft als Bild
 * aus 18 Plätzen — dem Logo 4-6-8. Er steht über der eigenen nächsten Aufgabe
 * und sagt auf einen Blick, wie weit der Abend steht: voll heißt zugesagt,
 * blass wartet auf Zusage, rot ist abgesagt, gestrichelt noch offen — und der
 * eigene Platz trägt einen Ring.
 *
 * **Ein Bild, keine Zählung.** Eine Zusammenkunft hat zwanzig bis dreißig
 * Plätze, der Saal achtzehn. Die Anteile werden darauf verteilt; die genauen
 * Zahlen nennt die Beschriftung für Vorleseprogramme. Nur eines darf dabei nie
 * passieren: dass eine Lage, die es gibt, im Bild verschwindet. Eine einzige
 * Absage unter dreißig Plätzen bekäme rechnerisch keinen Platz — sie bekommt
 * trotzdem einen, denn genau sie ist die Nachricht.
 *
 * Die Stufen kommen aus derselben Quelle wie die Ampel im Planen
 * (`zusageStatus`), die Plätze aus demselben Durchlauf (`allePlaetze`).
 */

import { platzKey, allePlaetze, leerVorOrt, platzMitZusage } from './plaetze'
import { sentKey, zusageStatus } from './planning'
import type { ConfirmationMap, Meeting, MeetingKey, PersoenlichLog, Service, SlotAssignment, TaskStatus } from './types'

/** Lage eines Platzes im Bild. */
export type SaalLage = 'voll' | 'wartet' | 'problem' | 'offen' | 'du'

/** Lage eines einzelnen Platzes — im Saal wie beim Planen an der Zeile (`GPlanen`). */
export type PlatzLage = Exclude<SaalLage, 'du'>

/** Wie viele Plätze der Saal zeigt — die Plätze des Logos 4-6-8. */
export const SAAL_PLAETZE = 18

/**
 * Wo der eigene Platz sitzt: zweite Reihe, Mitte — wie auf dem Entwurf. Fest,
 * damit er nicht wandert, wenn sich die Besetzung ändert.
 */
const DU_PLATZ = 6

/** Die Besetzung einer Zusammenkunft, gezählt je Lage. Der eigene Platz zählt nicht mit. */
export interface Besetzung {
  voll: number
  wartet: number
  problem: number
  offen: number
  /** Sitzt der Leser selbst in dieser Zusammenkunft? */
  du: boolean
}

/** Der Stand des eigenen Platzes: Wer dort sitzt, ist eingeteilt — offen ist er nie. */
export type DuLage = Exclude<PlatzLage, 'offen'>

/** Die Lage, die eine Zusage zeigt — im Saal, an der Zeile beim Planen und unter „Meine Aufgaben". */
export const LAGE_DER_ZUSAGE: Record<TaskStatus, DuLage> = {
  bestätigt: 'voll',
  offen: 'wartet',
  verhindert: 'problem',
}

/**
 * **Die Lage eines Platzes** — die eine Regel für den Saal und die Zeilen
 * beim Planen: Unbesetzt ist er offen; steht die Person in einem Konflikt
 * (abwesend, doppelt eingeteilt), ist er ein Problem; hat er nichts zu
 * bestätigen (`zusage` ist `null` — Gastredner, Gruppe, ausgefallene
 * Zusammenkunft), ist er besetzt und damit voll; sonst sagt es die Zusage.
 */
export function lageVon(slot: SlotAssignment | undefined, zusage: TaskStatus | null, imKonflikt: boolean): PlatzLage {
  if (!slot?.name) return 'offen'
  if (imKonflikt) return 'problem'
  return zusage === null ? 'voll' : LAGE_DER_ZUSAGE[zusage]
}

/**
 * Die Besetzung einer Zusammenkunft: jeder Platz einmal, der des Lesers
 * (`meinKey`) gesondert. Beim Planen fragt sie dazu, wer in einem Konflikt
 * steht (`imKonflikt`) — sein Platz ist ein Problem.
 */
export function besetzung(
  meeting: Meeting,
  services: readonly Service[],
  confirmations: ConfirmationMap,
  woche: string,
  tab: MeetingKey,
  meinKey: string | null,
  imKonflikt: (slot: SlotAssignment) => boolean = () => false,
): Besetzung {
  const b: Besetzung = { voll: 0, wartet: 0, problem: 0, offen: 0, du: false }
  for (const platz of allePlaetze(meeting, services)) {
    // Das Schlussgebet am Wochenende ist leer nicht offen (T133).
    if (leerVorOrt(meeting, platz)) continue
    const slot = platz.slot
    const key = slot?.name ? platzKey(platz, woche, tab) : null
    if (key !== null && key === meinKey) {
      b.du = true
      continue
    }
    const zusage = key !== null && platzMitZusage(platz) ? zusageStatus(confirmations, key) : null
    b[lageVon(slot, zusage, Boolean(slot && imKonflikt(slot)))]++
  }
  return b
}

/**
 * **Wie weit die Zusagen sind**: bestätigt von allen Plätzen, die etwas zu
 * bestätigen haben (`platzMitZusage`) — die Spur beim Planen.
 *
 * **Der Haken „weiß Bescheid" zählt wie eine Zusage** (T121, entschieden am
 * 14.10.2026): Wer kein Konto hat, kann nicht zusagen; der Planer sagt es ihm
 * selbst und hakt es in den Zusagen der Woche ab (`persoenlich`, je Platz und
 * Name wie das Versand-Tagebuch). Ohne das würde der Schritt „Zusagen" in
 * einer Woche mit solchen Personen nie fertig. Eine Absage schlägt den Haken —
 * sie ist ein Problem, keine Zusage.
 */
export function zusagenStand(
  meeting: Meeting,
  services: readonly Service[],
  confirmations: ConfirmationMap,
  persoenlich: PersoenlichLog,
  woche: string,
  tab: MeetingKey,
): { bestaetigt: number; gesamt: number } {
  let bestaetigt = 0
  let gesamt = 0
  for (const platz of allePlaetze(meeting, services)) {
    if (!platzMitZusage(platz)) continue
    gesamt++
    const key = platzKey(platz, woche, tab)
    const zusage = zusageStatus(confirmations, key)
    const bescheid = zusage === 'offen' && persoenlich[sentKey(key, platz.slot?.name ?? '')] != null
    if (zusage === 'bestätigt' || bescheid) bestaetigt++
  }
  return { bestaetigt, gesamt }
}

/** Besetzte Plätze (mit dem eigenen) und alle Plätze — für die Beschriftung. */
export function besetztVon(b: Besetzung): { besetzt: number; gesamt: number } {
  const du = b.du ? 1 : 0
  const besetzt = b.voll + b.wartet + b.problem + du
  return { besetzt, gesamt: besetzt + b.offen }
}

/**
 * Die Lagen eines Platzes in der Reihenfolge des Saals: So bekommen sie Plätze
 * und gewinnen bei Gleichstand, und so stehen sie im Balken der Planung
 * nebeneinander (`SaalBalken`) — offen sitzt hinten.
 */
export const PLATZ_LAGEN = ['voll', 'wartet', 'problem', 'offen'] as const satisfies readonly PlatzLage[]

/**
 * Die 18 Plätze des Bilds, von vorn nach hinten.
 *
 * Verteilt wird nach dem größten Rest (Hare-Niemeyer): Jede Lage bekommt
 * ihren Anteil abgerundet, die übrigen Plätze die mit dem größten Rest. Danach
 * erhält jede vorhandene Lage mindestens einen Platz — genommen von der Lage
 * mit den meisten.
 *
 * **Offen sitzt hinten**, wie ein Saal sich von vorn füllt. Wartende und
 * Absagen verteilen sich gleichmäßig unter die Besetzten, statt als Block
 * beieinander zu sitzen: Jeder Platz einer Lage hat eine Wunschstelle (gleicher
 * Abstand über die Reihe), und alle zusammen werden danach geordnet.
 */
export function saalLagen(b: Besetzung): SaalLage[] {
  const frei = SAAL_PLAETZE - (b.du ? 1 : 0)
  const anzahl = verteilen({ voll: b.voll, wartet: b.wartet, problem: b.problem, offen: b.offen }, frei)

  const vorn = frei - anzahl.offen
  const wunsch: Array<{ lage: PlatzLage; stelle: number; rang: number }> = []
  for (const [rang, lage] of PLATZ_LAGEN.entries()) {
    if (lage === 'offen') continue
    for (let j = 0; j < anzahl[lage]; j++) wunsch.push({ lage, stelle: (j + 0.5) / anzahl[lage], rang })
  }
  wunsch.sort((x, y) => x.stelle - y.stelle || x.rang - y.rang)
  const reihe: SaalLage[] = [...wunsch.map((w) => w.lage), ...Array<SaalLage>(frei - vorn).fill('offen')]
  if (b.du) reihe.splice(DU_PLATZ, 0, 'du')
  return reihe
}

/** `n` Plätze nach dem größten Rest auf die Lagen — keine vorhandene geht leer aus. */
function verteilen(zahlen: Record<PlatzLage, number>, n: number): Record<PlatzLage, number> {
  const summe = PLATZ_LAGEN.reduce((s, lage) => s + zahlen[lage], 0)
  // Nichts gezählt (keine Plätze, oder nur der eigene): Der Rest des Saals ist offen.
  if (summe === 0) return { voll: 0, wartet: 0, problem: 0, offen: n }

  const anteil = PLATZ_LAGEN.map((lage) => ({ lage, genau: (zahlen[lage] * n) / summe }))
  const out = Object.fromEntries(anteil.map((a) => [a.lage, Math.floor(a.genau)])) as Record<PlatzLage, number>
  let rest = n - PLATZ_LAGEN.reduce((s, lage) => s + out[lage], 0)
  for (const a of [...anteil].sort((x, y) => (y.genau % 1) - (x.genau % 1))) {
    if (rest === 0) break
    out[a.lage]++
    rest--
  }

  for (const lage of PLATZ_LAGEN) {
    if (zahlen[lage] === 0 || out[lage] > 0) continue
    const groesste = PLATZ_LAGEN.reduce((g, l) => (out[l] > out[g] ? l : g))
    out[groesste]--
    out[lage]++
  }
  return out
}
