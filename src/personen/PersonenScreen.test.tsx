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
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Group, Invite, Member, Person, Qualifications, Service } from '../data/types'

/**
 * **Die Personenliste — der Arbeitsplatz des Koordinators.**
 *
 * `person-filter.ts` prüft die Filterregeln für sich; hier geht es um das, was
 * der Screen selbst zusagt und was nirgends sonst geprüft ist:
 *
 * - Zwei **Warnungen**, die stille Fehlzuordnungen verhindern: doppelte
 *   Anzeigenamen (die App ordnet Aufgaben dann dem Falschen zu) und doppelt
 *   vergebene feste Rollen (die Auto-Zuteilung greift sich irgendeine, F7).
 * - Die **Sammel-Einladung**: sie erzeugt Codes für alle, die noch keinen
 *   haben — und zwar **nur** für die. Zweimal getippt dürfte sie nicht jedem
 *   einen zweiten Code geben.
 * - Der **Zähler** nennt die *sichtbaren* Personen, nicht alle: so sieht man,
 *   wie stark Suche und Filter gerade einschränken.
 */

interface MailErgebnis { ok: boolean; sent: number; skipped: number; notConfigured: boolean }
const copyText = vi.fn((_text: string) => Promise.resolve(true))
const sendInviteMails = vi.fn((_liste: Array<{ personId: string; code: string }>) =>
  Promise.resolve<MailErgebnis>({ ok: true, sent: 0, skipped: 0, notConfigured: false }),
)

vi.mock('../lib/clipboard', () => ({ copyText: (text: string) => copyText(text) }))
vi.mock('../lib/invite', () => ({
  sendInviteMails: (liste: Array<{ personId: string; code: string }>) => sendInviteMails(liste),
}))
vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false, performLogout: vi.fn() }))

const { PersonenScreen } = await import('./PersonenScreen')

const t = dict('de')

const priv = (...keys: string[]): Qualifications => {
  const q = emptyQualifications()
  for (const k of keys) q[k] = true
  return q
}

const person = (id: string, fn: string, ln: string, over: Partial<Person> = {}): Person => ({
  id, fn, ln, role: 'verkuendiger', female: false, tel: '', mail: '', priv: emptyQualifications(),
  grp: null, ...over,
})

const ALT = person('p-a', 'Anton', 'Alt', { mail: 'anton@example.org' })
const BRAND = person('p-b', 'Bernd', 'Brand', { role: 'aeltester', grp: 'g1' })
const COHN = person('p-c', 'Clara', 'Cohn', { female: true, priv: priv('schulung') })
const PERSONEN = [BRAND, COHN, ALT] // absichtlich unsortiert

