import { describe, expect, it } from 'vitest'
import { BILDSCHIRME } from '../../tests/testdaten/bildschirme'
import { parseGoAbschnitt, parseGoTarget } from './deeplink'

describe('parseGoTarget (Push-Deep-Link)', () => {
  it('liest das Ziel aus einem Hash', () => {
    expect(parseGoTarget('#go=aufgaben')).toBe('aufgaben')
    expect(parseGoTarget('#go=planen')).toBe('planen')
  })

  it('liest das Ziel aus einer vollen URL', () => {
    expect(parseGoTarget('https://x.dev/app/#go=aufgaben')).toBe('aufgaben')
  })

  it('ignoriert unbekannte oder fehlende Ziele (inkl. login)', () => {
    expect(parseGoTarget('#go=login')).toBeNull()
    expect(parseGoTarget('#go=quatsch')).toBeNull()
    expect(parseGoTarget('#s=start')).toBeNull()
    expect(parseGoTarget('')).toBeNull()
  })

  it('ein Bereich im Link ändert den Screen nicht — außer er stand früher woanders', () => {
    expect(parseGoTarget('#go=freie&abschnitt=einspringen')).toBe('freie')
    // Bis zum 24.10.2026 stand das Einspringen auf „Meine Aufgaben" (T134);
    // Pushes auf den Geräten tragen noch dieses Ziel.
    expect(parseGoTarget('#go=aufgaben&abschnitt=einspringen')).toBe('freie')
    expect(parseGoTarget('#go=programm&abschnitt=einspringen')).toBe('programm')
    expect(parseGoTarget('#go=aufgaben&abschnitt=quatsch')).toBe('aufgaben')
  })

  it('jeder Bildschirm außer der Anmeldung ist ein Ziel — auch ein neuer', () => {
    // Die Liste in deeplink.ts ist von Hand gepflegt; `BILDSCHIRME` hält
    // TypeScript vollständig. Ein neuer Bildschirm ohne Eintrag dort wäre aus
    // keinem Push erreichbar, und nichts meldete es.
    for (const screen of BILDSCHIRME) expect(parseGoTarget(`#go=${screen}`), screen).toBe(screen)
  })
})

/**
 * **„Ersatz gesucht" springt zum Bereich Einspringen** (T109) — statt einer
 * eigenen Seite, die fast immer leer wäre. Der Link trägt dafür einen Zusatz;
 * alles andere muss so bleiben, wie es war.
 */
describe('parseGoAbschnitt (Bereich innerhalb des Screens)', () => {
  it('„Ersatz gesucht" nennt den Bereich Einspringen — im neuen Ziel wie im alten', () => {
    expect(parseGoAbschnitt('https://versammlung.app/#go=freie&abschnitt=einspringen')).toBe('einspringen')
    expect(parseGoAbschnitt('#go=aufgaben&abschnitt=einspringen')).toBe('einspringen')
  })

  it('die Reihenfolge der Angaben spielt keine Rolle', () => {
    expect(parseGoAbschnitt('#abschnitt=einspringen&go=aufgaben')).toBe('einspringen')
  })

  it('ein Link ohne Zusatz springt nirgendwohin — alle bisherigen Pushes bleiben, wie sie waren', () => {
    expect(parseGoAbschnitt('#go=aufgaben')).toBeNull()
    expect(parseGoAbschnitt('https://versammlung.app/#go=planen')).toBeNull()
  })

  it('der Bereich gilt nur auf seinem eigenen Screen', () => {
    // Einspringen steht auf „Freie Plätze". Im Programm gibt es ihn nicht —
    // dort nach ihm zu suchen hieße, auf etwas zu warten, das nie kommt.
    expect(parseGoAbschnitt('#go=programm&abschnitt=einspringen')).toBeNull()
    expect(parseGoAbschnitt('#abschnitt=einspringen')).toBeNull()
  })

  it('unbekannte Bereiche werden verworfen — auch Namen aus dem Objekt-Prototyp', () => {
    expect(parseGoAbschnitt('#go=aufgaben&abschnitt=quatsch')).toBeNull()
    expect(parseGoAbschnitt('#go=aufgaben&abschnitt=toString')).toBeNull()
    expect(parseGoAbschnitt('#go=aufgaben&abschnitt=')).toBeNull()
  })

  it('der Debug-Hash hat keinen Bereich', () => {
    expect(parseGoAbschnitt('#s=aufgaben&l=de')).toBeNull()
  })
})
