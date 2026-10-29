import { useApp } from '../app/context'
import { gebundenesDatum } from '../components/datum-anzeige'
import type { AnwesenheitMonat } from '../data/anwesenheit'
import { fromIso } from '../data/meeting-dates'
import { Bogen } from '../druck/Bogen'
import { tabellenBloecke } from '../druck/tabellen-bloecke'
import { LOCALES } from '../i18n/langs'
import { useT } from '../i18n/useT'

/**
 * **Die Anwesenheit für den Bericht** (T152): je Monat eine Zeile, die Spalten
 * je Zusammenkunftsart — wie viele stattfanden (mit Zahl), alle Anwesenden
 * zusammen und der Durchschnitt. Der älteste Monat oben, wie auf einem Formular,
 * das Monat für Monat weitergeführt wird.
 */
export function AnwesenheitDruck({ monate }: { monate: readonly AnwesenheitMonat[] }) {
  const { state } = useApp()
  const { t } = useT()
  const zahl = new Intl.NumberFormat(LOCALES[state.lang] ?? state.lang)
  const leer = '–'
  const zeilen = [...monate].reverse().map((m) => ({
    key: m.monat,
    zellen: [
      gebundenesDatum(fromIso(m.monat), state.lang, 'monatJahr'),
      ...(['mid', 'we'] as const).flatMap((tab) => {
        const z = m.je[tab]
        return z.anzahl > 0 ? [zahl.format(z.anzahl), zahl.format(z.summe), zahl.format(z.schnitt ?? 0)] : [leer, leer, leer]
      }),
    ],
  }))
  const kopfJe = (name: string) => [`${name} · ${t.druckAnwesendZusammenkuenfte}`, t.druckAnwesendeZusammen, t.druckSchnitt]
  const form = {
    spalten: 'minmax(0, 1.4fr) repeat(6, minmax(0, 1fr))',
    kopf: [t.druckMonatSpalte, ...kopfJe(t.unterDerWoche), ...kopfJe(t.amWochenende)],
    betont: 3,
  }
  const erster = monate[monate.length - 1]
  const letzter = monate[0]
  const zeitraum =
    erster && letzter
      ? [gebundenesDatum(fromIso(erster.monat), state.lang, 'monatJahr'), gebundenesDatum(fromIso(letzter.monat), state.lang, 'monatJahr')]
          .filter((x, i, a) => a.indexOf(x) === i)
          .join(' – ')
      : ''
  return <Bogen titel={t.druckAnwesenheitTitel} zeitraum={`${state.congregation.name} · ${zeitraum}`} bloecke={tabellenBloecke('anwesenheit', form, zeilen)} />
}
