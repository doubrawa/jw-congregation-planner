import { useApp } from '../app/context'
import { personCompare, personLabel } from '../data/helpers'
import { useT } from '../i18n/useT'

/**
 * Konten ohne verknüpfte Person (nur Produktion): einer Person zuordnen oder
 * entfernen. Rendert nichts, wenn es keine solchen Konten gibt bzw. im Demo-Modus.
 */
export function OrphanAccounts() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const orphanAccounts = state.members.filter((m) => !m.personId)
  if (state.dataStatus === 'demo' || orphanAccounts.length === 0) return null
  /*
   * **Nur Personen ohne eigenes Konto.**
   *
   * Die Verknüpfung ist eins zu eins gedacht, und die ganze Oberfläche
   * unterstellt es: `linkedMember` nimmt das **erste** passende Mitglied, die
   * Konto-Karte zeigt genau eines, und `send-plan` wie `send-reminders` führen
   * je Person genau eine Konto-Id (`userByPerson`).
   *
   * Angeboten wurde trotzdem jede. Wer hier eine wählte, die schon ein Konto
   * hat, hängte ihr ein zweites an: Beide sahen ihre Aufgaben und konnten
   * bestätigen, die Benachrichtigung erreichte nur eines von beiden, und in
   * der Konto-Karte der Person stand das zweite nirgends — von dort ließ es
   * sich also auch nicht wieder lösen.
   */
  const vergeben = new Set(state.members.map((m) => m.personId).filter(Boolean))
  const sorted = state.persons.filter((p) => !vergeben.has(p.id)).sort(personCompare)

  return (
    <div className="panel panel--pb14 pers-orphans" data-farbe="neutral2">
      <h2 className="panel-label">{t.kontenOhnePerson}</h2>
      <p className="panel-hint">{t.kontenOhnePersonHint}</p>
      {orphanAccounts.map((member) => (
        <div key={member.userId} className="mem-row">
          <div className="mem-mail" dir="auto">
            {member.email || member.userId.slice(0, 8)}
            {member.userId === state.userId && <span className="mem-du">{t.duMarker}</span>}
          </div>
          <div className="mem-line">
            <select
              className="mem-select"
              aria-label={t.nameLbl}
              value=""
              onChange={(e) =>
                e.target.value &&
                dispatch({
                  type: 'updateMember',
                  userId: member.userId,
                  patch: { personId: e.target.value },
                })
              }
            >
              <option value="">{t.keinePersonOpt}</option>
              {sorted.map((p) => (
                <option key={p.id} value={p.id}>
                  {personLabel(p)}
                </option>
              ))}
            </select>
            {member.userId !== state.userId && (
              <button
                type="button"
                className="svc-remove"
                aria-label={t.a11yRemove}
                onClick={() => dispatch({ type: 'removeMember', userId: member.userId })}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
