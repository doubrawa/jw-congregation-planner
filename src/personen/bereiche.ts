import { QUALIFICATION_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { privWert, serviceQualKey } from '../data/helpers'
import type { Person, QualificationKey, Service } from '../data/types'
import type { Dict } from '../i18n/ui'
import { privLabel } from './priv-label'

/** Die Bereiche des Predigtdienstes — bei der Person eine eigene Gruppe neben den Zusammenkünften. */
const PREDIGTDIENST: ReadonlySet<QualificationKey> = new Set<QualificationKey>(['treffpunkt', 'zeugnis'])

export interface Bereich {
  /** Der Schlüssel in `person.priv` — fest (`gebet`) oder je Dienst (`svc:<key>`). */
  key: string
  label: string
}

export interface BereichsGruppe {
  art: 'zusammenkuenfte' | 'hilfsdienste' | 'predigtdienst' | 'festeRollen'
  titel: string
  bereiche: Bereich[]
}

/**
 * **Die Aufgabenbereiche einer Person, nach Gruppen** (T121, Entwurf
 * `GPerson`): Zusammenkünfte, Hilfsdienste, Predigtdienst — dazu die festen
 * Rollen des Wachtturm-Studiums. Dieselben Gruppen stehen als Chips bei der
 * Person und als Schalter im Blatt „Ändern"; was dort fehlt, ließe sich
 * nirgends setzen, und sein Platz bliebe für immer offen.
 *
 * Jede Gruppe alphabetisch nach der **übersetzten** Beschriftung — in einer
 * Liste aus einem Dutzend Schaltern sucht man nach dem Wort, nicht nach der
 * Programmreihenfolge; `numeric` hält „Ordner 2" vor „Ordner 10". Die festen
 * Rollen bleiben in ihrer Folge: erst der Leiter, dann sein Vertreter.
 * Gruppen-Dienste (Reinigung) rotieren Gruppen statt Personen und haben keinen
 * Bereich.
 */
export function bereichsGruppen(
  t: Dict,
  tu: (text: string) => string,
  services: readonly Service[],
  locale: string,
): BereichsGruppe[] {
  const nachLabel = (a: Bereich, b: Bereich): number => a.label.localeCompare(b.label, locale, { numeric: true })
  const fest = (keys: readonly QualificationKey[]): Bereich[] => keys.map((key) => ({ key, label: privLabel(t, key) }))
  return [
    {
      art: 'zusammenkuenfte',
      titel: t.navZusammenkuenfte,
      bereiche: fest(QUALIFICATION_ORDER.filter((k) => !PREDIGTDIENST.has(k))).sort(nachLabel),
    },
    {
      art: 'hilfsdienste',
      titel: t.hilfsdienste,
      bereiche: services
        .filter((service) => !service.groups)
        .map((service) => ({ key: serviceQualKey(service.key), label: tu(service.name) }))
        .sort(nachLabel),
    },
    {
      art: 'predigtdienst',
      titel: t.tabFs,
      bereiche: fest(QUALIFICATION_ORDER.filter((k) => PREDIGTDIENST.has(k))).sort(nachLabel),
    },
    { art: 'festeRollen', titel: t.wtRollenLabel, bereiche: fest(WT_ROLE_ORDER) },
  ]
}

/** Nur, was die Person hat — und nur die Gruppen, in denen dann noch etwas steht. */
export function bereicheDerPerson(gruppen: readonly BereichsGruppe[], person: Person): BereichsGruppe[] {
  return gruppen
    .map((g) => ({ ...g, bereiche: g.bereiche.filter((b) => privWert(person.priv, b.key)) }))
    .filter((g) => g.bereiche.length > 0)
}
