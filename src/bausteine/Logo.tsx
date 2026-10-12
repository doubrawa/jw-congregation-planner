import './bausteine.css'

/*
 * Die Plätze der kleinen Fassung (3-5-7, seit dem 4.10.2026) — dieselben
 * Koordinaten wie `public/logo-klein.svg`. Klein verschwammen die 18 Plätze von
 * 4-6-8 zu Streifen; deshalb steht im Menü diese Fassung.
 */
const REIHEN: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[195.43, 234.21], [256, 252], [316.57, 234.21]],
  [[138.99, 271.47], [193.4, 304.49], [256, 316], [318.6, 304.49], [373.01, 271.47]],
  [[83.83, 307.21], [133.98, 346.67], [192.76, 371.52], [256, 380], [319.24, 371.52], [378.02, 346.67], [428.17, 307.21]],
]

/**
 * **Das Logo in den Farben der Darstellung** (T121): das Pult in Minze, die
 * Plätze in der Textfarbe, die hinteren Reihen blasser — wie die Dateien in
 * `public/`, nur ohne Kachel. Rein schmückend neben der Wortmarke, deshalb für
 * Vorleseprogramme verborgen.
 */
export function Logo({ breite }: { breite: number }) {
  return (
    <svg className="logo" width={breite} height={Math.round((breite * 297) / 388)} viewBox="62 105 388 297" aria-hidden="true">
      <circle className="logo-pult" cx="256" cy="140" r="34" />
      {REIHEN.map((reihe, i) => (
        <g key={i} className="logo-platz" fillOpacity={[1, 0.76, 0.52][i]}>
          {reihe.map(([x, y]) => (
            <circle key={`${x}|${y}`} cx={x} cy={y} r="21" />
          ))}
        </g>
      ))}
    </svg>
  )
}
