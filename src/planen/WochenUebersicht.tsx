import { useApp } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { Spur } from '../bausteine/Spur'
import { anlassName } from '../components/anlass-name'
import { wochenSpanne } from '../components/datum-anzeige'
import { anlassArt } from '../data/anlass'
import { fromIso, montagNach, montagVon } from '../data/meeting-dates'
import type { Week } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, programmSpanne, useProgWeeks, useT } from '../i18n/useT'
import { spurDerWoche } from './plan-spur'
import { HolenKnopf } from './ProgrammHolen'
import { VortragsplanKarte } from './VortragsplanKarte'
import { useWochenKarten } from './useWochenKarten'
import { naechsteHolWoche, type WochenKarte, type WochenLage } from './wochen-uebersicht'

/** Was die Lage oben rechts sagt — die Zahl hinter dem Wort. */
function lageText(lage: NonNullable<WochenLage>, t: Dict): string {
  if (lage.art === 'bereit') return t.lageBereit
  return fill(lage.art === 'probleme' ? t.lageProbleme : t.lageOffen, { n: lage.n })
}

/**
 * **Die Wochen beim Planen** (T121, Entwürfe `GWochen`, `GDesktopPlanen`): je
 * geladene Woche ab der laufenden eine Karte — Spanne, darunter der Anlass
 * oder wann sie ist, rechts was zu tun ist, unten die Spur. Darunter die
 * nächste Woche, deren Programm noch nicht geholt ist, mit „Holen", und der
 * Vortragsplan aus dem Planungsprogramm (T122) — die beiden Importe für die
 * kommenden Wochen an einer Stelle, auf der Seite wie in der Spalte.
 *
 * `spalte`: die Spalte links neben dem Plan am Desktop. Dort ist die gezeigte
 * Woche umrandet, und ein Tipp wechselt nur die Woche — Zusammenkunft oder
 * Treffpunkte bleiben, wie sie sind. Sonst (die Seite „Planung") öffnet ein
 * Tipp den Plan dort, wo das Erste zu tun ist (`Wochenstand.tab`).
 */
export function WochenListe({ spalte = false }: { spalte?: boolean }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const progWeek = useProgWeeks()
  const tag = useKalendertag()
  const karten = useWochenKarten()

  const diese = montagVon(tag)
  const naechste = montagNach(diese, 1)
  const unterzeile = (week: Week, tpw: (s: string) => string): string =>
    anlassName(anlassArt(week), t) ??
    (week.start === diese ? t.aktuelleWoche : week.start === naechste ? t.naechsteWoche : tpw(week.book))
  // Die Seite der Wochen liegt unter „Planung"; in der Spalte wechselt ein Tipp
  // nur die Woche, und woher das Planen kam, bleibt (T144).
  const von = spalte ? state.planenVon : 'planung'
  const oeffnen = (k: WochenKarte): void =>
    dispatch({
      type: 'navigate',
      screen: 'planen',
      woche: { wi: k.wi, tab: spalte ? state.tab : k.stand.tab },
      ...(von ? { von } : {}),
    })

  return (
    <div className="wochen-liste">
      {karten.map((k) => {
        const week = state.weeks[k.wi]
        if (!week) return null
        const p = progWeek(week)
        const gewaehlt = spalte && state.week === k.wi
        return (
          <div key={week.start} className={gewaehlt ? 'wochen-karte is-gewaehlt' : 'wochen-karte'}>
            <div className="wochen-karte-kopf">
              {/* Der Knopf deckt die ganze Karte (`::after`); die Spur steht
                  daneben, denn eine Liste gehört nicht in einen Knopf. */}
              <button
                type="button"
                className="wochen-karte-knopf"
                aria-current={gewaehlt ? 'true' : undefined}
                onClick={() => oeffnen(k)}
              >
                {programmSpanne(p)}
              </button>
              {k.lage && (
                <span className="wochen-karte-lage" data-art={k.lage.art}>
                  {lageText(k.lage, t)}
                </span>
              )}
            </div>
            <span className="wochen-karte-unter">{unterzeile(week, p.tpw)}</span>
            {/* Fällt alles aus (Kongress), gibt es nichts zu besetzen. */}
            {k.zahlen.gesamt > 0 && (
              <Spur form={spalte ? 'punkte' : 'knapp'} schritte={spurDerWoche(k.zahlen, t)} label={t.spurWoche} />
            )}
          </div>
        )
      })}
      <HolenKarte montag={naechsteHolWoche(state.weeks, fromIso(tag))} />
      <VortragsplanKarte />
    </div>
  )
}

/**
 * Die nächste Woche, deren Programm noch nicht da ist — gestrichelt, mit
 * „Holen". Ihre Spanne steht in der Sprache des Lesers: Ein Arbeitsheft-Text
 * dafür gibt es ja noch nicht.
 */
function HolenKarte({ montag }: { montag: string }) {
  const { state } = useApp()
  const { t } = useT()
  return (
    <div className="holen-karte">
      <span className="holen-karte-text">
        <span className="holen-karte-spanne">{wochenSpanne(montag, state.lang)}</span>
        <span className="klein-text">{t.programmNichtGeholt}</span>
      </span>
      <HolenKnopf className="knopf-pille knopf-pille--akzent" />
    </div>
  )
}

/**
 * Die Spalte links neben dem Plan am Desktop (Entwurf `GDesktopPlanen`) — nur
 * die Wochen. Die Wahl, was man plant, steht seit T144 allein auf „Planung";
 * dorthin führt Zurück über dem Plan (`Bereichstitel`).
 */
export function WochenSpalte() {
  const { t } = useT()
  return (
    <aside className="wochen-spalte" aria-label={t.wochenLbl}>
      <h2 className="wochen-spalte-titel">{t.wochenLbl}</h2>
      <WochenListe spalte />
    </aside>
  )
}
