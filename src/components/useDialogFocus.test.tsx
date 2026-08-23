/** @vitest-environment jsdom */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { useDialogFocus } from './useDialogFocus'

/**
 * jsdom rechnet kein Layout und liefert `offsetParent` deshalb **immer** null.
 * Der Haken benutzt genau das, um unsichtbare Elemente zu überspringen — ohne
 * Ersatz hielte er hier jedes Element für unsichtbar und die Falle liefe ins
 * Leere, ohne dass ein Test es merkte. Der Ersatz bildet die Browser-Regel
 * nach, soweit sie hier zählt: sichtbar ist, was im Dokument hängt.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? this.parentElement : null
    },
  })
})

/**
 * **Die Fokusfalle — was ein modaler Dialog einer Tastatur schuldet.**
 *
 * Die App hat sieben Overlays (Zuteilung, Mitteilungen, Sprache, S-89,
 * Aufgabe, Freigabe-Liste, Seitenmenü), und alle nutzen diesen einen Haken.
 * Er hat drei Zusagen, von denen man zwei erst bemerkt, wenn sie fehlen:
 *
 * 1. Beim Öffnen springt der Fokus **hinein** — sonst tabbt man erst durch die
 *    ganze Seite dahinter.
 * 2. Er bleibt **darin**: Tab am Ende springt an den Anfang zurück, Shift+Tab
 *    am Anfang ans Ende. Ohne das wandert der Fokus hinter das Overlay, und
 *    der Nutzer bedient etwas, das er nicht sieht.
 * 3. Beim Schließen geht er **zurück** an das Element, von dem aus geöffnet
 *    wurde. Sonst beginnt jede Bedienung wieder ganz oben.
 */

function Dialog({
  aktiv = true,
  kinder,
}: {
  aktiv?: boolean
  kinder: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, aktiv)
  return (
    <div className="dlg" role="dialog" ref={ref}>
      {kinder}
    </div>
  )
}

/** Ein Auslöser außerhalb des Dialogs — von hier aus wird geöffnet. */
function Buehne({ offen, kinder }: { offen: boolean; kinder: ReactNode }) {
  return (
    <>
      <button type="button" className="ausloeser">
        Öffnen
      </button>
      {offen && <Dialog kinder={kinder} />}
    </>
  )
}

const DREI = (
  <>
    <button type="button" className="a">A</button>
    <input className="b" />
    <button type="button" className="c">C</button>
  </>
)

afterEach(cleanup)

describe('Beim Öffnen springt der Fokus hinein', () => {
  it('auf das erste bedienbare Element', () => {
    const { container } = render(<Dialog kinder={DREI} />, {
      container: document.body.appendChild(document.createElement('div')),
    })
    expect(document.activeElement).toBe(container.querySelector('.a'))
  })

  it('ohne bedienbares Element auf den Dialog selbst — der Fokus bleibt trotzdem drin', () => {
    const { container } = render(<Dialog kinder={<p>nur Text</p>} />, {
      container: document.body.appendChild(document.createElement('div')),
    })
    const dlg = container.querySelector<HTMLElement>('.dlg')!
    expect(document.activeElement).toBe(dlg)
    expect(dlg.tabIndex).toBe(-1)
  })

  it('inaktiv geschaltet passiert nichts — der Haken läuft, greift aber nicht', () => {
    const vorher = document.body
    render(<Dialog aktiv={false} kinder={DREI} />, {
      container: document.body.appendChild(document.createElement('div')),
    })
    expect(document.activeElement).toBe(vorher)
  })
})

describe('Der Fokus bleibt im Dialog', () => {
  const auf = () =>
    render(<Dialog kinder={DREI} />, {
      container: document.body.appendChild(document.createElement('div')),
    })

  it('Tab am letzten Element springt an den Anfang zurück', () => {
    const { container } = auf()
    const dlg = container.querySelector<HTMLElement>('.dlg')!
    container.querySelector<HTMLElement>('.c')!.focus()
    fireEvent.keyDown(dlg, { key: 'Tab' })
    expect(document.activeElement).toBe(container.querySelector('.a'))
  })

  it('Shift+Tab am ersten ans Ende', () => {
    const { container } = auf()
    const dlg = container.querySelector<HTMLElement>('.dlg')!
    container.querySelector<HTMLElement>('.a')!.focus()
    fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(container.querySelector('.c'))
  })

  it('in der Mitte lässt er den Browser machen — nur die Ränder werden gefangen', () => {
    const { container } = auf()
    const dlg = container.querySelector<HTMLElement>('.dlg')!
    const mitte = container.querySelector<HTMLElement>('.b')!
    mitte.focus()
    fireEvent.keyDown(dlg, { key: 'Tab' })
    expect(document.activeElement).toBe(mitte) // unverändert: der Browser tabbt weiter
  })

  it('andere Tasten fängt er nicht ab', () => {
    const { container } = auf()
    const dlg = container.querySelector<HTMLElement>('.dlg')!
    container.querySelector<HTMLElement>('.c')!.focus()
    fireEvent.keyDown(dlg, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(container.querySelector('.c'))
  })

  it('ein gesperrtes Element zählt nicht mit — Tab landete sonst darauf', () => {
    const { container } = render(
      <Dialog kinder={
        <>
          <button type="button" className="a">A</button>
          <button type="button" className="gesperrt" disabled>X</button>
          <button type="button" className="c">C</button>
        </>
      } />,
      { container: document.body.appendChild(document.createElement('div')) },
    )
    const dlg = container.querySelector<HTMLElement>('.dlg')!
    container.querySelector<HTMLElement>('.c')!.focus()
    fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: false })
    expect(document.activeElement).toBe(container.querySelector('.a'))
  })

  it('ohne bedienbares Element fängt Tab ins Leere — statt hinter den Dialog zu führen', () => {
    const { container } = render(<Dialog kinder={<p>nur Text</p>} />, {
      container: document.body.appendChild(document.createElement('div')),
    })
    const dlg = container.querySelector<HTMLElement>('.dlg')!
    const ereignis = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    dlg.dispatchEvent(ereignis)
    expect(ereignis.defaultPrevented).toBe(true)
  })
})

describe('Beim Schließen kehrt der Fokus zurück', () => {
  it('an das Element, von dem aus geöffnet wurde', () => {
    const wurzel = document.body.appendChild(document.createElement('div'))
    const { rerender, container } = render(<Buehne offen={false} kinder={DREI} />, { container: wurzel })
    const ausloeser = container.querySelector<HTMLElement>('.ausloeser')!
    ausloeser.focus()
    expect(document.activeElement).toBe(ausloeser)

    rerender(<Buehne offen kinder={DREI} />)
    expect(document.activeElement).toBe(container.querySelector('.a'))

    rerender(<Buehne offen={false} kinder={DREI} />)
    expect(document.activeElement).toBe(ausloeser)
  })
})
