import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  alsEntwicklerseite,
  ausgabeText,
  ENTWICKLERSEITE,
  testdatenBefunde,
  testdatenWache,
} from '../scripts/testdaten-grenze.mjs'
import { TESTDATEN_DOMAIN, TESTDATEN_KENNZEICHEN, TESTDATEN_RUFNUMMERN } from './testdaten/kennzeichen'
import { buildDemoWeeks, buildImportWeek, DEMO_PERSONS } from './testdaten/testdaten'

/**
 * **Die Testdaten gehören nicht in die App** — weder in ihren Quelltext noch
 * in ihr Bündel.
 *
 * Bis zum 2.10.2026 lagen sie unter `src/data/` und sollten hinter
 * `import.meta.env.DEV` beim Bauen wegfallen. Geprüft wurde das am 13.8. ein
 * einziges Mal, mit der Suche nach „Manfred Albrecht" in `dist/assets/`: kein
 * Treffer. So steht der Name aber nur in den Wochen, und die fielen wirklich
 * weg. Die Personenliste führt Vor- und Nachnamen getrennt — sie stand die
 * ganze Zeit im Bündel, mit Adressen und Nummern, live auf versammlung.app.
 *
 * Jetzt liegen sie unter `tests/testdaten/`, und drei Dinge halten sie dort:
 * die Prüfung am Quelltext hier, die Bündelwache bei jedem Build
 * (`scripts/testdaten-grenze.mjs`) — und die Kennzeichen, an denen die Wache
 * sie erkennt. Dass die Testdaten diese Kennzeichen auch tragen, steht
 * ebenfalls hier; ohne das suchte die Wache nach etwas, das es nicht gibt.
 */

/** Quelltext aller Dateien unter `src/` — über Vite. */
const QUELLEN = import.meta.glob('../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('Quelltext: keine App-Datei greift auf tests/ zu', () => {
  const app = Object.entries(QUELLEN).filter(([pfad]) => !/\.test\.tsx?$/.test(pfad))

  it('die Prüfung sieht überhaupt App-Dateien', () => {
    expect(app.length).toBeGreaterThan(100)
  })

  /** Ein Pfad nach `tests/` — relativ (`../../tests/`) oder von der Wurzel aus (`/tests/`), beides löst Vite auf. */
  const NACH_TESTS = /['"](?:(?:\.\.\/)+|\/)tests\//

  it('kein Import aus tests/ — weder statisch noch nachgeladen, weder relativ noch von der Wurzel', () => {
    const verstoesse = app.filter(([, text]) => NACH_TESTS.test(text)).map(([pfad]) => pfad)
    expect(verstoesse).toEqual([])
  })

  it('die Prüfung erkennt beide Schreibweisen', () => {
    expect(NACH_TESTS.test(`import { DEMO_PERSONS } from '../../tests/testdaten/testdaten'`)).toBe(true)
    expect(NACH_TESTS.test(`import { DEMO_PERSONS } from '/tests/testdaten/testdaten'`)).toBe(true)
    expect(NACH_TESTS.test(`await import("../tests/testdaten/demo-start")`)).toBe(true)
    expect(NACH_TESTS.test(`import { reducer } from './reducer'`)).toBe(false)
  })
})

describe('Die Testdaten tragen ihre Kennzeichen', () => {
  it('jede erfundene Person hat eine Adresse unter der Testdaten-Domain', () => {
    const ohne = DEMO_PERSONS.filter((p) => !p.mail.endsWith(`@${TESTDATEN_DOMAIN}`)).map((p) => p.id)
    expect(ohne).toEqual([])
  })

  it('jede erfundene Nummer liegt im freigehaltenen Block für Film und Fernsehen', () => {
    const fremd = DEMO_PERSONS.filter((p) => p.tel && !p.tel.startsWith(`${TESTDATEN_RUFNUMMERN} `)).map((p) => p.id)
    expect(fremd).toEqual([])
  })

  it('jede erfundene Woche trägt einen Platzhalter', () => {
    for (const woche of [...buildDemoWeeks(), buildImportWeek()]) {
      const text = JSON.stringify(woche)
      expect(TESTDATEN_KENNZEICHEN.some((k) => text.includes(k)), woche.range).toBe(true)
    }
  })
})

