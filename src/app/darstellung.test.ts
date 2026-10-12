/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { darstellungSpiegeln } from './darstellung'

/**
 * **Die Darstellung auf `<html>`** (T121): Hell und Dunkel gelten fest,
 * „Automatisch" folgt dem Gerät — auch, wenn es umschaltet, während die App
 * offen ist (abends wird das Handy dunkel). Das CSS liest allein `data-theme`.
 */

/** Ein Gerät, das umschalten kann — `matchMedia` gibt es in jsdom nicht. */
function geraet(dunkel: boolean) {
  const hoerer = new Set<() => void>()
  const abfrage = {
    matches: dunkel,
    addEventListener: (_art: string, fn: () => void) => hoerer.add(fn),
    removeEventListener: (_art: string, fn: () => void) => hoerer.delete(fn),
  }
  window.matchMedia = (() => abfrage) as unknown as typeof window.matchMedia
  return {
    hoerer,
    umschalten(neu: boolean) {
      abfrage.matches = neu
      for (const fn of hoerer) fn()
    },
  }
}

const palette = () => document.documentElement.dataset.theme

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia')
  document.documentElement.removeAttribute('data-theme')
})

describe('Die Darstellung auf <html>', () => {
  it('Hell und Dunkel gelten fest, gleich wie das Gerät steht', () => {
    geraet(true)
    darstellungSpiegeln('hell')
    expect(palette()).toBe('hell')
    geraet(false)
    darstellungSpiegeln('dunkel')
    expect(palette()).toBe('dunkel')
  })

  it('„Automatisch" nimmt die Palette des Geräts und schaltet mit ihm um', () => {
    const g = geraet(false)
    const abmelden = darstellungSpiegeln('auto')
    expect(palette()).toBe('hell')
    g.umschalten(true)
    expect(palette()).toBe('dunkel')
    // Abgemeldet (andere Wahl im Profil): Das Gerät schaltet nichts mehr um.
    abmelden()
    g.umschalten(false)
    expect(palette()).toBe('dunkel')
    expect(g.hoerer.size).toBe(0)
  })

  it('nur „Automatisch" horcht am Gerät', () => {
    const g = geraet(false)
    darstellungSpiegeln('dunkel')
    darstellungSpiegeln('hell')
    expect(g.hoerer.size).toBe(0)
  })

  it('ohne matchMedia gilt bei „Automatisch" Hell', () => {
    darstellungSpiegeln('auto')
    expect(palette()).toBe('hell')
  })

  it('die Statusleiste der installierten App nimmt den Grund der Palette', () => {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    document.documentElement.style.setProperty('--grund', '#121314')
    darstellungSpiegeln('dunkel')
    expect(meta.content).toBe('#121314')
    meta.remove()
    document.documentElement.style.removeProperty('--grund')
  })
})
