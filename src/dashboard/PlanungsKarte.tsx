import { useMemo, type ReactNode } from 'react'
import { zurPlanung } from '../app/bereich'
import { useApp } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { besuchHatKonflikt, besuchStand } from '../data/gruppenbesuche'
import { useBesuchsLage } from '../components/useBesuchsLage'
import { WOCHEN_SPALTE_BREITE, useMedia } from '../components/useMedia'
import { tageSpanne } from '../components/datum-anzeige'
import { fromIso, isoVonKalendertag } from '../data/meeting-dates'
import { planungsstand, type Wochenstand } from '../data/planungsstand'
import type { FsBereich } from '../data/types'
import { fill, programmSpanne, useProgWeeks, useT } from '../i18n/useT'
import { HolenKnopf } from '../planen/ProgrammHolen'
import { useWochenImport } from '../planen/useWochenImport'

/**
 * **Die Planungs-Karte** — was der Planer in den kommenden Wochen noch zu tun
 * hat (T95). Nur für Planer; der Start-Bildschirm stellt sie ihm an die erste
 * Stelle.
 *
 * **Eine Zeile je Woche, und nur, wo etwas zu tun ist.** Ein Tipp öffnet Planen
 * auf genau dieser Woche. Die Chips darin sagen es mit den Wörtern der Wochen
 * beim Planen — „Probleme: 2", „Offen: 3", „Zu senden: 2" (`lageDerWoche`) —,
 * damit der Planer denselben Stand an beiden Stellen wiedererkennt. Bis Phase
 * 10 von T121 trugen sie die Titel der alten Banner in Versalien; die Banner
 * sind seit Phase 5 „Zu klären" beim Planen. Die Zahlen gelten für die ganze
 * Woche und nur für das, was noch ansteht (siehe `planungsstand.ts`). Die Form
 * „Wort: Zahl" hat dabei kein Pluralproblem: „1 Konflikte" stand bis T95 auf
 * der alten Kachel, und in Sprachen mit drei Pluralformen wäre jede feste
 * Wendung irgendwo falsch (siehe T96).
 *
 * **Reichen die Programme nicht mehr weit genug**, steht „Holen" gleich hier.
 * Der Hinweis verschwindet, sobald der Vorrat wieder reicht — der Knopf ist
 * derselbe wie bei den Wochen (`HolenKnopf`). Alle Wochen zeigt „Alle Wochen"
 * über der Karte (Entwurf `GStartPlaner`).
 *
 * Ist nichts zu tun, schrumpft die Karte auf eine Zeile — mit dem Zeitraum, für
 * den das gilt. Dann rückt die eigene nächste Aufgabe darunter nach oben.
 */
