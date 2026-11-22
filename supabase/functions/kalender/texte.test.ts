import { beforeAll, describe, expect, it } from 'vitest'
import { APP_LANGS } from '../../../src/i18n/langs'
import { dict, loadOverlay } from '../../../src/i18n/ui'
import type { KalenderTermin } from '../_shared/kalender.ts'
import { kalenderNotiz, kalenderTexte } from './texte.ts'

/**
 * **Die Texte des Kalender-Abos** — dieselben Wörter wie in der App. Die
 * Function kann das Wörterbuch der App nicht laden; ihre Tabelle ist eine
 * Abschrift, und hier steht, dass sie stimmt — in jeder Sprache der App.
 */

// Ohne Nachladen läse `dict(code)` für zehn Sprachen Englisch, und der Vergleich mäße nichts.
beforeAll(() => Promise.all(APP_LANGS.map(({ code }) => loadOverlay(code))))

const termin = (patch: Partial<KalenderTermin>): KalenderTermin => ({
  uid: 'x',
  tag: '2026-09-08',
  von: '19:00',
  bis: '20:45',
  titel: 'Bibellesung',
  ort: '',
  art: 'zusammenkunft',
  zusage: 'offen',
  ...patch,
})

describe('Dieselben Wörter wie die App', () => {
  it.each(APP_LANGS.map(({ code }) => code))('%s: die Zusammenkünfte, der Programmpunkt und der Name des Kalenders', (code) => {
    const app = dict(code)
    const t = kalenderTexte(code)
    expect(t.zusammenkunft).toEqual({ mid: app.tabMid, we: app.tabWe })
    expect(t.punkt).toBe(app.heftPunkt)
    expect(t.meineAufgaben).toBe(app.navAufgabenLong)
  })

  it('Positivkontrolle: Die Sprachen sind wirklich geladen', () => {
    expect(dict('fa').tabMid).not.toBe(dict('en').tabMid)
    expect(kalenderTexte('fa').zusammenkunft.mid).not.toBe(kalenderTexte('en').zusammenkunft.mid)
  })
})

describe('Die Notiz eines Termins', () => {
  it('Zusammenkunft und Nummer des Punkts, darunter der Stand der Zusage', () => {
    expect(kalenderNotiz(termin({ zusammenkunft: 'mid', punkt: 4 }), 'de')).toBe(
      'Zusammenkunft unter der Woche · Punkt 4\nNoch nicht bestätigt – bestätige es in der App.',
    )
  })

  it('ohne Nummer (ein Hilfsdienst) nur die Zusammenkunft', () => {
    expect(kalenderNotiz(termin({ zusammenkunft: 'we', zusage: 'bestätigt' }), 'de')).toBe('Zusammenkunft am Wochenende\nBestätigt.')
  })

  it('ein Treffpunkt gehört zu keiner Zusammenkunft — nur der Stand', () => {
    expect(kalenderNotiz(termin({ art: 'treffpunkt' }), 'de')).toBe('Noch nicht bestätigt – bestätige es in der App.')
  })

  it('beim Trolley der Hinweis, ohne ihn nichts', () => {
    expect(kalenderNotiz(termin({ art: 'trolley', zusage: null, hinweis: 'Schlüssel im Kasten' }), 'de')).toBe('Schlüssel im Kasten')
    expect(kalenderNotiz(termin({ art: 'trolley', zusage: null }), 'de')).toBe('')
  })

  it('die Nummer in den Ziffern der Sprache — auf Persisch wie in der App', () => {
    const notiz = kalenderNotiz(termin({ zusammenkunft: 'mid', punkt: 4 }), 'fa')
    expect(notiz.split('\n')[0]).toBe(`${dict('fa').tabMid} · ${dict('fa').heftPunkt.replace('{n}', '۴')}`)
    expect(notiz).not.toMatch(/[0-9]/)
  })

  it('auf Türkisch steht die Nummer vorn, wie in der App', () => {
    expect(kalenderNotiz(termin({ zusammenkunft: 'mid', punkt: 4 }), 'tr').split('\n')[0]).toBe('Hafta içi ibadeti · 4. bölüm')
  })
})
