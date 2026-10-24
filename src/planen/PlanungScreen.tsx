import { useT } from '../i18n/useT'
import { PlanungsBereiche } from './PlanungsBereiche'
import { WochenListe } from './WochenUebersicht'
import './planen.css'

/**
 * **Planung** (T121, Entwurf `GWochen`) — am Handy, am Tablet und auf kleinen
 * Desktops der Einstieg ins Planen: oben die Wahl, was man plant (T135), darunter
 * alle Wochen der Zusammenkünfte mit ihrer Spur, die nächste zum Holen. Wo Platz
 * für drei Spalten ist, steht dieselbe Liste links neben dem Plan
 * (`WochenSpalte`), und „Planung" führt gleich dorthin (`zurPlanung`).
 */
export function PlanungScreen() {
  const { t } = useT()
  return (
    <section className="screen planung">
      <h1 className="seitentitel seitentitel--gross">{t.dashPlanung}</h1>
      <PlanungsBereiche aktiv="zusammenkuenfte" />
      <section className="planung-wochen" aria-label={t.wochenLbl}>
        <h2 className="abschnitt-titel">{t.wochenLbl}</h2>
        <WochenListe />
      </section>
    </section>
  )
}
