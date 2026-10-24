import { useState } from 'react'
import { Wahl } from '../bausteine/Wahl'
import { VERGLEICHE, type Vergleich, type VerteilungsZeile } from '../data/auswertung'
import { fill } from '../i18n/useT'
import { LageMarke } from './Diagramme'
import { TEXT_DES_VERGLEICHS } from './hinweis-texte'
import { gerundet, type Kontext } from './kontext'

/** Im Rahmen stehen zuerst so viele, dann „Alle zeigen". */
const RAHMEN_SICHTBAR = 5

const ERKLAERUNG = {
  aufgaben: 'awErklaerungAufgaben',
  hilfsdienste: 'awErklaerungHilfsdienste',
} as const satisfies Record<Vergleich, string>

/**
 * **Zu oft, zu selten** (Entwurf `HandyVerteilung`): je Person die Zuteilungen
 * gegen die Erwartung, getrennt nach zu oft, im Rahmen und zu selten.
 * Umschaltbar zwischen den Aufgaben und dem Vergleich mit den Hilfsdiensten.
 *
 * In Worten statt als Balken (T138): „Aufgaben: 7 · erwartet: 1", daneben
 * „6 mehr" — dieselben Worte wie im Hinweis. Die Tabelle, die neben dem Balken
 * für Vorleseprogramme stand, braucht es damit nicht mehr.
 */
export function VerteilungAnsicht({ k }: { k: Kontext }) {
  const { t } = k
  const [vergleich, setVergleich] = useState<Vergleich>('aufgaben')
  const [alle, setAlle] = useState(false)
  const v = k.a.verteilungen[vergleich]
  const gesamt = vergleich === 'hilfsdienste'
  const vergleichText: Record<Vergleich, string> = { aufgaben: t.awAufgaben, hilfsdienste: t.awHilfsdienste }
  const rahmen = alle ? v.rahmen : v.rahmen.slice(0, RAHMEN_SICHTBAR)
  const gruppen: { titel: string; zeilen: VerteilungsZeile[]; mehr: boolean; anzahl: number }[] = [
    { titel: t.awZuOft, zeilen: v.oft, mehr: false, anzahl: v.oft.length },
    { titel: t.awImRahmen, zeilen: rahmen, mehr: v.rahmen.length > RAHMEN_SICHTBAR, anzahl: v.rahmen.length },
    { titel: t.awZuSelten, zeilen: v.selten, mehr: false, anzahl: v.selten.length },
  ]

  return (
    <div className="aw-ansicht">
      <Wahl
        label={t.awVergleich}
        optionen={VERGLEICHE.map((wert) => ({ wert, text: vergleichText[wert] }))}
        wert={vergleich}
        onWahl={(w) => {
          setVergleich(w)
          setAlle(false)
        }}
        klein
      />
      <p className="aw-erklaerung">{`${t[ERKLAERUNG[vergleich]]} ${t.awErklaerungOhneBereich}`}</p>
      {gruppen.map((g) =>
        g.anzahl === 0 ? null : (
          <section key={g.titel} className="karte aw-gruppe" aria-label={g.titel}>
            <h2 className="aw-gruppe-kopf">
              <span>{g.titel}</span>
              <span className="klein-text">{k.zahl(g.anzahl)}</span>
            </h2>
            <ul className="aw-zeilen">
              {g.zeilen.map((z) => (
                <li key={z.pid} className="aw-zeile">
                  <div className="aw-zeile-kopf">
                    <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(z.pid)}>
                      {k.name(z.pid)}
                    </button>
                    <LageMarke lage={z.lage} n={z.n} erwartet={z.erwartet} k={k} />
                  </div>
                  <span className="aw-zeile-zahl">
                    {[
                      fill(t[TEXT_DES_VERGLEICHS[vergleich]], { n: k.zahl(z.n), e: k.zahl(gerundet(z.erwartet)) }),
                      gesamt && fill(t.awDavonHilfsdienste, { n: k.zahl(z.hilfsdienste) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            {g.mehr && (
              <button type="button" className="knopf-pille aw-mehr" aria-expanded={alle} onClick={() => setAlle(!alle)}>
                {alle ? t.awWeniger : t.awAlleZeigen}
              </button>
            )}
          </section>
        ),
      )}
    </div>
  )
}
