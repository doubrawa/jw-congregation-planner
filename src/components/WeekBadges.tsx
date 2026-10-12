import { fill, useT } from '../i18n/useT'
import { useApp } from '../app/context'
import { abweichungsGrund, istAusgefallen } from '../data/helpers'
import { versatzAbMontag } from '../data/meeting-dates'
import { termineVon } from '../data/termine'
import type { MeetingKey, MeetingTab, Week } from '../data/types'
import { wochentagName } from '../planen/wochentage'
import './components.css'

/**
 * Hinweis-Banner auf dem Tab der ausfallenden Zusammenkunft einer
 * Gedächtnismahl-Woche: statt des normalen Programms findet das
 * Gedächtnismahl statt (das Programm darunter zeigt bereits das Mahl).
 */
export function MemorialBanner({ week, tab }: { week: Week; tab: MeetingTab }) {
  const { t, tp } = useT()
  if (!week.mem || week.memCancel !== tab) return null
  const cancelled = week.memCancel === 'we' ? t.tabWe : t.tabMid
  const date = (week.memCancel === 'we' ? week.we : week.mid).date
  return (
    <div className="mem-banner">
      {fill(t.memAusfall, { m: cancelled })}
      <div className="mem-banner-date">{tp(date)}</div>
    </div>
  )
}

/**
 * Hinweis, dass diese Zusammenkunft in dieser Woche **nicht stattfindet** (T30).
 *
 * Der Text ist der Grund, den der Planer selbst eingetragen hat — seine Worte,
 * in seiner Sprache, wie ein Name oder ein Vortragsthema. Für „entfällt" gibt
 * es kein gemessenes Wort; ein erfundenes in 33 Sprachen wäre schlechter als
 * gar keines. Der Name der Zusammenkunft steht durchgestrichen davor, und das
 * ist unmissverständlich — auch ohne Satz.
 *
 * Ohne Grund bleibt der durchgestrichene Name allein stehen. Das ist selten:
 * wer eine Zusammenkunft absagt, schreibt üblicherweise dazu, warum.
 */
export function AusfallBanner({ week, tab }: { week: Week | undefined; tab: MeetingKey }) {
  const { t } = useT()
  if (!week || !istAusgefallen(week, tab)) return null
  const name = tab === 'we' ? t.tabWe : t.tabMid
  const grund = abweichungsGrund(week, tab)
  return (
    <div className="ausfall-banner" role="status">
      <s className="ausfall-name">{name}</s>
      {grund && (
        <div className="ausfall-grund" dir="auto">
          {grund}
        </div>
      )}
    </div>
  )
}

/**
 * Weitere Termine dieser Woche (T63) — für **alle** sichtbar, denn es sind
 * Ankündigungen und keine Zuteilungen.
 *
 * Aufgebaut wie das Ausfall-Banner darüber und aus demselben Grund: Der Text
 * gehört dem Planer. Übersetzt wird nur, was gemessen vorliegt — der Wochentag
 * kommt aus `Intl`, alles andere (Bezeichnung, Ort) steht so da, wie er es
 * geschrieben hat. Ein Kopf wie „WEITERE TERMINE" wäre ein erfundenes Wort in
 * 33 Sprachen; die Zeilen tragen ihre Bedeutung selbst.
 */
export function TerminListe({ week }: { week: Week | undefined }) {
  const { state } = useApp()
  const termine = termineVon(week)
  if (termine.length === 0) return null
  return (
    <div className="termin-liste">
      {termine.map((termin) => {
        const wann = [
          termin.wd == null ? '' : wochentagName(versatzAbMontag(termin.wd), state.lang),
          termin.time ?? '',
        ]
          .filter(Boolean)
          .join(' · ')
        return (
          <div key={termin.id} className="termin-zeile">
            {wann && <span className="termin-wann">{wann}</span>}
            <span className="termin-was" dir="auto">
              {termin.title}
            </span>
            {termin.place && (
              <span className="termin-ort" dir="auto">
                {termin.place}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
