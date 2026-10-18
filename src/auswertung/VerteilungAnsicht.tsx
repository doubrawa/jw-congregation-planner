import { useState } from 'react'
import { Wahl } from '../bausteine/Wahl'
import { VERGLEICHE, type Lage, type Vergleich, type VerteilungsZeile } from '../data/auswertung'
import { fill } from '../i18n/useT'
import { Legende, VergleichsBalken, type MusterArt } from './Diagramme'
import { gerundet, type Kontext } from './kontext'

/** Im Rahmen stehen zuerst so viele, dann „Alle zeigen". */
const RAHMEN_SICHTBAR = 5

type Darstellung = 'diagramm' | 'tabelle'

const LAGE_WORT = { oft: 'awLageOft', rahmen: 'awLageRahmen', selten: 'awLageSelten' } as const satisfies Record<Lage, string>
const ERKLAERUNG = {
  aufgaben: 'awErklaerungAufgaben',
  hilfsdienste: 'awErklaerungHilfsdienste',
} as const satisfies Record<Vergleich, string>

/**
 * **Zu oft, zu selten** (Entwurf `HandyVerteilung`): je Person die Zuteilungen
 * gegen die Erwartung, getrennt nach zu oft, im Rahmen und zu selten. Umschaltbar
 * zwischen den Aufgaben und dem Vergleich mit den Hilfsdiensten, dazu als
 * Tabelle — für Vorleseprogramme und wer lieber Zahlen liest.
 */
export function VerteilungAnsicht({ k }: { k: Kontext }) {
  const { t } = k
  const [vergleich, setVergleich] = useState<Vergleich>('aufgaben')
  const [darstellung, setDarstellung] = useState<Darstellung>('diagramm')
  const [alle, setAlle] = useState(false)
  const v = k.a.verteilungen[vergleich]
  const gesamt = vergleich === 'hilfsdienste'
  const vergleichText: Record<Vergleich, string> = { aufgaben: t.awAufgaben, hilfsdienste: t.awHilfsdienste }
  const legende: [MusterArt, string][] = [
    ['band', t.awUeblich],
    ['strich', t.awErwartet],
    ['ueber', t.awDarueber],
    ['unter', t.awDarunter],
    ...(gesamt ? ([['andere', t.awAufgaben], ['hilfsdienst', t.awHilfsdienste]] as [MusterArt, string][]) : []),
  ]
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
      <Wahl
        label={t.awDarstellung}
        optionen={[
          { wert: 'diagramm' as const, text: t.awDiagramm },
          { wert: 'tabelle' as const, text: t.awTabelle },
        ]}
        wert={darstellung}
        onWahl={setDarstellung}
      />
      <p className="aw-erklaerung">{`${t[ERKLAERUNG[vergleich]]} ${t.awErklaerungOhneBereich}`}</p>
      {darstellung === 'diagramm' && <Legende eintraege={legende} />}
      {gruppen.map((g) =>
        g.anzahl === 0 ? null : (
          <section key={g.titel} className="karte aw-gruppe" aria-label={g.titel}>
            <h2 className="aw-gruppe-kopf">
              <span>{g.titel}</span>
              <span className="klein-text">{k.zahl(g.anzahl)}</span>
            </h2>
            {darstellung === 'diagramm' ? (
              <ul className="aw-zeilen">
                {g.zeilen.map((z) => (
                  <li key={z.pid} className="aw-zeile">
                    <div className="aw-zeile-kopf">
                      <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(z.pid)}>
                        {k.name(z.pid)}
                      </button>
                      <span className="aw-zeile-zahl">{fill(t.awNErwartet, { n: k.zahl(z.n), e: k.zahl(gerundet(z.erwartet)) })}</span>
                    </div>
                    {gesamt && <span className="klein-text">{fill(t.awDavonHilfsdienste, { n: k.zahl(z.hilfsdienste) })}</span>}
                    <VergleichsBalken
                      n={z.n}
                      erwartet={z.erwartet}
                      hilfsdienste={z.hilfsdienste}
                      zweiteilig={gesamt}
                      lage={z.lage}
                      max={v.max}
                      aria={fill(t.awBalkenAria, { n: k.zahl(z.n), e: k.zahl(gerundet(z.erwartet)), lage: t[LAGE_WORT[z.lage]] })}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <table className="aw-tabelle">
                <thead>
                  <tr>
                    <th scope="col">{t.awPerson}</th>
                    <th scope="col">{t.awZuteilungen}</th>
                    {gesamt && <th scope="col">{t.awHilfsdienste}</th>}
                    <th scope="col">{t.awErwartet}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.zeilen.map((z) => (
                    <tr key={z.pid}>
                      <th scope="row">{k.name(z.pid)}</th>
                      <td>{k.zahl(z.n)}</td>
                      {gesamt && <td>{k.zahl(z.hilfsdienste)}</td>}
                      <td>{k.zahl(gerundet(z.erwartet))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
