import { useAppSelector } from '../app/context'
import { versammlungsSprache } from '../i18n/langs'

/**
 * **Der Trolley vor einem Termin — nur vorgelesen** (T173). Die Termine im
 * Raster und am Tag zeigen Zeit und Namen; zu welchem Trolley sie gehören,
 * sagt sichtbar die Spalte, und die kennt ein Vorleseprogramm nicht. Vorgelesen
 * wird darum „Trolley 2, 16:00–18:00 …" — was dasteht, mit dem Trolley davor,
 * ohne eigenen Namen am Knopf (WCAG 2.5.3). Den Namen hat die Versammlung
 * vergeben: Er trägt ihr `lang`, wie in den Köpfen der Spalten.
 */
export function TrolleyVorsatz({ name }: { name: string }) {
  const congLang = useAppSelector((s) => s.congLang)
  return (
    <span className="sr-only">
      <span lang={versammlungsSprache(congLang)}>{name}</span>,{' '}
    </span>
  )
}
