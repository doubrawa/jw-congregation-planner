/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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
import type { AnmeldeLink, Member, Person } from '../data/types'
import type { Ausgestellt, AusgestellterLink } from '../lib/links-ausstellen'

/**
 * **Die Konto-Karte — wie ein Verkündiger in die App kommt** (T121, Phase 8;
 * Entwürfe `GPerson`, `GEinladen`).
 *
 * Drei Lagen, und jede bietet etwas anderes an: angemeldet · mit Link ·
 * ohne Link. Den Link gibt es per E-Mail oder auf einem Zettel. Der Versand hat
 * einen **Rückfall**, der gemessen sein will: Kann der Server nicht senden,
 * öffnet sich dieselbe E-Mail im eigenen Mail-Programm — aus demselben Tipp.
 * Der Admin soll nicht wissen müssen, ob der Versand gerade eingerichtet ist.
 */

const linksAusstellen = vi.fn((_ids: readonly string[], _wie: { senden: boolean; lang: string }) =>
  Promise.resolve<Ausgestellt>({ links: [], mailBereit: true, fehler: false }),
)
// Nur der Aufruf der Function ist nachgestellt — was der Zustand daraus macht, ist echt.
vi.mock('../lib/links-ausstellen', async (echt) => ({
  ...(await echt<typeof import('../lib/links-ausstellen')>()),
  linksAusstellen: (ids: readonly string[], wie: { senden: boolean; lang: string }) => linksAusstellen(ids, wie),
}))

const { KontoCard } = await import('./KontoCard')

const t = dict('de')

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(), ...over,
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
const ausgestellt = (gesendet: boolean): AusgestellterLink => ({
  personId: 'p-a',
  url: `https://versammlung.app/#anmelden=${'T'.repeat(43)}`,
  zettelUrl: 'https://versammlung.app/#code=K7RD2QWM',
  code: 'K7RD-2QWM',
  gueltigBis: '2026-11-14T09:00:00.000Z',
  gesendet,
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
  linksAusstellen.mockReset().mockResolvedValue({ links: [ausgestellt(true)], mailBereit: true, fehler: false })
  // `location.href` wird beim mailto:-Rückfall gesetzt — in jsdom nicht
  // schreibbar, deshalb ein Ersatzobjekt mit allen Feldern, die die App liest.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '', pathname: '/', search: '', hash: '', origin: 'https://app.test' },
  })
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
    expect(container.querySelector('.konto-karte > .spur .spur-wert')?.textContent).toBe('4. Sept.')
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
    fireEvent.click(container.querySelector('.konto-entfernen')!)
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

  it('abgelaufen sagt es das — und dass ein neuer wieder 30 Tage gilt', () => {
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
  it('mit Adresse verspricht der Hinweis die E-Mail', () => {
    const { container } = zeige(person({ mail: 'anton@example.org' }))
    expect(container.querySelector('.konto-hinweis')?.textContent).toBe(fill(t.ohneLinkHintMail, { name: 'Anton' }))
  })

  it('ohne Adresse den Zettel', () => {
    const { container } = zeige(person())
    expect(container.querySelector('.konto-hinweis')?.textContent).toBe(fill(t.ohneLinkHintZettel, { name: 'Anton' }))
  })

  it('„Link senden" ist der nächste Schritt — hervorgehoben — und öffnet das Blatt', () => {
    const { container } = zeige(person())
    expect(knopf(container, t.linkSenden)?.className).toBe('knopf-pille knopf-pille--akzent')
    expect(oeffnen(container)).not.toBeNull()
  })
})

