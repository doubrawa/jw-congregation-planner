/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { dict } from '../i18n/ui'
import { DatePicker } from './DatePicker'

/**
 * **Der eigene Datumswähler** (statt des nativen Felds, das auf jedem Gerät
 * anders aussieht und sich nicht in 34 Sprachen führen lässt). Er steht in den
 * Plänen und Sonderwochen; das Monatsraster teilt er mit dem Zeitraum-Kalender
 * der Abwesenheiten (`kalender.ts`).
 */

const t = dict('de')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 15, 12, 0)) // 15. Oktober 2026
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('Der Datumswähler', () => {
  const zeigeDP = (value = '', over: Partial<Parameters<typeof DatePicker>[0]> = {}) => {
    const onChange = vi.fn()
    const r = render(
      <DatePicker
        value={value}
        onChange={onChange}
        locale="de-DE"
        placeholder={t.datumPh}
        ariaLabel={t.von}
        prevLabel={t.a11yPrevMonth}
        nextLabel={t.a11yNextMonth}
        {...over}
      />,
    )
    return { onChange, ...r }
  }

  it('zeigt den Platzhalter, solange nichts gewählt ist', () => {
    const { container } = zeigeDP('')
    const feld = container.querySelector('.dp-field')!
    expect(feld.textContent).toContain(t.datumPh)
    expect(feld.className).toContain('dp-field--empty')
  })

  it('ein gewähltes Datum steht lesbar da — nicht als ISO', () => {
    const { container } = zeigeDP('2026-10-01')
    expect(container.querySelector('.dp-field')?.textContent).toContain('1. Okt. 2026')
  })

  it('das Popup ist zu, bis man es öffnet', () => {
    const { container } = zeigeDP()
    expect(container.querySelector('.dp-pop')).toBeNull()
    expect(container.querySelector('.dp-field')?.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(container.querySelector('.dp-field')!)
    expect(container.querySelector('.dp-pop')?.getAttribute('role')).toBe('dialog')
  })

  it('es öffnet auf dem Monat des gewählten Datums', () => {
    const { container } = zeigeDP('2026-03-05')
    fireEvent.click(container.querySelector('.dp-field')!)
    expect(container.querySelector('.dp-title')?.textContent).toBe('März 2026')
  })

  it('ohne Auswahl auf dem laufenden Monat', () => {
    const { container } = zeigeDP('')
    fireEvent.click(container.querySelector('.dp-field')!)
    expect(container.querySelector('.dp-title')?.textContent).toBe('Oktober 2026')
  })

  it('die Pfeile blättern Monat für Monat — über den Jahreswechsel hinweg', () => {
    const { container } = zeigeDP('2026-12-01')
    fireEvent.click(container.querySelector('.dp-field')!)
    expect(container.querySelector('.dp-title')?.textContent).toBe('Dezember 2026')
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yNextMonth}"]`)!)
    expect(container.querySelector('.dp-title')?.textContent).toBe('Januar 2027')
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yPrevMonth}"]`)!)
    fireEvent.click(container.querySelector(`[aria-label="${t.a11yPrevMonth}"]`)!)
    expect(container.querySelector('.dp-title')?.textContent).toBe('November 2026')
  })

  it('ein Tag meldet sich als ISO-Datum und schließt das Popup', () => {
    const { container, onChange } = zeigeDP('2026-10-01')
    fireEvent.click(container.querySelector('.dp-field')!)
    const zwoelf = [...container.querySelectorAll<HTMLButtonElement>('.dp-day:not(.dp-day--muted)')]
      .find((b) => b.textContent === '12')!
    fireEvent.click(zwoelf)
    expect(onChange).toHaveBeenCalledWith('2026-10-12')
    expect(container.querySelector('.dp-pop')).toBeNull()
  })

  it('der gewählte Tag und heute sind markiert — und nie beide derselbe', () => {
    const { container } = zeigeDP('2026-10-01')
    fireEvent.click(container.querySelector('.dp-field')!)
    expect(container.querySelectorAll('.dp-day--sel')).toHaveLength(1)
    const heute = container.querySelectorAll('.dp-day--today')
    expect(heute).toHaveLength(1)
    expect(heute[0]!.textContent).toBe('15')
    expect(heute[0]!.className).not.toContain('dp-day--sel')
  })

  it('geht ohne Wert im ÖRTLICHEN Monat auf, nicht im UTC-Monat', () => {
    /*
      „Dieser Monat" ist ein örtlicher Begriff. Der Kalender las ihn über
      `getUTCMonth()`, und in Mitteleuropa ist der UTC-Tag zwischen Mitternacht
      und 01:00 bzw. 02:00 noch der gestrige — am Monatsersten also der
      Vormonat. Wer nach Mitternacht eine Abwesenheit eintrug, bekam den
      **Februar** vorgelegt, während die Heute-Marke auf dem 1. März in der
      ausgegrauten Nachzeile saß.

      Für die Heute-Marke selbst steht dieselbe Begründung längst im
      Quelltext (`todayIso`) — nur die Monatswahl daneben war noch die alte.
      Die Tests der Suite laufen sonst auf 12:00 mittags und können den
      Unterschied gar nicht sehen; deshalb stellt dieser die Uhr selbst.
    */
    vi.setSystemTime(new Date(2026, 2, 1, 0, 30)) // 1. März 2026, 00:30 Ortszeit
    const { container } = zeigeDP('')
    fireEvent.click(container.querySelector('.dp-field')!)
    expect(container.querySelector('.dp-title')?.textContent).toContain('März')
  })

  it('mit Wert entscheidet der Wert, nicht die Uhr', () => {
    // Die Gegenprobe: Das ISO-Datum wird über UTC-Mittag gelesen und ist
    // damit zeitzonenfrei — daran ändert die Uhrzeit nichts.
    vi.setSystemTime(new Date(2026, 2, 1, 0, 30))
    const { container } = zeigeDP('2026-08-01')
    fireEvent.click(container.querySelector('.dp-field')!)
    expect(container.querySelector('.dp-title')?.textContent).toContain('August')
  })

  it('Tage vor `min` sind gesperrt — „Bis" kann nicht vor „Von" liegen', () => {
    const { container } = zeigeDP('', { value: '', min: '2026-10-10' })
    fireEvent.click(container.querySelector('.dp-field')!)
    const tage = [...container.querySelectorAll<HTMLButtonElement>('.dp-day:not(.dp-day--muted)')]
    expect(tage.find((b) => b.textContent === '9')?.disabled).toBe(true)
    expect(tage.find((b) => b.textContent === '10')?.disabled).toBe(false)
  })

  it('Escape und ein Klick daneben schließen', () => {
    const { container } = zeigeDP()
    fireEvent.click(container.querySelector('.dp-field')!)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('.dp-pop')).toBeNull()
    fireEvent.click(container.querySelector('.dp-field')!)
    fireEvent.mouseDown(document.body)
    expect(container.querySelector('.dp-pop')).toBeNull()
  })

  it('ein Klick INS Popup schließt nicht — sonst käme man nie zum Tag', () => {
    const { container } = zeigeDP()
    fireEvent.click(container.querySelector('.dp-field')!)
    fireEvent.mouseDown(container.querySelector('.dp-title')!)
    expect(container.querySelector('.dp-pop')).toBeTruthy()
  })

  it('die Wochentagsköpfe stehen in der Sprache des Lesers, Montag zuerst', () => {
    const { container } = zeigeDP()
    fireEvent.click(container.querySelector('.dp-field')!)
    const koepfe = [...container.querySelectorAll('.dp-weekdays span')].map((s) => s.textContent)
    expect(koepfe).toHaveLength(7)
    expect(koepfe[0]).toMatch(/^Mo/)
  })
})

