import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { Logo } from '../bausteine/Logo'
import { datumsFormat } from '../components/datum-anzeige'
import { fill, useT } from '../i18n/useT'

/** Ein Bogen mit eigenem Abstand zwischen seinen Blöcken (`druck-blatt--<art>`). */
export type BlattArt = 'monat'

/**
 * **Ein A4-Blatt eines Druckbogens** (T121, Phase 9; Entwürfe `GDruck…`):
 * oben Versammlung, Titel, Zeitraum und Logo, unten der Stand und die
 * Seitenzahl. Immer hell, Tinte auf Papier, keine Tonflächen — Drucker lassen
 * sie weg (`druck-bogen.css`).
 *
 * Die Seitenzahl kommt vom Aufrufer: Was auf welches Blatt kommt, entscheidet
 * der Bogen selbst (`Bogen`, gemessen), nicht der Browser — wie bei den
 * Zetteln (`seiten`).
 */
export function DruckBlatt({
  titel,
  zeitraum,
  seite = 1,
  seiten = 1,
  art,
  ueberlang = false,
  children,
}: {
  titel: string
  zeitraum: string
  seite?: number
  seiten?: number
  art?: BlattArt
  /** Der Inhalt ist höher als ein Blatt: keine feste Höhe, er läuft weiter statt abgeschnitten zu werden. */
  ueberlang?: boolean
  children: ReactNode
}) {
  const { state } = useApp()
  const { t } = useT()
  const stand = fill(t.stand, { datum: datumsFormat(state.lang, 'tagMonatJahr').format(new Date()) })
  const klassen = ['druck-blatt', art === 'monat' && 'druck-blatt--monat', ueberlang && 'druck-blatt--ueberlang'].filter(Boolean)
  return (
    <section className={klassen.join(' ')}>
      <header className="druck-blatt-kopf">
        <div className="druck-blatt-kopf-text">
          <span className="druck-versammlung">{fill(t.congLabel, { name: state.congregation.name })}</span>
          <h1 className="druck-titel">{titel}</h1>
          <span className="druck-zeitraum">{zeitraum}</span>
        </div>
        <Logo breite={56} />
      </header>
      {children}
      <footer className="druck-blatt-fuss">
        <span>
          {stand} · {t.aenderungenInDerApp}
        </span>
        <span>
          {location.host} · {fill(t.seiteVon, { n: seite, m: seiten })}
        </span>
      </footer>
    </section>
  )
}

/** Ein freier Platz — gepunktet, zum Eintragen von Hand. */
export function Offen({ breite = 120 }: { breite?: number }) {
  const { t } = useT()
  return <span className="druck-offen" role="img" aria-label={t.offenWort} style={{ inlineSize: breite }} />
}

/** Der Farbbalken vor einer Abschnitts-Überschrift — ein Rand, keine Fläche, damit er gedruckt wird. */
export function Balken() {
  return <span className="druck-balken" aria-hidden="true" />
}
