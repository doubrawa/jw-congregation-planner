/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { darstellungSpiegeln, startbildMelden } from './darstellung'

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

/*
 * **Die Statusleiste, solange das Startbild steht** (19.10.2026). In der
 * installierten App trägt sie dessen Graphit, wie schon das Bild von Android
 * davor; danach den Grund der Darstellung. Welche Farbe gilt, entscheidet das
 * CSS (`--statusleiste` in tokens.css) — jsdom rechnet kein CSS, deshalb setzt
 * die Probe die Werte selbst, wie das CSS sie in der installierten App setzte.
 */
describe('Die Statusleiste und das Startbild', () => {
  const wurzel = document.documentElement
  let meta: HTMLMetaElement
  afterEach(() => {
    meta.remove()
    wurzel.style.removeProperty('--grund')
    wurzel.style.removeProperty('--statusleiste')
    delete wurzel.dataset.startbild
  })
  /** Eine Statusleiste und die Farben, die das CSS in der installierten App setzte. */
  const leiste = (): void => {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.append(meta)
    wurzel.style.setProperty('--grund', '#f1f1ef')
  }

  it('steht das Startbild, ist es markiert, und die Leiste nimmt seine Farbe', () => {
    leiste()
    wurzel.style.setProperty('--statusleiste', '#1c1e20')
    startbildMelden(true)
    expect(wurzel.dataset.startbild).toBe('')
    expect(meta.content).toBe('#1c1e20')
  })

  it('geht es, verschwindet die Markierung, und die Leiste nimmt wieder den Grund', () => {
    leiste()
    startbildMelden(true)
    wurzel.style.setProperty('--statusleiste', '#f1f1ef')
    startbildMelden(false)
    expect(wurzel.dataset.startbild).toBeUndefined()
    expect(meta.content).toBe('#f1f1ef')
  })

  it('auch ein Wechsel der Darstellung, während es steht, lässt der Leiste seine Farbe', () => {
    leiste()
    wurzel.style.setProperty('--statusleiste', '#1c1e20')
    startbildMelden(true)
    darstellungSpiegeln('hell')
    expect(meta.content).toBe('#1c1e20')
  })
})
