/**
 * **Suchen, wie getippt wird** — ohne Akzente und Umlautpunkte („kruger"), in
 * deutscher Umschrift („krueger"), die Wörter in beliebiger Reihenfolge.
 *
 * Stand bis zum neuen Design nur in der Personenliste (`person-filter.ts`).
 * Seit auch das Zuteilen-Blatt nach Namen sucht (T121), steht die Regel hier —
 * sonst fände „kruger" in der Liste den Bruder und im Blatt daneben nicht.
 */

/** Ohne Akzente und Umlautpunkte, ß als ss — so tippt, wer sie nicht zur Hand hat: „kruger". */
const ohneZeichen = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss')

/** Deutsche Umschrift — so tippt, wer sie kennt: „krueger", „boehm". */
const umschrift = (s: string): string => ohneZeichen(s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'))

/** Steht `gesucht` in `text` — wörtlich, ohne Zeichen oder in Umschrift? Beide schon klein geschrieben. */
export function enthaelt(text: string, gesucht: string): boolean {
  const ohne = ohneZeichen(gesucht)
  return text.includes(gesucht) || ohneZeichen(text).includes(ohne) || umschrift(text).includes(ohne)
}

/**
 * Trifft die Eingabe diesen Namen? Jedes Wort für sich: „krüger s" findet
 * „Simon Krüger" — so tippt, wer unter Namensvettern wählt.
 */
export function nameTrifft(name: string, eingabe: string): boolean {
  const text = name.toLowerCase()
  return eingabe
    .toLowerCase()
    .split(/\s+/)
    .every((wort) => enthaelt(text, wort))
}
