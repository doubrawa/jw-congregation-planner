/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ARTEN,
  befundeAus,
  bereitImDokument,
  GEGENPROBE_ARTEN,
  gegenprobeLuecken,
  messenImDokument,
  MINDEST_ZEICHEN,
  stoerungImDokument,
  zusammenfassen,
} from './laufzeit-befunde.mjs'

/**
 * **Was die Laufzeit-Messung meldet** (T167) — und dass ihre Messung in der
 * Seite überhaupt läuft.
 *
 * Die Funktionen `…ImDokument` gehen als Quelltext in die Seite. Greift eine
 * davon auf etwas außerhalb ihrer selbst zu, scheitert sie dort mit einem
 * ReferenceError — hier fiele das bei einem direkten Aufruf nicht auf. Deshalb
 * laufen sie in diesen Proben aus ihrem Quelltext, wie im Browser.
 *
 * Maße kennt happy-dom nicht (`getBoundingClientRect` ist überall 0); ob die
 * Messung Überbreite findet, beweist die Gegenprobe vor jedem echten Lauf.
 */

/** Eine Funktion so ausführen, wie die Seite sie bekommt: aus ihrem Quelltext. */
const ausQuelltext = <T>(fn: (...a: never[]) => T, ...args: unknown[]): T =>
  new Function(`return (${fn.toString()})(...arguments)`)(...args) as T

const auftrag = { zustand: 's=start', breite: 320, sprache: 'de', darstellung: 'hell' as const, schrift: '1' }
const ruhig = { fenster: 320, seite: 0, rollen: [], ragen: [], abgeschnitten: [], text: [], fehlergrenzen: 0, zeichen: 500 }

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Die Messung in der Seite', () => {
  it('läuft aus ihrem Quelltext und findet Text, den kein Nutzer sehen soll', () => {
    document.body.innerHTML = '<main><p>Gruppe undefined</p><p>Hallo {name}</p><p>Alles gut</p></main>'
    const m = ausQuelltext(messenImDokument)
    expect(m.text).toEqual([expect.stringContaining('Gruppe undefined'), expect.stringContaining('Hallo {name}')])
    expect(m.zeichen).toBeGreaterThan(0)
  })

  it('zählt Fehlerkästen', () => {
    document.body.innerHTML = '<div class="err-box">Es ist ein Fehler aufgetreten</div>'
    expect(ausQuelltext(messenImDokument).fehlergrenzen).toBe(1)
  })

  it('die Bereitschaft läuft aus ihrem Quelltext und sagt, was fehlt', async () => {
    document.documentElement.lang = 'de'
    document.documentElement.style.setProperty('--fs', '1')
    document.body.innerHTML = '<div id="root"><div class="startbild"></div></div>'
    const offen = await ausQuelltext(bereitImDokument, { sprache: 'ar', schrift: '1.45', ms: 0 })
    expect(offen).toEqual(['Sprache de statt ar', 'Schriftstufe 1 statt 1.45', 'Startbild steht noch'])
    document.documentElement.lang = 'ar'
    document.documentElement.style.setProperty('--fs', '1.45')
    document.body.innerHTML = '<div id="root"><main>App</main></div>'
    expect(await ausQuelltext(bereitImDokument, { sprache: 'ar', schrift: '1.45', ms: 0 })).toEqual([])
  })

  it('die Störung der Gegenprobe läuft aus ihrem Quelltext und ist für die Messung sichtbar', () => {
    vi.useFakeTimers()
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('Image', class { src = '' })
    ausQuelltext(stoerungImDokument)
    expect(fehler).toHaveBeenCalledWith('GEGENPROBE: Konsole')
    const m = ausQuelltext(messenImDokument)
    expect(m.fehlergrenzen).toBe(1)
    expect(m.text).toEqual([expect.stringContaining('GEGENPROBE undefined')])
    // Die Ausnahme steht im Zeitgeber; der Lauf hier soll sie nicht werfen.
    vi.clearAllTimers()
  })
})

