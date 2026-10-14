import { useAppDispatch } from '../app/context'
import { EntfernenKnopf } from './EntfernenKnopf'

/**
 * **Eine Abwesenheit entfernen — mit Rückfrage** (4.10.2026).
 *
 * Der erste Tipp auf „✕" fragt („Wirklich löschen?"), erst der zweite löscht;
 * ein Tipp daneben bricht ab (`EntfernenKnopf`). Er steht in der
 * Abwesenheiten-Karte — im Profil für die eigenen, bei einer Person für deren
 * (`AbwesenheitenKarte`).
 */
export function AbwesenheitEntfernen({ id, className }: { id: string; className: string }) {
  const dispatch = useAppDispatch()
  return <EntfernenKnopf className={className} onEntfernen={() => dispatch({ type: 'removeAbsence', id })} />
}
