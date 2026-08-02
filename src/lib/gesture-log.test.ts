/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gestenEintraege, gestenLoeschen, gestenLog, gestenProtokollText, gestenStart } from './gesture-log'

afterEach(() => {
  gestenLoeschen()
  vi.unstubAllGlobals()
})

describe('gestenLog', () => {
  it('hält den Ablauf in der Reihenfolge fest', () => {
    gestenStart('start', { x: 300 })
    gestenLog('touchend', { dx: -150 })
    expect(gestenEintraege().map((e) => e.was)).toEqual(['start', 'touchend'])
    expect(gestenEintraege()[0].daten).toEqual({ x: 300 })
  })

  it('läuft nicht voll — alte Einträge fallen hinten heraus', () => {
    // Ein Ringpuffer, kein Speicherleck: die Geste soll nichts kosten.
    for (let i = 0; i < 200; i++) gestenLog(`e${i}`)
    const alle = gestenEintraege()
    expect(alle.length).toBeLessThanOrEqual(40)
    expect(alle[alle.length - 1].was).toBe('e199')
  })

  it('rechnet die Zeit ab dem Beginn der Geste', () => {
    // Sonst stünden dort Millisekunden seit dem Seitenaufruf — unbrauchbar.
    let jetzt = 1000
    vi.stubGlobal('performance', { now: () => jetzt })
    gestenStart('start')
    jetzt = 1120
    gestenLog('touchend')
    expect(gestenEintraege().map((e) => e.t)).toEqual([0, 120])
  })

  it('Text enthält Build, Umgebung und die Einträge', () => {
    gestenStart('start', { x: 1 })
    const text = gestenProtokollText()
    expect(text).toContain('Build')
    expect(text).toContain('Fenster')
    expect(text).toContain('Modus')
    expect(text).toContain('start')
  })

  it('ohne Aufzeichnung ein verständlicher Hinweis statt leerer Fläche', () => {
    expect(gestenProtokollText()).toContain('einmal wischen')
  })

  it('Leeren räumt wirklich ab', () => {
    gestenLog('start')
    gestenLoeschen()
    expect(gestenEintraege()).toHaveLength(0)
  })
})
