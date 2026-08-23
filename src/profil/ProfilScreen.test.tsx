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
import { FONT_SCALES, THEME_LIST } from '../data/constants'
import { emptyQualifications } from '../data/helpers'
import { dict } from '../i18n/ui'
import type { Member, Person } from '../data/types'

/**
 * **Das Profil — der einzige Ort, an dem jeder Nutzer etwas einstellen kann.**
 *
 * Es ist der Screen, den ein Verkündiger am ehesten öffnet, und er trägt vier
 * Geräte-Einstellungen (Farbschema, Schriftgröße, Sprache, Push) sowie das
 * Abmelden. Drei Zusicherungen daran sind es wert, gemessen zu werden:
 *
 * - Der **Push-Schalter** darf nur da stehen, wo Push wirklich geht. Auf iOS
 *   im Browser steht stattdessen der Hinweis, dass die App erst installiert
 *   werden muss — ein toter Schalter wäre dort schlimmer als keiner.
 * - Der **Schriftgrößen-Regler** hat feste Stufen. Ein unbekannter Wert aus
 *   altem localStorage darf ihn nicht auf −1 setzen.
 * - Die **Gesten-Diagnose** ist absichtlich schwer erreichbar (fünf Antipper).
 *   Fände man sie versehentlich, stünde ein unübersetztes Protokoll im Profil.
 */

const promptInstall = vi.fn(() => Promise.resolve())
const performLogout = vi.fn()
const push = {
  production: true, supported: true, needsInstall: false, subscribed: false,
  enable: vi.fn(() => Promise.resolve(true)),
  disable: vi.fn(() => Promise.resolve()),
}
const installAvail = { wert: false }

vi.mock('../lib/install', () => ({ promptInstall: () => promptInstall() }))
vi.mock('../lib/supabase', () => ({
  supabase: null, isSupabaseConfigured: false,
  performLogout: (d: unknown) => performLogout(d),
}))
vi.mock('../components/usePush', () => ({
  usePush: () => push,
  useInstallAvailable: () => installAvail.wert,
}))

const { ProfilScreen } = await import('./ProfilScreen')

const t = dict('de')

const ICH: Person = {
  id: 'p-a', fn: 'Anton', ln: 'Alt', role: 'verkuendiger', female: false,
  tel: '', mail: '', priv: emptyQualifications(),
}
const MITGLIED: Member[] = [{ userId: 'u1', personId: 'p-a', email: 'anton@example.org', planner: false }]

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...initialState(),
    screen: 'profil', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a',
    persons: [ICH], members: MITGLIED,
    congregation: { name: 'Nordheim', hall: 'Saal', meetings: 'Di 19:00 · So 10:00' },
    ...over,
  }
  function Buehne() {
    const store = useStaticStore(state)
    return (
      <AppDispatchContext.Provider value={dispatch}>
        <AppStoreContext.Provider value={store}>
          <AppStateContext.Provider value={state}>
            <ProfilScreen />
          </AppStateContext.Provider>
        </AppStoreContext.Provider>
      </AppDispatchContext.Provider>
    )
  }
  return { dispatch, ...render(<Buehne />) }
}

const wert = (c: HTMLElement, key: string) =>
  [...c.querySelectorAll('.kv-row')].find((r) => r.querySelector('.kv-key')?.textContent === key)
    ?.querySelector('.kv-val')?.textContent
const auswahl = (c: HTMLElement, label: string) =>
  c.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!

beforeEach(() => {
  Object.assign(push, { production: true, supported: true, needsInstall: false, subscribed: false })
  push.enable.mockClear()
  push.disable.mockClear()
  installAvail.wert = false
  promptInstall.mockClear()
  performLogout.mockClear()
})
afterEach(cleanup)

