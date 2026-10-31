/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppAction,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { AnmeldeLink, Lang, Member, Person } from '../data/types'
import type { Ausgestellt, AusgestellterLink } from '../lib/links-ausstellen'
import { zahlBinden } from '../i18n/zahl-binden'

/**
 * **Die Konto-Karte — wie ein Verkündiger in die App kommt** (T121, Phase 8;
 * Entwürfe `GPerson`, `GEinladen`).
 *
 * Drei Lagen, und jede bietet etwas anderes an: angemeldet · mit Link ·
 * ohne Link. Den Link gibt es per Nachricht oder auf einem Zettel — per E-Mail
 * bis zum 31.10.2026; seitdem speichert die App keine Adressen mehr.
 */

const linksAusstellen = vi.fn((_ids: readonly string[]) => Promise.resolve<Ausgestellt>({ links: [], fehler: false }))
// Nur der Aufruf der Function ist nachgestellt — was der Zustand daraus macht, ist echt.
vi.mock('../lib/links-ausstellen', async (echt) => ({
  ...(await echt<typeof import('../lib/links-ausstellen')>()),
  linksAusstellen: (ids: readonly string[]) => linksAusstellen(ids),
}))
// Die Zwischenablage — jsdom kennt sie nicht.
const kopiert = vi.fn((_text: string) => Promise.resolve(true))
vi.mock('../lib/clipboard', () => ({ copyText: (text: string) => kopiert(text) }))
// Die Texte der Nachricht lädt die App nach. Nach einem Deploy kann der alte
// Teil fehlen — `ladefehler` stellt das nach; ohne ihn lädt es echt.
let ladefehler: Error | null = null
vi.mock('./link-nachricht', async (echt) => {
  const modul = await echt<typeof import('./link-nachricht')>()
  return { ...modul, linkTexteLaden: (lang: Lang) => (ladefehler ? Promise.reject(ladefehler) : modul.linkTexteLaden(lang)) }
})
const fehlenderTeil = () => new TypeError('Failed to fetch dynamically imported module')

const { KontoCard } = await import('./KontoCard')

const t = dict('de')

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  priv: emptyQualifications(), ...over,
})
const konto = (over: Partial<Member> = {}): Member => ({ userId: 'u-a', email: 'anton@example.org', personId: 'p-a', planner: false, zuteiler: false, ...over })
/** Ein Link, der noch `tage` Tage gilt (negativ: abgelaufen) — gerechnet von heute, wie die Karte. */
const link = (tage = 10, over: Partial<AnmeldeLink> = {}): AnmeldeLink => ({
  personId: 'p-a',
  gueltigBis: new Date(Date.now() + tage * 86_400_000).toISOString(),
  erstelltAt: '2026-09-04T09:00:00.000Z',
  gesendetAt: null,
  benutztAt: null,
  ...over,
})
/** Was die Function für Anton zurückgibt. */
const ausgestellt = (): AusgestellterLink => ({
  personId: 'p-a',
  url: `https://versammlung.app/#anmelden=${'T'.repeat(43)}`,
  zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
  code: 'K7RD-2QWM',
  gueltigBis: '2026-11-14T09:00:00.000Z',
})

