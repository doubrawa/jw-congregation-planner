import { useApp } from '../app/context'
import { ANSICHT_STUFEN, ansichtsGruppe, type AnsichtStufe } from '../data/ansicht'
import { RECHTE_STUFE_KEY } from '../i18n/ui'
import { useT } from '../i18n/useT'

/** Der Wert der Auswahl für „keine Ansicht" — das eigene Recht des Admins. */
const EIGENES_RECHT = 'admin'

/**
 * **Ansicht zum Testen** (befristet, T124): Der Admin sieht die App mit den
 * Rechten einer anderen Stufe (`data/ansicht.ts`).
 *
 * Angeboten am **echten** Recht (`planner`), nicht an der Ansicht — sonst
 * verschwände die Karte mit dem Umschalten auf „Verkündiger", und es gäbe kein
 * Zurück. Sie steht im Profil, weil das jede Stufe sieht; die Einstellungen
 * sieht schon der Planer nicht.
 *
 * Als Gruppenaufseher spielt der Admin **seine eigene Gruppe** — eine andere
 * gibt es nicht zur Wahl (17.10.2026, `ansichtsGruppe`). Ihr Name steht an der
 * Stufe; ohne eigene Gruppe fehlt die Stufe.
 */
export function AnsichtKarte() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  if (!state.planner) return null
  const { ansicht, groups } = state
  const eigeneGruppe = ansichtsGruppe(groups, state.persons, state.personId)
  const gruppenName = groups.find((g) => g.id === eigeneGruppe)?.name
  const stufen = ANSICHT_STUFEN.filter((s) => s !== 'gruppenaufseher' || eigeneGruppe !== null)
  const name = (s: AnsichtStufe): string =>
    s === 'gruppenaufseher' && gruppenName ? `${t[RECHTE_STUFE_KEY[s]]} · ${tu(gruppenName)}` : t[RECHTE_STUFE_KEY[s]]

  const waehle = (wert: string): void => {
    if (wert === EIGENES_RECHT) {
      dispatch({ type: 'setAnsicht', ansicht: null })
      return
    }
    const stufe = wert as AnsichtStufe
    dispatch({ type: 'setAnsicht', ansicht: { stufe, gruppe: stufe === 'gruppenaufseher' ? eigeneGruppe : null } })
  }

  return (
    <section className="karte profil-karte">
      <h2 className="abschnitt-titel karte-titel">{t.ansichtTitel}</h2>
      <p className="klein-text">{t.ansichtHinweis}</p>
      <label className="profil-zeile ansicht-zeile">
        <span>{t.ansichtAlsLbl}</span>
        <select className="profil-auswahl" value={ansicht?.stufe ?? EIGENES_RECHT} onChange={(e) => waehle(e.target.value)}>
          <option value={EIGENES_RECHT}>{t[RECHTE_STUFE_KEY.admin]}</option>
          {stufen.map((s) => (
            <option key={s} value={s}>
              {name(s)}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
