/**
 * Demo-Daten, 1:1 aus dem Prototyp portiert (docs/design-handoff/design/
 * Prototyp 2a v3.dc.html). Namen und Wochen sind Platzhalter — das Modell
 * und die Regeln darunter sind verbindlich. Ersetzt später Persistenz/Backend.
 */

import { buildFsWeeks } from './fs'
import { normalizeChairKeys, serviceQualKey } from './helpers'
import type {
  Absence,
  FsInstance,
  FsRule,
  Group,
  MyTask,
  Notification,
  PartItem,
  Person,
  QualificationKey,
  Reminders,
  Role,
  Section,
  SectionColor,
  Service,
  SlotAssignment,
  SongItem,
  Week,
} from './types'

/** Bereich der Ordner, die beim Gedächtnismahl die Symbole herumreichen. */
const ORD = serviceQualKey('ord')

/** Angemeldete Demo-Person (Simon Krüger) — steuert den "DU"-Chip. */
export const CURRENT_PERSON_ID = 'p9'

/** Demo-Rechte: Prototyp zeigt Simon als Koordinator (volle Navigation). */
export const DEMO_PLANNER = true

export const CONGREGATION = {
  name: 'Musterstadt',
  hall: 'Hauptstraße 12',
  meetings: 'Di 19:00 · So 10:00',
} as const

/** Fußzeile Programm ("Stand: …") — Demo-Wert aus dem Prototyp. */
export const PROGRAM_AS_OF = '4. September'

export const WORKBOOK_LABEL = 'Arbeitsheft Sep/Okt 2026'

/* ---- Personen ---------------------------------------------------------- */

/**
 * Kurzschreibweise für ein Bereichsprofil. Nimmt die sprechenden Alt-Namen
 * (`lesen`, `mikrofon`, `ordner` …) und bildet sie auf das aktuelle Schema ab:
 * feste Programm-Bereiche direkt, Hilfsdienste auf ihren Dienst-Bereich
 * (`ordner` deckt alle drei Ordner-Dienste ab).
 */
const q = (
  on: ReadonlyArray<QualificationKey | 'vorsitz' | 'lesen' | 'mikrofon' | 'ton' | 'ordner' | 'zoomordner'>,
): Person['priv'] => {
  const has = (key: string) => (on as readonly string[]).includes(key)
  const ordner = has('ordner')
  const vorsitz = has('vorsitz')
  return {
    vorsitzMid: vorsitz,
    vorsitzWe: vorsitz,
    vortrag: has('vortrag'),
    gebet: has('gebet'),
    bibellesung: has('bibellesung') || has('lesen'),
    leser: has('leser') || has('lesen'),
    schulung: has('schulung'),
    studium: has('studium'),
    [serviceQualKey('ton')]: has('ton'),
    [serviceQualKey('mik')]: has('mikrofon'),
    [serviceQualKey('zoom')]: has('zoomordner'),
    [serviceQualKey('ord')]: ordner,
    [serviceQualKey('saal')]: ordner,
    [serviceQualKey('rund')]: ordner,
  }
}

/* ---- Größere Demo-Versammlung (~100 Personen) ---------------------------
 * Zusätzliche Personen mit eindeutigen Anzeigenamen — die Nachnamen kollidieren
 * weder mit den 16 Stammpersonen noch mit externen Namen in den Wochen. So lässt
 * sich die Auto-Zuteilung realistisch mit vielen Kandidaten testen/vorführen.
 */

const XFN_M = ['Andreas', 'Bernd', 'Christian', 'Daniel', 'Erik', 'Frank', 'Gerd', 'Hans', 'Ingo', 'Jens', 'Karl', 'Lars', 'Martin', 'Norbert', 'Oliver', 'Peter', 'Rainer', 'Stefan', 'Uwe', 'Volker', 'Werner', 'Dieter', 'Ralf', 'Sven']
const XFN_F = ['Anna', 'Birgit', 'Claudia', 'Doris', 'Eva', 'Gisela', 'Heike', 'Inge', 'Julia', 'Karin', 'Laura', 'Maria', 'Nina', 'Petra', 'Rita', 'Sabine', 'Ursula', 'Vera', 'Anja', 'Beate', 'Carmen', 'Diana', 'Elke', 'Franziska']
const XLN = ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Becker', 'Schulz', 'Koch', 'Bauer', 'Richter', 'Wolf', 'Schäfer', 'Zimmermann', 'Braun', 'Krause', 'Hofmann', 'Werner', 'Schmitt', 'Lange', 'Schmitz', 'Meier', 'Walter', 'Weiß', 'Jung', 'Hahn', 'Vogt', 'Keller', 'Frank', 'Böhm', 'Schuster', 'Fuchs', 'Kaiser', 'Lehmann', 'Herrmann', 'König', 'Kraft', 'Beck', 'Lorenz', 'Baumann', 'Franke', 'Ludwig', 'Bergmann', 'Pohl', 'Horn', 'Busch', 'Sauer', 'Arnold', 'Thomas', 'Reuter', 'Sander', 'Voigt', 'Kühn', 'Pfeiffer', 'Engel', 'Berg', 'Riedel', 'Ziegler', 'Dietrich', 'Kolb', 'Huber', 'Kramer', 'Nagel', 'Graf', 'Seidel', 'Ackermann', 'Böttcher', 'Renner', 'Kuhn', 'Bock', 'Hein', 'Schwarz', 'Krebs', 'Franz', 'Beyer', 'Wolff', 'Jäger', 'Schreiber', 'Hansen', 'Marx', 'Ulrich', 'Vetter', 'Adler', 'Wenzel']

