import { useMemo } from 'react'
import { BEREICHS_ZEICHEN, bereichsTitel, planbareBereiche, zuDenWochen, zumPlanen } from '../app/bereich'
import { useApp } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { Bereichstitel } from '../components/Bereichstitel'
import { WOCHEN_SPALTE_BREITE, useMedia } from '../components/useMedia'
import { Chip } from '../dashboard/PlanungsKarte'
import { rechteVon } from '../data/rechte'
import type { Thema } from '../data/types'
import type { Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { useWochenKarten } from './useWochenKarten'
import { WochenListe } from './WochenUebersicht'
import './planen.css'

/** Was unter dem Titel einer Karte steht: was der Bereich umfasst. */
const HINWEIS: Record<Thema, (t: Dict) => string> = {
  zusammenkuenfte: (t) => t.planungZusammenkuenfteHint,
  predigtdienst: (t) => t.planungPredigtdienstHint,
  weitere: (t) => t.planungWeitereHint,
}

/**
 * **Planung — erst nur die Wahl** (T144, Betreiber 25.10.2026: „wenn man
 * planung öffnet soll nur die auswahl kommen, was man plant und nicht
 * zusätzlich die zusammenkunftswochen … das ist verwirrend"). Je Bereich, den
 * man planen darf, eine Karte; „Zusammenkünfte" führt zu den Wochen
 * (`zuDenWochen`), die anderen in ihr Planen. Zurück führt von dort wieder
 * hierher (`zurueckInDerPlanung`).
 *
 * Bis zum 25.10.2026 stand die Wahl (T135) als Umschalter über den Wochen der
 * Zusammenkünfte — sie sah aus, als wechsle sie den Inhalt darunter, und
 * führte doch auf eine andere Seite.
 *
 * Ein Menüziel wie die anderen: am Handy mit dem Menüknopf, nicht mit Zurück.
 * Wer nur einen Bereich plant (der Gruppenaufseher), sieht diese Seite nicht —
 * „Planung" führt ihn gleich hinein.
 */
export function PlanungScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const mitSpalte = useMedia(WOCHEN_SPALTE_BREITE)
  const karten = useWochenKarten()
  // Was bei den Zusammenkünften ansteht, über alle Wochen — mit den Wörtern der Wochen.
  const stand = useMemo(
    () =>
      karten.reduce(
        (summe, k) => ({
          probleme: summe.probleme + k.stand.konflikte + k.stand.nichtBesetzbar,
          senden: summe.senden + k.stand.nichtGesendet,
        }),
        { probleme: 0, senden: 0 },
      ),
    [karten],
  )
  const oeffnen = (thema: Thema): void =>
    dispatch(thema === 'zusammenkuenfte' ? zuDenWochen(mitSpalte) : zumPlanen(thema, 'planung'))

  return (
    <section className="screen planung">
      <h1 className="seitentitel seitentitel--gross">{t.dashPlanung}</h1>
      <p className="planung-frage">{t.planungFrage}</p>
      <div className="planung-wahl">
        {planbareBereiche(rechteVon(state)).map((thema) => (
          <button key={thema} type="button" className="planung-karte" onClick={() => oeffnen(thema)}>
            <span className="planung-karte-zeichen">
              <Zeichen name={BEREICHS_ZEICHEN[thema]} />
            </span>
            <span className="planung-karte-text">
              <span className="planung-karte-titel">{bereichsTitel(t, thema)}</span>
              <span className="klein-text">{HINWEIS[thema](t)}</span>
              {thema === 'zusammenkuenfte' && stand.probleme + stand.senden > 0 && (
                <span className="planung-karte-stand">
                  {stand.probleme > 0 && <Chip art="probleme" text={fill(t.lageProbleme, { n: stand.probleme })} />}
                  {stand.senden > 0 && <Chip art="senden" text={fill(t.lageSenden, { n: stand.senden })} />}
                </span>
              )}
            </span>
            <Zeichen name="weiter" />
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * **Die Wochen der Zusammenkünfte** (T144; Entwurf `GPlanungZusammenkuenfte`)
 * — bis dahin der untere Teil von „Planung". Je Woche eine Karte, darunter
 * „Holen" und der Vortragsplan (`WochenListe`). Zurück vor dem Titel führt zur
 * Wahl, wie aus dem Plan einer Woche hierher (`Bereichstitel`). Am breiten
 * Bildschirm gibt es diese Seite nicht, die Wochen stehen dort neben dem Plan
 * (`WochenSpalte`).
 */
export function PlanungWochenScreen() {
  const { t } = useT()
  return (
    <section className="screen planung">
      <Bereichstitel thema="zusammenkuenfte" />
      <section className="planung-wochen" aria-label={t.wochenLbl}>
        <h2 className="abschnitt-titel">{t.wochenLbl}</h2>
        <WochenListe />
      </section>
    </section>
  )
}
