import { istKnapp, KNAPP_UNTER, type Engpass } from '../data/auswertung'
import { fill } from '../i18n/useT'
import { gerundet, type Kontext } from './kontext'

/**
 * **Engpässe** (Jahresprobe 18.10.2026; T139): je Bereich, wie viele Plätze je
 * Woche anfallen und wie viele Personen ihn haben — daraus, alle wie viele
 * Wochen jeder dran wäre. Immer über das ganze Jahr.
 *
 * Oben stehen nur die knappen Bereiche (`istKnapp`) mit dem Rat, mehr Personen
 * freizugeben; ist keiner knapp, sagt es ein Satz. Darunter alle Bereiche, die
 * knappsten zuerst — als Zeilen, nicht als Tabelle: Neben einer Spalte mit
 * Zahlen bräche „Schulungsaufgaben" bei 320 px und Stufe 1,45 mitten im Wort,
 * hier rückt die Zahl darunter. Bis zum 24.10.2026 stand jeder Bereich mit
 * Balken da, und die Kachel nannte „Am knappsten: Gebete" — bei einem Abstand
 * von vierzehn Wochen.
 */
export function EngpaesseAnsicht({ k }: { k: Kontext }) {
  const { t } = k
  const liste = k.a.engpaesse
  if (liste.length === 0) return <p className="karte aw-leer">{t.awKeineDaten}</p>
  const knappe = liste.filter(istKnapp)
  const grenze = k.dauer(KNAPP_UNTER)
  return (
    <div className="aw-ansicht">
      <p className="aw-erklaerung">{fill(t.awEngpaesseText, { dauer: grenze })}</p>
      {knappe.length === 0 ? (
        <p className="karte aw-leer">{fill(t.awKeinEngpass, { dauer: grenze })}</p>
      ) : (
        <section className="karte aw-gruppe" aria-label={t.awKnappeBereiche}>
          <h2 className="aw-gruppe-kopf">
            <span>{t.awKnappeBereiche}</span>
            <span className="klein-text">{k.zahl(knappe.length)}</span>
          </h2>
          <Zeilen liste={knappe} k={k} />
          <p className="klein-text">{t.awMehrFreigeben}</p>
        </section>
      )}
      <section className="karte aw-gruppe aw-engpaesse" aria-label={t.awAlleBereiche}>
        <h2 className="aw-gruppe-kopf">{t.awAlleBereiche}</h2>
        <Zeilen liste={liste} k={k} />
      </section>
    </div>
  )
}

/** Je Bereich: rechts der Abstand, darunter „Plätze je Woche: 1,5 · Personen: 3 · je Person im Jahr: 26". */
function Zeilen({ liste, k }: { liste: readonly Engpass[]; k: Kontext }) {
  const { t } = k
  return (
    <ul className="aw-zeilen">
      {liste.map((z) => (
        <li key={z.bereich} className="aw-zeile">
          <div className="aw-zeile-kopf">
            <span className="aw-zeile-name">{k.bereich(z.bereich)}</span>
            <span className="aw-zeile-zahl">
              {/* Unter einer Woche gibt es nicht: Dann ist jeder jede Woche dran. */}
              {z.abstand === null ? t.awNiemandHatIhn : fill(t.awAlleDauer, { dauer: k.dauer(Math.max(1, gerundet(z.abstand))) })}
            </span>
          </div>
          <span className="klein-text">
            {[
              fill(t.awPlaetzeJeWoche, { n: k.zahl(z.jeWoche) }),
              fill(t.awPersonenZahl, { n: k.zahl(z.personen) }),
              z.jePersonJahr !== null && fill(t.awJePersonJahr, { n: k.zahl(z.jePersonJahr) }),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}
