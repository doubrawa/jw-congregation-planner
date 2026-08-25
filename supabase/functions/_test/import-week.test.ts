import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Tests der Edge Function `import-week` — der Teil, der bis T65 ohne Aufbau
 * dastand: **die Wochen-Ermittlung**. Die Bausteine (Parser, Studienausgabe,
 * Gedächtnismahl) haben je eigene Tests; ungeprüft blieb ihr Zusammenspiel —
 * welche Woche `discoverWeeks` findet, welche der Handler daraufhin baut oder
 * holt, und was passiert, wenn eine Seite fehlt.
 *
 * Aufbau wie send-reminders.test.ts: die echte index.ts wird geladen, `Deno`
 * steht als Global bereit und fängt den Handler ab, `fetch` liefert erfundene
 * Seiten. Die Uhr steht fest — `discoverWeeks` verwirft Ausgaben, die vor dem
 * heutigen Monat enden.
 *
 * **Kein übernommener jw.org-Inhalt.** Die Seiten unten tragen die *gemessene
 * Struktur* (Pfadform der Wochenseiten, weiches Trennzeichen im
 * Leseprogramm-Pfad, Tagesüberschrift vor „GEDÄCHTNISMAHL", farbige
 * Sektions-Überschriften) und sonst eine erfundene Sprache — dieselbe Linie
 * wie FIXTURE_XX in parse.test.ts.
 */

const BASE = 'https://www.jw.org'
const SLUG = 'maerz-april-2026-mwb'
const PFAD = `/de/bibliothek/jw-arbeitsheft/${SLUG}`

/** „Heute" — im März 2026, damit die Ausgabe März/April nicht verworfen wird. */
const HEUTE = '2026-03-02T09:00:00Z'

/**
 * Die acht Wochenseiten der Ausgabe. Gemessen ist hier die **Lücke**: zwischen
 * 23.–29. März und 6.–12. April fehlt 30. März – 5. April, weil das
 * Gedächtnismahl auf einen Donnerstag fällt.
 */
const WOCHEN_SLUGS = [
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-2-8-März-2026',
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-9-15-März-2026',
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-16-22-März-2026',
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-23-29-März-2026',
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-6-12-April-2026',
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-13-19-April-2026',
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-20-26-April-2026',
  'Programm-für-die-Leben-und-Dienst-Zusammenkunft-27-April-3-Mai-2026',
]

/** Im Pfad steckt ein weiches Trennzeichen (U+00AD) — genau wie bei jw.org. */
const LESE_SLUG = 'Bibellese­programm-für-das-Gedächtnismahl-2026'

const INDEX_SEITE = `<html><body>
  <a href="/de/bibliothek/jw-arbeitsheft/${SLUG}/">Ausgabe</a>
  <a href="/de/bibliothek/jw-arbeitsheft/januar-februar-2025-mwb/">Alte Ausgabe</a>
</body></html>`

const ausgabenSeite = (mitLeseprogramm: boolean): string => `<html><body>
  ${WOCHEN_SLUGS.map((s) => `<a href="${PFAD}/${s}/">Woche</a>`).join('\n')}
  ${mitLeseprogramm ? `<a href="${PFAD}/${LESE_SLUG}/">Leseprogramm</a>` : ''}
</body></html>`

/** Leseprogramm in gemessener Form: Tagesüberschriften, eine mit dem Mahl. */
const leseSeite = (kopf: string): string => `<html><body>
  <h1>Frei erfundene Überschrift</h1>
  <h2>MITTWOCH, 1. APRIL</h2>
  <p>Blindtext.</p>
  <h2>${kopf}</h2>
  <p><strong>GEDÄCHTNISMAHL</strong> (NACH SONNENUNTERGANG)</p>
</body></html>`

/**
 * Der „Lesen in"-Umschalter, wie ihn die deutsche Seite trägt: je Sprache eine
 * Option mit `value` (Code) und `data-url` (Pfad derselben Woche). Genau
 * daran hängt der ganze fremdsprachige Import — es gibt keinen zweiten Weg zur
 * Übersetzung einer Wochenseite.
 */
