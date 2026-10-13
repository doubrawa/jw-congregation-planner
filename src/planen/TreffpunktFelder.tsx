import { useApp } from '../app/context'
import { BlattFeld } from '../bausteine/BlattFeld'
import { Switch } from '../components/Switch'
import { HAEUFIGKEITEN, treffpunktHaeufigkeit } from '../components/treffpunkt-beschriftung'
import { useT } from '../i18n/useT'
import { WochentagWahl, ZeitWahl } from './ZeitWahl'

/*
 * **Die Felder eines Treffpunkts in einem Blatt** (T121, Phase 5e) — für einen
 * Treffpunkt dieser Woche und für eine Regel des Grundplans dieselben, je Feld
 * mit seiner Marke darüber. Die Blätter setzen sie zusammen; ob eine Änderung
 * gleich gilt oder erst mit „Hinzufügen", entscheiden sie selbst.
 */

/** Für wen der Treffpunkt gilt: die Versammlung oder eine ihrer Gruppen. */
export function GruppeFeld({ value, onChange }: { value: string | null; onChange: (grp: string | null) => void }) {
  const { state } = useApp()
  const { t, tu } = useT()
  return (
    <BlattFeld marke={t.gbGruppe}>
      {/* Das Auswahlfeld kennt nur Zeichenketten; „keine Gruppe" ist dort der
          leere Wert und in den Daten `null` (wie `Person.grp`). */}
      <select className="feld-wahl" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{t.fsVers}</option>
        {state.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {tu(g.name)}
          </option>
        ))}
      </select>
    </BlattFeld>
  )
}

export function WochentagFeld({ value, onChange }: { value: number; onChange: (wd: number) => void }) {
  const { t } = useT()
  return (
    <BlattFeld marke={t.a11yWeekday}>
      <WochentagWahl className="feld-wahl" value={value} label={t.a11yWeekday} onChange={onChange} />
    </BlattFeld>
  )
}

/** Jede Woche oder der n-te Wochentag im Monat (`FsRule.monthly`). */
export function HaeufigkeitFeld({ value, onChange }: { value: number; onChange: (monthly: number) => void }) {
  const { t } = useT()
  return (
    <BlattFeld marke={t.haeufigkeitLbl}>
      <select className="feld-wahl" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {HAEUFIGKEITEN.map((monthly) => (
          <option key={monthly} value={monthly}>
            {treffpunktHaeufigkeit(monthly, t)}
          </option>
        ))}
      </select>
    </BlattFeld>
  )
}

export function UhrzeitFeld({ value, onChange }: { value: string; onChange: (time: string) => void }) {
  const { t } = useT()
  return (
    <BlattFeld marke={t.a11yTime}>
      <ZeitWahl className="feld-wahl" value={value} label={t.a11yTime} onChange={onChange} />
    </BlattFeld>
  )
}

export function OrtFeld({
  value,
  placeholder,
  onChange,
}: {
  value: string
  placeholder: string
  onChange: (place: string) => void
}) {
  const { t } = useT()
  return (
    <BlattFeld marke={t.ortLbl}>
      <input
        className="feld"
        type="text"
        dir="auto"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </BlattFeld>
  )
}

/**
 * „Außer bei Versammlungstreffpunkt" — nur bei Gruppen: Trifft sich die
 * Versammlung am selben Tag, entfällt der Treffpunkt der Gruppe
 * (`FsRule.skipCong`). An der Versammlung selbst wäre es die Ausnahme von sich
 * selbst.
 */
export function AusserVersammlungFeld({ value, onChange }: { value: boolean; onChange: (skipCong: boolean) => void }) {
  const { t } = useT()
  return (
    <div className="schalter-zeile">
      <span className="schalter-text">{t.fsSkipCong}</span>
      <Switch on={value} label={t.fsSkipCong} onToggle={() => onChange(!value)} />
    </div>
  )
}
