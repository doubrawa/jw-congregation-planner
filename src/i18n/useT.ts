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
import { congAppCode } from './langs'
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