/** Qualifikationsprofil je Rotationsrest (gute Abdeckung aller Bereiche). */
function extraProfile(r: number): { role: Role; priv: Person['priv'] } {
  switch (r) {
    case 0:
      return { role: 'aeltester', priv: q(['vorsitz', 'vortrag', 'gebet', 'studium', 'lesen', 'schulung']) }
    case 1:
      return { role: 'dienstamtgehilfe', priv: q(['vortrag', 'gebet', 'lesen', 'schulung', 'mikrofon', 'ordner', 'zoomordner']) }
    case 2:
      return { role: 'dienstamtgehilfe', priv: q(['vortrag', 'gebet', 'lesen', 'mikrofon', 'ton', 'ordner', 'zoomordner']) }
    case 3:
      return { role: 'verkuendiger', priv: q(['mikrofon', 'ton', 'ordner', 'zoomordner']) }
    case 4:
      return { role: 'verkuendiger', priv: q(['mikrofon', 'ordner', 'lesen', 'schulung', 'zoomordner']) }
    default:
      return { role: 'verkuendiger', priv: q(['schulung']) } // Schwestern (Schulungsaufgaben)
  }
}

function buildExtraPersons(): Person[] {
  const out: Person[] = []
  for (let i = 0; i < XLN.length; i++) {
    const r = i % 7
    const female = r >= 5
    const fn = female ? XFN_F[i % XFN_F.length] : XFN_M[i % XFN_M.length]
    const ln = XLN[i]
    const { role, priv } = extraProfile(r)
    const person: Person = {
      id: `p${17 + i}`,
      fn,
      ln,
      role,
      tel: '',
      mail: `${fn}.${ln}@mail.de`.toLowerCase(),
      absent: [],
      priv,
    }
    if (female) person.female = true
    person.grp = `g${1 + (i % 4)}` // reihum auf die vier Gruppen verteilen
    out.push(person)
  }
  return out
}

/** Gruppen-Zuordnung der 16 Stammpersonen (Extras rotieren, s. buildExtraPersons). */
const CORE_GRP: Record<string, string> = {
  p1: 'g1', p6: 'g1', p9: 'g1', p15: 'g1',
  p2: 'g2', p7: 'g2', p10: 'g2', p16: 'g2',
  p3: 'g3', p8: 'g3', p11: 'g3', p12: 'g3',
  p4: 'g4', p5: 'g4', p13: 'g4', p14: 'g4',
}

