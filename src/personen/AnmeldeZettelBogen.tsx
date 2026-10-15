import { createPortal } from 'react-dom'
import { Logo } from '../bausteine/Logo'
import { seiten } from '../components/druck-seiten'
import { isRTL } from '../i18n/langs'
import { fill } from '../i18n/useT'
import type { Zettel, ZettelSatz } from './zettel-satz'
import './print-anmeldezettel.css'

/** Sechs Zettel je A4 — wie die S-89-Zettel, und mit derselben Aufteilung (`seiten`). */
const JE_BLATT = 6

/**
 * **Der Bogen der Anmelde-Zettel** (T121, Phase 8; Entwurf `GEinladungsZettel`):
 * zum Ausschneiden, je Person ihr Name, der QR-Code mit dem Link, darunter
 * der Code zum Eintippen, bis wann er gilt und was zu tun ist.
 *
 * Am Bildschirm unsichtbar; er steht nur für den Druck im DOM, und nur so
 * lange (`useZettelDruck`) — die Codes darauf melden an. Direkt unter `body`
 * (Portal), damit der Druck alles andere mit einer Regel ausblenden kann,
 * gleich, von welchem Bildschirm aus gedruckt wird.
 *
 * In der Sprache der Versammlung, wie die E-Mail: Die Empfänger haben noch
 * keine gewählt.
 */
export function AnmeldeZettelBogen({ satz }: { satz: ZettelSatz }) {
  const { t } = satz
  const blaetter = seiten(satz.zettel, JE_BLATT)
  const versammlung = fill(t.congLabel, { name: satz.versammlung })
  return createPortal(
    <div className="anmelde-bogen" lang={satz.lang} dir={isRTL(satz.lang) ? 'rtl' : 'ltr'} aria-hidden="true">
      {blaetter.map((reihen, si) => (
        <section key={si} className="anmelde-seite">
          <p className="anmelde-seite-kopf">
            <span>
              <strong>{t.anmeldeZettel}</strong> · {versammlung} · {t.zumAusschneiden}
            </span>
            <span>{fill(t.seiteVon, { n: si + 1, m: blaetter.length })}</span>
          </p>
          <table className="anmelde-tabelle" role="presentation">
            <tbody>
              {reihen.map((reihe, ri) => (
                <tr key={ri}>
                  {reihe.map((z, ci) => (
                    <td key={ci}>{z && <AnmeldeZettel zettel={z} satz={satz} versammlung={versammlung} />}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>,
    document.body,
  )
}

function AnmeldeZettel({ zettel, satz, versammlung }: { zettel: Zettel; satz: ZettelSatz; versammlung: string }) {
  const { t } = satz
  const rand = 2
  const kante = zettel.qr.groesse + 2 * rand
  return (
    <div className="anmelde-zettel">
      <p className="anmelde-zettel-kopf">
        <Logo breite={26} />
        <span>{versammlung}</span>
      </p>
      <p className="anmelde-zettel-fuer">
        <span className="anmelde-klein">{t.anmeldungFuer}</span>
        <span className="anmelde-name" dir="auto">
          {zettel.name}
        </span>
      </p>
      <div className="anmelde-zettel-code">
        {/* Der helle Rand gehört zum Code: Ohne ihn finden manche Kameras ihn nicht. */}
        <svg className="anmelde-qr" viewBox={`${-rand} ${-rand} ${kante} ${kante}`} shapeRendering="crispEdges">
          <rect x={-rand} y={-rand} width={kante} height={kante} fill="#fff" />
          <path d={zettel.qr.pfad} fill="#000" />
        </svg>
        <span className="anmelde-code-text">
          <span className="anmelde-klein">{t.codeLbl}</span>
          <span className="anmelde-code" dir="ltr">
            {zettel.code}
          </span>
          <span className="anmelde-klein">{fill(t.gueltigBisDatum, { datum: zettel.bis })}</span>
        </span>
      </div>
      <p className="anmelde-anleitung">{fill(t.zettelAnleitung, { adresse: satz.adresse, frage: t.ohneMailFrage })}</p>
    </div>
  )
}
