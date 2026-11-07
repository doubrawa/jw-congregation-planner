/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ARTEN,
  AXE_AUSNAHMEN,
  AXE_GEGENPROBE_ARTEN,
  axeImDokument,
  befundeAus,
  bereitImDokument,
  blattImDokument,
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

const auftrag = { zustand: 's=start', breite: 320, sprache: 'de', darstellung: 'hell' as const, schrift: '1', versammlung: 'de' }
const ruhig = { fenster: 320, seite: 0, rollen: [], ragen: [], abgeschnitten: [], text: [], sprache: [], fehlergrenzen: 0, zeichen: 500 }

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('lang')
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
    document.documentElement.lang = 'de'
    ausQuelltext(stoerungImDokument)
    expect(fehler).toHaveBeenCalledWith('GEGENPROBE: Konsole')
    const m = ausQuelltext(messenImDokument)
    expect(m.fehlergrenzen).toBe(1)
    expect(m.text).toEqual([expect.stringContaining('GEGENPROBE undefined')])
    expect(m.sprache).toEqual([{ wo: 'p in lang="de"', wert: 'ГЕГЕНПРОБА' }])
    // Die Ausnahme steht im Zeitgeber; der Lauf hier soll sie nicht werfen.
    vi.clearAllTimers()
  })
})

describe('Ein Blatt öffnen (T173)', () => {
  it('läuft aus seinem Quelltext: klickt der Reihe nach und wartet, bis das Blatt dasteht', async () => {
    document.body.innerHTML = '<div inert><button class="auf">Nachbarwoche</button></div><button class="auf">Öffnen</button>'
    const geklickt: string[] = []
    for (const knopf of document.querySelectorAll('button.auf')) {
      knopf.addEventListener('click', () => {
        geklickt.push(knopf.textContent ?? '')
        setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<div role="dialog" class="blatt">Blatt</div>'), 20)
      })
    }
    expect(await ausQuelltext(blattImDokument, { klicks: ['.auf'], warten: '.blatt', ms: 1000 })).toEqual([])
    // Die Nachbarwoche (`inert`) bekommt den Klick nicht.
    expect(geklickt).toEqual(['Öffnen'])
  })

  it('sagt, was fehlte — den Klick oder das Blatt', async () => {
    document.body.innerHTML = '<button class="auf">Öffnen</button>'
    expect(await ausQuelltext(blattImDokument, { klicks: ['.gibtsnicht'], warten: '.blatt', ms: 0 })).toEqual(['Klick fehlt: .gibtsnicht'])
    expect(await ausQuelltext(blattImDokument, { klicks: ['.auf'], warten: '.blatt', ms: 0 })).toEqual(['Blatt fehlt: .blatt'])
  })
})

