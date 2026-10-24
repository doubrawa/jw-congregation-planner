/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { QUALIFICATION_ORDER, ROLE_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { emptyQualifications, serviceQualKey } from '../data/helpers'
import { dict, ROLE_KEY } from '../i18n/ui'
import { fill } from '../i18n/useT'
import type { Group, Member, Person, Service } from '../data/types'
import { PersonDetail } from './PersonDetail'

/**
 * **Eine Person — das einzige Formular, das die Planung wirklich steuert**
 * (T121, Entwurf `GPerson`).
 *
 * `PrivToggle.test.tsx` prüft die Kopplungen an den Schaltern und die Rechte,
 * `bereiche.test.ts` die Gruppen der Aufgabenbereiche. Hier steht, was die
 * Ansicht und ihre beiden Blätter selbst zusagen:
 *
 * - **Person bearbeiten**: Der Name gilt erst beim Schließen, und nur, wenn er
 *   geht — doppelt oder leer bleibt der alte (T110). Alles Übrige gilt sofort.
 * - **Aufgabenbereiche** als Chips, geändert im Blatt — dort mit einem Schalter
 *   für jeden Bereich. Fehlt einer, lässt sich die Qualifikation nirgends
 *   setzen, und der zugehörige Platz bleibt für immer offen.
 * - **Entfernen mit zwei Tipps**: Es löst Gruppen- und Konto-Verknüpfungen,
 *   nimmt den Anmelde-Link mit und ist nicht rückgängig zu machen.
 * - Die **Familie** ist symmetrisch und darf niemanden doppelt anbieten — auch
 *   die Person selbst nicht.
 */

vi.mock('../lib/clipboard', () => ({ copyText: vi.fn(() => Promise.resolve(true)) }))
vi.mock('../lib/links-ausstellen', () => ({
  linksAusstellen: vi.fn(() => Promise.resolve({ links: [], mailBereit: true, fehler: false })),
  alsAnmeldeLink: vi.fn(),
}))

const t = dict('de')

const person = (over: Partial<Person> = {}): Person => ({
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '0123', mail: 'anton@example.org', priv: emptyQualifications(), grp: null, ...over,
})

const BRAND = person({ id: 'p-b', fn: 'Bernd', ln: 'Brand' })
const COHN = person({ id: 'p-c', fn: 'Clara', ln: 'Cohn', female: true })

const GRUPPEN: Group[] = [{ id: 'g1', name: 'Gruppe 1', overseerId: null, assistantId: null }]
const DIENSTE: Service[] = [
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'eingang', name: 'Ordner', count: 1, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

function zeige(p: Person, over: Partial<AppState> = {}, spalte = false) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'personen', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', planner: true,
    persons: [p, BRAND, COHN], groups: GRUPPEN, services: DIENSTE,
    members: [], anmeldeLinks: [], weeks: [], fsWeeks: [], absences: [],
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <PersonDetail person={p} spalte={spalte} />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const patches = (dispatch: ReturnType<typeof vi.fn>) =>
  dispatch.mock.calls.filter((c) => c[0].type === 'updatePerson').map((c) => c[0].patch)
const knopf = (wo: ParentNode, text: string) =>
  [...wo.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)!
/** Ein Blatt, am Dokument (Portal) — erkannt an seiner Beschriftung. */
const blatt = (label: string) => document.querySelector<HTMLElement>(`[role="dialog"][aria-label="${label}"]`)
const bearbeiten = (c: HTMLElement) => {
  fireEvent.click(c.querySelector(`[aria-label="${t.personBearbeiten}"]`)!)
  return blatt(t.personBearbeiten)!
}
const bereicheAendern = (c: HTMLElement) => {
  fireEvent.click(knopf(c, t.aendern))
  return blatt(t.aufgabenbereiche)!
}
const feld = (b: HTMLElement, id: string) => b.querySelector<HTMLInputElement>(`#${id}`)!
const schalterIn = (b: HTMLElement, titel: string) =>
  [...b.querySelectorAll(`section[aria-label="${titel}"] [role="switch"]`)].map((s) => s.getAttribute('aria-label') ?? '')

beforeEach(() => {
  // Das Herunterwischen der Blätter fragt nach der Breite; jsdom kennt keine.
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '', pathname: '/', search: '', hash: '', origin: 'https://app.test' },
  })
})
afterEach(cleanup)

