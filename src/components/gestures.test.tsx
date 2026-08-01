/** @vitest-environment jsdom */
/*
 * Tests der drei Handy-Gesten. Schwerpunkt liegt auf dem, was NICHT passieren
 * darf: eine Geste, die versehentlich auslöst, ist schlimmer als gar keine —
 * sie blättert dann beim Scrollen die Woche weg oder schließt ein Sheet.
 */
import { useRef } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBackDismiss } from './useBackDismiss'
import { useSwipeDown } from './useSwipeDown'
import { useSwipeWeek } from './useSwipeWeek'

/* ---- Zeiger-Ereignisse (jsdom kennt PointerEvent nicht vollständig) ------ */

function pointer(el: Element, type: string, x: number, y: number, time = 0): void {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & Record<string, unknown>
  e.pointerId = 1
  e.isPrimary = true
  e.clientX = x
  e.clientY = y
  Object.defineProperty(e, 'timeStamp', { value: time })
  el.dispatchEvent(e)
}

/** Eine vollständige Wischbewegung: drücken, ziehen, loslassen. */
function swipe(
  el: Element,
  from: [number, number],
  to: [number, number],
  { steps = 4, ms = 200 } = {},
): void {
  pointer(el, 'pointerdown', from[0], from[1], 0)
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    pointer(el, 'pointermove', from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, (ms * i) / steps)
  }
  pointer(el, 'pointerup', to[0], to[1], ms)
}

beforeEach(() => {
  // jsdom: Zeiger-Capture existiert nicht, wird von useSwipeDown aber genutzt.
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  window.innerWidth = 400
})

// Ohne Setup-Datei räumt Testing Library nicht von selbst auf; mehrere
// render()-Aufrufe lägen sonst gleichzeitig im Dokument.
afterEach(cleanup)

/* ---- Zurück-Geste -------------------------------------------------------- */

function BackHarness({ active, onDismiss }: { active: boolean; onDismiss: () => void }) {
  useBackDismiss(active, onDismiss)
  return null
}

