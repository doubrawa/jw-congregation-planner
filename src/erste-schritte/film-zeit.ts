/**
 * **Der Takt des Films „Erste Schritte"** (22.10.2026): sechs Szenen, wie im
 * Clip, den der Betreiber am 21.10.2026 abgenommen hat (T132), hier im
 * Hochformat und in der App selbst gezeichnet. Jede Szene ist eine reine
 * Funktion ihrer Zeit — dasselbe `t` zeichnet immer dasselbe Bild. Deshalb kann
 * der Film anhalten, nach dem Drehen des Handys neu vermessen und ohne Bewegung
 * Schritt für Schritt stehen bleiben (`standbild`).
 *
 * **Halte zum Lesen** (Betreiber am selben Tag: „das geht etwas zu schnell.
 * bitte langsamer"): Die Bewegungen laufen im Takt des Clips, aber an
 * `halte` bleibt die Szene stehen — nach ihren letzten Worten, damit man sie
 * lesen kann, und vor einem Tipp, damit man erst liest, was gleich geschieht.
 * `[bei, dauer]`: zur Zeit `bei` der Szene steht sie `dauer` Sekunden lang still.
 * Bemessen nach der Lesezeit von Untertiteln, 20 Zeichen je Sekunde, für die
 * längste der zwölf Sprachen (`ErsteSchritte.test.tsx`). Der Film dauert damit
 * knapp 50 statt 30 Sekunden.
 */

type Halt = readonly [bei: number, dauer: number]

export const SZENEN = [
  /** Die Punkte des Logos setzen sich, darunter der Titel. */
  { id: 'punkte', dauer: 4, standbild: 2, halte: [[1.6, 1.2]] },
  /** Ein Tipp auf den Link aus der E-Mail, und das Handy zeigt die App: angemeldet. */
  { id: 'link', dauer: 6, standbild: 5, halte: [[1.95, 1], [4.2, 2.7]] },
  /** Die nächste Aufgabe steht oben; ein Tipp auf Bestätigen. */
  { id: 'aufgabe', dauer: 6, standbild: 4.6, halte: [[2, 1.2], [4.3, 2.9]] },
  /** Über das Menü des Browsers landet die App auf dem Startbildschirm. */
  { id: 'installieren', dauer: 5.5, standbild: 4.5, halte: [[1.44, 3], [4.45, 3.9]] },
  /** Glocke, „Aktivieren", und die erste Erinnerung gleitet herein. */
  { id: 'erinnern', dauer: 5, standbild: 4.1, halte: [[2.2, 1.2], [4, 2.3]] },
  /** Alle vier Punkte sind voll und kehren ins Logo zurück. */
  { id: 'ende', dauer: 3.5, standbild: 3.5, halte: [] },
] as const satisfies ReadonlyArray<{ id: string; dauer: number; standbild: number; halte: readonly Halt[] }>

export type SzenenId = (typeof SZENEN)[number]['id']

type Szene = (typeof SZENEN)[number]

/** Die Halte einer Szene, als Paare von Zahlen gelesen. */
function halteVon(szene: Szene): readonly Halt[] {
  return szene.halte
}

/** Wie lange eine Szene im Film steht: ihre Bewegung und ihre Halte. */
function laenge(szene: Szene): number {
  return halteVon(szene).reduce<number>((summe, [, dauer]) => summe + dauer, szene.dauer)
}

/** So lange dauert der ganze Film, in Sekunden. */
export const GESAMT = SZENEN.reduce((summe, szene) => summe + laenge(szene), 0)

/** Wann eine Szene beginnt, in Sekunden ab dem Anfang des Films. */
export function szenenBeginn(index: number): number {
  return SZENEN.slice(0, index).reduce((summe, szene) => summe + laenge(szene), 0)
}

/** Die Zeit der Szene zu einem Zeitpunkt in ihr: In einem Halt steht sie still. */
function szenenZeit(szene: Szene, imFilm: number): number {
  let t = imFilm
  for (const [bei, dauer] of halteVon(szene)) {
    if (t <= bei) return t
    t = Math.max(bei, t - dauer)
  }
  return Math.min(t, szene.dauer)
}

/** Umgekehrt: wann im Film die Szene ihre Zeit `t` erreicht (vor einem Halt dort). */
function imFilm(szene: Szene, t: number): number {
  return halteVon(szene).reduce<number>((f, [bei, dauer]) => (bei < t ? f + dauer : f), t)
}

/**
 * Welche Szene zu einem Zeitpunkt des Films läuft, und wie weit sie ist. Vor
 * dem Anfang steht die erste, nach dem Ende die letzte in ihrem Schlussbild.
 */
export function szeneBei(zeit: number): { index: number; t: number } {
  const letzte = SZENEN.length - 1
  // Am Ende das Schlussbild, genau — ein Rest aus Gleitkomma stünde sonst knapp davor.
  if (zeit >= GESAMT) return { index: letzte, t: SZENEN[letzte]?.dauer ?? 0 }
  // Gegen dieselben Summen wie `szenenBeginn`: So gehört ihr Anfang genau der neuen Szene.
  let index = 0
  while (index < letzte && zeit >= szenenBeginn(index + 1)) index++
  const szene = SZENEN[index]
  return { index, t: szene ? szenenZeit(szene, Math.max(0, zeit - szenenBeginn(index))) : 0 }
}

/** Das Standbild einer Szene als Zeitpunkt des Films — für „Schritt für Schritt". */
export function standbildZeit(index: number): number {
  const szene = SZENEN[index]
  return szenenBeginn(index) + (szene ? imFilm(szene, szene.standbild) : 0)
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
