import { describe, expect, it } from 'vitest'
import {
  authKopf,
  istPlatzhalter,
  PARTNER,
  refAusUrl,
  reiheNachtragen,
  SCHUELER,
  urlAusEnvText,
  wocheNachtragen,
} from './rollen-nachtragen.mjs'

/**
 * Das Nachtrag-Skript fasst **Produktivdaten** an und ist der einzige Weg, die
 * Beschriftung in schon importierte Wochen zu bringen (der App-Import holt nur
 * die jeweils nächste Woche). Geprüft wird deshalb nicht nur, dass es setzt,
 * was es setzen soll, sondern vor allem, dass es **nichts anderes anfasst**.
 */
describe('reiheNachtragen', () => {
  it('setzt beide Beschriftungen, wenn ein Partner dabeisteht', () => {
    const slots = [
      { name: 'A', bereichsKey: 'schulung' },
      { name: 'B', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
    ]
    expect(reiheNachtragen(slots)).toBe(2)
    expect(slots[0]).toEqual({ name: 'A', rolle: SCHUELER, bereichsKey: 'schulung' })
    expect(slots[1]).toEqual({ name: 'B', rolle: PARTNER, bereichsKey: 'schulungPartner' })
  })

  it('lässt eine Ansprache unbeschriftet — sie hat kein Gegenüber', () => {
    // Dieselbe Regel wie in `togglePartner`: Das Label trägt nur, solange
    // zwei Namen nebeneinanderstehen.
    const slots = [{ name: 'A', bereichsKey: 'schulung', male: true }]
    expect(reiheNachtragen(slots)).toBe(0)
    expect(slots[0]).toEqual({ name: 'A', bereichsKey: 'schulung', male: true })
  })

  it('rührt fremde Rollen nicht an', () => {
    const slots = [
      { name: 'A', rolle: 'Leiter', bereichsKey: 'studium' },
      { name: 'B', rolle: 'Leser', bereichsKey: 'leser' },
    ]
    expect(reiheNachtragen(slots)).toBe(0)
    expect(slots[0].rolle).toBe('Leiter')
    expect(slots[1].rolle).toBe('Leser')
  })

  it('behält Namen und Kennung — nur die Beschriftung ändert sich', () => {
    const slots = [
      { name: 'A', pid: 'p1', bereichsKey: 'schulung' },
      { name: 'B', pid: 'p2', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
    ]
    reiheNachtragen(slots)
    expect(slots.map((s) => [s.name, s.pid])).toEqual([
      ['A', 'p1'],
      ['B', 'p2'],
    ])
  })

  it('ist zweimal hintereinander dasselbe (nichts mehr zu tun)', () => {
    const slots = [
      { name: '', bereichsKey: 'schulung' },
      { name: '', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
    ]
    expect(reiheNachtragen(slots)).toBe(2)
    expect(reiheNachtragen(slots)).toBe(0)
  })

  it('verträgt fehlende Reihen', () => {
    expect(reiheNachtragen(undefined)).toBe(0)
    expect(reiheNachtragen([])).toBe(0)
  })
})

describe('wocheNachtragen', () => {
  const woche = () => ({
    start: '2026-09-07',
    mid: {
      sections: [
        {
          farbe: 'gold',
          items: [
            {
              title: 'Gespräche beginnen',
              names: [
                { name: 'A', bereichsKey: 'schulung' },
                { name: 'B', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
              ],
              aux: [
                { name: 'C', bereichsKey: 'schulung' },
                { name: 'D', rolle: 'Gesprächspartner', bereichsKey: 'schulungPartner' },
              ],
            },
            { title: 'Vortrag', names: [{ name: 'E', bereichsKey: 'schulung', male: true }] },
          ],
        },
      ],
    },
    we: { sections: [{ items: [{ names: [{ name: 'F', rolle: 'Vorsitz', bereichsKey: 'vorsitz' }] }] }] },
  })

  it('nimmt die Zusätzliche Klasse mit', () => {
    const w = woche()
    expect(wocheNachtragen(w)).toBe(4) // 2 Hauptsaal + 2 Klasse
    const item = w.mid.sections[0]!.items[0]!
    expect(item.names.map((s) => s.rolle)).toEqual([SCHUELER, PARTNER])
    expect(item.aux!.map((s) => s.rolle)).toEqual([SCHUELER, PARTNER])
  })

  it('lässt Vortrag und Wochenende unberührt', () => {
    const w = woche()
    wocheNachtragen(w)
    expect(w.mid.sections[0]!.items[1]!.names[0]).toEqual({ name: 'E', bereichsKey: 'schulung', male: true })
    expect(w.we.sections[0]!.items[0]!.names[0]!.rolle).toBe('Vorsitz')
  })

  it('verträgt eine Woche ohne Zusammenkunft', () => {
    expect(wocheNachtragen({})).toBe(0)
    expect(wocheNachtragen({ mid: {} })).toBe(0)
  })
})

/**
 * **Der Aufruf muss an seinen eigenen Fehlern scheitern, nicht am Server.**
 *
 * Der erste echte Lauf starb an einem nackten „401: Invalid API key" samt
 * Stapelabzug — weil der aus der Anleitung kopierte Platzhalter
 * `<service-role-key>` unersetzt durchging. Die Meldung nannte die Ursache
 * nicht, und ein Node-`Assertion failed` aus libuv überschrieb sie noch.
 * Geprüft wird deshalb, dass beides vorher auffällt.
 */
describe('istPlatzhalter', () => {
  it('erkennt, was aus einer Anleitung stehen geblieben ist', () => {
    for (const k of ['<service-role-key>', '{{key}}', 'dein-key', 'YOUR_KEY', 'xxx']) {
      expect(istPlatzhalter(k), k).toBe(true)
    }
  })

  it('nichts gesetzt gilt ebenso', () => {
    expect(istPlatzhalter(undefined)).toBe(true)
    expect(istPlatzhalter('')).toBe(true)
    expect(istPlatzhalter('   ')).toBe(true)
  })

  it('erkennt „eyJ…" — sieht aus wie ein JWT, ist aber abgeschnitten', () => {
    /*
      Der zweite Fehllauf. „eyJ…" beginnt wie ein echter JWT und rutschte
      durch jede Muster-Prüfung; das „…" ist ein echtes Auslassungszeichen
      (U+2026). Gescheitert ist es erst im `fetch`, mit „Cannot convert
      argument to a ByteString" — HTTP-Header tragen nur Latin-1. Diese
      Meldung verbindet niemand mit einem vergessenen Platzhalter.
    */
    expect(istPlatzhalter('eyJ…')).toBe(true)
    // Auch mitten im Schlüssel, wenn jemand die Mitte durch „…" ersetzt hat.
    expect(istPlatzhalter(`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…${'x'.repeat(30)}`)).toBe(true)
    // Und typografische Anführungszeichen aus einem Textverarbeitungsprogramm.
    expect(istPlatzhalter('„eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def"')).toBe(true)
  })

  it('erkennt ein abgeschnittenes Beispiel an der Länge', () => {
    // Kein von Supabase ausgegebener Schlüssel ist so kurz.
    expect(istPlatzhalter('eyJhbGciOi')).toBe(true)
  })

  it('lässt einen echten Schlüssel durch', () => {
    // Beide Formen, die Supabase ausgibt — nur die Form zählt hier.
    expect(istPlatzhalter('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig')).toBe(false)
    expect(istPlatzhalter(`sb_secret_${'AbCdEf0123456789'.repeat(2)}`)).toBe(false)
  })
})

describe('urlAusEnvText', () => {
  it('liest die Projekt-URL, die die App schon benutzt', () => {
    const env = [
      '# Supabase-Anbindung (optional)',
      'VITE_SUPABASE_URL=https://abc123.supabase.co',
      'VITE_SUPABASE_ANON_KEY=eyJhbGci',
    ].join('\n')
    expect(urlAusEnvText(env)).toBe('https://abc123.supabase.co')
  })

  it('übergeht Kommentare, auch eingerückte', () => {
    const env = ['  # VITE_SUPABASE_URL=https://falsch.supabase.co', 'VITE_SUPABASE_URL=https://echt.supabase.co'].join('\n')
    expect(urlAusEnvText(env)).toBe('https://echt.supabase.co')
  })

  it('nimmt Anführungszeichen weg und verträgt CRLF', () => {
    // Windows schreibt CRLF; ohne `trim()` hinge ein \r an der URL und jede
    // Anfrage ginge an einen Wirt, den es nicht gibt.
    expect(urlAusEnvText('VITE_SUPABASE_URL="https://abc.supabase.co"\r\n')).toBe('https://abc.supabase.co')
    expect(urlAusEnvText("VITE_SUPABASE_URL='https://abc.supabase.co'")).toBe('https://abc.supabase.co')
  })

  it('leer, wenn die Zeile fehlt', () => {
    expect(urlAusEnvText('VITE_SUPABASE_ANON_KEY=eyJ')).toBe('')
    expect(urlAusEnvText('')).toBe('')
  })
})

describe('authKopf', () => {
  /*
    Die Legacy-JWT-Schlüssel dieses Projekts sind seit 14.8.2026 deaktiviert;
    gültig ist der `sb_secret_…`. Der ist **kein** JWT — laut Supabase-Doku
    („Send publishable and secret keys on the `apikey` header only") weist die
    Plattform eine Anfrage mit „Invalid JWT" ab, wenn er zusätzlich im
    `Authorization`-Header steht. Beide Arten müssen gehen: Legacy gilt
    allgemein bis Ende 2026, und andere Projekte nutzen ihn noch.
  */
  it('schickt den neuen Secret-Schlüssel nur als apikey', () => {
    expect(authKopf('sb_secret_AbCdEf0123456789')).toEqual({ apikey: 'sb_secret_AbCdEf0123456789' })
  })

  it('einen Legacy-JWT weiterhin in beiden Kopfzeilen', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig'
    expect(authKopf(jwt)).toEqual({ apikey: jwt, Authorization: `Bearer ${jwt}` })
  })

  it('trimmt, damit kein Zeilenumbruch in eine Kopfzeile gerät', () => {
    // Aus einer Eingabeaufforderung kommt gern ein \r mit; in einer Kopfzeile
    // wäre das ein Protokollfehler, nicht bloß ein hässlicher Wert.
    expect(authKopf('  sb_secret_Ab12  ')).toEqual({ apikey: 'sb_secret_Ab12' })
  })
})

describe('refAusUrl', () => {
  it('zieht die Projekt-Kennung für den Dashboard-Hinweis heraus', () => {
    expect(refAusUrl('https://izxrhrufdbpbuwbvxdqr.supabase.co')).toBe('izxrhrufdbpbuwbvxdqr')
    expect(refAusUrl('https://abc.supabase.co/rest/v1')).toBe('abc')
  })

  it('bleibt bei einer unlesbaren URL beim Platzhalter', () => {
    expect(refAusUrl('')).toBe('<ref>')
  })
})
