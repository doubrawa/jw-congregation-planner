import { describe, expect, it } from 'vitest'

/**
 * **Jede sichtbare Beschriftung kommt aus dem Wörterbuch — geprüft am
 * Quelltext.**
 *
 * Die Gegenprobe am gerenderten DOM (`oberflaeche-fremdsprache.test.tsx`) sieht
 * nur, was ihr Bestand hergibt: einen Zustand, ein paar Bildschirme, ein paar
 * Überlagerungen. Ein fest eingebauter deutscher Satz in einem Zweig, den
 * dieser Bestand nicht erreicht — ein Fehlerfall, ein Leerzustand, ein Dialog
 * mit besonderer Voraussetzung —, bliebe dort unsichtbar.
 *
 * Diese Prüfung geht deshalb den anderen Weg und liest den **Quelltext**, wie
 * `aufgaben-label-quelle.test.ts` und `testdaten-grenze.test.ts` es tun. Sie
 * behauptet zwei Dinge, die beide mechanisch nachprüfbar sind:
 *
 *  1. In keinem JSX steht ein Text fest eingebaut; er kommt immer aus einem
 *     Ausdruck (`{t.…}`, `{tu(…)}`, `{fill(…)}`).
 *  2. Auch die **zugänglichen** Beschriftungen — `aria-label`, `title`,
 *     `placeholder`, `alt` — sind Ausdrücke. Sie sind für Screenreader das,
 *     was der Text für die Augen ist, fallen aber niemandem auf, der sieht.
 *
 * Die Ausnahmen tragen ihren Grund, und ein Test darunter hält die Liste
 * ehrlich: Wer etwas hier einträgt, muss sagen, warum es nicht übersetzt wird.
 *
 * **Was sie nicht sieht**, und das mit Absicht: Zeichenketten *innerhalb* eines
 * Ausdrucks (`{kopiert ? 'Kopiert' : 'Kopieren'}`). Sie von den kanonisch
 * deutschen **Datenwerten** zu unterscheiden — `rolle: 'Vorsitz'`,
 * `status === 'offen'`, `LABEL_LAC` — geht am Quelltext nicht: Beide sind
 * deutsche Zeichenketten in einer `.tsx`. Nachgemessen am 27.8.2026 lieferte
 * eine solche Suche 40 Treffer, davon 38 richtige Daten. Für diese Hälfte ist
 * die DOM-Prüfung zuständig, die das Ergebnis misst statt der Absicht.
 */

/** Quelltext aller Dateien unter `src/` — über Vite, ohne Node-Abhängigkeit. */
const ROH = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Auf `verzeichnis/datei.tsx` normiert. Vite kürzt Dateien **dieses**
 * Verzeichnisses auf `./name.ts` — wer nur `../` abschneidet, verliert sie
 * stillschweigend (derselbe Fallstrick wie in `aufgaben-label-quelle.test.ts`).
 */
const HIER = 'i18n/'
const QUELLEN = new Map(
  Object.entries(ROH)
    .map(([pfad, text]): [string, string] => [
      pfad.startsWith('./') ? HIER + pfad.slice(2) : pfad.replace(/^(\.\.\/)+/, ''),
      text,
    ])
    .filter(([pfad]) => !/\.test\.tsx?$/.test(pfad)),
)

type Grund =
  /**
   * **Eigenname des Programms.** „Congregation Planner" steht in jeder Sprache
   * gleich da — wie „Jasmin" oder „Matcha" bei den Farbschemata. Ihn zu
   * übersetzen hieße, in 34 Sprachen einen zweiten Produktnamen zu erfinden.
   */
  | 'produktname'
  /**
   * **Werkzeug zur Fehlersuche, bewusst unübersetzt.** Die Gesten-Diagnose im
   * Profil erscheint erst nach fünf Antippern auf die Build-Zeile; ihr
   * Protokoll wird kopiert und weitergegeben, nicht gelesen. Der Quelltext
   * sagt das an Ort und Stelle („unübersetzt, bewusst schwer erreichbar").
   */
  | 'diagnose'
  /**
   * **Kein Wort, sondern eine Form.** Die Passwort-Punkte `••••••••` zeigen
   * bloß die Gestalt eines Passworts; es gibt nichts zu übersetzen.
   */
  | 'kein-wort'

/* ---- 1. Fest eingebauter Text im JSX ------------------------------------- */

/**
 * Textknoten zwischen zwei Tags: `>…<`. Klammern, Doppelpunkte und
 * Gleichheitszeichen schließen Typ-Ausdrücke aus (`Array<{…}>`,
 * `ReturnType<typeof useT>['t']`), die in `.tsx` genauso aussehen.
 */
const JSX_TEXT = />[^<>{}()[\]:;=]*[A-Za-zÄÖÜäöüß]{3,}[^<>{}()[\]:;=]*</gu

/**
 * Schlüsselwörter, die zwischen zwei JSX-Elementen stehen dürfen: `return
 * <Foo />` hinter einem `/>` sieht wie ein Textknoten aus, ist aber Code.
 */
