import { describe, expect, it } from 'vitest'
import { APP_LANGS } from './langs'
import { EXTRA, EXTRA_EN, FRAG, REF, type RefDict } from './translate-data'
import { makeTr } from './translate'

/**
 * Vollständigkeitsprüfung der **Programm**-Wörterbücher — das Gegenstück zu
 * ui.test.ts, das dasselbe für die Oberfläche tut.
 *
 * Dass es diese Prüfung nicht gab, ist der Grund, warum 30 von 33 Sprachen
 * über Monate 26–34 Fragmente fehlten (u. a. „gerade eben" an jeder Mitteilung
 * und „ohne Zuteilungen" nach jedem Import) — und warum ein kaputter
 * Monats-Nachschlag in einer Datumsregel unbemerkt blieb, bis er die App
 * abstürzen ließ.
 */

const CODES = APP_LANGS.map((l) => l.code).filter((c) => c !== 'de')

/**
 * **Es gibt keine unübersetzten Zeichenketten „für später".** Das ist die
 * Vorgabe des Betreibers (13.8.2026), und sie hat einen Grund: Fehlende
 * Übersetzungen sind hier mehrfach erst Monate später aufgefallen (siehe der
 * Absatz oben) — was mit einem Feature nicht mitgemessen wird, wird vergessen.
 *
 * Diese Liste ist deshalb **keine Warteschlange**, sondern die Menge der
 * Zeichenketten, die aus einem *benennbaren* Grund nicht übersetzt werden
 * können. Jeder Eintrag muss seinen Grund tragen; ein Test darunter prüft das,
 * ein zweiter deckelt die Größe. Wer etwas hier parkt, statt zu messen, muss
 * es also aussprechen.
 */
type Grund =
  /**
   * Frei erfundener Demo-Inhalt im Stil einer jw.org-Veröffentlichung.
   *
   * **Nachgemessen am 13.8.2026** und dabei richtiggestellt: Diese Titel
   * standen hier als „veröffentlichte Titel, die noch zu messen sind". Sie
   * stehen aber nirgends. Die echte Wochenseite 14.–20. September 2026 nennt
   * für den ersten Schätze-Punkt „Jehova belohnt Treue und Gehorsam" und als
   * Lesestoff Jeremia 34–35; die Demo erfindet „Was wir von den Rechabitern
   * lernen" und Jeremia 34–36. Messen lässt sich also nichts, und selbst
   * übersetzen hieße, in 33 Sprachen Titel im Stil einer Veröffentlichung zu
   * erfinden, die es nicht gibt.
   *
   * Sichtbar sind sie nur im Demo-Modus, und dort nur, wenn die
   * Versammlungssprache **nicht** Deutsch ist — sonst übersetzt `tp` den
   * Programmtext gar nicht.
   */
  | 'demo-erfunden'
  /**
   * Fachbegriff mit festem jw.org-Wortlaut, den die App produktiv (noch) nicht
   * erzeugt. Messbar, sobald sie es tut.
   */
  | 'fachbegriff-ungenutzt'

