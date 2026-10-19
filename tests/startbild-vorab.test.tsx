/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AppDispatchContext, AppStateContext, AppStoreContext, type AppState, useStaticStore } from '../src/app/context'
import { Startbild } from '../src/app/Startbild'
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
 * dieselbe Größe, dieselben Plätze, dieselbe Deckkraft je Reihe, dieselben
 * Klassen (über sie kommen Farben und Welle aus dem CSS). Zwei Abschriften
 * derselben Form laufen sonst auseinander, und erst ein Handy zeigt es.
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

afterEach(cleanup)

describe('Das Startbild in index.html', () => {
  it('steht als einziges in der Wurzel der App — React ersetzt es beim ersten Zeichnen', () => {
    const wurzel = new DOMParser().parseFromString(INDEX, 'text/html').querySelector('#root')
    // Ohne `startbild-welle`: Bis React übernimmt, steht es still wie das Bild
    // von Android. Liefe die Welle schon hier, begänne sie beim Wechsel mit
    // einem Ruck von vorn.
    expect([...(wurzel?.children ?? [])].map((k) => k.className)).toEqual(['startbild'])
  })

  it('das Startbild der App trägt die Welle — das aus index.html nicht', () => {
    const { container } = render(<Buehne><Startbild /></Buehne>)
    expect(container.querySelector('.startbild')?.classList.contains('startbild-welle')).toBe(true)
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

  it('„Lädt …" hören Vorleseprogramme; zu sehen ist es nur ohne Bewegung (shell.css)', () => {
    // Mit Bewegung zeigt die Welle, dass es lädt — ein Wort allein darunter
    // wäre genau das, was der Betreiber nicht mehr sehen wollte.
    const { container } = render(<Buehne><Startbild /></Buehne>)
    const wort = container.querySelector('.startbild-text')
    expect(wort?.classList.contains('sr-only')).toBe(true)
    expect(container.querySelector('.startbild')?.getAttribute('role')).toBe('status')
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