describe('Was ein Befund ist', () => {
  it('ein ruhiger Lauf hat keinen', () => {
    expect(befundeAus({ auftrag, bereit: [], meldungen: [], messung: ruhig })).toEqual([])
  })

  it('ein abgebrochener Lauf hat genau einen: den Abbruch', () => {
    expect(befundeAus({ auftrag, fehler: 'Zeitlimit: Page.navigate' })).toEqual([{ art: 'abbruch', wo: 'Zeitlimit: Page.navigate' }])
  })

  it('jede Art der Messung wird ein Befund — mit Stelle und Wert', () => {
    const befunde = befundeAus({
      auftrag,
      bereit: ['Sprache de statt ar'],
      meldungen: [{ art: 'konsole', text: 'console.error: kaputt' }],
      messung: {
        ...ruhig,
        seite: 17,
        ragen: [{ wo: 'span.start-zeile-text', wert: '38..337 px' }],
        abgeschnitten: [{ wo: 'div.karte', wert: '0..400 px' }],
        rollen: [{ wo: 'div.liste', wert: '500 > 300 px' }],
        text: ['Gruppe undefined'],
        fehlergrenzen: 1,
        zeichen: MINDEST_ZEICHEN - 1,
      },
    })
    expect(befunde.map((b) => b.art).sort()).toEqual(
      ['abgeschnitten', 'fehlergrenze', 'konsole', 'leer', 'nicht-bereit', 'ragt', 'rollen', 'seite', 'text'].sort(),
    )
    expect(befunde).toContainEqual({ art: 'seite', wo: 'Seite breiter als das Fenster', wert: '+17 px' })
    expect(befunde).toContainEqual({ art: 'ragt', wo: 'span.start-zeile-text', wert: '38..337 px' })
  })

  it('jede Art, die vorkommen kann, hat ihren Rang im Bericht', () => {
    expect(GEGENPROBE_ARTEN.filter((a) => !ARTEN.includes(a))).toEqual([])
  })
})

describe('Die Gegenprobe', () => {
  it('ist bestanden, wenn jede gestörte Art gemeldet wird', () => {
    expect(gegenprobeLuecken(GEGENPROBE_ARTEN.map((art) => ({ art, wo: 'GEGENPROBE' })))).toEqual([])
  })

  it('nennt jede Art, die die Messung übersah', () => {
    const ohneZwei = GEGENPROBE_ARTEN.filter((a) => a !== 'log' && a !== 'ragt').map((art) => ({ art, wo: 'GEGENPROBE' }))
    expect(gegenprobeLuecken(ohneZwei)).toEqual(['log', 'ragt'])
  })
})

describe('Der Bericht', () => {
  it('fasst gleiche Befunde zusammen — schwerste Art zuerst, in einer Art die häufigste Stelle', () => {
    const mitRagen = (breite: number, wo: string) => ({
      auftrag: { ...auftrag, breite },
      messung: { ...ruhig, ragen: [{ wo, wert: `0..${breite + 17} px` }] },
    })
    const gruppen = zusammenfassen(
      [
        mitRagen(320, 'span.a'),
        mitRagen(375, 'span.b'),
        mitRagen(1024, 'span.b'),
        { auftrag, meldungen: [{ art: 'ausnahme', text: 'TypeError: x' }] },
        { auftrag, messung: ruhig },
      ],
      (e) => `${e.auftrag.breite} px`,
    )
    expect(gruppen.map((g) => [g.art, g.wo, g.faelle.length])).toEqual([
      ['ausnahme', 'TypeError: x', 1],
      ['ragt', 'span.b', 2],
      ['ragt', 'span.a', 1],
    ])
    expect(gruppen[1]?.faelle).toEqual([
      { lauf: '375 px', wert: '0..392 px' },
      { lauf: '1024 px', wert: '0..1041 px' },
    ])
  })
})