const CODE_WORT = new Set(['return', 'else', 'await', 'null', 'undefined', 'true', 'false'])

function festeTexte(quelltext: string): string[] {
  const out: string[] = []
  for (const treffer of quelltext.matchAll(JSX_TEXT)) {
    const inhalt = treffer[0].slice(1, -1).trim().replace(/\s+/g, ' ')
    if (inhalt && !CODE_WORT.has(inhalt)) out.push(inhalt)
  }
  return out
}

/** Die einzigen Texte, die fest im JSX stehen dürfen — mit Grund. */
const ERLAUBTER_TEXT: Record<string, Grund> = {
  'CONGREGATION PLANNER': 'produktname',
  'C. PLANNER': 'produktname',
  Congregation: 'produktname',
  Planner: 'produktname',
  Aktualisieren: 'diagnose',
  Leeren: 'diagnose',
}

describe('Kein fest eingebauter Text im JSX', () => {
  it('jeder sichtbare Text kommt aus einem Ausdruck', () => {
    const gefunden: string[] = []
    for (const [pfad, text] of QUELLEN) {
      if (!pfad.endsWith('.tsx')) continue
      for (const inhalt of festeTexte(text)) {
        if (!(inhalt in ERLAUBTER_TEXT)) gefunden.push(`${pfad}: „${inhalt}"`)
      }
    }
    expect(gefunden).toEqual([])
  })

  it('die Prüfung sieht überhaupt etwas', () => {
    // Ohne diese Zeile wäre ein zu enger Ausdruck nicht von „alles sauber" zu
    // unterscheiden — die häufigste Art, mit der sich eine Quelltext-Prüfung
    // selbst stilllegt.
    const alle = [...QUELLEN]
      .filter(([pfad]) => pfad.endsWith('.tsx'))
      .flatMap(([, text]) => festeTexte(text))
    expect(alle.length).toBeGreaterThan(4)
  })

  it('jede Ausnahme steht auch wirklich noch im Quelltext', () => {
    // Ein Eintrag, den es nicht mehr gibt, deckt still ab, was er nicht meint.
    const alle = new Set(
      [...QUELLEN].filter(([p]) => p.endsWith('.tsx')).flatMap(([, t]) => festeTexte(t)),
    )
    const tot = Object.keys(ERLAUBTER_TEXT).filter((s) => !alle.has(s))
    expect(tot).toEqual([])
  })

  it('die Diagnose-Ausnahmen stehen nur in der Diagnose', () => {
    /*
      Der Grund „bewusst unübersetzt" gilt für **ein** Werkzeug, nicht für die
      Oberfläche. Stünde „Kopieren" plötzlich auch im Profil oder in den
      Einstellungen, wäre die Ausnahme dorthin gewandert, ohne dass jemand sie
      neu begründet hätte.
    */
    const diagnoseWorte = Object.entries(ERLAUBTER_TEXT)
      .filter(([, grund]) => grund === 'diagnose')
      .map(([wort]) => wort)
    for (const [pfad, text] of QUELLEN) {
      if (!pfad.endsWith('.tsx') || pfad === 'profil/Diagnose.tsx') continue
      const treffer = festeTexte(text).filter((s) => diagnoseWorte.includes(s))
      expect(treffer, pfad).toEqual([])
    }
  })
})

/* ---- 2. Zugängliche Beschriftungen --------------------------------------- */

/** `aria-label="…"` — ein Literal statt eines Ausdrucks. */
const LITERAL_ATTRIBUT = /\b(aria-label|aria-description|title|placeholder|alt)="([^"]*)"/gu

describe('Zugängliche Beschriftungen sind Ausdrücke', () => {
  it('kein aria-label, title, placeholder oder alt steht fest im Quelltext', () => {
    /*
      Sie sind die Hälfte der Oberfläche, die man nicht sieht: Ein deutsches
      `aria-label` in einer koreanischen App fällt niemandem auf, der hinsieht
      — nur dem, der zuhört. In `ui.test.ts` sind die a11y-Schlüssel deshalb
      längst vollständig; was fehlte, ist die Zusicherung, dass sie auch
      benutzt werden.
    */
    const gefunden: string[] = []
    for (const [pfad, text] of QUELLEN) {
      if (!pfad.endsWith('.tsx')) continue
      for (const treffer of text.matchAll(LITERAL_ATTRIBUT)) {
        const wert = treffer[2] ?? ''
        if (!wert.trim()) continue
        if (ERLAUBTES_ATTRIBUT[wert]) continue
        gefunden.push(`${pfad}: ${treffer[1]}="${wert}"`)
      }
    }
    expect(gefunden).toEqual([])
  })

  it('die Prüfung findet ein eingebautes Literal auch wirklich', () => {
    const beispiel = '<button aria-label="Schließen" />'
    expect([...beispiel.matchAll(LITERAL_ATTRIBUT)]).toHaveLength(1)
    // Ein Ausdruck dagegen nicht — sonst schlüge sie überall an.
    expect([...'<button aria-label={t.a11yClose} />'.matchAll(LITERAL_ATTRIBUT)]).toHaveLength(0)
  })

  it('jede Attribut-Ausnahme steht auch wirklich noch im Quelltext', () => {
    const alleWerte = new Set(
      [...QUELLEN]
        .filter(([p]) => p.endsWith('.tsx'))
        .flatMap(([, t]) => [...t.matchAll(LITERAL_ATTRIBUT)].map((m) => m[2] ?? '')),
    )
    expect(Object.keys(ERLAUBTES_ATTRIBUT).filter((w) => !alleWerte.has(w))).toEqual([])
  })
})