const NUR_GEMESSEN_UEBERSETZBAR: Record<string, Grund> = {
  // jw.org hat dafuer feste Wendungen (`Memorial talk`, `passing the
  // emblems`); die App erzeugt aber kein Gedaechtnismahl-Programm - T64/T65
  // setzen den Anlass und den Ausfall, nicht den Ablauf. Sobald sie es tut,
  // sind beide zu messen und hier zu streichen.
  'Gedächtnismahl-Ansprache': 'fachbegriff-ungenutzt',
  'Symbole herumreichen': 'fachbegriff-ungenutzt',
}
describe('FRAG — Programm-Fragmente in jeder Sprache', () => {
  const enKeys = Object.keys(FRAG.en).sort()
  const ausnahmen = Object.keys(NUR_GEMESSEN_UEBERSETZBAR)
  const pflicht = enKeys.filter((k) => !(k in NUR_GEMESSEN_UEBERSETZBAR))

  it('Englisch ist die Referenz und nicht leer', () => {
    expect(enKeys.length).toBeGreaterThan(50)
  })

  it('die Ausnahmeliste beschreibt nur Vorhandenes', () => {
    // Sonst bliebe ein Tippfehler darin unbemerkt und deckte still ab, was er
    // gar nicht meint.
    expect(ausnahmen.filter((k) => !(k in FRAG.en))).toEqual([])
  })

  it('jede Ausnahme trägt einen Grund', () => {
    // Der Kern der Vorgabe „nichts bleibt unübersetzt liegen": Ohne benennbaren
    // Grund gibt es keine Ausnahme. Ein leerer oder unbekannter Wert fällt hier
    // auf, statt als stille Warteschlange weiterzuwachsen.
    const gruende = new Set(['demo-erfunden', 'fachbegriff-ungenutzt'])
    const ohne = ausnahmen.filter((k) => !gruende.has(NUR_GEMESSEN_UEBERSETZBAR[k] ?? ''))
    expect(ohne).toEqual([])
  })

  it('die Ausnahmeliste wächst nicht heimlich', () => {
    /*
      Eine Ausnahmeliste ohne Deckel ist keine Ausnahme mehr, sondern eine
      Abkürzung: Wer künftig ein unübersetztes Fragment hier einträgt, statt
      die Vorlage zu messen, ändert damit auch diese Zahl — und muss es
      begründen. Die Prüfung darüber („beschreibt nur Vorhandenes") fängt nur
      Tippfehler, nicht das Wachsen.

      **Von 28 auf 2** am 13. August 2026: 26 der Einträge waren erfundene
      Demo-Titel im Stil einer jw.org-Veröffentlichung. Sie heißen jetzt
      „Demoaufgabe 1" und „Demo-Studienartikel 3" — als Platzhalter erkennbar,
      damit kein Planer sie für sein Programm hält —, und ihre toten
      Wörterbuch-Einträge sind mit ihnen gegangen.
    */
    expect(ausnahmen.length).toBe(2)
  })

  it('nichts wird „für später" geparkt — jede Ausnahme ist unerreichbar', () => {
    /*
      Der einzige verbliebene Grund sagt: Die App **erzeugt** diese Zeichenkette
      gar nicht. `demo-erfunden` gibt es als Grund weiterhin, wird aber von
      niemandem mehr gebraucht. Käme ein Grund im Sinne von „später" hinzu,
      müsste er in `Grund` eingetragen werden — und genau das soll auffallen.
    */
    expect([...new Set(Object.values(NUR_GEMESSEN_UEBERSETZBAR))]).toEqual(['fachbegriff-ungenutzt'])
  })

  it.each(CODES)('%s deckt alle Pflicht-Fragmente ab', (code) => {
    const eigene = FRAG[code] ?? {}
    const fehlend = pflicht.filter((k) => !(k in eigene))
    expect(fehlend, `${code}: ${fehlend.length} fehlend`).toEqual([])
  })

  it('kein Wert ist leer oder nur Leerraum', () => {
    const kaputt: string[] = []
    for (const code of [...CODES, 'en']) {
      for (const [k, v] of Object.entries(FRAG[code] ?? {})) {
        if (!v.trim()) kaputt.push(`${code}.${k}`)
      }
    }
    expect(kaputt).toEqual([])
  })
})

describe('EXTRA — kurze Phrasen mit Platzhalter', () => {
  const felder = Object.keys(EXTRA_EN) as Array<keyof typeof EXTRA_EN>

  it.each(CODES)('%s liefert alle Phrasen und gibt den Wert weiter', (code) => {
    const ex = EXTRA[code]
    // Ohne eigenen Eintrag greift bewusst der EN-Fallback (makeTrIntl) —
    // dann ist nichts zu prüfen, aber es muss auffallen können.
    if (!ex) return
    for (const feld of felder) {
      expect(typeof ex[feld], `${code}.${feld}`).toBe('function')
      // Der eingesetzte Wert muss im Ergebnis auftauchen, sonst verschluckt
      // die Phrase ihn (z. B. „min: () => 'Min.'").
      const out = ex[feld]('42')
      expect(out, `${code}.${feld}`).toContain('42')
    }
  })
})

