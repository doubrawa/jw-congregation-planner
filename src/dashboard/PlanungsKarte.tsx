import { useMemo, type ReactNode } from 'react'
import { useApp } from '../app/context'
import { useAbwesend } from '../app/useAbwesend'
import { useKalendertag } from '../app/useKalendertag'
import { besuchHatKonflikt, besuchStand } from '../data/gruppenbesuche'
import { useBesuchsLage } from '../components/useBesuchsLage'
import { fromIso } from '../data/meeting-dates'
import { planungsstand, type Wochenstand } from '../data/planungsstand'
import type { FsBereich } from '../data/types'
import { ozStand } from '../data/zeugnis'
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
  // Offline (Momentaufnahme) geht nichts hinaus — dann nennt die Karte auch
  // kein „Plan senden", weder je Woche noch beim Zeugnisgeben.
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

  /*
   * **Öffentliches Zeugnisgeben** (T120): dieselben drei Zahlen wie die Banner
   * dort — Konflikte über das ganze Vierteljahr, freie Plätze in den Wochen,
   * die beim Planen offen dastehen, und was „Plan senden" noch zu tun hat
   * (`ozStand`). Auch das liegt außerhalb des Vier-Wochen-Fensters der
   * Wochenzeilen: Die Schichten sind nicht an importierte Wochen gebunden.
   */
  const zeugnis = useMemo(
    () =>
      ozStand({
        termine: state.ozTermine,
        eintraege: state.ozEintraege,
        persons: state.persons,
        absences: state.absences,
        confirmations: state.confirmations,
        sentLog: state.sentLog,
        sendenMoeglich,
        heute: fromIso(tag),
      }),
    [tag, sendenMoeglich, state.ozTermine, state.ozEintraege, state.persons, state.absences, state.confirmations, state.sentLog],
  )
  const zeugnisZuTun = zeugnis.konflikte + zeugnis.frei + zeugnis.nichtGesendet > 0

  if (stand.wochen.length === 0 && !stand.vorratKnapp && besuchsKonflikte === 0 && !zeugnisZuTun) {
    return (
      <button
        type="button"
        className="dash-plan"
        // Die Karte zählt die Zusammenkünfte — sie öffnet auch dort, nicht im
        // Predigtdienst, falls man zuletzt den angesehen hat (T120).
        onClick={() => dispatch({ type: 'navigate', screen: 'planen', thema: 'zusammenkuenfte' })}
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
      {besuchsKonflikte > 0 && (
        <BereichZeile titel={t.gbTitel} onClick={() => zumBereich('gruppenbesuche')}>
          <Chip art="konflikte" titel={t.konflikteTitle} n={besuchsKonflikte} />
        </BereichZeile>
      )}
      {zeugnisZuTun && (
        <BereichZeile titel={t.privZeugnis} onClick={() => zumBereich('zeugnis')}>
          {/* In der Reihenfolge der Banner dort: Konflikte, freie Plätze, Versand. */}
          {zeugnis.konflikte > 0 && <Chip art="konflikte" titel={t.konflikteTitle} n={zeugnis.konflikte} />}
          {zeugnis.frei > 0 && <Chip art="offen" titel={t.ozFreiePlaetze} n={zeugnis.frei} />}
          {zeugnis.nichtGesendet > 0 && <Chip art="senden" titel={t.planSendenTitle} n={zeugnis.nichtGesendet} />}
        </BereichZeile>
      )}
      {/* Importieren ist Sache des Admins (4.10.2026): Ein neues Programm
          ändert den Plan, es teilt nichts zu. */}
      {stand.vorratKnapp && state.planner && (
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

/**
 * Eine Zeile für einen Plan ohne Woche (Gruppenbesuche, Zeugnisgeben): sein
 * Titel und darunter seine Banner im Kleinen (`Chip`). Gebaut wie die Zeile
 * einer Woche darüber; ein Tipp führt in den Plan.
 */
function BereichZeile({ titel, onClick, children }: { titel: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="dash-plan-woche" onClick={onClick}>
      <span className="dash-plan-kopf">
        <span className="dash-plan-range">{titel}</span>
        <span className="dash-plan-arrow" aria-hidden="true">
          ›
        </span>
      </span>
      <span className="dash-plan-chips">{children}</span>
    </button>
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
