import { describe, expect, it } from 'vitest'
import {
  argumente,
  CODE_ALPHABET,
  einladungscode,
  planerBereiche,
  STANDARD_DIENSTE as SKRIPT_DIENSTE,
} from './versammlung-anlegen.mjs'
import { STANDARD_DIENSTE } from '../src/data/vorgaben'

/**
 * Das Anlege-Skript läuft außerhalb der App, mit dem Service-Role-Key, und
 * schreibt in eine leere Datenbank. Es wird selten aufgerufen und ist genau
 * deshalb prüfenswert: Ein Fehler darin fällt erst auf, wenn jemand eine neue
 * Versammlung einrichtet — und dann steht er da.
 *
 * Der Netzteil (`main`) bleibt ungeprüft; geprüft ist alles, was **entscheidet**:
 * die Dienste-Liste, das Alphabet des Einladungscodes, die Bereiche des Planers
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

describe('Einladungscode', () => {
  it('sechs Zeichen aus dem Alphabet', () => {
    const code = einladungscode()
    expect(code).toHaveLength(6)
    expect([...code].every((z) => CODE_ALPHABET.includes(z))).toBe(true)
  })

  /*
    Der Code wird vorgelesen und abgetippt. Zeichen, die sich dabei
    verwechseln lassen, sind ein Fehler im Alphabet und nicht beim Nutzer —
    deshalb fehlen sie: 0/O, 1/I/L, 5/S, 8/B.
  */
  it('enthält keine verwechselbaren Zeichen', () => {
    for (const z of ['0', 'O', '1', 'I', 'L', '5', 'S', '8', 'B']) {
      expect(CODE_ALPHABET).not.toContain(z)
    }
  })

  /*
    Kein Zeichen doppelt. Ein Duplikat fällt niemandem auf — der Code sieht
    gleich aus —, macht das Alphabet aber kleiner, als es dasteht, und
    verschiebt die Verteilung zugunsten des doppelten Zeichens. Beim Schreiben
    dieses Tests stand hier tatsächlich eine `3` zweimal.
  */
  it('enthält kein Zeichen doppelt', () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length)
  })

  it('erreicht jedes Zeichen des Alphabets', () => {
    // Über den Index gezogen statt über eine Bruchzahl: `i / len * len` ist in
    // Gleitkomma nicht zuverlässig `i` — mit Bruchzahlen fiele hier je nach
    // Rundung ein Zeichen aus, und der Test meldete einen Fehler, den es nicht
    // gibt.
    const gesehen = new Set<string>()
    for (let i = 0; i < CODE_ALPHABET.length; i++) {
      gesehen.add(einladungscode(() => (i + 0.5) / CODE_ALPHABET.length)[0]!)
    }
    expect(gesehen.size).toBe(CODE_ALPHABET.length)
  })
})

describe('Bereiche des ersten Planers', () => {
  it('deckt die festen Programm-Bereiche ab', () => {
    const p = planerBereiche()
    for (const k of ['vorsitzMid', 'vorsitzWe', 'gebet', 'vortrag', 'studium', 'leser', 'bibellesung']) {
      expect(p[k]).toBe(true)
    }
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
