import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ATTRAPPE_SCHLUESSEL,
  ATTRAPPE_URL,
  type Aufruf,
  befunde,
  fahre,
  REDET_MIT_DB,
  schemaFehler,
  schemaFunktion,
  schemaSpalten,
  tabelleVon,
  type Umgebung,
} from './schema-attrappe'
import { eigeneSlots, fremdeSlots } from './mitgliedsrechte-probe.mjs'
import { uuid5 } from './wochenplanung-importieren.mjs'

/**
 * **Jedes Wartungsskript fährt einmal gegen die Attrappe, und jeder seiner
 * REST-Aufrufe muss zu `schema.sql` passen.**
 *
 * Warum überhaupt, steht im Kopf von `schema-attrappe.ts`. Hier steht, *wie*:
 * je Skript ein Lauf (oder zwei, wo es zwei Wege gibt) mit gerade so viel
 * Bestand, dass es bis zu seinen Schreibaufrufen kommt. Ob es dort ankam,
 * sagt `erwartet` — ohne diese Zusage bestünde ein Lauf die Probe auch dann,
 * wenn er beim ersten Lesen ausstiege und nichts geschrieben hätte.
 *
 * **Kein Skript fällt heraus, ohne dass es jemand entschieden hat.** Die
 * Skripte mit Datenbankzugriff werden aus dem Verzeichnis ermittelt (dieselbe
 * Erkennung wie in `schluessel-einheitlich.test.ts`); jedes braucht hier einen
 * Lauf oder eine Ausnahme mit Begründung.
 *
 * Alle Eingaben sind **Platzhalter** („Probe", `.invalid`, Kennungen aus
 * Nullen) — keine nachempfundenen Namen, keine Daten aus NWS.
 */

const dir = import.meta.dirname
const MODULE = import.meta.glob('./*.mjs') as Record<string, () => Promise<Record<string, unknown>>>

/** Feste, sprechende Kennungen: `k(12)` → `00000000-0000-4000-8000-000000000012`. */
const k = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const C = k(1) // Versammlung
const CB = k(2) // zweite Versammlung (Mandanten-Nachweis)
const G1 = k(11) // Gruppe
const H1 = k(21) // Haushalt
const P1 = k(31)
const P2 = k(32)
const P_ALT = k(33) // Person vor dem Zurücksetzen
const U1 = k(41) // Konten
const U2 = k(42)
const G_ALT = k(51) // Gruppe vor dem Zurücksetzen

/** Die App-Person zu einer NWS-Person — so vergibt sie `build-personen-sql.mjs`. */
const NWS_PERSON = uuid5('person:101')
const NWS_PERSONEN = [{ ID: 101, mid: 1, cid: 7, a: 'Probe', b: 'Eins' }]

/** Ein Tag später oder früher, als ISO-Datum. */
function plusTage(iso: string, tage: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}