describe('REF — Verweis-Vorlagen', () => {
  /**
   * Vorlagen, die das **heutige** Arbeitsheft erzeugt. Sie müssen überall da
   * sein, wo die Sprache überhaupt ein REF hat.
   *
   * Belegt an der Quelle (jw.org, Ausgaben September/Oktober und
   * November/Dezember 2026): der Programm-Parser übernimmt die Quellenangabe
   * wörtlich aus der Klammer, und dort steht durchgängig
   *   „th Lektion 11"  ·  „lmd Lektion 4 Punkt 3"  ·  „lff Lektion 20 Punkt 4"
   * — `th` ohne Punktnummer, `lmd`/`lff` immer mit.
   */
  const AKTUELL: Array<keyof RefDict> = ['thLek', 'lmdLekP', 'lffLekP', 'wcgKap', 'gruppe', 'vers']

  /**
   * Vorlagen für Formen, die **nur in älteren Arbeitsheften** vorkommen:
   * `lmd Lektion 3` und `lff Lektion 20` ohne Punktnummer sowie
   * `lmd Anhang A Punkt 21`. An denselben zwei Ausgaben geprüft — keine davon
   * kommt heute noch vor; die Anhang-A-Stelle wird inzwischen als
   * „lmd Lektion 1 Punkt 5" zitiert.
   *
   * Sie bleiben im Wörterbuch, weil die App bis zu 52 Wochen zurück lädt und
   * Altbestände sie noch enthalten (auch der Demo-Datensatz). Fehlt eine, wird
   * der Verweis erkennbar deutsch angezeigt — `verweisRegeln` lässt die Regel
   * dann einfach aus. Deshalb hier keine Pflicht, sondern nur die Buchführung
   * darüber, wo sie fehlt.
   */
  const ALTBESTAND: Array<keyof RefDict> = ['lmdLek', 'lffLek', 'lmdAnh']

  /**
   * Bulgarisch behandelt im Versammlungsbibelstudium eine andere Publikation —
   * für `wcg` gibt es dort keine gemessene Vorlage, und Erfundenes wäre
   * schlimmer als ein erkennbar unübersetzter Verweis.
   */
  const OHNE_WCG = new Set(['bg'])

  it.each(CODES)('%s hat alle heute erzeugten Vorlagen', (code) => {
    const ref = REF[code]
    expect(ref, `${code}: REF fehlt ganz`).toBeDefined()
    const noetig = AKTUELL.filter((f) => !(f === 'wcgKap' && OHNE_WCG.has(code)))
    const fehlend = noetig.filter((f) => typeof ref?.[f] !== 'function')
    expect(fehlend, `${code}: Vorlage für eine aktuelle Verweisform fehlt`).toEqual([])
  })

  it('die wcg-Ausnahme ist ausdrücklich benannt und wächst nicht heimlich', () => {
    expect([...OHNE_WCG]).toEqual(['bg'])
  })

  it('die Altbestand-Lücken sind vollständig verzeichnet', () => {
    // Buchführung, keine Forderung: wer eine dieser Vorlagen nachträgt oder
    // eine neue Sprache aufnimmt, ändert damit auch diese Liste — und muss
    // hinsehen, statt sie stillschweigend wachsen zu lassen.
    const luecken: string[] = []
    for (const code of CODES) {
      for (const f of ALTBESTAND) {
        if (typeof REF[code]?.[f] !== 'function') luecken.push(`${code}.${f}`)
      }
    }
    expect(luecken.sort()).toEqual(
      [
        'cs.lffLek', 'cs.lmdLek',
        'fa.lmdAnh',
        'hu.lffLek', 'hu.lmdLek',
        'ko.lffLek', 'ko.lmdLek',
        'sk.lffLek', 'sk.lmdLek',
        'sr.lmdAnh',
        'tr.lffLek', 'tr.lmdAnh', 'tr.lmdLek',
        'ur.lmdAnh',
        'zh.lffLek', 'zh.lmdLek',
      ].sort(),
    )
  })
})

describe('Produktiv sichtbare Fragmente sind überall übersetzt', () => {
  /*
    Diese erscheinen nicht nur in den Testdaten, sondern bei jedem Nutzer: der
    Text nach jedem Programm-Import und der kanonische Begriff aus jeder
    Treffpunkt-Mitteilung.

    **„gerade eben" stand hier bis zum 13. August 2026 mit dabei** — der
    Zeitstempel jeder neuen Mitteilung. Er ist jetzt keine Zeichenkette mehr:
    Die Mitteilung führt ihren Zeitpunkt (`at`), und die Form entsteht beim
    Anzeigen über `Intl.RelativeTimeFormat` (i18n/zeit.ts). Das war nötig, weil
    eine Liste von Sätzen den Fall gar nicht abdecken kann — „vor N Stunden"
    ist eine Form mit Zahl. Im Wörterbuch stand genau eine davon, `vor 2 Std.`,
    und die auch nur, weil sie zufällig in den Testdaten vorkam.
  */
  const IMMER = ['ohne Zuteilungen', 'Treffpunkte']

  it.each(CODES)('%s übersetzt sie wirklich (nicht nur Rückfall)', (code) => {
    const tr = makeTr(code)
    for (const s of IMMER) expect(tr(s), `${code}: „${s}"`).not.toBe(s)
  })
})

