import { useApp } from '../app/context'
import type { Termin } from '../data/types'
import { useT } from '../i18n/useT'
import { WOCHENTAGE, wochentagName } from './wochentage'

/**
 * Weitere Termine der Woche (T63) — Pionierbesprechung, Ältestenbesprechung,
 * was sonst ansteht.
 *
 * Steht im Wochen-Reiter, unter dem Anlass: Ein Termin gehört der **Woche**,
 * nicht einer Zusammenkunft — dieselbe Regel, aus der T64 diesen Reiter
 * überhaupt erst gemacht hat.
 *
 * **Reine Ankündigung** (Entscheidung des Betreibers): kein Bearbeiter, keine
 * Bestätigung, keine Erinnerung, kein Teilnehmerkreis. Deshalb gibt es hier
 * keinen Zuteilungs-Chip und keinen Bestätigungs-Status — es gäbe nichts, was
 * er anzeigen könnte.
 *
 * **Ohne einen einzigen neuen Wörterbuch-Schlüssel gebaut**, wie schon der
 * Sonderwochen-Block darunter: ein neuer hieße 33 erfundene Übersetzungen.
 *
 * | Element | Woher |
 * | --- | --- |
 * | Bezeichnung | `nameLbl` |
 * | Wochentage | `Intl` über `LOCALES` — wie im Sonderwochen-Block |
 * | „Wochentag" / „Uhrzeit" | `a11yWeekday` / `a11yTime` |
 * | Ort | `fsOrtPh` (dasselbe Feld führen die Treffpunkte) |
 * | Hinzufügen / Entfernen | `hinzufuegen` / `a11yRemove` |
 * | „kein Tag" | ein Gedankenstrich — in jeder Schrift derselbe |
 *
 * Die Bezeichnung selbst bleibt unübersetzt: Es sind die Worte des Planers,
 * wie der Grund einer Abweichung oder ein Vortragsthema. Genau deshalb musste
 * für „Pionierbesprechung" kein Fachbegriff erfunden werden.
 */
export function TerminePanel() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const week = state.weeks[state.week]
  if (!week) return null

  // Bewusst **unsortiert**: Sortiert wird erst bei der Anzeige (`termineVon`).
  // Spränge die Zeile schon beim Eintippen des Tages an ihren Platz, verlöre
  // das Feld darunter den Fokus mitten in der Eingabe.
  const termine = week.termine ?? []
  const setzen = (id: string, patch: Partial<Omit<Termin, 'id'>>) =>
    dispatch({ type: 'terminUpdate', id, patch })

  return (
    <>
      {termine.map((termin) => (
        <div key={termin.id} className="sonder">
          <div className="sonder-row">
            <input
              type="text"
              className="sonder-grund"
              dir="auto"
              value={termin.title}
              placeholder={t.nameLbl}
              aria-label={t.nameLbl}
              onChange={(e) => setzen(termin.id, { title: e.target.value })}
            />
            <button
              type="button"
              className="fs-remove"
              aria-label={t.a11yRemove}
              onClick={() => dispatch({ type: 'terminRemove', id: termin.id })}
            >
              ✕
            </button>
          </div>

          <div className="sonder-row sonder-row--termin">
            <label className="sonder-feld">
              <span className="sonder-label">{t.a11yWeekday}</span>
              <select
                className="sonder-select"
                value={termin.day ?? ''}
                onChange={(e) => setzen(termin.id, { day: e.target.value || undefined })}
              >
                {/* Noch kein Tag gewählt. Ein Gedankenstrich braucht keine
                    Übersetzung — derselbe Griff wie beim Anlass darüber. */}
                <option value="">—</option>
                {WOCHENTAGE.map((tag, i) => (
                  <option key={tag} value={tag}>
                    {wochentagName(i, state.lang)}
                  </option>
                ))}
              </select>
            </label>
            <label className="sonder-feld">
              <span className="sonder-label">{t.a11yTime}</span>
              <input
                type="time"
                className="sonder-time"
                value={termin.time ?? ''}
                onChange={(e) => setzen(termin.id, { time: e.target.value || undefined })}
              />
            </label>
          </div>

          {/* `fsOrtPh` ist ein Platzhaltertext („Ort (z. B. Königreichssaal)")
              und gehört deshalb ins Feld, nicht als Beschriftung darüber —
              `sonder-label` setzt Versalien, und „ORT (Z. B.
              KÖNIGREICHSSAAL)" liest sich wie ein Schild. Die Treffpunkte
              führen dasselbe Feld genauso. */}
          <div className="sonder-feld sonder-feld--grund">
            <input
              type="text"
              className="sonder-grund"
              dir="auto"
              value={termin.place ?? ''}
              placeholder={t.fsOrtPh}
              aria-label={t.fsOrtPh}
              onChange={(e) => setzen(termin.id, { place: e.target.value || undefined })}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        className="lac-add-btn termin-add"
        onClick={() => dispatch({ type: 'terminAdd' })}
      >
        {t.hinzufuegen}
      </button>
    </>
  )
}
