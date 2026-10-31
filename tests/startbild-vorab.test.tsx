/** @vitest-environment happy-dom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../src/app/context'
import { Startbild } from '../src/app/Startbild'
import { DE } from '../src/i18n/de'
import { demoZustand } from './testdaten/demo-start'

/**
 * **Das Startbild steht schon da, bevor das Skript geladen ist** (19.10.2026).
 *
 * Android zeigt beim Start der installierten App das Logo auf Graphit. Danach
 * stand bis dahin eine leere Fläche, bis das Skript lief, und erst dann das
 * Startbild der App. `index.html` zeichnet es deshalb selbst, im ersten Bild —
 * und React löst es ab, sobald es läuft (`Startbild.tsx`).
 *
 * Damit dabei nichts springt, muss das Logo hier **dasselbe** sein wie dort:
 * dieselbe Größe, dieselben Plätze, die leeren darunter, dieselbe Deckkraft je
 * Reihe, dieselben Klassen (über sie kommen Farben und das Füllen aus dem CSS).
 * Zwei Abschriften derselben Form laufen sonst auseinander, und erst ein Handy
 * zeigt es.
 */

// Über das Arbeitsverzeichnis: Unter jsdom ist `import.meta.url` keine Datei-Adresse.
const INDEX = readFileSync(join(process.cwd(), 'index.html'), 'utf8')

function Buehne({ children }: { children: ReactNode }) {
  const state: AppState = demoZustand()
  const store = useStaticStore(state)
  return (
    <AppDispatchContext.Provider value={() => {}}>
      <AppStoreContext.Provider value={store}>
        <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>
      </AppStoreContext.Provider>
    </AppDispatchContext.Provider>
  )
}

/** Ein Knoten ohne die Zeilenumbrüche zwischen den Tags — die schreibt nur `index.html`. */
function ohneLeerraum<T extends Node>(knoten: T): T {
  const kopie = knoten.cloneNode(true) as T
  const gang = document.createTreeWalker(kopie, NodeFilter.SHOW_TEXT)
  const leer: Node[] = []
  for (let n = gang.nextNode(); n; n = gang.nextNode()) if (!n.nodeValue?.trim()) leer.push(n)
  for (const n of leer) n.parentNode?.removeChild(n)
  return kopie
}

/** Das Startbild aus `index.html`, wie der Browser es beim ersten Bild liest. */
function vorab(): Element | null {
  return new DOMParser().parseFromString(INDEX, 'text/html').querySelector('#root > .startbild')
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Das Startbild in index.html', () => {
  it('steht als einziges in der Wurzel der App — React ersetzt es beim ersten Zeichnen', () => {
    const wurzel = new DOMParser().parseFromString(INDEX, 'text/html').querySelector('#root')
    // Ohne `startbild-fuellen`: Bis React übernimmt, steht es still wie das
    // Bild von Android. Füllte es sich schon hier, begänne es beim Wechsel mit
    // einem Ruck von vorn.
    expect([...(wurzel?.children ?? [])].map((k) => k.className)).toEqual(['startbild'])
  })

  it('in der App füllen sich die Plätze erst nach einer halben Sekunde — bis dahin steht das Logo wie aus index.html', () => {
    // Ist die App vorher da, bewegt sich nichts. Und erst mit der Klasse hängt
    // die Animation am Logo: Schon während einer Verzögerung im CSS glättete
    // Chrome die Ränder anders, und beim Wechsel zuckten die Kanten.
    vi.useFakeTimers()
    const { container } = render(<Buehne><Startbild /></Buehne>)
    const bild = () => container.querySelector('.startbild')
    expect(bild()?.className, 'beim ersten Zeichnen').toBe('startbild')
    act(() => vi.advanceTimersByTime(499))
    expect(bild()?.classList.contains('startbild-fuellen'), 'nach 499 ms').toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(bild()?.classList.contains('startbild-fuellen'), 'nach 500 ms').toBe(true)
  })

  it('solange es steht, ist es am Dokument vermerkt — die Statusleiste der installierten App bleibt Graphit', () => {
    // Am Vermerk hängt die Farbe der Statusleiste (tokens.css, darstellung.ts).
    // Fehlte er, wechselte sie beim Start sofort in die Farbe der Darstellung.
    const wurzel = document.documentElement
    const { unmount } = render(<Buehne><Startbild /></Buehne>)
    expect(wurzel.hasAttribute('data-startbild')).toBe(true)
    unmount()
    expect(wurzel.hasAttribute('data-startbild')).toBe(false)
  })

  it('„Lädt …" hören nur Vorleseprogramme — zu sehen ist es nie, auch ohne Bewegung nicht', () => {
    // Der Betreiber am 22.10.2026: Das Wort „Lädt" soll aus dem Startbild weg.
    // Bis dahin stand es ohne Bewegung unter dem Logo. Dass keine Regel es
    // hervorholt, prüft startbild-fuellen.test.ts.
    const { container } = render(<Buehne><Startbild /></Buehne>)
    const status = container.querySelector('.startbild[role="status"]')
    expect(status?.textContent).toBe(DE.laedt)
    expect([...(status?.querySelectorAll('p') ?? [])].map((p) => p.className)).toEqual(['sr-only'])
  })

  it('zeigt dasselbe Logo wie das Startbild der App — Größe, Plätze, Deckkraft, Klassen', () => {
    const { container } = render(<Buehne><Startbild /></Buehne>)
    const app = container.querySelector('.startbild svg')
    const html = vorab()?.querySelector('svg')
    expect(app, 'Logo im Startbild der App').not.toBeNull()
    expect(html, 'Logo im Startbild von index.html').not.toBeNull()
    // Bei Abweichung steht hier, was index.html braucht.
    expect(ohneLeerraum(html!).isEqualNode(ohneLeerraum(app!)), app!.outerHTML).toBe(true)
  })

  it('die Probe merkt eine Abweichung auch — ein Platz an anderer Stelle', () => {
    const { container } = render(<Buehne><Startbild /></Buehne>)
    const app = ohneLeerraum(container.querySelector('.startbild svg')!)
    const html = ohneLeerraum(vorab()!.querySelector('svg')!)
    html.querySelector('g circle')!.setAttribute('cx', '170')
    expect(html.isEqualNode(app)).toBe(false)
  })
})
