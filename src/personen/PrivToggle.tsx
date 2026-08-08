import { useApp } from '../app/context'
import { istBruderBereichBeiSchwester } from '../data/helpers'
import { useT } from '../i18n/useT'
import type { Person } from '../data/types'


type UpdatePerson = (patch: Partial<Person>) => void

/** Einzelner Aufgabenbereich-/Rollen-Schalter im Personen-Detail. */
export function PrivToggle({
  qkey,
  label,
  person,
  update,
  bruderLabel,
}: {
  qkey: string
  label: string
  person: Person
  update: UpdatePerson
  /**
   * Beschriftung des Hinweis-Zeichens (das Wort „Bruder" in der Bediensprache).
   * Bewusst als Prop und nicht über `useT` geholt: die Komponente kommt sonst
   * ohne App-Kontext nicht mehr aus und ließe sich nicht mehr einzeln prüfen.
   */
  bruderLabel?: string
}) {
  // Keine Geschlechts-Sperre: übernehmen Schwestern Bereiche (z. B. weil
  // Brüder fehlen), steuern das allein diese Schalter.
  const on = Boolean(person.priv[qkey])
  // …aber ein Hinweis, wo der Schalter fachlich nicht passt. Ohne ihn blieb ein
  // versehentlicher Klick stumm: die Auto-Zuteilung nahm ihn ernst und teilte
  // zum Gebet oder Vorsitz ein (F4). Beschriftung aus vorhandenen Bausteinen —
  // ein eigener Text gäbe es nur auf Deutsch.
  const auffaellig = on && istBruderBereichBeiSchwester(person, qkey)
  return (
    <div className="priv-row">
      <span className="priv-label">
        {label}
        {auffaellig && bruderLabel && (
          <span className="priv-warn" role="img" aria-label={bruderLabel} title={bruderLabel}>
            ⚠
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={on ? 'switch is-on' : 'switch'}
        onClick={() => {
          const priv = { ...person.priv, [qkey]: !on }
          // Wer Schulungsaufgaben übernimmt, ist standardmäßig auch
          // Gesprächspartner (lässt sich danach manuell wieder abschalten).
          if (qkey === 'schulung' && !on) priv.schulungPartner = true
          update({ priv })
        }}
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
