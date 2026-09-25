/**
 * Übersetzungs-Hook: bündelt UI-Wörterbuch (App-Sprache), UI-nahe Daten-
 * Übersetzung (tu, App-Sprache) und Programm-Inhalts-Übersetzung (tp,
 * Versammlungssprache).
 *
 *  - `t`  … UI-Strings, z. B. `t.autoZuteilen`
 *  - `fill(t.offeneZut, { n })` … Platzhalter {n}/{name}/{m} ersetzen
 *  - `tu(name)` … Namen/Rollen/Zeiten in App-Sprache
 *  - `tp(title)` … Programmpunkt-Titel/Datum in Versammlungssprache
 */

import { useMemo } from 'react'
import { useAppSelector } from '../app/context'
import { localizedWeek } from '../data/localize'
import type { MeetingAssignment, Week } from '../data/types'
import { APP_TO_JW, congAppCode } from './langs'
import { makeTr, ohneMarken } from './translate'
import { dict, overlayGeneration, type Dict } from './ui'

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
  task: { title: string; rolle?: string },
  i18n: Pick<I18n, 'tp' | 'tu'>,
): string {
  const links = task.title ? i18n.tp(task.title) : ''
  const rechts = task.rolle ? i18n.tu(task.rolle) : ''
  return links && rechts ? `${links} · ${rechts}` : links || rechts
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

/** Platzhalter {n}, {name}, {m} … in einer Übersetzung ersetzen. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
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
  return useMemo(() => {
    const congCode = congAppCode(congLang)
    return {
      t: dict(lang),
      tu: lang === 'de' ? identity : makeTr(lang),
      tp: congCode && congCode !== 'de' ? makeTr(congCode) : identity,
      progFallback: !congCode,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, congLang, overlayGen])
}

export interface ProgWeek {
  /** undefined, wenn es (noch) keine Wochen gibt — Aufrufer zeigt Leerzustand. */
  week: Week | undefined
  /** Programm-Übersetzer passend zur angezeigten Woche (statt `tp`). */
  tpw: (s: string) => string
}

/**
 * Woche in der Programm-Anzeigesprache des Nutzers: Hat die Woche eine beim
 * Import mitgeholte Sprachvariante (Week.alt) für die App-Sprache, werden deren
 * Texte angezeigt und die Vorlage-Strings in die App-Sprache übersetzt — sonst
 * bleibt alles bei der Versammlungssprache (`tp`).
 */
export function useProgWeek(week: Week | undefined): ProgWeek {
  const progWeek = useProgWeeks()
  const { tp } = useT()
  return useMemo(() => (week ? progWeek(week) : { week, tpw: tp }), [week, progWeek, tp])
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
export function useProgWeeks(): (week: Week) => { week: Week; tpw: (s: string) => string } {
  const lang = useAppSelector((s) => s.lang)
  const congLang = useAppSelector((s) => s.congLang)
  const { tp, tu } = useT()
  return useMemo(() => {
    const congCode = congAppCode(congLang)
    const jwCode = lang !== congCode ? APP_TO_JW[lang] : undefined
    return (week: Week) => {
      const merged = localizedWeek(week, jwCode)
      // Mit Variante stehen die Texte in der App-Sprache — ihr Übersetzer ist
      // `tu`, derselbe, der auch Namen und Rollen übersetzt.
      return merged === week ? { week, tpw: tp } : { week: merged, tpw: tu }
    }
  }, [lang, congLang, tp, tu])
}
