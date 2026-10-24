import { useState } from 'react'
import { useApp } from '../app/context'
import { istAngemeldet, kontoGehtMit } from '../app/eigene-person'
import { Zeichen } from '../bausteine/Zeichen'
import { AbwesenheitenKarte } from '../components/AbwesenheitenKarte'
import { EntfernenKnopf } from '../components/EntfernenKnopf'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { initials, personLabel } from '../data/helpers'
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

/**
 * **Eine Person** (T121, Entwurf `GPerson`): oben Name, Gruppe und Rolle, der
 * Stift öffnet „Person bearbeiten". Darunter das Konto als Spur, die
 * Aufgabenbereiche als Chips („Ändern" öffnet die Schalter), die Zeitleiste
 * (mit der Zahl der letzten Wochen, seit T136 statt der Karte „Auslastung"),
 * die Abwesenheiten und die Rechte — zuletzt „Person entfernen".
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
      <PersonTimeline person={person} />
      <AbwesenheitenKarte person={person} />
      <RechteKarte person={person} update={update} />

      {/* Zwei Tipps: Der erste nennt die Folge, erst der zweite entfernt. Hat
          die Person ein Konto, geht es mit (21.10.2026) — das eigene nicht. */}
      <EntfernenKnopf
        className="knopf-leise knopf-entfernen person-entfernen"
        text={t.persLoeschen}
        frage={
          fill(t.confirmPersonDel, { name: personLabel(person) }) +
          (state.members.some((m) => kontoGehtMit(m, person.id, state.userId)) ? ` ${t.confirmPersonDelKonto}` : '')
        }
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
