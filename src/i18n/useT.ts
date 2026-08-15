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
import type { Week } from '../data/types'
import { APP_TO_JW, congAppCode } from './langs'
import { makeTr } from './translate'
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

/** Platzhalter {n}, {name}, {m} … in einer Übersetzung ersetzen. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
}

const identity = (s: string) => s

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
  const lang = useAppSelector((s) => s.lang)
  const congLang = useAppSelector((s) => s.congLang)
  const { tp } = useT()
  return useMemo(() => {
    if (!week) return { week, tpw: tp }
    const congCode = congAppCode(congLang)
    const jwCode = lang !== congCode ? APP_TO_JW[lang] : undefined
    const merged = localizedWeek(week, jwCode)
    if (merged === week) return { week, tpw: tp }
    return { week: merged, tpw: lang === 'de' ? identity : makeTr(lang) }
  }, [week, lang, congLang, tp])
}
