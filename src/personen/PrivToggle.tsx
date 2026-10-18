import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { Punkt } from '../bausteine/Punkt'
import { Switch } from '../components/Switch'
import { istBruderBereichBeiSchwester, privWert } from '../data/helpers'
import { rechteDerPerson } from '../data/rechte'
import type { Member, Person } from '../data/types'
import { useT } from '../i18n/useT'

type UpdatePerson = (patch: Partial<Person>) => void

/** Einzelner Aufgabenbereich-/Rollen-Schalter (Blatt „Aufgabenbereiche", Freigabe-Liste eines Dienstes). */
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
    <BereichZeile
      name={label}
      an={on}
      onToggle={() => {
        const priv = { ...person.priv, [qkey]: !on }
        // Wer Schulungsaufgaben übernimmt, ist standardmäßig auch
        // Gesprächspartner (lässt sich danach manuell wieder abschalten).
        if (qkey === 'schulung' && !on) priv.schulungPartner = true
        update({ priv })
      }}
    >
      {auffaellig && bruderLabel && (
        <span className="priv-warn" role="img" aria-label={bruderLabel} title={bruderLabel}>
          <Punkt art="problem" />
        </span>
      )}
    </BereichZeile>
  )
}

/**
 * **Eine Zeile mit Namen und Schalter** — die Bereiche einer Person, die
 * Personen eines Dienstes, die Gruppen der Reinigung: überall dieselbe Zeile.
 * Was `children` mitbringt, steht hinter dem Namen (der Hinweis bei
 * `PrivToggle`).
 */
export function BereichZeile({
  name,
  an,
  onToggle,
  dir,
  children,
}: {
  name: string
  an: boolean
  onToggle: () => void
  /** `auto` bei frei getippten Namen, etwa denen der Gruppen. */
  dir?: 'auto'
  children?: ReactNode
}) {
  return (
    <div className="schalter-zeile bereich-zeile">
      <span className="bereich-name" dir={dir}>
        {name}
        {children}
      </span>
      <Switch on={an} label={name} onToggle={onToggle} />
    </div>
  )
}

/**
 * **Die Rechte einer Person** (T121, Entwurf `GPerson`): „Darf planen" und
 * „Admin", je mit einer Zeile, was es heißt.
 *
 * Der Planer teilt zu und sendet; der Admin darf alles — Planen, Personen,
 * Einstellungen. Beide werden in verknüpfte Konten gespiegelt; welche der
 * beiden Stellen zählt, an denen ein Recht steht, sagt `rechteDerPerson`. Das
 * eigene Recht ist gesperrt (sonst könnte sich der letzte Admin selbst
 * aussperren). „Darf planen" steht bei einem Admin an und gesperrt: Das Recht
 * hat er ohnehin, und ein Schalter, der „aus" zeigt, behauptete das Gegenteil.
 */
export function RechteKarte({ person, update }: { person: Person; update: UpdatePerson }) {
  const { state } = useApp()
  const { t } = useT()
  const { admin, planer } = rechteDerPerson(state.members, person)
  const eigen = eigenesKonto(state.members, state.userId, person)
  return (
    <section className="karte person-karte">
      <h2 className="abschnitt-titel karte-titel">{t.rechte}</h2>
      {/* Aufsteigend: erst das kleinere Recht, dann das, das es einschließt. */}
      <RechtZeile
        name={t.rechtPlanen}
        unter={t.rechtPlanenUnter}
        an={admin || planer}
        gesperrt={eigen || admin}
        onToggle={() => update({ zuteilerVorgemerkt: !planer })}
      />
      <RechtZeile
        name={t.planerLbl}
        unter={t.rechtAdminUnter}
        an={admin}
        gesperrt={eigen}
        onToggle={() => update({ plannerVorgemerkt: !admin })}
      />
    </section>
  )
}

/** Ist eines der Konten dieser Person das eigene? */
function eigenesKonto(members: readonly Member[], userId: string | null, person: Person): boolean {
  return members.some((m) => m.personId === person.id && m.userId === userId)
}

function RechtZeile({
  name,
  unter,
  an,
  gesperrt,
  onToggle,
}: {
  name: string
  unter: string
  an: boolean
  gesperrt: boolean
  onToggle: () => void
}) {
  return (
    <div className={gesperrt ? 'schalter-zeile recht-zeile is-gesperrt' : 'schalter-zeile recht-zeile'}>
      <span className="schalter-text">
        <span>{name}</span>
        <span className="klein-text">{unter}</span>
      </span>
      <Switch on={an} label={name} disabled={gesperrt} onToggle={onToggle} />
    </div>
  )
}
