import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { Punkt } from '../bausteine/Punkt'
import { gebundenesDatum } from '../components/datum-anzeige'
import { Sheet } from '../components/Sheet'
import { useZweiTipp } from '../components/useZweiTipp'
import { fill, useT } from '../i18n/useT'
import { copyText } from '../lib/clipboard'
import { geraeteArt } from '../lib/geraet'
import { type KalenderAbo, kalenderAusstellen, kalenderBeenden, kalenderStand, webcalAdresse } from '../lib/kalender'
import { useWaehrenddessen } from './useWaehrenddessen'

/**
 * **Kalender**: die eigenen Aufgaben als Termine im Kalender des Handys —
 * über einen geheimen Link, den die Kalender-App abonniert (Function
 * `kalender`). Nur lesend: Bestätigen und absagen bleibt in der App.
 *
 *  - **Kalender abonnieren** stellt den Link aus und zeigt ihn im Blatt — nur
 *    dieses eine Mal: Gespeichert ist nur seine Prüfsumme. Am Android-Handy
 *    steht schon davor, dass es dafür einmal einen Computer braucht: Google
 *    Kalender nimmt einen Abo-Link nur dort an.
 *  - **Abonniert** sagt, wann die Kalender-App zuletzt geholt hat — daran sieht
 *    man, ob das Abo trägt. **Neuer Link** (zwei Tipps) sperrt den alten,
 *    **Abo beenden** (zwei Tipps) ebenso, ohne einen neuen.
 *
 * Nur für Konten mit Person — ohne sie gibt es keine eigenen Aufgaben.
 */
export function KalenderKarte() {
  const { state } = useApp()
  const { t } = useT()
  // `undefined`: noch nicht gefragt oder nicht zu erfahren (offline).
  const [abo, setAbo] = useState<KalenderAbo | null | undefined>(undefined)
  const [link, setLink] = useState<string | null>(null)
  const { laeuft, waehrenddessen } = useWaehrenddessen('kalender')
  const online = !state.staleAt
  // Zählt, wie oft ein Knopf gehandelt hat: Was er erfahren hat, ist neuer als
  // jede Frage nach dem Stand, die vor ihm losging.
  const knoepfe = useRef(0)

  useEffect(() => {
    if (!state.personId || !online) return
    let aktuell = true
    const vorher = knoepfe.current
    void kalenderStand().then((stand) => {
      if (aktuell && knoepfe.current === vorher) setAbo(stand)
    })
    return () => {
      aktuell = false
    }
  }, [state.personId, online])

  /** Wie `waehrenddessen` — und eine Frage nach dem Stand, die vorher losging, ist danach überholt. */
  const handeln = (arbeit: () => unknown) =>
    waehrenddessen(() => {
      knoepfe.current += 1
      return arbeit()
    })

  /** Stellt den Link aus und zeigt ihn — ein bisheriger ist damit gesperrt. */
  const linkAusstellen = async () => {
    const url = await kalenderAusstellen(state.lang)
    if (!url) return false
    setLink(url)
    setAbo({ erstelltAt: new Date().toISOString(), abgerufenAt: null })
    return true
  }
  /**
   * Erst nachsehen: Ein Abo, das die Karte nicht kennt (vom anderen Gerät, oder
   * die erste Frage kam nicht durch), sperrt nur „Neuer Link" — mit zwei Tipps.
   */
  const abonnieren = () =>
    handeln(async () => {
      const stand = await kalenderStand()
      if (stand === undefined) return false
      if (!stand) return linkAusstellen()
      setAbo(stand)
      return true
    })
  const neu = useZweiTipp(() => void handeln(linkAusstellen))
  const beenden = useZweiTipp(
    () =>
      void handeln(async () => {
        const ok = await kalenderBeenden()
        if (ok) setAbo(null)
        return ok
      }),
  )

  if (!state.personId) return null

  const zuletzt = abo?.abgerufenAt ? new Date(abo.abgerufenAt) : null
  return (
    <section className="karte profil-karte">
      <h2 className="abschnitt-titel karte-titel">{t.kalenderKarte}</h2>
      {abo ? (
        <div className="profil-zeile kalender-abo">
          <span className="kalender-stand">
            <Punkt art="voll" />
            {t.kalenderAbonniert}
          </span>
          <p className="klein-text">
            {zuletzt
              ? fill(t.kalenderZuletzt, {
                  tag: gebundenesDatum(zuletzt, state.lang, 'tagMonatKurz'),
                  zeit: gebundenesDatum(zuletzt, state.lang, 'uhrzeit'),
                })
              : t.kalenderNochNie}
          </p>
          <p className="klein-text">{t.kalenderNeuText}</p>
          <div className="kalender-knoepfe">
            <GesperrterKnopf
              className={`zwei-tipp knopf-umriss${neu.armed ? ' is-armed' : ''}`}
              gesperrt={laeuft}
              onTipp={neu.onClick}
              onBlur={neu.onBlur}
            >
              {neu.armed ? t.kalenderNeuerLinkSicher : t.kalenderNeuerLink}
            </GesperrterKnopf>
            <GesperrterKnopf
              className={`zwei-tipp knopf-umriss kalender-beenden${beenden.armed ? ' is-armed' : ''}`}
              gesperrt={laeuft}
              onTipp={beenden.onClick}
              onBlur={beenden.onBlur}
            >
              {beenden.armed ? t.kalenderBeendenSicher : t.kalenderBeenden}
            </GesperrterKnopf>
          </div>
        </div>
      ) : (
        <div className="profil-zeile kalender-abo">
          <p>{t.kalenderText}</p>
          <p className="klein-text">{t.kalenderHinweis}</p>
          {geraeteArt() === 'android' && <p className="kalender-vorweg">{t.kalenderAndroidHinweis}</p>}
          <GesperrterKnopf className="knopf-umriss" gesperrt={laeuft} onTipp={() => void abonnieren()}>
            {t.kalenderAbonnieren}
          </GesperrterKnopf>
        </div>
      )}
      {link && <KalenderBlatt url={link} onClose={() => setLink(null)} />}
    </section>
  )
}

