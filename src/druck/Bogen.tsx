import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DruckBlatt, type BlattArt } from './DruckBlatt'
import { blaetterVerteilen, BLATT_HOEHE, type Blatt } from './verteilen'

/** Ein Block des Bogens — eine Woche, ein Abschnitt —, der nie über zwei Blätter geht. */
export interface DruckBlock {
  key: string
  inhalt: ReactNode
}

/**
 * **Ein Druckbogen aus Blöcken** (T121, Phase 9), verteilt auf A4-Blätter —
 * **gemessen, nicht geschätzt.**
 *
 * Wie viel auf ein Blatt passt, hängt an den Daten: Der Entwurf legt zwei
 * Wochen auf ein Monatsblatt, aber eine Versammlung mit sieben Hilfsdiensten
 * und langen Namen braucht mehr Platz als das Szenario mit vier. Eine feste
 * Zahl je Blatt schnitt dann das Ende ab, oder der Browser brach mitten in
 * einer Woche um — und „Seite 1 von 2" stimmte nicht mehr.
 *
 * Deshalb erst einmal alles auf **ein** Blatt in natürlicher Höhe zeichnen,
 * unsichtbar neben dem Bildschirm (`druck-messen`), die Blöcke messen und dann
 * der Reihe nach verteilen (`blaetterVerteilen`). Beides geschieht im selben
 * Klick vor dem Druckdialog: `useDruckBogen` legt den Bogen mit `flushSync`
 * ins DOM, und die Verteilung aus dem Layout-Effekt kommt noch vor dem
 * Zeichnen des Browsers.
 *
 * Ein Block, der allein höher ist als ein Blatt, bekommt sein Blatt ohne feste
 * Höhe (`ueberlang`): Er läuft auf die nächste Seite weiter, statt abgeschnitten
 * zu werden.
 */
export function Bogen({
  titel,
  zeitraum,
  art,
  bloecke,
}: {
  titel: string
  zeitraum: string
  art?: BlattArt
  bloecke: readonly DruckBlock[]
}) {
  const [blaetter, setBlaetter] = useState<Blatt[] | null>(null)
  const messung = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (blaetter !== null) return
    const blatt = messung.current?.querySelector<HTMLElement>('.druck-blatt')
    if (!blatt) return
    const kinder = [...blatt.children] as HTMLElement[]
    const hoehe = (el: Element | undefined) => el?.getBoundingClientRect().height ?? 0
    const stil = getComputedStyle(blatt)
    const rand = parseFloat(stil.paddingTop) + parseFloat(stil.paddingBottom)
    const abstand = parseFloat(stil.rowGap) || 0
    const kopf = hoehe(blatt.querySelector('.druck-blatt-kopf') ?? undefined)
    const fuss = hoehe(blatt.querySelector('.druck-blatt-fuss') ?? undefined)
    const hoehen = kinder.filter((el) => el.classList.contains('druck-block')).map(hoehe)
    // Kopf, Fuß und je ein Abstand davor und dahinter sind auf jedem Blatt gleich.
    setBlaetter(blaetterVerteilen(hoehen, BLATT_HOEHE - rand - kopf - fuss - abstand, abstand))
  }, [blaetter])

  if (blaetter === null) {
    return createPortal(
      <div ref={messung} className="druck-messen" aria-hidden="true">
        <DruckBlatt titel={titel} zeitraum={zeitraum} art={art}>
          {bloecke.map((block) => (
            <div key={block.key} className="druck-block">
              {block.inhalt}
            </div>
          ))}
        </DruckBlatt>
      </div>,
      document.body,
    )
  }

  return (
    <>
      {blaetter.map((seite, i) => (
        <DruckBlatt
          key={i}
          titel={titel}
          zeitraum={zeitraum}
          art={art}
          seite={i + 1}
          seiten={blaetter.length}
          ueberlang={seite.ueberlang}
        >
          {seite.indizes.map((bi) => {
            const block = bloecke[bi]
            return (
              block && (
                <div key={block.key} className="druck-block">
                  {block.inhalt}
                </div>
              )
            )
          })}
        </DruckBlatt>
      ))}
    </>
  )
}