const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', ov: null, as: null }]
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'personen',
    dataStatus: 'ready', congregationId: 'c1', userId: 'u1', planner: true,
    persons: PERSONEN, groups: GRUPPEN, services: DIENSTE,
    members: [], invites: [], weeks: [], fsWeeks: [], absences: [],
    selectedPersonId: null,
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PersonenScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const zeilen = (c: HTMLElement) => [...c.querySelectorAll('.pers-row')]
const namen = (c: HTMLElement) => zeilen(c).map((r) => r.querySelector('.pers-name')?.textContent ?? '')
const knopf = (c: HTMLElement, text: string) =>
  [...c.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
const feld = (c: HTMLElement, label: string) =>
  [...c.querySelectorAll<HTMLSelectElement>('select')].find(
    (s) => s.previousElementSibling?.textContent === label,
  )!

beforeEach(() => {
  copyText.mockClear().mockResolvedValue(true)
  sendInviteMails.mockClear().mockResolvedValue({ ok: true, sent: 0, skipped: 0, notConfigured: false })
})
afterEach(cleanup)

describe('Die Liste', () => {
  it('steht alphabetisch nach Nachname — und zeigt „Nachname, Vorname"', () => {
    const { container } = zeige()
    expect(namen(container)).toEqual(['Alt, Anton', 'Brand, Bernd', 'Cohn, Clara'])
  })

  it('jede Zeile nennt Rolle und Zahl der Aufgabenbereiche', () => {
    const { container } = zeige()
    expect(zeilen(container)[2]!.querySelector('.pers-sub')?.textContent).toBe(
      'Verkündiger · 1 Aufgabenbereiche',
    )
    expect(zeilen(container)[1]!.querySelector('.pers-sub')?.textContent).toContain('Ältester')
  })

  it('die feste Wachtturm-Rolle zählt nicht als Aufgabenbereich — sie hat eine eigene Karte', () => {
    const leiter = person('p-l', 'Lars', 'Leiter', { priv: priv('wtLeiter') })
    const { container } = zeige({ persons: [leiter] })
    expect(zeilen(container)[0]!.querySelector('.pers-sub')?.textContent).toContain('0')
  })

  it('ein Tipp öffnet das Detail dieser Person', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(zeilen(container)[0]!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectPerson', id: 'p-a' })
  })

  it('„Neue Person" legt eine leere an — die Kennung kommt vorne dran', () => {
    const { container, dispatch } = zeige()
    fireEvent.click(knopf(container, t.neuePerson))
    const aktion = dispatch.mock.calls.find((c) => c[0].type === 'addPerson')![0]
    expect(aktion.person).toMatchObject({ fn: '', ln: '', role: 'verkuendiger' })
    expect(aktion.person.id).toBeTruthy()
  })
})

describe('Der Zähler nennt die sichtbaren, nicht alle', () => {
  it('ohne Einschränkung alle', () => {
    const { container } = zeige()
    expect(container.querySelector('.screen-head-note')?.textContent).toBe('3 Personen')
  })

  it('mit Suche nur die Treffer — so sieht man, wie stark sie einschränkt', () => {
    const { container } = zeige()
    fireEvent.change(container.querySelector('.pers-search')!, { target: { value: 'alt' } })
    expect(namen(container)).toEqual(['Alt, Anton'])
    expect(container.querySelector('.screen-head-note')?.textContent).toBe('1 Personen')
  })

  it('die Suche findet auch über die E-Mail-Adresse', () => {
    const { container } = zeige()
    fireEvent.change(container.querySelector('.pers-search')!, { target: { value: 'anton@' } })
    expect(namen(container)).toEqual(['Alt, Anton'])
  })

  it('findet nichts, sagt der Zähler 0 — die Liste ist leer, nicht kaputt', () => {
    const { container } = zeige()
    fireEvent.change(container.querySelector('.pers-search')!, { target: { value: 'zzz' } })
    expect(zeilen(container)).toHaveLength(0)
    expect(container.querySelector('.screen-head-note')?.textContent).toBe('0 Personen')
  })
})

describe('Die Filterfelder', () => {
  it('Geschlecht, Rolle, Gruppe und Aufgabenbereich stehen zur Wahl', () => {
    const { container } = zeige()
    expect([...container.querySelectorAll('.pers-filter .field-label')].map((x) => x.textContent)).toEqual([
      t.geschlecht, t.rolle, t.gruppeLbl, t.aufgabenbereiche,
    ])
  })

  it('ohne angelegte Gruppen entfällt die Gruppen-Auswahl — sie hätte nur den Platzhalter', () => {
    const { container } = zeige({ groups: [] })
    expect([...container.querySelectorAll('.pers-filter .field-label')].map((x) => x.textContent)).toEqual([
      t.geschlecht, t.rolle, t.aufgabenbereiche,
    ])
  })

  it('ein gesetzter Filter grenzt ein und hebt sein Feld hervor', () => {
    const { container } = zeige()
    const geschlecht = feld(container, t.geschlecht)
    fireEvent.change(geschlecht, { target: { value: 'w' } })
    expect(namen(container)).toEqual(['Cohn, Clara'])
    expect(geschlecht.className).toContain('is-active')
  })

  it('mehrere Filter wirken zusammen — nicht nebeneinander', () => {
    const { container } = zeige()
    fireEvent.change(feld(container, t.rolle), { target: { value: 'aeltester' } })
    fireEvent.change(feld(container, t.geschlecht), { target: { value: 'w' } })
    expect(zeilen(container)).toHaveLength(0) // ein weiblicher Ältester ist keiner da
  })

  it('die Bereichs-Auswahl führt die festen Bereiche UND jeden Hilfsdienst', () => {
    const { container } = zeige()
    const werte = [...feld(container, t.aufgabenbereiche).querySelectorAll('option')].map(
      (o) => o.getAttribute('value'),
    )
    expect(werte).toContain(serviceQualKey('mik'))
    expect(werte).toContain('schulung')
  })

  it('die Gruppen-Rotation hat keinen Bereich und steht deshalb nicht dabei', () => {
    const { container } = zeige()
    const werte = [...feld(container, t.aufgabenbereiche).querySelectorAll('option')].map(
      (o) => o.getAttribute('value'),
    )
    expect(werte).not.toContain(serviceQualKey('rein'))
  })

  it('die Auswahl steht alphabetisch — man sucht das Wort, nicht die Programmreihenfolge', () => {
    const { container } = zeige()
    const texte = [...feld(container, t.aufgabenbereiche).querySelectorAll('option')]
      .slice(1) // der Platzhalter „—" bleibt vorn
      .map((o) => o.textContent ?? '')
    expect(texte).toEqual([...texte].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })))
  })
})