/**
 * **Das Blatt zum Abonnieren**: der Link, frisch ausgestellt, und der Weg für
 * das Gerät, das man in der Hand hält:
 *
 *  - **iPhone, iPad, Mac:** „Im Kalender öffnen" — ein Tipp, dann bestätigen.
 *  - **Android:** vorweg der Satz, dass es einen Computer braucht, dann
 *    „Kopieren" und der Weg über Google Kalender.
 *  - **Sonst** (ein Rechner, oder die Kennung verrät nichts): beide Knöpfe und
 *    alle Wege.
 *
 * Was das eigene Gerät nicht betrifft, liegt hinter „Anderes Gerät" — drei
 * Anleitungen nebeneinander lesen sich, als müsse man alle drei gehen. Dass
 * der Link ein Schlüssel ist, steht immer da.
 */
function KalenderBlatt({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useT()
  const [kopiert, setKopiert] = useState(false)
  const [andere, setAndere] = useState(false)
  const geraet = geraeteArt()
  const oeffnen = (klasse: string) => (
    <a className={klasse} href={webcalAdresse(url)}>
      {t.kalenderOeffnen}
    </a>
  )
  const kopieren = (klasse: string) => (
    <button type="button" className={klasse} onClick={() => void copyText(url).then(setKopiert)}>
      {kopiert ? t.markeKopiert : t.kopierenBtn}
    </button>
  )
  const apple = <p>{fill(t.kalenderApple, { knopf: t.kalenderOeffnen })}</p>
  const google = <p>{t.kalenderGoogle}</p>
  const outlook = <p>{t.kalenderOutlook}</p>
  const takt = <p className="klein-text">{t.kalenderTakt}</p>
  return (
    <Sheet label={t.kalenderAbonnieren} title={t.kalenderAbonnieren} onClose={onClose}>
      <div className="sheet-inhalt kalender-blatt">
        <p>{t.kalenderBlattText}</p>
        {geraet === 'apple' && (
          <>
            {oeffnen('knopf-haupt')}
            <div className="kalender-wege">{apple}</div>
          </>
        )}
        {geraet === 'android' && (
          <>
            <p className="kalender-vorweg">{t.kalenderAndroidHinweis}</p>
            {kopieren('knopf-haupt')}
            <div className="kalender-wege">{google}</div>
          </>
        )}
        {geraet === 'anderes' && (
          <>
            {oeffnen('knopf-haupt')}
            {kopieren('knopf-umriss')}
            <div className="kalender-wege">
              {apple}
              {google}
              {outlook}
            </div>
          </>
        )}
        <p className="kalender-geheim">
          <Punkt art="problem" />
          <span>{t.kalenderGeheim}</span>
        </p>
        {/* Wie oft Google nachsieht — wo der Weg über Google sichtbar ist. */}
        {geraet !== 'apple' && takt}
        {geraet !== 'anderes' && (
          <div className="kalender-andere">
            <button type="button" className="verweis-leise" aria-expanded={andere} onClick={() => setAndere(!andere)}>
              {t.kalenderAnderesGeraet}
            </button>
            {andere && (
              <>
                {geraet === 'apple' ? kopieren('knopf-umriss') : oeffnen('knopf-umriss')}
                <div className="kalender-wege">
                  {geraet === 'apple' ? google : apple}
                  {outlook}
                </div>
                {geraet === 'apple' && takt}
              </>
            )}
          </div>
        )}
      </div>
    </Sheet>
  )
}
