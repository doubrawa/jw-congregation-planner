import { useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { Sheet } from '../components/Sheet'
import { listName, personCompare, serviceQualKey } from '../data/helpers'
import type { Service } from '../data/types'
import { useT } from '../i18n/useT'
import { KEIN_FILTER, passtOhneAuswahl } from '../personen/person-filter'
import { BereichZeile, PrivToggle } from '../personen/PrivToggle'
import { useAendernMitPlaetzen } from '../personen/useAendernMitPlaetzen'
import { uebernehmenKoennen, uebernehmenText } from './einstellungen-anzeige'
import { useNamensFeld } from './useNamensFeld'

/**
 * **Ein Hilfsdienst** (T121, Phase 6c-2): sein Name, wer ihn übernehmen darf,
 * und Entfernen. Eine Stelle in der Folge hat er nicht — die Listen ordnen nach
 * dem Namen (`useDienste`).
 *
 * **Der Name gilt beim Schließen**, wie bei Gruppe und Person (`useNamensFeld`).
 * Umbenennen lässt alles stehen: Plätze, Freigaben und Zusagen hängen am
 * Schlüssel des Dienstes, nicht am Namen. Bis zum 13.11.2026 ging es nur über
 * Entfernen und neu Anlegen — und damit gingen seine Plätze in allen Wochen
 * und jede Freigabe.
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
 *
 * Ein **Gruppen-Dienst** (Reinigung) geht an Gruppen statt an Personen: Hier
 * stehen alle Gruppen, je eine mit Schalter (18.10.2026) — dieselbe Zeile
 * (`BereichZeile`), dasselbe sofortige Speichern, nur an der Gruppe
 * (`Group.ohneReinigung`).
 *
 * Entfernen nennt, was mitgeht, gleich über dem Knopf (zwei Tipps, wie jedes
 * Löschen): die Plätze in allen Wochen und die Freigaben bei den Personen
 * (`removeService`).
 */
export function HilfsdienstBlatt({ svcKey }: { svcKey: string }) {
  const { state } = useApp()
  const service = state.services.find((s) => s.key === svcKey)
  return service ? <Blatt key={service.key} service={service} /> : null
}

function Blatt({ service }: { service: Service }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const gelesen = tu(service.name)
  // Eindeutig sein muss der Name unter den Diensten — erkannt am Schlüssel.
  const alsEintrag = (s: Service) => ({ id: s.key, name: s.name })
  const namensFeld = useNamensFeld(alsEintrag(service), state.services.map(alsEintrag), (name) =>
    dispatch({ type: 'renameService', key: service.key, name }),
  )
  const close = () => {
    namensFeld.uebernehmen()
    dispatch({ type: 'closeServiceSheet' })
  }

  const art = service.groups ? t.gruppenRotation : t.eigenerBereich
  const sub = `${art} · ${uebernehmenText(t, service, uebernehmenKoennen(state, service))}`

  return (
    <Sheet variante="lang" label={gelesen} title={gelesen} sub={sub} onClose={close}>
      <div className="sheet-inhalt hd-blatt">
        {namensFeld.feld}
        {service.groups ? <GruppenSchalter /> : <PersonenSchalter svcKey={service.key} />}
      </div>
      <div className="hd-fuss">
        {/* Ein Gruppen-Dienst hat keine Freigaben bei Personen — und lässt sich
            nicht neu anlegen (`HilfsdienstNeuBlatt` legt nur Dienste für
            Personen an). */}
        <p className="klein-text">{service.groups ? t.hdEntfernenHinweisGruppen : t.hdEntfernenHinweis}</p>
        <div className="sheet-fuss-ende">
          {/* Ohne eigene Frage: Mit dem Dienst geht gespeicherte Planung —
              „Wirklich löschen?", nicht „entfernen" (`EntfernenKnopf`). */}
          <EntfernenKnopf
            className="knopf-umriss knopf-entfernen"
            text={t.hdEntfernen}
            onEntfernen={() => {
              // Der Dienst geht — sein halb getippter Name mit ihm.
              namensFeld.verwerfen()
              dispatch({ type: 'removeService', key: service.key })
            }}
          />
          <button type="button" className="knopf-haupt" onClick={close}>
            {t.fertig}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

/**
 * Alle Personen, je eine mit dem Schalter ihres Bereichs für diesen Dienst —
 * darüber die Suche. Steht jemand noch an künftigen Plätzen des Dienstes,
 * fragt das Ausschalten erst (T182, `useAendernMitPlaetzen`).
 */
function PersonenSchalter({ svcKey }: { svcKey: string }) {
  const { state } = useApp()
  const { t } = useT()
  const { aendern, blatt } = useAendernMitPlaetzen()
  const [suche, setSuche] = useState('')
  const qkey = serviceQualKey(svcKey)
  // Dieselbe Ordnung wie in der Personenliste — wer dort sucht, sucht hier gleich.
  const personen = useMemo(
    () => [...state.persons].sort((a, b) => personCompare(a, b, state.lang)),
    [state.persons, state.lang],
  )
  // Dieselbe Suche wie über der Personenliste: „Simon Krüger" wie „Krüger,
  // Simon", „kruger" findet „Krüger".
  const gefiltert = personen.filter((p) => passtOhneAuswahl(p, { ...KEIN_FILTER, q: suche }))
  return (
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
            update={(patch) => aendern(person, patch)}
          />
        ))}
      </div>
      {blatt}
    </>
  )
}

/**
 * Alle Gruppen, je eine mit Schalter: an, solange sie reinigt. In der Folge
 * der Gruppen — in ihr geht die Reinigung reihum. Ohne Suche wie beim
 * Zuteilen der Reinigung: Eine Versammlung hat eine Handvoll Gruppen, nicht
 * hunderte Personen.
 */
function GruppenSchalter() {
  const { state, dispatch } = useApp()
  const { tu } = useT()
  return (
    <div className="lang-list svc-persons">
      {state.groups.map((gruppe) => {
        const an = !gruppe.ohneReinigung
        return (
          <BereichZeile
            key={gruppe.id}
            name={tu(gruppe.name)}
            an={an}
            dir="auto"
            onToggle={() => dispatch({ type: 'updateGroup', id: gruppe.id, patch: { ohneReinigung: an } })}
          />
        )
      })}
    </div>
  )
}
