import { useApp } from '../app/context'
import { istBruderBereichBeiSchwester, privWert } from '../data/helpers'
import { rechteDerPerson } from '../data/rechte'
import { useT } from '../i18n/useT'
import type { Member, Person } from '../data/types'
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
 * Die Rechte einer Person (Feste Rollen): **Planer** und **Admin** (4.10.2026).
 *
 * Der Planer teilt zu und sendet; der Admin darf alles — Planen, Personen,
 * Einstellungen. Beide werden in verknüpfte Konten gespiegelt; das eigene
 * Recht ist gesperrt (sonst könnte sich der letzte Admin selbst aussperren).
 * Der Planer-Schalter steht bei einem Admin an und gesperrt: Das Recht hat er
 * ohnehin, und ein Schalter, der „aus" zeigt, behauptete das Gegenteil.
 */
export function RechteToggles({ person, update }: { person: Person; update: UpdatePerson }) {
  const { t } = useT()
  return (
    <>
      {/* Aufsteigend: erst das kleinere Recht, dann das, das es einschließt. */}
      <ZuteilerToggle person={person} update={update} />
      <PlannerToggle person={person} update={update} />
      <p className="panel-hint">{t.rechteHint}</p>
    </>
  )
}

/** Ist eines der Konten dieser Person das eigene? */
function eigenesKonto(members: readonly Member[], userId: string | null, person: Person): boolean {
  return members.some((m) => m.personId === person.id && m.userId === userId)
}

/** Planer-Recht (zuteilen und senden) — siehe `RechteToggles`. */
function ZuteilerToggle({ person, update }: { person: Person; update: UpdatePerson }) {
  const { state } = useApp()
  const { t } = useT()
  // Wie beim Admin entscheidet das Konto, sobald es eines gibt (`rechteDerPerson`).
  const { admin, planer } = rechteDerPerson(state.members, person)
  const gesperrt = eigenesKonto(state.members, state.userId, person) || admin
  return (
    <div className={gesperrt ? 'priv-row priv-row--locked' : 'priv-row'}>
      <span className="priv-label">{t.rollePlaner}</span>
      <Switch
        on={admin || planer}
        label={t.rollePlaner}
        disabled={gesperrt}
        onToggle={() => update({ zuteilerVorgemerkt: !planer })}
      />
    </div>
  )
}

/**
 * Admin-Recht (Feste Rollen): sieht Planen/Personen/Einstellungen. Wird in
 * verknüpfte Konten gespiegelt; das eigene Recht ist gesperrt (sonst könnte
 * sich der letzte Admin selbst aussperren). Welche der beiden Stellen zählt,
 * an denen es steht, sagt `rechteDerPerson`.
 */
function PlannerToggle({ person, update }: { person: Person; update: UpdatePerson }) {
  const { state } = useApp()
  const { t } = useT()
  const { admin } = rechteDerPerson(state.members, person)
  const self = eigenesKonto(state.members, state.userId, person)
  return (
    <div className={self ? 'priv-row priv-row--locked' : 'priv-row'}>
      <span className="priv-label">{t.planerLbl}</span>
      <Switch
        on={admin}
        label={t.planerLbl}
        disabled={self}
        onToggle={() => update({ plannerVorgemerkt: !admin })}
      />
    </div>
  )
}