const umschalter = (slug: string, codes: string[], fremd?: { code: string; url: string }): string =>
  [...codes, ...(fremd ? [fremd.code] : [])]
    .map((c) =>
      c === fremd?.code
        ? `<option value="${c}" data-url="${fremd.url}"></option>`
        : `<option value="${c}" data-url="/${c}/bibliothek/jw-arbeitsheft/${SLUG}/${slug}/"></option>`,
    )
    .join('')

/** Wochenseite in erfundener Sprache — die Struktur ist das Gemessene. */
const wochenSeite = (kopf: string, schalter = ''): string => `<article>${schalter}
  <h1 data-pid="1" class="du-color--textSubdued">${kopf}</h1>
  <h2 data-pid="2" class="du-fontSize--base">QORBLA 13-15</h2>
  <h3 data-pid="3" class="x"><span class="dc-icon--music"></span> Xylo 12 qi Preku | Vorqi Blen (1 vim)</h3>
  <h2 data-pid="4" class="du-color--teal-700">XORBI SATO</h2>
  <h3 data-pid="5" class="du-color--teal-700">1. Prva Vorbo</h3>
  <p data-pid="6">(10 vim)</p>
  <h2 data-pid="18" class="du-color--gold-700">SERVO XI</h2>
  <h3 data-pid="19" class="du-color--gold-700">4. Konvo Beg</h3>
  <p data-pid="20">(3 vim) DOMO XI DOMO.</p>
  <h2 data-pid="25" class="du-color--maroon-600">VIVO KRISTO</h2>
  <h3 data-pid="27" class="du-color--maroon-600">7. Loka Diskuto</h3>
  <p data-pid="28">(15 vim) Diskuto.</p>
  <h3 data-pid="47" class="x"><span class="dc-icon--music"></span> Finvorbo (3 vim) | Xylo 61 qi Preku</h3>
</article>`

/* ---- Netz-Attrappe -------------------------------------------------------- */

interface Seiten {
  /** Steht die Leseprogramm-Seite auf der Ausgabenseite? */
  leseprogramm: boolean
  /** Tagesüberschrift vor „GEDÄCHTNISMAHL". */
  memKopf: string
  /** Antwortet die Leseprogramm-Seite mit einem Fehler? */
  leseKaputt: boolean
  /** Sprachen, die der „Lesen in"-Umschalter dieser Woche anbietet. */
  sprachen: string[]
  /**
   * Sprachcode, für den der Umschalter eine **fremde, absolute** Adresse
   * ausweist statt eines jw.org-Pfads. jw.org tut das heute nicht — aber der
   * Umschalter ist fremdes Markup, und was darin steht, entscheidet nicht
   * dieses Projekt. Der Fall gehört deshalb geprüft.
   */
  fremdeVariante?: { code: string; url: string }
}