const CORE_PERSONS: Person[] = [
  { id: 'p1', fn: 'Manfred', ln: 'Albrecht', role: 'aeltester', tel: '+49 171 200 11 22', mail: 'm.albrecht@mail.de', absent: [], priv: { ...q(['vorsitz', 'vortrag', 'gebet', 'studium']), wtLeiter: true } },
  { id: 'p2', fn: 'Thomas', ln: 'Lindner', role: 'aeltester', tel: '+49 160 334 55 21', mail: 't.lindner@mail.de', absent: [], priv: { ...q(['vorsitz', 'vortrag', 'gebet', 'studium']), wtVertreter: true } },
  { id: 'p3', fn: 'Friedrich', ln: 'Neumann', role: 'aeltester', tel: '+49 152 887 90 04', mail: 'f.neumann@mail.de', absent: [], priv: q(['vorsitz', 'vortrag', 'gebet', 'studium']) },
  { id: 'p4', fn: 'Helmut', ln: 'Vogel', role: 'aeltester', tel: '+49 170 445 12 60', mail: 'h.vogel@mail.de', absent: [], priv: q(['vortrag', 'gebet', 'studium']) },
  { id: 'p5', fn: 'Konrad', ln: 'Sommer', role: 'aeltester', tel: '+49 173 511 78 30', mail: 'k.sommer@mail.de', absent: [], priv: q(['vortrag', 'gebet']) },
  { id: 'p6', fn: 'Jonas', ln: 'Berger', role: 'dienstamtgehilfe', tel: '+49 157 665 43 30', mail: 'j.berger@mail.de', absent: [], priv: q(['vortrag', 'gebet', 'lesen', 'schulung', 'mikrofon']) },
  { id: 'p7', fn: 'Paul', ln: 'Schröder', role: 'dienstamtgehilfe', tel: '+49 176 220 89 41', mail: 'p.schroeder@mail.de', absent: [], priv: q(['vortrag', 'gebet', 'lesen', 'schulung', 'mikrofon', 'ordner']) },
  { id: 'p8', fn: 'Claus', ln: 'Maier', role: 'dienstamtgehilfe', tel: '+49 171 908 33 17', mail: 'c.maier@mail.de', absent: [], priv: q(['mikrofon', 'ton', 'ordner']) },
  { id: 'p9', fn: 'Simon', ln: 'Krüger', role: 'verkuendiger', tel: '+49 159 774 21 08', mail: 's.krueger@mail.de', absent: [], priv: q(['lesen', 'schulung', 'mikrofon', 'ton']) },
  { id: 'p10', fn: 'Niklas', ln: 'Feld', role: 'verkuendiger', tel: '+49 162 118 44 92', mail: 'n.feld@mail.de', absent: [1], priv: q(['lesen', 'schulung', 'mikrofon']) },
  { id: 'p11', fn: 'Jörg', ln: 'Roth', role: 'verkuendiger', tel: '+49 155 902 41 77', mail: 'j.roth@mail.de', absent: [3], priv: q(['lesen', 'mikrofon']) },
  { id: 'p12', fn: 'Bernd', ln: 'Klein', role: 'verkuendiger', tel: '+49 176 348 12 09', mail: 'b.klein@mail.de', absent: [], priv: q(['gebet', 'mikrofon']) },
  { id: 'p13', fn: 'Georg', ln: 'Peters', role: 'verkuendiger', tel: '+49 151 668 90 12', mail: 'g.peters@mail.de', absent: [], priv: q(['gebet', 'ordner']) },
  { id: 'p14', fn: 'Ulrich', ln: 'Lang', role: 'verkuendiger', tel: '+49 175 490 55 03', mail: 'u.lang@mail.de', absent: [0], priv: q(['gebet', 'ordner']) },
  { id: 'p15', fn: 'Lena', ln: 'Hoffmann', role: 'verkuendiger', female: true, tel: '+49 151 340 76 55', mail: 'l.hoffmann@mail.de', absent: [], priv: q(['schulung']) },
  { id: 'p16', fn: 'Elke', ln: 'Brandt', role: 'verkuendiger', female: true, tel: '+49 173 662 09 18', mail: 'e.brandt@mail.de', absent: [2], priv: q(['schulung']) },
  ...buildExtraPersons(),
]

// grp der Stammpersonen aus CORE_GRP setzen; Extras haben ihres schon.
export const DEMO_PERSONS: Person[] = CORE_PERSONS.map((p) =>
  p.grp === undefined ? { ...p, grp: CORE_GRP[p.id] ?? null } : p,
)

/* ---- Predigtdienstgruppen ---------------------------------------------- */
// Aufseher (ov) = Älteste p1–p4; Gehilfen (as) = DAG/Verkündiger p6,p7,p8,p13.
export const DEMO_GROUPS: Group[] = [
  { id: 'g1', name: 'Gruppe 1', ov: 'p1', as: 'p6' },
  { id: 'g2', name: 'Gruppe 2', ov: 'p2', as: 'p7' },
  { id: 'g3', name: 'Gruppe 3', ov: 'p3', as: 'p8' },
  { id: 'g4', name: 'Gruppe 4', ov: 'p4', as: 'p13' },
]

/* ---- Zusammenkünfte für den Predigtdienst ("Treffpunkte") --------------- */

/** Montag der Woche 0 (7. September 2026) — Basis der Treffpunkt-Datumsberechnung. */
export const FS_BASE = new Date(2026, 8, 7, 12)

/** Anzahl der Demo-Wochen (buildDemoWeeks) — für die Treffpunkt-Materialisierung. */
const DEMO_WEEK_COUNT = 4

/**
 * Grundplan der Treffpunkte: Versammlungstreffpunkte (grp '') Mo 14:00 + Mi 9:30
 * wöchentlich + jeden 1. Samstag im Monat 9:30; je Gruppe ein Samstagstreffpunkt
 * (skipCong: entfällt, wenn am selben Tag ein Versammlungstreffpunkt liegt).
 */
