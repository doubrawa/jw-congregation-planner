import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useApp, type AppAction } from '../app/context'
import { useKalendertag } from '../app/useKalendertag'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Spur } from '../bausteine/Spur'
import { Wahl } from '../bausteine/Wahl'
import { Zeichen } from '../bausteine/Zeichen'
import { ZeitraumKalender } from '../bausteine/ZeitraumKalender'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import type { ZeitraumEnde } from '../components/kalender'
import { Sheet } from '../components/Sheet'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { TABLET_BREITE, useMedia } from '../components/useMedia'
import { gebundenesDatum } from '../components/datum-anzeige'
import { spannenAnzahl, spannenText, werName } from '../components/weitere-plaene-anzeige'
import { displayName, personCompare, reinigungsGruppen } from '../data/helpers'
import { fromIso } from '../data/meeting-dates'
import {
  beginntMit,
  eintraegeJeSpanne,
  planSpannen,
  planStand,
  spanneVon,
  spannenImPlan,
  taktVon,
  vorschauSpannen,
  type Belegung,
} from '../data/weitere-plaene'
import type { PlanEintrag, PlanTakt, WeitererPlan } from '../data/types'
import { PlanBogen } from '../druck/PlanBogen'
import { useDruckBogen } from '../druck/useDruckBogen'
import { useT } from '../i18n/useT'
import { DruckKnopf } from '../programm/DruckKnopf'
import { spurDesPlans } from './plan-spur'
import '../components/weitere-plaene.css'

/** Was am Plan selbst geändert wird: Name, Zeitraum, Takt und ob er veröffentlicht ist. */
type PlanAenderung = Extract<AppAction, { type: 'wpPlanAendern' }>['patch']

/** Bis zu so vielen Gruppen stehen bei „Beginnen mit" nebeneinander (`Wahl`); mehr in einer Auswahlliste. */
const WAHL_GRUPPEN = 4

/**
 * **Plan bearbeiten** (T121, Entwurf `GPlaenePlanen`) — die Unteransicht der
 * Weiteren Pläne beim Planen: oben die Spur vom Entwurf bis zum Abschluss,
 * darunter der Plan mit „Beginnen mit", dann die Vorschau seiner Wochen oder
 * Monate, je mit ihrer Gruppe oder Person.
 *
 * Name, Zeitraum, Takt, Veröffentlichen und Löschen sind der Plan selbst. Sie
 * ändern Admin und Planer — der Planer seit dem 15.10.2026; davor sah er sie
 * nur und verteilte die Gruppen. Hierher kommt nur, wer planen darf
 * (`PlanenScreen`). Veröffentlichen steht am Handy in der Leiste am unteren Rand, ab dem Tablet
 * neben dem Titel — wie „Plan senden" beim Planen der Woche. Drucken steht
 * links davon (Phase 9): der Bogen des Plans (`PlanBogen`), auch im Entwurf —
 * zum Durchsehen, bevor er veröffentlicht wird —, nicht mehr nach dem Ende.
 */