/**
 * **Die Verweis-Vorlagen einmal wirklich benutzen.**
 *
 * Die Prüfung darüber fragt, ob es die Vorlage *gibt* — `typeof === 'function'`.
 * Das ist die halbe Frage. Eine Vorlage, die ihre Zahl verschluckt
 * (`thLek: () => 'th Lektion'`), ist eine Funktion und käme durch; jede
 * Schulungsaufgabe dieser Sprache stünde danach ohne Lektionsnummer da, und
 * kein Test würde rot. Genau gegen diesen Fall führt die EXTRA-Prüfung ihre
 * Durchreiche-Probe — REF hatte sie nicht, und deshalb waren **281** dieser
 * Vorlagen (33 Sprachen × 9) nie ausgeführt.
 *
 * Gemessen wird hier am echten Weg: die Zeichenkette, wie der Programm-Parser
 * sie erzeugt, durch `makeTr` — nicht die Vorlage direkt. So läuft dieselbe
 * Regel-Reihenfolge wie beim Nutzer (`verweisRegeln`), und eine Vorlage, die
 * zwar richtig ist, aber nie greift, fällt mit auf.
 */
describe('REF — jede Vorlage reicht ihre Werte auch wirklich durch', () => {
  /** Eingabe (kanonisch deutsch) → die Teile, die im Ergebnis stehen müssen. */
  const FAELLE: Array<[keyof RefDict, string, string[]]> = [
    ['thLek', 'th Lektion 11', ['11']],
    // Beide Zahlen: eine Vorlage, die nur die Lektion behält, wäre sonst blind.
    ['lmdLekP', 'lmd Lektion 4 Punkt 3', ['4', '3']],
    ['lffLekP', 'lff Lektion 20 Punkt 7', ['20', '7']],
    ['lmdLek', 'lmd Lektion 4', ['4']],
    ['lffLek', 'lff Lektion 20', ['20']],
    ['wcgKap', 'wcg Kap. 15', ['15']],
    ['lmdAnh', 'lmd Anhang A Punkt 21', ['21']],
    ['gruppe', 'Gruppe 2', ['2']],
    // Kein Zahlenfall: der Name einer fremden Versammlung ist Freitext und
    // muss unverändert durchkommen.
    ['vers', 'Vers. Nordheim', ['Nordheim']],
  ]

  /** Die Vorlage mit denselben Werten selbst aufrufen — das Soll des Wegs. */
  const direkt = (ref: RefDict, feld: keyof RefDict, teile: string[]): string => {
    const fn = ref[feld] as ((...a: string[]) => string) | undefined
    return fn!(...teile)
  }

  it.each(CODES)('%s', (code) => {
    const ref = REF[code]
    if (!ref) return // ohne REF bleibt der Verweis erkennbar deutsch (oben geprüft)
    const tr = makeTr(code)
    for (const [feld, eingabe, teile] of FAELLE) {
      if (typeof ref[feld] !== 'function') continue // Altbestand-Lücke, oben verzeichnet
      const aus = tr(eingabe)
      // Die Regel muss auf die echte Eingabe greifen — nicht bloß existieren.
      // Verglichen wird gegen die Vorlage selbst statt gegen „ungleich der
      // Eingabe": Dänisch und Norwegisch sagen ebenfalls „Gruppe", und dort
      // ist ein unverändertes Ergebnis richtig, nicht ein Durchfall.
      expect(aus, `${code}.${feld}: die Regel greift nicht auf „${eingabe}"`).toBe(
        direkt(ref, feld, teile),
      )
      for (const teil of teile) {
        expect(aus, `${code}.${feld}: „${teil}" fehlt in „${aus}"`).toContain(teil)
      }
    }
  })

  it('die beiden Zahlen dürfen nicht vertauscht werden', () => {
    // Lektion und Punkt sind nicht symmetrisch: „Lektion 3 Punkt 4" verweist
    // auf etwas anderes als „Lektion 4 Punkt 3". Eine Vorlage, die sie dreht,
    // enthält beide Zahlen und käme durch die Probe darüber.
    for (const code of CODES) {
      const ref = REF[code]
      if (typeof ref?.lmdLekP !== 'function') continue
      const aus = ref.lmdLekP('4', '3')
      expect(aus.indexOf('4'), `${code}: Lektion steht nicht vor dem Punkt — „${aus}"`)
        .toBeLessThan(aus.indexOf('3'))
    }
  })

  it('verschiedene Publikationen bekommen verschiedene Vorlagen', () => {
    // th, lmd, lff und wcg sind vier Bücher. Wo eine Sprache das Kürzel
    // mitübersetzt (Ostasien, RTL), fällt ein kopierter Eintrag sonst nicht
    // auf — und der Verweis zeigte auf die falsche Veröffentlichung.
    for (const code of CODES) {
      const ref = REF[code]
      if (!ref?.thLek || !ref.wcgKap) continue
      expect(ref.thLek('5'), `${code}: th und wcg tragen dieselbe Vorlage`).not.toBe(ref.wcgKap('5'))
    }
  })
})
