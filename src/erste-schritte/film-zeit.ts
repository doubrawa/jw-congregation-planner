/**
 * **Der Takt des Films „Erste Schritte"** (22.10.2026): sechs Szenen, wie im
 * Clip, den der Betreiber am 21.10.2026 abgenommen hat (T132), hier im
 * Hochformat und in der App selbst gezeichnet. Jede Szene ist eine reine
 * Funktion ihrer Zeit — dasselbe `t` zeichnet immer dasselbe Bild. Deshalb kann
 * der Film anhalten, nach dem Drehen des Handys neu vermessen und ohne Bewegung
 * Schritt für Schritt stehen bleiben (`standbild`).
 */

export const SZENEN = [
  /** Die Punkte des Logos setzen sich, darunter der Titel. */
  { id: 'punkte', dauer: 4, standbild: 2 },
  /** Ein Tipp auf den Link aus der E-Mail, und das Handy zeigt die App: angemeldet. */
  { id: 'link', dauer: 6, standbild: 5 },
  /** Die nächste Aufgabe steht oben; ein Tipp auf Bestätigen. */
  { id: 'aufgabe', dauer: 6, standbild: 4.6 },
  /** Über das Menü des Browsers landet die App auf dem Startbildschirm. */
  { id: 'installieren', dauer: 5.5, standbild: 4.5 },
  /** Glocke, „Aktivieren", und die erste Erinnerung gleitet herein. */
  { id: 'erinnern', dauer: 5, standbild: 4.1 },
  /** Alle vier Punkte sind voll und kehren ins Logo zurück. */
  { id: 'ende', dauer: 3.5, standbild: 3.5 },
] as const

export type SzenenId = (typeof SZENEN)[number]['id']

/** So lange dauert der ganze Film, in Sekunden. */
export const GESAMT = SZENEN.reduce((summe, szene) => summe + szene.dauer, 0)

/** Wann eine Szene beginnt, in Sekunden ab dem Anfang des Films. */
export function szenenBeginn(index: number): number {
  return SZENEN.slice(0, index).reduce((summe, szene) => summe + szene.dauer, 0)
}

/**
 * Welche Szene zu einem Zeitpunkt des Films läuft, und wie weit sie ist. Vor
 * dem Anfang steht die erste, nach dem Ende die letzte in ihrem Schlussbild.
 */
export function szeneBei(zeit: number): { index: number; t: number } {
  let rest = Math.min(Math.max(zeit, 0), GESAMT)
  for (let index = 0; index < SZENEN.length - 1; index++) {
    const dauer = SZENEN[index]?.dauer ?? 0
    if (rest < dauer) return { index, t: rest }
    rest -= dauer
  }
  return { index: SZENEN.length - 1, t: rest }
}

/** Das Standbild einer Szene als Zeitpunkt des Films — für „Schritt für Schritt". */
export function standbildZeit(index: number): number {
  return szenenBeginn(index) + (SZENEN[index]?.standbild ?? 0)
}

/* ---- Bewegung --------------------------------------------------------------
   Dieselben Kurven wie im Clip: Jede nimmt einen Fortschritt von 0 bis 1 und
   gibt einen zurück. */

/** Wie weit `t` zwischen `von` und `bis` ist — vorher 0, danach 1. */
export function seg(t: number, von: number, bis: number): number {
  if (bis <= von) return t >= bis ? 1 : 0
  return Math.min(1, Math.max(0, (t - von) / (bis - von)))
}

/** Schnell los, sanft ankommen. */
export function eo(p: number): number {
  return 1 - (1 - p) ** 3
}

/** Sanft los, schnell ankommen — zum Hinausgleiten. */
export function ei(p: number): number {
  return p ** 3
}

/** Sanft los, sanft ankommen. */
export function eio(p: number): number {
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2
}

/** Ankommen mit einem kleinen Schwung über das Ziel hinaus. */
export function eob(p: number, schwung = 1.7): number {
  return 1 + (schwung + 1) * (p - 1) ** 3 + schwung * (p - 1) ** 2
}

export function lerp(von: number, bis: number, p: number): number {
  return von + (bis - von) * p
}
