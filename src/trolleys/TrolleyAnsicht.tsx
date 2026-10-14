import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { eigenePerson } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { Zeichen } from '../bausteine/Zeichen'
import { Sheet } from '../components/Sheet'
import { DESKTOP_BREITE, useMedia } from '../components/useMedia'
import { WeekNav } from '../components/WeekNav'
import { fromIso, montagNach, montagVon, tagNach, versatzAbMontag } from '../data/meeting-dates'
import { darfTrolley, eigeneTermine, freierZeitraum, partnerGesucht, trolleysSortiert } from '../data/trolleys'
import type { TrolleyTermin } from '../data/types'
import { useT } from '../i18n/useT'
import { EintragenFormular } from './EintragenFormular'
import { TerminBlatt } from './TerminBlatt'
import { type Eingabe, neueEingabe, TROLLEY_WOCHEN, wochenSpanne } from './trolley-anzeige'
import { DeineTermine, PartnerGesucht } from './TrolleyListen'
import { TagWahl, TrolleyTag } from './TrolleyTag'
import { TrolleyWoche } from './TrolleyWoche'
import { trolleyFehlerText, useTrolleyAktion } from './useTrolleyAktion'
import './trolleys.css'

/**
 * **Trolleys** im Predigtdienst (T121, Phase 7; Entwürfe `GZeugnis`,
 * `GTabletTrolleys`, `GDesktopTrolleys`). „Verabredet euch und tragt euch ein":
 * oben die eigenen Termine und wo jemand einen Partner sucht, darunter die
 * Woche — am Handy und Tablet ein Tag mit einer Spalte je Trolley, am Desktop
 * die ganze Woche als Raster mit dem Formular „Eintragen" rechts daneben.
 *
 * Eintragen kann, wer das Trolley-Recht hat; sehen können alle. Geschrieben
 * wird über die Function `trolley` (`useTrolleyAktion`), die dem Partner
 * Bescheid sagt.
 */