describe('Der Kopf', () => {
  it('nennt Namen, Gruppe und Rolle', () => {
    const { container } = zeige(person({ grp: 'g1', role: 'aeltester' }))
    expect(container.querySelector('.person-name')?.textContent).toBe('Anton Alt')
    expect(container.querySelector('.person-unter')?.textContent).toBe('Gruppe 1 · Ältester')
  })

  it('der Ring ist voll, wenn die Person angemeldet ist — sonst gestrichelt', () => {
    const konto: Member[] = [{ userId: 'u9', personId: 'p-a', email: '', planner: false, zuteiler: false }]
    expect(zeige(person(), { members: konto }).container.querySelector('.person-bild')?.className).toContain(
      'is-angemeldet',
    )
    cleanup()
    expect(zeige(person()).container.querySelector('.person-bild')?.className).not.toContain('is-angemeldet')
  })

  it('am Handy führt Zurück zur Liste — am Desktop (rechts neben der Liste) gibt es kein Zurück', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yZurueck}"]`)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'selectPerson', id: null })
    cleanup()
    const desktop = zeige(person(), {}, true).container
    expect(desktop.querySelector(`[aria-label="${t.a11yZurueck}"]`)).toBeNull()
    expect(desktop.querySelector(`[aria-label="${t.personBearbeiten}"]`)).not.toBeNull()
  })

  it('die Konto-Karte gibt es nur angemeldet — ohne Konto (Entwicklerseite) gibt es keine Konten', () => {
    expect(zeige(person()).container.querySelector('.konto-karte')).not.toBeNull()
    cleanup()
    expect(zeige(person(), { userId: null }).container.querySelector('.konto-karte')).toBeNull()
  })
})

describe('Person bearbeiten: die Felder', () => {
  it('alle vier Felder stehen da und tragen ihren Wert', () => {
    const b = bearbeiten(zeige(person()).container)
    expect(feld(b, 'pers-fn').value).toBe('Anton')
    expect(feld(b, 'pers-ln').value).toBe('Alt')
    expect(feld(b, 'pers-tel').value).toBe('0123')
    expect(feld(b, 'pers-mail').value).toBe('anton@example.org')
  })

  it('Telefon und E-Mail gelten sofort, jedes nur für sich', () => {
    const { container, dispatch } = zeige(person())
    const b = bearbeiten(container)
    fireEvent.change(feld(b, 'pers-tel'), { target: { value: '0456' } })
    fireEvent.change(feld(b, 'pers-mail'), { target: { value: 'neu@x.de' } })
    expect(patches(dispatch)).toEqual([{ tel: '0456' }, { mail: 'neu@x.de' }])
  })

  it('ein fehlender Wert ergibt ein leeres Feld, kein „undefined"', () => {
    const b = bearbeiten(zeige(person({ tel: '' })).container)
    expect(feld(b, 'pers-tel').value).toBe('')
  })
})

/**
 * **Der Name gilt erst beim Schließen** (T121, Phase 6b).
 *
 * Bis dahin schrieb jeder Tastendruck den Namen in Zustand und Wochen; auf dem
 * Weg von „Bernd" zu „Bernd jun." stand für einen Moment die Dublette da, und
 * wer beide Felder leerte und ging, dem verwarf die App die Person samt Zeile in
 * der Datenbank. Jetzt bleibt der Name im Blatt, bis es zugeht.
 */
