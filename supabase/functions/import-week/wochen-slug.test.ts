import { describe, expect, it } from 'vitest'
import { wochenStart } from './wochen-slug'

/**
 * Die Seitennamen der Arbeitsheft-Wochen, wie jw.org sie führt — nachgemessen
 * an den Ausgaben November/Dezember 2025 und 2026 (nur die Form; die Seiten
 * selbst stehen hier nicht). Der Pfad trägt das „ü" prozentkodiert.
 */
const PFAD = '/de/bibliothek/jw-arbeitsheft/november-dezember-2026-mwb/Programm-f%C3%BCr-die-Leben-und-Dienst-Zusammenkunft-'

const iso = (d: Date | null): string | null => d?.toISOString().slice(0, 10) ?? null

describe('wochenStart: der Montag aus dem Seitennamen', () => {
  it('eine Woche innerhalb eines Monats', () => {
    expect(iso(wochenStart(`${PFAD}9-15-November-2026/`))).toBe('2026-11-09')
  })

  it('eine Woche über den Monatswechsel', () => {
    expect(iso(wochenStart(`${PFAD}30-November-6-Dezember-2026/`))).toBe('2026-11-30')
  })

  it('eine Woche über den Jahreswechsel — bis zum 14.10.2026 übersprungen', () => {
    // Beide Enden tragen hier ihr Jahr. Die Form war unbekannt: Die Woche fiel
    // aus der Wochenliste, und ein Import nach dem 21. Dezember sprang still
    // zum 4. Januar.
    expect(iso(wochenStart(`${PFAD}28-Dezember-2026-3-Januar-2027/`))).toBe('2026-12-28')
    expect(iso(wochenStart(`${PFAD}29-Dezember-2025-4-Januar-2026/`))).toBe('2025-12-29')
  })

  it('der Umlaut im Monat, roh oder prozentkodiert', () => {
    expect(iso(wochenStart(`${PFAD}23-29-M%C3%A4rz-2026/`))).toBe('2026-03-23')
    expect(iso(wochenStart(`${PFAD}23-29-März-2026`))).toBe('2026-03-23')
  })

  it('was keine Woche ist, ergibt null — auch eine kaputte Prozent-Folge', () => {
    expect(wochenStart('/de/bibliothek/jw-arbeitsheft/november-dezember-2026-mwb/')).toBeNull()
    expect(wochenStart(`${PFAD}9-15-Brumaire-2026/`)).toBeNull()
    expect(wochenStart(`${PFAD}9-15-%E0%A4%A-2026/`)).toBeNull()
  })
})
