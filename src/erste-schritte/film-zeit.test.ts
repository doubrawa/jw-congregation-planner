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

  it('bewegen sich so lange wie der Clip — eine halbe Minute; dazu kommen die Halte zum Lesen', () => {
    // Der Betreiber nahm den Clip ab („sieht super aus") und fand den Film in
    // der App dann „etwas zu schnell": Die Bewegung blieb, die Zeit zum Lesen
    // kam dazu (22.10.2026).
    expect(SZENEN.reduce((summe, s) => summe + s.dauer, 0)).toBe(30)
    const halte = SZENEN.flatMap((s) => s.halte as ReadonlyArray<readonly [number, number]>)
    expect(GESAMT).toBeCloseTo(30 + halte.reduce((summe, [, dauer]) => summe + dauer, 0))
    expect(GESAMT).toBeGreaterThan(40)
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

describe('Die Halte zum Lesen', () => {
  it('die Zeit einer Szene geht nie zurück und springt nie — auch nicht an einem Halt', () => {
    SZENEN.forEach((szene, i) => {
      const beginn = szenenBeginn(i)
      const ende = i + 1 < SZENEN.length ? szenenBeginn(i + 1) : GESAMT
      let vorher = szeneBei(beginn).t
      // In Schritten von 0,05 s durch die Szene.
      for (let k = 1; beginn + k * 0.05 < ende - 1e-9; k++) {
        const f = beginn + k * 0.05
        const { index, t } = szeneBei(f)
        expect(index, `${szene.id} bei ${f.toFixed(2)} s`).toBe(i)
        expect(t, `${szene.id} bei ${f.toFixed(2)} s`).toBeGreaterThanOrEqual(vorher - 1e-9)
        expect(t - vorher, `${szene.id} bei ${f.toFixed(2)} s`).toBeLessThanOrEqual(0.05 + 1e-9)
        vorher = t
      }
    })
  })

  it('in einem Halt steht die Szene still, so lange er dauert — davor und danach läuft sie', () => {
    SZENEN.forEach((szene, i) => {
      let davor = 0
      for (const [bei, dauer] of szene.halte as ReadonlyArray<readonly [number, number]>) {
        // Im Film beginnt der Halt nach der Bewegung bis `bei` und den Halten davor.
        const ab = szenenBeginn(i) + bei + davor
        expect(szeneBei(ab - 0.05).t, `${szene.id} vor ${bei}`).toBeCloseTo(bei - 0.05, 9)
        expect(szeneBei(ab + dauer / 2).t, `${szene.id} in ${bei}`).toBeCloseTo(bei, 9)
        expect(szeneBei(ab + dauer - 1e-6).t, `${szene.id} am Ende von ${bei}`).toBeCloseTo(bei, 5)
        expect(szeneBei(ab + dauer + 0.05).t, `${szene.id} nach ${bei}`).toBeCloseTo(bei + 0.05, 9)
        davor += dauer
      }
    })
  })

  it('jeder Halt liegt mitten in seiner Szene, einer nach dem anderen', () => {
    for (const szene of SZENEN) {
      let zuvor = 0
      for (const [bei, dauer] of szene.halte as ReadonlyArray<readonly [number, number]>) {
        expect(bei, szene.id).toBeGreaterThan(zuvor)
        expect(bei, szene.id).toBeLessThan(szene.dauer)
        expect(dauer, szene.id).toBeGreaterThan(0)
        zuvor = bei
      }
    }
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
