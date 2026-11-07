import { describe, expect, it } from 'vitest'
import { chromeFinden, startSchalter, trennwoerterbuecher } from './chrome.mjs'

/**
 * **Chrome wird auf jedem Rechner gefunden und startet für eine Messung
 * richtig** — unter Windows am Schreibtisch, in GitHub Actions unter Linux.
 * Die Laufzeit-Messung (T167) und die App-Icons hängen daran.
 */

const nurDa = (...pfade: string[]) => (pfad: string) => pfade.includes(pfad)

describe('Chrome finden', () => {
  it('die Umgebungsvariable CHROME geht vor — auch ohne Prüfung, dass dort etwas liegt', () => {
    expect(chromeFinden({ env: { CHROME: 'D:/chrome.exe' }, plattform: 'win32', gibtEs: () => false })).toBe('D:/chrome.exe')
  })

  it('unter Windows: Programme, dann Programme (x86), dann die Installation nur für den Nutzer', () => {
    const env = { ProgramFiles: 'C:/PF', 'ProgramFiles(x86)': 'C:/PF86', LOCALAPPDATA: 'C:/Users/x/AppData/Local' }
    const nutzer = 'C:/Users/x/AppData/Local/Google/Chrome/Application/chrome.exe'
    expect(chromeFinden({ env, plattform: 'win32', gibtEs: nurDa(nutzer) })).toBe(nutzer)
    expect(chromeFinden({ env, plattform: 'win32', gibtEs: nurDa(nutzer, 'C:/PF86/Google/Chrome/Application/chrome.exe') })).toBe(
      'C:/PF86/Google/Chrome/Application/chrome.exe',
    )
  })

  it('unter Linux im PATH, wie in GitHub Actions — Ordner in der Reihenfolge des PATH', () => {
    const env = { PATH: '/usr/local/bin:/usr/bin' }
    expect(chromeFinden({ env, plattform: 'linux', gibtEs: nurDa('/usr/bin/google-chrome', '/usr/bin/chromium') })).toBe('/usr/bin/google-chrome')
    expect(chromeFinden({ env, plattform: 'linux', gibtEs: nurDa('/usr/bin/chromium') })).toBe('/usr/bin/chromium')
  })

  it('unter macOS im Programme-Ordner', () => {
    const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    expect(chromeFinden({ env: {}, plattform: 'darwin', gibtEs: nurDa(mac) })).toBe(mac)
  })

  it('ohne Chrome sagt die Meldung, wie es weitergeht', () => {
    expect(() => chromeFinden({ env: { PATH: '/usr/bin' }, plattform: 'linux', gibtEs: () => false })).toThrow(/Umgebungsvariablen CHROME/)
  })

  it('die Trennwörterbücher liegen im Profil des installierten Chrome — oder es gibt keine', () => {
    const ordner = 'C:/L/Google/Chrome/User Data/hyphen-data'
    expect(trennwoerterbuecher({ env: { LOCALAPPDATA: 'C:/L' }, plattform: 'win32', gibtEs: nurDa(ordner) })).toBe(ordner)
    expect(trennwoerterbuecher({ env: { LOCALAPPDATA: 'C:/L' }, plattform: 'win32', gibtEs: () => false })).toBeNull()
  })
})

describe('Chrome für eine Messung starten', () => {
  const schalter = (o: Partial<Parameters<typeof startSchalter>[0]> = {}) => startSchalter({ profil: '/tmp/p', trennung: false, ci: false, ...o })

  it('ohne Fenster, mit eigenem Profil, den Port wählt Chrome selbst', () => {
    expect(schalter()).toEqual(expect.arrayContaining(['--headless=new', '--user-data-dir=/tmp/p', '--remote-debugging-port=0']))
  })

  it('die Rollbalken bleiben — am Schreibtisch nehmen sie Platz, und das soll die Messung sehen', () => {
    expect(schalter()).not.toContain('--hide-scrollbars')
  })

  it('ohne Trennwörterbücher lädt Chrome auch keine nach; mit ihnen darf es', () => {
    expect(schalter()).toContain('--disable-component-update')
    expect(schalter({ trennung: true })).not.toContain('--disable-component-update')
  })

  it('ohne Sandbox nur in der CI', () => {
    expect(schalter()).not.toContain('--no-sandbox')
    expect(schalter({ ci: true })).toContain('--no-sandbox')
  })
})
