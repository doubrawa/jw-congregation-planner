import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { QrSvg } from '../bausteine/QrSvg'
import { gebundenesDatum } from '../components/datum-anzeige'
import { useZweiTipp } from '../components/useZweiTipp'
import { fill, useT } from '../i18n/useT'
import type { QrBild } from '../lib/qr-bild'
import { einmalCodeHolen, type EinmalCode, sichtbarMs, zugangErneuern } from '../lib/zugang'
import { useWaehrenddessen } from './useWaehrenddessen'

/**
 * **Anmeldung**: ein weiteres Gerät anmelden und den Zugang erneuern —
 * ohne die Ältesten.
 *
 *  - **Code anzeigen** holt einen Einmal-Code (`anmelden`, `aktion:
 *    'einmalcode'`): kurz gültig, nur einmal einzulösen, zum Eintippen und als
 *    QR-Code. Eingetippt wird er auf der Anmeldeseite wie der Code vom Zettel —
 *    in der installierten App auf dem iPhone der einzige Weg, ein QR-Code
 *    öffnet dort Safari. Läuft er ab, verschwindet er.
 *  - **Zugang erneuern** (zwei Tipps) sperrt Link und Zettel und meldet alle
 *    übrigen Geräte ab; dieses bleibt angemeldet.
 *
 * Den bisherigen Code zeigt sie nicht: Gespeichert ist nur seine Prüfsumme.
 * Nur für Konten mit Person — ohne sie gibt es weder Zettel noch Code.
 */
export function AnmeldungKarte() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [code, setCode] = useState<{ einmal: EinmalCode; qr: QrBild } | null>(null)
  const { laeuft, waehrenddessen } = useWaehrenddessen('zugang')

  // Abgelaufen: weg damit — er meldet ohnehin niemanden mehr an.
  useEffect(() => {
    if (!code) return
    const uhr = setTimeout(() => setCode(null), sichtbarMs(code.einmal.gueltigBis, Date.now()))
    return () => clearTimeout(uhr)
  }, [code])

  const erneuern = useZweiTipp(() => void erneuernJetzt())

  // `uqr` erst jetzt, und gleichzeitig mit der Function: Wer nie einen Code braucht, lädt es nicht.
  const zeigen = () =>
    waehrenddessen(async () => {
      const [einmal, { qrBild }] = await Promise.all([einmalCodeHolen(), import('../lib/qr-bild')])
      if (!einmal) return false
      setCode({ einmal, qr: qrBild(einmal.zettelUrl) })
    })

  const erneuernJetzt = () =>
    waehrenddessen(async () => {
      if (!(await zugangErneuern())) return false
      setCode(null)
      dispatch({ type: 'showToast', text: t.zugangErneuert })
    })

  if (!state.personId) return null

  return (
    <section className="karte profil-karte">
      <h2 className="abschnitt-titel karte-titel">{t.anmeldungKarte}</h2>
      <p className="klein-text">{t.geraetText}</p>
      {code ? (
        <div className="profil-zeile anmeldung-code">
          <QrSvg qr={code.qr} className="anmeldung-qr" />
          <div className="anmeldung-code-text">
            <span className="anmeldung-code-wert" dir="ltr">
              {code.einmal.code}
            </span>
            <span className="klein-text">
              {fill(t.einmalCodeGilt, { zeit: gebundenesDatum(new Date(code.einmal.gueltigBis), state.lang, 'uhrzeit') })}
            </span>
          </div>
          <p className="klein-text anmeldung-anleitung">{fill(t.einmalCodeAnleitung, { knopf: t.codeEintippen })}</p>
        </div>
      ) : (
        <div className="profil-zeile anmeldung-knopf">
          {/* Gesperrt, ohne den Fokus abzugeben: Ein `disabled` unter dem
              Finger, der eben getippt hat, schöbe ihn an den Anfang der Seite. */}
          <GesperrterKnopf className="knopf-umriss" gesperrt={laeuft} onTipp={() => void zeigen()}>
            {t.codeAnzeigen}
          </GesperrterKnopf>
        </div>
      )}
      <div className="profil-zeile anmeldung-erneuern">
        <p className="klein-text">{t.zugangErneuernText}</p>
        <GesperrterKnopf
          className={`zwei-tipp knopf-umriss${erneuern.armed ? ' is-armed' : ''}`}
          gesperrt={laeuft}
          onTipp={erneuern.onClick}
          onBlur={erneuern.onBlur}
        >
          {erneuern.armed ? t.zugangErneuernSicher : t.zugangErneuern}
        </GesperrterKnopf>
      </div>
    </section>
  )
}
