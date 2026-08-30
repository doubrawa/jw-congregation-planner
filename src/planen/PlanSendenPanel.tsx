import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { loadAndHydrate } from '../app/hydrate'
import { offeneMeldungen, zuletztGesendet } from '../data/plan-versand'
import { relativeZeit } from '../i18n/zeit'
import { fill, useT } from '../i18n/useT'
import { sendPlan } from '../lib/data'

/**
 * Bis zu so vielen Namen lohnt die Aufzählung; darüber steht nur die Zahl.
 *
 * Gemessen an der Demo-Woche: frisch geplant sind es 26 Namen — eine Wand, die
 * den Knopf nach unten schiebt und niemandem etwas sagt. Interessant wird die
 * Liste erst zum Schluss, wenn nur noch ein paar fehlen.
 */
const NAMEN_GRENZE = 8

/**
 * „Plan senden" — der Knopf, mit dem der Planer eine fertige Woche freigibt.
 *
 * **Warum es diesen Knopf gibt.** Bis hierher erfuhr die eingeteilte Person von
 * ihrer Zuteilung gar nichts: Die Mitteilung „Zuteilung gesendet" ging an die
 * *Planer*, nicht an sie (in T74 gemessen und vertagt). Sie erfuhr es
 * frühestens über die zeitliche Erinnerung, also `first` Tage vor der
 * Zusammenkunft.
 *
 * **Warum auf Knopfdruck und nicht bei jedem Klick.** Planen ist eine Sitzung,
 * kein Einzelakt: Eine Woche hat gut 35 Plätze, und bis der Plan steht, wird
 * umsortiert. Bei sofortigem Versand ginge für jeden Zwischenstand eine
 * Nachricht hinaus. Der Planer entscheidet, wann er fertig ist.
 *
 * Der Knopf gilt für die **ganze Woche** — beide Zusammenkünfte und die
 * Treffpunkte —, nicht für den gerade gewählten Reiter. Deshalb steht es auch
 * so auf ihm; sonst hielte man ihn für eine Aktion des Reiters, unter dem er
 * gerade steht.
 */