describe('Bündelwache', () => {
  const sauber = { name: 'assets/index-a1.js', text: 'console.log(`Versammlung.app`)' }

  it('findet ein Modul aus den Testdaten — unter jedem Pfadtrenner', () => {
    for (const id of ['/repo/tests/testdaten/testdaten.ts', 'C:\\repo\\tests\\testdaten\\demo-start.ts']) {
      const befunde = testdatenBefunde({ module: ['/repo/src/main.tsx', id], dateien: [sauber], kennzeichen: TESTDATEN_KENNZEICHEN })
      expect(befunde, id).toEqual([`Modul aus den Testdaten: ${id}`])
    }
  })

  it('findet ein Kennzeichen im Ergebnis — so, wie der Bündler es schreibt', () => {
    /*
     * Wörtlich aus der Gegenprobe vom 2.10.2026 (Testdaten absichtlich wieder
     * ins Bündel gezogen): Die Domain steht als eigene Konstante da, die
     * Adresse entsteht erst zur Laufzeit. Ein Kennzeichen „@musterstadt.example"
     * hätte das nicht gefunden — deshalb sucht die Wache die Domain allein.
     */
    const text = `var lp=\`${TESTDATEN_DOMAIN}\`;var Q=e=>\`\${e}@\${lp}\`,up=[{fn:\`Manfred\`,ln:\`Albrecht\`,mail:Q(\`m.albrecht\`)}]`
    const befunde = testdatenBefunde({
      module: [],
      dateien: [sauber, { name: 'assets/index-b2.js', text }],
      kennzeichen: TESTDATEN_KENNZEICHEN,
    })
    expect(befunde).toEqual([`assets/index-b2.js enthält „${TESTDATEN_DOMAIN}" — ein Kennzeichen der Testdaten`])
  })

  it('ein sauberes Bündel ergibt nichts', () => {
    expect(testdatenBefunde({ module: ['/repo/src/main.tsx'], dateien: [sauber], kennzeichen: TESTDATEN_KENNZEICHEN })).toEqual([])
  })

  it('liest Skripte und Text-Assets, Schriften und Bilder nicht', () => {
    expect(ausgabeText({ type: 'chunk', fileName: 'assets/a.js', code: 'x' })).toBe('x')
    expect(ausgabeText({ type: 'asset', fileName: 'index.html', source: '<p>' })).toBe('<p>')
    const css = new TextEncoder().encode('.a{}')
    expect(ausgabeText({ type: 'asset', fileName: 'assets/a.css', source: css })).toBe('.a{}')
    expect(ausgabeText({ type: 'asset', fileName: 'assets/a.woff2', source: new Uint8Array([0, 1]) })).toBeNull()
  })

  describe('als Bauschritt', () => {
    /** Ruft `writeBundle` so auf, wie der Bündler es täte — mit Kennungen und Ausgabe. */
    function bauen(module: string[], bundle: Record<string, object>): () => void {
      const plugin = testdatenWache(TESTDATEN_KENNZEICHEN)
      const hook = plugin.writeBundle as unknown as (this: object, optionen: object, b: object) => void
      const kontext = {
        getModuleIds: () => module.values(),
        error: (meldung: string) => {
          throw new Error(meldung)
        },
      }
      return () => hook.call(kontext, {}, bundle)
    }
    const skript = (code: string) => ({ type: 'chunk', fileName: 'assets/index-c3.js', code })

    it('bricht ab, wenn Testdaten im Bündel stehen', () => {
      expect(bauen(['/repo/tests/testdaten/testdaten.ts'], { a: skript('') })).toThrow(/Modul aus den Testdaten/)
      expect(bauen([], { a: skript('`Demoaufgabe 1`') })).toThrow(/Demoaufgabe/)
    })

    it('lässt ein sauberes Bündel durch', () => {
      expect(bauen(['/repo/src/main.tsx'], { a: skript('console.log(1)') })).not.toThrow()
    })

    it('bricht ab, wenn sie gar kein Skript gesehen hat — „sauber" wäre dann geraten', () => {
      expect(bauen([], { a: { type: 'asset', fileName: 'index.html', source: '<p>' } })).toThrow(/kein Skript/)
    })

    it('ohne Kennzeichen lässt sie sich gar nicht erst anlegen', () => {
      expect(() => testdatenWache([])).toThrow(/ohne Kennzeichen/)
    })
  })
})

describe('Entwicklerseite', () => {
  const INDEX = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')

  it('entsteht aus index.html, nur der Einstieg ist ein anderer', () => {
    const { html, ersetzt } = alsEntwicklerseite(INDEX)
    expect(ersetzt).toBe(true)
    expect(html).toContain('src="/tests/testdaten/demo.tsx"')
    // Alles andere bleibt Zeichen für Zeichen — der Kopf mit dem Farbschema
    // vor dem ersten Paint läuft der App also nicht davon.
    expect(html.replace('/tests/testdaten/demo.tsx', '/src/main.tsx')).toBe(INDEX)
  })

  it('meldet, wenn index.html den App-Einstieg nicht mehr lädt', () => {
    expect(alsEntwicklerseite('<script type="module" src="/src/start.tsx"></script>').ersetzt).toBe(false)
  })

  describe('hat keine Datenbank, auch wenn die Umgebung eine nennt', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
      vi.doUnmock('@supabase/supabase-js')
      vi.resetModules()
    })

    /** `lib/supabase.ts` frisch laden, mit Umgebung und auf der angegebenen Seite. */
    async function supabaseAuf(pfad: string) {
      vi.resetModules()
      vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ attrappe: true })) }))
      vi.stubEnv('VITE_SUPABASE_URL', 'https://beispiel.supabase.example')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_beispiel')
      vi.stubGlobal('location', { pathname: pfad })
      return import('../src/lib/supabase')
    }

    it('auf der Entwicklerseite kein Client — die Anmeldemaske sieht trotzdem aus wie im Betrieb', async () => {
      /*
       * Mit Client liefe jeder Knopf der Seite gegen die echte Versammlung
       * dessen, der im selben Browser angemeldet ist — „Plan senden" hätte
       * deren Woche verschickt. Die Maske folgt `isSupabaseConfigured`, weil
       * die Handbuch-Aufnahme der Anmeldung auf dieser Seite entsteht.
       */
      const s = await supabaseAuf(ENTWICKLERSEITE)
      expect(s.supabase).toBeNull()
      expect(s.isSupabaseConfigured).toBe(true)
    })

    it('Gegenprobe: in der App entsteht mit derselben Umgebung ein Client', async () => {
      const s = await supabaseAuf('/')
      expect(s.supabase).not.toBeNull()
    })
  })
})
