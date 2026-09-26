import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { argumente } from './gemeinsam.mjs'
import {
  bereiche,
  EXTERNE_ROLLE,
  fsRegelZeilen,
  fuelleZuteilungen,
  istUuid,
  kontoAnlegenOderUebernehmen,
  main,
  passwort,
  TEST_FS_REGELN,
  TEST_GASTREDNER,
  TEST_GRUPPEN,
  TEST_PERSONEN,
  waehle,
} from './testversammlung-anlegen.mjs'
import { regelFehler } from './treffpunkt-regeln-setzen.mjs'
import { isGuestRole } from '../src/data/helpers'
import { weekConflicts } from '../src/data/planning'
import type { Person, Service, Week } from '../src/data/types'
import { STANDARD_DIENSTE } from '../src/data/vorgaben'

/**
 * Das Skript legt den **zweiten Mandanten** an — die Voraussetzung dafür, T78
 * überhaupt messen zu können. Ein Fehler darin fällt sonst erst auf, wenn der
 * Nachweis daran scheitert, dass der Testbestand selbst schief ist; dann sucht
 * man den Fehler in den Richtlinien statt im Fixture.
 *
 * Geprüft ist alles, was **entscheidet**: der Bestand selbst, die
 * Bereichs-Ableitung, die Auswahlregel, das Füllen einer Woche und die Form
 * der Treffpunkt-Regeln. Der Netzteil (`main`) läuft einmal gegen ein
 * nachgebautes Backend — nicht, um das Netz zu prüfen, sondern damit jeder
 * Aufruf, den das Skript schickt, an `schema.sql` gehalten werden kann.
 */

/** Minimale Testperson, wie sie nach dem Anlegen aus der Datenbank käme. */
function person(id: string, priv: Record<string, boolean>, female = false, fam?: string) {
  return { id, fn: id, ln: 'Test', female, fam, priv }
}

