import { describe, expect, it } from 'vitest'
import { buildDemoWeeks, buildImportWeek } from './testdaten'
import type { Week } from './types'

/**
 * T66 — eine Woche ist ihr Datum, nicht ihre Nummer.
 *
 * `weeks.id` (uuid) gibt es seit dem ersten Schema und wird nirgends benutzt;
 * identifiziert wurde eine Woche über `position`, also über eine Ordnungszahl.
 * Daran hingen `task_key`, `Week.stub` und jede Einfügung in der Mitte —
 * aufgefallen, als im Arbeitsheft die Gedächtnismahl-Woche fehlte (T65).
 *
 * Diese Tests halten die **Form** der Kennung fest. Sie sind billig und würden
 * beim nächsten Datensatz sofort anschlagen: Genau dort ist der Fehler bisher
 * entstanden — `start` war optional, und wer eine Woche von Hand baute, ließ es
 * einfach weg.
 */

/** Tage nach Montag (0–6), ohne `Date` gerechnet — Zeitzonen spielen keine Rolle. */
function wochentagVersatz(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const jahr = Number(m[1])
  const monat = Number(m[2])
  const tag = Number(m[3])
  const versatzImJahr = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]
  const j = monat < 3 ? jahr - 1 : jahr
  const sonntagBasiert =
    (j + Math.floor(j / 4) - Math.floor(j / 100) + Math.floor(j / 400) + (versatzImJahr[monat - 1] ?? 0) + tag) % 7
  return (sonntagBasiert + 6) % 7
}

const alle = (): Week[] => [...buildDemoWeeks(), buildImportWeek()]

describe('Jede Woche trägt ihre Kennung', () => {
  it('alle Demo- und Vorlagenwochen haben ein ISO-Datum', () => {
    for (const w of alle()) {
      expect(w.start, w.range).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  /*
    **Immer Montag** — und das ist keine gewählte Konvention. jw.org definiert
    die Programmwoche selbst als Montag bis Sonntag: „2.–8. März 2026", und der
    2. März 2026 ist ein Montag. Die App übernimmt die Festlegung des
    Herausgebers, statt eine eigene zu treffen. Wo der Wochenanfang aus der
    Sprache käme (`Intl.Locale#getWeekInfo()`), gehört das in die Anzeige eines
    Kalenders, nie in die Bildung eines Schlüssels.
  */
  it('und zwar immer einen Montag', () => {
    for (const w of alle()) {
      expect(wochentagVersatz(w.start), `${w.range} (${w.start})`).toBe(0)
    }
  })

  it('die Wochen folgen lückenlos im Sieben-Tage-Takt', () => {
    const starts = alle().map((w) => Date.parse(`${w.start}T00:00:00Z`))
    for (let i = 1; i < starts.length; i++) {
      const abstand = ((starts[i] ?? 0) - (starts[i - 1] ?? 0)) / 864e5
      expect(abstand, `zwischen Woche ${i - 1} und ${i}`).toBe(7)
    }
  })

  it('kein Datum kommt zweimal vor — die Kennung ist eindeutig', () => {
    // Genau das hält seit migration-017 auch die Datenbank:
    // unique (congregation_id, start).
    const starts = alle().map((w) => w.start)
    expect(new Set(starts).size).toBe(starts.length)
  })
})

describe('Die Wochentagsrechnung selbst', () => {
  it('trifft bekannte Tage', () => {
    expect(wochentagVersatz('2026-03-02')).toBe(0) // Montag, erste Woche der Ausgabe
    expect(wochentagVersatz('2026-04-02')).toBe(3) // Donnerstag, Gedächtnismahl 2026
    expect(wochentagVersatz('2026-04-05')).toBe(6) // Sonntag
  })

  it('weist zurück, was kein ISO-Datum ist', () => {
    expect(wochentagVersatz('')).toBeNull()
    expect(wochentagVersatz('7.9.2026')).toBeNull()
  })
})
