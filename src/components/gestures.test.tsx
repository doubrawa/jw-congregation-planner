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

/**
 * Wischbewegung entlang vorgegebener Punkte — auch für Bahnen, die keine
 * gerade Linie sind. Ein Daumen wischt nie exakt waagerecht: er ist am Gelenk
 * angeschlagen und beschreibt einen Bogen, der oft senkrecht beginnt.
 *
 * `ms` verteilt Zeitstempel über die Bewegung; useSwipeDown braucht sie für
 * die Geschwindigkeit (kurz, aber schnell geworfen = schließen).
 */
function swipePath(el: Element, points: Array<[number, number]>, ms = 0): void {
  touch(el, 'touchstart', [points[0]], true, 0)
  points.slice(1).forEach((p, i) => touch(el, 'touchmove', [p], true, (ms * (i + 1)) / (points.length - 1)))
  touch(el, 'touchend', [points[points.length - 1]], true, ms)
}

/** Gerade Wischbewegung in `steps` Zwischenschritten. */
function swipe(
  el: Element,
  from: [number, number],
  to: [number, number],
  // ms = 200 wie eine gemuetliche Bewegung: useSwipeDown wertet die
  // Geschwindigkeit aus (kurz, aber schnell geworfen = schliessen), sonst
  // liefe jeder Test ueber die Wurf-Erkennung statt ueber die Distanz.
  { steps = 4, ms = 200 } = {},
): void {
  const bahn: Array<[number, number]> = [from]
  for (let i = 1; i <= steps; i++) {
    const f = i / steps
    bahn.push([from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f])
  }
  swipePath(el, bahn, ms)
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
    swipe(a.el, [200, 300], [100, 300])
    fertig()
    expect(a.onNext).toHaveBeenCalledTimes(1)
    expect(a.onPrev).not.toHaveBeenCalled()

    const b = setup()
    swipe(b.el, [200, 300], [300, 300])
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

  it('bricht der Browser die Berührung ab, wird trotzdem geblättert', () => {
    // Der Android-Fall: die Bewegung war laengst als waagerecht erkannt und
    // weit genug gezogen, dann zieht der Browser sie fürs Scrollen an sich und
    // schickt touchcancel. Wer daraufhin nur zurückfedert, blättert auf dem
    // Gerät NIE — obwohl der Wunsch eindeutig war.
    const { el, onNext } = setup()
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[200, 302]])
    touch(el, 'touchmove', [[120, 305]])
    touch(el, 'touchcancel', [[120, 305]])
    fertig()
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('ein Abbruch VOR der Richtungsentscheidung blättert nicht', () => {
    // Hier ist der Abbruch richtig: die Bewegung war noch nicht zugeordnet,
    // der Finger gehört dem Scrollen.
    const { el, onNext, onPrev } = setup()
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[296, 340]]) // senkrecht dominant
    touch(el, 'touchcancel', [[296, 340]])
    fertig()
    expect(onNext).not.toHaveBeenCalled()
    expect(onPrev).not.toHaveBeenCalled()
  })

  it('ein Abbruch nach zu kurzem Weg blättert nicht', () => {
    const { el, onNext } = setup()
    touch(el, 'touchstart', [[300, 300]])
    touch(el, 'touchmove', [[260, 302]]) // 40 px < Schwelle
    touch(el, 'touchcancel', [[260, 302]])
    fertig()
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
    swipe(el, [200, 400], [120, 120])
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
    swipe(el, [200, 300], [100, 390])
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

  it('schiebt den Streifen um genau eine Wochenbreite weiter', () => {
    // Die Nachbarwochen sind bereits gezeichnet — es wird nur verschoben.
    // Der Wochenwechsel passiert erst am Ende der Bewegung: dann steht die
    // Nachbarwoche dort, wo die mittlere hingehört, und der Versatz geht im
    // selben Zug auf null zurück.
    const { el, onNext } = setup()
    swipe(el, [200, 300], [100, 300]) // 100 px nach links

    expect(el.style.getPropertyValue('--week-shift')).toBe('-400px')
    expect(onNext).not.toHaveBeenCalled()

    fertig()
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
  })

  it('nach rechts gewischt schiebt das Fenster nach rechts hinaus', () => {
    // Die Gegenrichtung eigens geprüft: ein Vorzeichenfehler fiele sonst nicht
    // auf, weil die vorige Woche von links kommen muss.
    const { el, onPrev } = setup()
    swipe(el, [100, 300], [220, 300]) // 120 px nach rechts
    // Nach rechts: der Streifen wandert nach rechts, die vorige Woche liegt links.
    expect(el.style.getPropertyValue('--week-shift')).toBe('400px')
    fertig()
    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
  })

  it('versetzt um die Bildschirm-, nicht die Fensterbreite', () => {
    // Die App-Spalte ist schmaler als das Fenster (430 px mobil, 660 px am
    // Desktop, mittig). Mit der Fensterbreite klaffte auf breiteren Geräten —
    // oder im Querformat — genau die Differenz zwischen den beiden Wochen.
    const { el } = setup()
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 500 }) as DOMRect
    swipe(el, [200, 300], [100, 300]) // nach links, Fenster 400
    // Verschoben wird um 300 (Bildschirmbreite), nicht um 400 (Fensterbreite).
    expect(el.style.getPropertyValue('--week-shift')).toBe('-300px')
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
    swipe(el, [200, 300], [160, 300]) // zu kurz
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
    fertig()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('an der letzten Woche federt es zurück statt hinauszuschieben', () => {
    const { el, onNext } = setup({ canNext: false })
    swipe(el, [200, 300], [80, 300])
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
    fertig()
    expect(onNext).not.toHaveBeenCalled()
  })

  /*
   * **Eine Bewegung darf nicht in die nächste hineinschlagen.**
   *
   * Jede Animation setzt eine Aufräum-Frist. Sie wurde nur überschrieben, nie
   * abgebrochen — die alte lief weiter. Wer nach einem Zurückfedern gleich
   * weiterwischt (und dessen 200 ms sind kürzer als eine zügige zweite Geste),
   * bekam mitten im Blättern `transition: ''` gesetzt: der Streifen springt an
   * seinen Platz, statt zu gleiten. Auf dem Gerät sieht das aus, als hätte die
   * App die Geste verschluckt und dann doch geblättert.
   */
  it('eine abgebrochene Bewegung räumt nicht in die nächste hinein', () => {
    const { el, onNext } = setup()
    swipe(el, [200, 300], [170, 300]) // zu kurz → federt zurück, Frist läuft
    vi.advanceTimersByTime(100) // sie ist noch offen (SPRING_MS + 20 = 200)

    swipe(el, [200, 300], [100, 300]) // jetzt eine, die blättert
    expect(el.style.transition).toContain('200ms')

    // Genau der Moment, in dem die alte Frist zugeschlagen hätte.
    vi.advanceTimersByTime(120)
    expect(el.style.transition, 'die Übergangsdauer wurde mitten im Blättern weggenommen').toContain(
      '200ms',
    )
    expect(el.style.getPropertyValue('--week-shift')).toBe('-400px')

    fertig()
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
  })

  it('beim Abmelden bleibt keine Frist offen — auch keine ältere', () => {
    // Die Hülle konnte nur die zuletzt gemerkte abbrechen; was davor lief,
    // griff danach auf ein Element zu, das nicht mehr im Baum steht. Gezählt
    // statt an einer Wirkung abgelesen: Die alte Frist tat am Ende dasselbe
    // wie das Aufräumen (`transition: ''`) und blieb dadurch unsichtbar —
    // ein Test auf die Wirkung wäre grün geblieben, ob der Fehler dasteht
    // oder nicht.
    const r = render(<WeekHarness />)
    const el = r.getByTestId('screen')
    swipe(el, [200, 300], [170, 300]) // Zurückfedern: Frist eins
    vi.advanceTimersByTime(100)
    swipe(el, [200, 300], [100, 300]) // Blättern: Frist zwei
    r.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  /**
   * **Von rechts nach links gelesen dreht sich der Streifen mit.**
   *
   * Der Wochenstreifen ist eine Zeitachse, und die läuft in die Leserichtung.
   * Auf Arabisch, Hebräisch, Persisch und Urdu liegt die **vorige** Woche
   * rechts — dorthin zieht der Leser, um zurückzublättern.
   *
   * Vorher stimmte beides nicht zusammen: Das CSS setzte die Nachbarn mit
   * festem `right`/`left`, und die Geste rechnete „rechts = zurück". Ein
   * arabischer Planer zog also nach rechts (für ihn: in die Vergangenheit) und
   * landete in der **nächsten** Woche — jedes Mal, in beide Richtungen falsch.
   *
   * Gemessen wird an `document.documentElement.dir`, weil der Hook genau dort
   * nachsieht; im laufenden Programm setzt `store.tsx` das Attribut, und
   * `index.html` tut es schon vor dem ersten Paint.
   */
  describe('Rechts-nach-links', () => {
    beforeEach(() => {
      document.documentElement.dir = 'rtl'
    })
    afterEach(() => {
      document.documentElement.removeAttribute('dir')
    })

    it('nach rechts wischen blättert vorwärts, nach links zurück', () => {
      const a = setup()
      swipe(a.el, [200, 300], [300, 300]) // nach rechts
      fertig()
      expect(a.onNext).toHaveBeenCalledTimes(1)
      expect(a.onPrev).not.toHaveBeenCalled()

      const b = setup()
      swipe(b.el, [200, 300], [100, 300]) // nach links
      fertig()
      expect(b.onPrev).toHaveBeenCalledTimes(1)
      expect(b.onNext).not.toHaveBeenCalled()
    })

    it('der Streifen wandert in die Richtung, in die gezogen wurde', () => {
      // Der Versatz folgt dem Finger — das ändert sich durch die Leserichtung
      // nicht. Was sich ändert, ist, welche Woche danach in der Mitte steht.
      const { el, onPrev } = setup()
      swipe(el, [200, 300], [80, 300]) // 120 px nach links
      expect(el.style.getPropertyValue('--week-shift')).toBe('-400px')
      fertig()
      expect(onPrev).toHaveBeenCalledTimes(1)
      expect(el.style.getPropertyValue('--week-shift')).toBe('0px')
    })

    it('an der ersten Woche gibt es nach links nur zäh nach', () => {
      // Die Grenze dreht sich mit: „keine vorige Woche" bremst jetzt den Wisch
      // nach **links**, nicht mehr den nach rechts.
      const { el, onPrev } = setup({ canPrev: false })
      swipe(el, [200, 300], [100, 300])
      fertig()
      expect(onPrev).not.toHaveBeenCalled()

      const b = setup({ canNext: false })
      swipe(b.el, [200, 300], [300, 300])
      fertig()
      expect(b.onNext).not.toHaveBeenCalled()
    })

    it('auf Deutsch bleibt es beim Gewohnten — die Umstellung wirkt nur in RTL', () => {
      // Gegenprobe im selben Block: Ohne sie ließe sich nicht unterscheiden, ob
      // die Geste die Leserichtung liest oder schlicht vertauscht wurde.
      document.documentElement.dir = 'ltr'
      const { el, onNext } = setup()
      swipe(el, [200, 300], [100, 300]) // nach links
      fertig()
      expect(onNext).toHaveBeenCalledTimes(1)
    })
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

  it('kurz, aber schnell geworfen schließt ebenfalls', () => {
    // Der zweite Weg neben der Distanz: 50 px in 60 ms sind unter der
    // Schließ-Schwelle (90 px), aber deutlich über der Wurfgeschwindigkeit.
    const onClose = vi.fn()
    const r = render(<SheetHarness onClose={onClose} />)
    swipe(r.getByTestId('sheet'), [200, 200], [200, 250], { ms: 60 })
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