describe('Die Sprache der Inhalte (T173)', () => {
  const sprache = (html: string, seite = 'de') => {
    document.documentElement.lang = seite
    document.body.innerHTML = html
    return ausQuelltext(messenImDokument).sprache
  }

  it('fremde Schrift braucht ein `lang` derselben Schrift — die Sprache darin ist frei', () => {
    expect(
      sprache(
        '<p>Lied 1 · Simon Krüger</p>' + // lateinisch: wird nicht geprüft
          '<p lang="ru">Песня 1</p>' +
          '<p lang="uk">Пісня 2</p>' + // dieselbe Schrift, andere Sprache: nicht zu unterscheiden
          '<div lang="ar"><span>غدًا</span></div>' +
          '<p lang="fa">سرود ۱</p>',
      ),
    ).toEqual([])
  })

  it('meldet Programm ohne sein `lang` und Oberfläche im `lang` des Programms', () => {
    const befunde = sprache(
      '<span class="prog-lied">Песня 1</span>' + '<div lang="de"><span class="rolle">الرئيس</span></div>' + '<p>Чтение Библии · غدًا</p>',
      'ar',
    )
    expect(befunde).toEqual([
      { wo: 'span.prog-lied in lang="ar"', wert: 'Песня 1' },
      { wo: 'span.rolle in lang="de"', wert: 'الرئيس' },
      // Zwei Schriften in einem Text: Ein `lang` kann nicht beide auszeichnen.
      { wo: 'p in lang="ar"', wert: 'Чтение Библии · غدًا' },
    ])
  })

  it('prüft, was statt des Textes vorgelesen wird — und nur das', () => {
    const befunde = sprache(
      '<div lang="ru"><button aria-label="تأكيد"></button><img alt="Песня" src="x.png"></div>' +
        '<div aria-hidden="true"><p>Песня 3</p></div>' +
        '<div inert><p>Песня 4</p></div>' +
        '<p style="visibility:hidden">Песня 5</p>',
    )
    expect(befunde).toEqual([{ wo: 'button[aria-label] in lang="ru"', wert: 'تأكيد' }])
  })

  it('ein Attribut aus zwei Schriften ist kein Befund — es lässt sich nicht teilweise auszeichnen', () => {
    // Text dagegen schon: derselbe Wortlaut als Inhalt ist einer.
    expect(sprache('<button aria-label="Чтение Библии: تأكيد"></button><p>Чтение Библии: تأكيد</p>', 'ar')).toEqual([
      { wo: 'p in lang="ar"', wert: 'Чтение Библии: تأكيد' },
    ])
    expect(sprache('<button aria-label="Чтение Библии: Bestätigen"></button>')).toEqual([])
  })

  it('Chinesisch, Japanisch und Koreanisch unter ihrem `lang` — `Intl` nennt ihre Schrift anders als Unicode', () => {
    expect(sprache('<p lang="cmn-hant">王國聚會所</p><p lang="ja">ひらがなとカタカナと漢字</p><p lang="ko">한국어</p>')).toEqual([])
    expect(sprache('<p>王國</p>').map((b) => b.wo)).toEqual(['p in lang="de"'])
  })

  it('ein leeres oder ungültiges `lang` hat keine Schrift', () => {
    expect(sprache('<p lang="">Песня</p><p lang="x-">غدًا</p>').map((b) => b.wo)).toEqual(['p in lang=""', 'p in lang="x-"'])
  })

  it('jede Stelle einmal je Lauf, höchstens acht', () => {
    const viele = Array.from({ length: 12 }, (_, i) => `<span class="s${i}">Песня ${i}</span><span class="s${i}">Песня</span>`).join('')
    const befunde = sprache(viele)
    expect(befunde).toHaveLength(8)
    expect(new Set(befunde.map((b) => b.wo)).size).toBe(8)
  })
})

