import { useState } from 'react'
import { useApp } from '../app/context'
import { istAngemeldet } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { Zeichen } from '../bausteine/Zeichen'
import { AbwesenheitenKarte } from '../components/AbwesenheitenKarte'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { aufgabenJeWoche } from '../data/auslastung'
import { initials, personLabel } from '../data/helpers'
import { montagVon } from '../data/meeting-dates'
import type { Person } from '../data/types'
import { LOCALES } from '../i18n/langs'
import { ROLE_KEY } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { BereicheBlatt } from './BereicheBlatt'
import { bereicheDerPerson, bereichsGruppen } from './bereiche'
import { KontoCard } from './KontoCard'
import { PersonBearbeitenBlatt } from './PersonBearbeitenBlatt'
import { PersonTimeline } from './PersonTimeline'
import { RechteKarte } from './PrivToggle'

/** Über wie viele Wochen die Auslastung zurückblickt (Entwurf `GPerson`). */
const AUSLASTUNG_WOCHEN = 8

/**
 * **Eine Person** (T121, Entwurf `GPerson`): oben Name, Gruppe und Rolle, der
 * Stift öffnet „Person bearbeiten". Darunter das Konto als Spur, die
 * Aufgabenbereiche als Chips („Ändern" öffnet die Schalter), die Auslastung
 * der letzten Wochen, die Zeitleiste, die Abwesenheiten und die Rechte — zuletzt
 * „Person entfernen".
 *
 * Am Handy eine Unteransicht der Liste mit Zurück; am Desktop steht sie rechts
 * neben der Liste (`spalte`), dann ohne Zurück.
 */
export function PersonDetail({ person, spalte = false }: { person: Person; spalte?: boolean }) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const [blatt, setBlatt] = useState<'bearbeiten' | 'bereiche' | null>(null)
  const update = (patch: Partial<Person>) => dispatch({ type: 'updatePerson', id: person.id, patch })
  const gruppe = state.groups.find((g) => g.id === person.grp)
  const unter = [gruppe ? tu(gruppe.name) : '', t[ROLE_KEY[person.role]]].filter(Boolean).join(' · ')
  // Angemeldet: der Ring voll in Minze; sonst gestrichelt — wie die Punkte der Liste.
  const angemeldet = state.members.some((m) => m.personId === person.id)
  const stift = (
    <button type="button" className="rund-knopf" aria-label={t.personBearbeiten} onClick={() => setBlatt('bearbeiten')}>
      <Zeichen name="stift" />
    </button>
  )

  return (
    <section className="screen person">
      {!spalte && (
        <UnteransichtKopf titel={t.person} onZurueck={() => dispatch({ type: 'selectPerson', id: null })}>
          {stift}
        </UnteransichtKopf>
      )}

      <div className="person-kopf">
        <span className={angemeldet ? 'person-bild is-angemeldet' : 'person-bild'} aria-hidden="true">
          <span>{initials(person)}</span>
        </span>
        <div className="person-wer">
          <h2 className="person-name" dir="auto">
            {personLabel(person)}
          </h2>
          <span className="person-unter">{unter}</span>
        </div>
        {spalte && stift}
      </div>

      {istAngemeldet(state) && <KontoCard person={person} />}
      <BereicheKarte person={person} onAendern={() => setBlatt('bereiche')} />
      <AuslastungKarte person={person} />
      <PersonTimeline person={person} />
      <AbwesenheitenKarte person={person} />
      <RechteKarte person={person} update={update} />

      {/* Zwei Tipps: Der erste nennt die Folge, erst der zweite entfernt. */}
      <EntfernenKnopf
        className="knopf-leise knopf-entfernen person-entfernen"
        text={t.persLoeschen}
        frage={fill(t.confirmPersonDel, { name: personLabel(person) })}
        onEntfernen={() => dispatch({ type: 'removePerson', id: person.id })}
      />

      {blatt === 'bearbeiten' && <PersonBearbeitenBlatt person={person} onClose={() => setBlatt(null)} />}
      {blatt === 'bereiche' && <BereicheBlatt person={person} onClose={() => setBlatt(null)} />}
    </section>
  )
}

/**
 * Die Aufgabenbereiche als Chips, nach Gruppen — nur, was die Person hat.
 * „Ändern" öffnet die Schalter (entschieden am 11.10.2026: „Chips.").
 */
function BereicheKarte({ person, onAendern }: { person: Person; onAendern: () => void }) {
  const { state } = useApp()
  const { t, tu } = useT()
  const gruppen = bereicheDerPerson(bereichsGruppen(t, tu, state.services, LOCALES[state.lang]), person)
  return (
    <section className="karte person-karte">
      <div className="person-karte-kopf">
        <h2 className="abschnitt-titel karte-titel">{t.aufgabenbereiche}</h2>
        <button type="button" className="knopf-leise person-aendern" onClick={onAendern}>
          {t.aendern}
        </button>
      </div>
      {gruppen.length === 0 && <p className="klein-text">{t.keineBereiche}</p>}
      {gruppen.map((g) => (
        <div key={g.art} className="person-bereiche">
          <span className="klein-text">{g.titel}</span>
          <ul className="person-chips">
            {g.bereiche.map((b) => (
              <li key={b.key} className="person-chip">
                {b.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/**
 * **Auslastung**: wie viele Aufgaben in den letzten Wochen, je Woche ein Punkt —
 * voll, wo die Person dran war (gezählt wie beim Zuteilen). Die Punkte sind
 * ein Bild der Zahl darüber; vorgelesen wird die Zahl.
 */
function AuslastungKarte({ person }: { person: Person }) {
  const { state } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const jeWoche = aufgabenJeWoche(state.weeks, person, state.services, montagVon(heute), AUSLASTUNG_WOCHEN)
  const summe = jeWoche.reduce((a, b) => a + b, 0)
  return (
    <section className="karte person-karte">
      <h2 className="abschnitt-titel karte-titel">{t.auslastung}</h2>
      <p>{fill(t.aufgabenLetzteW, { w: AUSLASTUNG_WOCHEN, n: summe })}</p>
      <span className="person-wochen" aria-hidden="true">
        {jeWoche.map((n, i) => (
          <span key={i} className={n > 0 ? 'person-woche is-voll' : 'person-woche'} />
        ))}
      </span>
    </section>
  )
}
