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
import { useApp } from '../app/context'
import { localizedWeek } from '../data/localize'
import type { Week } from '../data/types'
import { APP_TO_JW, congAppCode } from './langs'
import { makeTr } from './translate'
import { dict, type Dict } from './ui'

export interface I18n {
  t: Dict
  tu: (s: string) => string
  tp: (s: string) => string
  /** true, wenn die Versammlungssprache keine Programmübersetzung hat. */
  progFallback: boolean
}

/** Platzhalter {n}, {name}, {m} … in einer Übersetzung ersetzen. */
export function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? ''))
}

const identity = (s: string) => s

export function useT(): I18n {
  const { state } = useApp()
  return useMemo(() => {
    const congCode = congAppCode(state.congLang)
    return {
      t: dict(state.lang),
      tu: state.lang === 'de' ? identity : makeTr(state.lang),
      tp: congCode && congCode !== 'de' ? makeTr(congCode) : identity,
      progFallback: !congCode,
    }
  }, [state.lang, state.congLang])
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
  const { state } = useApp()
  const { tp } = useT()
  return useMemo(() => {
    if (!week) return { week, tpw: tp }
    const congCode = congAppCode(state.congLang)
    const jwCode = state.lang !== congCode ? APP_TO_JW[state.lang] : undefined
    const merged = localizedWeek(week, jwCode)
    if (merged === week) return { week, tpw: tp }
    return { week: merged, tpw: state.lang === 'de' ? identity : makeTr(state.lang) }
  }, [week, state.lang, state.congLang, tp])
}
