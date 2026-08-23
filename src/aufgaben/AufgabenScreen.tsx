import { useApp } from '../app/context'
import { AbsencePanel } from '../components/AbsencePanel'
import { PushPrompt } from '../components/PushPrompt'
import { fullName } from '../data/helpers'
import { relativeDayLabel } from '../i18n/relative-time'
import { aufgabenLabel, fill, useT } from '../i18n/useT'
import './aufgaben.css'

/**
 * Meine Aufgaben (Screen 4): nächste Aufgaben mit Bestätigungs-Status
 * (bestätigen / verhindert, S-89 anzeigen) und eigene Abwesenheiten. Das
 * Profil (Darstellung/Sprache/Abmelden) ist ein eigener Navigationspunkt.
 */
export function AufgabenScreen() {
  const { state, dispatch } = useApp()
  const i18n = useT()
  const { t, tu, tp } = i18n
  const me = state.persons.find((p) => p.id === state.personId)

  /**
   * „Deine Einträge": seit die Abwesenheiten versammlungsweit geladen werden
   * (die Planung braucht sie), muss hier wieder auf die eigenen eingegrenzt
   * werden. Ohne Konto (Demo) gibt es nichts einzugrenzen.
   *
   * **Die Person entscheidet, nicht der Ersteller.** Wer eingetragen hat, ist
   * eine andere Frage als wen es betrifft — und seit es beides getrennt gibt
   * (Import ohne Konto, Planer trägt für andere ein), führt der Ersteller in die
   * Irre: Nach `userId === meiner` stünden dem Planer alle Abwesenheiten der
   * Versammlung unter „Deine Einträge". Der Ersteller trägt nur noch den Fall,
   * für den er gedacht war: ein Konto **ohne** eigene Person (`personId` null),
   * das seine Einträge sonst nicht wiederfände.
   */
  const eigeneAbwesenheiten = state.userId
    ? state.absences.filter((a) =>
        a.personId != null ? a.personId === state.personId : a.userId === state.userId,
      )
    : state.absences


  return (
    <section className="screen">
      <h1 className="screen-title">{t.navAufgabenLong}</h1>
      <p className="screen-subtitle">
        {me ? fullName(me) : ''} · {fill(t.congLabel, { name: state.congregation.name })}
      </p>

      <PushPrompt />

      <div className="panel panel--lead" data-farbe="acc">
        <h2 className="panel-label">{t.naechsteAufgaben}</h2>
        {state.myTasks.map((task) => (
          <div key={task.id} className="auf-row">
            <div>
              <button
                type="button"
                className="auf-open"
                onClick={() => dispatch({ type: 'openMyTask', id: task.id })}
              >
                <div className="auf-title">{aufgabenLabel(task, i18n)}</div>
                <div className="auf-date">{tp(task.date)}</div>
              </button>
              <div className="auf-actions">
                {task.status === 'offen' && (
                  <button
                    type="button"
                    className="auf-confirm"
                    onClick={() => dispatch({ type: 'confirmTask', id: task.id })}
                  >
                    ✓ {t.bestaetigen}
                  </button>
                )}
                {task.status === 'bestätigt' && (
                  <span className="auf-badge auf-badge--best">✓ {t.bestaetigt}</span>
                )}
                {task.status === 'verhindert' && (
                  <span className="auf-badge auf-badge--verh">{t.verhindertChip}</span>
                )}
                {task.s89 && (
                  <button
                    type="button"
                    className="auf-s89"
                    onClick={() => task.s89 && dispatch({ type: 'openS89', payload: task.s89 })}
                  >
                    {t.s89Open} ›
                  </button>
                )}
              </div>
            </div>
            {(() => {
              // Live-Countdown aus dem echten Datum (Intl); im Demo der Chip-Text.
              const label = task.at != null ? relativeDayLabel(task.at, state.lang) : tu(task.chip)
              return label && <span className="auf-chip">{label}</span>
            })()}
          </div>
        ))}
      </div>

      {state.substituteReqs.length > 0 && (
        <div className="panel panel--pb14 auf-sub" data-farbe="gold">
          <h2 className="panel-label">{t.einspringenTitle}</h2>
          <p className="panel-hint">{t.einspringenHint}</p>
          {state.substituteReqs.map((req) => (
            <div key={req.key} className="auf-sub-row">
              <div>
                <div className="auf-sub-title">{tu(req.title)}</div>
                <div className="auf-sub-meta">
                  {tp(req.date)} · {tu(req.declinedBy)}
                </div>
                {/* Was ich an dem Tag schon habe — vor dem Zusagen. */}
                {req.schonHeute.length > 0 && (
                  <div className="auf-sub-warn">
                    {t.sheetSchonHeute}:{' '}
                    {req.schonHeute.map((a) => (a.lang === 'u' ? tu(a.text) : tp(a.text))).join(', ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="auf-sub-btn"
                onClick={() => dispatch({ type: 'takeSubstitute', key: req.key })}
              >
                {t.uebernehmen}
              </button>
            </div>
          ))}
        </div>
      )}

      <AbsencePanel personId={state.personId} entries={eigeneAbwesenheiten} listLabel={t.deineEintraege} />
    </section>
  )
}
