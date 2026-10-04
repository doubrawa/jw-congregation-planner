/**
 * Navigations-Chrome (Marke, Menü, Profil-Fuß) — geteilt zwischen der festen
 * Desktop-Sidebar und dem mobilen Drawer, damit beide nicht auseinanderlaufen.
 * Reine Präsentation: Einträge, State und Handler kommen aus AppShell.
 */

import { displayName, initials } from '../data/helpers'
import { useT } from '../i18n/useT'
import { LOGO_KLEIN } from '../lib/logo'
import type { Person } from '../data/types'

/** Ein Eintrag des Menüs: ein Bildschirm oder ein Thema (T120). */
export interface NavEintrag {
  key: string
  label: string
  aktiv: boolean
  onClick: () => void
}

/**
 * Ein Abschnitt des Menüs (T120). Der erste — Start und Meine Aufgaben — trägt
 * keine Überschrift; danach „Versammlung" mit den Themen und, nur für Admins,
 * „Verwaltung".
 */
export interface NavAbschnitt {
  key: string
  titel: string | null
  eintraege: readonly NavEintrag[]
}

/** Logo + Wortmarke + Versammlungsname. */
export function SidebarBrand({ congSub }: { congSub: string }) {
  return (
    <div className="sidebar-brand">
      <img className="sidebar-logo" src={LOGO_KLEIN} alt="" width={40} height={40} />
      {/* Ein Wort, das nur bei großer Schrift umbrechen muss: `wbr` gibt die
          Stelle vor der Endung vor — sonst risse der Browser mitten im Wort. */}
      <div className="sidebar-wordmark">
        Versammlung
        <wbr />
        .app
      </div>
      <div className="sidebar-sub">{congSub}</div>
    </div>
  )
}

/** Navigationsliste in Abschnitten (aktiver Punkt markiert). */
export function SidebarNav({ abschnitte }: { abschnitte: readonly NavAbschnitt[] }) {
  const { t } = useT()
  return (
    <nav className="sidebar-nav" aria-label={t.a11yMainNav}>
      {abschnitte.map((abschnitt) => (
        <div
          key={abschnitt.key}
          role={abschnitt.titel ? 'group' : undefined}
          aria-label={abschnitt.titel ?? undefined}
        >
          {/* Die Überschrift liest die Gruppe schon vor (`aria-label`). */}
          {abschnitt.titel && (
            <div className="sidebar-nav-titel" aria-hidden="true">
              {abschnitt.titel}
            </div>
          )}
          {abschnitt.eintraege.map((eintrag) => (
            <button
              key={eintrag.key}
              type="button"
              className={eintrag.aktiv ? 'sidebar-nav-item is-active' : 'sidebar-nav-item'}
              aria-current={eintrag.aktiv ? 'page' : undefined}
              onClick={eintrag.onClick}
            >
              {eintrag.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

/**
 * Profil-Fuß: Abstand und der Namensblock.
 *
 * Der Namensblock **ist** der Weg zum Profil (T120). Bis dahin stand das Profil
 * zweimal da — als Menüpunkt und darunter als Name, den man nicht antippen
 * konnte. Seit dem 4.10.2026 auch ohne das Schild „Profil ›" daneben: Den
 * Namen anzutippen genügt. Das Wort bleibt nur für Screenreader stehen — sonst
 * läse der Knopf Name und Rolle vor und sagte nicht, wohin er führt.
 *
 * „Abmelden" stand bis zum 4.10.2026 ebenfalls hier. Es steht jetzt im Profil
 * — und auf der Statusseite, wo das Profil nicht erreichbar ist (`StatusView`).
 */
export function SidebarFooter({
  me,
  roleLabel,
  profilLabel,
  aktiv,
  onProfil,
}: {
  me: Person | undefined
  roleLabel: string
  profilLabel: string
  aktiv: boolean
  onProfil: () => void
}) {
  return (
    <>
      <div className="sidebar-spacer" />
      <button
        type="button"
        className={aktiv ? 'sidebar-profile is-active' : 'sidebar-profile'}
        aria-current={aktiv ? 'page' : undefined}
        onClick={onProfil}
      >
        <span className="avatar avatar--ink avatar--32" aria-hidden="true">
          {me ? initials(me) : '–'}
        </span>
        <span className="sidebar-profile-text">
          <span className="sidebar-profile-name" dir="auto">{me ? displayName(me) : ''}</span>
          <span className="sidebar-profile-role">{roleLabel}</span>
        </span>
        <span className="sr-only">{profilLabel}</span>
      </button>
    </>
  )
}