export const DEMO_FS_RULES: FsRule[] = [
  { id: 'r1', grp: '', wd: 1, time: '14:00', place: 'Königreichssaal', monthly: 0, skipCong: false },
  { id: 'r2', grp: '', wd: 3, time: '09:30', place: 'Königreichssaal', monthly: 0, skipCong: false },
  { id: 'r3', grp: '', wd: 6, time: '09:30', place: 'Königreichssaal', monthly: 1, skipCong: false },
  { id: 'r4', grp: 'g1', wd: 6, time: '09:30', place: 'Bei Familie Albrecht', monthly: 0, skipCong: true },
  { id: 'r5', grp: 'g2', wd: 6, time: '09:15', place: 'Königreichssaal, Nebenraum', monthly: 0, skipCong: true },
  { id: 'r6', grp: 'g3', wd: 6, time: '10:00', place: 'Per Videokonferenz', monthly: 0, skipCong: true },
  { id: 'r7', grp: 'g4', wd: 6, time: '09:30', place: 'Bei Familie Vogel', monthly: 0, skipCong: true },
]

/** Vorbelegte Leiter (Instanz-Id → Anzeigename) über die vier Demo-Wochen. */
const DEMO_FS_SEED: Record<string, string> = {
  '0|r1': 'Thomas Lindner', '0|r2': 'Jonas Berger', '0|r4': 'Manfred Albrecht',
  '0|r5': 'Paul Schröder', '0|r6': 'Friedrich Neumann', '0|r7': 'Helmut Vogel',
  '1|r1': 'Manfred Albrecht', '1|r4': 'Jonas Berger', '1|r5': 'Paul Schröder', '1|r7': 'Georg Peters',
  '2|r2': 'Thomas Lindner', '2|r4': 'Manfred Albrecht', '2|r6': 'Claus Maier', '2|r7': 'Helmut Vogel',
  '3|r1': 'Jonas Berger', '3|r3': 'Simon Krüger',
}

/** Baut die Treffpunkte der Demo-Wochen aus Grundplan + Seed-Leitern. */
export function buildDemoFsWeeks(): FsInstance[][] {
  return buildFsWeeks(FS_BASE, DEMO_WEEK_COUNT, DEMO_FS_RULES, DEMO_FS_SEED)
}

/* ---- Hilfsdienste ------------------------------------------------------- */
// Jeder Dienst hat seinen eigenen Aufgabenbereich (`svc:<key>`) — die drei
// Ordner-Dienste sind also getrennt einstellbar. Der Eingangsordner nutzt den
// Datenkey 'ord' (Rückwärtskompatibilität zur helpers-Struktur der Wochen).
// Zoom-/Saal-/Rundgangsordner haben noch keine Namen in den Demo-Wochen →
// erscheinen als "offen".
export const DEMO_SERVICES: Service[] = [
  { key: 'ton', name: 'Ton / Video', count: 1, groups: false },
  { key: 'mik', name: 'Mikrofone', count: 2, groups: false },
  { key: 'zoom', name: 'Zoom-Ordner', count: 1, groups: false },
  { key: 'ord', name: 'Eingangsordner', count: 1, groups: false },
  { key: 'saal', name: 'Saalordner', count: 1, groups: false },
  { key: 'rund', name: 'Rundgangsordner', count: 1, groups: false },
  { key: 'rein', name: 'Reinigung', count: 1, groups: true },
]

/* ---- Abwesenheiten (eigene) & Mitteilungen ------------------------------ */

export const DEMO_ABSENCES: Absence[] = [
  { id: 'a1', from: '2026-10-12', to: '2026-10-18', reason: 'Urlaub' },
]

export const DEMO_NOTIFICATIONS: Notification[] = [
  { id: 'n1', type: 'zuteilung', title: 'Neue Zuteilung', text: 'Mikrofone · Sonntag, 20. September', time: 'vor 2 Std.', read: false, taskId: 'a2' },
  { id: 'n2', type: 'erinnerung', title: 'Erinnerung', text: 'Gespräche beginnen (informell) · Di, 8. Sep · ca. 19:35', time: 'heute, 08:00', read: false },
  { id: 'n3', type: 'gesendet', title: 'Plan veröffentlicht', text: 'Programm für September ist online', time: 'Montag', read: true },
]

/* ---- Persönliche Aufgaben, Bestätigungs-Status & Erinnerungen ----------- */

/**
 * Dem Nutzer (Simon Krüger) zugeteilte Aufgaben mit Bestätigungs-Status.
 * a1/a2 offen, a3 bereits bestätigt (wie im v3-Prototyp). Schulungsaufgaben
 * und Bibellesung tragen eine S-89-Nutzlast zum Anzeigen des Formulars.
 */
