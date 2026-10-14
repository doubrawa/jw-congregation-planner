import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { GesperrterKnopf } from '../bausteine/GesperrterKnopf'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { isQualified, listName, personCompare, serviceQualKey } from '../data/helpers'
import { fill, useT } from '../i18n/useT'
import { KEIN_FILTER, passtOhneAuswahl } from '../personen/person-filter'
import { PrivToggle } from '../personen/PrivToggle'

/**
 * **Ein Hilfsdienst** (T121, Phase 6c-2): wer ihn übernehmen darf, seine Stelle
 * in der Folge der Dienste — sie gilt auch im Programm — und Entfernen.
 *
 * **Wer ihn übernehmen darf (T79):** alle Personen, je eine mit Schalter.
 * Wer einen Dienst übernehmen darf, entschied bis dahin allein das
 * Personen-Detail — ein Schalter je Person, also einmal quer durch die
 * Versammlung, bis ein Dienst besetzbar war. Ein **neu angelegter** Dienst
 * beginnt bei null Freigaben; ohne diesen Weg blieb sein Platz Woche für Woche
 * offen, ohne dass die Auto-Zuteilung es sagen konnte.
 *
 * Die Zeilen sind dieselbe `PrivToggle` wie bei der Person — derselbe Schalter,
 * dasselbe Speichern (`updatePerson`), nur nach der anderen Seite aufgezogen:
 * dort eine Person und ihre Bereiche, hier ein Bereich und seine Personen.
 * Gruppen-Dienste (Reinigung) rotieren Gruppen und haben keinen Bereich — bei
 * ihnen fehlt die Liste.
 *
 * Entfernen nennt, was mitgeht, gleich über dem Knopf (zwei Tipps, wie jedes
 * Löschen): die Plätze in allen Wochen und die Freigaben bei den Personen
 * (`removeService`).
 */
export function HilfsdienstBlatt({ svcKey }: { svcKey: string }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [suche, setSuche] = useState('')
  const close = () => dispatch({ type: 'closeServiceSheet' })

  const service = state.services.find((s) => s.key === svcKey)
  const position = state.services.findIndex((s) => s.key === svcKey)
  const qkey = serviceQualKey(svcKey)
  // Dieselbe Ordnung wie in der Personenliste — wer dort sucht, sucht hier gleich.
  const personen = useMemo(
    () => [...state.persons].sort((a, b) => personCompare(a, b, state.lang)),
    [state.persons, state.lang],
  )
  if (!service) return null

  const name = tu(service.name)
  // Dieselbe Suche wie über der Personenliste: „Simon Krüger" wie „Krüger,
  // Simon", „kruger" findet „Krüger", Telefonnummern ziffernweise.
  const gefiltert = personen.filter((p) => passtOhneAuswahl(p, { ...KEIN_FILTER, q: suche }))
  const frei = state.persons.filter((p) => isQualified(p, qkey)).length
  const verschieben = (dir: -1 | 1) => dispatch({ type: 'moveService', key: svcKey, dir })

  return (
    <Sheet
      variante="lang"
      label={name}
      title={name}
      sub={service.groups ? t.gruppenRotation : `${t.eigenerBereich} · ${fill(t.personenCount, { n: frei })}`}
      onClose={close}
    >
      <div className="sheet-inhalt hd-blatt">
        <div className="hd-reihenfolge">
          <GesperrterKnopf className="knopf-umriss" gesperrt={position <= 0} onTipp={() => verschieben(-1)}>
            {t.a11yMoveUp}
          </GesperrterKnopf>
          <GesperrterKnopf
            className="knopf-umriss"
            gesperrt={position >= state.services.length - 1}
            onTipp={() => verschieben(1)}
          >
            {t.a11yMoveDown}
          </GesperrterKnopf>
        </div>
        {!service.groups && (
          <>
            <input
              type="text"
              dir="auto"
              className="lang-search"
              placeholder={t.suchen}
              aria-label={t.suchen}
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
            />
            <div className="lang-list svc-persons">
              {gefiltert.map((person) => (
                <PrivToggle
                  key={person.id}
                  qkey={qkey}
                  label={listName(person)}
                  person={person}
                  update={(patch) => dispatch({ type: 'updatePerson', id: person.id, patch })}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="hd-fuss">
        {/* Ein Gruppen-Dienst hat keine Freigaben — und lässt sich nicht neu anlegen
            (`HilfsdienstNeuBlatt` legt nur Dienste für Personen an). */}
        <p className="klein-text">{service.groups ? t.hdEntfernenHinweisGruppen : t.hdEntfernenHinweis}</p>
        <div className="sheet-fuss-ende">
          {/* Ohne eigene Frage: Mit dem Dienst geht gespeicherte Planung —
              „Wirklich löschen?", nicht „entfernen" (`EntfernenKnopf`). */}
          <EntfernenKnopf
            className="knopf-umriss knopf-entfernen"
            text={t.hdEntfernen}
            onEntfernen={() => dispatch({ type: 'removeService', key: svcKey })}
          />
          <button type="button" className="knopf-haupt" onClick={close}>
            {t.fertig}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
