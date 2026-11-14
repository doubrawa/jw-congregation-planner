import { useId, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../app/context'
import { useKuenftigePlaetze } from '../app/useKuenftigePlaetze'
import { AngebotText } from '../aufgaben/Angebot'
import { aufgabeTag } from '../aufgaben/aufgabe-anzeige'
import { AufgabeTermin, AufgabeText } from '../aufgaben/AufgabeText'
import { useAlsBeantwortet } from '../aufgaben/useAlsBeantwortet'
import { ZeitraumKalender } from '../bausteine/ZeitraumKalender'
import { nameVon } from '../data/helpers'
import { aufgabenLabel, aufgabenTermin, fill, useT } from '../i18n/useT'
import { imZeitraum } from './kalender'
import { Sheet } from './Sheet'
import { Switch } from './Switch'

/**
 * **Abwesenheit eintragen** (T121): ein Zeitraum im Kalender, ein Grund nach
 * Wunsch. In dieser Zeit teilt niemand die Person ein.
 *
 * Trägt der Admin für **eine andere** Person ein (Personen-Detail), nennt das
 * Blatt sie unter der Überschrift und im Hinweis — „wirst du nicht
 * eingeteilt" sprach sonst den Admin an.
 *
 * **Was in die Zeit fällt** (T181, Betreiber: „klingt gut"): Ist die Person dann
 * schon eingeteilt, stehen ihre Aufgaben darunter, jede mit Schalter. Bis dahin
 * hieß es nur „Bestehende Zuteilungen sehen die Planer als Konflikt" — bemerken
 * musste es der Planer selbst. Eingeschaltet gilt beim Eintragen:
 *
 *  - für die **eigene** Person die Absage, wie im Absage-Blatt — die Planer
 *    erfahren es, beim Hilfsdienst sucht die App Ersatz;
 *  - für **eine andere** die Freigabe (Betreiber: „Plätze freigeben"): Die
 *    Plätze werden offen und neu verplant, und wer davon wusste, erfährt es
 *    (`plaetzeFreigeben`). Für eine andere trägt nur der Admin ein
 *    (`darfAbwesenheitBearbeiten`), und planen darf er ohnehin.
 *
 * Alle stehen eingeschaltet da: Wer weg ist, kann sie nicht wahrnehmen. Was
 * ausgeschaltet bleibt, sehen die Planer weiter als Konflikt.
 *
 * Über ein Portal am Ende des Dokuments: Das Blatt liegt `position: fixed`, und
 * ein Vorfahr mit `transform` würde es sonst an sich binden (siehe den
 * Vortragsplan, T122).
 */
export function AbwesenheitBlatt({ personId, onClose }: { personId: string | null; onClose: () => void }) {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t } = i18n
  const [von, setVon] = useState('')
  const [bis, setBis] = useState('')
  const [grund, setGrund] = useState('')
  // Was ausgeschaltet ist — die Aufgabe bleibt, wie sie ist.
  const [behalten, setBehalten] = useState<ReadonlySet<string>>(new Set())
  const grundId = useId()
  const aufgabenId = useId()
  const eigene = personId === state.personId
  const fuer = eigene ? '' : nameVon(state.persons, personId)
  const art = eigene ? 'absagen' : 'freigeben'
  /*
   * Die eigenen Aufgaben stehen schon da (`state.myTasks`, in der Sprache des
   * Lesers); abgesagt ist abgesagt, sie kommen nicht noch einmal. Für eine
   * andere Person jeder künftige Platz (`useKuenftigePlaetze`) — auch, was sie
   * schon abgesagt hat: Neu verplant werden muss es so oder so.
   */
  const fremde = useKuenftigePlaetze(eigene ? undefined : state.persons.find((p) => p.id === personId))
  const { myTasks } = state
  const aufgaben = useMemo(() => {
    const kuenftige = eigene ? myTasks.filter((task) => task.status !== 'verhindert') : fremde.map((platz) => platz.aufgabe)
    return kuenftige.filter((task) => imZeitraum(aufgabeTag(task) ?? '', von, bis))
  }, [eigene, myTasks, fremde, von, bis])
  const alsBeantwortet = useAlsBeantwortet()

  const umschalten = (id: string): void => {
    const neu = new Set(behalten)
    if (neu.has(id)) neu.delete(id)
    else neu.add(id)
    setBehalten(neu)
  }

  const eintragen = () => {
    if (!von || !bis) {
      dispatch({ type: 'showToast', text: t.toastVonBis })
      return
    }
    // Offline nimmt die App nichts an (`store.tsx`). Die Meldung unten spräche
    // sonst von Abgesagtem, das nirgends angekommen ist — und überdeckte den
    // Hinweis, dass es nicht geht. Das Blatt bleibt offen, samt Zeitraum.
    if (state.staleAt) {
      dispatch({ type: 'showToast', text: t.offlineReadOnly })
      return
    }
    const keys = aufgaben.filter((task) => !behalten.has(task.id)).map((task) => task.id)
    if (keys.length > 0 && art === 'absagen') {
      // In einem Zug: Wer plant, bekommt einen Push für alle (Betreiber:
      // „ein push je planer"), nicht je Aufgabe einen.
      for (const key of keys) alsBeantwortet(key)
      dispatch({ type: 'declineTask', ids: keys })
    } else if (keys.length > 0 && personId) {
      dispatch({ type: 'plaetzeFreigeben', personId, keys })
    }
    dispatch({
      type: 'addAbsence',
      // personId verknüpft die Abwesenheit mit dem Programm — ohne sie weiß die
      // Planung nicht, wer fehlt. userId bleibt der Ersteller (siehe Absence).
      absence: { id: crypto.randomUUID(), personId, userId: state.userId, from: von, to: bis, reason: grund.trim() },
    })
    if (keys.length > 0) {
      const text = art === 'absagen' ? t.toastAbwAbgesagt : t.toastAbwFreigegeben
      dispatch({ type: 'showToast', text: fill(text, { n: keys.length }) })
    }
    onClose()
  }

  return createPortal(
    <Sheet label={t.abwEintragen} title={t.abwEintragen} sub={fuer || undefined} onClose={onClose}>
      <div className="sheet-inhalt">
        <ZeitraumKalender
          von={von}
          bis={bis}
          lang={state.lang}
          onWahl={(v, b) => {
            setVon(v)
            setBis(b)
          }}
        />
        <div className="abw-grund">
          <label className="feld-marke" htmlFor={grundId}>
            {t.grundOpt}
          </label>
          <input
            id={grundId}
            className="feld"
            type="text"
            dir="auto"
            maxLength={120}
            placeholder={t.grundPh}
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
          />
        </div>
        {aufgaben.length > 0 && (
          <section className="abw-aufgaben" aria-labelledby={aufgabenId}>
            <h3 id={aufgabenId} className="abschnitt-titel">
              {t.abwEingeteilt}
            </h3>
            {aufgaben.map((task) => (
              <div key={task.id} className="schalter-zeile">
                <span className="schalter-text">
                  <AngebotText titel={<AufgabeText task={task} />} wann={<AufgabeTermin task={task} />} />
                </span>
                <Switch
                  on={!behalten.has(task.id)}
                  label={`${aufgabenLabel(task, i18n)} · ${aufgabenTermin(task, i18n)}: ${art === 'absagen' ? t.absagen : t.freigebenWort}`}
                  onToggle={() => umschalten(task.id)}
                />
              </div>
            ))}
            <p className="klein-text">{art === 'absagen' ? t.abwAbsagenHinweis : t.abwFreigebenHinweis}</p>
          </section>
        )}
      </div>
      <div className="abw-fuss">
        <p className="klein-text">
          {fuer ? fill(t.abwHinweisFuer, { name: fuer }) : t.abwHinweis} {t.abwKonflikt}
        </p>
        <button type="button" className="knopf-haupt" onClick={eintragen}>
          {t.abwEintragen}
        </button>
      </div>
    </Sheet>,
    document.body,
  )
}
