import { useAppDispatch } from '../app/context'
import { useT } from '../i18n/useT'
import { performLogout } from '../lib/supabase'
import { useZweiTipp } from './useZweiTipp'

/**
 * **Abmelden — mit Rückfrage** (4.10.2026).
 *
 * Der erste Tipp fragt („Wirklich abmelden?"), erst der zweite meldet ab; ein
 * Tipp daneben bricht ab. Dieselbe Zwei-Tipp-Bestätigung wie beim Löschen und
 * Leeren (`useZweiTipp`), damit die App überall gleich nachfragt.
 *
 * Ein Baustein für beide Stellen, an denen es Abmelden gibt: das Profil und
 * die Statusseite, wo das Profil nicht erreichbar ist (`StatusView`). Seit dem
 * 4.10.2026 steht es nicht mehr im Menü.
 */
export function AbmeldenKnopf({ className }: { className: string }) {
  const dispatch = useAppDispatch()
  const { t } = useT()
  const abmelden = useZweiTipp(() => performLogout(dispatch))
  return (
    <button
      type="button"
      className={`btn-outline abmelden ${className}${abmelden.armed ? ' is-armed' : ''}`}
      onClick={abmelden.onClick}
      onBlur={abmelden.onBlur}
    >
      {abmelden.armed ? t.abmeldenSicher : t.abmelden}
    </button>
  )
}
