/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { bestaetigen } from '../../tests/zwei-tipps'
import {
  AppDispatchContext,
  AppStateContext,
  AppStoreContext,
  type AppState,
  useStaticStore,
} from '../app/context'
import { demoZustand } from '../../tests/testdaten/demo-start'
import { FONT_SCALES, THEME_LIST } from '../data/constants'
import { emptyQualifications } from '../data/helpers'
import { APP_LANGS } from '../i18n/langs'
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
  angemeldet: true, supported: true, needsInstall: false, subscribed: false,
  enable: vi.fn(() => Promise.resolve(true)),
  disable: vi.fn(() => Promise.resolve()),
}
const installAvail = { wert: false }

vi.mock('../lib/install', () => ({ promptInstall: () => promptInstall() }))
vi.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('../lib/abmelden', () => ({ performLogout: (d: unknown) => performLogout(d) }))
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
const MITGLIED: Member[] = [{ userId: 'u1', personId: 'p-a', email: 'anton@example.org', planner: false, zuteiler: false }]

function zeige(over: Partial<AppState> = {}) {
  const dispatch = vi.fn()
  const state: AppState = {
    ...demoZustand(),
    screen: 'profil', dataStatus: 'ready',
    congregationId: 'c1', userId: 'u1', personId: 'p-a',
    persons: [ICH], members: MITGLIED,
    congregation: { name: 'Nordheim', hall: 'Saal', times: { mid: { wd: 2, time: '19:00' }, we: { wd: 0, time: '10:00' } } },
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

const knopf = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].find((b) => b.textContent === text)
const sprachwahl = (c: HTMLElement) => c.querySelector<HTMLSelectElement>('.profil-sprache select')!
const regler = (c: HTMLElement) => c.querySelector<HTMLInputElement>('.profil-regler-feld')!
const stufe = (c: HTMLElement) => c.querySelector('.profil-schrift-kopf .klein-text')?.textContent

beforeEach(() => {
  Object.assign(push, { angemeldet: true, supported: true, needsInstall: false, subscribed: false })
  push.enable.mockClear()
  push.disable.mockClear()
  installAvail.wert = false
  promptInstall.mockClear()
  performLogout.mockClear()
})
afterEach(cleanup)

describe('Wer bin ich, wo bin ich', () => {
  it('nennt Initialen, Name und Konto-Adresse', () => {
    const { container } = zeige()
    expect(container.querySelector('.profil-bild')?.textContent).toBe('AA')
    expect(container.querySelector('h1')?.textContent).toBe('Anton Alt')
    expect(container.querySelector('.profil-wer')?.textContent).toContain('anton@example.org')
  })

  it('ohne verknüpfte Person steht „Profil" statt „undefined"', () => {
    const { container } = zeige({ personId: null })
    expect(container.querySelector('h1')?.textContent).toBe(t.navProfil)
  })

  it('ohne Konto-Adresse (Demo) entfällt die Zeile ganz', () => {
    const { container } = zeige({ members: [] })
    expect(container.querySelector('.profil-wer [dir="ltr"]')).toBeNull()
  })

  it('die Adresse steht von links nach rechts — auch in einer RTL-Oberfläche', () => {
    // Eine E-Mail-Adresse ist keine Sprache; auf Arabisch stünde sie sonst verdreht.
    const { container } = zeige()
    expect(container.querySelector('.profil-wer [dir="ltr"]')?.textContent).toBe('anton@example.org')
  })

  it('„Abmelden" fragt erst nach, dann meldet es ab', () => {
    // Seit dem 4.10.2026 mit Rückfrage („Wirklich abmelden?").
    const { container, dispatch } = zeige()
    const knopf = [...container.querySelectorAll('button')].find((b) => b.textContent === t.abmelden)!
    fireEvent.click(knopf)
    expect(performLogout).not.toHaveBeenCalled()
    expect(knopf.textContent).toBe(t.abmeldenSicher)
    bestaetigen(knopf)
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
    expect(container.textContent).toContain(t.pushIosHint)
  })

  it('ohne angemeldetes Konto gibt es weder Schalter noch Hinweis — es gibt kein Abo dafür', () => {
    Object.assign(push, { angemeldet: false, needsInstall: true })
    const { container } = zeige({ userId: null })
    expect(container.querySelector('[role="switch"]')).toBeNull()
    expect(container.textContent).not.toContain(t.pushIosHint)
  })

  it('kann der Browser gar nichts davon, steht nichts da', () => {
    Object.assign(push, { supported: false, needsInstall: false })
    const { container } = zeige()
    expect(container.querySelector('[role="switch"]')).toBeNull()
    expect(container.textContent).not.toContain(t.pushIosHint)
  })
})

describe('App installieren', () => {
  it('wird nur angeboten, wenn der Browser es kann', () => {
    expect(knopf(zeige().container, t.appInstallieren)).toBeUndefined()
    cleanup()
    installAvail.wert = true
    expect(knopf(zeige().container, t.appInstallieren)).toBeDefined()
  })

  it('ein Tipp startet die Installation', () => {
    installAvail.wert = true
    const { container } = zeige()
    fireEvent.click(knopf(container, t.appInstallieren)!)
    expect(promptInstall).toHaveBeenCalled()
  })
})

describe('Darstellung (T121): Dunkel, Hell, Automatisch', () => {
  /** Die Knöpfe der Wahl „Darstellung", in ihrer Reihenfolge. */
  const knoepfe = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLButtonElement>(`[role="group"][aria-label="${t.darstellung}"] button`)]

  it('alle drei stehen zur Wahl, in der Reihenfolge des Entwurfs und mit Namen aus dem Wörterbuch', () => {
    const { container } = zeige()
    expect(knoepfe(container).map((k) => k.textContent)).toEqual([t.themeDunkel, t.themeHell, t.themeAuto])
    expect(THEME_LIST.map((o) => o.key)).toEqual(['dunkel', 'hell', 'auto'])
  })

  it('die eingestellte ist gedrückt, ein Tipp auf eine andere schlägt durch', () => {
    const { container, dispatch } = zeige({ theme: 'hell' })
    const [dunkel, hell, auto] = knoepfe(container)
    expect(hell!.getAttribute('aria-pressed')).toBe('true')
    expect([dunkel, auto].map((k) => k!.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
    fireEvent.click(auto!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'setTheme', theme: 'auto' })
  })
})

describe('Schriftgröße', () => {
  it('der Regler deckt genau die vorgesehenen Stufen ab', () => {
    const { container } = zeige()
    expect(regler(container).min).toBe('0')
    expect(regler(container).max).toBe(String(FONT_SCALES.length - 1))
    expect(regler(container).step).toBe('1')
  })

  it('die Stufe steht auch als Wort da — und im Regler für Screenreader', () => {
    const { container } = zeige({ fontScale: FONT_SCALES[0]! })
    expect(stufe(container)).toBe(t.schriftKlein)
    expect(regler(container).getAttribute('aria-valuetext')).toBe(t.schriftKlein)
  })

  it('ein Zug am Regler setzt die zugehörige Stufe', () => {
    const { container, dispatch } = zeige()
    fireEvent.change(regler(container), { target: { value: '3' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setFontScale', scale: FONT_SCALES[3] })
  })

  it('jede Stufe steht an ihrer Stelle und trägt ihren Namen', () => {
    // Ein unbekannter gespeicherter Wert kommt hier nicht an: Ihn fängt schon
    // der Start ab (`asFontScale`, init.test.ts). Bis zum 16.10.2026 stand
    // dieser Fall hier — mit einem Zustand, den die App nicht erzeugt.
    const namen = [t.schriftKlein, t.schriftStandard, t.schriftGross, t.schriftGroesser, t.schriftSehrGross]
    FONT_SCALES.forEach((fontScale, i) => {
      const { container } = zeige({ fontScale })
      expect(regler(container).value).toBe(String(i))
      expect(stufe(container)).toBe(namen[i])
      cleanup()
    })
  })
})

describe('App-Sprache', () => {
  it('führt alle Oberflächensprachen und steht auf der eingestellten', () => {
    const { container } = zeige({ lang: 'de' })
    const wahl = sprachwahl(container)
    expect(wahl.value).toBe('de')
    expect(wahl.querySelectorAll('option').length).toBe(APP_LANGS.length)
  })

  it('ein Wechsel schlägt durch', () => {
    const { container, dispatch } = zeige()
    fireEvent.change(sprachwahl(container), { target: { value: 'fr' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'setLang', lang: 'fr' })
  })
})

describe('Abwesenheiten (T121: im Profil statt unter „Meine Aufgaben")', () => {
  it('die eigenen, die anstehen — mit Zeitraum, Grund und ✕', () => {
    const { container } = zeige({
      absences: [
        { id: 'a1', personId: 'p-a', userId: 'u1', from: '2099-11-02', to: '2099-11-06', reason: 'Besuch' },
        { id: 'a2', personId: 'p-b', userId: 'u1', from: '2099-11-02', to: '2099-11-06', reason: 'Fremd' },
      ],
    })
    const zeilen = [...container.querySelectorAll('.abw-zeile')]
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0]!.textContent).toContain('Besuch')
    expect(zeilen[0]!.querySelector('.entfernen')).not.toBeNull()
  })

  it('„Abwesenheit eintragen" steht darunter', () => {
    expect(knopf(zeige().container, t.abwEintragen)).toBeDefined()
  })
})

describe('Verwaltung (Admins, am Handy)', () => {
  it('Personen mit ihrer Zahl und die Einstellungen — ein Tipp führt hin', () => {
    const { container, dispatch } = zeige({ planner: true })
    const karte = container.querySelector('.profil-verwaltung')!
    expect(karte.textContent).toContain(t.navPersonen)
    fireEvent.click(knopf(container, t.navEinstellungen)!)
    expect(dispatch).toHaveBeenCalledWith({ type: 'navigate', screen: 'einstellungen' })
  })

  it('ein Verkündiger sieht sie nicht', () => {
    expect(zeige({ planner: false }).container.querySelector('.profil-verwaltung')).toBeNull()
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
