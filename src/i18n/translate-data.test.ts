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
 * Veröffentlichte Titel — Artikel, Vorträge, Publikationen. Sie stehen auf
 * jw.org in jeder Sprache, aber mit dem dort gewählten Wortlaut; eine eigene
 * Übersetzung wäre eine Erfindung. Dieselbe Linie wie bei den
 * Verweis-Vorlagen: lieber ein erkennbar deutsch gebliebener Titel als ein
 * ausgedachter (siehe `makeTr('bg')('wcg Kap. 15')` in translate.test.ts).
 *
 * Die Liste ist bewusst geschlossen: ein neuer Schlüssel, den keine Sprache
 * hat, lässt den Test scheitern, statt hier stillschweigend zu landen. Wer die
 * Titel nachträgt, misst sie an jw.org und streicht sie hier.
 */
const NUR_GEMESSEN_UEBERSETZBAR = new Set([
  '„Schätze Jehovas größtes Geschenk“',
  '„Lauft so, dass ihr den Preis gewinnt“',
  '„Bleibt in Gottes Liebe“',
  '„Ein Name, der zählt“',
  '„Bewahrt die Einheit“',
  '„Frieden in einer unruhigen Welt“',
  '„Jehovas Barmherzigkeit widerspiegeln“',
  '„Worauf gründet echte Hoffnung?“',
  '„Bleibt wachsam“',
  '„Wem kannst du wirklich vertrauen?“',
  '„Loyal in Prüfungen“',
  '„Woran erkennt man echten Glauben?“',
  '„Dient Jehova mit Freude“',
  'Was wir von den Rechabitern lernen',
  'Jehova belohnt Mut — das Beispiel Ebed-Melechs',
  'Baut einander auf',
  'Auf Jehova hören — auch wenn es schwerfällt',
  'Jehova sorgt für sein Volk',
  'Jehovas Wort erfüllt sich immer',
  'Bleib loyal wie Baruch',
  'Über Jehovas Eigenschaften nachzudenken, stärkt unseren Glauben',
  'Geh während der besonderen Aktion zielorientiert vor',
  // Fachbegriffe des Gedächtnismahls: jw.org hat dafür feste Wendungen, die
  // je Sprache gemessen gehören („passing the emblems", „Memorial talk").
  'Gedächtnismahl-Ansprache',
  'Symbole herumreichen',
  // Reine Demo-Inhalte (Mitteilungs-Fixtures), nirgends produktiv sichtbar.
  'Gespräche beginnen (informell)',
  'Programm für September ist online',
  'vor 2 Std.',
  'heute, 08:00',
])

describe('FRAG — Programm-Fragmente in jeder Sprache', () => {
  const enKeys = Object.keys(FRAG.en).sort()
  const pflicht = enKeys.filter((k) => !NUR_GEMESSEN_UEBERSETZBAR.has(k))

  it('Englisch ist die Referenz und nicht leer', () => {
    expect(enKeys.length).toBeGreaterThan(50)
  })

  it('die Ausnahmeliste beschreibt nur Vorhandenes', () => {
    // Sonst bliebe ein Tippfehler darin unbemerkt und deckte still ab, was er
    // gar nicht meint.
    const unbekannt = [...NUR_GEMESSEN_UEBERSETZBAR].filter((k) => !(k in FRAG.en))
    expect(unbekannt).toEqual([])
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
   * Ohne Publikationskürzel gibt es nichts zu übersetzen: in den Arbeitsheften
   * dieser Sprachen stehen „th"/„lmd"/„lff"/„wcg" gar nicht (siehe
   * verweisRegeln in translate.ts). Alle übrigen brauchen einen Eintrag.
   */
  const OHNE_KUERZEL = new Set(['zh', 'ja', 'ko', 'ar', 'he', 'fa', 'ur'])
  /**
   * Bulgarisch behandelt im Versammlungsbibelstudium eine andere Publikation —
   * für `wcg` gibt es dort keine gemessene Vorlage, und Erfundenes wäre
   * schlimmer als ein erkennbar unübersetzter Verweis (siehe translate.test.ts).
   */
  const OHNE_WCG = new Set(['bg'])
  const PFLICHT: Array<keyof RefDict> = ['thLek', 'lmdLekP', 'lffLekP', 'gruppe', 'vers']

  it.each(CODES.filter((c) => !OHNE_KUERZEL.has(c)))('%s hat die Pflicht-Vorlagen', (code) => {
    const ref = REF[code]
    expect(ref, `${code}: REF fehlt ganz`).toBeDefined()
    const noetig = OHNE_WCG.has(code) ? PFLICHT : [...PFLICHT, 'wcgKap' as const]
    const fehlend = noetig.filter((f) => typeof ref?.[f] !== 'function')
    expect(fehlend, code).toEqual([])
  })

  it('die Ausnahmen sind ausdrücklich benannt und wachsen nicht heimlich', () => {
    expect([...OHNE_KUERZEL].sort()).toEqual(['ar', 'fa', 'he', 'ja', 'ko', 'ur', 'zh'])
    expect([...OHNE_WCG]).toEqual(['bg'])
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
