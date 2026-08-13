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
  // Wachtturm-Studienartikel der Demo-Wochenenden.
  '„Schätze Jehovas größtes Geschenk“': 'demo-erfunden',
  '„Lauft so, dass ihr den Preis gewinnt“': 'demo-erfunden',
  '„Bleibt in Gottes Liebe“': 'demo-erfunden',
  '„Ein Name, der zählt“': 'demo-erfunden',
  '„Bewahrt die Einheit“': 'demo-erfunden',
  '„Frieden in einer unruhigen Welt“': 'demo-erfunden',
  '„Jehovas Barmherzigkeit widerspiegeln“': 'demo-erfunden',
  '„Worauf gründet echte Hoffnung?“': 'demo-erfunden',
  '„Bleibt wachsam“': 'demo-erfunden',
  '„Wem kannst du wirklich vertrauen?“': 'demo-erfunden',
  '„Loyal in Prüfungen“': 'demo-erfunden',
  '„Woran erkennt man echten Glauben?“': 'demo-erfunden',
  '„Dient Jehova mit Freude“': 'demo-erfunden',
  // Programmpunkte der Demo-Wochen unter der Woche.
  'Was wir von den Rechabitern lernen': 'demo-erfunden',
  'Jehova belohnt Mut — das Beispiel Ebed-Melechs': 'demo-erfunden',
  'Baut einander auf': 'demo-erfunden',
  'Auf Jehova hören — auch wenn es schwerfällt': 'demo-erfunden',
  'Jehova sorgt für sein Volk': 'demo-erfunden',
  'Jehovas Wort erfüllt sich immer': 'demo-erfunden',
  'Bleib loyal wie Baruch': 'demo-erfunden',
  'Über Jehovas Eigenschaften nachzudenken, stärkt unseren Glauben': 'demo-erfunden',
  'Geh während der besonderen Aktion zielorientiert vor': 'demo-erfunden',
  // Mitteilungs-Vorlagen der Demo.
  'Gespräche beginnen (informell)': 'demo-erfunden',
  'Programm für September ist online': 'demo-erfunden',
  'vor 2 Std.': 'demo-erfunden',
  'heute, 08:00': 'demo-erfunden',
  // jw.org hat dafür feste Wendungen („Memorial talk", „passing the
  // emblems"); die App erzeugt aber kein Gedächtnismahl-Programm — T64/T65
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
    // Eine Ausnahmeliste ohne Deckel ist keine Ausnahme mehr, sondern eine
    // Abkürzung: Wer künftig ein unübersetztes Fragment hier einträgt, statt
    // die Vorlage zu messen, ändert damit auch diese Zahl — und muss es
    // begründen. Die Prüfung darüber („beschreibt nur Vorhandenes") fängt nur
    // Tippfehler, nicht das Wachsen.
    expect(ausnahmen.length).toBe(28)
  })

  it('nichts wird „für später" geparkt — jede Ausnahme ist unerreichbar oder erfunden', () => {
    /*
      Beide zugelassenen Gründe sagen dasselbe aus zwei Richtungen: Es gibt
      **nichts zu messen**. `demo-erfunden` steht für Zeichenketten, die es auf
      jw.org gar nicht gibt (nachgemessen, siehe Typ oben);
      `fachbegriff-ungenutzt` für solche, die die App nicht erzeugt. Käme ein
      dritter Grund im Sinne von „später" hinzu, müsste er hier eingetragen
      werden — und genau das soll auffallen.
    */
    expect([...new Set(Object.values(NUR_GEMESSEN_UEBERSETZBAR))].sort()).toEqual([
      'demo-erfunden',
      'fachbegriff-ungenutzt',
    ])
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
  // Diese beiden erscheinen nicht nur in den Demo-Daten, sondern bei jedem
  // Nutzer: der Zeitstempel jeder neuen Mitteilung und der Text nach jedem
  // Programm-Import.
  const IMMER = ['gerade eben', 'ohne Zuteilungen', 'Treffpunkte']

  it.each(CODES)('%s übersetzt sie wirklich (nicht nur Rückfall)', (code) => {
    const tr = makeTr(code)
    for (const s of IMMER) expect(tr(s), `${code}: „${s}"`).not.toBe(s)
  })
})
