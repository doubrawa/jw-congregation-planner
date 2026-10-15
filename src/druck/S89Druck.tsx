import { useApp } from '../app/context'
import { S89Karte } from '../components/S89Karte'
import type { S89Payload } from '../data/types'
import { fill, useT } from '../i18n/useT'

/**
 * Zettel je Blatt. **Fest**, nicht zur Auswahl: Sechs füllen das A4 sauber aus,
 * der Zettel bleibt dabei gut lesbar — der Betreiber hat es am Ausdruck
 * verglichen (T71). Eine Einstellung, die man einmal ansieht und nie wieder
 * anfasst, ist eine Einstellung zu viel.
 */
export const S89_JE_BLATT = 6

/**
 * **Der Bogen der S-89-Zettel** (T71; T121, Phase 9, Entwurf `GDruckS89`):
 * sechs Zettel je A4, zum Ausschneiden — je Blatt oben eine Zeile mit Thema,
 * Datum und Seitenzahl, darunter das Raster, die gestrichelten Linien sind die
 * Schnittkanten. Jeder Zettel trägt „S-89" und die Versammlung, den Titel des
 * Formulars und denselben Inhalt wie am Bildschirm (`S89Karte`).
 *
 * Das Raster hat immer sechs Felder: Ein halb leeres letztes Blatt behält seine
 * Schnittkanten, statt die Zettel über die Seite zu verteilen.
 */
export function S89Druck({ zettel, datum }: { zettel: readonly S89Payload[]; datum: string }) {
  const { state } = useApp()
  const { t } = useT()
  const versammlung = fill(t.congLabel, { name: state.congregation.name })
  const blaetter: Array<readonly S89Payload[]> = []
  for (let i = 0; i < zettel.length; i += S89_JE_BLATT) blaetter.push(zettel.slice(i, i + S89_JE_BLATT))
  return (
    <>
      {blaetter.map((blatt, bi) => (
        <section key={bi} className="s89-blatt">
          <p className="s89-blatt-kopf">
            <span>
              <strong>S-89 · {t.privSchulung}</strong> · {datum} · {t.zumAusschneiden}
            </span>
            <span>{fill(t.seiteVon, { n: bi + 1, m: blaetter.length })}</span>
          </p>
          <div className="s89-gitter">
            {Array.from({ length: S89_JE_BLATT }, (_unused, i) => blatt[i]).map((z, i) => (
              <div key={i} className="s89-zettel">
                {z && (
                  <>
                    <div className="s89-zettel-kopf">
                      <span className="s89-zettel-marke">S-89</span>
                      <span>{versammlung}</span>
                    </div>
                    <h2 className="s89-zettel-titel">{t.s89Title}</h2>
                    <S89Karte payload={z} />
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
