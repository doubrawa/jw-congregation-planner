/*
 * Zusammenkunftszeiten: strukturierte Eingabe (Wochentag-Select + Uhrzeit je
 * Zusammenkunft), gespeichert als kanonischer String "Di 19:00 · So 10:00" —
 * die Erinnerungs-Function (send-reminders) liest die Wochentage daraus, das
 * Format muss also stimmen. Kanonisch deutsche Kürzel; Anzeige lokalisiert.
 */

export const DAY_KEYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const
export type MeetingTime = { day: string; time: string }

export function parseMeetingTimes(text: string): [MeetingTime, MeetingTime] {
  const found = [...text.matchAll(/\b(Mo|Di|Mi|Do|Fr|Sa|So)\b\s*(\d{1,2}:\d{2})/g)].map((m) => ({
    day: m[1],
    time: m[2].padStart(5, '0'),
  }))
  return [found[0] ?? { day: 'Di', time: '19:00' }, found[1] ?? { day: 'So', time: '10:00' }]
}

/** Uhrzeiten im 15-Minuten-Raster; eine krumme Bestandszeit bleibt wählbar. */
export function timeOptions(current: string): string[] {
  const opts: string[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of ['00', '15', '30', '45']) opts.push(`${String(h).padStart(2, '0')}:${m}`)
  }
  if (!opts.includes(current)) opts.push(current)
  return opts.sort()
}
