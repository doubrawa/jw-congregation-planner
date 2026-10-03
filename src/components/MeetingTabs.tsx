import { useApp } from '../app/context'
import { MEETING_TABS } from '../data/helpers'
import { meetingOffset, versatzAbMontag } from '../data/meeting-dates'
import { LOCALES } from '../i18n/langs'
import { fill, useT } from '../i18n/useT'
import type { MeetingTab, Week } from '../data/types'
import './components.css'

interface MeetingTabsProps {
  tab: MeetingTab
  onChange: (tab: MeetingTab) => void
  className?: string
  /*
   * Einen dritten Reiter „Predigtdienst" gab es hier bis T120. Der Predigtdienst
   * ist seitdem ein eigenes Thema im Menü — die Reiter hier gehören allein den
   * Zusammenkünften.
   */
  /**
   * Weiterer Reiter: die Bearbeiten-Ansicht der Woche (T64) — Anlass und
   * Abweichungen. Nur im Planen und nur für Planer; das Ansehen ist für alle
   * nur lesend, und der Gruppenaufseher plant ohnehin nur den Predigtdienst.
   *
   * Er trägt ein Symbol statt eines Wortes. Das ist keine Sparsamkeit an der
   * falschen Stelle, sondern die Konsequenz aus `ui.test.ts`: Jeder neue
   * Schlüssel verlangt 33 Übersetzungen, und erfunden wird hier keine. Der
   * vorgelesene Name kommt deshalb aus `einstellungen` — die Ansicht *sind* die
   * Einstellungen dieser Woche.
   */
  showEdit?: boolean
  /**
   * Die gezeigte Woche. Weicht sie ab (T30), steht auf dem Reiter ihr
   * **tatsächlicher** Tag — nicht der Rhythmus aus den Einstellungen. Sonst
   * stünde „Sonntag" über einer Zusammenkunft, die auf Samstag verlegt wurde.
   * Ohne Woche gilt weiterhin der Rhythmus.
   */
  week?: Week
}

/** Wochentagsname (App-Sprache) für einen Versatz 0..6 (Montag..Sonntag). */
function weekdayName(offset: number, locale: string): string {
  const monday = Date.UTC(2024, 0, 1) // 1. Jan 2024 = Montag
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(monday + offset * 864e5),
  )
}

/**
 * Reiter für die beiden Zusammenkünfte (Wochentag aus den Zusammenkunftszeiten
 * der Versammlung) und optional die Bearbeiten-Ansicht. Als gefüllte Pillen
 * gestaltet.
 *
 * Sichtbar steht nur der Wochentag: „Versammlung“ stünde auf beiden Reitern und
 * unterscheidet sie nicht, macht die Zeile aber so breit, dass auf dem Handy der
 * dritte Reiter aus dem Bild rutscht. Der volle Text bleibt als aria-label für
 * Screenreader erhalten. Reicht die Breite trotzdem nicht (lange Wochentage in
 * anderen Sprachen, großer Schriftgrad), bricht die Leiste um — alle Reiter
 * müssen sichtbar sein, seitliches Scrollen findet man nicht.
 */
export function MeetingTabs({ tab, onChange, className, showEdit = false, week }: MeetingTabsProps) {
  const { state } = useApp()
  const { t } = useT()
  const zeiten = state.congregation.times
  const locale = LOCALES[state.lang]
  // [Schlüssel, sichtbare Beschriftung, vorgelesene Beschriftung]
  const tabs: ReadonlyArray<[MeetingTab, string, string]> = [
    ...MEETING_TABS.map((key): [MeetingTab, string, string] => {
      // Verlegte Woche → ihr echter Tag (T30); sonst der Rhythmus.
      const versatz = week
        ? meetingOffset(week, key, zeiten)
        : versatzAbMontag(zeiten[key].wd)
      const day = weekdayName(versatz, locale)
      return [key, day, fill(t.versammlungTag, { tag: day })]
    }),
    ...(showEdit
      ? ([['edit', '✎', t.einstellungen]] as ReadonlyArray<[MeetingTab, string, string]>)
      : []),
  ]
  return (
    <div className={className ? `meeting-tabs ${className}` : 'meeting-tabs'}>
      {tabs.map(([key, label, full]) => (
        <button
          key={key}
          type="button"
          className={[ 'meeting-tab', tab === key ? 'is-active' : '', key === 'edit' ? 'meeting-tab--icon' : '' ].filter(Boolean).join(' ')}
          aria-pressed={tab === key}
          aria-label={label === full ? undefined : full}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
