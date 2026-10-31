import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Spur } from '../bausteine/Spur'
import { Zeichen } from '../bausteine/Zeichen'
import { Sheet } from '../components/Sheet'
import { displayName } from '../data/helpers'
import type { Person } from '../data/types'
import { useT } from '../i18n/useT'
import { useNachrichtWeitergeben, type Weitergabe } from './useNachrichtWeitergeben'
import { useZettelDruck } from './useZettelDruck'

/** Wie viele Personen wie weit sind — die Spur oben im Blatt. */
export interface AnmeldeZahlen {
  angelegt: number
  link: number
  angemeldet: number
}

/** Was mit einer Person der Liste schon geschehen ist. */
type Erledigt = 'kopiert' | 'geteilt' | 'zettel'

/**
 * **Links senden** (T121, Phase 8; Entwurf `GAlleEinladen`): allen, die die
 * Liste in der Auswahl „Ohne Link" gerade zeigt, ihren Zugang geben — Suche
 * und Filter grenzen weiter ein, etwa auf eine Gruppe.
 *
 * **Per Nachricht, Person für Person** (31.10.2026, Betreiber: die Zettel „am
 * Desktop einmalig für alle versenden", per WhatsApp): Jede Zeile kopiert oder
 * teilt den Text mit Link und Code dieser einen Person, danach steht dort, was
 * geschehen ist. Die Knöpfe bleiben: Ein zweiter Tipp nimmt denselben Text —
 * etwa, wenn die Zwischenablage vor dem Einfügen schon den nächsten trug.
 * Mehr geht nicht auf einmal — jeder Text meldet genau eine Person an und
 * gehört in ihren persönlichen Chat. Bis zum 31.10.2026 gingen die Links von
 * hier per E-Mail hinaus; seitdem speichert die App keine Adressen mehr.
 *
 * **Oder auf Zetteln:** alle, deren Text noch nicht hinaus ist. Wer seinen Text
 * schon hat, bekommt keinen Zettel — der stellte einen neuen Link aus, und der
 * eben verschickte gälte nicht mehr. Umgekehrt bietet eine Zeile mit Zettel
 * kein Kopieren mehr an. Vermerkt wird nur, wessen Zettel gedruckt ist: Scheitert
 * ein Teil, bleiben die übrigen offen.
 *
 * Die Liste bleibt, wie sie beim Öffnen war: Wer seinen Text hat, hat jetzt
 * einen Link und fiele sonst aus „Ohne Link" heraus — samt seiner Marke.
 *
 * **Nur Links.** Den Plan sendet der Planer wie gewohnt („Plan senden"), und
 * wer noch nicht angemeldet ist, steht dort eigens da.
 */
export function LinksSendenBlatt({ personen, zahlen, onClose }: { personen: readonly Person[]; zahlen: AnmeldeZahlen; onClose: () => void }) {
  const { t } = useT()
  const weitergeben = useNachrichtWeitergeben()
  const druck = useZettelDruck()
  const [liste] = useState(personen)
  const [erledigt, setErledigt] = useState<ReadonlyMap<string, Erledigt>>(new Map())
  /** Entsteht gerade ein Link? Solange wartet jeder andere Tipp. */
  const [laeuft, setLaeuft] = useState(false)
  const teilbar = typeof navigator.share === 'function'
  const offen = liste.filter((p) => !erledigt.has(p.id))
  const beschaeftigt = laeuft || druck.laeuft

  const vermerken = (ids: readonly string[], wie: Erledigt) =>
    setErledigt((alt) => {
      const neu = new Map(alt)
      for (const id of ids) neu.set(id, wie)
      return neu
    })

  const geben = async (person: Person, art: Weitergabe) => {
    if (beschaeftigt) return
    setLaeuft(true)
    try {
      if (await weitergeben(person, art)) vermerken([person.id], art === 'kopieren' ? 'kopiert' : 'geteilt')
    } finally {
      setLaeuft(false)
    }
  }

  const zettel = async () => {
    if (beschaeftigt) return
    vermerken(await druck.drucken(offen), 'zettel')
  }

  const marke: Record<Erledigt, string> = { kopiert: t.markeKopiert, geteilt: t.markeGeteilt, zettel: t.aufZettel }

  return createPortal(
    <Sheet label={t.linksSenden} title={t.linksSenden} variante="lang" onClose={onClose}>
      <div className="sheet-inhalt link-blatt">
        <Spur
          label={t.standDerAnmeldung}
          schritte={[
            { name: t.spurAngelegt, wert: String(zahlen.angelegt), lage: 'voll' },
            { name: t.standLink, wert: String(zahlen.link), lage: 'jetzt' },
            { name: t.standAngemeldet, wert: String(zahlen.angemeldet), lage: zahlen.angemeldet > 0 ? 'teil' : 'leer' },
          ]}
        />
        <p className="klein-text">{t.linksSendenIntro}</p>

        <section className="link-weg" aria-labelledby="links-per-nachricht">
          <h3 id="links-per-nachricht" className="link-weg-titel">
            {t.perNachricht} · {liste.length}
          </h3>
          <p className="klein-text">{t.linksNachrichtHint}</p>
          <ul className="link-liste">
            {liste.map((p) => {
              const wie = erledigt.get(p.id)
              return (
                <li key={p.id} className="link-zeile">
                  <span className="link-zeile-name" dir="auto">
                    {displayName(p)}
                  </span>
                  {wie && (
                    <span className="link-marke">
                      <Zeichen name="haken" />
                      {marke[wie]}
                    </span>
                  )}
                  {wie !== 'zettel' && (
                    <span className="link-zeile-knoepfe">
                      {teilbar && (
                        <button
                          type="button"
                          className="knopf-umriss"
                          aria-label={`${displayName(p)}: ${t.teilenBtn}`}
                          aria-disabled={beschaeftigt || undefined}
                          onClick={() => void geben(p, 'teilen')}
                        >
                          {t.teilenBtn}
                        </button>
                      )}
                      <button
                        type="button"
                        className="knopf-umriss"
                        aria-label={`${displayName(p)}: ${t.kopierenBtn}`}
                        aria-disabled={beschaeftigt || undefined}
                        onClick={() => void geben(p, 'kopieren')}
                      >
                        {t.kopierenBtn}
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {offen.length > 0 && (
          <section className="link-weg" aria-labelledby="links-auf-zetteln">
            <h3 id="links-auf-zetteln" className="link-weg-titel">
              {t.aufZetteln} · {offen.length}
            </h3>
            <p className="klein-text">{t.zettelListeHint}</p>
            <div className="konto-knoepfe">
              <button type="button" className="knopf-umriss" aria-disabled={beschaeftigt || undefined} onClick={() => void zettel()}>
                {t.zettelDrucken}
              </button>
            </div>
          </section>
        )}

        <p className="klein-text">{t.ohneAppHint}</p>
      </div>
      {druck.bogen}
    </Sheet>,
    document.body,
  )
}
