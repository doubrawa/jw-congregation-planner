import { describe, expect, it } from 'vitest'
import {
  istAusgefallenFuer as edgeAusgefallen,
  meetingDayOffsets as edgeOffsets,
  personDisplayName as edgeName,
  SKIP_ROLE as EDGE_SKIP,
  taskDateText as edgeDate,
  versatzMitAbweichung as edgeVersatz,
  WEEKDAY_OFFSET as EDGE_WEEKDAY,
  zeitMitAbweichung as edgeZeit,
  zuteilungsLabel as edgeLabel,
} from '../../supabase/functions/_shared/planung.ts'
import { displayName, istAusgefallen, zuteilungsLabel } from './helpers'
import { meetingDayOffsets, meetingOffset, meetingTime } from './meeting-dates'
import { isGuestRole } from './planning'
import { emptyQualifications } from './helpers'
import type { Abweichung, Person, Week } from './types'

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
    ['Jörg', 'Grünwald', ''], // leerer dn zählt nicht als gesetzt
  ]

  it.each(faelle)('„%s %s" (dn: %s) gleich auf beiden Seiten', (fn, ln, dn) => {
    expect(edgeName(fn, ln, dn)).toBe(displayName(person(fn, ln, dn)))
  })
})

describe('Beschriftung einer Zuteilung', () => {
  const faelle: Array<[string, string, string | undefined]> = [
    ['ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Vorsitz'],
    ['ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Gebet'],
    ['ABSCHLUSS', 'Schlussworte · Lied 24 · Gebet', 'Gebet'],
    ['UNSER LEBEN ALS CHRIST', 'Versammlungsbibelstudium', 'Leiter'],
    ['UNS IM DIENST VERBESSERN', 'Gespräche beginnen', 'Gesprächspartner'],
    ['UNS IM DIENST VERBESSERN', 'Gespräche beginnen', 'mit A. Hoffmann'], // Begleiter
    ['SCHÄTZE AUS GOTTES WORT', 'Bibellesung · Jer 44:24-30', ''],
    ['SCHÄTZE AUS GOTTES WORT', 'Bibellesung · Jer 44:24-30', undefined],
    ['', 'Zuteilung', 'Leser'], // Abschnitt ohne Überschrift
  ]

  it.each(faelle)('„%s" / „%s" / Rolle „%s" gleich auf beiden Seiten', (label, titel, rolle) => {
    expect(edgeLabel(label, titel, rolle)).toBe(zuteilungsLabel(label, titel, rolle))
  })

  it('nennt in ERÖFFNUNG weder Lied noch Einleitende Worte', () => {
    const text = zuteilungsLabel('ERÖFFNUNG', 'Lied 27 · Gebet · Einleitende Worte', 'Vorsitz')
    expect(text).toBe('Vorsitz')
    expect(text).not.toContain('Lied')
    expect(text).not.toContain('Einleitende Worte')
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

describe('Sonderwochen: Verlegung und Ausfall (T30)', () => {
  /*
    Eine verlegte Woche verschiebt **auch die Erinnerungen**. `send-reminders`
    rechnete mit dem regulären Wochentag aus den Einstellungen — die Erinnerung
    nannte dann einen Abend, an dem niemand kommt. Und ein Ausfall darf gar
    nicht erst erinnern.

    Beide Seiten müssen dieselbe Rangfolge anwenden:
    Abweichung → eigener Termin im `date`-Feld → Einstellungen.
  */
  const faelle: Array<[string, Abweichung | undefined, string, number, string]> = [
    ['ohne Abweichung, Wochenspanne', undefined, '7.–13. September', 1, '19:00'],
    ['ohne Abweichung, eigener Termin', undefined, 'Samstag, 3. Oktober · 19:30', 5, '19:30'],
    ['nur Tag verlegt', { day: 'Donnerstag' }, '7.–13. September', 3, '19:00'],
    ['nur Uhrzeit verlegt', { time: '18:30' }, '7.–13. September', 1, '18:30'],
    ['Tag und Uhrzeit verlegt', { day: 'Freitag', time: '17:00' }, '7.–13. September', 4, '17:00'],
    // Der wichtigste Fall: das `date`-Feld nennt noch den alten Termin.
    ['Abweichung schlägt den eigenen Termin', { day: 'Montag', time: '20:00' }, 'Samstag, 3. Oktober · 19:30', 0, '20:00'],
    ['Ausfall ohne Verlegung ändert den Tag nicht', { cancelled: true }, '7.–13. September', 1, '19:00'],
    ['unbekannter Wochentag fällt zurück', { day: 'Nichttag' }, '7.–13. September', 1, '19:00'],
  ]

  const woche = (dev: Abweichung | undefined, date: string): Week => ({
    range: '', book: '', start: '2026-09-07', current: false,
    mid: { date, end: '', sections: [], helpers: {} },
    we: { date: '', end: '', sections: [], helpers: {} },
    dev: dev ? { mid: dev } : undefined,
  })

  it.each(faelle)('%s', (_name, dev, date, tag, zeit) => {
    const w = woche(dev, date)
    const zeiten = 'Di 19:00 · So 10:00'
    // Client
    expect(meetingOffset(w, 'mid', zeiten)).toBe(tag)
    expect(meetingTime(w, 'mid', zeiten)).toBe(zeit)
    // Edge — dieselben Eingaben, eigene Fassung
    expect(edgeVersatz(w.dev, 'mid', date, 1)).toBe(tag)
    expect(edgeZeit(w.dev, 'mid', date, '19:00')).toBe(zeit)
  })

  it('„entfällt" heißt auf beiden Seiten dasselbe', () => {
    const aus = woche({ cancelled: true }, '7.–13. September')
    expect(istAusgefallen(aus, 'mid')).toBe(true)
    expect(edgeAusgefallen(aus.dev, 'mid')).toBe(true)
    // Die andere Zusammenkunft ist davon unberührt.
    expect(istAusgefallen(aus, 'we')).toBe(false)
    expect(edgeAusgefallen(aus.dev, 'we')).toBe(false)
  })

  it('die Gedächtnismahl-Woche ist KEIN Ausfall — beidseitig', () => {
    // `memCancel` sieht aus wie ein Ausfall, ist aber eine Ersetzung: der Tab
    // zeigt dann das Mahl, und das hat eigene Zuteilungen. Als Ausfall gelesen,
    // fielen genau diese aus Auslastung, Aufgaben und Erinnerungen heraus.
    const mahl: Week = { ...woche(undefined, '7.–13. September'), mem: true, memCancel: 'we' }
    expect(istAusgefallen(mahl, 'we')).toBe(false)
    expect(edgeAusgefallen(mahl.dev, 'we')).toBe(false)
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
