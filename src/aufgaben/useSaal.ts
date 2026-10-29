import { useMemo } from 'react'
import { useApp } from '../app/context'
import { taskKeyWeek, wochenIndex } from '../data/planning'
import { besetztVon, besetzung, LAGE_DER_ZUSAGE, saalLagen, type DuLage, type SaalLage } from '../data/saal'
import type { MyTask } from '../data/types'
import { besetzungText, useT } from '../i18n/useT'

/**
 * Der Saal zu einer eigenen Aufgabe (T121): die Besetzung ihrer Zusammenkunft
 * mit dem eigenen Platz — oder `null`, wo es keine Zusammenkunft gibt
 * (Treffpunkt, Trolley) oder ihre Woche nicht geladen ist. `du` ist der Stand
 * der eigenen Zusage: Mit ihr füllt sich der eigene Platz (29.10.2026).
 */
export function useSaal(task: MyTask | undefined): { lagen: SaalLage[]; label: string; du: DuLage } | null {
  const { state } = useApp()
  const { t } = useT()
  return useMemo(() => {
    const ort = task ? taskKeyWeek(task.id) : null
    const week = ort ? state.weeks[wochenIndex(state.weeks, ort.woche)] : undefined
    if (!task || !ort || !week) return null
    const b = besetzung(week[ort.tab], state.services, state.confirmations, ort.woche, ort.tab, task.id)
    const { besetzt, gesamt } = besetztVon(b)
    const label = [besetzungText(t, besetzt, gesamt), b.du ? t.saalDeinPlatz : ''].filter(Boolean).join(' · ')
    return { lagen: saalLagen(b), label, du: LAGE_DER_ZUSAGE[task.status] }
  }, [task, state.weeks, state.services, state.confirmations, t])
}