function zeige(p: Person, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [p], members: [], anmeldeLinks: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <KontoCard person={p} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const knopf = (wo: ParentNode, text: string) => [...wo.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)
const blatt = () => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="Anton Alt: ${t.linkSenden}"]`)
const aktionen = (dispatch: ReturnType<typeof vi.fn>) => dispatch.mock.calls.map((c) => c[0] as AppAction)
const toasts = (dispatch: ReturnType<typeof vi.fn>) => aktionen(dispatch).flatMap((a) => (a.type === 'showToast' ? [a.text] : []))
/** Das Blatt „Link senden" öffnen — über den Knopf, den die Karte gerade anbietet. */
const oeffnen = (c: HTMLElement) => {
  fireEvent.click(knopf(c, t.linkSenden) ?? knopf(c, t.neuerLinkBtn)!)
  return blatt()!
}

beforeEach(() => {
  // Das Blatt fragt nach der Breite (Wischen am Handy) — jsdom kennt `matchMedia` nicht.
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
  linksAusstellen.mockReset().mockResolvedValue({ links: [ausgestellt()], fehler: false })
  ladefehler = null
})
afterEach(() => {
  cleanup()
  delete (window as { matchMedia?: unknown }).matchMedia
})

/**
 * **Die Spur** (Entwurf `GPerson`): Angelegt · Link gesendet · Angemeldet —
 * erledigt voll, der nächste Schritt hervorgehoben, was danach kommt leer.
 */
describe('Die Spur des Kontos', () => {
  const lagen = (c: HTMLElement) =>
    [...c.querySelectorAll('.konto-karte > .spur .spur-schritt')].map((s) => [s.querySelector('.spur-name')?.textContent, s.className])

  it('noch kein Link: als Nächstes der Link', () => {
    expect(lagen(zeige(person()).container)).toEqual([
      [t.spurAngelegt, 'spur-schritt is-voll'],
      [t.standLink, 'spur-schritt is-jetzt'],
      [t.standAngemeldet, 'spur-schritt is-leer'],
    ])
  })

  it('ein gültiger Link: gesendet, mit Datum — als Nächstes das Anmelden', () => {
    const { container } = zeige(person(), { anmeldeLinks: [link()] })
    expect(lagen(container).map((l) => l[1])).toEqual(['spur-schritt is-voll', 'spur-schritt is-voll', 'spur-schritt is-jetzt'])
    expect(container.querySelector('.konto-karte > .spur .spur-wert')?.textContent).toBe(zahlBinden('4. Sept.'))
  })

  it('ein abgelaufener Link zählt wie keiner: wieder der Link als Nächstes', () => {
    const { container } = zeige(person(), { anmeldeLinks: [link(-1)] })
    expect(lagen(container).map((l) => l[1])).toEqual(['spur-schritt is-voll', 'spur-schritt is-jetzt', 'spur-schritt is-leer'])
  })

  it('ein verknüpftes Konto: alles erledigt', () => {
    expect(lagen(zeige(person(), { members: [konto()] }).container).map((l) => l[1])).toEqual([
      'spur-schritt is-voll',
      'spur-schritt is-voll',
      'spur-schritt is-voll',
    ])
  })
})

describe('Angemeldet', () => {
  it('nennt die Adresse des Kontos', () => {
    const { container } = zeige(person(), { members: [konto()] })
    expect(container.querySelector('.konto-mail')?.textContent).toBe('anton@example.org')
  })

  it('ein Konto ohne Adresse (die interne zählt nicht) heißt wenigstens „verknüpft"', () => {
    const { container } = zeige(person(), { members: [konto({ email: '' })] })
    expect(container.querySelector('.konto-mail')?.textContent).toBe(t.kontoVerknuepft)
  })

  it('die Verknüpfung lässt sich lösen — erst nach der Rückfrage', () => {
    const { container, dispatch } = zeige(person(), { members: [konto()] })
    fireEvent.click(container.querySelector('.konto-entfernen')!)
    expect(dispatch).not.toHaveBeenCalled()
    bestaetigen(container.querySelector('.konto-entfernen')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeMember', userId: 'u-a' })
  })

  it('das eigene Konto nicht — man sperrte sich selbst aus', () => {
    const { container } = zeige(person(), { members: [konto({ userId: 'u1' })] })
    expect(container.querySelector('.konto-entfernen')).toBeNull()
    expect(container.querySelector('.mem-du')?.textContent).toBe(t.duMarker)
  })

  it('für ein weiteres Gerät gibt es einen neuen Link — leise, es ist nicht der nächste Schritt', () => {
    const { container } = zeige(person(), { members: [konto()] })
    expect(knopf(container, t.neuerLinkBtn)?.className).toBe('knopf-pille')
    expect(knopf(container, t.zettelDrucken)).toBeUndefined()
  })
})

describe('Mit Link, noch nicht angemeldet', () => {
  it('sagt, dass er noch nicht geöffnet ist — und wem man bis dahin Bescheid gibt', () => {
    const { container } = zeige(person(), { anmeldeLinks: [link()] })
    expect(container.querySelector('.konto-hinweis')?.textContent).toBe(fill(t.linkOffenHint, { name: 'Anton' }))
  })

  it('abgelaufen sagt es das — und dass ein neuer wieder ein Jahr gilt', () => {
    const { container } = zeige(person(), { anmeldeLinks: [link(-1)] })
    expect(container.querySelector('.konto-hinweis')?.textContent).toBe(fill(t.linkAbgelaufenHint, { name: 'Anton' }))
  })

  it('bietet einen neuen Link und gleich den Zettel an', () => {
    const { container } = zeige(person(), { anmeldeLinks: [link()] })
    expect(knopf(container, t.neuerLinkBtn)).toBeDefined()
    expect(knopf(container, t.zettelDrucken)).toBeDefined()
  })
})

describe('Ohne Link', () => {
  it('der Hinweis nennt Nachricht und Zettel', () => {
    const { container } = zeige(person())
    expect(container.querySelector('.konto-hinweis')?.textContent).toBe(fill(t.ohneLinkHint, { name: 'Anton' }))
  })

  it('„Link senden" ist der nächste Schritt — hervorgehoben — und öffnet das Blatt', () => {
    const { container } = zeige(person())
    expect(knopf(container, t.linkSenden)?.className).toBe('knopf-pille knopf-pille--akzent')
    expect(oeffnen(container)).not.toBeNull()
  })
})

describe('Das Blatt „Link senden"', () => {
  it('zwei Wege: per Nachricht und auf einem Zettel — keine E-Mail mehr (31.10.2026)', () => {
    const b = oeffnen(zeige(person()).container)
    expect([...b.querySelectorAll('.link-weg-titel')].map((h) => h.textContent)).toEqual([t.perNachricht, t.aufZettel])
    expect(b.querySelector('input')).toBeNull()
    expect(knopf(b, t.linkSenden)).toBeUndefined()
  })

  it('der Zettel gilt ein Jahr — das Datum steht mit Jahr, sonst stünde der Tag von heute da', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-31T10:00:00Z'))
    try {
      const b = oeffnen(zeige(person()).container)
      expect(b.textContent).toContain(fill(t.aufZettelHint, { datum: zahlBinden('31. Oktober 2027') }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('antwortet der Server nicht, sagt es das — das Blatt bleibt', async () => {
    linksAusstellen.mockResolvedValue({ links: [], fehler: true })
    const { container, dispatch } = zeige(person())
    fireEvent.click(knopf(oeffnen(container), t.kopierenBtn)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.linkFehler))
    expect(kopiert).not.toHaveBeenCalled()
    expect(blatt()).not.toBeNull()
  })

  it('mit Link warnt es: Ein neuer ersetzt den alten, auch den Zettel', () => {
    expect(oeffnen(zeige(person()).container).textContent).not.toContain(t.neuerLinkErsetzt)
    cleanup()
    expect(oeffnen(zeige(person(), { anmeldeLinks: [link()] }).container).textContent).toContain(t.neuerLinkErsetzt)
  })
})

/**
 * **Per Nachricht** (24.10.2026, Betreiber: „kann man den code auch ohne email
 * senden"): Link und Code als Text über das Teilen des Geräts — WhatsApp,
 * Signal, SMS — oder kopiert. Der Text meldet an; der Hinweis sagt, dass er
 * nur in den persönlichen Chat gehört.
 */
describe('Per Nachricht', () => {
  const teilen = vi.fn((_daten: ShareData) => Promise.resolve())
  const mitTeilen = () => Object.defineProperty(navigator, 'share', { configurable: true, value: teilen })
  const abschnitt = (b: HTMLElement) => b.querySelector<HTMLElement>('[aria-labelledby="link-per-nachricht"]')!
  const geteilt = () => teilen.mock.calls.map((c) => c[0])
  beforeEach(() => {
    teilen.mockReset().mockResolvedValue(undefined)
    kopiert.mockReset().mockResolvedValue(true)
  })
  afterEach(() => {
    delete (navigator as { share?: unknown }).share
  })

  it('steht da — mit dem Hinweis, dass der Text nur in den persönlichen Chat gehört', () => {
    mitTeilen()
    const a = abschnitt(oeffnen(zeige(person()).container))
    expect(a.querySelector('h3')?.textContent).toBe(t.perNachricht)
    expect(a.textContent).toContain(fill(t.perNachrichtHint, { name: 'Anton' }))
    expect([...a.querySelectorAll('button')].map((b) => b.textContent)).toEqual([t.teilenBtn, t.kopierenBtn])
  })

  it('ohne Teilen im Gerät (Firefox am Computer) bleibt Kopieren', () => {
    const a = abschnitt(oeffnen(zeige(person()).container))
    expect([...a.querySelectorAll('button')].map((b) => b.textContent)).toEqual([t.kopierenBtn])
  })

  it('Teilen stellt einen Link aus und teilt Link und Code — das Blatt geht zu', async () => {
    mitTeilen()
    const { container, dispatch } = zeige(person())
    fireEvent.click(knopf(abschnitt(oeffnen(container)), t.teilenBtn)!)
    await waitFor(() => expect(teilen).toHaveBeenCalledTimes(1))
    expect(linksAusstellen).toHaveBeenCalledWith(['p-a'])
    const { title, text } = geteilt()[0]!
    expect(title).toBe('Dein Zugang zur Versammlung Musterstadt')
    expect(text).toContain(`#anmelden=${'T'.repeat(43)}`)
    expect(text).toContain('\nK7RD-2QWM\n')
    expect(text).toContain('frag die Ältesten nach einem neuen Link')
    expect(text).not.toContain('E-Mail')
    expect(aktionen(dispatch).some((a) => a.type === 'linksAusgestellt')).toBe(true)
    await waitFor(() => expect(blatt()).toBeNull())
  })

  it('ließ Safari das Teilen nach dem Warten nicht zu: Der nächste Tipp teilt denselben Text — ohne neuen Link', async () => {
    mitTeilen()
    teilen.mockRejectedValueOnce(new DOMException('zu spät', 'NotAllowedError'))
    const { container, dispatch } = zeige(person())
    const a = abschnitt(oeffnen(container))
    fireEvent.click(knopf(a, t.teilenBtn)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.nochmalTippen))
    expect(blatt()).not.toBeNull()
    fireEvent.click(knopf(a, t.teilenBtn)!)
    await waitFor(() => expect(teilen).toHaveBeenCalledTimes(2))
    // Ein zweiter Link hätte den eben geteilten ersetzt.
    expect(linksAusstellen).toHaveBeenCalledTimes(1)
    expect(geteilt()[1]).toEqual(geteilt()[0])
  })

  it('abgebrochen: keine Meldung, das Blatt bleibt — und der nächste Tipp teilt wieder denselben Text', async () => {
    mitTeilen()
    teilen.mockRejectedValueOnce(new DOMException('abgebrochen', 'AbortError'))
    const { container, dispatch } = zeige(person())
    const a = abschnitt(oeffnen(container))
    fireEvent.click(knopf(a, t.teilenBtn)!)
    await waitFor(() => expect(teilen).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(knopf(a, t.teilenBtn)?.getAttribute('aria-disabled')).toBeNull())
    expect(toasts(dispatch)).toEqual([])
    expect(blatt()).not.toBeNull()
    fireEvent.click(knopf(a, t.kopierenBtn)!)
    await waitFor(() => expect(kopiert).toHaveBeenCalledWith(geteilt()[0]!.text))
    expect(linksAusstellen).toHaveBeenCalledTimes(1)
  })

  it('Kopieren legt denselben Text in die Zwischenablage — die Meldung erinnert an den persönlichen Chat', async () => {
    const { container, dispatch } = zeige(person())
    fireEvent.click(knopf(abschnitt(oeffnen(container)), t.kopierenBtn)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(fill(t.toastNachrichtKopiert, { name: 'Anton' })))
    expect(kopiert.mock.calls[0]![0]).toContain('\nK7RD-2QWM\n')
    await waitFor(() => expect(blatt()).toBeNull())
  })

  it('scheitert das Kopieren, heißt es nicht „Kopiert" — der nächste Tipp kopiert denselben Text, ohne neuen Link', async () => {
    kopiert.mockResolvedValueOnce(false)
    const { container, dispatch } = zeige(person())
    const a = abschnitt(oeffnen(container))
    fireEvent.click(knopf(a, t.kopierenBtn)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.nochmalTippen))
    // In der Zwischenablage steht noch, was vorher darin war.
    expect(toasts(dispatch)).not.toContain(fill(t.toastNachrichtKopiert, { name: 'Anton' }))
    expect(blatt()).not.toBeNull()
    await waitFor(() => expect(knopf(a, t.kopierenBtn)?.getAttribute('aria-disabled')).toBeNull())
    fireEvent.click(knopf(a, t.kopierenBtn)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(fill(t.toastNachrichtKopiert, { name: 'Anton' })))
    expect(kopiert.mock.calls[1]![0]).toBe(kopiert.mock.calls[0]![0])
    expect(linksAusstellen).toHaveBeenCalledTimes(1)
  })

  it('fehlt nach einem Deploy der Teil mit den Texten: kein Link ausgestellt, eine Meldung', async () => {
    mitTeilen()
    ladefehler = fehlenderTeil()
    const { container, dispatch } = zeige(person())
    fireEvent.click(knopf(abschnitt(oeffnen(container)), t.teilenBtn)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.linkFehler))
    // Ein Link hätte den alten ersetzt — auch einen ausgegebenen Zettel —, ohne dass jemand ihn bekommt.
    expect(linksAusstellen).not.toHaveBeenCalled()
    expect(teilen).not.toHaveBeenCalled()
    expect(blatt()).not.toBeNull()
  })

  it('während der Link entsteht, druckt „Zettel drucken" nicht — sein Link ersetzte den eben geteilten', async () => {
    mitTeilen()
    let antworten = (_a: Ausgestellt) => {}
    linksAusstellen.mockReturnValueOnce(new Promise<Ausgestellt>((r) => (antworten = r)))
    const { container } = zeige(person())
    const b = oeffnen(container)
    fireEvent.click(knopf(abschnitt(b), t.teilenBtn)!)
    await waitFor(() => expect(linksAusstellen).toHaveBeenCalledTimes(1))
    fireEvent.click(knopf(b, t.zettelDrucken)!)
    expect(blatt()).not.toBeNull()
    antworten({ links: [ausgestellt()], fehler: false })
    await waitFor(() => expect(teilen).toHaveBeenCalledTimes(1))
    expect(linksAusstellen).toHaveBeenCalledTimes(1)
  })
})

