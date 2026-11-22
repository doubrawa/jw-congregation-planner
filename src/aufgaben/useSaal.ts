import { useMemo } from 'react'
import { useApp } from '../app/context'
import { taskKeyWeek, wochenIndex } from '../data/planung/schluessel'
import { rechteVon } from '../data/rechte'
import { besetztVon, besetzung, LAGE_DER_ZUSAGE, saalLagen, type DuLage, type SaalLage } from '../data/saal'
import type { MyTask } from '../data/types'
import { besetzungText, useT } from '../i18n/useT'

/**
 * Der Saal zu einer eigenen Aufgabe: die Besetzung ihrer Zusammenkunft mit dem
 * eigenen Platz — oder `null`, wo es keine Zusammenkunft gibt (Treffpunkt,
 * Trolley) oder ihre Woche nicht geladen ist. `du` ist der Stand der eigenen
 * Zusage: Mit ihr füllt sich der eigene Platz.
 *
 * **Nur wer plant, sieht ihn:** Wie weit ein Abend besetzt ist, ist der Stand
 * der Planung — der Verkündiger kann daran nichts tun. Gefragt wird hier und
 * nicht an jeder Stelle, die ihn zeigt: die große Karte auf dem Start und das
 * Blatt einer Aufgabe müssen gleich entscheiden. Wie überall gilt die Ansicht
 * zum Testen (`rechteVon`).
 *
 * **Eine Absage steht rot, auch an einem fremden Platz:** Wer den Saal sieht,
 * plant und kann sie beheben. Blass wie „wartet" hielte er den Abend für
 * besser besetzt, als er ist.
 */
export function useSaal(task: MyTask | undefined): { lagen: SaalLage[]; label: string; du: DuLage } | null {
  const { state } = useApp()
  const { t } = useT()
  const { zuteilen } = rechteVon(state)
  return useMemo(() => {
    if (!task || !zuteilen) return null
    const ort = taskKeyWeek(task.id)
    const week = ort ? state.weeks[wochenIndex(state.weeks, ort.woche)] : undefined
    if (!ort || !week) return null
    const b = besetzung(week[ort.tab], state.services, state.confirmations, state.persoenlich, ort.woche, ort.tab, task.id)
    const { besetzt, gesamt } = besetztVon(b)
    const label = [besetzungText(t, besetzt, gesamt), b.du ? t.saalDeinPlatz : ''].filter(Boolean).join(' · ')
    return { lagen: saalLagen(b), label, du: LAGE_DER_ZUSAGE[task.status] }
  }, [task, zuteilen, state.weeks, state.services, state.confirmations, state.persoenlich, t])
}