describe('Person bearbeiten: der Name', () => {
  const tippen = (b: HTMLElement, fn: string, ln: string) => {
    fireEvent.change(feld(b, 'pers-fn'), { target: { value: fn } })
    fireEvent.change(feld(b, 'pers-ln'), { target: { value: ln } })
  }

  it('Tippen schreibt nichts — „Fertig" übernimmt den Namen, ohne Leerzeichen am Rand', () => {
    const { container, dispatch } = zeige(person())
    const b = bearbeiten(container)
    tippen(b, ' Andreas ', 'Alt')
    expect(patches(dispatch)).toEqual([])
    fireEvent.click(knopf(b, t.fertig))
    expect(patches(dispatch)).toEqual([{ fn: 'Andreas', ln: 'Alt' }])
    expect(blatt(t.personBearbeiten)).toBeNull()
  })

  it('auch das ✕ übernimmt — geändert ist geändert', () => {
    const { container, dispatch } = zeige(person())
    const b = bearbeiten(container)
    tippen(b, 'Andreas', 'Alt')
    fireEvent.click(b.querySelector(`[aria-label="${t.a11yClose}"]`)!)
    expect(patches(dispatch)).toEqual([{ fn: 'Andreas', ln: 'Alt' }])
  })

  it('unverändert schreibt das Schließen nichts', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.click(knopf(bearbeiten(container), t.fertig))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('meldet am Feld, wer den Namen schon trägt — Schreibweise und Leerzeichen zählen nicht', () => {
    const b = bearbeiten(zeige(person()).container)
    tippen(b, 'bernd  ', ' BRAND')
    expect(b.querySelector('[role="alert"]')?.textContent).toContain('Bernd Brand')
    // Beide Felder, nicht nur eines — die Regel gilt dem Paar. Telefon ist unbeteiligt.
    expect(feld(b, 'pers-fn').getAttribute('aria-invalid')).toBe('true')
    expect(feld(b, 'pers-ln').getAttribute('aria-invalid')).toBe('true')
    expect(feld(b, 'pers-tel').getAttribute('aria-invalid')).toBeNull()
  })

  it('ein doppelter Name bleibt beim Schließen draußen — der alte gilt, und ein Hinweis sagt warum', () => {
    const { container, dispatch } = zeige(person())
    const b = bearbeiten(container)
    tippen(b, 'Bernd', 'Brand')
    fireEvent.click(knopf(b, t.fertig))
    expect(patches(dispatch)).toEqual([])
    expect(dispatch).toHaveBeenCalledWith({
      type: 'showToast', text: fill(t.toastNameNichtGeaendert, { name: 'Bernd Brand' }),
    })
  })

  it('ein leerer Name ebenso — die Person bleibt, wie sie war', () => {
    const { container, dispatch } = zeige(person())
    const b = bearbeiten(container)
    tippen(b, '  ', '')
    expect(b.querySelector('[role="alert"]')?.textContent).toBe(t.toastNameLeer)
    fireEvent.click(knopf(b, t.fertig))
    expect(patches(dispatch)).toEqual([])
    expect(dispatch).toHaveBeenCalledWith({ type: 'showToast', text: t.toastNameLeer })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'removePerson')).toBe(false)
  })

  it('der eigene Name ist keine Dublette — sonst ließe sich niemand bearbeiten', () => {
    const b = bearbeiten(zeige(person()).container)
    expect(b.querySelector('[role="alert"]')).toBeNull()
  })
})

