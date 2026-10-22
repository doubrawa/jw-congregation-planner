import { LOGO_GROSS, LOGO_KLEIN, REIHEN_DECKKRAFT, type Punkt } from './logo-form'
import './bausteine.css'

/**
 * **Das Logo in den Farben der Darstellung** (T121): das Pult in Minze, die
 * Plätze in der Textfarbe, die hinteren Reihen blasser — wie die Dateien in
 * `public/`, nur ohne Kachel. Rein schmückend neben der Wortmarke, deshalb für
 * Vorleseprogramme verborgen.
 *
 * Klein (Menü, Druckbögen) die Fassung 3-5-7, `gross` die mit 4-6-8 — auf der
 * Anmeldung wie im Entwurf (`GAnmeldung`). Die Höhe folgt dem Ausschnitt.
 *
 * `leerePlaetze` legt unter jede Reihe dieselben Plätze noch einmal als leere
 * (`.logo-leer`, ruhig unsichtbar), die vollen darüber (`.logo-voll`): für das
 * Startbild, in dem sich der Saal füllt (`shell.css`, 22.10.2026).
 */
export function Logo({
  breite,
  gross = false,
  leerePlaetze = false,
  className,
}: {
  breite: number
  gross?: boolean
  leerePlaetze?: boolean
  className?: string
}) {
  const form = gross ? LOGO_GROSS : LOGO_KLEIN
  const [, , weite, hoehe] = form.viewBox.split(' ').map(Number) as [number, number, number, number]
  const plaetze = (reihe: readonly Punkt[]) => reihe.map(([x, y]) => <circle key={`${x}|${y}`} cx={x} cy={y} r={form.r} />)
  return (
    <svg
      className={className ? `logo ${className}` : 'logo'}
      width={breite}
      height={Math.round((breite * hoehe) / weite)}
      viewBox={form.viewBox}
      aria-hidden="true"
    >
      <circle className="logo-pult" cx={form.pult.mitte[0]} cy={form.pult.mitte[1]} r={form.pult.r} />
      {form.reihen.map((reihe, i) => (
        <g key={i} className="logo-platz" fillOpacity={REIHEN_DECKKRAFT[i]}>
          {leerePlaetze ? (
            <>
              <g className="logo-leer">{plaetze(reihe)}</g>
              <g className="logo-voll">{plaetze(reihe)}</g>
            </>
          ) : (
            plaetze(reihe)
          )}
        </g>
      ))}
    </svg>
  )
}
