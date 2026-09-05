/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { initialState } from '../app/init'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Invite, Member, Person } from '../data/types'

/**
 * **Die Konto-Karte — wie ein Verkündiger überhaupt in die App kommt.**
 *
 * Sie hat genau drei Zustände, und jeder bietet etwas anderes an:
 * Konto verknüpft · offener Code · noch nichts. Steht der falsche da, erzeugt
 * der Koordinator einen zweiten Code für jemanden, der längst angemeldet ist.
 *
 * Der Versandweg hat einen **Rückfall**, der gemessen sein will: Mit eigener
 * Mail-Domain verschickt der Server (`send-invite`); ohne sie öffnet sich das
 * Mail-Programm des Koordinators (`mailto:`). Beides muss aus demselben Tipp
 * herauskommen — der Koordinator soll nicht wissen müssen, ob die Domain
 * gerade eingerichtet ist. (Stand August 2026 ist sie es nicht.)
 */

interface MailErgebnis { ok: boolean; sent: number; skipped: number; notConfigured: boolean }
const copyText = vi.fn((_text: string) => Promise.resolve(true))
const sendInviteMails = vi.fn((_liste: Array<{ personId: string; code: string }>) =>
  Promise.resolve<MailErgebnis>({ ok: true, sent: 1, skipped: 0, notConfigured: false }),
)

vi.mock('../lib/clipboard', () => ({ copyText: (text: string) => copyText(text) }))
vi.mock('../lib/invite', () => ({
  sendInviteMails: (liste: Array<{ personId: string; code: string }>) => sendInviteMails(liste),
}))

const { KontoCard } = await import('./KontoCard')

const t = dict('de')

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(), ...over,
})

function zeige(p: Person, over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: [p], members: [], invites: [],
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

const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

beforeEach(() => {
  copyText.mockClear().mockResolvedValue(true)
  sendInviteMails.mockClear().mockResolvedValue({ ok: true, sent: 1, skipped: 0, notConfigured: false })
  // `location.href` wird beim mailto:-Rückfall gesetzt — in jsdom nicht
  // schreibbar, deshalb ein Ersatzobjekt mit allen Feldern, die die App liest.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '', pathname: '/', search: '', hash: '', origin: 'https://app.test' },
  })
})
afterEach(cleanup)

describe('Zustand 1: Person hat schon ein Konto', () => {
  const MITGLIED: Member[] = [{ userId: 'u9', personId: 'p-a', email: 'anton@example.org', planner: false }]

  it('nennt die Adresse und bietet nichts zum Einladen an', () => {
    const { container } = zeige(person(), { members: MITGLIED })
    expect(container.querySelector('.konto-mail')?.textContent).toContain('anton@example.org')
    expect(knopf(container, t.einladenBtn)).toBeUndefined()
  })

  it('ohne hinterlegte Adresse steht wenigstens, dass es verknüpft ist', () => {
    const { container } = zeige(person(), {
      members: [{ userId: 'u9', personId: 'p-a', email: '', planner: false }],
    })
    expect(container.querySelector('.konto-mail')?.textContent).toContain(t.kontoVerknuepft)
  })

  it('die Verknüpfung lässt sich lösen', () => {
    const { container, dispatch } = zeige(person(), { members: MITGLIED })
    fireEvent.click(container.querySelector('.svc-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeMember', userId: 'u9' })
  })

  it('das eigene Konto nicht — man sperrte sich selbst aus', () => {
    const { container } = zeige(person(), {
      members: [{ userId: 'u1', personId: 'p-a', email: 'ich@example.org', planner: true }],
      userId: 'u1',
    })
    expect(container.querySelector('.svc-remove')).toBeNull()
    expect(container.querySelector('.mem-du')?.textContent).toBe(t.duMarker)
  })
})