export function PlanBearbeiten({ plan, onZurueck }: { plan: WeitererPlan; onZurueck: () => void }) {
  const { dispatch } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const breit = useMedia(TABLET_BREITE)
  const { drucken, bogen } = useDruckBogen()
  const stand = planStand(plan, fromIso(tag))
  // Ein abgeschlossener Plan ist gewesen: nichts mehr zu verteilen, zu
  // veröffentlichen oder zu zeigen (`plaeneZumAnsehen`).
  const laeuft = stand !== 'abgeschlossen'
  const veroeffentlichen = laeuft ? <VeroeffentlichenKnopf plan={plan} /> : null
  const planDrucken = () => drucken(<PlanBogen plan={plan} />)

  return (
    <>
      <section className="screen prog">
        <UnteransichtKopf titel={t.wpPlanBearbeiten} onZurueck={onZurueck}>
          {breit && laeuft && <DruckKnopf mitText onClick={planDrucken} />}
          {breit && veroeffentlichen}
        </UnteransichtKopf>
        <Spur schritte={spurDesPlans(plan, stand, t)} label={t.spurPlan} />
        <section className="karte wp-plan-karte">
          <PlanFelder plan={plan} />
          {laeuft && <BeginnenMit plan={plan} />}
        </section>
        <PlanVorschau plan={plan} />
        {laeuft && (
          <p className="klein-text wp-sicht">{plan.entwurf ? `${t.wpEntwurfHint} ${t.wpSichtSaal}` : t.wpSichtSaal}</p>
        )}
        <EntfernenKnopf
          className="knopf-umriss knopf-entfernen wp-loeschen"
          text={t.wpLoeschen}
          onEntfernen={() => {
            dispatch({ type: 'wpPlanLoeschen', id: plan.id })
            onZurueck()
          }}
        />
      </section>
      {!breit && laeuft && (
        <div className="planen-leiste">
          <button type="button" className="aktion-neben" onClick={planDrucken}>
            <Zeichen name="drucken" />
            {t.drucken}
          </button>
          {veroeffentlichen}
        </div>
      )}
      {bogen}
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
 * Was am Plan selbst geändert wird: Name, Zeitraum und Takt. Name und Takt
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
  // Gebunden (T128): „5 окт. 2026 г." brach bei 320 px zwischen Jahr und „г.".
  const datum = (tag: string): string => gebundenesDatum(fromIso(tag), state.lang, 'tagKurzJahr')

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
 * von Hand gesetzt sind. Zur Wahl stehen die Gruppen, die reinigen — nur unter
 * ihnen geht die Reihe um (18.10.2026). Ausgelassene Spannen und solche mit
 * einer Person überspringt sie (31.10.2026).
 */
function BeginnenMit({ plan }: { plan: WeitererPlan }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const tag = useKalendertag()
  const reihe = reinigungsGruppen(state.groups)
  if (reihe.length === 0) return null

  const beginnt = beginntMit(plan, state.planEintraege, tag) ?? ''
  const verteilen = (grp: string): void => {
    if (grp && grp !== beginnt) dispatch({ type: 'wpGruppenVerteilen', planId: plan.id, abGruppe: grp })
  }
  const optionen = reihe.map((g) => ({ wert: g.id, text: tu(g.name) }))

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
 * ihrer Gruppe oder Person — zugeklappt die nächsten ab der laufenden
 * (`vorschauSpannen`). Kommende setzt man einzeln um oder löscht sie aus dem
 * Plan; vergangene bleiben, wie sie waren. Gezählt wird, was zum Plan gehört —
 * ohne die ausgelassenen.
 */
function PlanVorschau({ plan }: { plan: WeitererPlan }) {
  const { state } = useApp()
  const { t } = useT()
  const tag = useKalendertag()
  const [alle, setAlle] = useState(false)
  const spannen = planSpannen(plan)
  const jetzt = spanneVon(taktVon(plan), tag)
  const gezeigt = alle ? spannen : vorschauSpannen(spannen, jetzt)
  const jeSpanne = eintraegeJeSpanne(state.planEintraege, plan.id)
  const anzahl = spannenImPlan(plan, state.planEintraege).length
  // Die Personen zur Wahl, einmal für alle Zeilen: Dasselbe Element zeichnet
  // React nicht neu — bei hundert Personen und „Alle anzeigen" über ein Jahr
  // wären es sonst gut 5000 Einträge je Zeichnen, auch für jeden Toast.
  const personenWahl = useMemo(
    () => (
      <optgroup label={t.personen}>
        {[...state.persons]
          .sort((a, b) => personCompare(a, b, state.lang))
          .map((p) => (
            <option key={p.id} value={`p:${p.id}`}>
              {displayName(p)}
            </option>
          ))}
      </optgroup>
    ),
    [state.persons, state.lang, t.personen],
  )

  return (
    <section className="karte wp-vorschau">
      <h2 className="abschnitt-titel karte-titel">{`${t.wpVorschau} · ${spannenAnzahl(plan, anzahl, state.lang)}`}</h2>
      {gezeigt.map((spanne) => (
        <VorschauZeile
          key={spanne}
          plan={plan}
          spanne={spanne}
          eintrag={jeSpanne.get(spanne)}
          personenWahl={personenWahl}
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

/** Der Wert einer Spanne in der Auswahl: `g:<Gruppe>`, `p:<Person>` — leer, wenn sie offen ist. */
function auswahlWert(eintrag: PlanEintrag | undefined): string {
  if (eintrag?.pid) return `p:${eintrag.pid}`
  return eintrag?.grp ? `g:${eintrag.grp}` : ''
}

/** Die Belegung zu einem Wert der Auswahl (`auswahlWert` rückwärts). */
function belegungVon(wert: string): Belegung {
  if (wert.startsWith('g:')) return { grp: wert.slice(2) }
  if (wert.startsWith('p:')) return { pid: wert.slice(2) }
  return null
}

/**
 * Eine Woche oder ein Monat der Vorschau: wann, und wer — kommend zur Wahl,
 * vergangen als Text. Zur Wahl stehen die Gruppen, die reinigen, dazu die
 * eingetragene, auch wenn sie inzwischen herausgenommen ist — sonst stünde
 * „offen" da, wo eine Gruppe eingetragen ist —, und darunter jede Person
 * (31.10.2026).
 *
 * Daneben das ✕: Es löscht die Spanne aus dem Plan, mit Rückfrage wie jedes
 * Löschen — so wie man einen Gruppenbesuch entfernt. Sie steht dann
 * durchgestrichen da, und „Wiederherstellen" holt sie offen zurück.
 */
function VorschauZeile({
  plan,
  spanne,
  eintrag,
  personenWahl,
  vorbei,
}: {
  plan: WeitererPlan
  spanne: string
  eintrag: PlanEintrag | undefined
  personenWahl: ReactNode
  vorbei: boolean
}) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const wann = spannenText(plan, spanne, state.lang)
  const setzen = (belegung: Belegung): void => dispatch({ type: 'wpEintragSetzen', planId: plan.id, datum: spanne, belegung })

  if (eintrag?.aus) {
    const ausgelassen = <span className="wp-vorschau-wer">{t.wpAusgelassen}</span>
    return (
      <div className={vorbei ? 'wp-vorschau-zeile is-aus is-vorbei' : 'wp-vorschau-zeile is-aus'}>
        <span className="wp-vorschau-wann">{wann}</span>
        {vorbei ? (
          ausgelassen
        ) : (
          <span className="wp-vorschau-wahl">
            {ausgelassen}
            <button type="button" className="knopf-pille" onClick={() => setzen(null)}>
              {t.wpWiederherstellen}
            </button>
          </span>
        )}
      </div>
    )
  }
  if (vorbei) {
    return (
      <div className="wp-vorschau-zeile is-vorbei">
        <span className="wp-vorschau-wann">{wann}</span>
        <span className="wp-vorschau-wer">{werName(eintrag, state, tu) || t.offenDash}</span>
      </div>
    )
  }
  const reihe = reinigungsGruppen(state.groups)
  const gruppen = state.groups.filter((g) => g.id === eintrag?.grp || reihe.includes(g))
  return (
    <div className="wp-vorschau-zeile">
      <span className="wp-vorschau-wann">{wann}</span>
      <span className="wp-vorschau-wahl">
        <select
          className="wp-gruppe-wahl"
          aria-label={`${wann}: ${t.wpWer}`}
          value={auswahlWert(eintrag)}
          onChange={(e) => setzen(belegungVon(e.target.value))}
        >
          <option value="">{t.offenDash}</option>
          <optgroup label={t.gruppenTitel}>
            {gruppen.map((g) => (
              <option key={g.id} value={`g:${g.id}`}>
                {tu(g.name)}
              </option>
            ))}
          </optgroup>
          {personenWahl}
        </select>
        <EntfernenKnopf
          className="rund-knopf rund-knopf--feld wp-auslassen"
          label={`${wann}: ${t.a11yRemove}`}
          onEntfernen={() => setzen({ aus: true })}
        />
      </span>
    </div>
  )
}
