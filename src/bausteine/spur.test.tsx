/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { imBlick, Spur, type SpurSchritt } from './Spur'

/**
 * **Die Spur in Punkten** — die Form der schmalen Wochenspalte am Desktop
 * (Betreiber, 16.10.2026): In einem Drittel der Spalte brachen die
 * Schrittnamen mitten im Wort, in sechs Sprachen schon bei normaler Schrift.
 * Jetzt stehen dort nur die Punkte, darunter der Schritt, an dem es steht.
 * Wie es aussieht, prüft `tests/schmale-spalte.test.ts` am CSS.
 */

const SCHRITTE: SpurSchritt[] = [
  { name: 'Eins', wert: '3/4', lage: 'voll' },
  { name: 'Zwei', lage: 'jetzt' },
  { name: 'Drei', wert: '0/2', lage: 'leer' },
]

const zeige = (form: 'knapp' | 'punkte', schritte = SCHRITTE) => render(<Spur form={form} schritte={schritte} label="Woche" />).container

afterEach(cleanup)

describe('Spur in der Form „punkte"', () => {
  it('nennt sichtbar nur den laufenden Schritt — vorgelesen werden alle', () => {
    const spur = zeige('punkte')
    expect([...spur.querySelectorAll('.spur-name')].map((n) => [n.textContent, n.className])).toEqual([
      ['Eins', 'spur-name sr-only'],
      ['Zwei', 'spur-name sr-only'],
      ['Drei', 'spur-name sr-only'],
    ])
    expect([...spur.querySelectorAll('.spur-wert')].map((w) => [w.textContent, w.className])).toEqual([
      ['3/4', 'spur-wert sr-only'],
      ['0/2', 'spur-wert sr-only'],
    ])
    const unterschrift = spur.querySelector('.spur-unterschrift')!
    expect(unterschrift.getAttribute('aria-hidden')).toBe('true')
    expect(unterschrift.textContent).toBe('Zwei')
    // Der laufende Schritt bleibt der laufende — auch für den Screenreader.
    expect(spur.querySelector('[aria-current="step"] .spur-name')?.textContent).toBe('Zwei')
  })

  it('die Unterschrift trägt die Zahl des Schritts', () => {
    const spur = zeige(
      'punkte',
      SCHRITTE.map((s) => (s.lage === 'jetzt' ? { ...s, wert: '5/9' } : s)),
    )
    expect(spur.querySelector('.spur-unterschrift-wert')?.textContent).toBe('5/9')
    expect(spur.querySelector('.spur-unterschrift-name')?.textContent).toBe('Zwei')
  })

  it('ohne Zahl kein Strich — vorgelesen hieße er „Minus"; in der knappen Form bleibt er, dort sieht man ihn', () => {
    expect(zeige('punkte').textContent).not.toContain('–')
    cleanup()
    expect(zeige('knapp').querySelector('[aria-current="step"] .spur-wert')?.textContent).toBe('–')
  })

  it('die knappe Form behält ihre Namen und hat keine Unterschrift', () => {
    const spur = zeige('knapp')
    expect([...spur.querySelectorAll('.spur-name')].map((n) => n.className)).toEqual(['spur-name', 'spur-name', 'spur-name'])
    expect(spur.querySelector('.spur-unterschrift')).toBeNull()
  })
})

describe('imBlick — welcher Schritt beim Namen genannt wird', () => {
  const mit = (...lagen: SpurSchritt['lage'][]) => SCHRITTE.map((s, i) => ({ ...s, lage: lagen[i]! }))

  it('der laufende', () => {
    expect(imBlick(mit('voll', 'voll', 'jetzt'))?.name).toBe('Drei')
  })

  it('ohne laufenden der letzte erledigte — alles fertig heißt: beim letzten Schritt', () => {
    expect(imBlick(mit('voll', 'voll', 'voll'))?.name).toBe('Drei')
    expect(imBlick(mit('leer', 'voll', 'leer'))?.name).toBe('Zwei')
  })

  it('ohne beides der erste', () => {
    expect(imBlick(mit('leer', 'teil', 'leer'))?.name).toBe('Eins')
  })
})
