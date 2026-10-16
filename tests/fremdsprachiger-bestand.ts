import type { AppState } from '../src/app/context'
import type { Meeting, MyTask, Notification, SubstituteReq } from '../src/data/types'
import { APP_LANGS } from '../src/i18n/langs'
import { bibelbuecherLaden, makeTr } from '../src/i18n/translate'
import { entwicklerStart } from './testdaten/demo-start'

/**
 * **Der Bestand der Entwicklerseite ohne ein deutsches Wort, das deutsch
 * bleiben darf** — für die Proben, die eine fremdsprachige Oberfläche nach
 * deutschen Resten absuchen (T123).
 *
 * Der Demo-Bestand ist die reichste Versammlung, die es gibt: Wochen mit allen
 * Teilen, Treffpunkte, Besuche, Trolleys, Pläne, Konten, Links, Mitteilungen.
 * Für eine Suche nach Deutsch taugt er so aber nicht — Namen wie „Klein",
 * „Sommer" oder „Lang" sind deutsche Wörter, „Bei Familie Albrecht" ist ein
 * deutscher Ort, „Demoaufgabe 8" ein deutscher Titel. Sie bleiben in jeder
 * Sprache stehen, und zwar zu Recht: Namen und Freitext übersetzt niemand, und
 * Programmtitel kommen von jw.org in der Sprache der Versammlung.
 *
 * Deshalb tritt an ihre Stelle eine **erfundene Buchstabenfolge** („Xabebo"),
 * die in keiner Sprache ein Wort ist:
 *
 *  - Namen — jeder Bestandteil, an jeder Stelle (auch in Schlüsseln wie dem
 *    Versand-Tagebuch, sonst stimmten die Zusagen nicht mehr),
 *  - Freitext der Versammlung — Name, Saal, Orte, Trolleys, Pläne, Gründe,
 *  - Programmtext, den die App **nicht** übersetzt — je Atom („ · ", „ — "):
 *    Was der Fragment-Übersetzer in jeder App-Sprache kennt, ist eine Vorlage
 *    der App und bleibt kanonisch deutsch stehen; alles andere ist Inhalt von
 *    jw.org und wird erfunden.
 *
 * Was danach in einer fremden Oberfläche noch deutsch dasteht, ist ein Befund:
 * ein fest eingebauter Text, ein roh ausgegebener Datenwert, eine Vorlage, die
 * am Übersetzer vorbeigeht.
 *
 * **Gruppennamen bleiben** („Gruppe 1"): Die App legt sie so an und übersetzt
 * sie beim Anzeigen (`neuerGruppenName`, `tu`). Wo einer roh dasteht, soll die
 * Suche es finden.
 *
 * Die Uhr steht für den Aufrufer: Der Bestand liegt im September 2026, und die
 * Ansichten zeigen nur, was noch kommt.
 */
export interface FremdBestand {
  /** Angemeldet als Admin mit eigener Person (`me=p9`) und Konten (`konto=1`). */
  zustand: AppState
  /** Jede erfundene Folge — sie darf in jeder Sprache dastehen. */
  erfunden: ReadonlySet<string>
}

const KONSONANTEN = 'bdfgklmnprtvz'
const VOKALE = 'aeiou'

/** Die n-te erfundene Folge: „X" + Vokal + Konsonant + Vokal + Konsonant + „o". */
function folge(n: number): string {
  const v1 = VOKALE[n % 5] ?? 'a'
  const k1 = KONSONANTEN[Math.floor(n / 5) % 13] ?? 'b'
  const v2 = VOKALE[Math.floor(n / 65) % 5] ?? 'a'
  const k2 = KONSONANTEN[Math.floor(n / 325) % 13] ?? 'b'
  return `X${v1}${k1}${v2}${k2}o`
}

/** Erkennt eine erfundene Folge — ohne die Liste, für Vergleiche über Ansichten hinweg. */
export const ERFUNDEN_MUSTER = /X[aeiou][bdfgklmnprtvz][aeiou][bdfgklmnprtvz]o/g

const SPRACHEN = APP_LANGS.map((l) => l.code).filter((c) => c !== 'de')