export const DEMO_MY_TASKS: MyTask[] = [
  {
    id: 'a1',
    title: 'Gespräche beginnen (informell)',
    date: 'Di, 8. September · ca. 19:35',
    chip: 'in 4 Tagen',
    status: 'offen',
    s89: { name: 'Simon Krüger', partner: 'M. Ernst', date: 'Di, 8. September · 19:00', type: 'Gespräche beginnen · Informell', point: 'lmd Lektion 1' },
  },
  { id: 'a2', title: 'Mikrofone', date: 'So, 20. September · 10:00', chip: 'in 16 Tagen', status: 'offen', s89: null },
  {
    id: 'a3',
    title: 'Bibellesung · Jer 38:1-13',
    date: 'Di, 22. September · 19:00',
    chip: '',
    status: 'bestätigt',
    s89: { name: 'Simon Krüger', partner: '', date: 'Di, 22. September · 19:00', type: 'Bibellesung · Jer 38:1-13', point: 'th Lektion 10' },
  },
]

/**
 * Namen mit noch offener Bestätigung → im Planen als „…“ statt „✓“.
 * Seed wie im Prototyp; jede neue Zuteilung setzt den Namen auf „pending“.
 */
export const DEMO_PENDING_NAMES: string[] = ['Simon Krüger', 'Jörg Roth', 'Elke Brandt']

export const DEMO_REMINDERS: Reminders = { first: 7, last: 1, repeat: true }

/* ---- Wochenprogramme ----------------------------------------------------
 * Kompakte Baus­teine wie im Prototyp: Namen als Tupel [Name, Rolle,
 * Bereichs-Key] ("" = offener Slot / ohne Rollenlabel).
 */

type NameTuple = [name: string, rolle: string, bereichsKey: string]

const slots = (tuples: NameTuple[]): SlotAssignment[] =>
  tuples.map(([name, rolle, bereichsKey]) => {
    const slot: SlotAssignment = { name }
    if (rolle) slot.rolle = rolle
    if (bereichsKey) slot.bereichsKey = bereichsKey
    return slot
  })

const part = (
  num: number | null,
  title: string,
  meta: string | null,
  tuples: NameTuple[],
): PartItem => {
  const item: PartItem = { title, names: slots(tuples) }
  if (num != null) item.num = num
  if (meta) item.meta = meta
  return item
}

const song = (title: string): SongItem => ({ song: title })

const sec = (
  label: string,
  farbe: SectionColor,
  items: Section['items'],
): Section => ({ label, farbe, items })

