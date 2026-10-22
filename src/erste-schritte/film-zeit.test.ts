import { describe, expect, it } from 'vitest'
import { GESAMT, SZENEN, eio, eo, eob, seg, standbildZeit, szeneBei, szenenBeginn } from './film-zeit'

/**
 * **Der Takt des Films „Erste Schritte"** (22.10.2026).
 *
 * Der Film erzählt eine Geschichte in einer festen Reihenfolge: Erst der Link
 * aus der E-Mail, dann die Aufgabe bestätigen, dann die App aufs Handy, zuletzt
 * die Erinnerungen — so, wie ein neuer Verkündiger es tatsächlich erlebt. Eine
 * vertauschte Szene erzählte etwas Falsches (bestätigen, bevor man angemeldet
 * ist). Und weil jede Szene eine reine Funktion ihrer Zeit ist, muss jeder
 * Zeitpunkt des Films genau einer Szene gehören.
 */

describe('Die Szenen', () => {
  it('kommen in der Reihenfolge, in der man die App kennenlernt', () => {
    expect(SZENEN.map((s) => s.id)).toEqual(['punkte', 'link', 'aufgabe', 'installieren', 'erinnern', 'ende'])
  })

  it('dauern zusammen eine halbe Minute — wie der Clip, den der Betreiber abgenommen hat', () => {
    expect(GESAMT).toBe(30)
  })

  it('jedes Standbild liegt in seiner Szene — ohne Bewegung zeigt „Weiter" sonst die falsche', () => {
    SZENEN.forEach((szene, i) => {
      expect(szene.standbild, szene.id).toBeGreaterThan(0)
      expect(szene.standbild, szene.id).toBeLessThanOrEqual(szene.dauer)
      expect(szeneBei(standbildZeit(i)).index, szene.id).toBe(i)
    })
  })
})

describe('Welche Szene zu welcher Zeit', () => {
  it('jeder Anfang gehört der neuen Szene, nicht dem Ende der alten', () => {
    SZENEN.forEach((_, i) => {
      expect(szeneBei(szenenBeginn(i))).toEqual({ index: i, t: 0 })
      if (i > 0) expect(szeneBei(szenenBeginn(i) - 0.001).index).toBe(i - 1)
    })
  })

  it('vor dem Anfang steht die erste, nach dem Ende die letzte in ihrem Schlussbild', () => {
    expect(szeneBei(-5)).toEqual({ index: 0, t: 0 })
    const letzte = SZENEN.length - 1
    expect(szeneBei(GESAMT + 10)).toEqual({ index: letzte, t: SZENEN[letzte]?.dauer })
  })
})

describe('Die Kurven', () => {
  it('beginnen bei 0 und enden bei 1 — sonst spränge ein Bild am Anfang oder Ende einer Bewegung', () => {
    for (const kurve of [eo, eio, (p: number) => eob(p)]) {
      expect(kurve(0)).toBeCloseTo(0)
      expect(kurve(1)).toBeCloseTo(1)
    }
  })

  it('der Schwung geht über das Ziel hinaus und kehrt zurück — die anderen nie', () => {
    const werte = Array.from({ length: 101 }, (_, i) => i / 100)
    expect(Math.max(...werte.map((p) => eob(p)))).toBeGreaterThan(1)
    expect(Math.max(...werte.map(eo))).toBeLessThanOrEqual(1)
    expect(Math.max(...werte.map(eio))).toBeLessThanOrEqual(1)
  })

  it('der Abschnitt einer Bewegung: davor 0, danach 1, dazwischen der Anteil', () => {
    expect(seg(0.5, 1, 2)).toBe(0)
    expect(seg(1.5, 1, 2)).toBe(0.5)
    expect(seg(3, 1, 2)).toBe(1)
  })
})
