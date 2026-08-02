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

/* ---- Touch-Ereignisse (useSwipeWeek) ------------------------------------- */

/**
 * jsdom kennt TouchEvent nicht; `touches` wird selbst angehängt.
 * `cancelable: false` bildet den Fall nach, dass der Browser die Geste bereits
 * übernommen hat — dann greift preventDefault() nicht mehr.
 */
function touch(
  el: Element,
  type: string,
  points: Array<[number, number]>,
  cancelable = true,
  time = 0,
): Event {
  const e = new Event(type, { bubbles: true, cancelable }) as Event & Record<string, unknown>
  const list = points.map(([x, y]) => ({ clientX: x, clientY: y }))
  e.touches = type === 'touchend' || type === 'touchcancel' ? [] : list
  e.changedTouches = list
  Object.defineProperty(e, 'timeStamp', { value: time })
  el.dispatchEvent(e)
  return e
}

/** Senkrechte Wischbewegung als Touch (für useSwipeDown). */
function swipeDown(el: Element, from: [number, number], to: [number, number], ms = 200): void {
  const steps = 4
  touch(el, 'touchstart', [from], true, 0)
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    touch(
      el,
      'touchmove',
      [[from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]],
      true,
      (ms * i) / steps,
    )
  }
  touch(el, 'touchend', [to], true, ms)
}

/** Wischbewegung als Touch: aufsetzen, ziehen, abheben. */
function swipeTouch(el: Element, from: [number, number], to: [number, number], steps = 4): void {
  touch(el, 'touchstart', [from])
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    touch(el, 'touchmove', [[from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]])
  }
  touch(el, 'touchend', [to])
}

/**
 * Wischbewegung entlang vorgegebener Punkte — für Bahnen, die keine gerade
 * Linie sind. Ein Daumen wischt nie exakt waagerecht: er ist am Gelenk
 * angeschlagen und beschreibt einen Bogen, der oft senkrecht beginnt.
 */
function swipePath(el: Element, points: Array<[number, number]>): void {
  touch(el, 'touchstart', [points[0]])
  points.slice(1).forEach((p) => touch(el, 'touchmove', [p]))
  touch(el, 'touchend', [points[points.length - 1]])
}

/**
 * Echte Daumenbewegung nach links, mit Bogen: die ersten Millimeter gehen
 * fast nur nach unten, erst danach setzt die waagerechte Bewegung ein.
 */
const DAUMEN_NACH_LINKS: Array<[number, number]> = [
  [300, 500],
  [297, 512],
  [290, 520],
  [270, 524],
  [240, 522],
  [200, 515],
  [160, 505],
  [140, 500],
]

