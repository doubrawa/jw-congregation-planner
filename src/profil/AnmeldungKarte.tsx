import { useEffect, useState } from 'react'
import { useApp } from '../app/context'
import { QrSvg } from '../bausteine/QrSvg'
import { gebundenesDatum } from '../components/datum-anzeige'
import { useZweiTipp } from '../components/useZweiTipp'
import { fill, useT } from '../i18n/useT'
import type { QrBild } from '../lib/qr-bild'
import { einmalCodeHolen, type EinmalCode, sichtbarMs, zugangErneuern } from '../lib/zugang'

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
  const [laeuft, setLaeuft] = useState(false)

  // Abgelaufen: weg damit — er meldet ohnehin niemanden mehr an.
  useEffect(() => {
    if (!code) return
    const uhr = setTimeout(() => setCode(null), sichtbarMs(code.einmal.gueltigBis, Date.now()))
    return () => clearTimeout(uhr)
  }, [code])

  const erneuern = useZweiTipp(() => void erneuernJetzt())

  /** Offline geht keins von beiden — die Function ist nicht zu erreichen. */
  const online = (): boolean => {
    if (!state.staleAt) return true
    dispatch({ type: 'showToast', text: t.offlineReadOnly })
    return false
  }

  /**
   * Einmal sperren, solange gefragt wird — und auch nach einem Wurf wieder
   * frei: Ein fehlendes Bündel nach einem Deploy (`qr-bild`) ließe den Knopf
   * sonst für immer grau.
   */
  const waehrenddessen = async (arbeit: () => unknown) => {
    if (laeuft || !online()) return
    setLaeuft(true)
    try {
      await arbeit()
    } catch (err) {
      console.error('[zugang]', err instanceof Error ? err.message : String(err))
      dispatch({ type: 'showToast', text: t.zugangFehler })
    } finally {
      setLaeuft(false)
    }
  }

  // `uqr` erst jetzt, und gleichzeitig mit der Function: Wer nie einen Code braucht, lädt es nicht.
  const zeigen = () =>
    waehrenddessen(async () => {
      const [einmal, { qrBild }] = await Promise.all([einmalCodeHolen(), import('../lib/qr-bild')])
      if (einmal) setCode({ einmal, qr: qrBild(einmal.zettelUrl) })
      else dispatch({ type: 'showToast', text: t.zugangFehler })
    })

  const erneuernJetzt = () =>
    waehrenddessen(async () => {
      const ok = await zugangErneuern()
      if (ok) setCode(null)
      dispatch({ type: 'showToast', text: ok ? t.zugangErneuert : t.zugangFehler })
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
          <button type="button" className="knopf-umriss" onClick={() => void zeigen()} disabled={laeuft}>
            {t.codeAnzeigen}
          </button>
        </div>
      )}
      <div className="profil-zeile anmeldung-erneuern">
        <p className="klein-text">{t.zugangErneuernText}</p>
        <button
          type="button"
          className={`zwei-tipp knopf-umriss${erneuern.armed ? ' is-armed' : ''}`}
          onClick={erneuern.onClick}
          onBlur={erneuern.onBlur}
          disabled={laeuft}
        >
          {erneuern.armed ? t.zugangErneuernSicher : t.zugangErneuern}
        </button>
      </div>
    </section>
  )
}
