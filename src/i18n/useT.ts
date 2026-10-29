/**
 * Übersetzungs-Hook: bündelt UI-Wörterbuch (App-Sprache), UI-nahe Daten-
 * Übersetzung (tu, App-Sprache) und Programm-Inhalts-Übersetzung (tp,
 * Versammlungssprache).
 *
 *  - `t`  … UI-Strings, z. B. `t.autoTitel`
 *  - `fill(t.offeneZut, { n })` … Platzhalter {n}/{name}/{m} ersetzen
 *  - `tu(name)` … Namen/Rollen/Zeiten in App-Sprache
 *  - `tp(title)` … Programmpunkt-Titel/Datum in Versammlungssprache
 */

import { useMemo } from 'react'
import { useAppSelector } from '../app/context'
import { localizedWeek } from '../data/localize'
import { meetingDateText } from '../data/meeting-dates'
import type { MeetingAssignment, MeetingKey, MeetingTimes, Week } from '../data/types'
import { APP_TO_JW, congAppCode, versammlungsSprache } from './langs'
import { bibelbuecherGeladen, makeTr, ohneMarken } from './translate'
import { dict, overlayGeneration, type Dict } from './ui'
import { zahlBinden } from './zahl-binden'

export interface I18n {
  t: Dict
  tu: (s: string) => string
  tp: (s: string) => string
  /** true, wenn die Versammlungssprache keine Programmübersetzung hat. */
  progFallback: boolean
}

/**
 * Beschriftung einer Aufgabe aus ihren zwei Hälften — die **eine** Stelle, an
 * der sie zusammenkommen.
 *
 * Der Titel des Programmpunkts steht in der Sprache der Versammlung (`tp`), die
 * Rolle in der des Lesers (`tu`); ein einzelner Übersetzer kann für beide nicht
 * stimmen. Fehlt eine Hälfte, trägt die andere allein — in Eröffnung und
 * Abschluss ist das die Rolle, denn der Titel benennt dort den ganzen Block
 * („Lied 27 · Gebet · Einleitende Worte").
 */
export function aufgabenLabel(
  task: { title: string; rolle?: string; lesersprache?: boolean },
  i18n: Pick<I18n, 'tp' | 'tu'>,
): string {
  const { punkt, rolle } = aufgabenHaelften(task, i18n)
  return punkt && rolle ? `${punkt} · ${rolle}` : punkt || rolle
}

/**
 * Die zwei Hälften einer Aufgabe, jede mit ihrem Übersetzer — für Stellen, die
 * sie getrennt setzen, weil jede nach ihrer Sprache trennt (die Zeilen auf dem
 * Start: der Punkt mit `aufgabenTitelSprache`, die Rolle in der des Lesers).
 */
export function aufgabenHaelften(
  task: { title: string; rolle?: string; lesersprache?: boolean },
  i18n: Pick<I18n, 'tp' | 'tu'>,
): { punkt: string; rolle: string } {
  return {
    punkt: task.title ? aufgabenTp(task, i18n)(task.title) : '',
    rolle: task.rolle ? i18n.tu(task.rolle) : '',
  }
}

/**
 * Dieselbe Beschriftung auf **zwei Zeilen** — für die große Karte der nächsten
 * Aufgabe (T121): oben groß der Programmpunkt, darunter die Rolle und, bei
 * Schulungsaufgaben, der Partner. Wo die Rolle allein trägt (Vorsitz,
 * Hilfsdienste, Treffpunkte), steht sie oben. Zusammengesetzt wird hier,
 * neben `aufgabenLabel`, aus demselben Grund: Jede Hälfte braucht ihren
 * eigenen Übersetzer.
 */
export function aufgabenZeilen(
  task: { title: string; rolle?: string; lesersprache?: boolean; s89?: { partner: string } | null },
  i18n: Pick<I18n, 't' | 'tp' | 'tu'>,
): { titel: string; unter: string } {
  const { punkt, rolle } = aufgabenHaelften(task, i18n)
  const partner = task.s89?.partner ? `${i18n.t.s89Partner}: ${task.s89.partner}` : ''
  if (!punkt) return { titel: rolle, unter: partner }
  return { titel: punkt, unter: [rolle, partner].filter(Boolean).join(' · ') }
}

/**
 * Übersetzer für den Programmtext einer Aufgabe — Titel und Datum.
 *
 * Gewöhnlich `tp`, die Versammlungssprache. Liegt die Woche aber als Variante in
 * der Sprache des Lesers vor (`lesersprache`), steht der Titel schon in seiner,
 * und das Datum muss mit: Sonst las eine englische App „Congregation Bible
 * Study" über „Dienstag, 8. September", während das Programm derselben Woche
 * „Tuesday, September 8" zeigte. Dieselbe Regel wie `useProgWeeks`.
 */
export function aufgabenTp(
  task: { lesersprache?: boolean },
  i18n: Pick<I18n, 'tp' | 'tu'>,
): (s: string) => string {
  return task.lesersprache ? i18n.tu : i18n.tp
}

