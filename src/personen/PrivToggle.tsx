import { useApp } from '../app/context'
import { istBruderBereichBeiSchwester, privWert } from '../data/helpers'
import { useT } from '../i18n/useT'
import type { Person } from '../data/types'
import { Switch } from '../components/Switch'


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
  const on = privWert(person.priv, qkey)
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
      <Switch
        on={on}
        label={label}
        onToggle={() => {
          const priv = { ...person.priv, [qkey]: !on }
          // Wer Schulungsaufgaben übernimmt, ist standardmäßig auch
          // Gesprächspartner (lässt sich danach manuell wieder abschalten).
          if (qkey === 'schulung' && !on) priv.schulungPartner = true
          update({ priv })
        }}
      />
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
  /**
   * Das Recht steht an **zwei** Stellen, und nur eine entscheidet.
   *
   * `persons.planner_vorgemerkt` ist die Vormerkung: Sie wird beim Einladen in den Code
   * übernommen, damit jemand das Recht schon hat, wenn er sich anmeldet.
   * Sobald ein Konto verknüpft ist, zählt aber `members.planner` — daran hängt
   * `is_planner()` in der Datenbank und `state.planner` in der App.
   *
   * Angezeigt wurde bis August 2026 die Vormerkung. Das ging gut, solange beide
   * gemeinsam entstanden; der Personen-Neuaufbau aus New World Scheduler
   * schreibt die Spalte aber gar nicht mit. Seither stand sie bei allen auf
   * `false`, während die Konten ihr Recht behielten: Der Betreiber sah bei sich
   * selbst „Admin: aus" — und war Admin. Deshalb entscheidet hier jetzt das
   * Konto, und die Vormerkung trägt nur noch, wo es keines gibt.
   */
  const konten = state.members.filter((m) => m.personId === person.id)
  const self = konten.some((m) => m.userId === state.userId)
  const on = konten.length > 0 ? konten.some((m) => m.planner) : Boolean(person.plannerVorgemerkt)
  return (
    <div className={self ? 'priv-row priv-row--locked' : 'priv-row'}>
      <span className="priv-label">{t.planerLbl}</span>
      <Switch
        on={on}
        label={t.planerLbl}
        disabled={self}
        onToggle={() => update({ plannerVorgemerkt: !on })}
      />
    </div>
  )
}