describe('Person bearbeiten: Geschlecht, Rolle, Gruppe', () => {
  it('das Geschlecht steht als Wahl mit gedrücktem Zustand — ein Tipp ändert es', () => {
    const { container, dispatch } = zeige(person({ female: true }))
    const b = bearbeiten(container)
    expect(knopf(b, t.schwester).getAttribute('aria-pressed')).toBe('true')
    expect(knopf(b, t.bruder).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(knopf(b, t.bruder))
    expect(patches(dispatch)).toContainEqual({ female: false })
  })

  it('jede Rolle steht zur Wahl — genau die vier aus der Vorgabe — und gilt sofort', () => {
    const { container, dispatch } = zeige(person({ role: 'aeltester' }))
    const wahl = feld(bearbeiten(container), 'pers-rolle') as unknown as HTMLSelectElement
    expect([...wahl.options].map((o) => o.textContent)).toEqual(ROLE_ORDER.map((r) => t[ROLE_KEY[r]]))
    expect(wahl.value).toBe('aeltester')
    fireEvent.change(wahl, { target: { value: 'dienstamtgehilfe' } })
    expect(patches(dispatch)).toContainEqual({ role: 'dienstamtgehilfe' })
  })

  it('die Gruppe lässt sich zuweisen und wieder lösen', () => {
    const { container, dispatch } = zeige(person())
    const wahl = feld(bearbeiten(container), 'pers-grp') as unknown as HTMLSelectElement
    expect([...wahl.options].map((o) => o.textContent)).toEqual(['—', 'Gruppe 1'])
    fireEvent.change(wahl, { target: { value: 'g1' } })
    expect(patches(dispatch)).toContainEqual({ grp: 'g1' })
    cleanup()
    const zweiter = zeige(person({ grp: 'g1' }))
    fireEvent.change(feld(bearbeiten(zweiter.container), 'pers-grp'), { target: { value: '' } })
    expect(patches(zweiter.dispatch)).toContainEqual({ grp: null })
  })

  it('ohne angelegte Gruppen fragt es nach keiner', () => {
    expect(bearbeiten(zeige(person(), { groups: [] }).container).querySelector('#pers-grp')).toBeNull()
  })

  /*
    Ein Gruppenwechsel beendet das Amt in der alten Gruppe (`aemterBeenden`,
    14.10.2026) — wer dort Aufseher oder Gehilfe ist, liest das, bevor er
    wechselt. Bei allen anderen steht nichts: Für sie geht nichts verloren.
  */
  it('beim Aufseher und beim Gehilfen steht unter der Gruppe, dass ein Wechsel das Amt beendet', () => {
    // Das Feld verweist auf den Hinweis — ein Vorleseprogramm liest ihn mit,
    // bevor jemand die Gruppe wechselt.
    const hinweisZumFeld = (b: HTMLElement) => {
      const id = feld(b, 'pers-grp').getAttribute('aria-describedby')
      return id ? b.querySelector(`[id="${id}"]`)?.textContent : undefined
    }
    const aufseher = zeige(person({ grp: 'g1', role: 'aeltester' }), {
      groups: [{ ...GRUPPEN[0]!, overseerId: 'p-a' }],
    })
    expect(hinweisZumFeld(bearbeiten(aufseher.container))).toBe(t.gruppeWechselAufseher)
    cleanup()
    const gehilfe = zeige(person({ grp: 'g1' }), { groups: [{ ...GRUPPEN[0]!, assistantId: 'p-a' }] })
    expect(hinweisZumFeld(bearbeiten(gehilfe.container))).toBe(t.gruppeWechselGehilfe)
  })

  it('wer in seiner Gruppe kein Amt hat, liest keinen Hinweis', () => {
    // Bernd ist Aufseher, Anton nur Mitglied derselben Gruppe.
    const b = bearbeiten(zeige(person({ grp: 'g1' }), { groups: [{ ...GRUPPEN[0]!, overseerId: 'p-b' }] }).container)
    expect(b.textContent).not.toContain(t.gruppeWechselAufseher)
    expect(b.textContent).not.toContain(t.gruppeWechselGehilfe)
    expect(feld(b, 'pers-grp').hasAttribute('aria-describedby')).toBe(false)
  })
})

describe('Person bearbeiten: Familie', () => {
  const auswahl = (b: HTMLElement) => b.querySelector<HTMLSelectElement>(`[aria-label="${t.familieHinzu}"]`)!

  it('ohne Verknüpfung stehen nur die anderen zur Auswahl — nicht man selbst', () => {
    const b = bearbeiten(zeige(person()).container)
    expect([...auswahl(b).options].map((o) => o.textContent)).toEqual([t.familieHinzu, 'Bernd Brand', 'Clara Cohn'])
  })

  it('eine Auswahl verknüpft — eine leere nicht', () => {
    const { container, dispatch } = zeige(person())
    const b = bearbeiten(container)
    fireEvent.change(auswahl(b), { target: { value: '' } })
    expect(dispatch.mock.calls.some((c) => c[0].type === 'setFamily')).toBe(false)
    fireEvent.change(auswahl(b), { target: { value: 'p-c' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFamily', id: 'p-a', memberId: 'p-c', add: true })
  })

  it('bereits Verknüpfte stehen als Chips und nicht mehr in der Auswahl', () => {
    const p = person({ fam: 'f1' })
    const b = bearbeiten(zeige(p, { persons: [p, { ...COHN, fam: 'f1' }, BRAND] }).container)
    expect([...b.querySelectorAll('.person-familie-chip')].map((c) => c.textContent)).toEqual(['Clara Cohn✕'])
    expect([...auswahl(b).options].map((o) => o.textContent)).toEqual([t.familieHinzu, 'Bernd Brand'])
  })

  it('ein Chip lässt sich lösen — erst nach der Rückfrage', () => {
    const p = person({ fam: 'f1' })
    const { container, dispatch } = zeige(p, { persons: [p, { ...COHN, fam: 'f1' }] })
    const b = bearbeiten(container)
    fireEvent.click(b.querySelector('.person-familie-weg')!)
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'setFamily' }))
    expect(b.querySelector('.person-familie-weg')?.textContent).toBe(t.entfernenSicher)
    bestaetigen(b.querySelector('.person-familie-weg')!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFamily', id: 'p-a', memberId: 'p-c', add: false })
  })

  it('erklärt, wozu die Verknüpfung dient — sie wirkt bei den Gesprächspartnern', () => {
    expect(bearbeiten(zeige(person()).container).textContent).toContain(t.familieHint)
  })
})

describe('Aufgabenbereiche', () => {
  it('als Chips nach Gruppen — nur, was die Person hat', () => {
    const p = person({ priv: { ...emptyQualifications(), gebet: true, treffpunkt: true, [serviceQualKey('mik')]: true } })
    const { container } = zeige(p)
    const gruppen = [...container.querySelectorAll('.person-bereiche')].map((g) => [
      g.querySelector('.klein-text')?.textContent,
      [...g.querySelectorAll('.person-chip')].map((c) => c.textContent),
    ])
    expect(gruppen).toEqual([
      [t.navZusammenkuenfte, [t.privGebet]],
      [t.hilfsdienste, ['Mikrofone']],
      [t.tabFs, [t.privTreffpunkt]],
    ])
  })

  it('ohne gesetzten Bereich sagt die Karte das', () => {
    const { container } = zeige(person())
    expect(container.querySelector('.person-chip')).toBeNull()
    expect(container.textContent).toContain(t.keineBereiche)
  })

  it('„Ändern" öffnet die Schalter: jeder feste Bereich, jede feste Rolle, jeder Dienst — die Gruppen-Rotation nicht', () => {
    // Fehlte einer, ließe er sich nirgends setzen — der zugehörige Platz
    // bliebe für immer offen, ohne dass es auffiele.
    const b = bereicheAendern(zeige(person()).container)
    const alle = [...b.querySelectorAll('[role="switch"]')]
    expect(alle).toHaveLength(QUALIFICATION_ORDER.length + WT_ROLE_ORDER.length + 2)
    expect(schalterIn(b, t.hilfsdienste)).toEqual(['Mikrofone', 'Ordner'])
    expect(schalterIn(b, t.hilfsdienste)).not.toContain('Reinigung')
  })

  it('die festen Rollen tragen ihren Hinweis mit', () => {
    const b = bereicheAendern(zeige(person()).container)
    expect(b.querySelector(`section[aria-label="${t.wtRollenLabel}"]`)?.textContent).toContain(t.wtRollenHint)
  })

  it('ein Schalter schreibt genau seinen Bereich', () => {
    const { container, dispatch } = zeige(person())
    const b = bereicheAendern(container)
    const mik = [...b.querySelectorAll('[role="switch"]')].find((s) => s.getAttribute('aria-label') === 'Mikrofone')!
    fireEvent.click(mik)
    const patch = patches(dispatch).at(-1)!
    expect(Object.keys(patch.priv).filter((k) => patch.priv[k])).toEqual([serviceQualKey('mik')])
  })

  it('ohne konfigurierte Dienste fehlt ihre Gruppe im Blatt', () => {
    const b = bereicheAendern(zeige(person(), { services: [] }).container)
    expect(b.querySelector(`section[aria-label="${t.hilfsdienste}"]`)).toBeNull()
  })
})

describe('Keine Karte „Auslastung" mehr (T136)', () => {
  it('die Zahl der letzten Wochen steht in der Zeitleiste — die Karte mit den Kreisen ist fort', () => {
    // Betreiber 24.10.2026: Zahl und Kreise widersprachen sich, und ob Kommendes
    // mitzählte, sah man nicht. Die Zeitleiste zeigt dieselben acht Wochen.
    const { container } = zeige(person())
    expect(container.querySelector('.person-wochen')).toBeNull()
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).not.toContain('Auslastung')
  })
})

describe('Person entfernen braucht zwei Tipps', () => {
  const entfernen = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('.person-entfernen')!

  it('der erste entfernt nicht, sondern nennt die Folge', () => {
    const { container, dispatch } = zeige(person())
    expect(entfernen(container).textContent).toBe(t.persLoeschen)
    fireEvent.click(entfernen(container))
    expect(dispatch.mock.calls.some((c) => c[0].type === 'removePerson')).toBe(false)
    expect(entfernen(container).textContent).toContain('Anton Alt')
    expect(entfernen(container).className).toContain('is-armed')
  })

  it('erst der zweite entfernt', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.click(entfernen(container))
    bestaetigen(entfernen(container))
    expect(dispatch).toHaveBeenCalledWith({ type: 'removePerson', id: 'p-a' })
  })

  // Seit dem 21.10.2026 geht ihr Konto mit — die Frage sagt es, bevor es geschieht.
  it('hat die Person ein Konto, nennt die Frage auch das', () => {
    const konto = { userId: 'u-a', email: '', personId: 'p-a', planner: false, zuteiler: false }
    const { container } = zeige(person(), { members: [konto] })
    fireEvent.click(entfernen(container))
    expect(entfernen(container).textContent).toContain(t.confirmPersonDelKonto)
  })

  it('ohne Konto — und beim eigenen, das bleibt — steht der Satz nicht da', () => {
    const eigenes = { userId: 'u1', email: '', personId: 'p-a', planner: true, zuteiler: false }
    for (const members of [[], [eigenes]]) {
      const { container } = zeige(person(), { members })
      fireEvent.click(entfernen(container))
      expect(entfernen(container).textContent).not.toContain(t.confirmPersonDelKonto)
      cleanup()
    }
  })

  it('geht der Fokus weg, entschärft er sich wieder', () => {
    const { container, dispatch } = zeige(person())
    fireEvent.click(entfernen(container))
    fireEvent.blur(entfernen(container))
    expect(entfernen(container).textContent).toBe(t.persLoeschen)
    fireEvent.click(entfernen(container))
    expect(dispatch.mock.calls.some((c) => c[0].type === 'removePerson')).toBe(false)
  })
})