let seiten: Seiten
let geholt: string[]

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input)
  geholt.push(url)
  const text = (t: string) => Promise.resolve(new Response(t, { status: 200 }))
  const weg = () => Promise.resolve(new Response('nein', { status: 404 }))

  if (url === `${BASE}/de/bibliothek/jw-arbeitsheft/`) return text(INDEX_SEITE)
  if (url === `${BASE}${PFAD}/`) return text(ausgabenSeite(seiten.leseprogramm))
  if (url.includes(encodeURI(LESE_SLUG)) || url.includes(LESE_SLUG)) {
    return seiten.leseKaputt ? weg() : text(leseSeite(seiten.memKopf))
  }
  // Fremdsprachige Fassung derselben Woche (Pfad aus dem Umschalter).
  const variante = new RegExp(`^${BASE}/([a-z-]+)/bibliothek/jw-arbeitsheft/`).exec(url)
  if (variante && variante[1] !== 'de') {
    const code = variante[1]
    if (!seiten.sprachen.includes(code)) return weg()
    const w = WOCHEN_SLUGS.find((x) => url.includes(x))
    return w ? text(wochenSeite(`[${code}] ${w}`)) : weg()
  }
  const woche = WOCHEN_SLUGS.find((s) => url.includes(s))
  if (woche) {
    // Kopfzeile aus dem Slug, in der **gemessenen** Form der h1: innerhalb
    // eines Monats „23.-29. März" (mit Bindestrich, den der Parser zum
    // Halbgeviertstrich macht), über den Monatswechsel „27. April–3. Mai".
    const t = woche.split('Zusammenkunft-')[1] ?? ''
    const m = /^(\d+)-(\d+)-([A-Za-zäöü]+)-\d{4}$/.exec(t)
    const kreuz = /^(\d+)-([A-Za-zäöü]+)-(\d+)-([A-Za-zäöü]+)-\d{4}$/.exec(t)
    const kopf = m ? `${m[1]}.-${m[2]}. ${m[3]}` : kreuz ? `${kreuz[1]}. ${kreuz[2]}–${kreuz[3]}. ${kreuz[4]}` : t
    return text(wochenSeite(kopf, umschalter(woche, seiten.sprachen, seiten.fremdeVariante)))
  }
  // Studienausgaben: nicht vorhanden → applyStudy lässt die Vorlage stehen.
  return weg()
}

/* ---- Function laden ------------------------------------------------------- */

async function loadFn(): Promise<(req: Request) => Promise<Response>> {
  let captured: ((req: Request) => Promise<Response>) | undefined
  const g = globalThis as Record<string, unknown>
  g.Deno = { serve: (h: (req: Request) => Promise<Response>) => { captured = h } }
  g.fetch = fakeFetch
  vi.resetModules() // leert zugleich den Seiten-Cache der Function
  await import('../import-week/index.ts')
  return captured as (req: Request) => Promise<Response>
}

interface Antwort {
  week?: {
    range: string
    book: string
    start?: string
    lang?: string
    anlass?: { art: string; von: string }
    mem?: true
    mid: { sections: unknown[] }
    we: { sections: { label: string }[] }
    alt?: Record<string, { range: string; mid: { sections: Array<{ items: Array<{ names?: unknown[] }> }> }; we: { sections: unknown[] } }>
  }
  error?: string
}

async function hole(body: Record<string, unknown> = {}): Promise<Antwort> {
  const handler = await loadFn()
  const res = await handler(new Request('https://fn.test/import-week', {
    method: 'POST',
    body: JSON.stringify(body),
  }))
  return (await res.json()) as Antwort
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(HEUTE))
  seiten = {
    leseprogramm: true, memKopf: 'DONNERSTAG, 2. APRIL', leseKaputt: false,
    sprachen: ['en', 'es', 'fr'],
  }
  geholt = []
})

afterAll(() => {
  vi.useRealTimers()
})

describe('import-week: die gewöhnliche Woche', () => {
  it('liefert die nächste Woche nach `after`', async () => {
    const { week } = await hole({ after: '2026-03-02' })
    expect(week?.start).toBe('2026-03-09')
    expect(week?.range).toBe('9.–15. März')
    expect(week?.lang).toBe('de')
  })

  it('`start` holt genau diese Woche', async () => {
    const { week } = await hole({ start: '2026-04-20' })
    expect(week?.start).toBe('2026-04-20')
  })

  it('eine Woche, die es nicht gibt, ist ein 404 mit Meldung', async () => {
    const { week, error } = await hole({ start: '2026-04-21' }) // kein Montag
    expect(week).toBeUndefined()
    expect(error).toContain('2026-04-21')
  })

  it('trägt weder Anlass noch Gedächtnismahl-Marke', async () => {
    const { week } = await hole({ after: '2026-03-02' })
    expect(week?.anlass).toBeUndefined()
    expect(week?.mem).toBeUndefined()
  })
})