describe('axe in der Seite (T173)', () => {
  /** Ein Ergebnis, wie axe.run es liefert — mit den Elementen (`elementRef`). */
  const axeMit = (violations: unknown[]) => {
    const run = vi.fn(async () => ({ violations }))
    vi.stubGlobal('axe', { run })
    return run
  }

  it('läuft aus seinem Quelltext, mit den Stichwörtern und nur den Verstößen', async () => {
    document.body.innerHTML = '<button class="leer"></button>'
    const knopf = document.querySelector('button')
    const run = axeMit([
      {
        id: 'button-name',
        impact: 'critical',
        help: 'Buttons must have discernible text',
        nodes: [{ target: ['.leer'], html: '<button class="leer"></button>', failureSummary: 'Fix any of the following:\n  Element has no title attribute\n  ', element: knopf }],
      },
    ])
    const verstoesse = await ausQuelltext(axeImDokument, { stichwoerter: ['wcag2a'], ausnahmen: [] })
    expect(run).toHaveBeenCalledWith(document, { runOnly: { type: 'tag', values: ['wcag2a'] }, resultTypes: ['violations'], elementRef: true })
    expect(verstoesse).toEqual([
      {
        regel: 'button-name',
        wirkung: 'critical',
        hilfe: 'Buttons must have discernible text',
        anzahl: 1,
        stellen: [{ ziel: '.leer', html: '<button class="leer"></button>', warum: 'Element has no title attribute' }],
      },
    ])
  })

  it('eine Ausnahme nimmt die Stelle einer Regel heraus — nicht die Regel und nicht die Stelle für andere Regeln', async () => {
    document.body.innerHTML = '<div class="bewusst"><span id="a">a</span></div><span id="b">b</span>'
    const a = document.getElementById('a')
    const b = document.getElementById('b')
    axeMit([
      { id: 'color-contrast', impact: 'serious', help: 'Kontrast', nodes: [{ target: ['#a'], html: '', element: a }, { target: ['#b'], html: '', element: b }] },
      { id: 'region', impact: 'moderate', help: 'Landmarke', nodes: [{ target: ['#a'], html: '', element: a }] },
    ])
    const verstoesse = await ausQuelltext(axeImDokument, { stichwoerter: [], ausnahmen: [{ regel: 'color-contrast', stelle: '.bewusst' }] })
    expect(verstoesse.map((v) => [v.regel, v.anzahl, v.stellen.map((s) => s.ziel)])).toEqual([
      ['color-contrast', 1, ['#b']],
      ['region', 1, ['#a']],
    ])
  })

  it('eine Regel, deren Stellen alle Ausnahmen sind, verschwindet', async () => {
    document.body.innerHTML = '<div class="bewusst"></div>'
    axeMit([{ id: 'region', impact: 'moderate', help: 'Landmarke', nodes: [{ target: ['div'], html: '', element: document.querySelector('div') }] }])
    expect(await ausQuelltext(axeImDokument, { stichwoerter: [], ausnahmen: [{ regel: 'region', stelle: '.bewusst' }] })).toEqual([])
  })

  it('jede Ausnahme nennt Regel, Stelle und Grund', () => {
    for (const a of AXE_AUSNAHMEN) {
      expect(a.regel).toMatch(/^[a-z0-9-]+$/)
      expect(() => document.querySelector(a.stelle)).not.toThrow()
      expect(a.grund.length).toBeGreaterThan(20)
    }
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

  it('die Sprache und axe werden Befunde — axe nach seiner Wirkung, je Regel eine Stelle im Bericht', () => {
    const befunde = befundeAus({
      auftrag,
      messung: { ...ruhig, sprache: [{ wo: 'span.prog-lied in lang="ar"', wert: 'Песня 1' }] },
      axe: [
        {
          regel: 'target-size',
          wirkung: 'serious',
          hilfe: 'All touch targets must be 24px large',
          anzahl: 3,
          stellen: [{ ziel: '.knopf-neu', html: '<button class="knopf-neu">', warum: '' }],
        },
      ],
    })
    expect(befunde).toEqual([
      { art: 'sprache', wo: 'span.prog-lied in lang="ar"', wert: 'Песня 1' },
      { art: 'axe:serious', wo: 'target-size — All touch targets must be 24px large', wert: '3× .knopf-neu' },
    ])
  })

  it('jede Art, die vorkommen kann, hat ihren Rang im Bericht — axe nach Wirkung, die schwerste zuerst', () => {
    expect([...GEGENPROBE_ARTEN, ...AXE_GEGENPROBE_ARTEN].filter((a) => !ARTEN.includes(a))).toEqual([])
    expect(ARTEN.filter((a) => a.startsWith('axe:'))).toEqual(['axe:critical', 'axe:serious', 'axe:moderate', 'axe:minor'])
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

  it('mit axe verlangt sie auch dessen Arten', () => {
    const ohneAxe = GEGENPROBE_ARTEN.map((art) => ({ art, wo: 'GEGENPROBE' }))
    expect(gegenprobeLuecken(ohneAxe, [...GEGENPROBE_ARTEN, ...AXE_GEGENPROBE_ARTEN])).toEqual(AXE_GEGENPROBE_ARTEN)
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
