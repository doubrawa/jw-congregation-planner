import { useApp } from '../app/context'
import { zusammenkunftName } from '../components/anlass-name'
import { gebundenesDatum } from '../components/datum-anzeige'
import { Sheet } from '../components/Sheet'
import { meetingDate } from '../data/meeting-dates'
import type { MeetingKey, Week } from '../data/types'
import { useT } from '../i18n/useT'
import { AnwesenheitFormular } from './AnwesenheitFormular'
import { useAnwesenheit } from './useAnwesenheit'

/**
 * Die Anwesenden einer Zusammenkunft im Blatt (T152) — aus dem Programm und
 * aus der Auswertung, wo eine Zahl fehlt. Darüber die Zusammenkunft und ihr
 * Tag, damit klar ist, wofür gezählt wird.
 */
export function AnwesenheitBlatt({ week, tab, onClose }: { week: Week; tab: MeetingKey; onClose: () => void }) {
  const { state } = useApp()
  const { t } = useT()
  const { eintrag } = useAnwesenheit(week, tab)
  const tag = gebundenesDatum(meetingDate(week, tab, state.congregation.times), state.lang, 'tag')
  return (
    <Sheet label={t.anwesendTitel} title={t.anwesendTitel} eyebrow={`${zusammenkunftName(tab, t)} · ${tag}`} onClose={onClose}>
      <div className="sheet-inhalt">
        <AnwesenheitFormular woche={week.start} tab={tab} eintrag={eintrag} onGespeichert={onClose} />
      </div>
    </Sheet>
  )
}