/**
 * **Der Termin einer Aufgabe** („Dienstag, 22. September · 19:00") in der
 * Sprache, in der `aufgabenTp` schreibt — Tag und Monat gebunden (T128: bei
 * 320 px brach er auf dem Start und unter „Meine Aufgaben" „22.|September").
 */
export function aufgabenTermin(task: { date: string; lesersprache?: boolean }, i18n: Pick<I18n, 'tp' | 'tu'>): string {
  return zahlBinden(aufgabenTp(task, i18n)(task.date))
}

/**
 * In welcher Sprache `aufgabenTp` schreibt — `lang` des Titels einer Aufgabe,
 * wo er trennt (`.sheet-title`, T128). Wie `ProgWeek.sprache`: mit
 * Sprachvariante die des Lesers, sonst die der Versammlung.
 */
export function aufgabenSprache(task: { lesersprache?: boolean }, lang: string, congLang: string): string {
  return task.lesersprache ? lang : versammlungsSprache(congLang)
}

/**
 * `lang` einer Beschriftung, die vorn den Programmpunkt trägt: die Sprache des
 * Programms (`aufgabenSprache`), nach deren Regeln sie trennt. Ohne
 * Programmpunkt steht vorn die Rolle in der Sprache des Lesers — `undefined`,
 * kein eigenes `lang`. Eine Stelle für die große Karte, das Blatt und die
 * Zeilen auf dem Start.
 */
export function aufgabenTitelSprache(task: { title: string; lesersprache?: boolean }, lang: string, congLang: string): string | undefined {
  return task.title ? aufgabenSprache(task, lang, congLang) : undefined
}

/**
 * „Besetzung: 20/23" — die Zahl an ihr Wort gebunden (T128). Eine Stelle für
 * den Saal, die Karte der Woche, den Balken der Planung und die Blätter der
 * automatischen Zuteilung; bis zum 29.10.2026 stand die Zeile an fünf Stellen
 * ausgeschrieben.
 */
export function besetzungText(t: Pick<Dict, 'saalBesetzung'>, besetzt: number, gesamt: number): string {
  return zahlBinden(`${t.saalBesetzung}: ${besetzt}/${gesamt}`)
}

/**
 * Zuteilungen „schon an diesem Tag" als **ein** Satzstück — jede in der
 * Sprache, die ihr Text verlangt (`MeetingAssignment.lang`): Rollen und
 * Dienstnamen in der des Lesers, Programmpunkt-Titel in der der Versammlung.
 * Stand im Zuteilungs-Sheet, im Bestätigen-Dialog und unter „Meine Aufgaben"
 * je einmal ausgeschrieben.
 */
export function zuteilungenText(
  liste: readonly MeetingAssignment[],
  i18n: Pick<I18n, 'tp' | 'tu'>,
): string {
  return liste.map((a) => (a.lang === 'u' ? i18n.tu(a.text) : i18n.tp(a.text))).join(', ')
}

/**
 * **Wer an einem Platz steht** — eine Gruppe (Reinigung, `Service.groups`) in
 * der Sprache des Lesers, eine Person so, wie sie heißt.
 *
 * Gruppennamen trägt der Platz kanonisch deutsch („Gruppe 1", siehe
 * `assignName` der Gruppen-Kandidaten). Ein Personenname dagegen darf nie
 * durch den Übersetzer: Der erkennt darin Bibelstellen und machte aus dem
 * Zusatz gegen Namensgleichheit ein Bibelbuch („Markus 2 Weber" → „Mark 2
 * Weber").
 */
export function platzName(name: string, gruppe: boolean, i18n: Pick<I18n, 'tu'>): string {
  return gruppe ? i18n.tu(name) : name
}

/**
 * Platzhalter {n}, {name}, {m} … in einer Übersetzung ersetzen — danach bleibt
 * jede Zahl bei ihrer Bezeichnung (`zahlBinden`, T128). Hier statt in den
 * Wörterbüchern: Das deckt alle zwölf Sprachen und auch Werte aus `Intl` („1 Tag"),
 * ohne dass jeder neue Text daran denken muss.
 */
export function fill(template: string, params: Record<string, string | number>): string {
  return zahlBinden(template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? '')))
}

/**
 * Kein Wörterbuch nötig (Deutsch) — die Freitext-Marken müssen trotzdem
 * herunter, sonst stehen die unsichtbaren Isolat-Zeichen im DOM (siehe
 * `i18n/freitext.ts`).
 */
const identity = ohneMarken

/**
 * Der meistgenutzte Hook der App — 44 Bausteine hängen an ihm, und er liest
 * genau zwei Felder.
 *
 * Über `useApp()` bedeutete das: **jede** Zustandsänderung, egal welche, rief
 * alle 44 auf den Plan. Ein einzelner Tastendruck in einem Personenfeld rendert
 * damit die halbe Anwendung neu, obwohl sich an keiner Übersetzung etwas
 * geändert hat. Deshalb Selektoren (T41): zwei einzelne Felder, beide einfache
 * Werte — da genügt der Vergleich mit `Object.is`, es braucht kein `flachGleich`.
 */