describe('Wer bin ich, wo bin ich', () => {
  it('nennt Name, Konto-Adresse und Versammlung', () => {
    const { container } = zeige()
    expect(wert(container, t.nameLbl)).toBe('Anton Alt')
    expect(wert(container, t.emailKv)).toBe('anton@example.org')
    expect(wert(container, t.versammlungLbl)).toBe('Nordheim')
  })

  it('ohne verknüpfte Person bleibt der Name leer statt „undefined"', () => {
    const { container } = zeige({ personId: null })
    expect(wert(container, t.nameLbl)).toBe('')
  })

  it('ohne Konto-Adresse (Demo) entfällt die Zeile ganz', () => {
    const { container } = zeige({ members: [] })
    expect(wert(container, t.emailKv)).toBeUndefined()
  })

  it('die Adresse steht von links nach rechts — auch in einer RTL-Oberfläche', () => {
    // Eine E-Mail-Adresse ist keine Sprache; auf Arabisch stünde sie sonst verdreht.
    const { container } = zeige()
    const zeile = [...container.querySelectorAll('.kv-row')].find(
      (r) => r.querySelector('.kv-key')?.textContent === t.emailKv,
    )!
    expect(zeile.querySelector('.kv-val')?.getAttribute('dir')).toBe('ltr')
  })

  it('„Abmelden" meldet ab', () => {
    const { container, dispatch } = zeige()
    fireEvent.click([...container.querySelectorAll('button')].find((b) => b.textContent === t.abmelden)!)
    expect(performLogout).toHaveBeenCalledWith(dispatch)
  })
})