describe('Warnung vor doppelten Anzeigenamen', () => {
  const ZWEI_MEIER = [
    person('p-1', 'Hans', 'Meier'),
    person('p-2', 'Hans', 'Meier'),
    person('p-3', 'Otto', 'Nord'),
  ]

  it('nennt den Namen und wie viele ihn tragen', () => {
    const { container } = zeige({ persons: ZWEI_MEIER })
    expect(container.querySelector('.pers-dupes-title')?.textContent).toBe(t.dublettenTitle)
    expect(container.querySelector('.pers-dupes-count')?.textContent).toBe('1')
    expect(container.querySelector('.pers-dupes-row')?.textContent).toContain('Hans Meier')
    expect(container.querySelector('.pers-dupes-row')?.textContent).toContain('2')
  })

  it('erklärt, warum das ein Problem ist — sonst wirkt sie schikanös', () => {
    const { container } = zeige({ persons: ZWEI_MEIER })
    expect(container.querySelector('.pers-dupes-hint')?.textContent).toBe(t.dublettenHint)
  })

  it('ein eigener Anzeigename hebt die Dublette auf', () => {
    const entwirrt = [{ ...ZWEI_MEIER[0]!, dn: 'Hans Meier jun.' }, ZWEI_MEIER[1]!, ZWEI_MEIER[2]!]
    const { container } = zeige({ persons: entwirrt })
    expect(container.querySelector('.pers-dupes')).toBeNull()
  })

  it('ohne Dubletten steht die Warnung nicht da', () => {
    expect(zeige().container.querySelector('.pers-dupes')).toBeNull()
  })
})

describe('Warnung vor doppelt vergebenen festen Rollen (F7)', () => {
  it('zwei Wachtturm-Leiter werden gemeldet — die Auto-Zuteilung nähme sonst irgendeinen', () => {
    const { container } = zeige({
      persons: [
        person('p-1', 'Hans', 'Meier', { priv: priv('wtLeiter') }),
        person('p-2', 'Otto', 'Nord', { priv: priv('wtLeiter') }),
      ],
    })
    const warnung = [...container.querySelectorAll('.pers-dupes')].find(
      (x) => x.querySelector('.pers-dupes-title')?.textContent === t.wtRollenLabel,
    )!
    expect(warnung).toBeTruthy()
    expect(warnung.querySelector('.pers-dupes-hint')?.textContent).toBe(t.wtRollenHint)
  })

  it('einer ist kein Problem', () => {
    const { container } = zeige({
      persons: [person('p-1', 'Hans', 'Meier', { priv: priv('wtLeiter') })],
    })
    expect(container.querySelector('.pers-dupes')).toBeNull()
  })
})