describe('Zustand 2: es liegt ein offener Code', () => {
  const CODE: Invite[] = [{ id: 'i1', code: 'ABC12345', personId: 'p-a', planner: false }]

  it('der Code steht sichtbar da, mit der Erklärung was er ist', () => {
    const { container } = zeige(person(), { invites: CODE })
    expect(container.querySelector('.mem-code')?.textContent).toBe('ABC12345')
    expect(container.querySelector('.panel-hint')?.textContent).toBe(t.codeOffenHint)
  })

  it('„Kopieren" legt Einladungstext samt App-Adresse in die Zwischenablage', () => {
    const { container } = zeige(person(), { invites: CODE })
    fireEvent.click(knopf(container, t.kopierenBtn)!)
    expect(copyText.mock.calls[0]![0]).toContain('ABC12345')
    expect(copyText.mock.calls[0]![0]).toContain('http')
  })

  it('klappt das Kopieren nicht, steht wenigstens der Code als Hinweis da', () => {
    // Sonst stünde der Koordinator ohne Code und ohne Erklärung da.
    copyText.mockResolvedValue(false)
    const { container, dispatch } = zeige(person(), { invites: CODE })
    fireEvent.click(knopf(container, t.kopierenBtn)!)
    return waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: 'ABC12345' }),
    )
  })

  it('„Teilen" nutzt die Teilen-Funktion des Geräts, wenn es eine hat', async () => {
    const share = vi.fn((_daten: { text?: string }) => Promise.resolve())
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    const { container } = zeige(person(), { invites: CODE })
    fireEvent.click(knopf(container, t.teilenBtn)!)
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(share.mock.calls[0]![0].text).toContain('ABC12345')
    expect(copyText).not.toHaveBeenCalled()
    Reflect.deleteProperty(navigator, 'share')
  })

  it('hat es keine, fällt „Teilen" auf das Kopieren zurück', async () => {
    Reflect.deleteProperty(navigator, 'share')
    const { container } = zeige(person(), { invites: CODE })
    fireEvent.click(knopf(container, t.teilenBtn)!)
    await waitFor(() => expect(copyText).toHaveBeenCalled())
  })

  it('ein abgebrochenes Teilen bleibt folgenlos — es ist kein Fehler', async () => {
    const share = vi.fn(() => Promise.reject(new Error('abgebrochen')))
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    const { container, dispatch } = zeige(person(), { invites: CODE })
    fireEvent.click(knopf(container, t.teilenBtn)!)
    await waitFor(() => expect(share).toHaveBeenCalled())
    expect(dispatch.mock.calls.some((c) => c[0].type === 'showToast')).toBe(false)
    Reflect.deleteProperty(navigator, 'share')
  })

  it('„E-Mail" steht nur bei hinterlegter Adresse — sonst führte es ins Leere', () => {
    expect(knopf(zeige(person(), { invites: CODE }).container, t.mailBtn)).toBeUndefined()
    cleanup()
    const { container } = zeige(person({ mail: 'anton@example.org' }), { invites: CODE })
    expect(knopf(container, t.mailBtn)).toBeTruthy()
  })

  it('mit eigener Domain verschickt der Server und meldet es', async () => {
    const { container, dispatch } = zeige(person({ mail: 'anton@example.org' }), { invites: CODE })
    fireEvent.click(knopf(container, t.mailBtn)!)
    await waitFor(() => expect(sendInviteMails).toHaveBeenCalledWith([
      { personId: 'p-a', code: 'ABC12345' },
    ]))
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastInviteMail }),
    )
    expect(window.location.href).toBe('')
  })

  it('ohne Domain öffnet sich stattdessen das Mail-Programm — mit Betreff und Code', async () => {
    sendInviteMails.mockResolvedValue({ ok: false, sent: 0, skipped: 1, notConfigured: true })
    const { container } = zeige(person({ mail: 'anton@example.org' }), { invites: CODE })
    fireEvent.click(knopf(container, t.mailBtn)!)
    await waitFor(() => expect(window.location.href).toContain('mailto:anton@example.org'))
    expect(decodeURIComponent(window.location.href)).toContain('ABC12345')
  })

  it('der Code lässt sich zurückziehen', () => {
    const { container, dispatch } = zeige(person(), { invites: CODE })
    fireEvent.click(container.querySelector('.svc-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeInvite', id: 'i1' })
  })
})

describe('Zustand 3: noch nichts — einladen', () => {
  it('mit Adresse verspricht der Hinweis eine fertige Mail', () => {
    const { container } = zeige(person({ mail: 'anton@example.org' }))
    expect(container.querySelector('.panel-hint')?.textContent).toBe(t.einladenHintMail)
  })

  it('ohne Adresse verspricht er Teilen und Kopieren', () => {
    const { container } = zeige(person())
    expect(container.querySelector('.panel-hint')?.textContent).toBe(t.einladenHintOhneMail)
  })

  it('„Einladen" erzeugt einen Code für genau diese Person', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.click(knopf(container, t.einladenBtn)!)
    const invite = dispatch.mock.calls.find((c) => c[0].type === 'addInvite')![0].invite
    expect(invite.personId).toBe('p-a')
    expect(invite.code).toMatch(/^[A-Z0-9]{8}$/)
  })

  it('ohne Adresse bleibt es beim Code — es wird nichts verschickt', async () => {
    const { container } = zeige(person())
    fireEvent.click(knopf(container, t.einladenBtn)!)
    await waitFor(() => expect(copyText).not.toHaveBeenCalled())
    expect(sendInviteMails).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('mit Adresse geht die Mail gleich mit raus', async () => {
    const { container, dispatch } = zeige(person({ mail: 'anton@example.org' }))
    fireEvent.click(knopf(container, t.einladenBtn)!)
    await waitFor(() => expect(sendInviteMails).toHaveBeenCalled())
    expect(sendInviteMails.mock.calls[0]![0][0]!.personId).toBe('p-a')
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastInviteMail }),
    )
  })

  it('scheitert der Versand, öffnet sich das Mail-Programm — derselbe eine Tipp', async () => {
    sendInviteMails.mockResolvedValue({ ok: false, sent: 0, skipped: 1, notConfigured: true })
    const { container } = zeige(person({ mail: 'anton@example.org' }))
    fireEvent.click(knopf(container, t.einladenBtn)!)
    await waitFor(() => expect(window.location.href).toContain('mailto:anton@example.org'))
  })
})

/**
 * **Offline entsteht kein Code — also darf auch keine Mail hinausgehen.**
 *
 * Der Reducer weist Schreib-Aktionen im Offline-Stand ab (`readonly.ts`), aber
 * nur den Reducer: Der Code entsteht im Baustein, `addInvite` verpufft, und die
 * Mail ging trotzdem hinaus — mit einem Code, den `redeem_invite` nicht kennt.
 * Der Eingeladene stünde vor einer Anmeldung, die nicht funktioniert, und
 * niemand wüsste warum.
 */
describe('Konto-Karte im Offline-Stand', () => {
  it('lädt niemanden ein', async () => {
    const { container, dispatch } = zeige(person({ mail: 'a@example.org' }), {
      staleAt: Date.now() - 3600_000,
    })
    fireEvent.click(knopf(container, t.einladenBtn)!)

    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.offlineReadOnly }),
    )
    expect(sendInviteMails).not.toHaveBeenCalled()
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addInvite')).toBe(false)
  })
})
