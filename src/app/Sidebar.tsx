/**
 * Navigations-Chrome (Marke, Menü, Profil-Fuß) — geteilt zwischen der festen
 * Desktop-Sidebar und dem mobilen Drawer, damit beide nicht auseinanderlaufen.
 * Reine Präsentation: State und Handler kommen aus AppShell.
 */

import { fullName, initials } from '../data/helpers'
import type { Person, Screen } from '../data/types'

// Logo aus public/ — via BASE_URL, damit es auch unter dem GitHub-Pages-Pfad lädt.
const LOGO = `${import.meta.env.BASE_URL}logo.png`

export type NavItem = readonly [screen: Screen, label: string]

/** Logo + Wortmarke + Versammlungsname. */
export function SidebarBrand({ congSub }: { congSub: string }) {
  return (
    <div className="sidebar-brand">
      <img className="sidebar-logo" src={LOGO} alt="" width={40} height={40} />
      <div className="sidebar-wordmark">
        Congregation
        <br />
        Planner
      </div>
      <div className="sidebar-sub">{congSub}</div>
    </div>
  )
}

/** Navigationsliste (aktiver Punkt markiert). */
export function SidebarNav({
  items,
  active,
  onNavigate,
}: {
  items: readonly NavItem[]
  active: Screen
  onNavigate: (screen: Screen) => void
}) {
  return (
    <nav className="sidebar-nav" aria-label="Hauptnavigation">
      {items.map(([screen, label]) => (
        <button
          key={screen}
          type="button"
          className={active === screen ? 'sidebar-nav-item is-active' : 'sidebar-nav-item'}
          aria-current={active === screen ? 'page' : undefined}
          onClick={() => onNavigate(screen)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}

/** Profil-Fuß: Abstand, Avatar/Name/Rolle und Abmelden-Knopf. */
export function SidebarFooter({
  me,
  roleLabel,
  logoutLabel,
  onLogout,
}: {
  me: Person | undefined
  roleLabel: string
  logoutLabel: string
  onLogout: () => void
}) {
  return (
    <>
      <div className="sidebar-spacer" />
      <div className="sidebar-profile">
        <div className="avatar avatar--ink avatar--32">{me ? initials(me) : '–'}</div>
        <div>
          <div className="sidebar-profile-name">{me ? fullName(me) : ''}</div>
          <div className="sidebar-profile-role">{roleLabel}</div>
        </div>
      </div>
      <button type="button" className="sidebar-logout" onClick={onLogout}>
        {logoutLabel}
      </button>
    </>
  )
}
