/*
 * Auswahlwerte für die Zusammenkunftszeiten (Einstellungen → VERSAMMLUNG).
 *
 * Hier stand bis zum 18. September 2026 auch ein `parseMeetingTimes`: Die
 * beiden Termine wurden als **ein** Anzeigetext gespeichert („Di 19:00 · So
 * 10:00") und hier per regulärem Ausdruck wieder auseinandergenommen — mit
 * deutschen Kürzeln, in einer App mit 34 Bediensprachen. Sie stehen jetzt als
 * Werte in der Versammlung (`Congregation.times`); zu tun bleibt, was zu einer
 * Eingabe gehört: die Liste der wählbaren Uhrzeiten.
 */

/**
 * Uhrzeiten im 15-Minuten-Raster; eine krumme Bestandszeit bleibt wählbar.
 *
 * `current` kommt aus den Daten und muss in der Liste stehen, sonst zeigte das
 * Auswahlfeld eine andere Zeit an als die, die gilt.
 */
export function timeOptions(current: string): string[] {
  const opts: string[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of ['00', '15', '30', '45']) opts.push(`${String(h).padStart(2, '0')}:${m}`)
  }
  if (!opts.includes(current)) opts.push(current)
  return opts.sort()
}