export function TrolleyAnsicht() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const desktop = useMedia(DESKTOP_BREITE)
  const aktion = useTrolleyAktion()
  const ich = eigenePerson(state)
  const darf = darfTrolley(ich)
  const trolleys = useMemo(() => trolleysSortiert(state.trolleys), [state.trolleys])

  // Die Woche als Abstand zu dieser, der Tag als Abstand zum Montag — so
  // bleibt beim Blättern derselbe Wochentag gewählt.
  const [woche, setWoche] = useState(0)
  const [tagImWochenlauf, setTag] = useState(() => versatzAbMontag(fromIso(heute).getDay()))
  const montag = montagNach(montagVon(heute), woche)
  const datum = tagNach(montag, tagImWochenlauf)

  const eigene = useMemo(() => eigeneTermine(state.trolleyTermine, ich?.id, fromIso(heute)), [state.trolleyTermine, ich?.id, heute])
  const gesucht = useMemo(() => partnerGesucht(state.trolleyTermine, ich?.id, fromIso(heute)), [state.trolleyTermine, ich?.id, heute])

  const [termin, setTermin] = useState<TrolleyTermin | null>(null)
  // Am Handy steht das Formular im Blatt (`blatt`), am Desktop immer rechts.
  const [blatt, setBlatt] = useState(false)
  const ersterTrolley = trolleys[0]?.id ?? ''
  const [eingabe, setEingabe] = useState<Eingabe>(() => neueEingabe(ersterTrolley, datum < heute ? heute : datum))

  // Der Termin im Blatt, wie er jetzt dasteht — die Function kann ihn geändert haben.
  const offenerTermin = termin ? (state.trolleyTermine.find((x) => x.id === termin.id) ?? null) : null

  const eintragen = (trolleyId: string, tag: string, von?: string) => {
    setEingabe(neueEingabe(trolleyId || ersterTrolley, tag < heute ? heute : tag, von ? freierZeitraum(state.trolleyTermine, trolleyId, tag, von) : undefined))
    if (!desktop) setBlatt(true)
  }
  const dazukommen = async (x: TrolleyTermin) => {
    if (!ich) return
    const grund = await aktion.dazukommen(x, ich.id)
    if (grund) dispatch({ type: 'showToast', text: trolleyFehlerText(grund, t) })
  }

  return (
    <div className={desktop ? 'trolley-ansicht is-desktop' : 'trolley-ansicht'}>
      <div className="trolley-haupt">
        <p className="klein-text trolley-intro">{t.trolleyIntro}</p>
        {(eigene.length > 0 || gesucht.length > 0) && (
          <div className="trolley-listen">
            {eigene.length > 0 && <DeineTermine termine={eigene} onTermin={setTermin} />}
            {gesucht.length > 0 && (
              <PartnerGesucht termine={gesucht} darf={darf} laeuft={aktion.laeuft} onDazukommen={(x) => void dazukommen(x)} />
            )}
          </div>
        )}
        <div className="wochenwahl">
          <WeekNav
            canPrev={woche > 0}
            canNext={woche < TROLLEY_WOCHEN - 1}
            onPrev={() => setWoche((w) => w - 1)}
            onNext={() => setWoche((w) => w + 1)}
          >
            <span className="woche-zeitraum">{wochenSpanne(montag, state.lang)}</span>
            {woche === 0 && (
              <span className="woche-unterzeile">
                <span className="woche-hinweis is-aktuell">{t.aktuelleWoche}</span>
              </span>
            )}
          </WeekNav>
        </div>
        {desktop ? (
          <>
            <TrolleyWoche
              montag={montag}
              heute={heute}
              eintragbar={darf}
              trolleys={trolleys}
              termine={state.trolleyTermine}
              onTermin={setTermin}
              onFrei={(trolleyId, tag) => eintragen(trolleyId, tag)}
            />
            {/* Ohne Trolley-Recht steht rechts kein Formular — dafür hier, warum. */}
            <p className="klein-text">{darf ? t.trolleyKlickFrei : t.trolleyFehlerKeinRecht}</p>
          </>
        ) : (
          <>
            <TagWahl
              montag={montag}
              datum={datum}
              termine={state.trolleyTermine}
              onDatum={(tag) => setTag(versatzAbMontag(fromIso(tag).getDay()))}
            />
            {darf ? (
              <button type="button" className="knopf-haupt trolley-eintragen" onClick={() => eintragen(ersterTrolley, datum)}>
                <Zeichen name="plus" />
                {t.trolleyEintragen}
              </button>
            ) : (
              <p className="klein-text">{t.trolleyFehlerKeinRecht}</p>
            )}
            <TrolleyTag
              datum={datum}
              trolleys={trolleys}
              termine={state.trolleyTermine}
              eintragbar={darf && datum >= heute}
              onTermin={setTermin}
              onFrei={(trolleyId, von) => eintragen(trolleyId, datum, von)}
            />
          </>
        )}
      </div>

      {desktop && darf && (
        <aside className="trolley-seite" aria-label={t.trolleyEintragenLabel}>
          <div className="trolley-seite-kopf">
            <span className="sheet-marke">{t.privZeugnis}</span>
            <h2 className="seitentitel">{t.trolleyEintragen}</h2>
          </div>
          <EintragenFormular eingabe={eingabe} onEingabe={setEingabe} onFertig={() => setEingabe(neueEingabe(eingabe.trolleyId, eingabe.datum))} />
        </aside>
      )}

      {!desktop &&
        blatt &&
        createPortal(
          <Sheet label={t.trolleyEintragenLabel} eyebrow={<div className="sheet-marke">{t.privZeugnis}</div>} title={t.trolleyEintragen} onClose={() => setBlatt(false)}>
            <div className="sheet-inhalt">
              <EintragenFormular
                eingabe={eingabe}
                onEingabe={setEingabe}
                onFertig={() => setBlatt(false)}
                onAbbrechen={() => setBlatt(false)}
              />
            </div>
          </Sheet>,
          document.body,
        )}
      {offenerTermin && <TerminBlatt termin={offenerTermin} onClose={() => setTermin(null)} />}
    </div>
  )
}
