import { useId, useState } from 'react'
import { fill } from '../i18n/useT'
import { zahlBinden } from '../i18n/zahl-binden'
import { Marke, Streifen } from './Diagramme'
import { gerundet, type Kontext } from './kontext'

/** So viele stehen unter „Wartet am längsten", bevor „Alle zeigen" den Rest bringt. */
const WARTEN_SICHTBAR = 8

/**
 * **Wartezeiten** (Entwurf `HandyWartezeiten`): je Bereich, wer am längsten nicht
 * dran war — gegen den üblichen Abstand —, und wer schnell wieder dran ist.
 * Der Bereich steht in einer Auswahl: Eine Versammlung hat leicht ein Dutzend.
 * In Worten statt als Balken (T138): „seit 14 Wochen · üblich: 6 Wochen", und
 * wer wirklich lange wartet, mit „wartet lange".
 *
 * Über das ganze Jahr (Jahresprobe 18.10.2026): Gewartet wird seit dem
 * letzten Mal. `bereich` hält
 * die Seite, damit ein Hinweis „Lange Wartezeit" ihn einstellen kann; ohne
 * Wahl steht der Bereich des ersten Hinweises da.
 */
export function WartezeitenAnsicht({ k, bereich, onBereich }: { k: Kontext; bereich: string | null; onBereich: (bereich: string) => void }) {
  const { t } = k
  const auswahlId = useId()
  const bereiche = [...k.a.wartezeiten].sort((a, b) => k.bereich(a.bereich).localeCompare(k.bereich(b.bereich), k.lang))
  const vorwahl = k.a.hinweise.find((h) => h.art === 'wartet')
  // „Alle zeigen" gilt für den Bereich, in dem es gedrückt wurde.
  const [alleIn, setAlleIn] = useState<string | null>(null)
  const w = bereiche.find((b) => b.bereich === (bereich ?? (vorwahl?.art === 'wartet' ? vorwahl.bereich : null))) ?? bereiche[0]
  if (!w) return <p className="karte aw-leer">{t.awKeineDaten}</p>
  const alle = alleIn === w.bereich
  const warten = alle ? w.warten : w.warten.slice(0, WARTEN_SICHTBAR)
  // In jeder Zeile: So steht sie für sich, auch vorgelesen.
  const ueblich = w.ueblich !== null && zahlBinden(`${t.awUeblich}: ${k.dauer(gerundet(w.ueblich))}`)

  return (
    <div className="aw-ansicht">
      <div className="blatt-feld">
        <label className="feld-marke" htmlFor={auswahlId}>
          {t.awBereich}
        </label>
        <select id={auswahlId} className="feld-wahl" value={w.bereich} onChange={(e) => onBereich(e.target.value)}>
          {bereiche.map((b) => (
            <option key={b.bereich} value={b.bereich}>
              {k.bereich(b.bereich)}
            </option>
          ))}
        </select>
      </div>
      <p className="aw-erklaerung">
        {w.ueblich === null ? t.awUeblichKeins : fill(t.awUeblichText, { ueblich: k.dauer(gerundet(w.ueblich)) })}
      </p>

      {w.ueblich !== null && (
        <section className="karte aw-gruppe" aria-label={t.awWartetLaengsten}>
          <h2 className="aw-gruppe-kopf">{t.awWartetLaengsten}</h2>
          <ul className="aw-zeilen">
            {warten.map((z) => {
              // „seit 20 Wochen · üblich: 6 Wochen · 2. Mai · davon nicht einteilbar: 4 Wochen · geplant: 26. Okt."
              const zeile = [
                z.wochen === null ? t.awNieImJahr : fill(t.awSeit, { dauer: k.dauer(z.wochen) }),
                ueblich,
                z.zuletzt && k.datum(z.zuletzt),
                z.wochen !== null && z.nichtEinteilbar > 0 && fill(t.awDavonNichtEinteilbar, { dauer: k.dauer(z.nichtEinteilbar) }),
                z.ueber && t.awUeberErwartung,
                z.geplant && fill(t.awGeplant, { datum: k.datum(z.geplant) }),
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <li key={z.pid} className="aw-zeile">
                  <div className="aw-zeile-kopf">
                    <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(z.pid)}>
                      {k.name(z.pid)}
                    </button>
                    {/* Nur wer wirklich lange wartet: Wer schon geplant ist oder insgesamt über seiner Erwartung liegt, wartet nicht (17.10.2026). */}
                    {z.lange && <Marke art="problem" text={t.awWartetLange} />}
                  </div>
                  <span className="aw-zeile-zahl">{zeile}</span>
                </li>
              )
            })}
          </ul>
          {w.warten.length > WARTEN_SICHTBAR && (
            <button type="button" className="knopf-pille aw-mehr" aria-expanded={alle} onClick={() => setAlleIn(alle ? null : w.bereich)}>
              {alle ? t.awWeniger : t.awAlleZeigen}
            </button>
          )}
        </section>
      )}

      {w.schnell.length > 0 && (
        <section className="karte aw-gruppe" aria-label={t.awSchnellTitel}>
          <h2 className="aw-gruppe-kopf">{t.awSchnellTitel}</h2>
          <p className="klein-text">{t.awSchnellText}</p>
          <ul className="aw-zeilen">
            {w.schnell.map((s) => {
              const takt = fill(t.awAlleDauer, { dauer: k.dauer(gerundet(s.abstand)) })
              return (
                <li key={s.pid} className="aw-zeile">
                  <div className="aw-zeile-kopf">
                    <button type="button" className="aw-zeile-name" onClick={() => k.personOeffnen(s.pid)}>
                      {k.name(s.pid)}
                    </button>
                    <span className="aw-zeile-zahl">
                      {takt} · {fill(t.awMale, { n: k.zahl(s.mal) })}
                    </span>
                  </div>
                  <Streifen wochen={s.wochen} aria={`${k.name(s.pid)}: ${takt}`} />
                </li>
              )
            })}
          </ul>
          <p className="klein-text">{t.awStreifenText}</p>
        </section>
      )}
    </div>
  )
}
