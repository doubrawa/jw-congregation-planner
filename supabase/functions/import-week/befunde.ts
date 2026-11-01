// =============================================================================
// Was an einer geparsten Woche nach einer neuen Form des Arbeitshefts aussieht
// =============================================================================
// Der Parser (parse.ts) rät, wo er eine Form nicht kennt: einen Platz für einen
// neuen Punkt, die deutsche Rückfall-Zeile für ein Lied — und einen Abschnitt
// mit fremder Farbklasse lässt er ganz weg. Bis zum 31.10.2026 sagte das beim
// Holen niemand. Es fiel nur auf, wenn der Betreiber `heft-pruefen.mjs` fuhr
// oder die nächste Ausgabe las (so kam „Vortrag des Vorsitzenden" ans Licht).
//
// Die Prüfungen stehen hier einmal, für beide Leser: `import-week` schickt die
// Befunde mit der Woche, das Blatt „Programm holen" zeigt sie in der Sprache
// des Lesers, und `scripts/heft-pruefen.mjs` schreibt sie für den Betreiber
// aus. Ein Befund ist deshalb ein Schlüssel mit Stelle, kein Satz.
//
// Gemessen am 31.10.2026 an 320 Wochenseiten (68 deutsche Wochen 11/2025 bis
// 2/2027, die laufenden dazu in 14 Sprachen): keine einzige meldet etwas.
// =============================================================================

import {
  dienstteilBekannt,
  formVon,
  ZIFFER,
  type ImportedItem,
  type ImportedPart,
  type ImportedSection,
  type ImportedWeek,
} from './parse.ts'

/** Was fehlen kann, damit ein Punkt nicht vollständig erkannt ist. */
export type Fehlend = 'nummer' | 'titel' | 'minuten' | 'plaetze'

/**
 * Ein Abschnitt steht in einem Befund mit seiner **Art** (`kind`: `schaetze`,
 * `lac` …), nicht mit seiner Überschrift — die gibt es in der Sprache des Hefts,
 * und die App zeigt womöglich eine andere Fassung derselben Woche. Wer den
 * Befund ausgibt, nimmt die Überschrift aus der Woche, die er zeigt.
 *
 * Betrifft ein Befund einen Programmpunkt, trägt er dessen Kennung (`iid`).
 * Die App speichert die Befunde mit der Woche (`Week.befunde`) und markiert
 * den Punkt im Plan daran — Nummer und Titel kann der Planer ändern, die
 * Kennung bleibt (Review Nr. 4, 1.11.2026).
 */
export type Befund =
  /** Die Woche hat keinen Zeitraum — das erste `h1` fehlt. */
  | { art: 'zeitraum' }
  /** Eröffnung oder Abschluss ohne Liednummer (es kam die Rückfall-Zeile) oder kein Lied unter „Unser Leben als Christ". */
  | { art: 'lied'; abschnitt: string }
  /** Ein farbiger Abschnitt ohne Punkte — seine Farbklasse kennt der Parser nicht. */
  | { art: 'leer'; abschnitt: string }
  /** Die Nummern springen bei diesem Punkt: Davor fehlt womöglich einer. */
  | { art: 'nummern'; nr: number; iid: string }
  /** Ein Punkt ohne Nummer, Titel, Minuten oder Plätze. Ohne Nummer ist `nr` seine Stelle. */
  | { art: 'unvollstaendig'; nr: number; iid: string; titel: string; fehlt: Fehlend[] }
  /** Ein Punkt, dessen Art der Parser nicht kennt — seine Plätze sind geraten. `form` ist das erste Atom der Meta-Zeile. */
  | { art: 'unbekannt'; nr: number; iid: string; titel: string; form: string }
  /** Kein Schätze-Punkt mit Schriftstelle und Quelle — als Bibellesung gilt der letzte (`iid`). */
  | { art: 'bibellesung'; abschnitt: string; iid: string }
  /** Der letzte Punkt unter „Unser Leben als Christ" (`iid`) ist nicht der längste — und gilt doch als Versammlungsbibelstudium. */
  | { art: 'studium'; abschnitt: string; iid: string }
  /** Die Fassung in `sprache` gliedert sich anders als die deutsche; Plätze und Texte gehen dort nach der Stelle. */
  | { art: 'gliederung'; sprache: string; ist: string; soll: string }

const istPunkt = (item: ImportedItem): item is ImportedPart => 'names' in item

/** Wie ein Abschnitt im Befund steht: seine Art — die Überschrift nur, wo er keine hat. */
const stelle = (s: ImportedSection): string => s.kind ?? s.label

const abschnitt = (woche: ImportedWeek, kind: string) => woche.mid.sections.find((s) => s.kind === kind)
const punkteVon = (woche: ImportedWeek, kind: string) => abschnitt(woche, kind)?.items.filter(istPunkt) ?? []