/** Attributwerte, die kein Wort sind — mit Grund. */
const ERLAUBTES_ATTRIBUT: Record<string, Grund> = {
  '••••••••': 'kein-wort',
}


/**
 * **Fremder Text trägt seine eigene Schreibrichtung — geprüft am Quelltext.**
 *
 * Was in einem Freitextfeld steht, gehört nicht der App: ein Ortsname, ein
 * Vortragsthema, der Name eines auswärtigen Redners und seine Versammlung. Die
 * Richtung der Oberfläche gilt dafür nicht — sonst zerlegt der Bidi-Algorithmus,
 * was zusammengehört. Gemessen wurde es an einer Telefonnummer: In der
 * arabischen Fassung stand „+49 159 774 21 08" als „08 21 774 159 49+".
 *
 * `oberflaeche-fremdsprache.test.tsx` prüft das am gerenderten DOM — aber nur
 * für die Felder, die sein Bestand erreicht (Personen-Detail und
 * Versammlungs-Angaben). Genau daran fehlte es: Der Treffpunkt-Ort, das
 * Vortragsthema, der eigene Programmpunkt, der Name des Gastredners und der
 * neue Dienst trugen die Angabe nicht — sieben Felder, die kein Test je
 * angesehen hat.
 *
 * Diese Prüfung geht deshalb über **alle** Textfelder des Quelltextes. Die
 * Ausnahmen tragen ihren Grund; wer ein Feld hinzufügt, muss sich entscheiden.
 */
describe('Freitextfelder tragen dir="auto"', () => {
  /**
   * Felder, die **keinen** fremden Text aufnehmen — mit Begründung.
   *
   * Ein Suchfeld hält nichts fest; sein Inhalt ist im nächsten Moment wieder
   * weg und steht nirgends neben anderem Text. Ein Einladungscode und eine
   * Liednummer sind Zeichenfolgen ohne Sprache.
   */
  const OHNE_GRUND: Record<string, string> = {
    'codePh': 'Einladungscode — Zeichenfolge ohne Sprache',
    'langSearchPh': 'Suchfeld — nichts, was gespeichert wird',
    'suchen': 'Suchfeld — nichts, was gespeichert wird',
    'liedNrPh': 'Liednummer — eine Zahl',
  }

  /** Jedes `<input type="text">` (bzw. `<textarea>`) samt seiner Attribute. */
  const felder = (): Array<{ datei: string; platzhalter: string; hatDir: boolean }> => {
    const out: Array<{ datei: string; platzhalter: string; hatDir: boolean }> = []
    for (const [datei, text] of QUELLEN) {
      if (!datei.endsWith('.tsx')) continue
      for (const treffer of text.matchAll(/<(?:input|textarea)\b([\s\S]*?)\/?>/g)) {
        const attrs = treffer[1] ?? ''
        if (!/\btype="text"/.test(attrs) && !treffer[0].startsWith('<textarea')) continue
        const ph = /placeholder=\{t\.(\w+)\}/.exec(attrs)?.[1] ?? ''
        out.push({ datei, platzhalter: ph, hatDir: /\bdir=/.test(attrs) })
      }
    }
    return out
  }

  it('die Suche findet überhaupt Felder', () => {
    // Sonst ginge alles darunter grün durch, ohne etwas zu prüfen.
    expect(felder().length).toBeGreaterThan(8)
  })

  it('jedes Textfeld trägt dir="auto" — oder steht mit Grund in der Liste', () => {
    const ohne = felder()
      .filter((f) => !f.hatDir && OHNE_GRUND[f.platzhalter] === undefined)
      .map((f) => `${f.datei} (${f.platzhalter || 'ohne Platzhalter'})`)
    expect(ohne, ohne.join(', ')).toEqual([])
  })

  it('die Ausnahmeliste ist ehrlich — jeder Eintrag kommt auch vor', () => {
    // Ein Eintrag, den es nicht mehr gibt, macht die Liste zur Behauptung.
    const vorhanden = new Set(felder().map((f) => f.platzhalter))
    const tote = Object.keys(OHNE_GRUND).filter((k) => !vorhanden.has(k))
    expect(tote, `nicht mehr vorhanden: ${tote.join(', ')}`).toEqual([])
  })
})
