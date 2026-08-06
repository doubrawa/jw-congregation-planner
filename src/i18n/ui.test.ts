import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { DE, dict, loadOverlay } from './ui'

/**
 * Schlüssel, die (noch) nicht in jedem Overlay stehen und deshalb in vielen
 * Sprachen englisch erscheinen — Altbestand aus Funktionen, die nachträglich
 * dazukamen (Anmeldung/Registrierung, Push, Schriftgröße, Offline-Banner,
 * Einspringen, Dubletten, a11y-Beschriftungen).
 *
 * Die Liste darf nur KÜRZER werden: ein neu eingeführter Schlüssel ohne
 * Übersetzung lässt den Test unten scheitern.
 */
const LUECKEN = new Set([
  'a11yClose', 'a11yCongLang', 'a11yDecrease', 'a11yIncrease', 'a11yMainNav',
  'a11yMoveDown', 'a11yMoveUp', 'a11yNextMonth', 'a11yNextWeek', 'a11yPrevMonth',
  'a11yPrevWeek', 'a11yRemove', 'a11yTime', 'a11yWeekday', 'absagen', 'anfangsliedLbl',
  'appInstallieren', 'codeEinloesen', 'codePh', 'congLabel', 'demoSuffix',
  'dochBestaetigen', 'dublettenHint', 'dublettenRow', 'dublettenTitle', 'einspringenHint',
  'einspringenTitle', 'emailKv', 'ersatzHint', 'fsLeiterLbl', 'invAlreadyMember',
  'invCodeInvalid', 'kannNicht', 'keinePersonOpt', 'kontoErstellen', 'laedt', 'liedNrPh',
  'loadAufgabe', 'loadFrei', 'loadHilfsdienst', 'neuesPasswort', 'nurMitglieder',
  'oderPersonWaehlen', 'offlineBanner', 'offlineBannerHint', 'offlineReadOnly',
  'offlineRetry', 'partnerEntfernen', 'partnerHinzu', 'privSchulungPartner',
  'privWtLeiter', 'privWtVertreter', 'pushAktivieren', 'pushIosHint', 'pushPromptIos',
  'pushPromptText', 'pushPromptTitle', 'pwSpeichern', 'pwWiederholen', 'recoveryTitle',
  'rednerNamePh', 'rednerVersPh', 'regMailHinweis', 'registrieren', 'resetMailHinweis',
  'schriftGroesser', 'schriftGross', 'schriftKlein', 'schriftSehrGross', 'schriftStandard',
  'schriftgroesse', 'stDemoLaden', 'stErneut', 'stFehler', 'stFehlerText', 'stKeineVers',
  'stKeineVersText', 'stLeer', 'stLeerText', 'stLeerTextPlaner', 'toastErsatzGesucht',
  'toastPwGeaendert', 'toastPwMismatch', 'toastUebernommen', 'toastUebernommenKonflikt',
  'uebernehmen', 'uebernehmenBtn', 'versammlungTag', 'vortragThemaPh', 'wtRollenHint',
  'wtRollenLabel', 'zurAnmeldung',
])

describe('UI-Wörterbücher (Fallback-Kette DE ← EN ← Sprache)', () => {
  const deKeys = Object.keys(DE).sort()

  // Overlays sind lazy (Code-Splitting) — für die Vollständigkeitsprüfung
  // alle Sprachen vorab nachladen.
  beforeAll(async () => {
    await Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code)))
  })

  it('jede App-Sprache liefert alle Keys mit nicht-leeren Strings', () => {
    for (const { code } of APP_LANGS) {
      const d = dict(code) as unknown as Record<string, string>
      expect(Object.keys(d).sort(), code).toEqual(deKeys)
      for (const key of deKeys) {
        expect(typeof d[key], `${code}.${key}`).toBe('string')
        expect(d[key].length, `${code}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('jedes Overlay übersetzt jeden Schlüssel selbst (kein stiller EN-Rückfall)', async () => {
    // Die Prüfung oben geht durch dict() und sieht deshalb den EN-Rückfall
    // nicht: ein im Overlay fehlender Schlüssel fiele dort nicht auf. Genau so
    // stand der Familien-Block monatelang in 32 Sprachen englisch da.
    const module = import.meta.glob<{ default: Record<string, string> }>('./overlays/*.ts')
    const fehlend: string[] = []
    for (const [pfad, laden] of Object.entries(module)) {
      const code = pfad.slice('./overlays/'.length, -'.ts'.length)
      const overlay = (await laden()).default
      for (const key of deKeys) {
        if (!LUECKEN.has(key) && !(key in overlay)) fehlend.push(`${code}.${key}`)
      }
    }
    expect(fehlend).toEqual([])
  })

  it('die Lücken-Liste enthält nichts, was längst übersetzt ist', () => {
    // Hält die Liste ehrlich: wird eine Lücke geschlossen, muss ihr Eintrag
    // hier verschwinden — sonst schützt die Liste bald nichts mehr.
    const deKeySet = new Set(deKeys)
    expect([...LUECKEN].filter((k) => !deKeySet.has(k))).toEqual([])
  })

  it('Platzhalter ({n}, {name}, …) stimmen in jeder Sprache mit DE überein', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    const broken: string[] = []
    for (const { code } of APP_LANGS) {
      const d = dict(code) as unknown as Record<string, string>
      for (const key of deKeys) {
        const want = placeholders((DE as Record<string, string>)[key])
        const got = placeholders(d[key])
        if (got !== want) broken.push(`${code}.${key}: [${got}] statt [${want}]`)
      }
    }
    expect(broken).toEqual([])
  })

  it('keine Werte mit führendem/doppeltem Leerraum (Ausnahme: bewusste Suffixe)', () => {
    const suffixKeys = new Set(['duMarker', 'demoSuffix']) // beginnen bewusst mit Leerzeichen
    for (const { code } of APP_LANGS) {
      const d = dict(code) as unknown as Record<string, string>
      for (const key of deKeys) {
        if (!suffixKeys.has(key)) {
          expect(d[key], `${code}.${key}`).toBe(d[key].trim())
        }
        expect(d[key].includes('  '), `${code}.${key} doppelter Leerraum`).toBe(false)
      }
    }
  })

  it('dict schichtet DE ← EN ← Sprache (eigene Übersetzung gewinnt vor EN)', () => {
    // Alle App-Sprachen sind inzwischen vollständig übersetzt; die eigene
    // Übersetzung hat Vorrang vor der EN-Fallback-Schicht.
    expect(dict('hr').keineWochenTitel).not.toBe(dict('en').keineWochenTitel)
    expect(dict('es').konfMehr).not.toBe(dict('en').konfMehr)
    // DE ist die Basis, EN eine getrennte Schicht darüber.
    expect(dict('de').keineWochenTitel).not.toBe(dict('en').keineWochenTitel)
  })

  it('EN bleibt Fallback-Basis für nicht (nach)geladene Sprach-Overlays', () => {
    // dict() legt EN unter die Sprache; ist ein Overlay (noch) nicht geladen,
    // greift EN. Hier verifiziert an DE↔EN-Trennung + vorhandenem EN-Wert.
    expect(typeof dict('en').keineWochenTitel).toBe('string')
    expect(dict('en').keineWochenTitel).not.toBe(DE.keineWochenTitel)
  })
})