/*
  Der Kern von T65. Zwischen 23.–29. März und 6.–12. April liegt keine
  Wochenseite — weil das Mahl auf einen Donnerstag fällt und die Zusammenkunft
  unter der Woche damit entfällt. Die Woche wird gebaut, nicht geholt.
*/
describe('import-week: die Woche des Gedächtnismahls', () => {
  it('schließt die Lücke — mit Kennung, Anlass und Datum', async () => {
    const { week } = await hole({ after: '2026-03-23' })
    expect(week?.start).toBe('2026-03-30')
    expect(week?.anlass).toEqual({ art: 'mem', von: '2026-04-02' })
    expect(week?.mem).toBe(true)
  })

  it('ihr Wochenende ist die übliche Vorlage — es findet statt', async () => {
    const { week } = await hole({ after: '2026-03-23' })
    expect(week?.we.sections.map((s) => s.label)).toEqual([
      'ERÖFFNUNG', 'ÖFFENTLICHER VORTRAG', 'WACHTTURM-STUDIUM', 'ABSCHLUSS',
    ])
  })

  it('ihre Zusammenkunft unter der Woche bleibt leer', async () => {
    // Es gibt kein Programm — nicht „noch nicht", sondern gar keins.
    const { week } = await hole({ after: '2026-03-23' })
    expect(week?.mid.sections).toEqual([])
    expect(week?.book).toBe('')
  })

  it('ihr Kopf trägt den Monatswechsel aus', async () => {
    const { week } = await hole({ after: '2026-03-23' })
    expect(week?.range).toBe('30. März–5. April')
  })

  it('holt für sie **keine** Wochenseite', async () => {
    await hole({ after: '2026-03-23' })
    expect(geholt.some((u) => u.includes('Zusammenkunft-30'))).toBe(false)
  })

  it('und die Woche danach geht ganz normal weiter', async () => {
    const { week } = await hole({ after: '2026-03-30' })
    expect(week?.start).toBe('2026-04-06')
    expect(week?.mem).toBeUndefined()
  })

  it('auch über `start` ist sie erreichbar', async () => {
    const { week } = await hole({ start: '2026-03-30' })
    expect(week?.start).toBe('2026-03-30')
    expect(week?.mem).toBe(true)
  })
})

/*
  Der Gegenfall, gemessen an der Ausgabe März/April 2024: Fällt das Mahl aufs
  Wochenende, läuft die Zusammenkunft unter der Woche normal — die Seite ist
  da, und es fehlt nichts. Die Woche bekommt trotzdem ihren Anlass.
*/
describe('import-week: Mahl am Wochenende — keine Lücke', () => {
  beforeEach(() => {
    // Sonntag, 15. März 2026 liegt in der Woche 9.–15. März, die es gibt.
    seiten.memKopf = 'SONNTAG, 15. MÄRZ'
  })

  it('legt keine zusätzliche Woche an', async () => {
    const { week } = await hole({ after: '2026-03-09' })
    expect(week?.start).toBe('2026-03-16') // 9.–15. gab es schon, nächste ist 16.
  })

  it('markiert die vorhandene Woche mit dem Anlass', async () => {
    const { week } = await hole({ start: '2026-03-09' })
    expect(week?.start).toBe('2026-03-09')
    expect(week?.anlass).toEqual({ art: 'mem', von: '2026-03-15' })
    expect(week?.mem).toBe(true)
    // Und sie behält ihr Programm — sie wurde geholt, nicht gebaut.
    expect(week?.mid.sections.length).toBeGreaterThan(0)
  })

  /*
    **Eine Zusicherung bleibt hier ungeprüft, und zwar nachweislich:** das
    frühe `return` in `mitGedaechtnismahl`, das eine zusätzliche Woche
    verhindert, wenn es die schon gibt. Nimmt man es heraus, steht die Woche
    zweimal in der Liste — beide mit demselben Startdatum. `Array#sort` ist
    stabil, der echte Eintrag wurde zuerst hinzugefügt und bleibt vorn, und
    jede Auswahl (`find`) trifft damit weiterhin ihn. Der Doppeleintrag ist
    durch die Schnittstelle der Function nicht zu sehen.

    Festgehalten statt stillschweigend hingenommen: Fiele die Stabilität der
    Sortierung je weg, wäre es plötzlich sichtbar — dann käme die **gebaute**
    Woche statt der geholten, also eine ohne Programm unter der Woche.
  */
})

