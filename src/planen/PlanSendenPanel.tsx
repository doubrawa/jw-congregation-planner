import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { loadAndHydrate } from '../app/hydrate'
import { useKalendertag } from '../app/useKalendertag'
import { fsTaskKey } from '../data/fs'
import { fromIso } from '../data/meeting-dates'
import { type OffeneMeldung, offeneMeldungen, zuletztGesendet } from '../data/plan-versand'
import { rechteVon } from '../data/rechte'
import { ozOffeneMeldungen, ozZuletztGesendet } from '../data/zeugnis'
import { relativeZeit } from '../i18n/zeit'
import { fill, useT } from '../i18n/useT'
import { type PlanVersand, sendPlan, sendZeugnisPlan } from '../lib/data'
import type { Week } from '../data/types'

/**
 * Bis zu so vielen Namen lohnt die Aufzählung; darüber steht nur die Zahl.
 *
 * Gemessen an der Demo-Woche: frisch geplant sind es 26 Namen — eine Wand, die
 * den Knopf nach unten schiebt und niemandem etwas sagt. Interessant wird die
 * Liste erst zum Schluss, wenn nur noch ein paar fehlen.
 */
const NAMEN_GRENZE = 8

/**
 * Der Aufruf, der sendet — mit der Kennung, zu der er gehört. Als Aufruf-
 * Signatur statt als Pfeiltyp: Der Pfeil vor dem Rückgabetyp sähe für
 * `beschriftungen-quelle.test.ts` aus wie ein Textknoten im JSX.
 */
interface Versand {
  (kennung: string): Promise<PlanVersand | null>
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
function useSenden(kennung: string | null, versand: Versand) {
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
 * Eine Woche senden — der Wochen-Knopf wie der der Gruppe. Der Kalendertag
 * geht mit: Die Function soll denselben Tag meinen wie die Zahl am Knopf.
 */
function useWocheSenden(week: Week | undefined, tag: string) {
  return useSenden(week?.start ?? null, (start) => sendPlan(start, tag))
}

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
  const { state } = useApp()
  const { t } = useT()
  const week = state.weeks[state.week]
  /*
   * Der Kalendertag, mit dem gezählt **und** gesendet wird: Vergangenes geht
   * nicht mehr hinaus, und die Function soll denselben Tag meinen wie die Zahl
   * am Knopf — sonst ginge sie nach dem Drücken nicht auf null.
   */
  const tag = useKalendertag()
  const { laeuft, ohneKonto, senden } = useWocheSenden(week, tag)

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
            state.services,
            state.confirmations,
            state.sentLog,
            state.congregation.times,
            fromIso(tag),
          )
        : [],
    [
      week,
      state.fsWeeks,
      state.week,
      state.services,
      state.confirmations,
      state.sentLog,
      state.congregation.times,
      tag,
    ],
  )
  const zuletzt = useMemo(
    () => (week ? zuletztGesendet(state.sentLog, week.start) : null),
    [state.sentLog, week],
  )

  // Nur, wer zuteilt — Admin oder Planer (4.10.2026): `send-plan` sendet für
  // jeden anderen höchstens die Treffpunkte seiner Gruppe (`GruppeSendenPanel`).
  // Ein Knopf, der die ganze Woche verspricht, wäre dort falsch.
  //
  // Und nur auf frischem Stand: Nach einem gescheiterten Laden zeigt die App
  // die Momentaufnahme und lässt keine Änderungen zu (`staleAt`). Der Knopf
  // liefe daran vorbei — er ruft die Function unmittelbar auf, nicht über den
  // Reducer — und gäbe eine Woche frei, die der Planer so gar nicht vor sich
  // hat.
  if (!rechteVon(state).zuteilen || state.staleAt) return null
  if (!week) return null

  return (
    <PlanSendenAnzeige
      offen={offen}
      zuletzt={zuletzt}
      ohneKonto={ohneKonto}
      laeuft={laeuft}
      offenText={t.planSendenOffen}
      alleText={t.planSendenAlle}
      onSenden={() => void senden()}
    />
  )
}

/**
 * **„Plan senden" für den Gruppenaufseher** (4.10.2026): die Treffpunkte
 * seiner Gruppe in dieser Woche, nicht die ganze Woche.
 *
 * Er ändert Zeit, Ort und Leiter seiner Treffpunkte selbst. Ohne eigenen Knopf
 * erfuhr ein neuer Leiter davon erst durch die Erinnerung kurz vorher — oder
 * wenn ein Admin die ganze Woche noch einmal sendete. Derselbe Aufruf wie für
 * die Woche (`sendPlan`): Welche Plätze dazugehören, entscheidet `send-plan`
 * am Recht des Aufrufers, nicht der Knopf.
 */
