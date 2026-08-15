import { describe, expect, it } from 'vitest'
import { aufgabenLabel } from './useT'

/**
 * Eine Aufgabe hat zwei Hälften in zwei Sprachen.
 *
 * Der Titel des Programmpunkts steht in der Sprache der **Versammlung** (`tp`),
 * die Rolle in der des **Lesers** (`tu`) — so steht es im Docblock von `useT`:
 * „tu(name) … Namen/Rollen/Zeiten in App-Sprache".
 *
 * Zusammengefügt war das jahrelang ein String, und die Aufgabenliste schickte
 * ihn ganz durch `tp`. Solange App- und Versammlungssprache übereinstimmen,
 * fällt das nicht auf; sobald jemand die App in seiner Sprache liest, während
 * die Versammlung in einer anderen zusammenkommt, stand seine Rolle in der
 * falschen. Dieselbe Verwechslung wie beim Banner der offenen Plätze
 * (`OpenSlot.rolle`), nur eine Ansicht weiter.
 *
 * Die Übersetzer sind hier absichtlich Attrappen: geprüft wird, **welcher** auf
 * welche Hälfte trifft, nicht was die Wörterbücher liefern.
 */
const tp = (s: string): string => `VERS(${s})`
const tu = (s: string): string => `APP(${s})`
const i18n = { tp, tu }

describe('aufgabenLabel', () => {
  it('schickt den Titel zur Versammlungssprache, die Rolle zur App-Sprache', () => {
    expect(aufgabenLabel({ title: 'Versammlungsbibelstudium', rolle: 'Leiter' }, i18n)).toBe(
      'VERS(Versammlungsbibelstudium) · APP(Leiter)',
    )
  })

  it('ohne Rolle trägt der Titel allein', () => {
    expect(aufgabenLabel({ title: 'Bibellesung · Jer 38:1-13' }, i18n)).toBe(
      'VERS(Bibellesung · Jer 38:1-13)',
    )
  })

  it('ohne Titel trägt die Rolle allein — und wird NICHT zur Versammlungssprache', () => {
    // Der Fall aus Eröffnung und Abschluss: „Lied 27 · Gebet · Einleitende
    // Worte" benennt den Block, nicht die Aufgabe. Wer dort steht, hat Vorsitz.
    const text = aufgabenLabel({ title: '', rolle: 'Vorsitz' }, i18n)
    expect(text).toBe('APP(Vorsitz)')
    expect(text).not.toContain('VERS(')
  })

  it('Hilfsdienste und der Ratgeber ebenso — beides sind keine Programmtitel', () => {
    expect(aufgabenLabel({ title: '', rolle: 'Mikrofone' }, i18n)).toBe('APP(Mikrofone)')
    expect(aufgabenLabel({ title: '', rolle: 'Ratgeber' }, i18n)).toBe('APP(Ratgeber)')
  })

  it('ganz ohne Angaben bleibt es leer, ohne Trenner', () => {
    expect(aufgabenLabel({ title: '' }, i18n)).toBe('')
    expect(aufgabenLabel({ title: '', rolle: '' }, i18n)).toBe('')
  })
})
