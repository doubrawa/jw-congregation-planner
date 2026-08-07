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

  it('die Ausnahmeliste wächst nicht heimlich', () => {
    // Eine Ausnahmeliste ohne Deckel ist keine Ausnahme mehr, sondern eine
    // Abkürzung: Wer künftig ein unübersetztes Fragment hier einträgt, statt
    // die Vorlage zu messen, ändert damit auch diese Zahl — und muss es
    // begründen. Die Prüfung darüber („beschreibt nur Vorhandenes") fängt nur
    // Tippfehler, nicht das Wachsen.
    expect(NUR_GEMESSEN_UEBERSETZBAR.size).toBe(28)
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
  /** Alle neun Vorlagen, die `verweisRegeln` in translate.ts nachschlägt. */
  const ALLE: Array<keyof RefDict> = [
    'thLek',
    'lmdLekP',
    'lmdLek',
    'lffLekP',
    'lffLek',
    'wcgKap',
    'lmdAnh',
    'gruppe',
    'vers',
  ]

  /**
   * Was heute wirklich fehlt — Sprache für Sprache, Vorlage für Vorlage.
   *
   * Diese Liste ersetzt eine frühere Fassung, die ganze Sprachen ausnahm mit
   * der Begründung, in deren Arbeitsheften stünden „th"/„lmd"/„lff"/„wcg" gar
   * nicht. Das trifft nicht zu: alle sieben angeblich betroffenen Sprachen
   * haben REF-Einträge, und `verweisRegeln` begründet ausdrücklich das
   * Gegenteil („Ostasien und die RTL-Sprachen übersetzen das Kürzel mit").
   * Die Pauschal-Ausnahme verdeckte deshalb echte Lücken, statt sie zu
   * beschreiben.
   *
   * Gefüllt wird eine Lücke nur mit einer an jw.org **gemessenen** Vorlage;
   * eine ausgedachte wäre schlimmer als ein erkennbar deutsch gebliebener
   * Verweis. Wer eine misst, trägt sie in REF ein und streicht sie hier.
   *
   * Fachlich offen (siehe docs/analyse): ob `lmdLek`/`lffLek` — die Form
   * ohne Punktnummer aus älteren Arbeitsheften — überhaupt noch vorkommt.
   * Falls nicht, gehören die beiden aus `ALLE` heraus statt hier hinein.
   */
  const OHNE_VORLAGE: Record<string, Array<keyof RefDict>> = {
    bg: ['wcgKap'],
    cs: ['lmdLek', 'lffLek'],
    fa: ['lmdAnh'],
    hu: ['lmdLek', 'lffLek'],
    ko: ['lmdLek', 'lffLek'],
    sk: ['lmdLek', 'lffLek'],
    sr: ['lmdAnh'],
    tr: ['lmdLek', 'lffLek', 'lmdAnh'],
    ur: ['lmdAnh'],
    zh: ['lmdLek', 'lffLek'],
  }

  it.each(CODES)('%s hat jede Vorlage, die nicht ausdrücklich fehlt', (code) => {
    const ref = REF[code]
    expect(ref, `${code}: REF fehlt ganz`).toBeDefined()
    const bekannt = new Set(OHNE_VORLAGE[code] ?? [])
    const fehlend = ALLE.filter((f) => !bekannt.has(f) && typeof ref?.[f] !== 'function')
    expect(fehlend, `${code}: nicht angemeldete Lücke`).toEqual([])
  })

  it('die angemeldeten Lücken sind auch wirklich welche', () => {
    // Gegenrichtung: wer eine Vorlage nachträgt und den Eintrag hier stehen
    // lässt, bekommt sonst eine Ausnahme, die nichts mehr ausnimmt — und die
    // nächste echte Lücke verschwindet unter ihr.
    const ueberfluessig: string[] = []
    for (const [code, felder] of Object.entries(OHNE_VORLAGE)) {
      for (const f of felder) {
        if (typeof REF[code]?.[f] === 'function') ueberfluessig.push(`${code}.${f}`)
      }
    }
    expect(ueberfluessig).toEqual([])
  })

  it('die Lückenliste wächst nicht heimlich', () => {
    const anzahl = Object.values(OHNE_VORLAGE).reduce((n, f) => n + f.length, 0)
    expect(Object.keys(OHNE_VORLAGE).length).toBe(10) // betroffene Sprachen
    expect(anzahl).toBe(17) // fehlende Vorlagen insgesamt
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