describe('Der Datumswähler in anderen Sprachen', () => {
  const oeffne = (locale: string, value = '2026-03-15') => {
    const r = render(
      <DatePicker
        value={value}
        onChange={vi.fn()}
        locale={locale}
        placeholder={t.datumPh}
        ariaLabel={t.von}
        prevLabel={t.a11yPrevMonth}
        nextLabel={t.a11yNextMonth}
      />,
    )
    fireEvent.click(r.container.querySelector('.dp-field')!)
    return r
  }

  const LOCALES_PROBE: Array<[string, string, RegExp]> = [
    ['englisch', 'en-US', /March/],
    ['spanisch', 'es-ES', /marzo/],
    ['griechisch', 'el-GR', /\p{Script=Greek}/u],
    ['japanisch', 'ja-JP', /3月/],
    ['koreanisch', 'ko-KR', /3월/],
    ['arabisch', 'ar', /\p{Script=Arabic}/u],
    ['hebräisch', 'he-IL', /\p{Script=Hebrew}/u],
    // Persisch ist der Grund für `-u-ca-gregory` in LOCALES: ohne die
    // Erweiterung stünde hier ein Dschalali-Monat statt März.
    ['persisch', 'fa-IR-u-ca-gregory', /مارس/],
  ]

  it.each(LOCALES_PROBE)('%s: Monatstitel in der eigenen Sprache', (_name, locale, muster) => {
    const { container } = oeffne(locale)
    expect(container.querySelector('.dp-title')?.textContent, locale).toMatch(muster)
  })

  it.each(LOCALES_PROBE)('%s: die Wochentagsköpfe kommen aus der Locale', (_name, locale) => {
    const { container } = oeffne(locale)
    const koepfe = [...container.querySelectorAll('.dp-weekdays span')].map((e) => e.textContent ?? '')
    expect(koepfe, locale).toHaveLength(7)
    expect(koepfe.every(Boolean), locale).toBe(true)
    // Nicht die deutschen — sonst wäre die Locale nicht angekommen.
    const deutsch = [...oeffne('de-DE').container.querySelectorAll('.dp-weekdays span')].map((e) => e.textContent)
    expect(koepfe.join('|'), locale).not.toBe(deutsch.join('|'))
  })

  it.each(LOCALES_PROBE)('%s: das Raster beginnt trotzdem am Montag', (_name, locale) => {
    /*
      Die eigentliche Zusicherung. `en-US` und `ar` beginnen die Woche sonst am
      Sonntag, `fa` am Samstag. Bliebe das Raster locale-abhängig, stünde der
      1. März 2026 (ein Sonntag) in einer anderen Spalte als die Woche des
      Programms — und der Planer klickte auf den falschen Tag.
    */
    const { container } = oeffne(locale, '2026-03-15')
    const tage = [...container.querySelectorAll('.dp-day')]
    expect(tage.length, locale).toBe(42)
    // Der erste Tag des Rasters für März 2026 ist Montag, der 23. Februar.
    const ersterTitel = tage[0]?.textContent ?? ''
    expect(ersterTitel, `${locale}: ${ersterTitel}`).toMatch(/23/)
  })

  it('auf Deutsch ist der erste Rasterplatz derselbe — die Sprache verschiebt nichts', () => {
    // Gegenprobe: Fände die Prüfung oben „23" auch bei einem sonntagsbasierten
    // Raster, prüfte sie nichts. Deutsch beginnt ohnehin am Montag; entscheidend
    // ist, dass **alle** dasselbe zeigen.
    const de = [...oeffne('de-DE').container.querySelectorAll('.dp-day')]
    const en = [...oeffne('en-US').container.querySelectorAll('.dp-day')]
    expect(en.length).toBe(de.length)
    expect(en[0]?.textContent).toBe(de[0]?.textContent)
    expect(en[41]?.textContent).toBe(de[41]?.textContent)
  })
})
