import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Sheet } from '../components/Sheet'
import { QUALIFICATION_ORDER, ROLE_ORDER, WT_ROLE_ORDER } from '../data/constants'
import { serviceQualKey } from '../data/helpers'
import { LOCALES } from '../i18n/langs'
import { ROLE_KEY } from '../i18n/ui'
import { useT } from '../i18n/useT'
import { OHNE_BLATTFILTER, type PersonFilter } from './person-filter'
import { privLabel } from './priv-label'

/**
 * **Filter** über der Personenliste (T121): Geschlecht, Rolle, Gruppe und
 * Aufgabenbereich. Der Entwurf `GPersonen` zeigt über der Liste nur die
 * Auswahl nach dem Stand; diese vier gab es schon und bleiben erreichbar —
 * „wer ist der feste Leiter?", „wer darf die Bibellesung?". Jede Wahl gilt
 * sofort, die Liste dahinter grenzt sich mit ein.
 */
export function PersonenFilterBlatt({
  filter,
  setz,
  onClose,
}: {
  filter: PersonFilter
  setz: (patch: Partial<PersonFilter>) => void
  onClose: () => void
}) {
  const { state } = useApp()
  const { t, tu } = useT()
  const locale = LOCALES[state.lang]

  return createPortal(
    <Sheet label={t.filterWeitere} title={t.filterWeitere} onClose={onClose}>
      <div className="sheet-inhalt blatt-felder">
        <Auswahlfeld
          marke={t.geschlecht}
          wert={filter.sex}
          locale={locale}
          onChange={(v) => setz({ sex: v as PersonFilter['sex'] })}
          optionen={[
            ['m', t.bruder],
            ['w', t.schwester],
          ]}
        />
        <Auswahlfeld
          marke={t.rolle}
          wert={filter.role}
          locale={locale}
          onChange={(v) => setz({ role: v as PersonFilter['role'] })}
          optionen={ROLE_ORDER.map((role) => [role, t[ROLE_KEY[role]]])}
        />
        {/* Ohne angelegte Gruppen hätte die Auswahl nur den Platzhalter. */}
        {state.groups.length > 0 && (
          <Auswahlfeld
            marke={t.gruppeLbl}
            wert={filter.grp}
            locale={locale}
            onChange={(v) => setz({ grp: v })}
            optionen={state.groups.map((g) => [g.id, tu(g.name)])}
          />
        )}
        <Auswahlfeld
          marke={t.aufgabenbereiche}
          wert={filter.priv}
          locale={locale}
          onChange={(v) => setz({ priv: v })}
          optionen={[
            // Mit den festen Rollen (4.10.2026): Als Bereich zählen sie nicht
            // (eigene Karte im Detail), gesucht wird nach ihnen aber genauso —
            // wer ist der feste Leiter?
            ...[...QUALIFICATION_ORDER, ...WT_ROLE_ORDER].map((key) => [key, privLabel(t, key)] as const),
            // Wie im Detail: Gruppen-Dienste (Reinigung) rotieren Gruppen statt
            // Personen und haben deshalb keinen Bereich.
            ...state.services
              .filter((service) => !service.groups)
              .map((service) => [serviceQualKey(service.key), tu(service.name)] as const),
          ]}
        />
      </div>
      <div className="sheet-fuss">
        <button type="button" className="knopf-haupt" onClick={onClose}>
          {t.fertig}
        </button>
        <button type="button" className="knopf-leise" onClick={() => setz(OHNE_BLATTFILTER)}>
          {t.filterZuruecksetzen}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}

/**
 * Ein Feld des Blatts. Der Platzhalter „—" heißt „nicht eingeschränkt"; ist
 * etwas gewählt, hebt sich das Feld ab. Alphabetisch nach der übersetzten
 * Beschriftung — in einer langen Auswahl sucht man nach dem Wort, nicht nach
 * der Programmreihenfolge; `numeric` hält „Gruppe 2" vor „Gruppe 10".
 */
function Auswahlfeld({
  marke,
  wert,
  onChange,
  optionen,
  locale,
}: {
  marke: string
  wert: string
  onChange: (wert: string) => void
  optionen: ReadonlyArray<readonly [string, string]>
  locale: string
}) {
  const sortiert = [...optionen].sort((a, b) => a[1].localeCompare(b[1], locale, { numeric: true }))
  return (
    <BlattFeld marke={marke}>
      <select
        className={wert ? 'feld-wahl is-gesetzt' : 'feld-wahl'}
        value={wert}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {sortiert.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </BlattFeld>
  )
}
