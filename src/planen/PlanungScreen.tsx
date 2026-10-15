import { useApp } from '../app/context'
import { zumPlanen } from '../app/bereich'
import { EinstellZeile } from '../einstellungen/EinstellZeile'
import { useT } from '../i18n/useT'
import { WochenListe } from './WochenUebersicht'
// Die Zeilen von „Auch zu planen" sind die der Einstellungen (`EinstellZeile`).
import '../einstellungen/einstellungen.css'
import './planen.css'

/**
 * **Planung** (T121, Entwurf `GWochen`) — am Handy, am Tablet und auf kleinen
 * Desktops der Einstieg ins Planen: alle Wochen mit ihrer Spur, die nächste
 * zum Holen, darunter, was es sonst zu planen gibt. Wo Platz für drei Spalten
 * ist, steht dieselbe Liste links neben dem Plan (`WochenSpalte`), und
 * „Planung" führt gleich dorthin (`zurPlanung`).
 */
export function PlanungScreen() {
  const { dispatch } = useApp()
  const { t } = useT()
  return (
    <section className="screen planung">
      <h1 className="seitentitel seitentitel--gross">{t.dashPlanung}</h1>
      <section className="planung-wochen" aria-label={t.wochenLbl}>
        <h2 className="abschnitt-titel">{t.wochenLbl}</h2>
        <WochenListe />
      </section>
      <section className="karte einst-karte">
        <h2 className="abschnitt-titel karte-titel">{t.auchZuPlanen}</h2>
        <EinstellZeile name={t.tabFs} unter={t.treffpunkteBesuche} onTipp={() => dispatch(zumPlanen('predigtdienst'))} />
        <EinstellZeile name={t.navWeiterePlaene} onTipp={() => dispatch(zumPlanen('weitere'))} />
      </section>
    </section>
  )
}