/** Eine Programmwoche in der Form des Imports — mit Platzhaltern statt Wortlaut. */
function probeWoche(start: string, namen: Record<string, unknown>[] = [], helpers: Record<string, unknown> = {}) {
  return {
    start,
    range: 'Probewoche',
    mid: {
      date: '',
      end: '',
      sections: [
        {
          label: 'PROBE',
          farbe: 'neutral',
          items: [
            {
              iid: 'probe-punkt',
              title: 'Probe-Punkt',
              meta: '',
              names: namen.length
                ? namen
                : [
                    { name: '', rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
                    { name: '', bereichsKey: 'schulung' },
                    { name: '', bereichsKey: 'schulungPartner' },
                  ],
            },
          ],
        },
      ],
      helpers,
    },
    we: { date: '', end: '', sections: [], helpers: {} },
  }
}

/** Anmeldung und Schlüssel für die beiden RLS-Proben — sie lesen aus der Umgebung. */
const ANON = {
  SUPABASE_ANON_KEY: 'sb_publishable_attrappe_000000',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_ein_anderer_000000',
}

interface Lauf {
  titel: string
  /** Was gefahren wird — meist `main` mit einer Aufrufzeile; `dateien` ist das Verzeichnis der Eingaben. */
  fahren: (m: Record<string, (...a: unknown[]) => Promise<unknown>>, dateien: string) => Promise<unknown>
  umgebung?: Umgebung
  /** Eingabedateien (Name → Inhalt; ein Objekt wird zu JSON). */
  dateien?: Record<string, unknown>
  /** Aufrufe, die der Lauf erreicht haben muss: „METHODE tabelle". */
  erwartet: string[]
}

const LAEUFE: Record<string, Lauf[]> = {
  'testversammlung-anlegen.mjs': [
    {
      titel: 'anlegen',
      fahren: (m) => m.main!(['--wochen', '1']),
      umgebung: { funktionen: { 'import-week': () => ({ json: { week: probeWoche('2026-08-24') } }) } },
      erwartet: [
        'POST congregations', 'POST groups', 'POST households', 'POST persons', 'PATCH groups',
        'POST services', 'POST fs_rules', 'POST weeks', 'POST members', 'PATCH persons',
      ],
    },
    {
      titel: 'entfernen',
      fahren: (m) => m.main!(['--entfernen', 'Probeversammlung Talheim', '--wirklich']),
      umgebung: { bestand: { congregations: [{ id: C, name: 'Probeversammlung Talheim' }] } },
      erwartet: ['GET congregations', 'GET members', 'GET persons', 'GET weeks', 'DELETE congregations'],
    },
  ],

  'versammlung-anlegen.mjs': [
    {
      titel: 'anlegen',
      fahren: (m) =>
        m.main!([
          '--name', 'Probeversammlung', '--saal', 'Probe-Saal', '--mid', '2 19:00', '--we', '0 10:00',
          '--vorname', 'Probe', '--nachname', 'Planer', '--sprache', 'de',
        ]),
      erwartet: ['POST congregations', 'POST persons', 'POST services', 'POST invites'],
    },
  ],

  'rollen-nachtragen.mjs': [
    {
      titel: 'Beschriftung nachtragen',
      fahren: (m) => m.main!([]),
      umgebung: { bestand: { weeks: [{ congregation_id: C, start: '2026-08-24', data: probeWoche('2026-08-24') }] } },
      erwartet: ['GET weeks', 'PATCH weeks'],
    },
  ],

  'wochen-importieren.mjs': [
    {
      titel: 'zwei Wochen holen',
      fahren: (m) => m.main!(['--anzahl', '2']),
      umgebung: {
        bestand: { congregations: [{ id: C, name: 'Probe', cong_lang: 'de', prog_langs: [] }] },
        funktionen: {
          'import-week': ({ after }) => ({ json: { week: probeWoche(after ? plusTage(String(after), 7) : '2026-08-24') } }),
        },
      },
      erwartet: ['GET congregations', 'GET weeks', 'POST weeks'],
    },
  ],

  'treffpunkt-regeln-setzen.mjs': [
    {
      titel: 'Grundplan ersetzen',
      dateien: {
        'regeln.json': [
          { wd: 1, time: '14:30', place: 'Probe-Ort', monthly: 0, grp: null },
          { wd: 3, time: '09:30', place: '', monthly: 0, grp: G1, skipCong: true },
        ],
      },
      fahren: (m, d) => m.main!(['--datei', path.join(d, 'regeln.json'), '--ersetzen']),
      umgebung: {
        bestand: {
          congregations: [{ id: C, name: 'Probe' }],
          groups: [{ id: G1, congregation_id: C, name: 'Gruppe 1' }],
          fs_rules: [{ id: 'r-alt', congregation_id: C, grp: null, wd: 6, time: '09:30:00', place: '', monthly: 0, skip_cong: false, aus: [] }],
          weeks: [{ congregation_id: C, start: '2026-08-24' }, { congregation_id: C, start: '2026-08-31' }],
          fs_weeks: [{ congregation_id: C, start: '2026-08-24', data: [] }],
        },
      },
      erwartet: ['DELETE fs_rules', 'POST fs_rules', 'PATCH fs_weeks', 'POST fs_weeks'],
    },
  ],

  'abwesenheiten-importieren.mjs': [
    {
      titel: 'Abwesenheiten einspielen',
      dateien: {
        'Persons_7.5.json': NWS_PERSONEN,
        'AwayPeriods_7.5.json': [{ a: 101, b: '2099-01-01', c: '2099-01-10' }],
        'UnavailablePeriods_7.5.json': [{ a: '7-1', b: '2099-02-01', c: '2099-02-03' }],
      },
      fahren: (m, d) => m.main!(['--daten', d, '--ab', '2026-01-01', '--auch-unverfuegbar']),
      umgebung: {
        bestand: {
          congregations: [{ id: C }],
          persons: [{ id: NWS_PERSON, congregation_id: C, fn: 'Probe', ln: 'Eins' }],
        },
      },
      erwartet: ['GET persons', 'GET absences', 'POST absences'],
    },
  ],

  'treffpunkte-importieren.mjs': [
    {
      titel: 'Treffpunkte und Leiter',
      dateien: {
        'Persons_7.5.json': NWS_PERSONEN,
        'FieldServiceMeetings_7.5.json': [
          { ID: 1, a: '2026-08-25T09:30:00', g: 1, h: 101 },
          { ID: 2, a: '2026-09-01T09:30:00', g: 1, h: 101 },
        ],
        'FieldServiceLocations_7.5.json': [{ ID: 1, a: 'Probe-Ort' }],
      },
      fahren: (m, d) => m.main!(['--daten', d]),
      umgebung: {
        bestand: {
          congregations: [{ id: C, hall: 'Probe-Saal' }],
          persons: [{ id: NWS_PERSON, congregation_id: C, fn: 'Probe', ln: 'Eins' }],
          weeks: [{ congregation_id: C, start: '2026-08-24' }, { congregation_id: C, start: '2026-08-31' }],
          fs_weeks: [{ congregation_id: C, start: '2026-08-24', data: [] }],
        },
      },
      erwartet: ['PATCH fs_weeks', 'POST fs_weeks'],
    },
  ],

  'wochenplanung-importieren.mjs': [
    {
      titel: 'Zuteilungen einspielen',
      dateien: {
        'Persons_7.5.json': NWS_PERSONEN,
        'CLMAssignments_7.5.json': [],
        'WeekendMeetingSchedules_7.5.json': [],
        'Assignments_7.5.json': [],
        // Montag = Zusammenkunft unter der Woche; 34 = Mikrofone, Position 1.
        'Duties_7.5.json': [{ a: '2026-08-24', b: 1, c: 34 }],
        'FieldServiceGroups_7.5.json': [],
      },
      fahren: (m, d) => m.main!(['--daten', d]),
      umgebung: {
        bestand: {
          congregations: [{ id: C }],
          persons: [{ id: NWS_PERSON, congregation_id: C, fn: 'Probe', ln: 'Eins' }],
          weeks: [{ congregation_id: C, start: '2026-08-24', data: probeWoche('2026-08-24') }],
          services: [{ congregation_id: C, key: 'mik', name: 'Mikrofone' }],
        },
      },
      erwartet: ['GET persons', 'GET weeks', 'GET services', 'PATCH weeks'],
    },
  ],

  'versammlung-zuruecksetzen.mjs': [
    {
      titel: 'zurücksetzen und neu einspielen',
      dateien: {
        'personen.sql': [
          `insert into public.groups (id, congregation_id, name, position) values ('${G1}', (select id from public.congregations limit 1), 'Gruppe 1', 0);`,
          `insert into public.persons (id, congregation_id, fn, ln, role, female, tel, mail, priv, grp, fam) values ('${P1}', (select id from public.congregations limit 1), 'Probe', 'Eins', 'aeltester', false, '', '', '{"gebet":true}'::jsonb, '${G1}', '${H1}');`,
          `insert into public.persons (id, congregation_id, fn, ln, role, female, tel, mail, priv, grp, fam) values ('${P2}', (select id from public.congregations limit 1), 'Probe', 'Zwei', 'verkuendiger', true, '', '', '{}'::jsonb, '${G1}', '${H1}');`,
          `update public.groups set overseer_id = '${P1}', assistant_id = '${P2}' where id = '${G1}';`,
        ].join('\n'),
      },
      fahren: (m, d) => m.main!(['--sql', path.join(d, 'personen.sql')]),
      umgebung: {
        bestand: {
          congregations: [{ id: C }],
          persons: [{ id: P_ALT, congregation_id: C, fn: 'Probe', ln: 'Eins' }],
          members: [{ user_id: U1, congregation_id: C, email: 'planer@probe.invalid', person_id: P_ALT, planner: true }],
          invites: [{ id: k(61), congregation_id: C, code: 'PRBCDE', person_id: P_ALT, planner: false, redeemed_by: null }],
          groups: [{ id: G_ALT, congregation_id: C, name: 'Gruppe 1' }],
          fs_rules: [
            {
              id: 'r-gruppe', congregation_id: C, grp: G_ALT, wd: 3, time: '09:30:00', place: '', monthly: 0,
              skip_cong: true, aus: [], created_at: '2026-09-01T10:00:00+00:00',
            },
          ],
        },
      },
      erwartet: [
        'DELETE weeks', 'DELETE persons', 'DELETE groups', 'DELETE households', 'POST groups', 'POST fs_rules',
        'POST households', 'POST persons', 'PATCH groups', 'PATCH members', 'PATCH invites', 'POST services',
      ],
    },
  ],

  'neuaufbau-fahren.mjs': [
    {
      titel: 'Bestandsaufnahme',
      fahren: (m) => m.bestand!(ATTRAPPE_URL, ATTRAPPE_SCHLUESSEL),
      umgebung: { bestand: { congregations: [{ id: C, name: 'Probe' }] } },
      erwartet: [
        'GET congregations', 'GET persons', 'GET groups', 'GET households', 'GET weeks', 'GET absences',
        'GET fs_weeks', 'GET fs_rules', 'GET invites',
      ],
    },
  ],

  'mandanten-nachweis.mjs': [
    {
      titel: 'beidseitig, mit Schreibproben',
      fahren: (m) => m.main!([]),
      umgebung: {
        konten: [
          { id: U1, email: 'a@probe.invalid' },
          { id: U2, email: 'b@probe.invalid' },
        ],
        env: {
          ...ANON,
          NACHWEIS_A_MAIL: 'a@probe.invalid', NACHWEIS_A_PASS: 'probe',
          NACHWEIS_B_MAIL: 'b@probe.invalid', NACHWEIS_B_PASS: 'probe',
        },
        bestand: {
          congregations: [{ id: C, name: 'Probe A' }, { id: CB, name: 'Probe B' }],
          members: [
            { user_id: U1, congregation_id: C, planner: true, email: 'a@probe.invalid' },
            { user_id: U2, congregation_id: CB, planner: true, email: 'b@probe.invalid' },
          ],
          persons: [
            { id: P1, congregation_id: C, fn: 'Probe', ln: 'A', tel: '' },
            { id: P2, congregation_id: CB, fn: 'Probe', ln: 'B', tel: '' },
          ],
        },
      },
      erwartet: ['GET assignment_log', 'POST persons', 'DELETE persons', 'PATCH persons'],
    },
  ],

  'mitgliedsrechte-probe.mjs': [
    {
      titel: 'Planer und Mitglied',
      fahren: (m) => m.main!(['--versammlung', C]),
      umgebung: {
        konten: [
          { id: U1, email: 'planer@probe.invalid' },
          { id: U2, email: 'mitglied@probe.invalid' },
        ],
        env: {
          ...ANON,
          PROBE_PLANER_MAIL: 'planer@probe.invalid', PROBE_PLANER_PASS: 'probe',
          PROBE_MITGLIED_MAIL: 'mitglied@probe.invalid', PROBE_MITGLIED_PASS: 'probe',
        },
        bestand: {
          congregations: [{ id: C, name: 'Probe' }],
          members: [
            { user_id: U1, congregation_id: C, person_id: P1, planner: true },
            { user_id: U2, congregation_id: C, person_id: P2, planner: false },
          ],
          persons: [
            { id: P1, congregation_id: C, fn: 'Probe', ln: 'Planer', priv: {} },
            { id: P2, congregation_id: C, fn: 'Probe', ln: 'Mitglied', priv: { 'svc:mik': true } },
          ],
          // Ohne Gruppe blieben die Gruppenbesuche (11, 12) ungemessen.
          groups: [{ id: G1, congregation_id: C, name: 'Probe' }],
          weeks: [
            {
              congregation_id: C,
              start: '2026-08-24',
              data: probeWoche(
                '2026-08-24',
                [
                  { name: 'Probe Planer', pid: P1, rolle: 'Vorsitz', bereichsKey: 'vorsitzMid' },
                  { name: 'Probe Mitglied', pid: P2, rolle: 'Gebet', bereichsKey: 'gebet' },
                ],
                { mik: [{ name: 'Probe Planer', pid: P1 }] },
              ),
            },
          ],
        },
        funktionen: { substitute: () => ({ status: 403, json: { error: 'nicht erlaubt' } }) },
      },
      erwartet: [
        'POST confirmations', 'DELETE confirmations', 'POST notifications', 'DELETE notifications',
        'POST absences', 'DELETE absences', 'GET persons',
        // T120: die Anlage des Planers, die Versuche des Mitglieds, das Aufräumen.
        'POST gruppenbesuche', 'GET gruppenbesuche', 'DELETE gruppenbesuche',
        'POST oz_termine', 'POST oz_eintraege', 'DELETE oz_eintraege', 'DELETE oz_termine', 'PATCH persons',
        'POST vortraege_auswaerts', 'GET vortraege_auswaerts', 'PATCH vortraege_auswaerts', 'DELETE vortraege_auswaerts',
        'POST plaene', 'GET plaene', 'DELETE plaene', 'POST plan_eintraege', 'GET plan_eintraege', 'DELETE plan_eintraege',
        'POST households', 'DELETE households', 'POST persons', 'DELETE persons',
        // (6) und (6b): der Meldeweg eines Mitglieds seit dem 24.9.2026.
        'POST rpc/notify_planners',
      ],
    },
  ],
}

/** Skripte, die mit der Datenbank reden, aber keinen Lauf brauchen — mit Begründung. */
const AUSNAHMEN: Record<string, string> = {
  'schluessel-setzen.mjs':
    'fragt nur die Wurzel `rest/v1/` ab, um den Schlüssel am Projekt zu prüfen — keine Tabelle, keine Spalte',
}

describe('Jeder REST-Aufruf der Wartungsskripte passt zu schema.sql', () => {
  it('die Probe greift überhaupt', () => {
    // Fände das Muster die Blöcke nicht, gingen alle Läufe leer und grün durch.
    // Deshalb an drei Stellen, dass es Spalten samt ihrer Art erkennt: Pflicht,
    // `null`, und eine Spalte, die erst per `alter table` dazukommt.
    expect(schemaSpalten('fs_rules').get('id')).toMatchObject({ typ: 'text', nullbar: false, pflicht: true })
    expect(schemaSpalten('fs_rules').get('grp')).toMatchObject({ typ: 'uuid', nullbar: true, pflicht: false })
    expect(schemaSpalten('persons').get('grp')).toMatchObject({ typ: 'uuid', nullbar: true })
  })

  it('ein Funktionsaufruf passt nur mit der Funktion und genau ihren Parametern', () => {
    // Sonst gälte ein vertippter Parameter — bei PostgREST ein 404 — wie bei
    // den Spalten als Abweisung.
    expect(schemaFunktion('notify_planners')).toEqual(new Map([['kind', 'text'], ['subject', 'text'], ['message', 'text']]))
    const aufruf = (body: unknown, pfad = 'rpc/notify_planners'): Aufruf => ({ pfad, method: 'POST', body })
    expect(schemaFehler(aufruf({ kind: 'verhindert', subject: 'x', message: '' }))).toEqual([])
    expect(schemaFehler(aufruf({ kind: 'verhindert', subject: 'x' }))).toEqual(['POST rpc/notify_planners.message: Parameter fehlt'])
    expect(schemaFehler(aufruf({ kind: 'verhindert', subject: 'x', message: '', title: 'y' }))).toEqual([
      'POST rpc/notify_planners.title: keinen solchen Parameter',
    ])
    expect(schemaFehler(aufruf({}, 'rpc/gibt_es_nicht'))).toEqual(['POST rpc/gibt_es_nicht: keine Funktion in schema.sql'])
  })

  it('jedes Skript mit Datenbankzugriff hat einen Lauf oder eine begründete Ausnahme', () => {
    const skripte = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.mjs') && f !== 'gemeinsam.mjs')
      .filter((f) => REDET_MIT_DB.test(fs.readFileSync(path.join(dir, f), 'utf8')))
    expect(skripte.length, 'die Erkennung findet kaum noch Skripte').toBeGreaterThan(9)
    const bedacht = [...Object.keys(LAEUFE), ...Object.keys(AUSNAHMEN)]
    expect(skripte.filter((f) => !bedacht.includes(f)), 'redet mit der Datenbank, fährt hier aber nicht').toEqual([])
    expect(bedacht.filter((f) => !skripte.includes(f)), 'steht hier, redet aber nicht (mehr) mit der Datenbank').toEqual([])
    expect(Object.values(AUSNAHMEN).filter((g) => g.length < 20)).toEqual([])
  })

  const faelle = Object.entries(LAEUFE).flatMap(([skript, laeufe]) => laeufe.map((lauf) => [`${skript} — ${lauf.titel}`, skript, lauf] as const))

  it.each(faelle)('%s', async (_name, skript, lauf) => {
    const laden = MODULE[`./${skript}`]
    expect(laden, `${skript} fehlt im Verzeichnis`).toBeTypeOf('function')
    const modul = (await laden!()) as Record<string, (...a: unknown[]) => Promise<unknown>>
    const eingaben = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-probe-'))
    try {
      for (const [name, inhalt] of Object.entries(lauf.dateien ?? {})) {
        fs.writeFileSync(path.join(eingaben, name), typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt))
      }
      const { aufrufe } = await fahre(() => lauf.fahren(modul, eingaben), lauf.umgebung)
      const erreicht = new Set(aufrufe.map((a) => `${a.method} ${tabelleVon(a)}`))
      expect(lauf.erwartet.filter((e) => !erreicht.has(e)), 'diese Aufrufe hat der Lauf nicht erreicht').toEqual([])
      expect(befunde(aufrufe)).toEqual([])
    } finally {
      fs.rmSync(eingaben, { recursive: true, force: true })
    }
  })
})