function slotWoche() {
  return {
    start: '2026-08-24',
    range: '24.–30. August',
    mid: {
      date: '', end: '',
      sections: [
        {
          label: 'ERÖFFNUNG', farbe: 'neutral',
          items: [
            { song: 'Lied 1' },
            { title: 'Einleitung', names: [{ name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' }, { name: '', rolle: 'Gebet', bereichsKey: 'gebet' }] },
          ],
        },
        {
          label: 'UNS IM DIENST VERBESSERN', farbe: 'ocker',
          items: [
            { title: 'Gespräche beginnen', names: [{ name: '', bereichsKey: 'schulung' }, { name: '', rolle: 'Partner', bereichsKey: 'schulungPartner' }] },
            { title: 'Schülervortrag', names: [{ name: '', bereichsKey: 'schulung', male: true }] },
          ],
        },
      ],
      helpers: {} as Record<string, { name: string; pid?: string }[]>,
    },
    we: {
      date: '', end: '',
      sections: [
        {
          label: 'ÖFFENTLICHER VORTRAG', farbe: 'petrol',
          items: [{ title: 'Vortrag', names: [{ name: '', rolle: 'Gastredner', bereichsKey: 'vortrag' }] }],
        },
      ],
      helpers: {} as Record<string, { name: string; pid?: string }[]>,
    },
  }
}

describe('Der erfundene Bestand hält zusammen', () => {
  it('jede Gruppe hat genau einen Aufseher und einen Gehilfen', () => {
    TEST_GRUPPEN.forEach((_name, i) => {
      const gruppe = TEST_PERSONEN.filter((p) => p.g === i)
      expect(gruppe.filter((p) => p.av)).toHaveLength(1)
      expect(gruppe.filter((p) => p.ag)).toHaveLength(1)
    })
  })

  it('Aufseher und Gehilfen sind Älteste bzw. Dienstamtgehilfen', () => {
    for (const p of TEST_PERSONEN.filter((x) => x.av)) expect(p.rolle).toBe('aeltester')
    for (const p of TEST_PERSONEN.filter((x) => x.ag)) expect(p.rolle).toBe('dienstamtgehilfe')
  })

  it('jeder Haushalt hat genau zwei Personen — sonst greift die Partner-Regel ins Leere', () => {
    const haus = new Map<string, number>()
    for (const p of TEST_PERSONEN) if (p.haus) haus.set(p.haus, (haus.get(p.haus) ?? 0) + 1)
    expect(haus.size).toBeGreaterThan(0)
    for (const [name, anzahl] of haus) expect(`${name}: ${anzahl}`).toBe(`${name}: 2`)
  })

  it('jeder Hilfsdienst ohne Gruppen-Rotation hat freigegebene Personen', () => {
    for (const d of STANDARD_DIENSTE) {
      if (d.groups) continue
      const frei = TEST_PERSONEN.filter((p) => (p.d ?? []).includes(d.key))
      expect(`${d.key}: ${frei.length > 0}`).toBe(`${d.key}: true`)
    }
  })
})

describe('Vollständigkeitsprobe: der Bestand kann jeden Platz besetzen', () => {
  /*
    Von den **Daten** her gedacht, nicht von den Funktionen: Der Importer legt
    die Plätze an, und jeder trägt seinen Bereichs-Key. Kommt ein neuer Slot
    dazu, für den niemand qualifiziert ist, bliebe er im Testbestand still
    leer — und niemand wüsste, ob das an den Daten oder an der App liegt.
    Deshalb wird der Quelltext des Importers gefragt, nicht eine Liste hier.
  */
  it('jeder bereichsKey aus dem Import hat mindestens eine qualifizierte Person', () => {
    const quelle = fs.readFileSync(new URL('../supabase/functions/import-week/parse.ts', import.meta.url), 'utf8')
    const keys = [...quelle.matchAll(/bereichsKey: '([^']+)'/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(5)
    for (const key of new Set(keys)) {
      const passend = TEST_PERSONEN.filter((p) => bereiche(p)[key])
      expect(`${key}: ${passend.length > 0}`).toBe(`${key}: true`)
    }
  })
})

describe('Der Treffpunkt-Grundplan: eine Zeile je Regel, wie die App sie schreibt', () => {
  /*
    Bis zum 26.9.2026 schrieb das Skript den Grundplan als **ein** Objekt
    `{ congregation_id, base, rules: [...] }` mit `grp: ''` — die Form von vor
    dem Umbau vom 18.9.2026 (T105). Der Umbau hatte die anderen Tabellen dieses
    Skripts nachgezogen, diese nicht; ein `.mjs` hat keinen Compiler, der die
    Spalten kennt. Ob die Zeilen in `fs_rules` passen, fragt die Probe über das
    ganze Skript weiter unten; hier steht, was eine Regel darüber hinaus
    ausmacht.
  */
  const CONG = '3f2a9c1e-0b7d-4e55-9a31-8c6d5e4f7a20'
  const zeilen = fsRegelZeilen(CONG)

  it('eine Zeile je Regel, mit deren Inhalt — und jede gehört der neuen Versammlung', () => {
    // Rückwärts gelesen wie `fsRuleFromRow` in der App: Was hier hineingeht,
    // muss dort als dieselbe Regel wieder herauskommen.
    const zurueck = zeilen.map((z) => ({
      grp: z.grp, wd: z.wd, time: z.time, place: z.place, monthly: z.monthly, skipCong: z.skip_cong,
    }))
    expect(zurueck).toEqual(TEST_FS_REGELN)
    expect(zeilen.map((z) => z.congregation_id)).toEqual(TEST_FS_REGELN.map(() => CONG))
  })

  it('und jede Regel besteht die Prüfung, mit der treffpunkt-regeln-setzen.mjs einträgt', () => {
    // Wochentag 0..6, „HH:MM", Monatsregel 0..4 — und keine Gruppen-Ids: Beide
    // Regeln sind Versammlungstreffpunkte, jede Gruppe wäre hier eine fremde.
    expect(zeilen.flatMap((z) => regelFehler(z, []))).toEqual([])
  })

  it('die Kennung hat die Form der App: r<uuid>, je Regel eine eigene', () => {
    for (const z of zeilen) {
      expect(z.id[0], z.id).toBe('r')
      expect(istUuid(z.id.slice(1)), z.id).toBe(true)
    }
    expect(new Set(zeilen.map((z) => z.id)).size).toBe(zeilen.length)
  })
})

/**
 * Die Spalten einer Tabelle, wie `schema.sql` sie anlegt: Name → Typ, ob `null`
 * erlaubt ist, und ob die Zeile sie **mitbringen muss** (`not null` oder
 * Primärschlüssel, ohne `default`).
 *
 * Gelesen wird der `create table`-Block Zeile für Zeile, dazu jedes spätere
 * `alter table … add column` — im Schema allein `persons.grp`, der Kreis
 * zwischen Personen und Gruppen; ohne diesen Zweig wäre jede Person „fremd".
 * Tabellenweite Zeilen (`constraint`, `unique`, die Fortsetzung eines
 * Fremdschlüssels oder einer Prüfung) beginnen mit einem Schlüsselwort und
 * fallen heraus.
 */
function schemaSpalten(schema: string, tabelle: string) {
  const spalten = new Map<string, { typ: string; nullbar: boolean; pflicht: boolean }>()
  const aufnehmen = (zeile: string): void => {
    const m = /^\s*(\w+)\s+(\w+(?:\[\])?)(.*)$/.exec(zeile.replace(/--.*$/, ''))
    if (!m || /^(constraint|unique|primary|foreign|check|references|exclude)$/i.test(m[1]!)) return
    const rest = m[3]!.toLowerCase()
    const nullbar = !/\bnot null\b|\bprimary key\b/.test(rest)
    spalten.set(m[1]!, { typ: m[2]!.toLowerCase(), nullbar, pflicht: !nullbar && !/\bdefault\b/.test(rest) })
  }
  const block = new RegExp(`create table if not exists public\\.${tabelle}\\s*\\(([\\s\\S]*?)\\n\\);`).exec(schema)
  for (const zeile of (block?.[1] ?? '').split(/\r?\n/)) aufnehmen(zeile)
  const spaeter = new RegExp(`alter table public\\.${tabelle}\\s+add column if not exists ([^;]+);`, 'g')
  for (const [, definition] of schema.matchAll(spaeter)) aufnehmen(definition!)
  return spalten
}

/**
 * Passt ein Wert in eine Spalte dieses Typs? Nur die Typen, die das Skript
 * schreibt — kommt eine Spalte anderen Typs dazu, meldet die Probe das, statt
 * sie stillschweigend durchzuwinken.
 */
const PASST: Record<string, (wert: unknown) => boolean> = {
  text: (w) => typeof w === 'string',
  uuid: (w) => typeof w === 'string' && istUuid(w),
  smallint: (w) => Number.isInteger(w),
  integer: (w) => Number.isInteger(w),
  boolean: (w) => typeof w === 'boolean',
  time: (w) => typeof w === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(w),
  date: (w) => typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w),
  // Ein Objekt, kein vorab serialisierter Text: `JSON.stringify(week)` stünde
  // in `jsonb` als String da und wäre für die App keine Woche mehr.
  jsonb: (w) => typeof w === 'object',
}

/** Ein REST-Aufruf, wie das Skript ihn an PostgREST schickt. */
interface Aufruf {
  pfad: string
  method: string
  body?: unknown
}

/** Parameter in der Adresse, die keine Spalte nennen. */
const KEINE_SPALTE = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

/**
 * Was an einem Aufruf nicht zu `schema.sql` passt — leer heißt: in Ordnung.
 *
 * Gefragt werden die Tabelle aus dem Pfad, jede Spalte in Filter und
 * `select`, und bei jeder mitgeschickten Zeile Feld, Typ und `null` — beim
 * Anlegen (POST) dazu die Pflichtspalten. Eine Änderung (PATCH) bringt nur
 * mit, was sie ändert.
 */
function schemaFehler(schema: string, { pfad, method, body }: Aufruf): string[] {
  const [tabelle = '', abfrage = ''] = pfad.split('?')
  const spalten = schemaSpalten(schema, tabelle)
  if (!spalten.size) return [`${method} ${tabelle}: keine Tabelle in schema.sql`]
  const fehler: string[] = []
  const nenne = (spalte: string, was: string): void => {
    fehler.push(`${method} ${tabelle}.${spalte}: ${was}`)
  }
  for (const [k, v] of new URLSearchParams(abfrage)) {
    const genannt = k === 'select' ? v.split(',').filter((s) => s !== '*') : KEINE_SPALTE.has(k) ? [] : [k]
    for (const s of genannt) if (!spalten.has(s)) nenne(s, 'gibt es nicht')
  }
  const zeilen = (body === undefined ? [] : Array.isArray(body) ? body : [body]) as Record<string, unknown>[]
  for (const zeile of zeilen) {
    for (const [k, wert] of Object.entries(zeile)) {
      const s = spalten.get(k)
      const passt = s && PASST[s.typ]
      if (!s) nenne(k, 'gibt es nicht')
      else if (wert === null) {
        if (!s.nullbar) nenne(k, 'null in einer not-null-Spalte')
      } else if (!passt) nenne(k, `Typ ${s.typ} kennt die Probe nicht — PASST ergänzen`)
      else if (!passt(wert)) nenne(k, `${String(JSON.stringify(wert)).slice(0, 60)} ist kein ${s.typ}`)
    }
    if (method !== 'POST') continue
    for (const [name, s] of spalten) if (s.pflicht && !(name in zeile)) nenne(name, 'Pflichtspalte fehlt')
  }
  return fehler
}

/** Jeder Befund einmal: Eine Spalte, die 30 Zeilen verfehlen, ist ein Fehler, nicht dreißig. */
function befunde(schema: string, aufrufe: Aufruf[]): string[] {
  return [...new Set(aufrufe.flatMap((a) => schemaFehler(schema, a)))]
}

/**
 * Ein nachgebautes Backend, gerade so weit, dass das Skript durchläuft:
 * PostgREST gibt angelegte Zeilen samt Kennung zurück (wie bei
 * `return=representation`) und findet beim Entfernen die Versammlung, die
 * Auth-API legt Konten an, `import-week` liefert eine Woche. Mitgeschrieben
 * wird jeder REST-Aufruf — gefragt wird danach nicht, was das Skript schreiben
 * *wollte*, sondern was es geschickt hat.
 */
function attrappe() {
  const aufrufe: Aufruf[] = []
  const rest = async (pfad: string, method = 'GET', body?: unknown) => {
    aufrufe.push({ pfad, method, body })
    if (method === 'GET') {
      return pfad.startsWith('congregations?') ? [{ id: randomUUID(), name: 'Probeversammlung Talheim' }] : []
    }
    if (method !== 'POST') return null
    return (Array.isArray(body) ? body : [body]).map((z) => ({ id: randomUUID(), ...(z as object) }))
  }
  const auth = async (_pfad: string, method = 'POST', body?: { email?: string }) =>
    method === 'GET' ? { users: [] } : { id: randomUUID(), email: body?.email }
  const fn = async () => ({ week: slotWoche() })
  return { aufrufe, zugang: async () => ({ rest, auth, fn }) }
}

/** Das Skript einmal ganz durchfahren — stumm, gegen die Attrappe. */
async function fahre(...argv: string[]): Promise<Aufruf[]> {
  const { aufrufe, zugang } = attrappe()
  const stumm = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await main(argv, zugang)
  } finally {
    stumm.mockRestore()
  }
  return aufrufe
}

describe('Jeder Aufruf des Skripts passt zu schema.sql', () => {
  /*
    Zuerst stand nur der Grundplan unter Probe, über die Funktion, die seine
    Zeilen baut. Für die übrigen Tabellen hätte das je eine weitere solche
    Funktion geheißen — und damit eine Liste, in die sich jeder neue
    Schreibaufruf selbst eintragen muss; wer es vergisst, merkt nichts.
    Deshalb läuft hier das ganze Skript, einmal zum Anlegen und einmal zum
    Entfernen, und die Attrappe schreibt mit: Ein Aufruf, der dazukommt, steht
    ohne Zutun unter derselben Probe.

    Gefragt wird das Schema selbst, keine Spaltenliste hier: Benennt es eine
    Spalte um, streicht es eine oder kommt eine Pflichtspalte dazu, wird diese
    Probe rot — nicht erst der nächste Lauf gegen die Datenbank. Nicht gefragt
    sind `check`-Bedingungen, Fremdschlüssel und die Auth-API, die nicht in
    `schema.sql` steht.
  */
  const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

  it('die Probe greift überhaupt', async () => {
    // Fände das Muster die Blöcke nicht, gingen die Fälle unten leer und grün
    // durch. Deshalb an drei Stellen, dass es Spalten samt ihrer Art erkennt:
    // Pflicht, `null`, und eine Spalte, die erst per `alter table` dazukommt.
    expect(schemaSpalten(schema, 'fs_rules').get('id')).toMatchObject({ typ: 'text', nullbar: false, pflicht: true })
    expect(schemaSpalten(schema, 'fs_rules').get('grp')).toMatchObject({ typ: 'uuid', nullbar: true, pflicht: false })
    expect(schemaSpalten(schema, 'persons').get('grp')).toMatchObject({ typ: 'uuid', nullbar: true })
    // Und die Attrappe trägt das Skript bis ans Ende: Jeder Schritt hat geschrieben.
    const aufrufe = await fahre('--wochen', '1')
    const geschrieben = new Set(aufrufe.filter((a) => a.method !== 'GET').map((a) => a.pfad.split('?')[0]))
    expect([...geschrieben]).toEqual(
      expect.arrayContaining(['congregations', 'groups', 'households', 'persons', 'services', 'fs_rules', 'weeks', 'members']),
    )
  })

  it('beim Anlegen passt jede Zeile und jede Änderung zu ihrer Tabelle', async () => {
    expect(befunde(schema, await fahre('--wochen', '1'))).toEqual([])
  })

  it('beim Entfernen nennt jede Abfrage nur Spalten, die es gibt', async () => {
    const aufrufe = await fahre('--entfernen', 'Probeversammlung Talheim', '--wirklich')
    expect(aufrufe.map((a) => a.method)).toContain('DELETE')
    expect(befunde(schema, aufrufe)).toEqual([])
  })
})

describe('Bereiche je Stellung', () => {
  it('ein Ältester darf das Feste, eine Schwester nur die Schulungsaufgaben', () => {
    const aeltester = bereiche(TEST_PERSONEN.find((p) => p.rolle === 'aeltester' && !p.w)!)
    const schwester = bereiche(TEST_PERSONEN.find((p) => p.w)!)
    expect(aeltester.vorsitzMid).toBe(true)
    expect(aeltester.studium).toBe(true)
    expect(schwester.schulung).toBe(true)
    expect(schwester.vorsitzMid).toBeUndefined()
    expect(schwester.gebet).toBeUndefined()
  })

  it('Hilfsdienste kommen mit dem Präfix svc:', () => {
    const p = TEST_PERSONEN.find((x) => (x.d ?? []).includes('mik'))!
    expect(bereiche(p)['svc:mik']).toBe(true)
    expect(bereiche(p).mik).toBeUndefined()
  })
})

describe('Auswahlregel', () => {
  const q = { schulung: true, schulungPartner: true }

  it('ein Nur-Partner deckt keinen Führungsplatz, ein Führer aber den Partnerplatz', () => {
    const nurPartner = person('partner', { schulungPartner: true })
    const belegt = new Set<string>()
    expect(waehle([nurPartner], { bereichsKey: 'schulung' }, belegt, new Map())).toBeNull()
    expect(waehle([person('fuehrer', { schulung: true })], { bereichsKey: 'schulungPartner' }, belegt, new Map())).not.toBeNull()
  })

  it('ein Platz nur für Brüder nimmt keine Schwester', () => {
    const nur = [person('schwester', q, true)]
    expect(waehle(nur, { bereichsKey: 'schulung', male: true }, new Set(), new Map())).toBeNull()
    expect(waehle(nur, { bereichsKey: 'schulung' }, new Set(), new Map())).not.toBeNull()
  })

  it('wer in dieser Zusammenkunft schon dran war, kommt nicht zweimal', () => {
    const p = person('a', q)
    expect(waehle([p], { bereichsKey: 'schulung' }, new Set(['a']), new Map())).toBeNull()
  })

  it('Partner: gleiches Geschlecht — oder derselbe Haushalt', () => {
    const bruder = person('bruder', q, false, 'haus-1')
    const fremde = person('fremde', q, true, 'haus-2')
    const ehefrau = person('ehefrau', q, true, 'haus-1')
    const fuehrend = { pid: 'bruder' }
    const slot = { bereichsKey: 'schulungPartner', rolle: 'Partner' }
    expect(waehle([bruder, fremde], slot, new Set(['bruder']), new Map(), fuehrend)).toBeNull()
    expect(waehle([bruder, ehefrau], slot, new Set(['bruder']), new Map(), fuehrend)?.id).toBe('ehefrau')
  })

  it('reihum: der bisher am wenigsten Belastete gewinnt', () => {
    const a = person('a', q)
    const b = person('b', q)
    const zaehler = new Map([['a', 3], ['b', 1]])
    expect(waehle([a, b], { bereichsKey: 'schulung' }, new Set(), zaehler)?.id).toBe('b')
  })

  it('bei Gleichstand gewinnt, wer am wenigsten kann — die Vielseitigen bleiben frei', () => {
    // Der Ältere steht **vorn** in der Liste: Ohne die Regel bekäme er den
    // Platz allein durch die Reihenfolge, obwohl ihn auch die Schwester kann.
    const aeltester = person('aeltester', { schulung: true, studium: true, gebet: true })
    const schwester = person('schwester', { schulung: true }, true)
    expect(waehle([aeltester, schwester], { bereichsKey: 'schulung' }, new Set(), new Map())?.id).toBe('schwester')
    // Und für den Platz, den nur er kann, ist er weiterhin da.
    expect(waehle([aeltester, schwester], { bereichsKey: 'studium' }, new Set(), new Map())?.id).toBe('aeltester')
  })
})

describe('Eine Woche besetzen', () => {
  const personen = [
    person('aeltester1', { vorsitzMid: true, gebet: true, schulung: true, vortrag: true, 'svc:ton': true }),
    person('aeltester2', { vorsitzMid: true, gebet: true, schulung: true, 'svc:mik': true }),
    person('bruder', { schulung: true, schulungPartner: true, 'svc:mik': true }),
    person('schwester', { schulung: true, schulungPartner: true }, true),
  ]
  const dienste = [
    { key: 'ton', name: 'Ton', count: 1, groups: false },
    { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
    { key: 'rein', name: 'Reinigung', count: 1, groups: true },
  ]
  const gruppen = TEST_GRUPPEN.map((name) => ({ name }))

  it('besetzt Programmplätze und Hilfsdienste', () => {
    const week = slotWoche()
    const gesetzt = fuelleZuteilungen(week, personen, dienste, gruppen)
    expect(gesetzt).toBeGreaterThan(0)
    const eroeffnung = week.mid.sections[0]!.items[1] as { names: { name: string; pid?: string }[] }
    expect(eroeffnung.names[0]!.name).not.toBe('')
    expect(eroeffnung.names[0]!.pid).toBeTruthy()
    expect(week.mid.helpers.mik).toHaveLength(2)
  })

  /*
    Die Grenze verläuft dort, wo die App sie zieht (`weekConflicts`), nicht wo
    man sie vermutet: Zwei **Programmpunkte** in einer Zusammenkunft sind
    erlaubt (Vorsitz + Anfangsgebet), gemeldet werden nur Hilfsdienst neben
    Programmpunkt und mehrere Hilfsdienste.
  */
  function belegungen(meeting: { sections: unknown[]; helpers: Record<string, { pid?: string }[]> }) {
    const programm: string[] = []
    for (const sec of meeting.sections as { items: { names?: { pid?: string }[] }[] }[]) {
      for (const item of sec.items) for (const s of item.names ?? []) if (s.pid) programm.push(s.pid)
    }
    const dienst: string[] = []
    for (const slots of Object.values(meeting.helpers)) for (const s of slots) if (s.pid) dienst.push(s.pid)
    return { programm, dienst }
  }

  it('niemand hat Hilfsdienst und Programmpunkt in derselben Zusammenkunft', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    for (const mk of ['mid', 'we'] as const) {
      const { programm, dienst } = belegungen(week[mk])
      expect(dienst.filter((p) => programm.includes(p))).toEqual([])
    }
  })

  it('und niemand zwei Hilfsdienste am selben Tag', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    for (const mk of ['mid', 'we'] as const) {
      const { dienst } = belegungen(week[mk])
      expect(dienst).toHaveLength(new Set(dienst).size)
    }
  })

  it('der Gastredner bleibt Freitext — ohne pid, die Herkunft in ihrem eigenen Feld', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    const slot = (
      week.we.sections[0]!.items[0] as { names: { name: string; pid?: string; rolle?: string; herkunft?: string }[] }
    ).names[0]!
    expect(slot.name).toBeTruthy()
    expect(slot.pid).toBeUndefined()
    expect(slot.rolle).toBe('Gastredner')
    expect(TEST_GASTREDNER.some((g) => g.name === slot.name && g.herkunft === slot.herkunft)).toBe(true)
  })

  it('zwei Programmpunkte für dieselbe Person sind erlaubt — sonst bliebe der Platz leer', () => {
    /*
      Vorsitz + Anfangsgebet ist der Normalfall und ausdrücklich kein Konflikt
      (`weekConflicts`). Die erste Fassung verbot hier jede zweite Aufgabe —
      an einer echten Woche blieben dadurch Leiter, Leser und Schlussgebet leer.
    */
    const einzelner = person('einzelner', { vorsitzMid: true, gebet: true })
    const week = slotWoche()
    week.mid.sections = [week.mid.sections[0]!] // nur die Eröffnung
    week.we.sections = []
    fuelleZuteilungen(week, [einzelner], [], gruppen)
    const namen = (week.mid.sections[0]!.items[1] as { names: { name: string }[] }).names
    expect(namen.map((s) => s.name)).toEqual(['einzelner Test', 'einzelner Test'])
  })

  it('der knappste Dienst wird zuerst besetzt — sonst bleibt er leer', () => {
    /*
      Genau dieser Fall ist an einer echten Woche aufgetreten: Der
      Rundgangsordner steht hinten in der Liste und hat die wenigsten
      Freigegebenen. Wer der Reihe nach füllt, verbraucht dessen einzigen
      Kandidaten vorher an einem Dienst, den auch ein anderer könnte.
    */
    const beide = person('beide', { 'svc:ton': true, 'svc:rund': true })
    const nurTon = person('nurTon', { 'svc:ton': true, 'svc:mik': true, 'svc:zoom': true })
    const zwei = [
      { key: 'ton', name: 'Ton', count: 1, groups: false },
      { key: 'rund', name: 'Rundgang', count: 1, groups: false },
    ]
    const week = slotWoche()
    // Ohne Programm, damit allein die Reihenfolge der Dienste zählt.
    week.mid.sections = []
    week.we.sections = []
    fuelleZuteilungen(week, [beide, nurTon], zwei, gruppen)
    expect(week.mid.helpers.rund![0]!.name).toBe('beide Test')
    expect(week.mid.helpers.ton![0]!.name).toBe('nurTon Test')
  })

  it('die Reinigung rotiert Gruppen, ohne Person', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    const rein = week.mid.helpers.rein!
    expect(rein[0]!.pid).toBeUndefined()
    expect(TEST_GRUPPEN).toContain(rein[0]!.name)
  })

  it('ein Lauf ist wiederholbar — zweimal dieselbe Besetzung', () => {
    const a = slotWoche()
    const b = slotWoche()
    fuelleZuteilungen(a, personen, dienste, gruppen)
    fuelleZuteilungen(b, personen, dienste, gruppen)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('Die App selbst findet nichts zu beanstanden', () => {
  /*
    Die stärkste Probe, die hier möglich ist: Der Testbestand wird nicht an
    einer nachgebauten Regel gemessen, sondern an `weekConflicts` — derselben
    Funktion, die im Planen-Screen das Warnbanner füllt. Ein Fixture, das die
    App beim Öffnen rot anzeigt, wäre für den Mandanten-Nachweis wertlos: Man
    wüsste bei jedem Fund nicht, ob er von den Daten oder von der Trennung
    kommt.

    Genau hier lag der erste Fehler: Das Skript verbot jede zweite Aufgabe in
    einer Zusammenkunft — die App verbietet nur *Hilfsdienst + Programmpunkt*
    und *mehrere Hilfsdienste*. Zwei Programmpunkte (Vorsitz + Anfangsgebet)
    sind ausdrücklich erlaubt. Durch das zu strenge Verbot blieben Plätze leer.
  */
  const personen: Person[] = TEST_PERSONEN.map((p, i) => ({
    id: `p${i}`,
    fn: p.fn,
    ln: p.ln,
    role: p.rolle as Person['role'],
    female: Boolean(p.w),
    tel: '',
    mail: '',
    fam: p.haus ?? null,
    priv: bereiche(p) as Person['priv'],
  }))
  const dienste: Service[] = STANDARD_DIENSTE.map((d) => ({ ...d }))
  const gruppen = TEST_GRUPPEN.map((name) => ({ name }))

  it('keine Konflikte in der besetzten Woche', () => {
    const week = slotWoche()
    fuelleZuteilungen(week, personen, dienste, gruppen)
    expect(weekConflicts([week as unknown as Week], 0, personen, dienste)).toEqual([])
  })

  it('und auch nicht über vier Wochen hinweg', () => {
    const stand = { zaehler: new Map<string, number>(), rotation: 0 }
    const wochen = Array.from({ length: 4 }, () => slotWoche())
    for (const w of wochen) fuelleZuteilungen(w, personen, dienste, gruppen, stand)
    const alle = wochen as unknown as Week[]
    for (let wi = 0; wi < alle.length; wi++) {
      expect(`Woche ${wi}: ${JSON.stringify(weekConflicts(alle, wi, personen, dienste))}`).toBe(`Woche ${wi}: []`)
    }
  })

  it('und die Last verteilt sich — niemand trägt mehr als das Doppelte des Durchschnitts', () => {
    const stand = { zaehler: new Map<string, number>(), rotation: 0 }
    for (let i = 0; i < 4; i++) fuelleZuteilungen(slotWoche(), personen, dienste, gruppen, stand)
    const lasten = [...stand.zaehler.values()]
    const schnitt = lasten.reduce((a, b) => a + b, 0) / lasten.length
    expect(Math.max(...lasten)).toBeLessThanOrEqual(schnitt * 2)
  })
})

describe('Externe Rollen — dieselbe Aussage wie in der App', () => {
  /*
    Node lädt `src/data/helpers.ts` nicht, deshalb steht die Regel im Skript ein
    zweites Mal. Zwei Quellen für dieselbe Aussage laufen auseinander, sobald
    eine gepflegt wird — hier hinge daran, dass ein Platz ohne
    Bestätigungs-Flow trotzdem eine `pid` bekäme.
  */
  it('was die App als extern ansieht, füllt das Skript als Freitext', () => {
    for (const rolle of ['Gastredner', 'Gastredner · Vers. Ringheim', 'Kreisaufseher']) {
      expect(`${rolle}: ${EXTERNE_ROLLE.test(rolle)}`).toBe(`${rolle}: ${isGuestRole(rolle)}`)
    }
  })

  it('und normale Rollen sind für beide keine externen', () => {
    for (const rolle of ['Vorsitz', 'Gebet', 'Leser', 'Redner', 'Partner']) {
      expect(`${rolle}: ${EXTERNE_ROLLE.test(rolle)}`).toBe(`${rolle}: ${isGuestRole(rolle)}`)
    }
  })
})

describe('Ein abgebrochener Lauf blockiert den nächsten nicht', () => {
  /*
    Der erste scharfe Lauf brach zwischen „Konto angelegt" und
    „members-Zeile geschrieben" ab. Zurück blieb ein Konto, das weder
    anmeldbar noch über `members` auffindbar war — und das jeden weiteren
    Versuch an derselben Adresse scheitern ließ. Deshalb diese beiden Wege.
  */
  const konto = { id: 'u1', email: 'planer@probe.invalid' }

  it('normalerweise wird ein neues Konto angelegt', async () => {
    const rufe: string[] = []
    const auth = async (pfad: string, method: string) => {
      rufe.push(`${method} ${pfad}`)
      return konto
    }
    const user = await kontoAnlegenOderUebernehmen(auth, konto.email, 'geheim')
    expect(user.uebernommen).toBeUndefined()
    expect(rufe).toEqual(['POST users'])
  })

  it('ist die Adresse belegt, wird das vorhandene Konto übernommen und neu bekennwortet', async () => {
    const rufe: string[] = []
    const auth = async (pfad: string, method: string, body?: unknown) => {
      rufe.push(`${method} ${pfad}`)
      if (method === 'POST') throw new Error('POST auth/users 422: {"code":"email_exists"}')
      if (method === 'GET') return { users: [konto] }
      expect(body).toMatchObject({ password: 'geheim' })
      return {}
    }
    const user = await kontoAnlegenOderUebernehmen(auth, konto.email, 'geheim')
    expect(user.id).toBe('u1')
    expect(user.uebernommen).toBe(true)
    expect(rufe).toEqual(['POST users', 'GET users?page=1&per_page=1000', 'PUT users/u1'])
  })

  it('ein anderer Fehler wird nicht verschluckt', async () => {
    const auth = async () => {
      throw new Error('POST auth/users 500: kaputt')
    }
    await expect(kontoAnlegenOderUebernehmen(auth, konto.email, 'geheim')).rejects.toThrow('500')
  })
})

describe('--entfernen nimmt Id oder Name', () => {
  it('erkennt eine UUID', () => {
    expect(istUuid('3f2a9c1e-0b7d-4e55-9a31-8c6d5e4f7a20')).toBe(true)
  })

  it('und alles andere ist ein Name', () => {
    for (const wert of ['Probeversammlung Talheim', 'Talheim', '', '1234']) {
      expect(`${wert}: ${istUuid(wert)}`).toBe(`${wert}: false`)
    }
  })
})

describe('Kennwort und Argumente', () => {
  it('das Kennwort ist lang und URL-sicher', () => {
    const pw = passwort()
    expect(pw.length).toBeGreaterThanOrEqual(20)
    expect(pw).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('--flagge wird true, --name nimmt den Wert', () => {
    expect(argumente(['--name', 'Talheim', '--trocken'])).toEqual({ name: 'Talheim', trocken: true })
  })
})
