import { useApp } from '../app/context'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { Punkt } from '../bausteine/Punkt'
import { Sheet } from '../components/Sheet'
import { istZusammenkunft } from '../data/helpers'
import type { OffeneWochenMeldung } from '../data/plan-versand'
import { relativeZeit } from '../i18n/zeit'
import { aufgabenLabel, aufgabenTp, fill, useT } from '../i18n/useT'
import type { VersandStand } from './wochen-versand'
import { PlanSpur } from './WochenStand'
import type { PlanArt } from './planen-raster'

/**
 * Bis zu so vielen Zuteilungen lohnt die Liste; darüber steht nur die Zahl.
 *
 * Eine frisch geplante Woche hat gut 35 Plätze — eine Liste davon ist eine
 * Wand, durch die niemand liest. Interessant wird sie erst zum Schluss, wenn
 * nur noch ein paar fehlen: „Wer fehlt noch?" (wie bisher im Kasten im Plan).
 */
const LISTEN_GRENZE = 8

/**
 * **Plan senden** (T121, Entwurf `GSenden`) — hinter dem Knopf der
 * Aktionsleiste: wie weit die Woche ist, wer noch nichts von seiner Zuteilung
 * weiß, und der Knopf, der die ganze Woche hinausgibt (beide Zusammenkünfte
 * und die Treffpunkte, `send-plan`).
 *
 * **Warum es diesen Knopf gibt:** Bis T99 erfuhr die eingeteilte Person von
 * ihrer Zuteilung nichts — die Mitteilung ging an die Planer, sie selbst
 * hörte erst über die Erinnerung davon. **Warum auf Knopfdruck:** Planen ist
 * eine Sitzung, bis der Plan steht, wird umsortiert; bei sofortigem Versand
 * ginge für jeden Zwischenstand eine Nachricht hinaus. Der Knopf gilt für die
 * ganze Woche, beide Zusammenkünfte und die Treffpunkte — beim Gruppenaufseher,
 * der nicht zuteilt, für die Treffpunkte seiner Gruppe (`gruppe`).
 *
 * Meldungen und Versand kommen von der Aktionsleiste (`PlanenAktionen`): Sie
 * bleibt beim Planen stehen, das Blatt nicht. So steht, wen die App nicht
 * erreichen konnte (kein Konto), auch nach dem Schließen wieder da — bis die
 * Woche wechselt. Gesperrt wird der Knopf per `aria-disabled`: Er wird es unter
 * dem Finger, der gerade gesendet hat (`GesperrterKnopf`).
 */
export function PlanSendenBlatt({
  art,
  meldungen,
  zuletzt,
  versand,
  gruppe = false,
  onClose,
}: {
  /** Aus welchem Plan gesendet wird — nur der einer Zusammenkunft hat eine Spur. */
  art: PlanArt
  meldungen: readonly OffeneWochenMeldung[]
  /** Wann für diese Woche zuletzt etwas hinausging — oder `null`. */
  zuletzt: string | null
  versand: VersandStand
  /**
   * Nur die Treffpunkte der eigenen Gruppe (der Gruppenaufseher, der nicht
   * zuteilt, `sendeUmfang`): mit den Sätzen seiner Gruppe. Eine Spur steht dort
   * nicht — sein Plan ist der der Treffpunkte (`art`).
   */
  gruppe?: boolean
  onClose: () => void
}) {
  const { state } = useApp()
  const i18n = useT()
  const { t, tu } = i18n
  const { laeuft, ohneKonto, senden } = versand
  const n = meldungen.length
  const liste = n !== 0 && n <= LISTEN_GRENZE
  const zuletztText = zuletzt ? fill(t.planSendenZuletzt, { zeit: relativeZeit(zuletzt, state.lang) }) : null
  const [offenSatz, alleSatz] = gruppe ? [t.fsSendenOffen, t.fsSendenAlle] : [t.planSendenOffen, t.planSendenAlle]

  return (
    <Sheet variante="lang" label={t.planSenden} title={t.planSenden} onClose={onClose}>
      <div className="sheet-inhalt senden">
        {/* Die Spur einer Zusammenkunft nur aus ihrem Plan. Aus den
            Treffpunkten zeigte das Blatt sonst die Zahlen des Dienstags
            (`mtab('fs')` ist 'mid') — dort gibt es keine Spur (16.10.2026).
            Gefragt wird die Art des Plans, nicht der Reiter: Beim
            Gruppenaufseher ist es immer der Plan der Treffpunkte. */}
        {art === 'zusammenkuenfte' && istZusammenkunft(state.tab) && <PlanSpur tab={state.tab} />}
        {/* „Alle wissen Bescheid" erst, wenn etwas hinausging — eine Woche, in
            der noch niemand eingeteilt ist, beschreibt die Spur darüber. */}
        {(n > 0 || zuletzt) && <p className="senden-satz">{n > 0 ? fill(offenSatz, { n }) : alleSatz}</p>}
        {liste && (
          <ul className="senden-liste">
            {meldungen.map((meldung) => {
              const aufgabe = meldung.aufgabe()
              return (
                <li key={meldung.key} className="senden-zeile">
                  {/* Minze wie „jetzt" in der Spur: Das geht mit dem Knopf hinaus. */}
                  <Punkt art="du" />
                  <span className="senden-zeile-text">
                    <span className="senden-name" dir="auto">
                      {meldung.name}
                    </span>
                    <span className="klein-text">
                      {`${aufgabenTp(aufgabe, i18n)(aufgabe.date)} · ${aufgabenLabel(aufgabe, i18n)}`}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {/* Wer kein Konto hat, ist auf keinem Weg zu erreichen — den muss der
            Planer selbst ansprechen. Steht hier und nicht nur im Toast: ein
            Hinweis, der nach drei Sekunden weg ist, hilft dabei nicht. */}
        {ohneKonto.length > 0 && (
          <p className="senden-ohne" dir="auto">
            {fill(t.planSendenOhneKonto, { namen: ohneKonto.join(' · ') })}
          </p>
        )}
        {zuletztText && <p className="klein-text">{n > 0 ? `${t.planSendenAndere} ${zuletztText}` : zuletztText}</p>}
      </div>
      <div className="senden-fuss">
        <GesperrterKnopf className="knopf-haupt" gesperrt={laeuft || n === 0} onTipp={() => void senden()}>
          {laeuft ? tu('…') : t.planSenden}
          {!laeuft && n > 0 && <span className="zahl-marke">{n}</span>}
        </GesperrterKnopf>
        <button type="button" className="knopf-leise" onClick={onClose}>
          {n > 0 ? t.spaeter : t.fertig}
        </button>
      </div>
    </Sheet>
  )
}
