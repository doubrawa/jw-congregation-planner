import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp, type AppAction } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Spur } from '../bausteine/Spur'
import { Wahl } from '../bausteine/Wahl'
import { ZeitraumKalender } from '../bausteine/ZeitraumKalender'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import type { ZeitraumEnde } from '../components/kalender'
import { Sheet } from '../components/Sheet'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { TABLET_BREITE, useMedia } from '../components/useMedia'
import { datumsFormat } from '../components/datum-anzeige'
import { PlanTitel } from '../components/PlanTitel'
import { gruppenName, spannenAnzahl, spannenText } from '../components/weitere-plaene-anzeige'
import { fromIso } from '../data/meeting-dates'
import {
  beginntMit,
  eintraegeVon,
  planSpannen,
  planStand,
  spanneVon,
  taktVon,
  vorschauSpannen,
} from '../data/weitere-plaene'
import type { PlanTakt, WeitererPlan } from '../data/types'
import { useT } from '../i18n/useT'
import { spurDesPlans } from './plan-spur'
import '../components/weitere-plaene.css'

/** Was der Admin am Plan selbst ändert: Name, Zeitraum, Takt und ob er veröffentlicht ist. */
type PlanAenderung = Extract<AppAction, { type: 'wpPlanAendern' }>['patch']

/** Bis zu so vielen Gruppen stehen bei „Beginnen mit" nebeneinander (`Wahl`); mehr in einer Auswahlliste. */
const WAHL_GRUPPEN = 4

/**
 * **Plan bearbeiten** (T121, Entwurf `GPlaenePlanen`) — die Unteransicht der
 * Weiteren Pläne beim Planen: oben die Spur vom Entwurf bis zum Abschluss,
 * darunter der Plan mit „Beginnen mit", dann die Vorschau seiner Wochen oder
 * Monate, je mit ihrer Gruppe.
 *
 * Name, Zeitraum, Takt, Veröffentlichen und Löschen sind der Plan selbst — die
 * ändert der Admin. Der Planer sieht sie und verteilt die Gruppen (4.10.2026).
 * Veröffentlichen steht am Handy in der Leiste am unteren Rand, ab dem Tablet
 * neben dem Titel — wie „Plan senden" beim Planen der Woche. Drucken, links in
 * der Leiste des Entwurfs, kommt mit den Druckbögen (Phase 9).
 */
