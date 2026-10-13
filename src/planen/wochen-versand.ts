import { useMemo, useState } from 'react'
import { useApp, type AppState } from '../app/context'
import { loadAndHydrate } from '../app/hydrate'
import { fsInGruppe, fsTaskKey } from '../data/fs'
import { fromIso } from '../data/meeting-dates'
import { type OffeneWochenMeldung, offeneMeldungen, zuletztGesendet, zuletztGesendetFuer } from '../data/plan-versand'
import { rechteVon, treffpunktGruppe } from '../data/rechte'
import type { Week } from '../data/types'
import { fill, useT } from '../i18n/useT'
import { type PlanVersand, sendPlan } from '../lib/data'

/**
 * **Der Versand eines Plans** — was die Sendeknöpfe teilen: der Aktionsleiste
 * und des Blatts „Plan senden" (T121) und des öffentlichen Zeugnisgebens
 * (`PlanSendenPanel.tsx`). Eigene Datei, weil es Hooks sind und
 * keine Bausteine: Neben Komponenten exportiert, hielten sie das schnelle
 * Neuladen beim Entwickeln an.
 */

/** Der Aufruf, der sendet — mit der Kennung, zu der er gehört. */
export interface Versand {
  (kennung: string): Promise<PlanVersand | null>
}

/** Was ein Sendeknopf über seinen Versand weiß: ob er läuft, wen er nicht erreicht hat, und wie man sendet. */
export interface VersandStand {
  laeuft: boolean
  /** Namen ohne App-Konto aus dem letzten Versand dieser Kennung. */
  ohneKonto: string[]
  senden(): Promise<void>
}

/**
 * Senden — für die Woche, die Gruppe und das öffentliche Zeugnisgeben derselbe
 * Weg: senden, das Ergebnis melden, die Namen ohne Konto festhalten.
 *
 * Namen ohne App-Konto aus dem letzten Versand bleiben stehen — **mit der
 * Kennung, zu der sie gehören** (der Woche; das Zeugnisgeben hat eine feste).
 * Sie stehen im Tagebuch wie alle anderen — sonst zeigte der Knopf für sie auf
 * ewig „noch nicht gesendet", obwohl niemand sie erreichen kann. Damit
 * verschwinden sie aber aus der Liste oben, und genau sie sind die, die der
 * Planer jetzt persönlich ansprechen muss. Also bleiben sie stehen, bis er die
 * Woche wechselt.
 *
 * Die Kennung gehört dazu, weil der Baustein beim Blättern **nicht** neu
 * aufgesetzt wird: Ohne sie standen die Namen aus Woche 37 unter Woche 38, wo
 * die Genannten gar nichts haben. Verglichen statt zurückgesetzt, weil ein
 * Effekt hier nur eine zweite Buchführung über dasselbe wäre. Ohne Kennung
 * (keine Woche geladen) gibt es nichts zu senden.
 *
 * Bis zum 5.10.2026 stand der Weg für die Woche und für das Zeugnisgeben je
 * einmal da.
 */
export function useSenden(kennung: string | null, versand: Versand): VersandStand {
  const [laeuft, setLaeuft] = useState(false)
  const [ohneKontoStand, setOhneKonto] = useState<{ kennung: string; namen: string[] } | null>(null)
  const versandGemeldet = useVersandGemeldet()
  const senden = async (): Promise<void> => {
    if (kennung === null) return
    setLaeuft(true)
    const res = await versand(kennung)
    setLaeuft(false)
    if (res) setOhneKonto({ kennung, namen: res.ohneKonto })
    versandGemeldet(res)
  }
  const ohneKonto = kennung !== null && ohneKontoStand?.kennung === kennung ? ohneKontoStand.namen : []
  return { laeuft, ohneKonto, senden }
}

/**
 * Nach dem Druck: das Ergebnis melden und nachladen.
 *
 * Das Tagebuch steht jetzt anders da als vor dem Druck — ohne Nachladen zeigte
 * der Knopf weiter „12 noch nicht gesendet", obwohl sie draußen sind.
 */
function useVersandGemeldet(): (res: { personen: number } | null) => void {
  const { state, dispatch } = useApp()
  const { t } = useT()
  return (res) => {
    if (!res) {
      dispatch({ type: 'showToast', text: t.toastSpeicherFehler })
      return
    }
    dispatch({
      type: 'showToast',
      text: res.personen === 0 ? t.toastPlanNichts : fill(t.toastPlanGesendet, { n: res.personen }),
    })
    if (state.userId) void loadAndHydrate(dispatch, state.userId, { silent: true })
  }
}

/**
 * Eine Woche senden — der Wochen-Knopf wie der der Gruppe. Der Kalendertag
 * geht mit: Die Function soll denselben Tag meinen wie die Zahl am Knopf.
 */
