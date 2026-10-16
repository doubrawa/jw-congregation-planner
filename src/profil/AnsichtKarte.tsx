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
 */
export function AnsichtKarte() {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  if (!state.planner) return null
  const { ansicht, groups } = state
  // Den Gruppenaufseher gibt es nur mit einer Gruppe.
  const stufen = ANSICHT_STUFEN.filter((s) => s !== 'gruppenaufseher' || groups.length > 0)

  const waehle = (wert: string): void => {
    if (wert === EIGENES_RECHT) {
      dispatch({ type: 'setAnsicht', ansicht: null })
      return
    }
    const stufe = wert as AnsichtStufe
    const gruppe = stufe === 'gruppenaufseher' ? ansichtsGruppe(groups, state.persons, state.personId) : null
    dispatch({ type: 'setAnsicht', ansicht: { stufe, gruppe } })
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
              {t[RECHTE_STUFE_KEY[s]]}
            </option>
          ))}
        </select>
      </label>
      {ansicht?.stufe === 'gruppenaufseher' && (
        <label className="profil-zeile ansicht-zeile">
          <span>{t.gruppeLbl}</span>
          <select
            className="profil-auswahl"
            value={ansicht.gruppe ?? ''}
            onChange={(e) => dispatch({ type: 'setAnsicht', ansicht: { stufe: 'gruppenaufseher', gruppe: e.target.value } })}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {tu(g.name)}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}