describe('useBackDismiss', () => {
  let depth = 0
  beforeEach(() => {
    depth = 0
    let fakeState: unknown = null
    vi.spyOn(history, 'pushState').mockImplementation((st) => {
      depth++
      fakeState = st
    })
    vi.spyOn(history, 'state', 'get').mockImplementation(() => fakeState)
    vi.spyOn(history, 'back').mockImplementation(() => {
      depth--
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('legt beim Öffnen einen Verlaufseintrag an', () => {
    render(<BackHarness active onDismiss={() => {}} />)
    expect(depth).toBe(1)
  })

  it('geschlossen bleibt geschlossen: kein Eintrag, wenn gar nicht offen', () => {
    render(<BackHarness active={false} onDismiss={() => {}} />)
    expect(depth).toBe(0)
  })

  it('Zurück schließt das Overlay', () => {
    const onDismiss = vi.fn()
    render(<BackHarness active onDismiss={onDismiss} />)
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('nach dem Schließen reagiert es nicht mehr auf Zurück', () => {
    const onDismiss = vi.fn()
    const { unmount } = render(<BackHarness active onDismiss={onDismiss} />)
    unmount()
    window.dispatchEvent(new PopStateEvent('popstate'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('das eigene Aufräumen schließt kein anderes Overlay', () => {
    // Beim Schließen per Knopf räumen wir den Verlaufseintrag selbst ab. Das
    // erzeugt ebenfalls ein popstate — ein noch offenes Overlay darunter darf
    // dadurch NICHT mitschließen (genau das brach unter StrictMode).
    vi.spyOn(history, 'back').mockImplementation(() => {
      depth--
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    const unten = vi.fn()
    render(<BackHarness active onDismiss={unten} />) // bleibt offen
    const oben = vi.fn()
    const top = render(<BackHarness active onDismiss={oben} />)
    top.unmount() // oberes Overlay per Knopf geschlossen
    expect(unten).not.toHaveBeenCalled()
  })
})

/* ---- Woche wischen ------------------------------------------------------- */

interface WeekProps {
  onPrev?: () => void
  onNext?: () => void
  canPrev?: boolean
  canNext?: boolean
}

function WeekHarness({ onPrev = () => {}, onNext = () => {}, canPrev = true, canNext = true }: WeekProps) {
  const ref = useRef<HTMLElement>(null)
  useSwipeWeek(ref, { onPrev, onNext, canPrev, canNext })
  return <section ref={ref} data-testid="screen" />
}

describe('useSwipeWeek', () => {
  // Manche Tests prüfen beide Richtungen und rendern deshalb zweimal — vorher
  // abräumen, sonst liegen zwei Screens gleichzeitig im Dokument.
  const setup = (p: WeekProps = {}) => {
    cleanup()
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const r = render(<WeekHarness onPrev={onPrev} onNext={onNext} {...p} />)
    return { el: r.getByTestId('screen'), onPrev, onNext }
  }

  it('nach links wischen blättert vorwärts, nach rechts zurück', () => {
    const a = setup()
    swipe(a.el, [200, 300], [100, 300])
    expect(a.onNext).toHaveBeenCalledTimes(1)
    expect(a.onPrev).not.toHaveBeenCalled()

    const b = setup()
    swipe(b.el, [200, 300], [300, 300])
    expect(b.onPrev).toHaveBeenCalledTimes(1)
  })

  it('senkrechtes Scrollen blättert NICHT, auch wenn es dabei seitlich verrutscht', () => {
    // dx = -80 liegt über der Blätter-Schwelle; entscheidend ist, dass dy weit
    // größer ist. Ohne die Winkel-Regel würde diese Scrollbewegung blättern.
    const { el, onPrev, onNext } = setup()
    swipe(el, [200, 400], [120, 120])
    expect(onPrev).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('zu kurze Bewegung blättert NICHT', () => {
    const { el, onNext } = setup()
    swipe(el, [200, 300], [160, 300]) // 40 px < Schwelle
    expect(onNext).not.toHaveBeenCalled()
  })

  it('Start am Bildschirmrand bleibt dem Browser überlassen', () => {
    // Dort löst der Wisch die Zurück-/Vorwärts-Navigation des Browsers aus.
    const left = setup()
    swipe(left.el, [10, 300], [200, 300])
    expect(left.onPrev).not.toHaveBeenCalled()

    const right = setup()
    swipe(right.el, [395, 300], [200, 300])
    expect(right.onNext).not.toHaveBeenCalled()
  })

  it('an der ersten/letzten Woche passiert nichts', () => {
    const first = setup({ canPrev: false })
    swipe(first.el, [200, 300], [320, 300])
    expect(first.onPrev).not.toHaveBeenCalled()

    const last = setup({ canNext: false })
    swipe(last.el, [200, 300], [80, 300])
    expect(last.onNext).not.toHaveBeenCalled()
  })

  it('setzt den Versatz nach der Geste zurück', () => {
    const { el } = setup()
    swipe(el, [200, 300], [100, 300])
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
  })
})

/* ---- Sheet nach unten wischen -------------------------------------------- */

function SheetHarness({ onClose, scrollTop = 0 }: { onClose: () => void; scrollTop?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useSwipeDown(ref, onClose)
  return (
    <div ref={ref} data-testid="sheet">
      <div data-testid="list" style={{ overflow: 'auto' }} ref={(el) => {
        if (!el) return
        Object.defineProperty(el, 'scrollHeight', { value: 500, configurable: true })
        Object.defineProperty(el, 'clientHeight', { value: 100, configurable: true })
        Object.defineProperty(el, 'scrollTop', { value: scrollTop, configurable: true })
      }} />
    </div>
  )
}

describe('useSwipeDown', () => {
  beforeEach(() => {
    // Handy-Breite: am Desktop ist die Geste bewusst aus.
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  })

  it('weit genug nach unten gezogen schließt das Sheet', () => {
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipe(r.getByTestId('sheet'), [200, 200], [200, 320])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('kurzes Ziehen federt zurück statt zu schließen', () => {
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipe(r.getByTestId('sheet'), [200, 200], [200, 240], { ms: 600 })
    expect(onClose).not.toHaveBeenCalled()
    expect(r.getByTestId('sheet').style.getPropertyValue('--sheet-drag')).toBe('0px')
  })

  it('nach oben ziehen schließt nicht', () => {
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipe(r.getByTestId('sheet'), [200, 300], [200, 100])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('gehört die Bewegung der gescrollten Liste, schließt das Sheet nicht', () => {
    // Sonst würde das Sheet beim Zurückscrollen der Kandidatenliste zuklappen.
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} scrollTop={120} />)
    swipe(r.getByTestId('list'), [200, 200], [200, 320])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('am Desktop ist die Geste aus', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipe(r.getByTestId('sheet'), [200, 200], [200, 320])
    expect(onClose).not.toHaveBeenCalled()
  })
})