describe('Zettel drucken', () => {
  const drucken = vi.fn()
  beforeEach(() => {
    drucken.mockReset()
    window.print = drucken
  })
  afterEach(() => fireEvent(window, new Event('afterprint')))

  it('stellt einen Link aus und druckt den Zettel: Name, Code, bis wann, QR-Code', async () => {
    const { container } = zeige(person(), { anmeldeLinks: [link()] })
    fireEvent.click(knopf(container, t.zettelDrucken)!)
    await waitFor(() => expect(drucken).toHaveBeenCalled())
    expect(linksAusstellen).toHaveBeenCalledWith(['p-a'])
    const zettel = document.querySelector('.anmelde-zettel')!
    expect(zettel.querySelector('.anmelde-name')?.textContent).toBe('Anton Alt')
    expect(zettel.querySelector('.anmelde-code')?.textContent).toBe('K7RD-2QWM')
    expect(zettel.textContent).toContain(fill(t.gueltigBisDatum, { datum: zahlBinden('14. November 2026') }))
    expect(zettel.querySelector('.anmelde-qr path')?.getAttribute('d')).toMatch(/^M\d+ \d+h\d+v1h-\d+z/)
    // Der zitierte Knopf ist der der Anmeldeseite.
    expect(zettel.textContent).toContain(fill(t.zettelAnleitung, { adresse: 'versammlung.app', knopf: t.codeEintippen }))
  })

  it('der Bogen hängt direkt unter body — der Druck blendet alles andere mit einer Regel aus', async () => {
    const { container } = zeige(person(), { anmeldeLinks: [link()] })
    fireEvent.click(knopf(container, t.zettelDrucken)!)
    await waitFor(() => expect(drucken).toHaveBeenCalled())
    expect(document.querySelector('.anmelde-bogen')?.parentElement).toBe(document.body)
    expect(document.documentElement.dataset.print).toBe('anmeldezettel')
  })

  it('nach dem Druckdialog ist der Bogen fort — die Codes darauf melden an', async () => {
    const { container } = zeige(person(), { anmeldeLinks: [link()] })
    fireEvent.click(knopf(container, t.zettelDrucken)!)
    await waitFor(() => expect(drucken).toHaveBeenCalled())
    fireEvent(window, new Event('afterprint'))
    await waitFor(() => expect(document.querySelector('.anmelde-bogen')).toBeNull())
    expect(document.documentElement.dataset.print).toBeUndefined()
  })

  it('auch aus dem Blatt — das sich dabei schließt', async () => {
    const { container } = zeige(person())
    fireEvent.click(knopf(oeffnen(container), t.zettelDrucken)!)
    await waitFor(() => expect(drucken).toHaveBeenCalled())
    expect(blatt()).toBeNull()
  })

  it('kommt kein Link zurück, wird nichts gedruckt — es sagt, warum', async () => {
    linksAusstellen.mockResolvedValue({ links: [], fehler: true })
    const { container, dispatch } = zeige(person(), { anmeldeLinks: [link()] })
    fireEvent.click(knopf(container, t.zettelDrucken)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.linkFehler))
    expect(drucken).not.toHaveBeenCalled()
    expect(document.querySelector('.anmelde-bogen')).toBeNull()
  })
})

/**
 * **Offline geht kein Link hinaus.** Der Reducer weist Schreib-Aktionen im
 * Offline-Stand ab (`readonly.ts`), aber nur den Reducer: Die Function ruft
 * die Karte unmittelbar. Ein Link, der dabei entstünde, ersetzte den alten,
 * und der Zustand erführe es nie.
 */
describe('Konto-Karte im Offline-Stand', () => {
  const OFFLINE = { staleAt: Date.now() - 3600_000 }

  it('stellt keinen Link für eine Nachricht aus', async () => {
    const { container, dispatch } = zeige(person(), OFFLINE)
    fireEvent.click(knopf(oeffnen(container), t.kopierenBtn)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.offlineReadOnly))
    expect(linksAusstellen).not.toHaveBeenCalled()
  })

  it('druckt keinen Zettel', async () => {
    window.print = vi.fn()
    const { container, dispatch } = zeige(person(), { ...OFFLINE, anmeldeLinks: [link()] })
    fireEvent.click(knopf(container, t.zettelDrucken)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.offlineReadOnly))
    expect(linksAusstellen).not.toHaveBeenCalled()
    expect(window.print).not.toHaveBeenCalled()
  })
})
