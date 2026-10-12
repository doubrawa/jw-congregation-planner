import { useState } from 'react'
import { useApp } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { darfAbwesenheitBearbeiten } from '../data/rechte'
import { useT } from '../i18n/useT'
import { AbwesenheitBlatt } from './AbwesenheitBlatt'

/**
 * **„+ Abwesenheit eintragen"** und das Blatt dahinter (T121) — im Profil für
 * die eigene Person, im Personen-Detail für die gewählte. `personId` ist die
 * **betroffene** Person (null = Konto ohne Person; dann zählt die Abwesenheit
 * für die Planung nicht, siehe `Absence`).
 */
export function AbwesenheitEintragen({ personId }: { personId: string | null }) {
  const { state } = useApp()
  const { t } = useT()
  const [offen, setOffen] = useState(false)
  if (!darfAbwesenheitBearbeiten(state, personId)) return null
  return (
    <>
      <button type="button" className="abw-neu" onClick={() => setOffen(true)}>
        <Zeichen name="plus" />
        {t.abwEintragen}
      </button>
      {offen && <AbwesenheitBlatt personId={personId} onClose={() => setOffen(false)} />}
    </>
  )
}