/** Unter welcher Nummer ein Punkt gemeldet wird: seiner eigenen, ohne eine seiner Stelle. */
type Nummer = (p: ImportedPart) => number

const unbekannt = (p: ImportedPart, form: string, nr: Nummer): Befund => ({ art: 'unbekannt', nr: nr(p), iid: p.iid, titel: p.title, form })

/**
 * **Was an `woche` nach einer neuen Form aussieht.** Leer heißt: Der Parser
 * kennt alles darin.
 *
 * `formen` ist die deutsche Fassung derselben Woche — oder `woche` selbst, wenn
 * sie deutsch ist. Nur an ihr lassen sich die Formen unter „Uns im Dienst
 * verbessern" prüfen (`dienstteilBekannt` versteht sie nur deutsch); die
 * Plätze überträgt `applyGoldSlots` von dort nach der Stelle, also gilt der
 * Befund auch nach der Stelle. Ohne `formen` (`heft-pruefen` für eine weitere
 * Sprache) bleibt diese Prüfung aus — die deutsche Seite meldet sie schon.
 */
export function heftBefunde(woche: ImportedWeek, formen: ImportedWeek | null): Befund[] {
  const farbig = ['schaetze', 'dienst', 'lac'].flatMap((kind) => abschnitt(woche, kind) ?? [])
  const alle = farbig.flatMap((s) => s.items.filter(istPunkt))
  const nr: Nummer = (p) => p.num ?? alle.indexOf(p) + 1
  return [
    ...(woche.range ? [] : [{ art: 'zeitraum' as const }]),
    ...liedBefunde(woche),
    ...farbig.filter((s) => !s.items.some(istPunkt)).map((s): Befund => ({ art: 'leer', abschnitt: stelle(s) })),
    ...punktBefunde(alle, nr),
    ...schaetzeBefunde(woche, nr),
    ...(formen ? dienstBefunde(woche, formen, nr) : []),
    ...studiumBefunde(woche),
  ]
}

/** Eröffnung und Abschluss ohne Liednummer (es kam die Rückfall-Zeile), kein Lied unter „Unser Leben als Christ". */
function liedBefunde(woche: ImportedWeek): Befund[] {
  const ohneNummer = ['eroeffnung', 'abschluss']
    .flatMap((kind) => abschnitt(woche, kind) ?? [])
    .filter((s) => !ZIFFER.test(s.items.find(istPunkt)?.title ?? ''))
  const leben = abschnitt(woche, 'lac')
  const ohneLied = leben && !leben.items.some((i) => 'song' in i) ? [leben] : []
  return [...ohneNummer, ...ohneLied].map((s): Befund => ({ art: 'lied', abschnitt: stelle(s) }))
}

/**
 * Nummern und Vollständigkeit, über alle drei Abschnitte fortlaufend. Ein
 * Sprung meldet sich einmal: Danach zählt die Nummer weiter, die dasteht.
 *
 * Eine Nummer, die der Parser **nicht lesen** konnte, ist kein Sprung, sondern
 * fehlt (`unvollstaendig`). Bis zum Review am 31.10.2026 hieß es dort „davor
 * fehlt womöglich ein Programmpunkt" — birmanisch bei jedem der acht Punkte.
 */
function punktBefunde(alle: ImportedPart[], nr: Nummer): Befund[] {
  const befunde: Befund[] = []
  let erwartet = 1
  for (const p of alle) {
    const fehlt: Fehlend[] = []
    if (p.num === undefined) fehlt.push('nummer')
    else if (p.num !== erwartet) befunde.push({ art: 'nummern', nr: p.num, iid: p.iid })
    erwartet = (p.num ?? erwartet) + 1
    if (!p.title.trim()) fehlt.push('titel')
    if (typeof p.mins !== 'number') fehlt.push('minuten')
    if (p.names.length === 0) fehlt.push('plaetze')
    if (fehlt.length > 0) befunde.push({ art: 'unvollstaendig', nr: nr(p), iid: p.iid, titel: p.title, fehlt })
  }
  return befunde
}

/**
 * „Schätze aus Gottes Wort" kennt drei Punkte: den Vortrag, „Nach geistigen
 * Schätzen graben" und die Bibellesung. Jeder weitere bekam geratene Plätze.
 * Ohne Schriftstelle im Titel oder Quelle im Meta fand der Parser keine
 * Bibellesung und nahm den letzten Punkt (`bibellesungVon`).
 */