export function PlanBearbeiten({ plan, onZurueck }: { plan: WeitererPlan; onZurueck: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const breit = useMedia(TABLET_BREITE)
  const admin = state.planner
  const stand = planStand(plan, fromIso(tag))
  // Ein abgeschlossener Plan ist gewesen: nichts mehr zu verteilen, zu
  // veröffentlichen oder zu zeigen (`plaeneZumAnsehen`).
  const laeuft = stand !== 'abgeschlossen'
  const veroeffentlichen = admin && laeuft ? <VeroeffentlichenKnopf plan={plan} /> : null

  return (
    <>
      <section className="screen prog">
        <UnteransichtKopf titel={t.wpPlanBearbeiten} onZurueck={onZurueck}>
          {breit && veroeffentlichen}
        </UnteransichtKopf>
        <Spur schritte={spurDesPlans(plan, stand, t)} label={t.spurPlan} />
        <section className="karte wp-plan-karte">
          {admin ? <PlanFelder plan={plan} /> : <PlanAngaben plan={plan} />}
          {laeuft && <BeginnenMit plan={plan} />}
        </section>
        <PlanVorschau plan={plan} />
        {laeuft && (
          <p className="klein-text wp-sicht">{plan.entwurf ? `${t.wpEntwurfHint} ${t.wpSichtSaal}` : t.wpSichtSaal}</p>
        )}
        {admin && (
          <EntfernenKnopf
            className="knopf-umriss knopf-entfernen wp-loeschen"
            text={t.wpLoeschen}
            onEntfernen={() => {
              dispatch({ type: 'wpPlanLoeschen', id: plan.id })
              onZurueck()
            }}
          />
        )}
      </section>
      {!breit && veroeffentlichen && <div className="planen-leiste">{veroeffentlichen}</div>}
    </>
  )
}

/** Veröffentlichen — oder einen veröffentlichten Plan zurück in den Entwurf holen. */
function VeroeffentlichenKnopf({ plan }: { plan: WeitererPlan }) {
  const { dispatch } = useApp()
  const { t } = useT()
  return (
    <button
      type="button"
      className={plan.entwurf ? 'aktion-haupt' : 'aktion-neben'}
      onClick={() => dispatch({ type: 'wpPlanAendern', id: plan.id, patch: { entwurf: !plan.entwurf } })}
    >
      {plan.entwurf ? t.wpVeroeffentlichen : t.wpZurueckziehen}
    </button>
  )
}

/**
 * Was der Admin am Plan selbst ändert: Name, Zeitraum und Takt. Name und Takt
 * gelten sofort; der Zeitraum öffnet den Kalender auf dem Ende, auf das man
 * tippt.
 */
function PlanFelder({ plan }: { plan: WeitererPlan }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [zeitraum, setZeitraum] = useState<ZeitraumEnde | null>(null)
  const aendern = (patch: PlanAenderung): void => dispatch({ type: 'wpPlanAendern', id: plan.id, patch })
  const takt = taktVon(plan)
  // Kurz wie im Entwurf („31. Okt. 2027"): Die beiden Felder stehen nebeneinander.
  const datum = (tag: string): string => datumsFormat(state.lang, 'tagKurzJahr').format(fromIso(tag))

  return (
    <>
      <BlattFeld marke={t.nameLbl}>
        <input
          className="feld"
          type="text"
          dir="auto"
          value={plan.name}
          placeholder={t.wpNamePhSaal}
          onChange={(e) => aendern({ name: e.target.value })}
        />
      </BlattFeld>
      <div className="wp-zeitraum">
        <BlattFeld marke={t.von}>
          <button type="button" className="feld wp-datum" onClick={() => setZeitraum('von')}>
            {datum(plan.von)}
          </button>
        </BlattFeld>
        <BlattFeld marke={t.bis}>
          <button type="button" className="feld wp-datum" onClick={() => setZeitraum('bis')}>
            {datum(plan.bis)}
          </button>
        </BlattFeld>
      </div>
      {/* Der Takt (4.10.2026): je Woche oder je Monat eine Gruppe. Ein Wechsel
          nimmt die Reihe ins neue Raster mit (`taktWechseln`). Keine
          `BlattFeld`-Marke: Ein Tipp auf sie drückte den ersten Knopf. */}
      <div className="blatt-feld">
        <span className="feld-marke">{t.wpTakt}</span>
        <Wahl<PlanTakt>
          label={t.wpTakt}
          optionen={[
            { wert: 'woche', text: t.fsFreqW },
            { wert: 'monat', text: t.wpJedenMonat },
          ]}
          wert={takt}
          onWahl={(neu) => {
            if (neu !== takt) aendern({ takt: neu })
          }}
        />
      </div>
      {zeitraum && <ZeitraumBlatt plan={plan} start={zeitraum} onClose={() => setZeitraum(null)} />}
    </>
  )
}

/** Was der Planer vom Plan selbst sieht: den Plan, wie ihn alle sehen, und wie die Gruppen wechseln. */
function PlanAngaben({ plan }: { plan: WeitererPlan }) {
  const { t } = useT()
  return (
    <div className="wp-angaben">
      <PlanTitel plan={plan} />
      <p className="klein-text">{taktVon(plan) === 'monat' ? t.wpSaalTextMonat : t.wpSaalText}</p>
    </div>
  )
}

/**
 * **Der Zeitraum des Plans** im Kalender (Baustein `ZeitraumKalender`), auf dem
 * Ende, auf das man getippt hat. Er gilt erst mit „Übernehmen": Dazwischen
 * stünde er halb gesetzt da — und was aus ihm fällt, nähme der Plan mit
 * (`eintraegeImZeitraum`).
 */
function ZeitraumBlatt({ plan, start, onClose }: { plan: WeitererPlan; start: ZeitraumEnde; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const [zeitraum, setZeitraum] = useState({ von: plan.von, bis: plan.bis })
  const uebernehmen = (): void => {
    if (zeitraum.von !== plan.von || zeitraum.bis !== plan.bis) {
      dispatch({ type: 'wpPlanAendern', id: plan.id, patch: zeitraum })
    }
    onClose()
  }

  return createPortal(
    <Sheet label={t.zeitraumLbl} title={t.zeitraumLbl} sub={plan.name || t.wpOhneName} onClose={onClose}>
      <div className="sheet-inhalt">
        <ZeitraumKalender
          von={zeitraum.von}
          bis={zeitraum.bis}
          start={start}
          lang={state.lang}
          onWahl={(von, bis) => setZeitraum({ von, bis })}
        />
      </div>
      <div className="sheet-fuss">
        <button type="button" className="knopf-haupt" onClick={uebernehmen}>
          {t.uebernehmenBtn}
        </button>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {t.abbrechen}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}

/**
 * **Beginnen mit** (`GPlaenePlanen`): Ein Tipp auf eine Gruppe verteilt die
 * Wochen oder Monate ab der laufenden bis zum Ende, die Gruppen der Reihe nach
 * (`gruppenVerteilen`). Gedrückt ist, womit die Reihe jetzt beginnt
 * (`beginntMit`); ein Tipp darauf lässt alles, wie es ist — auch Gruppen, die
 * von Hand gesetzt sind.
 */
function BeginnenMit({ plan }: { plan: WeitererPlan }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  if (state.groups.length === 0) return null

  const beginnt = beginntMit(plan, state.planEintraege, tag) ?? ''
  const verteilen = (grp: string): void => {
    if (grp && grp !== beginnt) dispatch({ type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: grp })
  }
  const optionen = state.groups.map((g) => ({ wert: g.id, text: tu(g.name) }))

  return (
    <div className="blatt-feld">
      <span className="feld-marke">{t.wpAbGruppe}</span>
      {optionen.length <= WAHL_GRUPPEN ? (
        <Wahl label={t.wpAbGruppe} optionen={optionen} wert={beginnt} onWahl={verteilen} klein />
      ) : (
        <select className="feld-wahl" aria-label={t.wpAbGruppe} value={beginnt} onChange={(e) => verteilen(e.target.value)}>
          <option value="" disabled>
            {t.offenDash}
          </option>
          {optionen.map((o) => (
            <option key={o.wert} value={o.wert}>
              {o.text}
            </option>
          ))}
        </select>
      )}
      <p className="klein-text">{taktVon(plan) === 'monat' ? t.wpVerteilenHintMonat : t.wpVerteilenHint}</p>
    </div>
  )
}

/**
 * **Die Vorschau** (`GPlaenePlanen`): die Wochen oder Monate des Plans, je mit
 * ihrer Gruppe — zugeklappt die nächsten ab der laufenden (`vorschauSpannen`).
 * Kommende setzt man einzeln um; vergangene bleiben, wie sie waren.
 */
function PlanVorschau({ plan }: { plan: WeitererPlan }) {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const [alle, setAlle] = useState(false)
  const spannen = planSpannen(plan)
  const jetzt = spanneVon(taktVon(plan), tag)
  const gezeigt = alle ? spannen : vorschauSpannen(spannen, jetzt)
  const gruppeVon = new Map(eintraegeVon(state.planEintraege, plan.id).map((e) => [e.datum, e.grp]))

  return (
    <section className="karte wp-vorschau">
      <h2 className="abschnitt-titel karte-titel">{`${t.wpVorschau} · ${spannenAnzahl(plan, spannen.length, state.lang)}`}</h2>
      {gezeigt.map((spanne) => (
        <VorschauZeile
          key={spanne}
          plan={plan}
          spanne={spanne}
          grp={gruppeVon.get(spanne) ?? null}
          vorbei={spanne < jetzt}
        />
      ))}
      {gezeigt.length < spannen.length && (
        <button type="button" className="wp-alle" onClick={() => setAlle(true)}>
          {t.alleAnzeigen}
        </button>
      )}
    </section>
  )
}

/** Eine Woche oder ein Monat der Vorschau: wann, und die Gruppe — kommend zur Wahl, vergangen als Text. */
function VorschauZeile({
  plan,
  spanne,
  grp,
  vorbei,
}: {
  plan: WeitererPlan
  spanne: string
  grp: string | null
  vorbei: boolean
}) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const wann = spannenText(plan, spanne, state.lang)
  return (
    <div className={vorbei ? 'wp-vorschau-zeile is-vorbei' : 'wp-vorschau-zeile'}>
      <span>{wann}</span>
      {vorbei ? (
        <span className="wp-vorschau-wer">{gruppenName(grp, state.groups, tu) || t.offenDash}</span>
      ) : (
        <select
          className="wp-gruppe-wahl"
          aria-label={`${wann}: ${t.gbGruppe}`}
          value={grp ?? ''}
          onChange={(e) =>
            dispatch({ type: 'wpEintragSetzen', planId: plan.id, datum: spanne, grp: e.target.value || null })
          }
        >
          <option value="">{t.offenDash}</option>
          {state.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {tu(g.name)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
