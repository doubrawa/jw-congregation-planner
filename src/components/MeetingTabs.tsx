import { useApp } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { istAusgefallen, MEETING_TABS } from '../data/helpers'
import { meetingDate, meetingTime, versatzAbMontag } from '../data/meeting-dates'
import { fill, useT } from '../i18n/useT'
import type { MeetingTab, Week } from '../data/types'
import { datumsFormat } from './datum-anzeige'
import './components.css'

interface MeetingTabsProps {
  tab: MeetingTab
  onChange: (tab: MeetingTab) => void
  /*
   * Einen dritten Reiter „Predigtdienst" gab es hier bis T120. Der Predigtdienst
   * ist seitdem ein eigenes Thema im Menü — die Reiter hier gehören allein den
   * Zusammenkünften.
   */
  /**
   * Weiterer Eintrag: „Woche einrichten" (T64, T121 `GWochePlanen`) — Anlass,
   * Abweichungen, Termine, Programm. Nur im Planen und nur für den Admin; das
   * Ansehen ist für alle nur lesend, und der Gruppenaufseher plant ohnehin nur
   * den Predigtdienst.
   *
   * Er trägt ein Zeichen statt eines Wortes, wie im Entwurf; vorgelesen wird
   * „Woche einrichten".
   */
  showEdit?: boolean
  /**
   * Die gezeigte Woche. Weicht sie ab (T30), steht auf der Karte ihr
   * **tatsächlicher** Tag — nicht der Rhythmus aus den Einstellungen. Sonst
   * stünde „Sonntag" über einer Zusammenkunft, die auf Samstag verlegt wurde.
   * Ohne Woche gilt weiterhin der Rhythmus, und das Datum fehlt.
   */
  week?: Week
}

/**
 * **Die beiden Zusammenkünfte der Woche als Karten** (T121, `GAnsehenWoche`):
 * je Karte der Wochentag, darunter Datum und Uhrzeit — „Dienstag · 8.9. ·
 * 19:00". Die gewählte trägt einen Rand. Eine ausgefallene steht
 * durchgestrichen da (T30).
 *
 * Vorgelesen wird „Versammlung Dienstag, 8.9. · 19:00" (`versammlungTag`): Der
 * Wochentag allein unterschiede die Karten, sagte aber nicht, wofür sie stehen.
 */
export function MeetingTabs({ tab, onChange, showEdit = false, week }: MeetingTabsProps) {
  const { state } = useApp()
  const { t } = useT()
  const zeiten = state.congregation.times
  const tagName = datumsFormat(state.lang, 'wochentag')
  const tagZahl = datumsFormat(state.lang, 'tagZahl')

  return (
    <div className={showEdit ? 'meeting-tabs mit-bearbeiten' : 'meeting-tabs'}>
      {MEETING_TABS.map((key) => {
        // Verlegte Woche → ihr echter Tag (T30); sonst der Rhythmus, gezählt
        // vom Montag, 1. Januar 2024 — örtlich zur Mittagszeit, damit keine
        // Zeitzone den Wochentag verschiebt.
        const datum = week
          ? meetingDate(week, key, zeiten)
          : new Date(2024, 0, 1 + versatzAbMontag(zeiten[key].wd), 12)
        const name = tagName.format(datum)
        const wann = week ? `${tagZahl.format(datum)} · ${meetingTime(week, key, zeiten)}` : zeiten[key].time
        const aus = istAusgefallen(week, key)
        return (
          <button
            key={key}
            type="button"
            className={tab === key ? 'meeting-tab is-active' : 'meeting-tab'}
            aria-pressed={tab === key}
            aria-label={`${fill(t.versammlungTag, { tag: name })}, ${wann}`}
            onClick={() => onChange(key)}
          >
            <span className="meeting-tab-name">{aus ? <s>{name}</s> : name}</span>
            <span className="meeting-tab-wann">{wann}</span>
          </button>
        )
      })}
      {showEdit && (
        <button
          type="button"
          className={tab === 'edit' ? 'meeting-tab meeting-tab--icon is-active' : 'meeting-tab meeting-tab--icon'}
          aria-pressed={tab === 'edit'}
          aria-label={t.wocheEinrichten}
          onClick={() => onChange('edit')}
        >
          <Zeichen name="einstellungen" />
        </button>
      )}
    </div>
  )
}