export function useT(): I18n {
  const lang = useAppSelector((s) => s.lang)
  const congLang = useAppSelector((s) => s.congLang)
  // overlayGen invalidiert das Memo, wenn ein Sprach-Overlay nachgeladen
  // wurde (lazy, siehe ui.ts) — lang/congLang ändern sich dabei nicht.
  const overlayGen = overlayGeneration()
  // Ebenso die Bibelbuch-Tabellen: Ein Übersetzer von vor ihrem Laden kennt
  // keine Bücher, und das Neuzeichnen danach (`store.tsx`) allein baut ihn
  // nicht neu.
  const buecher = bibelbuecherGeladen()
  return useMemo(() => {
    const congCode = congAppCode(congLang)
    return {
      t: dict(lang),
      tu: lang === 'de' ? identity : makeTr(lang),
      tp: congCode && congCode !== 'de' ? makeTr(congCode) : identity,
      progFallback: !congCode,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, congLang, overlayGen, buecher])
}

export interface ProgWeek {
  /** undefined, wenn es (noch) keine Wochen gibt — Aufrufer zeigt Leerzustand. */
  week: Week | undefined
  /** Programm-Übersetzer passend zur angezeigten Woche (statt `tp`). */
  tpw: (s: string) => string
  /**
   * In welcher Sprache `tpw` schreibt — für `lang` an den Programmtexten: Die
   * Silbentrennung folgt `lang`, und in einer russischen App brach das deutsche
   * „Versammlungsbibelstudium" mitten im Wort (T128). Auch Vorleseprogramme
   * sprechen so die richtige Sprache.
   */
  sprache: string
}

/**
 * Woche in der Programm-Anzeigesprache des Nutzers: Hat die Woche eine beim
 * Import mitgeholte Sprachvariante (Week.alt) für die App-Sprache, werden deren
 * Texte angezeigt und die Vorlage-Strings in die App-Sprache übersetzt — sonst
 * bleibt alles bei der Versammlungssprache (`tp`).
 */
export function useProgWeek(week: Week | undefined): ProgWeek {
  const progWeek = useProgWeeks()
  const congLang = useAppSelector((s) => s.congLang)
  const { tp } = useT()
  return useMemo(
    () => (week ? progWeek(week) : { week, tpw: tp, sprache: versammlungsSprache(congLang) }),
    [week, progWeek, tp, congLang],
  )
}

/**
 * **Die Spanne einer Woche aus dem Arbeitsheft** („7.–13. September") in der
 * Sprache ihres Programms — Tag und Monat bleiben zusammen (`zahlBinden`,
 * T128: „7.–13.|September" in den Wochenkarten am Desktop). Die eine Stelle
 * für jede Anzeige dieser Spanne; eine Spanne aus `Intl` liefert
 * `wochenSpanne`, ebenfalls gebunden.
 */
export function programmSpanne(p: { week: Pick<Week, 'range'>; tpw: (s: string) => string }): string {
  return zahlBinden(p.tpw(p.week.range))
}

/**
 * **Der Termin einer Zusammenkunft** („Dienstag, 8. September · 19:00 · Ende
 * ca. 20:45") in der Sprache ihres Programms, Tag und Monat gebunden (T128:
 * „Dienstag, 8.|September" bei 320 px) — für das Programm und das Blatt
 * „Programm". Gerechnet, nicht aus dem `date`-Feld (`meetingDateText`).
 */
export function programmTermin(
  tpw: (s: string) => string,
  rawWeek: Week,
  tab: MeetingKey,
  zeiten: MeetingTimes,
  ende: string,
): string {
  return zahlBinden([tpw(meetingDateText(rawWeek, tab, zeiten)), tpw(ende)].filter(Boolean).join(' · '))
}

/**
 * **Dieselbe Regel für mehrere Wochen** — für Listen wie die Planungs-Karte des
 * Start-Bildschirms, die nicht je Woche einen Hook aufrufen können.
 *
 * Die Karte nahm die Wochenspanne dort über `tp` aus der kanonischen Woche,
 * während Planen denselben Kopf aus der Sprachvariante zeigte: Eine englische
 * App mit deutscher Versammlung las auf dem Start „14.–20. September" und nach
 * dem Tippen „September 14-20". Eine Regel, zwei Aufrufer.
 */
export function useProgWeeks(): (week: Week) => ProgWeek & { week: Week } {
  const lang = useAppSelector((s) => s.lang)
  const congLang = useAppSelector((s) => s.congLang)
  const { tp, tu } = useT()
  return useMemo(() => {
    const congCode = congAppCode(congLang)
    const jwCode = lang !== congCode ? APP_TO_JW[lang] : undefined
    const sprache = versammlungsSprache(congLang)
    return (week: Week) => {
      const merged = localizedWeek(week, jwCode)
      // Mit Variante stehen die Texte in der App-Sprache — ihr Übersetzer ist
      // `tu`, derselbe, der auch Namen und Rollen übersetzt.
      return merged === week ? { week, tpw: tp, sprache } : { week: merged, tpw: tu, sprache: lang }
    }
  }, [lang, congLang, tp, tu])
}