export function GruppeSendenPanel({ gruppe }: { gruppe: string }) {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const week = state.weeks[state.week]
  const fsWeek = state.fsWeeks[state.week]
  const { laeuft, ohneKonto, senden } = useWocheSenden(week, tag)

  const offen = useMemo(() => {
    if (!week || !fsWeek) return []
    // Nur die Treffpunkte der eigenen Gruppe: dieselbe Auswahl wie der Server.
    const eigene = new Set(fsWeek.filter((i) => i.grp === gruppe).map((i) => fsTaskKey(week.start, i.id)))
    return offeneMeldungen(week, fsWeek, state.services, state.confirmations, state.sentLog, state.congregation.times, fromIso(tag)).filter(
      (o) => eigene.has(o.key),
    )
  }, [week, fsWeek, gruppe, state.services, state.confirmations, state.sentLog, state.congregation.times, tag])

  if (state.staleAt || !week) return null

  return (
    <PlanSendenAnzeige
      offen={offen}
      // „Zuletzt gesendet" nennt das Tagebuch für die ganze Woche — für die
      // eigene Gruppe gibt es keine eigene Zeit. Weggelassen statt falsch.
      zuletzt={null}
      ohneKonto={ohneKonto}
      laeuft={laeuft}
      offenText={t.fsSendenOffen}
      alleText={t.fsSendenAlle}
      onSenden={() => void senden()}
    />
  )
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
 * „Plan senden" im öffentlichen Zeugnisgeben (T120) — über **alle** kommenden
 * Schichten, nicht je Woche: Die Schichten reichen ein Vierteljahr voraus, die
 * meisten Einträge entstehen durch Selbsteintragen, und wer zugeteilt wurde,
 * soll es erfahren, ohne dass der Planer Woche für Woche blättert.
 */
export function ZeugnisSendenPanel() {
  const { state } = useApp()
  const { t } = useT()
  // Ein Kalendertag für beides: die Vorschau hier und den Versand.
  const tag = useKalendertag()
  // Namen ohne Konto aus dem letzten Versand — bis zum nächsten bleiben sie stehen.
  const { laeuft, ohneKonto, senden } = useSenden('oz', () => sendZeugnisPlan(tag))

  const offen = useMemo(
    () =>
      ozOffeneMeldungen(
        state.ozTermine,
        state.ozEintraege,
        state.persons,
        state.confirmations,
        state.sentLog,
        fromIso(tag),
      ),
    [state.ozTermine, state.ozEintraege, state.persons, state.confirmations, state.sentLog, tag],
  )
  const zuletzt = useMemo(() => ozZuletztGesendet(state.sentLog), [state.sentLog])

  // Wie bei der Woche: nur, wer zuteilt, nur auf frischem Stand.
  if (!rechteVon(state).zuteilen || state.staleAt) return null

  return (
    <PlanSendenAnzeige
      offen={offen}
      zuletzt={zuletzt}
      ohneKonto={ohneKonto}
      laeuft={laeuft}
      offenText={t.ozSendenOffen}
      alleText={t.ozSendenAlle}
      onSenden={() => void senden()}
    />
  )
}

/** Die Box selbst — für die Woche wie für das öffentliche Zeugnisgeben dieselbe. */
function PlanSendenAnzeige({
  offen,
  zuletzt,
  ohneKonto,
  laeuft,
  offenText,
  alleText,
  onSenden,
}: {
  offen: readonly OffeneMeldung[]
  zuletzt: string | null
  ohneKonto: readonly string[]
  laeuft: boolean
  /** Hinweis bei offenen Meldungen, mit `{n}`. */
  offenText: string
  /** Hinweis, wenn alle Bescheid wissen. */
  alleText: string
  onSenden: () => void
}) {
  const { state } = useApp()
  const { t, tu } = useT()
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

  return (
    <div className="plan-banner-box plan-senden">
      <div className="plan-banner-head">
        <span className="plan-banner-title">{t.planSendenTitle}</span>
        {offen.length > 0 && <span className="plan-banner-count">{offen.length}</span>}
      </div>
      <p className="plan-senden-hint">
        {offen.length > 0 ? fill(offenText, { n: offen.length }) : alleText}
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
        onClick={onSenden}
      >
        {laeuft ? tu('…') : t.planSenden}
      </button>
    </div>
  )
}