export function PlanSendenPanel() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [laeuft, setLaeuft] = useState(false)
  /*
   * Namen ohne App-Konto aus dem letzten Versand — **mit der Woche, zu der sie
   * gehören**.
   *
   * Sie stehen im Tagebuch wie alle anderen — sonst zeigte der Knopf für sie
   * auf ewig „noch nicht gesendet", obwohl niemand sie erreichen kann. Damit
   * verschwinden sie aber aus der Liste oben, und genau sie sind die, die der
   * Planer jetzt persönlich ansprechen muss. Also bleiben sie stehen, bis er
   * die Woche wechselt.
   *
   * Die Kennung gehört dazu, weil der Baustein beim Blättern **nicht** neu
   * aufgesetzt wird: Ohne sie standen die Namen aus Woche 37 unter Woche 38, wo
   * die Genannten gar nichts haben. Verglichen statt zurückgesetzt, weil ein
   * Effekt hier nur eine zweite Buchführung über dasselbe wäre.
   */
  const [ohneKontoStand, setOhneKonto] = useState<{ woche: string; namen: string[] } | null>(null)

  const week = state.weeks[state.week]

  /*
   * **Vor** den Abbrüchen unten, weil Hooks nicht bedingt laufen dürfen —
   * daher auch der Umweg über `week ? … : …` statt eines frühen `return`.
   *
   * Gemerkt, weil beides teuer und der Anlass häufig ist: Der Baustein hängt am
   * ganzen Zustand und rechnet damit bei **jedem** Dispatch neu — auch bei jedem
   * Tastenanschlag in einem Freitextfeld nebenan. `offeneMeldungen` läuft dabei
   * über alle gut 35 Plätze der Woche, `zuletztGesendet` über das gesamte
   * Tagebuch, das mit jedem Versand wächst.
   */
  const offen = useMemo(
    () =>
      week
        ? offeneMeldungen(
            week,
            state.fsWeeks[state.week],
            state.week,
            state.fsBase,
            state.services,
            state.confirmations,
            state.sentLog,
          )
        : [],
    [week, state.fsWeeks, state.week, state.fsBase, state.services, state.confirmations, state.sentLog],
  )
  const zuletzt = useMemo(
    () => (week ? zuletztGesendet(state.sentLog, week.start) : null),
    [state.sentLog, week],
  )

  // Nur Planer: `send-plan` weist jeden anderen ab (403). Ein Knopf, der
  // verlässlich scheitert, ist schlimmer als keiner.
  //
  // Und nur auf frischem Stand: Nach einem gescheiterten Laden zeigt die App
  // die Momentaufnahme und lässt keine Änderungen zu (`staleAt`). Der Knopf
  // liefe daran vorbei — er ruft die Function unmittelbar auf, nicht über den
  // Reducer — und gäbe eine Woche frei, die der Planer so gar nicht vor sich
  // hat.
  if (!state.planner || state.staleAt) return null
  if (!week) return null

  // Nur die Namen dieser Woche: Beim Blättern bleibt der Baustein stehen, und
  // ohne den Vergleich stünden die Nachzügler von Woche 37 unter Woche 38.
  const ohneKonto = ohneKontoStand?.woche === week.start ? ohneKontoStand.namen : []
  // Je Person einmal: Wer drei Plätze hat, steht nicht dreimal da.
  const namen = [...new Set(offen.map((o) => o.name))]
  /*
   * `!== 0` statt eines Größenvergleichs, und das hat einen Grund außerhalb
   * der Fachlichkeit: `beschriftungen-quelle.test.ts` sucht sichtbaren Text
   * zwischen einer schließenden und einer öffnenden spitzen Klammer. Ein
   * Vergleich der Form „größer null und kleinergleich Grenze" liest sich für
   * diesen Wächter wie ein Satz im JSX. Gemeint ist ohnehin dasselbe.
   */
  const namenZeigen = namen.length !== 0 && namen.length <= NAMEN_GRENZE

  // Nichts zu tun und nie etwas gesendet → gar nichts anzeigen. Der Knopf
  // erschiene sonst an einer leeren Woche, in der es nichts freizugeben gibt.
  if (offen.length === 0 && !zuletzt) return null

  const senden = async (): Promise<void> => {
    setLaeuft(true)
    const res = await sendPlan(week.start)
    setLaeuft(false)
    if (!res) {
      dispatch({ type: 'showToast', text: t.toastSpeicherFehler })
      return
    }
    setOhneKonto({ woche: week.start, namen: res.ohneKonto })
    dispatch({
      type: 'showToast',
      text:
        res.personen === 0
          ? t.toastPlanNichts
          : fill(t.toastPlanGesendet, { n: res.personen }),
    })
    // Das Tagebuch steht jetzt anders da als vor dem Druck — ohne Nachladen
    // zeigte der Knopf weiter „12 noch nicht gesendet", obwohl sie draußen sind.
    if (state.userId) void loadAndHydrate(dispatch, state.userId, { silent: true })
  }

  return (
    <div className="plan-banner-box plan-senden">
      <div className="plan-banner-head">
        <span className="plan-banner-title">{t.planSendenTitle}</span>
        {offen.length > 0 && <span className="plan-banner-count">{offen.length}</span>}
      </div>
      <p className="plan-senden-hint">
        {offen.length > 0 ? fill(t.planSendenOffen, { n: offen.length }) : t.planSendenAlle}
      </p>
      {/* Wer noch nichts weiß, mit Namen — aber nur, solange die Liste etwas
          nützt. Eine frisch geplante Woche hat gut 35 Plätze und damit gegen
          dreißig Namen; das ist eine Wand, durch die niemand liest, und sie
          verdeckt den Knopf darunter. Bei den letzten paar Nachzüglern dagegen
          ist die Frage genau „wer fehlt noch?" — dann steht es da. */}
      {namenZeigen && (
        <div className="plan-senden-namen" dir="auto">
          {namen.join(' · ')}
        </div>
      )}
      {zuletzt && (
        <p className="plan-senden-zuletzt">
          {fill(t.planSendenZuletzt, { zeit: relativeZeit(zuletzt, state.lang) })}
        </p>
      )}
      {/* Wer kein Konto hat, ist auf keinem Weg zu erreichen — den muss der
          Planer selbst ansprechen. Steht hier und nicht nur im Toast: ein
          Hinweis, der nach drei Sekunden weg ist, hilft dabei nicht. */}
      {ohneKonto.length > 0 && (
        <p className="plan-senden-ohne" dir="auto">
          {fill(t.planSendenOhneKonto, { namen: ohneKonto.join(' · ') })}
        </p>
      )}
      <button
        type="button"
        className="plan-auto-btn plan-auto-btn--primary"
        disabled={laeuft || offen.length === 0}
        onClick={() => void senden()}
      >
        {laeuft ? tu('…') : t.planSenden}
      </button>
    </div>
  )
}
