import { describe, expect, it } from 'vitest'
import {
  meetingDayOffsets as edgeOffsets,
  personDisplayName as edgeName,
  SKIP_ROLE as EDGE_SKIP,
  taskDateText as edgeDate,
  WEEKDAY_OFFSET as EDGE_WEEKDAY,
} from '../../supabase/functions/_shared/planung.ts'
import { displayName } from './helpers'
import { meetingDayOffsets } from './meeting-dates'
import { isGuestRole } from './planning'
import { emptyQualifications } from './helpers'
import type { Person } from './types'

/**
 * Client und Edge Functions rechnen gleich — geprüft, nicht angenommen.
 *
 * Dieselben Regeln lagen in bis zu drei Fassungen nebeneinander:
 * `meetingDayOffsets` dreimal, `displayName` und `taskDate` je zweimal,
 * `SKIP_ROLE` zweimal. Daraus entstand **B8**: `send-reminders` rechnete mit
 * dem Array-Index, `substitute` mit `position` — jede Seite für sich stimmig,
 * zusammen falsch. Genau solche Fehler sieht niemand beim Lesen einer Datei.
 *
 * Die geteilte Fassung liegt in `supabase/functions/_shared/planung.ts`. Dieser
 * Test bindet **beide** Seiten ein und vergleicht sie an denselben Eingaben.
 * Läuft eine davon weg, fällt es hier auf statt im Betrieb.
 */

const person = (fn: string, ln: string, dn?: string): Person => ({
  id: 'p', fn, ln, dn, role: 'verkuendiger', tel: '', mail: '', priv: emptyQualifications(),
})

describe('Anzeigename', () => {
  const faelle: Array<[string, string, string | undefined]> = [
    ['Anna', 'Beispiel', undefined],
    ['Anna', 'Beispiel', 'A. Beispiel'],
    ['', 'Beispiel', undefined], // nur Nachname → kein führendes Leerzeichen
    ['Anna', '', undefined],
    ['', '', undefined], // gar nichts → leer, nicht " "
    ['Jürgen', 'Doubrawa', ''], // leerer dn zählt nicht als gesetzt
  ]

  it.each(faelle)('„%s %s" (dn: %s) gleich auf beiden Seiten', (fn, ln, dn) => {
    expect(edgeName(fn, ln, dn)).toBe(displayName(person(fn, ln, dn)))
  })
})

describe('Wochentage der Zusammenkünfte', () => {
  const faelle = [
    'Di 19:00 · So 10:00',
    'Mi 19:30 · Sa 17:00',
    'Mo 18:00 · So 09:00',
    '', // ohne Angabe → Di/So
    '19:00 · 10:00', // Zeiten ohne Kürzel → Di/So
    'Donnerstag 19:00 · Sonntag 10:00', // ausgeschrieben, kein Kürzel-Treffer
    'Fr 19:00', // nur eine Angabe → zweite fällt zurück
  ]

  it.each(faelle)('„%s" ergibt beidseitig dieselben Versätze', (zeiten) => {
    expect(edgeOffsets(zeiten)).toEqual(meetingDayOffsets(zeiten))
  })
})

describe('Externe Rollen', () => {
  const rollen = [
    'Gastredner',
    'Gastredner · Vers. Nordheim',
    'Kreisaufseher',
    'Redner', // eigener Redner (T29) — ausdrücklich NICHT extern
    'Vorsitz',
    'Gebet',
    'Leser',
    '',
    'Gesprächspartner',
  ]

  it.each(rollen)('„%s" wird beidseitig gleich eingeordnet', (rolle) => {
    expect(EDGE_SKIP.test(rolle)).toBe(isGuestRole(rolle))
  })

  it('der eigene Redner bekommt auch in den Edge Functions eine Erinnerung', () => {
    // Er wird dort nicht gesondert behandelt — er fällt schlicht nicht unter
    // SKIP_ROLE. Genau darauf beruht T29: eine Rolle, kein Sonderweg. Wäre
    // „Redner" versehentlich in den Ausdruck geraten, bliebe der eigene Redner
    // stumm, obwohl die App ihm eine Bestätigung abverlangt.
    expect(EDGE_SKIP.test('Redner')).toBe(false)
  })
})

describe('Termin aus dem date-Feld', () => {
  it('schneidet den Ort ab, lässt Tag und Uhrzeit stehen', () => {
    expect(edgeDate('Dienstag, 8. September · 19:00 · Königreichssaal')).toBe(
      'Dienstag, 8. September · 19:00',
    )
    expect(edgeDate('Dienstag, 8. September · 19:00')).toBe('Dienstag, 8. September · 19:00')
    // Importierte Wochen tragen hier nur die Wochenspanne — die bleibt stehen.
    expect(edgeDate('7.–13. September')).toBe('7.–13. September')
    expect(edgeDate(undefined)).toBe('')
  })
})

describe('Ausgeschriebene Wochentage', () => {
  it('deckt beide Schreibweisen des Samstags ab', () => {
    // Ältere Datensätze tragen „Sonnabend"; fehlte er, fiele der Termin auf
    // den Rhythmus aus den Einstellungen zurück — stumm und um Tage daneben.
    expect(EDGE_WEEKDAY.Samstag).toBe(5)
    expect(EDGE_WEEKDAY.Sonnabend).toBe(5)
  })

  it('Montag ist 0 und Sonntag 6 — die Woche beginnt am Montag', () => {
    expect(EDGE_WEEKDAY.Montag).toBe(0)
    expect(EDGE_WEEKDAY.Sonntag).toBe(6)
  })
})