export function PlanungsKarte() {
  const { state, dispatch } = useApp()
  const abwesend = useAbwesend()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const { geladenBis, geladenBisMs } = useWochenImport()
  // Der Tag gehört zu den Abhängigkeiten: „vorbei" rechnet mit ihm, und ohne ihn
  // zählte die gemerkte Karte am Mittwoch noch den Dienstag.
  const tag = useKalendertag()
  // Offline (Momentaufnahme) geht nichts hinaus — dann nennt die Karte auch
  // kein „Plan senden".
  const sendenMoeglich = state.staleAt === null

  /*
   * Gemerkt, weil teuer und der Anlass häufig: Der Start hängt am ganzen
   * Zustand und rechnet bei **jedem** Dispatch neu. Hier laufen je Woche
   * Konfliktprüfung, Engpass-Rechnung und die Versand-Vorschau über alle Plätze
   * — für bis zu vier Wochen.
   */
  const stand = useMemo(
    () =>
      planungsstand(
        {
          weeks: state.weeks,
          fsWeeks: state.fsWeeks,
          persons: state.persons,
          services: state.services,
          absences: state.absences,
          abwesend,
          confirmations: state.confirmations,
          sentLog: state.sentLog,
          zeiten: state.congregation.times,
          geladenBisMs,
          sendenMoeglich,
        },
        fromIso(tag),
      ),
    [
      state.weeks,
      state.fsWeeks,
      state.persons,
      state.services,
      state.absences,
      abwesend,
      state.confirmations,
      state.sentLog,
      state.congregation.times,
      geladenBisMs,
      sendenMoeglich,
      tag,
    ],
  )

  /*
   * Die Wochenspanne in der Programm-Anzeigesprache — dieselbe Regel wie der Kopf
   * in Planen (`useProgWeek`), sonst stünde dieselbe Woche vor und nach dem
   * Tippen in zwei Sprachen da.
   */
  const zeilen = useMemo(
    () =>
      stand.wochen.map((w) => {
        const week = state.weeks[w.wi]
        const p = week ? progWeek(week) : null
        return { ...w, spanne: p ? programmSpanne(p) : '' }
      }),
    [stand.wochen, state.weeks, progWeek],
  )

  /*
   * Wofür „Alles zugeteilt" gilt: die angesehenen Wochen, als Zeitraum in der
   * Sprache des Lesers. `formatRange` legt Monat und Jahr zusammen, wo sie gleich
   * sind — ohne ein eigenes Wort, das in jeder Sprache zu übersetzen wäre. Die
   * Grenzen sind Kalendertage (UTC-Mitternacht), über ISO gelesen, damit keine
   * Zeitzone den Tag verschiebt; Zahl und Wort bleiben zusammen (T128).
   */
  const zeitraum = useMemo(
    () =>
      stand.zeitraum
        ? tageSpanne(isoVonKalendertag(stand.zeitraum.vonMs), isoVonKalendertag(stand.zeitraum.bisMs), state.lang, 'tagKurzJahr')
        : null,
    [stand.zeitraum, state.lang],
  )

  /*
   * **Pläne** (T120): Konflikte der Gruppenbesuche — unabhängig vom
   * Vier-Wochen-Fenster der Zeilen darüber, denn ein Besuch liegt oft Monate
   * voraus, und gerade dann lässt sich noch etwas tun (anderer Besucher, andere
   * Woche).
   */
  const lage = useBesuchsLage()
  const besuchsKonflikte = useMemo(
    () => state.gruppenbesuche.filter((b) => besuchHatKonflikt(b, besuchStand(b, lage, fromIso(tag)))).length,
    [lage, state.gruppenbesuche, tag],
  )

  /** In den Predigtdienst beim Planen, gleich in diesen Bereich. */
  const zumBereich = (bereich: FsBereich): void => {
    dispatch({ type: 'setFsBereich', bereich })
    dispatch({ type: 'navigate', screen: 'planen', thema: 'predigtdienst' })
  }

  if (stand.wochen.length === 0 && !stand.vorratKnapp && besuchsKonflikte === 0) {
    return (
      <section className="dash-plan">
        <PlanungKopf />
        <div className="karte">
          <button
            type="button"
            className="dash-plan-woche"
            // Die Karte zählt die Zusammenkünfte — sie öffnet auch dort, nicht im
            // Predigtdienst, falls man zuletzt den angesehen hat (T120).
            onClick={() => dispatch({ type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte' })}
          >
            <span className="dash-plan-kopf">
              <span className="dash-plan-text">{t.dashAllesZugeteilt}</span>
              {zeitraum && <span className="dash-plan-zeitraum">{zeitraum}</span>}
            </span>
            <Zeichen name="weiter" />
          </button>
        </div>
      </section>
    )
  }

  const oeffnen = (w: Wochenstand): void =>
    dispatch({ type: 'navigate', screen: 'planen', woche: { wi: w.wi, tab: w.tab } })

  return (
    <section className="dash-planung">
      <PlanungKopf />
      <div className="karte">
        {zeilen.map((w) => (
          <button key={w.wi} type="button" className="dash-plan-woche" onClick={() => oeffnen(w)}>
            <span className="dash-plan-kopf">
              <span className="dash-plan-range">{w.spanne}</span>
              {/* Mit den Wörtern der Wochen beim Planen (`lageDerWoche`): erst
                  die Probleme — Konflikte und was nicht besetzbar ist —, dann
                  die offenen Plätze, zuletzt der Versand. */}
              <span className="dash-plan-chips">
                {w.konflikte + w.nichtBesetzbar > 0 && (
                  <Chip art="probleme" text={fill(t.lageProbleme, { n: w.konflikte + w.nichtBesetzbar })} />
                )}
                {w.offen > 0 && <Chip art="offen" text={fill(t.lageOffen, { n: w.offen })} />}
                {w.nichtGesendet > 0 && <Chip art="senden" text={fill(t.lageSenden, { n: w.nichtGesendet })} />}
              </span>
            </span>
            <Zeichen name="weiter" />
          </button>
        ))}
        {besuchsKonflikte > 0 && (
          <BereichZeile titel={t.gbTitel} onClick={() => zumBereich('gruppenbesuche')}>
            <Chip art="probleme" text={fill(t.lageProbleme, { n: besuchsKonflikte })} />
          </BereichZeile>
        )}
        {/* Holen dürfen Admin und Planer — wer die Woche plant, holt auch ihr
            Programm (15.10.2026; bis dahin nur der Admin). Die Karte sehen
            ohnehin nur sie (`DashboardScreen`). */}
        {stand.vorratKnapp && (
          <div className="dash-plan-vorrat">
            <span className="dash-plan-vorrat-text">
              {geladenBis ? fill(t.geladenBis, { datum: geladenBis }) : t.geladenNichts}
            </span>
            <HolenKnopf className="knopf-pille" />
          </div>
        )}
      </div>
    </section>
  )
}

/** Die Überschrift der Karte, rechts „Alle Wochen" (Entwurf `GStartPlaner`). */
function PlanungKopf() {
  const { dispatch } = useApp()
  const { t } = useT()
  const mitSpalte = useMedia(WOCHEN_SPALTE_BREITE)
  return (
    <div className="dash-plan-titel">
      <h2 className="abschnitt-titel">{t.dashPlanung}</h2>
      <button type="button" className="dash-plan-alle" onClick={() => dispatch(zurPlanung(mitSpalte))}>
        {t.alleWochen}
      </button>
    </div>
  )
}

/**
 * Eine Zeile für einen Plan ohne Woche (Gruppenbesuche): sein Titel und
 * darunter, was ansteht (`Chip`). Gebaut wie die Zeile einer Woche darüber;
 * ein Tipp führt in den Plan.
 */
function BereichZeile({ titel, onClick, children }: { titel: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="dash-plan-woche" onClick={onClick}>
      <span className="dash-plan-kopf">
        <span className="dash-plan-range">{titel}</span>
        <span className="dash-plan-chips">{children}</span>
      </span>
      <Zeichen name="weiter" />
    </button>
  )
}

/** Was ansteht, im Kleinen — „Probleme: 2", „Offen: 3", „Zu senden: 2". */
function Chip({ art, text }: { art: 'probleme' | 'offen' | 'senden'; text: string }) {
  return (
    <span className="dash-chip" data-art={art}>
      {text}
    </span>
  )
}