describe('Push-Mitteilungen', () => {
  it('der Schalter steht da, wo Push geht — und meldet den Zustand', () => {
    const { container } = zeige()
    const schalter = container.querySelector('[role="switch"]')!
    expect(schalter.getAttribute('aria-checked')).toBe('false')
    expect(schalter.getAttribute('aria-label')).toBe(t.pushLbl)
  })

  it('ein Tipp schaltet ein', () => {
    const { container } = zeige()
    fireEvent.click(container.querySelector('[role="switch"]')!)
    expect(push.enable).toHaveBeenCalled()
  })

  it('und noch einer wieder aus', () => {
    push.subscribed = true
    const { container } = zeige()
    expect(container.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(container.querySelector('[role="switch"]')!)
    expect(push.disable).toHaveBeenCalled()
  })

  it('auf iOS im Browser steht statt des Schalters der Installations-Hinweis', () => {
    // Ein Schalter, der dort nichts bewirkt, wäre schlimmer als keiner.
    Object.assign(push, { supported: false, needsInstall: true })
    const { container } = zeige()
    expect(container.querySelector('[role="switch"]')).toBeNull()
    expect(container.querySelector('.prof-push-hint')?.textContent).toBe(t.pushIosHint)
  })

  it('im Demo-Modus gibt es weder Schalter noch Hinweis — es gibt kein Konto dafür', () => {
    Object.assign(push, { production: false, needsInstall: true })
    const { container } = zeige({ dataStatus: 'demo' })
    expect(container.querySelector('[role="switch"]')).toBeNull()
    expect(container.querySelector('.prof-push-hint')).toBeNull()
  })

  it('kann der Browser gar nichts davon, steht nichts da', () => {
    Object.assign(push, { supported: false, needsInstall: false })
    const { container } = zeige()
    expect(container.querySelector('[role="switch"]')).toBeNull()
    expect(container.querySelector('.prof-push-hint')).toBeNull()
  })
})

describe('App installieren', () => {
  it('wird nur angeboten, wenn der Browser es kann', () => {
    expect(zeige().container.querySelector('.prof-install')).toBeNull()
    cleanup()
    installAvail.wert = true
    const { container } = zeige()
    expect(container.querySelector('.prof-install')?.textContent).toBe(t.appInstallieren)
  })

  it('ein Tipp startet die Installation', () => {
    installAvail.wert = true
    const { container } = zeige()
    fireEvent.click(container.querySelector('.prof-install')!)
    expect(promptInstall).toHaveBeenCalled()
  })
})

describe('Farbschema', () => {
  it('jede Palette steht zur Wahl und ist benannt', () => {
    const { container } = zeige()
    const optionen = [...auswahl(container, t.darstellung).querySelectorAll('option')]
    expect(optionen).toHaveLength(THEME_LIST.length)
    expect(optionen.every((o) => (o.textContent ?? '').trim().length > 0)).toBe(true)
  })

  it('die eingestellte ist ausgewählt, ein Wechsel schlägt durch', () => {
    const { container, dispatch } = zeige({ theme: 'blatt' })
    const wahl = auswahl(container, t.darstellung)
    expect(wahl.value).toBe('blatt')
    fireEvent.change(wahl, { target: { value: 'graphit' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTheme', theme: 'graphit' })
  })

  it('angezeigt wird der Name, gespeichert der Schlüssel — der bleibt stabil', () => {
    // Die Paletten wurden umbenannt (Jasmin, Olive, Matcha …); die Schlüssel
    // blieben, damit gespeicherte Einstellungen weiter gelten.
    const { container } = zeige({ theme: 'blatt' })
    const gewaehlt = [...auswahl(container, t.darstellung).querySelectorAll('option')].find(
      (o) => o.value === 'blatt',
    )!
    expect(gewaehlt.textContent).toBe('Olive')
  })

  it('„Hoher Kontrast" heißt in jeder Sprache anders — er kommt aus dem Wörterbuch', () => {
    const { container } = zeige()
    const kontrast = [...auswahl(container, t.darstellung).querySelectorAll('option')].find(
      (o) => o.value === 'kontrast',
    )!
    expect(kontrast.textContent).toBe(t.themeKontrast)
  })
})

describe('Schriftgröße', () => {
  it('der Regler deckt genau die vorgesehenen Stufen ab', () => {
    const { container } = zeige()
    const regler = container.querySelector<HTMLInputElement>('.fs-slider-input')!
    expect(regler.min).toBe('0')
    expect(regler.max).toBe(String(FONT_SCALES.length - 1))
    expect(regler.step).toBe('1')
  })

  it('die Stufe steht auch als Wort da — und im Regler für Screenreader', () => {
    const { container } = zeige({ fontScale: FONT_SCALES[0]! })
    expect(wert(container, t.schriftgroesse)).toBe(t.schriftKlein)
    expect(container.querySelector('.fs-slider-input')?.getAttribute('aria-valuetext')).toBe(
      t.schriftKlein,
    )
  })

  it('ein Zug am Regler setzt die zugehörige Stufe', () => {
    const { container, dispatch } = zeige()
    fireEvent.change(container.querySelector('.fs-slider-input')!, { target: { value: '3' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFontScale', scale: FONT_SCALES[3] })
  })

  it('ein unbekannter gespeicherter Wert landet auf der ersten Stufe, nicht auf −1', () => {
    const { container } = zeige({ fontScale: 99 as AppState['fontScale'] })
    expect(container.querySelector<HTMLInputElement>('.fs-slider-input')?.value).toBe('0')
    expect(wert(container, t.schriftgroesse)).toBe(t.schriftKlein)
  })
})

describe('App-Sprache', () => {
  it('führt alle Oberflächensprachen und steht auf der eingestellten', () => {
    const { container } = zeige({ lang: 'de' })
    const wahl = auswahl(container, t.spracheLbl)
    expect(wahl.value).toBe('de')
    expect(wahl.querySelectorAll('option').length).toBeGreaterThan(30)
  })

  it('ein Wechsel schlägt durch', () => {
    const { container, dispatch } = zeige()
    fireEvent.change(auswahl(container, t.spracheLbl), { target: { value: 'fr' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setLang', lang: 'fr' })
  })
})

describe('Die versteckte Gesten-Diagnose', () => {
  const bauZeile = (c: HTMLElement) => c.querySelector('.prof-build')!

  it('die Build-Kennung steht offen da — sie beantwortet „läuft hier die neueste Fassung?"', () => {
    const { container } = zeige()
    expect(bauZeile(container).textContent).toMatch(/^Build /)
  })

  it('vier Antipper zeigen noch nichts — sie ist absichtlich schwer erreichbar', () => {
    const { container } = zeige()
    for (let i = 0; i < 4; i++) fireEvent.click(bauZeile(container))
    expect(container.querySelector('.prof-diag')).toBeNull()
  })

  it('beim fünften erscheint das Protokoll', () => {
    const { container } = zeige()
    for (let i = 0; i < 5; i++) fireEvent.click(bauZeile(container))
    expect(container.querySelector('.prof-diag-text')).toBeTruthy()
  })

  it('es lässt sich aktualisieren, kopieren und leeren', async () => {
    const { container } = zeige()
    for (let i = 0; i < 5; i++) fireEvent.click(bauZeile(container))
    const knoepfe = [...container.querySelectorAll('.prof-diag-btns button')]
    expect(knoepfe.map((b) => b.textContent)).toEqual(['Aktualisieren', 'Kopieren', 'Leeren'])
    for (const b of knoepfe) fireEvent.click(b)
    await waitFor(() => expect(container.querySelector('.prof-diag-text')).toBeTruthy())
  })
})