function schaetzeBefunde(woche: ImportedWeek, nr: Nummer): Befund[] {
  const s = abschnitt(woche, 'schaetze')
  const punkte = s?.items.filter(istPunkt) ?? []
  const lesung = punkte.find((p) => p.names.some((n) => n.bereichsKey === 'bibellesung'))
  const befunde = punkte.filter((p, i) => i >= 2 && p !== lesung).map((p) => unbekannt(p, formVon(p.meta ?? ''), nr))
  if (s && lesung && (!lesung.title.includes(' · ') || (lesung.meta ?? '').split(' · ').length < 2)) {
    befunde.push({ art: 'bibellesung', abschnitt: stelle(s), iid: lesung.iid })
  }
  return befunde
}

/** Die Punkte unter „Uns im Dienst verbessern", deren Form die deutsche Fassung an derselben Stelle nicht kennt. */
function dienstBefunde(woche: ImportedWeek, formen: ImportedWeek, nr: Nummer): Befund[] {
  const deutsch = punkteVon(formen, 'dienst')
  return punkteVon(woche, 'dienst').flatMap((p, i) => {
    const de = deutsch[i]
    return de && !dienstteilBekannt(de.title, de.meta ?? '') ? [unbekannt(p, formVon(de.meta ?? ''), nr)] : []
  })
}

/**
 * Das Versammlungsbibelstudium ist der letzte Punkt seines Abschnitts — und in
 * allen gemessenen Wochen der längste (30 Minuten, die übrigen höchstens 15).
 * Steht etwas Kürzeres am Ende, ist es womöglich nicht das Studium.
 */
function studiumBefunde(woche: ImportedWeek): Befund[] {
  const leben = abschnitt(woche, 'lac')
  const punkte = leben?.items.filter(istPunkt) ?? []
  const studium = punkte.at(-1)
  if (!leben || !studium) return []
  const nichtLaengster = punkte.some((p) => p !== studium && (p.mins ?? 0) >= (studium.mins ?? 0))
  return nichtLaengster ? [{ art: 'studium', abschnitt: stelle(leben), iid: studium.iid }] : []
}

/** Die Gliederung einer Woche: je Abschnitt Lieder (L) und Punkte mit Nummer. */
function gliederung(woche: ImportedWeek): string {
  return woche.mid.sections
    .map((s) => `${s.farbe}: ${s.items.map((i) => ('song' in i ? 'L' : (i.num ?? '·'))).join(' ')}`)
    .join(' | ')
}

/**
 * **Gliedert sich die Fassung in `sprache` wie die deutsche?** Die Plätze
 * kommen nach der Stelle von dort (`applyGoldSlots`), die Texte einer
 * Sprachvariante ebenso — eine verschobene Stelle gäbe einem Punkt die Plätze
 * oder den Text seines Nachbarn.
 */
export function strukturBefunde(deutsch: ImportedWeek, fremd: ImportedWeek, sprache: string): Befund[] {
  const soll = gliederung(deutsch)
  const ist = gliederung(fremd)
  return ist === soll ? [] : [{ art: 'gliederung', sprache, ist, soll }]
}

const FEHLEND_DE: Record<Fehlend, string> = { nummer: 'Nummer', titel: 'Titel', minuten: 'Minuten', plaetze: 'Plätze' }

/**
 * Ein Befund als deutscher Satz — für den Betreiber: `heft-pruefen.mjs` und das
 * Protokoll der Function. Die App sagt es in der Sprache des Lesers
 * (`src/planen/heft-befunde.ts`).
 *
 * Die Abschnitte heißen, wie in `woche` — für das Protokoll die deutsche
 * Fassung derselben Woche.
 */
export function befundAufDeutsch(b: Befund, woche: ImportedWeek): string {
  const name = (kind: string) => abschnitt(woche, kind)?.label ?? kind
  switch (b.art) {
    case 'zeitraum':
      return 'kein Zeitraum'
    case 'lied':
      return `„${name(b.abschnitt)}" ohne Lied mit Nummer`
    case 'leer':
      return `„${name(b.abschnitt)}" ohne Punkte`
    case 'nummern':
      return `die Nummern springen bei Punkt ${b.nr}`
    case 'unvollstaendig':
      return `Punkt ${b.nr} „${b.titel}" ohne ${b.fehlt.map((f) => FEHLEND_DE[f]).join(', ')}`
    case 'unbekannt':
      return `Punkt ${b.nr} „${b.titel}": Form „${b.form}" — der Parser rät die Plätze`
    case 'bibellesung':
      return `„${name(b.abschnitt)}": kein Punkt mit Schriftstelle und Quelle — als Bibellesung gilt der letzte`
    case 'studium':
      return `„${name(b.abschnitt)}": der letzte Punkt ist nicht der längste — er gilt trotzdem als Versammlungsbibelstudium`
    case 'gliederung':
      return `${b.sprache} gegliedert „${b.ist}" statt wie Deutsch „${b.soll}"`
  }
}
