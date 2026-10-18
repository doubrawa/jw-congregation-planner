import { fill } from '../i18n/useT'
import { MiniBalken } from './Diagramme'
import { gerundet, type Kontext } from './kontext'

/**
 * **Engpässe** (Jahresprobe 18.10.2026): je Bereich, wie viele Plätze je Woche
 * anfallen und wie viele Personen ihn haben — daraus, alle wie viele Wochen
 * jeder dran wäre und wie oft im Jahr. Die knappsten zuerst, immer über das
 * ganze Jahr. Der Balken ist die Last je Person; ein Bereich, den niemand hat,
 * steht ganz vorn in der Problemfarbe.
 */
export function EngpaesseAnsicht({ k }: { k: Kontext }) {
  const { t } = k
  const liste = k.a.engpaesse
  if (liste.length === 0) return <p className="karte aw-leer">{t.awKeineDaten}</p>
  const max = Math.max(1, ...liste.map((z) => z.jePersonJahr ?? 0))
  return (
    <div className="aw-ansicht">
      <p className="aw-erklaerung">{t.awEngpaesseText}</p>
      <div className="karte aw-gruppe aw-engpaesse">
        <ul className="aw-zeilen">
          {liste.map((z) => {
            // „Plätze je Woche: 1,5 · Personen: 8 · je Person im Jahr: 10"
            const zahlen = [
              fill(t.awPlaetzeJeWoche, { n: k.zahl(z.jeWoche) }),
              fill(t.awPersonenZahl, { n: k.zahl(z.personen) }),
              z.jePersonJahr !== null && fill(t.awJePersonJahr, { n: k.zahl(z.jePersonJahr) }),
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={z.bereich} className="aw-zeile">
                <div className="aw-zeile-kopf">
                  <span className="aw-zeile-name">{k.bereich(z.bereich)}</span>
                  <span className="aw-zeile-zahl">
                    {/* Unter einer Woche gibt es nicht: Dann ist jeder jede Woche dran. */}
                    {z.abstand === null ? t.awNiemandHatIhn : fill(t.awAlleDauer, { dauer: k.dauer(Math.max(1, gerundet(z.abstand))) })}
                  </span>
                </div>
                <span className="klein-text">{zahlen}</span>
                <MiniBalken n={z.jePersonJahr ?? max} max={max} auffaellig={z.abstand === null} />
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