export function useWocheSenden(week: Week | undefined, tag: string): VersandStand {
  return useSenden(week?.start ?? null, (start) => sendPlan(start, tag))
}

/**
 * **Was „Plan senden" für die gezeigte Woche noch zu tun hat**: die offenen
 * Meldungen und wann zuletzt gesendet wurde — für die Zahl an der
 * Aktionsleiste und das Blatt „Plan senden" derselbe Stand.
 *
 * `gruppe`: Der Gruppenaufseher, der nicht zuteilt, sendet nur die Treffpunkte
 * seiner Gruppe — gezählt wird dieselbe Auswahl, die der Server trifft, und
 * „zuletzt gesendet" meint den jüngsten Versand an sie: Das Tagebuch führt
 * jeden Platz einzeln (`zuletztGesendetFuer`).
 *
 * `tag` ist der Kalendertag, mit dem gezählt **und** gesendet wird
 * (`useKalendertag`): Vergangenes geht nicht mehr hinaus, und die Function
 * soll denselben Tag meinen wie die Zahl am Knopf — sonst ginge sie nach dem
 * Drücken nicht auf null.
 *
 * Gemerkt, weil beides teuer und der Anlass häufig ist: Wer das nutzt, hängt am
 * ganzen Zustand und rechnet damit bei **jedem** Dispatch neu — auch bei jedem
 * Tastenanschlag in einem Freitextfeld nebenan. `offeneMeldungen` läuft dabei
 * über alle gut 35 Plätze der Woche, `zuletztGesendet` über das gesamte
 * Tagebuch, das mit jedem Versand wächst.
 */
export function useOffeneMeldungen(
  tag: string,
  gruppe: string | null = null,
): {
  week: Week | undefined
  offen: OffeneWochenMeldung[]
  zuletzt: string | null
} {
  const { state } = useApp()
  const week = state.weeks[state.week]
  const fsWeek = state.fsWeeks[state.week]
  // Beim Gruppenaufseher die Aufgaben seiner Treffpunkte, sonst die ganze Woche.
  const eigene = useMemo(
    () =>
      week && gruppe !== null
        ? new Set((fsWeek ?? []).filter((i) => fsInGruppe(i, gruppe)).map((i) => fsTaskKey(week.start, i.id)))
        : null,
    [week, fsWeek, gruppe],
  )
  const offen = useMemo(() => {
    if (!week) return []
    const alle = offeneMeldungen(
      week,
      fsWeek,
      state.services,
      state.confirmations,
      state.sentLog,
      state.congregation.times,
      fromIso(tag),
    )
    return eigene ? alle.filter((o) => eigene.has(o.key)) : alle
  }, [week, fsWeek, eigene, state.services, state.confirmations, state.sentLog, state.congregation.times, tag])
  const zuletzt = useMemo(() => {
    if (!week) return null
    return eigene ? zuletztGesendetFuer(state.sentLog, eigene) : zuletztGesendet(state.sentLog, week.start)
  }, [state.sentLog, week, eigene])
  return { week, offen, zuletzt }
}

/**
 * **Darf hier die Woche gesendet werden?** Nur, wer zuteilt — Admin oder
 * Planer (4.10.2026): `send-plan` sendet für jeden anderen höchstens die
 * Treffpunkte seiner Gruppe (`sendeUmfang`). Ein Knopf, der die ganze Woche
 * verspricht, wäre dort falsch.
 *
 * Und nur auf frischem Stand: Nach einem gescheiterten Laden zeigt die App die
 * Momentaufnahme und lässt keine Änderungen zu (`staleAt`). Der Knopf liefe
 * daran vorbei — er ruft die Function unmittelbar auf, nicht über den Reducer —
 * und gäbe eine Woche frei, die der Planer so gar nicht vor sich hat.
 */
export function darfWocheSenden(state: AppState): boolean {
  return rechteVon(state).zuteilen && !state.staleAt
}

/**
 * **Was hier gesendet werden darf** (T121, Phase 5e): die ganze Woche
 * (`gruppe: null`) für den, der zuteilt (`darfWocheSenden`); die Treffpunkte
 * der eigenen Gruppe für den Gruppenaufseher, der nicht zuteilt (4.10.2026) —
 * mehr sendet `send-plan` für ihn ohnehin nicht. Sonst nichts: kein Recht oder
 * nur die Momentaufnahme (`staleAt`).
 */
export function sendeUmfang(state: AppState): { gruppe: string | null } | null {
  if (darfWocheSenden(state)) return { gruppe: null }
  const gruppe = treffpunktGruppe(rechteVon(state))
  return gruppe !== null && !state.staleAt ? { gruppe } : null
}