describe('Alle ohne Konto einladen', () => {
  const MITGLIED: Member[] = [{ userId: 'u9', personId: 'p-b', email: 'b@x.de', planner: false }]
  const OFFENER_CODE: Invite[] = [
    { id: 'i1', code: 'ABC123', personId: 'p-c', planner: false },
  ]

  it('im Demo-Modus gibt es den Knopf gar nicht — dort gibt es keine Konten', () => {
    const { container } = zeige({ dataStatus: 'demo' })
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === t.alleEinladen)).toBe(
      false,
    )
  })

  it('erzeugt einen Code je Person ohne Konto und ohne offenen Code', async () => {
    const { container, dispatch } = zeige({ members: MITGLIED, invites: OFFENER_CODE })
    fireEvent.click(knopf(container, t.alleEinladen))
    await waitFor(() => expect(dispatch.mock.calls.some((c) => c[0].type === 'addInvite')).toBe(true))
    const codes = dispatch.mock.calls.filter((c) => c[0].type === 'addInvite')
    // Bernd hat ein Konto, Clara einen offenen Code → nur Anton bleibt übrig.
    expect(codes).toHaveLength(1)
    expect(codes[0]![0].invite.personId).toBe('p-a')
  })

  it('legt die Liste zugleich in die Zwischenablage — für alle ohne E-Mail', async () => {
    const { container } = zeige({ members: MITGLIED, invites: OFFENER_CODE })
    fireEvent.click(knopf(container, t.alleEinladen))
    await waitFor(() => expect(copyText).toHaveBeenCalled())
    expect(copyText.mock.calls[0]![0]).toContain('Anton Alt')
  })

  it('verschickt nur an Personen mit hinterlegter Adresse', async () => {
    const { container } = zeige({ members: MITGLIED, invites: OFFENER_CODE })
    fireEvent.click(knopf(container, t.alleEinladen))
    await waitFor(() => expect(sendInviteMails).toHaveBeenCalled())
    expect(sendInviteMails.mock.calls[0]![0]).toEqual([{ personId: 'p-a', code: expect.any(String) }])
  })

  it('meldet, wie viele Codes entstanden und wie viele Mails rausgingen', async () => {
    sendInviteMails.mockResolvedValue({ ok: true, sent: 1, skipped: 0, notConfigured: false })
    const { container, dispatch } = zeige({ members: MITGLIED, invites: OFFENER_CODE })
    fireEvent.click(knopf(container, t.alleEinladen))
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'showToast', text: '1 Codes erstellt · 1 per E-Mail verschickt',
      }),
    )
  })

  it('ohne Mail-Versand nennt es nur die Codes — die Liste steht in der Zwischenablage', async () => {
    sendInviteMails.mockResolvedValue({ ok: false, sent: 0, skipped: 1, notConfigured: true })
    const { container, dispatch } = zeige({ members: MITGLIED, invites: OFFENER_CODE })
    fireEvent.click(knopf(container, t.alleEinladen))
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'showToast', text: '1 Einladungscodes erstellt und als Liste kopiert',
      }),
    )
  })

  it('hat schon jeder ein Konto, sagt es das — statt lautlos nichts zu tun', async () => {
    const alleVersorgt: Member[] = PERSONEN.map((p, i) => ({
      userId: `u${i}`, personId: p.id, email: '', planner: false,
    }))
    const { container, dispatch } = zeige({ members: alleVersorgt })
    fireEvent.click(knopf(container, t.alleEinladen))
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastAlleHabenKonto }),
    )
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addInvite')).toBe(false)
    expect(sendInviteMails).not.toHaveBeenCalled()
  })

  it('eine misslungene Zwischenablage hält den Versand nicht auf — die Codes stehen an der Person', async () => {
    copyText.mockResolvedValue(false)
    const { container, dispatch } = zeige({ members: MITGLIED, invites: OFFENER_CODE })
    fireEvent.click(knopf(container, t.alleEinladen))
    await waitFor(() => expect(sendInviteMails).toHaveBeenCalled())
    expect(dispatch.mock.calls.some((c) => c[0].type === 'addInvite')).toBe(true)
  })
})