describe('import-week: wenn das Leseprogramm fehlt', () => {
  it('ohne Leseprogramm-Seite bleibt die Lücke eine Lücke', async () => {
    // Ausgaben ohne Gedächtnismahl (etwa Januar/Februar) haben keine — dann
    // gibt es auch nichts zu ergänzen.
    seiten.leseprogramm = false
    const { week } = await hole({ after: '2026-03-23' })
    expect(week?.start).toBe('2026-04-06')
    expect(week?.mem).toBeUndefined()
  })

  it('eine unerreichbare Leseprogramm-Seite bricht den Import nicht ab', async () => {
    // Lieber die Wochen ohne die Ergänzung als gar keinen Import.
    seiten.leseKaputt = true
    const { week } = await hole({ after: '2026-03-23' })
    expect(week?.start).toBe('2026-04-06')
  })

  it('ein unlesbares Datum ebenso wenig', async () => {
    seiten.memKopf = 'DONNERSTAG, 2. GRUMBEL'
    const { week } = await hole({ after: '2026-03-23' })
    expect(week?.start).toBe('2026-04-06')
  })
})

/**
 * **Der fremdsprachige Import** — der Weg, den jede Versammlung geht, deren
 * Sprache nicht Deutsch ist.
 *
 * Er hängt an genau einem Anker: dem „Lesen in"-Umschalter auf der deutschen
 * Wochenseite. Es gibt keinen zweiten Weg zur übersetzten Fassung — die Pfade
 * lassen sich nicht aus dem deutschen ableiten, weil der Slug übersetzt ist.
 * Fällt der Anker weg, importiert jede nichtdeutsche Versammlung ab dann nur
 * noch Deutsch, ohne Fehlermeldung.
 *
 * Die zweite Regel hier ist die **Kulanz**: eine Woche, die es in der
 * Versammlungssprache nicht gibt, ist ein Fehler (der Planer bekäme sonst
 * stillschweigend deutsches Programm). Eine *zusätzliche* Programmsprache, die
 * fehlt, ist keiner — sie wird still übersprungen, und die Woche kommt trotzdem.
 */
