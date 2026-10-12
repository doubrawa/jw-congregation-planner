import { useMemo } from 'react'
import { useApp } from '../app/context'
import { taskKeyWeek, wochenIndex } from '../data/planning'
import { besetztVon, besetzung, saalLagen, type SaalLage } from '../data/saal'
import type { MyTask } from '../data/types'
import { useT } from '../i18n/useT'

/**
 * Der Saal zu einer eigenen Aufgabe (T121): die Besetzung ihrer Zusammenkunft
 * mit dem eigenen Platz — oder `null`, wo es keine Zusammenkunft gibt
 * (Treffpunkt, Zeugnisgeben) oder ihre Woche nicht geladen ist.
 */
export function useSaal(task: MyTask | undefined): { lagen: SaalLage[]; label: string } | null {
  const { state } = useApp()
  const { t } = useT()
  return useMemo(() => {
    const ort = task ? taskKeyWeek(task.id) : null
    const week = ort ? state.weeks[wochenIndex(state.weeks, ort.woche)] : undefined
    if (!task || !ort || !week) return null
    const b = besetzung(week[ort.tab], state.services, state.confirmations, ort.woche, ort.tab, task.id)
    const { besetzt, gesamt } = besetztVon(b)
    const label = [`${t.saalBesetzung}: ${besetzt}/${gesamt}`, b.du ? t.saalDeinPlatz : ''].filter(Boolean).join(' · ')
    return { lagen: saalLagen(b), label }
  }, [task, state.weeks, state.services, state.confirmations, t])
}