beforeEach(() => {
  // Randzonen-Prüfung von useSwipeWeek rechnet gegen die Fensterbreite.
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
  // Blättern läuft als Animation: hinaus, Woche wechseln, herein. Das Ergebnis
  // steht erst danach fest — deshalb hier simulierte Zeit.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  /** Animation zu Ende laufen lassen. */
  const fertig = () => vi.advanceTimersByTime(600)

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
    swipeTouch(a.el, [200, 300], [100, 300])
    fertig()
    expect(a.onNext).toHaveBeenCalledTimes(1)
    expect(a.onPrev).not.toHaveBeenCalled()

    const b = setup()
    swipeTouch(b.el, [200, 300], [300, 300])
    fertig()
    expect(b.onPrev).toHaveBeenCalledTimes(1)
  })

  it('ein Daumenwisch im Bogen blättert (auch wenn er senkrecht anfängt)', () => {
    // Der Fall vom echten Gerät: die ersten Millimeter gehen fast nur nach
    // unten. Wird daraufhin die ganze Geste verworfen, blättert die App nie —
    // im Labor mit exakt waagerechten Bewegungen fällt das nicht auf.
    const { el, onNext } = setup()
    swipePath(el, DAUMEN_NACH_LINKS)
    fertig()
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('der Bogen geht auch nach rechts (zurückblättern)', () => {
    const { el, onPrev } = setup()
    swipePath(el, DAUMEN_NACH_LINKS.map(([x, y]) => [600 - x, y] as [number, number]))
    fertig()
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it('bricht das System die Berührung ab, wird NICHT geblättert', () => {
    // touchcancel heißt: Anruf, System-Geste o. Ä. Dann darf die
    // zurückgelegte Strecke nicht mehr zählen.
    const { el, onNext } = setup()
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[200, 302]])
    touch(el, 'touchmove', [[120, 305]])
    touch(el, 'touchcancel', [[120, 305]])
    expect(onNext).not.toHaveBeenCalled()
  })

  it('blättert auch, wenn der Browser das Scrollen bereits übernommen hat', () => {
    // Genau der Fall vom echten Gerät: der Browser hat die Geste an sich
    // gezogen, preventDefault() greift nicht mehr (cancelable = false). Die
    // Touch-Ereignisse laufen aber weiter — daran hängt die Erkennung.
    const { el, onNext } = setup()
    touch(el, 'touchstart', [DAUMEN_NACH_LINKS[0]])
    for (const p of DAUMEN_NACH_LINKS.slice(1)) touch(el, 'touchmove', [p], false)
    touch(el, 'touchend', [DAUMEN_NACH_LINKS[DAUMEN_NACH_LINKS.length - 1]])
    fertig()
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('stoppt das Scrollen erst, wenn die Richtung feststeht', () => {
    // Zu früh abgefangen hieße: der Inhalt lässt sich nicht mehr scrollen.
    const { el } = setup()
    touch(el, 'touchstart', [[300, 300]])
    expect(touch(el, 'touchmove', [[297, 312]]).defaultPrevented).toBe(false)
    expect(touch(el, 'touchmove', [[200, 315]]).defaultPrevented).toBe(true)
  })

  it('senkrechtes Scrollen wird nie abgefangen', () => {
    const { el } = setup()
    touch(el, 'touchstart', [[300, 300]])
    expect(touch(el, 'touchmove', [[302, 360]]).defaultPrevented).toBe(false)
    expect(touch(el, 'touchmove', [[290, 420]]).defaultPrevented).toBe(false)
  })

  it('zwei Finger (Zoom) blättern nicht', () => {
    const { el, onNext } = setup()
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[200, 300], [260, 400]])
    touch(el, 'touchend', [[200, 300]])
    expect(onNext).not.toHaveBeenCalled()
  })

  it('senkrechtes Scrollen blättert NICHT, auch wenn es dabei seitlich verrutscht', () => {
    // dx = -80 liegt über der Blätter-Schwelle; entscheidend ist, dass dy weit
    // größer ist. Ohne die Winkel-Regel würde diese Scrollbewegung blättern.
    const { el, onPrev, onNext } = setup()
    swipeTouch(el, [200, 400], [120, 120])
    expect(onPrev).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('nach dem Scrollen greift die Geste nicht nachträglich doch noch', () => {
    // Erst weit nach unten (klar Scrollen), dann kräftig zur Seite. Ohne das
    // endgültige Verwerfen würde die App am Ende der Scrollbewegung blättern.
    const { el, onNext } = setup()
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[300, 500]])
    touch(el, 'touchmove', [[0, 500]])
    touch(el, 'touchend', [[0, 500]])
    expect(onNext).not.toHaveBeenCalled()
  })

  it('eine schräge Bewegung blättert NICHT', () => {
    // Weder klar waagerecht noch klar senkrecht: im Zweifel gehört die
    // Bewegung dem Inhalt, nicht dem Blättern.
    const { el, onNext } = setup()
    swipeTouch(el, [200, 300], [100, 390])
    expect(onNext).not.toHaveBeenCalled()
  })

  it('zu kurze Bewegung blättert NICHT', () => {
    const { el, onNext } = setup()
    swipeTouch(el, [200, 300], [160, 300]) // 40 px < Schwelle
    expect(onNext).not.toHaveBeenCalled()
  })

  it('Start am Bildschirmrand bleibt dem Browser überlassen', () => {
    // Dort löst der Wisch die Zurück-/Vorwärts-Navigation des Browsers aus.
    const left = setup()
    swipeTouch(left.el, [10, 300], [200, 300])
    expect(left.onPrev).not.toHaveBeenCalled()

    const right = setup()
    swipeTouch(right.el, [395, 300], [200, 300])
    expect(right.onNext).not.toHaveBeenCalled()
  })

  it('an der ersten/letzten Woche passiert nichts', () => {
    const first = setup({ canPrev: false })
    swipeTouch(first.el, [200, 300], [320, 300])
    expect(first.onPrev).not.toHaveBeenCalled()

    const last = setup({ canNext: false })
    swipeTouch(last.el, [200, 300], [80, 300])
    expect(last.onNext).not.toHaveBeenCalled()
  })

  it('alte und neue Woche wandern gemeinsam weiter (kein Sprung)', () => {
    // Der Kern der Sache: früher sprang der Inhalt quer über den Bildschirm
    // und war einen Wimpernschlag lang ganz weg — das las sich, als liefe die
    // Bewegung zurück. Jetzt kleben beide Wochen aneinander.
    const { el, onNext } = setup()
    swipeTouch(el, [200, 300], [100, 300]) // 100 px nach links

    // Die neue Woche ist sofort da und steht unmittelbar rechts daneben:
    // Standbild bei -100, neue Woche eine Fensterbreite (400) weiter.
    expect(onNext).toHaveBeenCalledTimes(1)
    const standbild = document.querySelector<HTMLElement>('[data-week-ghost] > *')
    expect(standbild).not.toBeNull()
    expect(standbild!.style.getPropertyValue('--week-shift')).toBe('-100px')
    expect(el.style.getPropertyValue('--week-shift')).toBe('300px')

    fertig()
    // Beide um dieselbe Strecke weiter: Standbild raus, neue Woche sitzt.
    expect(standbild!.style.getPropertyValue('--week-shift')).toBe('-400px')
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
    // Und das Standbild ist wieder weg — sonst läge es über allem.
    expect(document.querySelector('[data-week-ghost]')).toBeNull()
  })

  it('nach rechts gewischt schiebt das Fenster nach rechts hinaus', () => {
    // Die Gegenrichtung eigens geprüft: ein Vorzeichenfehler fiele sonst nicht
    // auf, weil die vorige Woche von links kommen muss.
    const { el, onPrev } = setup()
    swipeTouch(el, [100, 300], [220, 300]) // 120 px nach rechts
    expect(onPrev).toHaveBeenCalledTimes(1)
    const standbild = document.querySelector<HTMLElement>('[data-week-ghost] > *')
    expect(standbild!.style.getPropertyValue('--week-shift')).toBe('120px')
    // Die vorige Woche liegt LINKS daneben.
    expect(el.style.getPropertyValue('--week-shift')).toBe('-280px')
    fertig()
    expect(standbild!.style.getPropertyValue('--week-shift')).toBe('400px')
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
  })

  it('folgt dem Finger 1:1', () => {
    // Gedämpftes Mitgehen sähe aus wie „geht nicht weiter" — der Inhalt wird
    // aber wirklich weggeschoben.
    const { el } = setup()
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[200, 300]])
    expect(el.style.getPropertyValue('--week-shift')).toBe('-100px')
  })

  it('an der letzten Woche gibt es nur zäh nach', () => {
    // Hier ist das gedämpfte Nachgeben richtig: es sagt „hier ist Schluss".
    const { el } = setup({ canNext: false })
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[200, 300]])
    expect(el.style.getPropertyValue('--week-shift')).toBe('-25px')
  })

  it('federt zurück, wenn NICHT geblättert wird', () => {
    // Zurückfedern darf nur eines heißen: hier geht es nicht weiter.
    const { el, onNext } = setup()
    swipeTouch(el, [200, 300], [160, 300]) // zu kurz
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
    fertig()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('an der letzten Woche federt es zurück statt hinauszuschieben', () => {
    const { el, onNext } = setup({ canNext: false })
    swipeTouch(el, [200, 300], [80, 300])
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
    fertig()
    expect(onNext).not.toHaveBeenCalled()
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
    swipeDown(r.getByTestId('sheet'), [200, 200], [200, 320])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('kurzes Ziehen federt zurück statt zu schließen', () => {
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipeDown(r.getByTestId('sheet'), [200, 200], [200, 240], 600)
    expect(onClose).not.toHaveBeenCalled()
    expect(r.getByTestId('sheet').style.getPropertyValue('--sheet-drag')).toBe('0px')
  })

  it('nach oben ziehen schließt nicht', () => {
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipeDown(r.getByTestId('sheet'), [200, 300], [200, 100])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('gehört die Bewegung der gescrollten Liste, schließt das Sheet nicht', () => {
    // Sonst würde das Sheet beim Zurückscrollen der Kandidatenliste zuklappen.
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} scrollTop={120} />)
    swipeDown(r.getByTestId('list'), [200, 200], [200, 320])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('am Desktop ist die Geste aus', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipeDown(r.getByTestId('sheet'), [200, 200], [200, 320])
    expect(onClose).not.toHaveBeenCalled()
  })

  it('schließt auch, wenn der Browser das Scrollen bereits übernommen hat', () => {
    // Nach unten ist genau die Richtung, die der Browser für sich beansprucht —
    // der Fall vom echten Gerät, wo das Sheet einfach offen blieb.
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    const sheet = r.getByTestId('sheet')
    touch(sheet, 'touchstart', [[200, 200]], true, 0)
    for (const y of [220, 260, 300, 320]) touch(sheet, 'touchmove', [[200, y]], false, y)
    touch(sheet, 'touchend', [[200, 320]], true, 400)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('bricht das System die Berührung ab, bleibt das Sheet offen', () => {
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    const sheet = r.getByTestId('sheet')
    touch(sheet, 'touchstart', [[200, 200]], true, 0)
    touch(sheet, 'touchmove', [[200, 320]], true, 100)
    touch(sheet, 'touchcancel', [[200, 320]], true, 110)
    expect(onClose).not.toHaveBeenCalled()
  })
})