describe('Die RLS-Proben zählen eine kaputte Anfrage nicht als Abweisung', () => {
  /*
    Bis zum 26.9.2026 hieß bei beiden jeder Fehlerstatus „abgewiesen" — der
    400 auf eine vertippte Spalte bestand jede Fremd-Probe. Die Regel steht
    jetzt in `anfrageKaputt` (gemeinsam.mjs) und ist dort und in den
    Bewertungsfunktionen geprüft; hier geht es um den **Weg** durch die Probe:
    was sie ausgibt, und was sie danach noch schreibt. Dieselben Läufe wie
    oben, nur mit einer gestörten Antwort.
  */
  const lauf = (skript: string): Lauf => LAEUFE[skript]![0]!
  const kaputt = { status: 400, json: { code: 'PGRST204', message: 'Could not find the column' } }
  const fahreGestoert = async (skript: string, stoerung: NonNullable<Umgebung['stoerung']>) => {
    const modul = (await MODULE[`./${skript}`]!()) as Record<string, (...a: unknown[]) => Promise<unknown>>
    const l = lauf(skript)
    return fahre(() => l.fahren(modul, ''), { ...l.umgebung, stoerung })
  }

  it('mitgliedsrechte-probe: ein 400 auf den Schreibversuch heißt „PROBE KAPUTT", nicht „greift"', async () => {
    const { ausgabe } = await fahreGestoert('mitgliedsrechte-probe.mjs', (a) =>
      a.method === 'POST' && tabelleVon(a) === 'confirmations' ? kaputt : undefined,
    )
    const text = ausgabe.join('\n')
    expect(text).toMatch(/\(1\) Bestätigung auf eine fremde Aufgabe.*\n.*PROBE KAPUTT — Schreiben scheiterte \(HTTP 400\)/)
    expect(text).not.toMatch(/task_gehoert_mir greift/)
    expect(text).toMatch(/Nicht gemessen — die Probe selbst scheiterte: \(1\), \(2\), \(5\)/)
  })

  it('mitgliedsrechte-probe: scheitert nur das Nachsehen, wird trotzdem aufgeräumt', async () => {
    const { ausgabe, aufrufe } = await fahreGestoert('mitgliedsrechte-probe.mjs', (a) =>
      a.method === 'GET' && a.pfad.startsWith('absences?select=id,person_id') ? kaputt : undefined,
    )
    expect(ausgabe.join('\n')).toMatch(/\(7\) Abwesenheit auf eine fremde Person.*\n.*Nachsehen scheiterte \(HTTP 400\)/)
    // Die Zeile kann angekommen sein, obwohl niemand nachsehen konnte.
    expect(aufrufe.filter((a) => a.method === 'DELETE' && tabelleVon(a) === 'absences').length).toBeGreaterThan(1)
  })

  /** Die Probe mit einer Zusage, die schon vor ihr in der App stand. */
  const mitZusage = async (zusage: Record<string, unknown>, stoerung: NonNullable<Umgebung['stoerung']>) => {
    const l = lauf('mitgliedsrechte-probe.mjs')
    const modul = (await MODULE['./mitgliedsrechte-probe.mjs']!()) as Record<string, (...a: unknown[]) => Promise<unknown>>
    const bestand = { ...l.umgebung!.bestand, confirmations: [zusage] }
    return fahre(() => l.fahren(modul, ''), { ...l.umgebung, bestand, stoerung })
  }
  const probewoche = () => {
    const w = lauf('mitgliedsrechte-probe.mjs').umgebung!.bestand!.weeks![0]!
    return { ...(w.data as Record<string, unknown>), start: w.start }
  }

  it('mitgliedsrechte-probe: steht die eigene Zusage schon in der App, bleibt sie stehen', async () => {
    // (5) schreibt dieselbe Zeile noch einmal und bekommt 409. Die Zusage ist
    // echt, nicht von der Probe — bis zum 26.9.2026 räumte sie sie trotzdem als
    // „vorsorglich" weg.
    const eigen = eigeneSlots(probewoche(), P2)[0]!
    const zusage = { id: k(81), congregation_id: C, user_id: U2, task_key: eigen.key, status: 'bestätigt' }
    const { ausgabe, tabellen } = await mitZusage(zusage, (a) =>
      a.method === 'POST' && tabelleVon(a) === 'confirmations' && (a.body as { task_key?: string }).task_key === eigen.key
        ? { status: 409, json: { code: '23505' } }
        : undefined,
    )
    expect(ausgabe.join('\n')).toMatch(/\(5\) eigene Aufgabe bestätigen.*\n.*PROBE KAPUTT — Schreiben scheiterte \(HTTP 409\)/)
    expect(tabellen.confirmations).toContainEqual(zusage)
  })

  it('mitgliedsrechte-probe: die echte Zusage des Zuständigen ist kein Loch', async () => {
    // Fall (1): Der Planer hat seinen Hilfsdienst in der App bestätigt, das
    // Mitglied wird abgewiesen. Gezählt wurde bis zum 26.9.2026 jede Zeile auf
    // der Aufgabe — und die Probe meldete „S2 STEHT NOCH OFFEN".
    const dienst = fremdeSlots(probewoche(), P2).find((s: { art: string }) => s.art.startsWith('Hilfsdienst'))!
    const zusage = { id: k(82), congregation_id: C, user_id: U1, task_key: dienst.key, status: 'bestätigt' }
    const { ausgabe, tabellen } = await mitZusage(zusage, (a) =>
      a.method === 'POST' && tabelleVon(a) === 'confirmations' ? { status: 403, json: { code: '42501' } } : undefined,
    )
    const text = ausgabe.join('\n')
    expect(text).toMatch(/\(1\) Bestätigung auf eine fremde Aufgabe.*\n.*abgewiesen — task_gehoert_mir greift/)
    expect(text).not.toMatch(/S2 STEHT NOCH OFFEN/)
    expect(tabellen.confirmations).toContainEqual(zusage)
  })

  it('mitgliedsrechte-probe: (2) hält die Zusage des Planers nicht für den eigenen Versuch', async () => {
    // Der Planer hat seinen Vorsitz in der App zugesagt. Bis zum 27.9.2026
    // schrieb (2) genau auf diesen Platz, fand die echte Zeile, meldete
    // „AUCH DAS!" und löschte sie beim Aufräumen.
    const vorsitz = fremdeSlots(probewoche(), P2).find((s: { art: string }) => s.art === 'Programm')!
    const zusage = { id: k(83), congregation_id: C, user_id: U1, task_key: vorsitz.key, status: 'bestätigt' }
    const { ausgabe, tabellen, aufrufe } = await mitZusage(zusage, (a) =>
      a.method === 'POST' && tabelleVon(a) === 'confirmations' ? { status: 403, json: { code: '42501' } } : undefined,
    )
    // Nur die Zeile nach (2): „AUCH DAS!" meldet in der Attrappe auch (4), sie
    // kennt keine Richtlinien.
    expect(ausgabe.join('\n')).toMatch(/\(2\) eine eigene Aufgabe im Namen des Planers.*\n.*nicht angekommen \(HTTP 403\) — die Grenze greift hier/)
    expect(tabellen.confirmations).toContainEqual(zusage)
    // Geschrieben wird auf die eigene Aufgabe des Mitglieds: Die besteht
    // `task_gehoert_mir`, abweisen kann nur noch `user_id = auth.uid()`.
    const versuch = aufrufe.find((a) => a.method === 'POST' && tabelleVon(a) === 'confirmations' && (a.body as { user_id?: string }).user_id === U1)
    expect(versuch?.body).toMatchObject({ task_key: eigeneSlots(probewoche(), P2)[0]!.key })
  })

  it('mitgliedsrechte-probe: steht der Planer schon auf jeder eigenen Aufgabe, misst (2) nicht', async () => {
    // Eine alte Zeile des Planers auf der Aufgabe des Mitglieds, etwa von einem
    // früheren Zuständigen. Nachsehen fände sie, Aufräumen löschte sie — also
    // schreibt (2) gar nicht erst.
    const eigen = eigeneSlots(probewoche(), P2)[0]!
    const zusage = { id: k(84), congregation_id: C, user_id: U1, task_key: eigen.key, status: 'bestätigt' }
    const { ausgabe, tabellen, aufrufe } = await mitZusage(zusage, () => undefined)
    expect(ausgabe.join('\n')).toMatch(/\? \(2\) eine eigene Aufgabe im Namen des Planers — auf jeder steht schon eine Zeile des Planers, nicht gemessen/)
    expect(tabellen.confirmations).toContainEqual(zusage)
    expect(aufrufe.filter((a) => a.method === 'POST' && tabelleVon(a) === 'confirmations' && (a.body as { user_id?: string }).user_id === U1)).toEqual([])
  })

  /*
    T120 (seit 3.10.2026): Die Probe legt als Planer an, was sie misst, und
    ändert für (15)/(16) und (32) vorübergehend die Person des Mitglieds. Die
    Attrappe kennt keine Richtlinien — jeder Versuch kommt dort durch. Gerade
    deshalb läuft hier jeder Aufräum-Zweig, und am Ende muss alles weg sein.
  */
  const istProbe = (z: Record<string, unknown>) => String(z.id ?? '').startsWith('PROBE-')

  it('mitgliedsrechte-probe (T120): räumt alles weg, was es angelegt hat — die Person des Mitglieds ist wie vorher', async () => {
    const { tabellen, ausgabe, aufrufe } = await fahreGestoert('mitgliedsrechte-probe.mjs', () => undefined)
    for (const t of ['gruppenbesuche', 'oz_termine', 'oz_eintraege', 'vortraege_auswaerts', 'plaene', 'plan_eintraege']) {
      expect((tabellen[t] ?? []).filter(istProbe), t).toEqual([])
    }
    expect((tabellen.confirmations ?? []).filter((z) => String(z.task_key).includes('PROBE-'))).toEqual([])
    expect(tabellen.persons!.filter((p) => p.fn === 'PROBE'), 'Probe-Person blieb liegen').toEqual([])
    expect(tabellen.households ?? [], 'Probe-Haushalt blieb liegen').toEqual([])
    const mitglied = tabellen.persons!.find((p) => p.id === P2)!
    expect(mitglied.priv).toEqual({ 'svc:mik': true })
    expect(mitglied.fam ?? null).toBeNull()
    // Bezogen war der Probe-Haushalt aber — sonst hätte (32) nichts gemessen.
    expect(aufrufe.some((a) => a.method === 'PATCH' && tabelleVon(a) === 'persons' && typeof (a.body as { fam?: unknown }).fam === 'string')).toBe(true)
    const text = ausgabe.join('\n')
    expect(text).toMatch(/\(15\) sich selbst eintragen, mit Aufgabenbereich\n.*ANGEKOMMEN \(HTTP 201\) — der Weg steht offen/)
    expect(text).toMatch(/\(32\) „Familien reihum", Gastgeber aus dem eigenen Haushalt \(Probe-Haushalt\)\n.*SICHTBAR \(HTTP 200; Plan 1\/1, Einträge 1\/1\)/)
    expect(text).toMatch(/alles mit Kennzeichen PROBE-\d+ wieder entfernt/)
  })

  it('mitgliedsrechte-probe (T120): (13)–(15) mit Aufgabenbereich, (16) ohne — jeder Versuch prüft genau eine Regel', async () => {
    const { aufrufe } = await fahreGestoert('mitgliedsrechte-probe.mjs', () => undefined)
    const setzt = (wert: boolean) =>
      aufrufe.findIndex((a: Aufruf) => a.method === 'PATCH' && tabelleVon(a) === 'persons' && (a.body as { priv?: { zeugnis?: boolean } }).priv?.zeugnis === wert)
    const versuch = (endung: string) =>
      aufrufe.findIndex((a: Aufruf) => a.method === 'POST' && tabelleVon(a) === 'oz_eintraege' && String((a.body as { id?: string }).id).endsWith(endung))
    expect(setzt(true)).toBeGreaterThan(-1)
    for (const e of ['-oz-fuer-andere', '-oz-als-zugeteilt', '-oz-selbst']) {
      expect(versuch(e), e).toBeGreaterThan(setzt(true))
      expect(versuch(e), e).toBeLessThan(setzt(false))
    }
    expect(versuch('-oz-ohne-bereich')).toBeGreaterThan(setzt(false))
  })

  it('mitgliedsrechte-probe: die Absage geht über notify_planners an die Planer, und sie wird wieder gelöscht', async () => {
    // Bis zum 3.10.2026 schrieb (6) die Mitteilung selbst — die Richtlinie
    // lässt das seit dem 24.9.2026 nur Planern, und die Probe meldete
    // „ZU STRENG", obwohl die App längst den anderen Weg geht.
    const { ausgabe, aufrufe, tabellen } = await fahreGestoert('mitgliedsrechte-probe.mjs', () => undefined)
    const text = ausgabe.join('\n')
    expect(text).toMatch(/\(6\) Absage an die Planer über notify_planners \(der legitime Weg\)\n.*ANGEKOMMEN \(HTTP 204\) — kommt an/)
    expect(aufrufe.some((a) => a.method === 'POST' && tabelleVon(a) === 'notifications' && (a.body as { title?: string }).title?.includes('Absage'))).toBe(false)
    expect((tabellen.notifications ?? []).filter((z) => String(z.title).startsWith('PROBE-'))).toEqual([])
  })

  it('mitgliedsrechte-probe: (6b) zählt nur die Ausnahme von notify_planners als Abweisung', async () => {
    const nurVerhinderung = { status: 400, json: { code: 'P0001', message: 'nur eine Verhinderung darf jedes Mitglied melden' } }
    const zuteilung = (a: Aufruf) => tabelleVon(a) === 'rpc/notify_planners' && (a.body as { kind?: string }).kind === 'zuteilung'
    const abgewiesen = await fahreGestoert('mitgliedsrechte-probe.mjs', (a) => (zuteilung(a) ? nurVerhinderung : undefined))
    expect(abgewiesen.ausgabe.join('\n')).toMatch(/\(6b\) dieselbe Meldung als Art „zuteilung" \(nur Planer\)\n.*nicht angekommen \(HTTP 400\) — abgewiesen — notify_planners reicht nur Verhinderungen weiter/)
    // Gibt es die Funktion nicht (404), ist nichts gemessen.
    const fehlt = await fahreGestoert('mitgliedsrechte-probe.mjs', (a) => (zuteilung(a) ? { status: 404, json: { code: 'PGRST202' } } : undefined))
    expect(fehlt.ausgabe.join('\n')).toMatch(/\(6b\) dieselbe Meldung als Art „zuteilung" \(nur Planer\)\n.*PROBE KAPUTT — Schreiben scheiterte \(HTTP 404\)/)
  })

  it('mitgliedsrechte-probe: fehlt die Freischaltung für den Dienst, gibt (9) sie vorübergehend — und nimmt sie wieder', async () => {
    // Sonst wiese `take` mit „not-qualified" ab, und über S13 wäre nichts
    // gesagt — so blieb (9) in der Testversammlung am 3.10.2026 ungemessen.
    const l = lauf('mitgliedsrechte-probe.mjs')
    const modul = (await MODULE['./mitgliedsrechte-probe.mjs']!()) as Record<string, (...a: unknown[]) => Promise<unknown>>
    const persons = l.umgebung!.bestand!.persons!.map((p) => (p.id === P2 ? { ...p, priv: {} } : p))
    const { ausgabe, aufrufe, tabellen } = await fahre(() => l.fahren(modul, ''), { ...l.umgebung, bestand: { ...l.umgebung!.bestand, persons } })
    const priv = (a: Aufruf) => (a.method === 'PATCH' && tabelleVon(a) === 'persons' ? (a.body as { priv?: Record<string, unknown> }).priv : undefined)
    expect(aufrufe.some((a) => priv(a)?.['svc:mik'] === true)).toBe(true)
    expect(ausgabe.join('\n')).toMatch(/\(9\) fremden Platz übernehmen, ohne dass Ersatz gesucht ist \(Probe Planer; für „mik" vorübergehend freigeschaltet\)/)
    expect(tabellen.persons!.find((p) => p.id === P2)!.priv).toEqual({})
  })

  it('mitgliedsrechte-probe (T120): sind Planer und Mitglied ein Ehepaar, nimmt (30) jemand anderen als Gastgeber', async () => {
    // So ist die Testversammlung angelegt (gemessen am 3.10.2026): Der Planer
    // als „fremder" Gastgeber stünde im Haushalt des Mitglieds, und (30) blieb
    // ungemessen.
    const l = lauf('mitgliedsrechte-probe.mjs')
    const modul = (await MODULE['./mitgliedsrechte-probe.mjs']!()) as Record<string, (...a: unknown[]) => Promise<unknown>>
    const P3 = k(34)
    const bestand = {
      ...l.umgebung!.bestand,
      households: [{ id: H1, congregation_id: C }],
      persons: [
        { id: P1, congregation_id: C, fn: 'Probe', ln: 'Planer', priv: {}, fam: H1 },
        { id: P2, congregation_id: C, fn: 'Probe', ln: 'Mitglied', priv: { 'svc:mik': true }, fam: H1 },
        { id: P3, congregation_id: C, fn: 'Probe', ln: 'Dritte', priv: {} },
      ],
    }
    const { ausgabe, aufrufe } = await fahre(() => l.fahren(modul, ''), { ...l.umgebung, bestand })
    const text = ausgabe.join('\n')
    expect(text).toMatch(/\(30\) „Familien reihum" ohne eigenen Haushalt \(anderer Haushalt\)\n/)
    // (32) findet den Planer als Mitbewohner — kein Probe-Haushalt nötig.
    expect(text).toMatch(/\(32\) „Familien reihum", Gastgeber aus dem eigenen Haushalt \(vorhandener Haushalt\)/)
    expect(aufrufe.filter((a) => a.method === 'POST' && tabelleVon(a) === 'households')).toEqual([])
    const eintraege = aufrufe.filter((a) => a.method === 'POST' && tabelleVon(a) === 'plan_eintraege').flatMap((a) => a.body as Record<string, unknown>[])
    expect(eintraege.find((e) => String(e.id).endsWith('-e-fremd'))?.person_id).toBe(P3)
  })

  it('mitgliedsrechte-probe (T120): scheitert die Anlage, heißt das „PROBE KAPUTT", nicht „unsichtbar"', async () => {
    // Ohne Plan gibt es nichts zu sehen — eine leere Antwort wäre sonst die
    // Grenze, die greift.
    const { ausgabe, tabellen } = await fahreGestoert('mitgliedsrechte-probe.mjs', (a) =>
      a.method === 'POST' && tabelleVon(a) === 'plaene' ? kaputt : undefined,
    )
    const text = ausgabe.join('\n')
    expect(text).toMatch(/\(28\) einen Plan im Entwurf sehen\n.*PROBE KAPUTT — Anlage als Planer scheiterte \(plaene, HTTP 400\)/)
    expect(text).not.toMatch(/unsichtbar — einen Entwurf sehen nur Planer/)
    expect(text).toMatch(/Nicht gemessen — die Probe selbst scheiterte: .*\(28\), \(29\), \(30\), \(31\)/)
    // Aufgeräumt wird trotzdem — der Termin des Zeugnisgebens stand ja schon.
    expect((tabellen.oz_termine ?? []).filter(istProbe)).toEqual([])
  })

  it('mandanten-nachweis: ein 400 auf den Einfügeversuch heißt „PROBE KAPUTT", nicht „abgewiesen"', async () => {
    const { ausgabe } = await fahreGestoert('mandanten-nachweis.mjs', (a) =>
      a.method === 'POST' && tabelleVon(a) === 'persons' ? kaputt : undefined,
    )
    const text = ausgabe.join('\n')
    expect(text).toMatch(/persons einfügen +→ PROBE KAPUTT \(400\)/)
    expect(text).not.toMatch(/abgewiesen \(400\)/)
  })

  it('mandanten-nachweis: der Einfügeversuch schreibt ohne RETURNING und sieht beim Ziel nach', async () => {
    // Die Attrappe kennt keine Richtlinien — der Versuch kommt also durch, und
    // genau das soll die Probe dann sagen und wieder wegräumen.
    const { ausgabe, aufrufe, tabellen } = await fahreGestoert('mandanten-nachweis.mjs', () => undefined)
    const einfuegen = aufrufe.filter((a) => a.method === 'POST' && tabelleVon(a) === 'persons')
    expect(einfuegen.length).toBe(2) // A → B und B → A
    for (const a of einfuegen) {
      expect(a.prefer, 'mit RETURNING geschrieben').toBe('return=minimal')
      const id = (a.body as { id?: string }).id
      expect(aufrufe.some((x) => x.method === 'GET' && x.pfad.startsWith(`persons?select=id&id=eq.${id}`))).toBe(true)
    }
    const text = ausgabe.join('\n')
    expect(text).toMatch(/persons einfügen +→ DURCHGELASSEN — die Zeile liegt in der anderen Versammlung/)
    expect(text).toMatch(/\(die eingefügte Zeile .+ wurde sofort wieder gelöscht\)/)
    expect((tabellen.persons ?? []).filter((p) => p.fn === 'NACHWEIS'), 'Probezeile blieb liegen').toEqual([])
  })

  it('mandanten-nachweis: ein 403 heißt abgewiesen, und nichts bleibt liegen', async () => {
    const { ausgabe, aufrufe, tabellen } = await fahreGestoert('mandanten-nachweis.mjs', (a) =>
      a.method === 'POST' && tabelleVon(a) === 'persons' ? { status: 403, json: { code: '42501' } } : undefined,
    )
    expect(ausgabe.join('\n')).toMatch(/persons einfügen +→ abgewiesen \(403\)/)
    expect(aufrufe.filter((a) => a.method === 'DELETE')).toEqual([])
    expect((tabellen.persons ?? []).filter((p) => p.fn === 'NACHWEIS')).toEqual([])
  })

  it('mandanten-nachweis: ist der vorhandene Wert nicht lesbar, wird nichts geändert', async () => {
    const { ausgabe, aufrufe } = await fahreGestoert('mandanten-nachweis.mjs', (a) =>
      a.method === 'GET' && a.pfad.startsWith('persons?select=tel') ? kaputt : undefined,
    )
    expect(ausgabe.join('\n')).toMatch(/persons ändern +→ nicht versucht: vorhandener Wert nicht lesbar \(400\)/)
    // Hier ging vorher `tel: ''` hinaus — bei einem Loch in der Richtlinie
    // wäre die echte Nummer einer Person der anderen Versammlung weg gewesen.
    expect(aufrufe.filter((a) => a.method === 'PATCH')).toEqual([])
  })
})
