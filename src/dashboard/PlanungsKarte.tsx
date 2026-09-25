import { useMemo } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { fromIso } from '../data/meeting-dates'
import { planungsstand, type Wochenstand } from '../data/planungsstand'
import { useWochenImport } from '../einstellungen/useWochenImport'
import { LOCALES } from '../i18n/langs'
import { fill, useProgWeeks, useT } from '../i18n/useT'

/**
 * **Die Planungs-Karte** — was der Planer in den kommenden Wochen noch zu tun
 * hat (T95). Nur für Planer; der Start-Bildschirm stellt sie ihm an die erste
 * Stelle.
 *
 * **Eine Zeile je Woche, und nur, wo etwas zu tun ist.** Ein Tipp öffnet Planen
 * auf genau dieser Woche. Die Chips darin heißen wie die Banner, die der Planer
 * dort vorfindet — dasselbe Wort, dieselbe Farbe —, damit er sie wiedererkennt,
 * statt eine zweite Sprache für denselben Stand zu lernen. Die Zahlen gelten für
 * die ganze Woche und nur für das, was noch ansteht; in Planen verteilen sich
 * die Banner auf die Reiter (siehe `planungsstand.ts`). Die Form „Titel + Zahl"
 * hat dabei kein Pluralproblem: „1 Konflikte" stand bis hierher auf der alten
 * Kachel, und in Sprachen mit drei Pluralformen wäre jede feste Wendung
 * irgendwo falsch (siehe T96).
 *
 * **Reichen die Programme nicht mehr weit genug**, steht der Import gleich hier.
 * Der Hinweis verschwindet, sobald der Vorrat wieder reicht — der Knopf ist
 * derselbe wie in den Einstellungen (`useWochenImport`).
 *
 * Ist nichts zu tun, schrumpft die Karte auf eine Zeile — mit dem Zeitraum, für
 * den das gilt. Dann rückt die eigene nächste Aufgabe darunter nach oben.
 */
export function PlanungsKarte() {
  const { state, dispatch } = useApp()
  const abwesend = useAbwesend()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const { importieren, knopf, geladenBis, geladenBisMs } = useWochenImport()
  // Der Tag gehört zu den Abhängigkeiten: „vorbei" rechnet mit ihm, und ohne ihn
  // zählte die gemerkte Karte am Mittwoch noch den Dienstag.
  const tag = useKalendertag()

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
          sendenMoeglich: state.staleAt === null,
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
      state.staleAt,
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
        return { ...w, spanne: p ? p.tpw(p.week.range) : '' }
      }),
    [stand.wochen, state.weeks, progWeek],
  )

  /*
   * Wofür „Alles zugeteilt" gilt: die angesehenen Wochen, als Zeitraum in der
   * Sprache des Lesers. `formatRange` legt Monat und Jahr zusammen, wo sie gleich
   * sind — ohne ein eigenes Wort, das in 34 Sprachen zu übersetzen wäre.
   */
  const zeitraum = useMemo(() => {
    if (!stand.zeitraum) return null
    return new Intl.DateTimeFormat(LOCALES[state.lang], {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC', // Kalendertage, keine Zeitpunkte
    }).formatRange(stand.zeitraum.vonMs, stand.zeitraum.bisMs)
  }, [stand.zeitraum, state.lang])

  if (stand.wochen.length === 0 && !stand.vorratKnapp) {
    return (
      <button
        type="button"
        className="dash-plan"
        onClick={() => dispatch({ type: 'navigate', screen: 'planen' })}
      >
        <span className="dash-plan-body">
          <span className="dash-plan-label">{t.dashPlanung}</span>
          <span className="dash-plan-text">{t.dashAllesZugeteilt}</span>
          {zeitraum && <span className="dash-plan-zeitraum">{zeitraum}</span>}
        </span>
        <span className="dash-plan-arrow" aria-hidden="true">
          ›
        </span>
      </button>
    )
  }

  const oeffnen = (w: Wochenstand): void =>
    dispatch({ type: 'navigate', screen: 'planen', woche: { wi: w.wi, tab: w.tab } })

  return (
    <div className="dash-planung">
      <div className="dash-plan-label">{t.dashPlanung}</div>
      {zeilen.map((w) => (
        <button key={w.wi} type="button" className="dash-plan-woche" onClick={() => oeffnen(w)}>
          <span className="dash-plan-kopf">
            <span className="dash-plan-range">{w.spanne}</span>
            <span className="dash-plan-arrow" aria-hidden="true">
              ›
            </span>
          </span>
          {/* In der Reihenfolge der Banner in Planen: erst was nicht stimmt,
              dann was nicht geht, dann was fehlt, zuletzt der Versand. */}
          <span className="dash-plan-chips">
            {w.konflikte > 0 && <Chip art="konflikte" titel={t.konflikteTitle} n={w.konflikte} />}
            {w.nichtBesetzbar > 0 && (
              <Chip art="engpass" titel={t.engpassTitle} n={w.nichtBesetzbar} />
            )}
            {w.offen > 0 && <Chip art="offen" titel={t.offeneTitle} n={w.offen} />}
            {w.nichtGesendet > 0 && (
              <Chip art="senden" titel={t.planSendenTitle} n={w.nichtGesendet} />
            )}
          </span>
        </button>
      ))}
      {stand.vorratKnapp && (
        <div className="dash-plan-vorrat">
          <span className="dash-plan-vorrat-text">
            {geladenBis ? fill(t.geladenBis, { datum: geladenBis }) : t.geladenNichts}
          </span>
          <button
            type="button"
            className="btn-outline dash-plan-import"
            onClick={() => void importieren()}
          >
            {knopf}
          </button>
        </div>
      )}
    </div>
  )
}

/** Ein Banner aus Planen im Kleinen: sein Titel und seine Zahl. */
function Chip({
  art,
  titel,
  n,
}: {
  art: 'konflikte' | 'engpass' | 'offen' | 'senden'
  titel: string
  n: number
}) {
  return (
    <span className="dash-chip" data-art={art}>
      <span className="dash-chip-titel">{titel}</span>
      <span className="dash-chip-n">{n}</span>
    </span>
  )
}
