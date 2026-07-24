import { useApp } from '../app/context'
import { CURRENT_PERSON_ID } from '../data/demo'
import { overseerGroup } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { CongregationPanel } from './CongregationPanel'
import { FsRulesPanel } from './FsRulesPanel'
import { GroupsPanel } from './GroupsPanel'
import { ImportPanel } from './ImportPanel'
import { LanguagePanel } from './LanguagePanel'
import { RemindersPanel } from './RemindersPanel'
import { ServicesPanel } from './ServicesPanel'
import './einstellungen.css'

/**
 * Einstellungen (Screen 6, nur Planer): Versammlung, Predigtdienstgruppen,
 * Hilfsdienste, Sprache (Versammlungssprache-Sheet), Erinnerungen und
 * Programm-Import — je ein eigenständiges Panel. Konten & Einladungen laufen
 * personenzentriert im Personen-Screen (Konto-Karte im Detail + Sammel-
 * Einladung in der Liste).
 */
export function EinstellungenScreen() {
  const { state } = useApp()
  const { t } = useT()

  // Gruppenaufseher (ohne volle Planer-Rechte) sehen hier nur den Grundplan
  // ihrer eigenen Gruppe.
  const myFsGroup = overseerGroup(state.groups, state.personId ?? CURRENT_PERSON_ID)
  const fsOverseer = !state.planner && myFsGroup !== null

  return (
    <section className="screen">
      <h1 className="screen-title">{t.einstellungen}</h1>
      <p className="screen-subtitle">{fill(t.congLabel, { name: state.congregation.name })}</p>
      {fsOverseer ? (
        <FsRulesPanel onlyGroup={myFsGroup} />
      ) : (
        <>
          <CongregationPanel />
          <GroupsPanel />
          <FsRulesPanel />
          <ServicesPanel />
          <LanguagePanel />
          <RemindersPanel />
          <ImportPanel />
        </>
      )}
    </section>
  )
}