describe('Das Blatt „Link senden"', () => {
  it('nennt die Adresse und sendet an genau diese Person — mit Versand, in der Sprache der Versammlung', async () => {
    const b = oeffnen(zeige(person({ mail: 'anton@example.org' })).container)
    expect(b.querySelector('.link-adresse')?.textContent).toBe('anton@example.org')
    fireEvent.click(knopf(b, t.linkSenden)!)
    await waitFor(() => expect(linksAusstellen).toHaveBeenCalledWith(['p-a'], { senden: true, lang: 'de' }))
  })

  it('ohne Adresse kein Senden — der Hinweis sagt, woran es liegt', () => {
    const b = oeffnen(zeige(person()).container)
    expect(knopf(b, t.linkSenden)).toBeUndefined()
    expect(b.textContent).toContain(fill(t.keineAdresseHint, { name: 'Anton' }))
  })

  it('gesendet: Meldung, der Link kommt in den Zustand, das Blatt geht zu', async () => {
    const { container, dispatch } = zeige(person({ mail: 'anton@example.org' }))
    fireEvent.click(knopf(oeffnen(container), t.linkSenden)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(fill(t.toastLinkGesendet, { name: 'Anton' })))
    const aktion = aktionen(dispatch).find((a) => a.type === 'linksAusgestellt')
    expect(aktion).toMatchObject({ links: [{ personId: 'p-a', gueltigBis: '2026-11-14T09:00:00.000Z', benutztAt: null }] })
    await waitFor(() => expect(blatt()).toBeNull())
  })

  it('nimmt der Versand sie nicht an, sagt es das — und das Blatt bleibt für den Zettel offen', async () => {
    linksAusstellen.mockResolvedValue({ links: [ausgestellt(false)], mailBereit: true, fehler: false })
    const { container, dispatch } = zeige(person({ mail: 'anton@example.org' }))
    fireEvent.click(knopf(oeffnen(container), t.linkSenden)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(fill(t.toastMailFehler, { name: 'Anton' })))
    expect(blatt()).not.toBeNull()
  })

  it('kann die App nicht senden, öffnet sich dieselbe E-Mail im eigenen Mail-Programm — derselbe eine Tipp', async () => {
    linksAusstellen
      .mockResolvedValueOnce({ links: [], mailBereit: false, fehler: false })
      .mockResolvedValueOnce({ links: [ausgestellt(false)], mailBereit: false, fehler: false })
    const { container, dispatch } = zeige(person({ mail: 'anton@example.org' }))
    fireEvent.click(knopf(oeffnen(container), t.linkSenden)!)
    await waitFor(() => expect(window.location.href).toContain('mailto:anton@example.org?subject='))
    expect(linksAusstellen).toHaveBeenNthCalledWith(2, ['p-a'], { senden: false, lang: 'de' })
    const mail = decodeURIComponent(window.location.href)
    expect(mail).toContain(`#anmelden=${'T'.repeat(43)}`)
    // Wie die Mail des Servers: mit dem Code für die App vom Home-Bildschirm.
    expect(mail).toContain('\nK7RD-2QWM\n')
    expect(mail).toContain('Anton')
    expect(aktionen(dispatch).some((a) => a.type === 'linksAusgestellt')).toBe(true)
  })

  it('eine Adresse mit „?" hängt keine Kopfzeilen an den Entwurf', async () => {
    linksAusstellen
      .mockResolvedValueOnce({ links: [], mailBereit: false, fehler: false })
      .mockResolvedValueOnce({ links: [ausgestellt(false)], mailBereit: false, fehler: false })
    const { container } = zeige(person({ mail: 'anton@example.org?bcc=fremd@example.org' }))
    fireEvent.click(knopf(oeffnen(container), t.linkSenden)!)
    await waitFor(() => expect(window.location.href).toContain('mailto:'))
    expect(window.location.href.split('?')[0]).toBe('mailto:anton@example.org%3Fbcc%3Dfremd@example.org')
  })

  it('antwortet der Server nicht, sagt es das', async () => {
    linksAusstellen.mockResolvedValue({ links: [], mailBereit: false, fehler: true })
    const { container, dispatch } = zeige(person({ mail: 'anton@example.org' }))
    fireEvent.click(knopf(oeffnen(container), t.linkSenden)!)
    await waitFor(() => expect(toasts(dispatch)).toContain(t.linkFehler))
    expect(window.location.href).toBe('')
  })

  it('mit Link warnt es: Ein neuer ersetzt den alten, auch den Zettel', () => {
    expect(oeffnen(zeige(person()).container).textContent).not.toContain(t.neuerLinkErsetzt)
    cleanup()
    expect(oeffnen(zeige(person(), { anmeldeLinks: [link()] }).container).textContent).toContain(t.neuerLinkErsetzt)
  })
})

describe('Zettel drucken', () => {
  const drucken = vi.fn()
  beforeEach(() => {
    drucken.mockReset()
    window.print = drucken
    linksAusstellen.mockResolvedValue({ links: [ausgestellt(false)], mailBereit: false, fehler: false })
  })
  afterEach(() => fireEvent(window, new Event('afterprint')))

  it('stellt einen Link ohne Versand aus und druckt den Zettel: Name, Code, bis wann, QR-Code', async () => {
    const { container } = zeige(person(), { anmeldeLinks: [link()] })
    fireEvent.click(knopf(container, t.zettelDrucken)!)
    await waitFor(() => expect(drucken).toHaveBeenCalled())
    expect(linksAusstellen).toHaveBeenCalledWith(['p-a'], { senden: false, lang: 'de' })
    const zettel = document.querySelector('.anmelde-zettel')!
    expect(zettel.querySelector('.anmelde-name')?.textContent).toBe('Anton Alt')
    expect(zettel.querySelector('.anmelde-code')?.textContent).toBe('K7RD-2QWM')
    expect(zettel.textContent).toContain(fill(t.gueltigBisDatum, { datum: '14. November' }))
    expect(zettel.querySelector('.anmelde-qr path')?.getAttribute('d')).toMatch(/^M\d+ \d+h\d+v1h-\d+z/)
    expect(zettel.textContent).toContain(fill(t.zettelAnleitung, { adresse: 'versammlung.app', frage: t.ohneMailFrage }))
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
    linksAusstellen.mockResolvedValue({ links: [], mailBereit: false, fehler: true })
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

  it('sendet keinen Link', async () => {
    const { container, dispatch } = zeige(person({ mail: 'anton@example.org' }), OFFLINE)
    fireEvent.click(knopf(oeffnen(container), t.linkSenden)!)
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