/** Baut die 4 Demo-Wochen — je Aufruf frische Objekte (State wird mutiert kopiert). */
export function buildDemoWeeks(): Week[] {
  return normalizeChairKeys([
    {
      range: '7.–13. September', book: 'Jeremia 32–33', current: true,
      mid: {
        date: 'Dienstag, 8. September · 19:00 · Königreichssaal', end: 'Ende ca. 20:45',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 1 · Gebet · Einleitende Worte', '1 Min.', [['Manfred Albrecht', 'Vorsitz', 'vorsitz'], ['Konrad Sommer', 'Gebet', 'gebet']])]),
          sec('SCHÄTZE AUS GOTTES WORT', 'petrol', [
            part(1, 'Über Jehovas Eigenschaften nachzudenken, stärkt unseren Glauben', '10 Min.', [['Thomas Lindner', '', 'vortrag']]),
            part(2, 'Nach geistigen Schätzen graben', '10 Min.', [['Jonas Berger', '', 'vortrag']]),
            part(3, 'Bibellesung · Jer 32:6-18', '4 Min. · th Lektion 2', [['Niklas Feld', '', 'bibellesung']]),
          ]),
          sec('UNS IM DIENST VERBESSERN', 'gold', [
            part(4, 'Gespräche beginnen', 'Von Haus zu Haus · 3 Min.', [['Lena Hoffmann', 'mit A. Hoffmann', 'schulung']]),
            part(5, 'Gespräche beginnen', 'Informell · 4 Min.', [['Simon Krüger', 'mit M. Ernst', 'schulung']]),
            part(6, 'Interesse fördern', 'Von Haus zu Haus · 5 Min.', [['Elke Brandt', 'mit R. Brandt', 'schulung']]),
          ]),
          sec('UNSER LEBEN ALS CHRIST', 'wein', [
            song('Lied 128'),
            part(7, 'Geh während der besonderen Aktion zielorientiert vor', 'Besprechung · 15 Min.', [['D. Winkler', '', 'vortrag']]),
            part(8, 'Versammlungsbibelstudium', '30 Min. · wcg Kap. 7', [['Friedrich Neumann', 'Leiter', 'studium'], ['Paul Schröder', 'Leser', 'leser']]),
          ]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 143 · Gebet', '3 Min.', [['Helmut Vogel', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['Claus Maier'], mik: ['Jörg Roth', 'Bernd Klein'], ord: ['Ulrich Lang', 'Georg Peters'], rein: ['Gruppe 2'] },
      },
      we: {
        date: 'Sonntag, 13. September · 10:00 · Königreichssaal', end: 'Ende ca. 11:45',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 138 · Gebet', null, [['A. Brenner', 'Vorsitz', 'vorsitz'], ['J. Winter', 'Gebet', 'gebet']])]),
          sec('ÖFFENTLICHER VORTRAG', 'petrol', [part(null, '„Woran erkennt man echten Glauben?“', '30 Min.', [['M. Hartmann', 'Gastredner · Vers. Nordheim', 'vortrag']])]),
          sec('WACHTTURM-STUDIUM', 'wein', [
            song('Lied 20'),
            part(null, '„Dient Jehova mit Freude“', 'Studienartikel 28 · 60 Min.', [['Friedrich Neumann', 'Leiter', 'studium'], ['Paul Schröder', 'Leser', 'leser']]),
          ]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 76 · Gebet', null, [['W. Adam', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['R. Simon'], mik: ['T. Falk', 'D. Kern'], ord: ['Georg Peters', 'M. Otto'], rein: ['Gruppe 3'] },
      },
    },
    {
      range: '14.–20. September', book: 'Jeremia 34–36', current: false,
      mid: {
        date: 'Dienstag, 15. September · 19:00 · Königreichssaal', end: 'Ende ca. 20:45',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 33 · Gebet · Einleitende Worte', '1 Min.', [['Friedrich Neumann', 'Vorsitz', 'vorsitz'], ['Thomas Lindner', 'Gebet', 'gebet']])]),
          sec('SCHÄTZE AUS GOTTES WORT', 'petrol', [
            part(1, 'Was wir von den Rechabitern lernen', '10 Min.', [['Helmut Vogel', '', 'vortrag']]),
            part(2, 'Nach geistigen Schätzen graben', '10 Min.', [['Manfred Albrecht', '', 'vortrag']]),
            part(3, 'Bibellesung · Jer 35:1-19', '4 Min. · th Lektion 5', [['Paul Schröder', '', 'bibellesung']]),
          ]),
          sec('UNS IM DIENST VERBESSERN', 'gold', [
            part(4, 'Gespräche beginnen', 'In der Öffentlichkeit · 3 Min.', [['A. Hoffmann', 'mit Lena Hoffmann', 'schulung']]),
            part(5, 'Interesse fördern', 'Informell · 4 Min.', [['R. Brandt', 'mit Elke Brandt', 'schulung']]),
            part(6, 'Vortrag', '5 Min. · lmd Anhang A Punkt 3', [['Niklas Feld', '', 'schulung']]),
          ]),
          sec('UNSER LEBEN ALS CHRIST', 'wein', [
            song('Lied 89'),
            part(7, 'Aktuelles', '15 Min.', [['Manfred Albrecht', '', 'vortrag']]),
            part(8, 'Versammlungsbibelstudium', '30 Min. · wcg Kap. 8', [['Thomas Lindner', 'Leiter', 'studium'], ['Jonas Berger', 'Leser', 'leser']]),
          ]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 112 · Gebet', '3 Min.', [['Konrad Sommer', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['R. Simon'], mik: ['Bernd Klein', 'Jörg Roth'], ord: ['M. Otto', 'Ulrich Lang'], rein: ['Gruppe 1'] },
      },
      we: {
        date: 'Sonntag, 20. September · 10:00 · Königreichssaal', end: 'Ende ca. 11:45',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 12 · Gebet', null, [['Helmut Vogel', 'Vorsitz', 'vorsitz'], ['Ulrich Lang', 'Gebet', 'gebet']])]),
          sec('ÖFFENTLICHER VORTRAG', 'petrol', [part(null, '„Ein Name, der zählt“', '30 Min.', [['R. Otte', 'Gastredner · Vers. Südfeld', 'vortrag']])]),
          sec('WACHTTURM-STUDIUM', 'wein', [
            song('Lied 49'),
            part(null, '„Bewahrt die Einheit“', 'Studienartikel 29 · 60 Min.', [['Manfred Albrecht', 'Leiter', 'studium'], ['Jonas Berger', 'Leser', 'leser']]),
          ]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 106 · Gebet', null, [['Georg Peters', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['Claus Maier'], mik: ['Simon Krüger', 'Niklas Feld'], ord: ['Ulrich Lang', 'M. Otto'], rein: ['Gruppe 1'] },
      },
    },
    {
      range: '21.–27. September', book: 'Jeremia 37–39', current: false, co: true,
      mid: {
        date: 'Dienstag, 22. September · 19:00 · Königreichssaal', end: 'Ende ca. 20:45',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 3 · Gebet · Einleitende Worte', '1 Min.', [['Manfred Albrecht', 'Vorsitz', 'vorsitz'], ['Friedrich Neumann', 'Gebet', 'gebet']])]),
          sec('SCHÄTZE AUS GOTTES WORT', 'petrol', [
            part(1, 'Jehova belohnt Mut — das Beispiel Ebed-Melechs', '10 Min.', [['Friedrich Neumann', '', 'vortrag']]),
            part(2, 'Nach geistigen Schätzen graben', '10 Min.', [['Thomas Lindner', '', 'vortrag']]),
            part(3, 'Bibellesung · Jer 38:1-13', '4 Min. · th Lektion 10', [['Simon Krüger', '', 'bibellesung']]),
          ]),
          sec('UNS IM DIENST VERBESSERN', 'gold', [
            part(4, 'Gespräche beginnen', 'Von Haus zu Haus · 3 Min.', [['Elke Brandt', 'mit R. Brandt', 'schulung']]),
            part(5, 'Menschen zu Jüngern machen', '5 Min. · lmd Lektion 9', [['Lena Hoffmann', 'mit A. Hoffmann', 'schulung']]),
            part(6, 'Unsere Glaubensansichten erklären', '5 Min.', [['Jonas Berger', '', 'schulung']]),
          ]),
          sec('UNSER LEBEN ALS CHRIST', 'wein', [
            song('Lied 44'),
            part(7, 'Baut einander auf', 'Besprechung · 15 Min.', [['Helmut Vogel', '', 'vortrag']]),
            part(8, '„Lauft so, dass ihr den Preis gewinnt“', 'Dienstvortrag · 30 Min.', [['K. Wagner', 'Kreisaufseher', '']]),
          ]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 96 · Gebet', '3 Min.', [['D. Winkler', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['Claus Maier'], mik: ['Bernd Klein', 'Paul Schröder'], ord: ['Georg Peters', 'Ulrich Lang'], rein: ['Gruppe 3'] },
      },
      we: {
        date: 'Sonntag, 27. September · 10:00 · Königreichssaal', end: 'Ende ca. 11:45',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 25 · Gebet', null, [['Friedrich Neumann', 'Vorsitz', 'vorsitz'], ['Bernd Klein', 'Gebet', 'gebet']])]),
          sec('ÖFFENTLICHER VORTRAG', 'petrol', [part(null, '„Frieden in einer unruhigen Welt“', '30 Min.', [['K. Wagner', 'Kreisaufseher', '']])]),
          sec('WACHTTURM-STUDIUM', 'wein', [
            song('Lied 61'),
            part(null, '„Jehovas Barmherzigkeit widerspiegeln“', 'Studienartikel 30 · 30 Min.', [['Helmut Vogel', 'Leiter', 'studium'], ['Jonas Berger', 'Leser', 'leser']]),
          ]),
          sec('DIENSTVORTRAG', 'gold', [part(null, '„Bleibt in Gottes Liebe“', '30 Min.', [['K. Wagner', 'Kreisaufseher', '']])]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 141 · Gebet', null, [['J. Winter', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['R. Simon'], mik: ['T. Falk', 'D. Kern'], ord: ['M. Otto', 'Georg Peters'], rein: ['Gruppe 2'] },
      },
    },
    {
      range: '28. Sep – 4. Okt', book: 'Jeremia 40–42', current: false, mem: true, memCancel: 'we',
      mid: {
        date: 'Dienstag, 29. September · 19:00 · Königreichssaal', end: 'Ende ca. 20:45',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 7 · Gebet · Einleitende Worte', '1 Min.', [['Thomas Lindner', 'Vorsitz', 'vorsitz'], ['Manfred Albrecht', 'Gebet', 'gebet']])]),
          sec('SCHÄTZE AUS GOTTES WORT', 'petrol', [
            part(1, 'Auf Jehova hören — auch wenn es schwerfällt', '10 Min.', [['Manfred Albrecht', '', 'vortrag']]),
            part(2, 'Nach geistigen Schätzen graben', '10 Min.', [['Helmut Vogel', '', 'vortrag']]),
            part(3, 'Bibellesung · Jer 42:1-17', '4 Min. · th Lektion 12', [['Jörg Roth', '', 'bibellesung']]),
          ]),
          sec('UNS IM DIENST VERBESSERN', 'gold', [
            part(4, 'Gespräche beginnen', 'Informell · 3 Min.', [['R. Brandt', 'mit Elke Brandt', 'schulung']]),
            part(5, 'Interesse fördern', 'Von Haus zu Haus · 4 Min.', [['Konrad Sommer', 'mit Lena Hoffmann', 'schulung']]),
            part(6, 'Vortrag', '5 Min. · lmd Anhang A Punkt 5', [['Paul Schröder', '', 'schulung']]),
          ]),
          sec('UNSER LEBEN ALS CHRIST', 'wein', [
            song('Lied 65'),
            part(7, 'Jehova sorgt für sein Volk', '15 Min.', [['Friedrich Neumann', '', 'vortrag']]),
            part(8, 'Versammlungsbibelstudium', '30 Min. · wcg Kap. 10', [['Helmut Vogel', 'Leiter', 'studium'], ['Paul Schröder', 'Leser', 'leser']]),
          ]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 150 · Gebet', '3 Min.', [['Claus Maier', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['R. Simon'], mik: ['Niklas Feld', 'Jörg Roth'], ord: ['M. Otto', 'Ulrich Lang'], rein: ['Gruppe 2'] },
      },
      // Gedächtnismahl statt Wochenend-Zusammenkunft (memCancel: 'we').
      we: {
        date: 'Samstag, 3. Oktober · 19:30 · Königreichssaal — nach Sonnenuntergang', end: 'Ende ca. 20:30',
        sections: [
          sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 18 · Gebet', null, [['Manfred Albrecht', 'Vorsitz', 'vorsitz'], ['D. Kern', 'Gebet', 'gebet']])]),
          sec('GEDÄCHTNISMAHL', 'wein', [
            part(null, 'Gedächtnismahl-Ansprache — „Schätze Jehovas größtes Geschenk“', '30 Min.', [['Friedrich Neumann', 'Redner', 'vortrag']]),
            part(null, 'Symbole herumreichen', 'Brot · Wein', [['Jonas Berger', '', ORD], ['Paul Schröder', '', ORD], ['Georg Peters', '', ORD], ['Ulrich Lang', '', ORD]]),
          ]),
          sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 149 · Gebet', null, [['Helmut Vogel', 'Gebet', 'gebet']])]),
        ],
        helpers: { ton: ['Claus Maier'], mik: ['Simon Krüger', 'Bernd Klein'], ord: ['M. Otto', 'Georg Peters'], rein: ['Gruppe 1'] },
      },
    },
  ])
}

/** Die eine importierbare Arbeitsheft-Woche (Einstellungen → Programm-Import), ohne Zuteilungen. */
export function buildImportWeek(): Week {
  return normalizeChairKeys([{
    range: '5.–11. Oktober', book: 'Jeremia 43–45', current: false,
    mid: {
      date: 'Dienstag, 6. Oktober · 19:00 · Königreichssaal', end: 'Ende ca. 20:45',
      sections: [
        sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 19 · Gebet · Einleitende Worte', '1 Min.', [['', 'Vorsitz', 'vorsitz'], ['', 'Gebet', 'gebet']])]),
        sec('SCHÄTZE AUS GOTTES WORT', 'petrol', [
          part(1, 'Jehovas Wort erfüllt sich immer', '10 Min.', [['', '', 'vortrag']]),
          part(2, 'Nach geistigen Schätzen graben', '10 Min.', [['', '', 'vortrag']]),
          part(3, 'Bibellesung · Jer 44:24-30', '4 Min. · th Lektion 3', [['', '', 'bibellesung']]),
        ]),
        sec('UNS IM DIENST VERBESSERN', 'gold', [
          part(4, 'Gespräche beginnen', 'Von Haus zu Haus · 3 Min.', [['', '', 'schulung']]),
          part(5, 'Interesse fördern', 'Informell · 4 Min.', [['', '', 'schulung']]),
          part(6, 'Menschen zu Jüngern machen', '5 Min. · lmd Lektion 11', [['', '', 'schulung']]),
        ]),
        sec('UNSER LEBEN ALS CHRIST', 'wein', [
          song('Lied 76'),
          part(7, 'Bleib loyal wie Baruch', '15 Min.', [['', '', 'vortrag']]),
          part(8, 'Versammlungsbibelstudium', '30 Min. · wcg Kap. 11', [['', 'Leiter', 'studium'], ['', 'Leser', 'leser']]),
        ]),
        sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 24 · Gebet', '3 Min.', [['', 'Gebet', 'gebet']])]),
      ],
      helpers: {},
    },
    we: {
      date: 'Sonntag, 11. Oktober · 10:00 · Königreichssaal', end: 'Ende ca. 11:45',
      sections: [
        sec('ERÖFFNUNG', 'neutral', [part(null, 'Lied 15 · Gebet', null, [['', 'Vorsitz', 'vorsitz'], ['', 'Gebet', 'gebet']])]),
        sec('ÖFFENTLICHER VORTRAG', 'petrol', [part(null, '„Wem kannst du wirklich vertrauen?“', '30 Min.', [['', 'Gastredner', 'vortrag']])]),
        sec('WACHTTURM-STUDIUM', 'wein', [
          song('Lied 123'),
          part(null, '„Loyal in Prüfungen“', 'Studienartikel 32 · 60 Min.', [['', 'Leiter', 'studium'], ['', 'Leser', 'leser']]),
        ]),
        sec('ABSCHLUSS', 'neutral', [part(null, 'Schlussworte · Lied 2 · Gebet', null, [['', 'Gebet', 'gebet']])]),
      ],
      helpers: {},
    },
  }])[0]
}