describe('import-week: in der Sprache der Versammlung', () => {
  it('holt die übersetzte Fassung über den Umschalter, nicht die deutsche', async () => {
    const { week } = await hole({ after: '2026-03-02', lang: 'es' })
    expect(week?.lang).toBe('es')
    expect(geholt.some((u) => u.startsWith(`${BASE}/es/bibliothek/jw-arbeitsheft/`))).toBe(true)
  })

  it('Deutsch braucht den Umweg nicht', async () => {
    await hole({ after: '2026-03-02', lang: 'de' })
    expect(geholt.some((u) => u.startsWith(`${BASE}/de/bibliothek/`) && u.includes('März'))).toBe(true)
    expect(geholt.some((u) => /\/(es|en|fr)\/bibliothek\//.test(u))).toBe(false)
  })

  it('fehlt die Woche in dieser Sprache, ist das ein Fehler — kein stiller Rückfall', async () => {
    // Sonst bekäme eine spanische Versammlung deutsches Programm, ohne dass
    // irgendwo stünde, warum.
    seiten.sprachen = ['en']
    const { week, error } = await hole({ after: '2026-03-02', lang: 'es' })
    expect(week).toBeUndefined()
    expect(error).toContain('es')
  })

  it('das ISO-Startdatum bleibt sprachunabhängig — daran hängt jede Kennung', async () => {
    const de = await hole({ after: '2026-03-02', lang: 'de' })
    const es = await hole({ after: '2026-03-02', lang: 'es' })
    expect(es.week?.start).toBe(de.week?.start)
  })
})

describe('import-week: weitere Programmsprachen als Varianten', () => {
  it('holt jede gewünschte Sprache mit und hängt sie an die Woche', async () => {
    const { week } = await hole({ after: '2026-03-02', lang: 'de', altLangs: ['en', 'fr'] })
    expect(Object.keys(week?.alt ?? {}).sort()).toEqual(['en', 'fr'])
  })

  it('die Primärsprache wird nicht als eigene Variante mitgeholt', async () => {
    const { week } = await hole({ after: '2026-03-02', lang: 'es', altLangs: ['es', 'en'] })
    expect(Object.keys(week?.alt ?? {})).toEqual(['en'])
  })

  it('eine fehlende Zusatzsprache wird still übersprungen — die Woche kommt trotzdem', async () => {
    seiten.sprachen = ['en']
    const { week } = await hole({ after: '2026-03-02', lang: 'de', altLangs: ['en', 'fr'] })
    expect(week?.start).toBe('2026-03-09')
    expect(Object.keys(week?.alt ?? {})).toEqual(['en'])
  })

  it('eine Variante trägt nur Texte — keine Zuteilungs-Plätze', async () => {
    // `localizedWeek` übernimmt aus einer Variante ohnehin nur Texte; stünden
    // dort Plätze, sähe es aus, als brächte sie eine eigene Struktur mit.
    const { week } = await hole({ after: '2026-03-02', lang: 'de', altLangs: ['en'] })
    const abschnitte = week?.alt?.en?.mid.sections ?? []
    expect(abschnitte.length).toBeGreaterThan(0)
    for (const s of abschnitte) {
      for (const item of s.items) {
        if ('names' in item) expect(item.names).toEqual([])
      }
    }
  })

  it('höchstens vier — die Abrufe gegenüber jw.org bleiben überschaubar', async () => {
    seiten.sprachen = ['en', 'es', 'fr', 'it', 'pt', 'nl']
    const { week } = await hole({
      after: '2026-03-02', lang: 'de', altLangs: ['en', 'es', 'fr', 'it', 'pt', 'nl'],
    })
    expect(Object.keys(week?.alt ?? {})).toHaveLength(4)
  })

  it('ohne Zusatzsprachen entsteht gar kein `alt`-Feld', async () => {
    const { week } = await hole({ after: '2026-03-02', lang: 'de' })
    expect(week?.alt).toBeUndefined()
  })

  it('die Gedächtnismahl-Woche bekommt keine Varianten — es gibt keine Seite dazu', async () => {
    const { week } = await hole({ after: '2026-03-23', lang: 'de', altLangs: ['en'] })
    expect(week?.mem).toBe(true)
    expect(week?.alt).toBeUndefined()
  })
})

describe('import-week: Netz und Aufruf', () => {
  it('dieselbe Seite wird nicht zweimal geholt (Zwischenspeicher)', async () => {
    const handler = await loadFn()
    const einmal = async () =>
      await handler(new Request('https://fn.test/import-week', {
        method: 'POST', body: JSON.stringify({ after: '2026-03-02' }),
      }))
    await einmal()
    const nachErstem = geholt.length
    geholt = []
    await einmal()
    // Der zweite Lauf kommt mit deutlich weniger Abrufen aus als der erste.
    expect(geholt.length).toBeLessThan(nachErstem)
  })

  it('ein Vorab-Aufruf des Browsers (OPTIONS) wird beantwortet, ohne etwas zu holen', async () => {
    const handler = await loadFn()
    geholt = []
    const res = await handler(new Request('https://fn.test/import-week', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
    expect(geholt).toEqual([])
  })

  it('ein Aufruf ohne JSON-Rumpf stürzt nicht ab, sondern sucht die nächste Woche', async () => {
    const handler = await loadFn()
    const res = await handler(new Request('https://fn.test/import-week', { method: 'POST' }))
    expect([200, 404]).toContain(res.status)
  })
})

describe('import-week: geholt wird nur bei jw.org', () => {
  /*
   * Diese Function holt Seiten aus dem Netz, und sie steht offen: `verify_jwt`
   * lässt den anon-Key durch, der per Design im Bundle liegt. Wer die Adresse
   * bestimmen konnte, hatte damit einen Boten in der Supabase-Umgebung —
   * `http://10.0.0.5:8080/` ist von dort erreichbar, von außen nicht, und der
   * zurückgereichte Fehlertext verriet, ob und wie dort etwas antwortet.
   *
   * Zwei Schlösser, beide hier geprüft: Das `url`-Feld gibt es nicht mehr
   * (kein Aufrufer hat es je geschickt), und `fetchText` lässt als einzige
   * Engstelle nur https://www.jw.org durch.
   */
  const FREMD = 'http://169.254.169.254/latest/meta-data/'

  /** Adressen, die nicht zu jw.org gehören — muss immer leer sein. */
  const fremdeAbrufe = (): string[] => geholt.filter((u) => !u.startsWith(`${BASE}/`))

  it('ein `url` im Rumpf wird nicht geholt — die Woche kommt aus dem Arbeitsheft', async () => {
    const { week } = await hole({ url: FREMD, after: '2026-03-02' })
    // Die Anfrage läuft ganz normal durch: das Feld ist schlicht wirkungslos.
    expect(week?.start).toBe('2026-03-09')
    expect(fremdeAbrufe()).toEqual([])
    expect(geholt).toContain(`${BASE}/de/bibliothek/jw-arbeitsheft/`)
  })

  it.each([
    ['fremder Host', 'https://evil.example/x'],
    ['internes Netz', 'http://10.0.0.5:8080/'],
    ['Metadaten-Dienst', FREMD],
    ['lokale Datei', 'file:///etc/passwd'],
    ['unverschlüsselt, aber jw.org', 'http://www.jw.org/de/'],
    ['täuschender Host', 'https://www.jw.org.evil.example/de/'],
  ])('%s wird nie abgerufen, auch nicht als `url`', async (_name, url) => {
    await hole({ url, after: '2026-03-02' })
    expect(geholt).not.toContain(url)
    expect(fremdeAbrufe()).toEqual([])
  })

  it('auch eine fremde Adresse aus dem „Lesen in"-Umschalter wird nicht geholt', async () => {
    // Der zweite Weg: nicht der Aufrufer bestimmt die Adresse, sondern das
    // Markup der geholten Seite. Deshalb sitzt die Prüfung in `fetchText` und
    // nicht beim Auswerten des Rumpfes.
    seiten.fremdeVariante = { code: 'xx', url: FREMD }
    const { week, error } = await hole({ after: '2026-03-02', lang: 'xx' })
    expect(fremdeAbrufe()).toEqual([])
    // Die Sprache gilt als nicht verfügbar; eine Woche entsteht nicht.
    expect(week).toBeUndefined()
    expect(error).toBeTruthy()
  })

  it('eine fremde Adresse als Sprachvariante lässt die Woche unbeschadet', async () => {
    // Varianten sind Beiwerk: Fällt eine weg, steht die Woche trotzdem.
    seiten.fremdeVariante = { code: 'xx', url: FREMD }
    const { week } = await hole({ after: '2026-03-02', altLangs: ['xx', 'en'] })
    expect(fremdeAbrufe()).toEqual([])
    expect(Object.keys(week?.alt ?? {})).toEqual(['en'])
  })

  it('der Fehlertext verrät den Abruf nicht', async () => {
    // Vorher stand in der Antwort `HTTP 404 bei <Adresse>` — genau das machte
    // den Boten nützlich: Er sagte, ob dort etwas antwortet und mit welchem
    // Status. Der Text gehört in die Logs, nicht zum Aufrufer.
    const handler = await loadFn()
    seiten.leseprogramm = false
    const res = await handler(new Request('https://fn.test/import-week', {
      method: 'POST',
      body: JSON.stringify({ start: 'kein-datum' }),
    }))
    const { error } = (await res.json()) as Antwort
    expect(error ?? '').not.toContain('http')
    expect(error ?? '').not.toMatch(/HTTP \d{3}/)
  })
})