export async function fremdsprachigerBestand(): Promise<FremdBestand> {
  // Ohne die Buchtabellen kennte der Übersetzer keine Schriftstelle — die
  // Entscheidung „Vorlage oder Inhalt" hinge dann davon ab, wer zuerst lädt.
  await bibelbuecherLaden()
  const uebersetzer = SPRACHEN.map((code) => makeTr(code))
  const erfunden = new Set<string>()
  const vergeben = new Map<string, string>()
  const ersetze = (wort: string): string => {
    let neu = vergeben.get(wort)
    if (!neu) {
      neu = folge(vergeben.size)
      vergeben.set(wort, neu)
      erfunden.add(neu)
    }
    return neu
  }
  /** Kennt jede App-Sprache das Atom? Dann ist es eine Vorlage der App. */
  const vorlage = (atom: string): boolean => !/\p{L}/u.test(atom) || uebersetzer.every((tr) => tr(atom) !== atom)
  const neutral = (text: string): string =>
    text
      .split(' · ')
      .map((atom) => atom.split(' — ').map((teil) => (vorlage(teil) ? teil : ersetze(teil))).join(' — '))
      .join(' · ')

  const start = entwicklerStart('#me=p9&konto=1')
  const gruppen = new Set(start.groups.map((g) => g.name))

  // Jeder Name, der irgendwo steht: Personen, Plätze, Treffpunkt-Leiter, S-89.
  const namen = new Set<string>()
  const merke = (name: string | undefined) => {
    if (!name || gruppen.has(name)) return
    for (const teil of name.split(/\s+/)) if (/\p{Lu}\p{L}+/u.test(teil)) namen.add(teil)
  }
  for (const p of start.persons) {
    merke(p.fn)
    merke(p.ln)
  }
  for (const w of start.weeks) {
    for (const m of [w.mid, w.we]) {
      for (const s of m.sections) for (const it of s.items) if ('names' in it) it.names.forEach((n) => merke(n.name))
      for (const plaetze of Object.values(m.helpers)) plaetze.forEach((p) => merke(p.name))
      merke(m.auxRatgeber?.name)
    }
  }
  start.fsWeeks.flat().forEach((i) => merke(i.leader))
  start.myTasks.forEach((t) => {
    merke(t.s89?.name)
    merke(t.s89?.partner)
  })
  // Längste zuerst, damit „Hoffmann" nicht an einem kürzeren Namen hängen bleibt.
  const muster = [...namen].sort((a, b) => b.length - a.length).join('|')
  const nameRe = new RegExp(`(?<!\\p{L})(${muster})(?!\\p{L})`, 'gu')
  const umbenennen = (text: string) => text.replace(nameRe, (name) => ersetze(name))
  const tief = (wert: unknown): unknown => {
    if (typeof wert === 'string') return umbenennen(wert)
    if (Array.isArray(wert)) return wert.map(tief)
    if (wert && typeof wert === 'object') {
      return Object.fromEntries(Object.entries(wert).map(([k, v]) => [umbenennen(k), tief(v)]))
    }
    return wert
  }
  const z = tief(start) as AppState

  const sitzung = (m: Meeting): Meeting => ({
    ...m,
    date: neutral(m.date),
    end: neutral(m.end),
    sections: m.sections.map((s) => ({
      ...s,
      label: neutral(s.label),
      items: s.items.map((it) =>
        'song' in it
          ? { ...it, song: neutral(it.song) }
          : {
              ...it,
              title: neutral(it.title),
              ...(it.meta ? { meta: neutral(it.meta) } : {}),
              names: it.names.map((n) => (n.herkunft ? { ...n, herkunft: ersetze(n.herkunft) } : n)),
            },
      ),
    })),
  })
  const aufgabe = (t: MyTask): MyTask => ({
    ...t,
    title: neutral(t.title),
    date: neutral(t.date),
    s89: t.s89 ? { ...t.s89, type: neutral(t.s89.type), date: neutral(t.s89.date), point: neutral(t.s89.point) } : null,
  })
  const gesuch = (r: SubstituteReq): SubstituteReq => ({
    ...r,
    title: neutral(r.title),
    date: neutral(r.date),
    schonHeute: r.schonHeute.map((a) => ({ ...a, text: neutral(a.text) })),
  })
  const mitteilung = (n: Notification): Notification => ({ ...n, text: neutral(n.text) })

  const zustand: AppState = {
    ...z,
    congregation: { ...z.congregation, name: ersetze(z.congregation.name), hall: `${ersetze(z.congregation.hall)} 12` },
    fsRules: z.fsRules.map((r) => ({ ...r, place: ersetze(r.place) })),
    fsWeeks: z.fsWeeks.map((woche) => woche.map((i) => ({ ...i, place: ersetze(i.place) }))),
    trolleys: z.trolleys.map((t) => ({ ...t, name: ersetze(t.name), ort: ersetze(t.ort), hinweis: t.hinweis ? ersetze(t.hinweis) : '' })),
    plaene: z.plaene.map((p) => ({ ...p, name: ersetze(p.name) })),
    absences: z.absences.map((a) => ({ ...a, reason: a.reason ? ersetze(a.reason) : '' })),
    weeks: z.weeks.map((w) => ({ ...w, range: neutral(w.range), book: neutral(w.book), mid: sitzung(w.mid), we: sitzung(w.we) })),
    myTasks: z.myTasks.map(aufgabe),
    substituteReqs: z.substituteReqs.map(gesuch),
    notifs: z.notifs.map(mitteilung),
  }
  // Die Kürzel erfundener Namen („Xabebo Xidavo" → „XX") stehen im Menü und an den Plätzen.
  erfunden.add('XX')
  return { zustand, erfunden }
}
