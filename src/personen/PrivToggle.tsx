import { useApp } from '../app/context'
import { useT } from '../i18n/useT'
import type { Person } from '../data/types'

type UpdatePerson = (patch: Partial<Person>) => void

/** Einzelner Aufgabenbereich-/Rollen-Schalter im Personen-Detail. */
export function PrivToggle({
  qkey,
  label,
  person,
  update,
}: {
  qkey: string
  label: string
  person: Person
  update: UpdatePerson
}) {
  // Keine Geschlechts-Sperre: übernehmen Schwestern Bereiche (z. B. weil
  // Brüder fehlen), steuern das allein diese Schalter.
  const on = Boolean(person.priv[qkey])
  return (
    <div className="priv-row">
      <span className="priv-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={on ? 'switch is-on' : 'switch'}
        onClick={() => update({ priv: { ...person.priv, [qkey]: !on } })}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}

/**
 * Planer-Recht (Feste Rollen): sieht Planen/Personen/Einstellungen. Wird in
 * verknüpfte Konten gespiegelt; das eigene Recht ist gesperrt (sonst könnte
 * sich der letzte Planer selbst aussperren).
 */
export function PlannerToggle({ person, update }: { person: Person; update: UpdatePerson }) {
  const { state } = useApp()
  const { t } = useT()
  const self = state.members.some((m) => m.personId === person.id && m.userId === state.userId)
  const on = Boolean(person.planner)
  return (
    <div className={self ? 'priv-row priv-row--locked' : 'priv-row'}>
      <span className="priv-label">{t.planerLbl}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t.planerLbl}
        disabled={self}
        className={on ? 'switch is-on' : 'switch'}
        onClick={() => update({ planner: !on })}
      >
        <span className="switch-knob" />
      </button>
    </div>
  )
}