describe('Konten ohne verknüpfte Person', () => {
  const WAISE: Member[] = [{ userId: 'u9', personId: null, email: 'wer@example.org', planner: false }]

  it('stehen ganz oben — sonst übersieht man sie', () => {
    const { container } = zeige({ members: WAISE })
    const panel = container.querySelector('.pers-orphans')!
    expect(panel.querySelector('.panel-label')?.textContent).toBe(t.kontenOhnePerson)
    expect(panel.textContent).toContain('wer@example.org')
  })

  it('lassen sich einer Person zuordnen', () => {
    const { container, dispatch } = zeige({ members: WAISE })
    const auswahl = container.querySelector<HTMLSelectElement>('.pers-orphans .mem-select')!
    fireEvent.change(auswahl, { target: { value: 'p-a' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'updateMember', userId: 'u9', patch: { personId: 'p-a' },
    })
  })

  it('bietet nur Personen ohne eigenes Konto an', () => {
    /*
      Die Verknüpfung ist eins zu eins gedacht — die ganze Oberfläche
      unterstellt es: `linkedMember` nimmt das **erste** passende Mitglied, die
      Konto-Karte zeigt genau eines, und `send-plan` wie `send-reminders`
      führen je Person genau eine Konto-Id (`userByPerson`).

      Die Liste bot trotzdem jede Person an. Wurde eine gewählt, die schon ein
      Konto hat, hingen zwei daran: Beide sahen ihre Aufgaben und konnten
      bestätigen, die Benachrichtigung erreichte nur eines von beiden, und die
      Konto-Karte der Person zeigte das zweite nirgends — es ließ sich von dort
      also auch nicht wieder lösen.
    */
    const { container } = zeige({
      members: [...WAISE, { userId: 'u8', personId: 'p-a', email: 'a@x.de', planner: false }],
    })
    const auswahl = container.querySelector<HTMLSelectElement>('.pers-orphans .mem-select')!
    const werte = [...auswahl.options].map((o) => o.value)
    expect(werte, 'Person mit Konto steht zur Wahl').not.toContain('p-a')
    // Gegenprobe: die übrigen stehen sehr wohl zur Wahl.
    expect(werte).toContain('p-b')
  })

  it('oder entfernen', () => {
    const { container, dispatch } = zeige({ members: WAISE })
    fireEvent.click(container.querySelector('.pers-orphans .svc-remove')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'removeMember', userId: 'u9' })
  })

  it('das eigene Konto lässt sich nicht entfernen — man sperrte sich selbst aus', () => {
    const { container } = zeige({
      members: [{ userId: 'u1', personId: null, email: 'ich@example.org', planner: true }],
      userId: 'u1',
    })
    expect(container.querySelector('.pers-orphans .svc-remove')).toBeNull()
    expect(container.querySelector('.mem-du')?.textContent).toBe(t.duMarker)
  })

  it('gibt es keine, steht die Karte nicht da', () => {
    expect(zeige().container.querySelector('.pers-orphans')).toBeNull()
  })

  it('im Demo-Modus ebenso wenig — dort gibt es keine Konten', () => {
    const { container } = zeige({ members: WAISE, dataStatus: 'demo' })
    expect(container.querySelector('.pers-orphans')).toBeNull()
  })
})
