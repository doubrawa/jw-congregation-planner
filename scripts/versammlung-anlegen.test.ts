import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { argumente } from './gemeinsam.mjs'
import {
  planerBereiche,
  STANDARD_DIENSTE as SKRIPT_DIENSTE,
  zeitSpalten,
} from './versammlung-anlegen.mjs'
import { STANDARD_DIENSTE } from '../src/data/vorgaben'

/**
 * Das Anlege-Skript läuft außerhalb der App, mit dem Service-Role-Key, und
 * schreibt in eine leere Datenbank. Es wird selten aufgerufen und ist genau
 * deshalb prüfenswert: Ein Fehler darin fällt erst auf, wenn jemand eine neue
 * Versammlung einrichtet — und dann steht er da.
 *
 * Der Netzteil (`main`) bleibt ungeprüft; geprüft ist alles, was **entscheidet**:
 * die Dienste-Liste, die Bereiche des Planers
 * und das Einlesen der Argumente.
 */

describe('Die Dienste des Skripts sind die der App', () => {
  /*
    Node kann `src/data/vorgaben.ts` nicht laden, deshalb steht die Liste im
    Skript ein zweites Mal. Zwei Quellen für dieselbe Aussage laufen
    auseinander, sobald eine gepflegt wird und die andere nicht — es sei denn,
    ein Test hält sie zusammen. Genau dafür ist dieser da.
  */
  it('Schlüssel, Namen, Plätze und Gruppen-Rotation stimmen überein', () => {
    expect(SKRIPT_DIENSTE).toEqual(STANDARD_DIENSTE)
  })

  it('und der Zoom-Ordner ist dabei', () => {
    expect(SKRIPT_DIENSTE.map((d: { key: string }) => d.key)).toContain('zoom')
  })
})

describe('Bereiche des ersten Planers', () => {
  it('deckt die festen Programm-Bereiche ab', () => {
    const p = planerBereiche()
    for (const k of ['vorsitzMid', 'vorsitzWe', 'gebet', 'vortrag', 'studium', 'leser', 'bibellesung']) {
      expect(p[k]).toBe(true)
    }
  })

  it('und jeden Bereich, den der Import an einen Platz schreibt', () => {
    /*
     * Die Liste oben ist von Hand gepflegt — und eine neue Platzart vergäße
     * sie. So geschehen am 4.10.2026: `besprechung` und `schulungVortrag` kamen
     * in den Import, der erste Planer einer neuen Versammlung hätte beide
     * nicht gehabt. Deshalb wird hier der Importer gefragt, wie in der
     * Vollständigkeitsprobe der Testversammlung.
     */
    const quelle = fs.readFileSync(new URL('../supabase/functions/import-week/parse.ts', import.meta.url), 'utf8')
    const keys = new Set([...quelle.matchAll(/bereichsKey: '([^']+)'/g)].map((m) => m[1]))
    expect(keys.size).toBeGreaterThan(5)
    const p = planerBereiche()
    for (const key of keys) expect(`${key}: ${p[key as keyof typeof p]}`).toBe(`${key}: true`)
  })

  it('und jeden Hilfsdienst über seinen eigenen Schlüssel', () => {
    // `svc:<key>` — dieselbe Form wie `serviceQualKey` in der App.
    const p = planerBereiche()
    for (const d of STANDARD_DIENSTE) expect(p[`svc:${d.key}`]).toBe(true)
  })
})

describe('Argumente', () => {
  it('liest Paare und Flaggen', () => {
    expect(argumente(['--name', 'Musterstadt', '--trocken', '--saal', 'Weg 1'])).toEqual({
      name: 'Musterstadt',
      trocken: true,
      saal: 'Weg 1',
    })
  })

  it('eine Flagge am Ende bleibt eine Flagge', () => {
    expect(argumente(['--name', 'X', '--trocken'])).toEqual({ name: 'X', trocken: true })
  })

  it('freistehende Wörter ohne `--` werden übergangen', () => {
    expect(argumente(['abc', '--name', 'X'])).toEqual({ name: 'X' })
  })
})

/**
 * **Der Regeltermin — abgewiesen, bevor er in die Datenbank geht.**
 *
 * Eine Versammlung, die am falschen Tag zusammenkommt, merkt es erst an der
 * ersten Erinnerung. Deshalb bricht das Skript lieber ab, als eine Zeit zu
 * erfinden — nur prüfte es bis dahin allein die Ziffernform: `25:99` kam
 * durch, und der Abbruch kam dann aus PostgreSQL, in einer Meldung, in der der
 * Schalter gar nicht vorkommt.
 */
describe('zeitSpalten', () => {
  it('macht aus „2 19:00" die beiden Spalten', () => {
    expect(zeitSpalten('mid', '2 19:00')).toEqual({ mid_wd: 2, mid_time: '19:00' })
    expect(zeitSpalten('we', '0 10:00')).toEqual({ we_wd: 0, we_time: '10:00' })
  })

  it('füllt die Stunde auf zwei Stellen — „0 9:30" ist 09:30', () => {
    expect(zeitSpalten('we', '0 9:30')).toEqual({ we_wd: 0, we_time: '09:30' })
  })

  it.each([
    ['Stunde zu groß', '2 25:00'],
    ['Minute zu groß', '2 19:99'],
    ['beides', '2 25:99'],
  ])('%s wird abgewiesen, statt an die Datenbank zu gehen', (_name, wert) => {
    expect(() => zeitSpalten('mid', wert)).toThrow(/keine Uhrzeit/)
  })

  it.each([
    ['Wochentag zu groß', '7 19:00'],
    ['kein Wochentag', 'Di 19:00'],
    ['ohne Uhrzeit', '2'],
    ['leer', ''],
  ])('%s wird ebenfalls abgewiesen', (_name, wert) => {
    expect(() => zeitSpalten('mid', wert)).toThrow(/erwartet/)
  })

  it('die Meldung nennt den Schalter, um den es geht', () => {
    expect(() => zeitSpalten('we', '2 25:00')).toThrow(/--we/)
  })
})
