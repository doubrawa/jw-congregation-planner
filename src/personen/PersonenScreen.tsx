import { type Dispatch, type ReactNode, type SetStateAction, useMemo, useState } from 'react'
import { useApp } from '../app/context'
import { istAngemeldet } from '../app/eigene-person'
import { useKalendertag } from '../app/useKalendertag'
import { Punkt, type PunktArt } from '../bausteine/Punkt'
import { Zeichen } from '../bausteine/Zeichen'
import { abwesendText } from '../components/abwesenheit-anzeige'
import { useBackDismiss } from '../components/useBackDismiss'
import { DESKTOP_BREITE, useMedia } from '../components/useMedia'
import { displayName, doppelteFesteRollen, listName, ohneGruppe, personCompare } from '../data/helpers'
import { ROLE_KEY, type Dict } from '../i18n/ui'
import { fill, useT } from '../i18n/useT'
import { LinksSendenBlatt } from './LinksSendenBlatt'
import { NamenKnoepfe } from './NamenKnoepfe'
import { OrphanAccounts } from './OrphanAccounts'
import { PersonAnlegenBlatt } from './PersonAnlegenBlatt'
import { PersonDetail } from './PersonDetail'
import { PersonenFilterBlatt } from './PersonenFilterBlatt'
import {
  type Auswahl,
  gesetzteBlattfilter,
  KEIN_FILTER,
  passtOhneAuswahl,
  passtZurAuswahl,
  type PersonFilter,
} from './person-filter'
import { type AnmeldeStand, mitLage, type PersonMitLage } from './person-lage'
import { privLabel } from './priv-label'
import './personen.css'

/** Der Punkt eines Stands — dieselbe Sprache wie überall: voll, blass, gestrichelt. */
const PUNKT_DES_STANDS: Record<AnmeldeStand, PunktArt> = {
  angemeldet: 'voll',
  link: 'wartet',
  ohne: 'offen',
}

const STAND_KEY = {
  angemeldet: 'standAngemeldet',
  link: 'standLink',
  ohne: 'standOhneLink',
} as const satisfies Record<AnmeldeStand, keyof Dict>

const STAENDE: readonly AnmeldeStand[] = ['angemeldet', 'link', 'ohne']

/**
 * **Personen** (T121, Entwurf `GPersonen`, nur Admins): die Liste mit Suche,
 * oben der Stand der Anmeldung zum Antippen, jede Person mit ihrem Punkt — oder
 * eine Person. Am Desktop (`GDesktopPersonen`) steht die gewählte rechts neben
 * der Liste, statt sie zu ersetzen. Konten ohne verknüpfte Person verwaltet
 * `OrphanAccounts`.
 */
export function PersonenScreen() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const desktop = useMedia(DESKTOP_BREITE)
  const selected = state.persons.find((p) => p.id === state.selectedPersonId)
  // Zurück am Handy schließt zuerst das Detail (4.10.2026), dann erst den Bildschirm.
  useBackDismiss(selected !== undefined, () => dispatch({ type: 'selectPerson', id: null }), 'unteransicht')
  /*
   * **Suche und Filter leben hier, eine Ebene über der Liste** (5.10.2026).
   * Das Detail ersetzt die Liste, und bis dahin ging ihr Zustand mit ihr: Wer
   * die Personen einer Gruppe oder die Namen eines Warnbanners nacheinander
   * bearbeitete, setzte den Filter nach jeder Person neu. Ein anderer
   * Bildschirm setzt ihn weiter zurück — dann baut sich auch dieser ab.
   */
  const [filter, setFilter] = useState<PersonFilter>(KEIN_FILTER)
  const liste = <PersonList filter={filter} setFilter={setFilter} desktop={desktop} />
  if (!desktop) return selected ? <PersonDetail person={selected} /> : liste
  return (
    <div className="personen-raster">
      {liste}
      <aside className="personen-spalte" aria-label={selected ? displayName(selected) : t.navPersonen}>
        {selected ? <PersonDetail key={selected.id} person={selected} spalte /> : <p className="klein-text">{t.personWaehlen}</p>}
      </aside>
    </div>
  )
}

function PersonList({
  filter,
  setFilter,
  desktop,
}: {
  filter: PersonFilter
  setFilter: Dispatch<SetStateAction<PersonFilter>>
  desktop: boolean
}) {
  const { state } = useApp()
  const { t } = useT()
  const heute = useKalendertag()
  const [blatt, setBlatt] = useState<'anlegen' | 'filter' | 'links' | null>(null)
  const setz = (patch: Partial<PersonFilter>) => setFilter((f) => ({ ...f, ...patch }))
  // Ein Tipp auf die gewählte Auswahl hebt sie wieder auf; „Alle" bleibt dabei „Alle".
  const waehle = (auswahl: Auswahl) => setz({ auswahl: filter.auswahl === auswahl ? '' : auswahl })
  // Ohne Konto (Entwicklerseite) gibt es nichts anzumelden und niemanden, der einlädt.
  const angemeldet = istAngemeldet(state)

  /*
   * **Einmal je Bestand, nicht einmal je Tastendruck.**
   *
   * Das Filterfeld ist Zustand des Bildschirms: Jeder Buchstabe rendert die
   * Liste neu. Von allem hier hängt aber nur, was danach gefiltert wird, am
   * Filter — sortiert, eingeordnet und verglichen wird immer derselbe Bestand.
   * Bei 300 Personen kostete ein Buchstabe sonst rund 2 500 Namensvergleiche
   * (`personCompare` ruft `localeCompare`).
   */
  const { persons, lang, members, anmeldeLinks, absences, groups } = state
  const { eintraege, mehrfachRollen, ohne } = useMemo(() => {
    const sortiert = [...persons].sort((a, b) => personCompare(a, b, lang))
    return {
      eintraege: mitLage(sortiert, { members, anmeldeLinks, absences }, heute),
      // Beide aus der sortierten Liste — die Namen in den Warnungen stehen
      // dann in derselben Folge wie unten.
      mehrfachRollen: doppelteFesteRollen(sortiert),
      ohne: ohneGruppe(sortiert, groups),
    }
  }, [persons, lang, members, anmeldeLinks, absences, groups, heute])
  // Was Suche und Blatt übrig lassen — daran zählen die Knöpfe der Auswahl.
  const basis = eintraege.filter((e) => passtOhneAuswahl(e.person, filter))
  const zahl = (auswahl: Auswahl) => basis.filter((e) => passtZurAuswahl(auswahl, e.lage)).length
  const sichtbar = basis.filter((e) => passtZurAuswahl(filter.auswahl, e.lage))
  const blattfilter = gesetzteBlattfilter(filter)

  const auswahlKnopf = (auswahl: Auswahl, text: string) => (
    <button
      key={auswahl}
      type="button"
      className="personen-auswahl"
      aria-pressed={filter.auswahl === auswahl}
      onClick={() => waehle(auswahl)}
    >
      {text}
      <span className="personen-auswahl-zahl">{zahl(auswahl)}</span>
    </button>
  )

  return (
    <section className="screen personen">
      <div className="personen-kopf">
        <h1 className="seitentitel">{t.personen}</h1>
        {/* Am Handy der runde Knopf, am Desktop mit seinem Wort. */}
        {desktop ? (
          <button type="button" className="knopf-haupt" onClick={() => setBlatt('anlegen')}>
            <Zeichen name="plus" />
            {t.personAnlegen}
          </button>
        ) : (
          <button type="button" className="rund-knopf rund-knopf--akzent" aria-label={t.personAnlegen} onClick={() => setBlatt('anlegen')}>
            <Zeichen name="plus" />
          </button>
        )}
      </div>

      <div className="personen-suche">
        <Zeichen name="suche" />
        <input
          type="search"
          dir="auto"
          className="feld"
          placeholder={t.nameSuchen}
          aria-label={t.nameSuchen}
          value={filter.q}
          onChange={(e) => setz({ q: e.target.value })}
        />
      </div>

      {/* Feste Rollen sind der Sache nach je EINE Person. Sind zwei Schalter
          gesetzt, greift sich die Auto-Zuteilung irgendeinen (F7). Je Rolle
          eine Zeile, darunter wer sie trägt; ein Tipp auf den Namen öffnet die
          Person, bei der der Schalter steht. */}
      {mehrfachRollen.length > 0 && (
        <Hinweis art="feste-rollen" titel={t.wtRollenLabel} zahl={mehrfachRollen.length} text={t.wtRollenDoppeltHint}>
          {mehrfachRollen.map((r) => (
            <div key={r.key} data-rolle={r.key}>
              <p className="personen-hinweis-zeile" dir="auto">
                {fill(t.dublettenRow, { name: privLabel(t, r.key), n: r.personen.length })}
              </p>
              <NamenKnoepfe personen={r.personen} />
            </div>
          ))}
        </Hinweis>
      )}

      {/* Wer keiner Predigtdienstgruppe zugeordnet ist, sieht beim Predigtdienst
          keine Gruppentreffpunkte — auch nach dem Löschen einer Gruppe, das alle
          ihre Mitglieder so zurückließ. Ein Tipp auf den Namen öffnet die
          Person, bei der die Gruppe gesetzt wird. */}
      {ohne.length > 0 && (
        <Hinweis art="ohne-gruppe" titel={t.ohneGruppeTitle} zahl={ohne.length} text={t.ohneGruppeHint}>
          <NamenKnoepfe personen={ohne} />
        </Hinweis>
      )}

      {/* Konten ohne Person — sonst leicht zu übersehen (rendert nur, wenn es welche gibt). */}
      <OrphanAccounts />

      {/* Am Handy gezählt als Spur, am Desktop als Knöpfe in der Reihe darunter. */}
      {angemeldet && !desktop && (
        <div className="karte personen-stand" role="group" aria-label={t.standDerAnmeldung}>
          {STAENDE.map((stand) => (
            <button
              key={stand}
              type="button"
              className="personen-stand-knopf"
              aria-pressed={filter.auswahl === stand}
              onClick={() => waehle(stand)}
            >
              <span className="personen-stand-bahn" aria-hidden="true">
                <Punkt art={PUNKT_DES_STANDS[stand]} />
                <span className="personen-stand-linie" />
              </span>
              <span className="personen-stand-zahl">{zahl(stand)}</span>
              <span className="klein-text">{t[STAND_KEY[stand]]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="personen-auswahlen" role="group" aria-label={t.filterWeitere}>
        {auswahlKnopf('', t.filterAlle)}
        {angemeldet &&
          (desktop
            ? STAENDE.map((stand) => auswahlKnopf(stand, t[STAND_KEY[stand]]))
            : // Dasselbe Wort wie bei den Zusagen der Woche: „Noch nicht angemeldet".
              auswahlKnopf('nichtAngemeldet', t.zusagenOhneKonto))}
        {auswahlKnopf('abwesend', t.abwesendChip)}
        <button
          type="button"
          className="personen-auswahl"
          aria-pressed={blattfilter > 0}
          aria-haspopup="dialog"
          onClick={() => setBlatt('filter')}
        >
          {t.filterWeitere}
          {blattfilter > 0 && <span className="personen-auswahl-zahl">{blattfilter}</span>}
        </button>
      </div>

      {/* Wer noch keinen Link hat, bekommt hier seinen — alle, die die Liste
          gerade zeigt, auf einmal. */}
      {angemeldet && filter.auswahl === 'ohne' && sichtbar.length > 0 && (
        <button type="button" className="knopf-umriss personen-links-senden" onClick={() => setBlatt('links')}>
          {t.linksSenden}
        </button>
      )}

      {/* Wie viele übrig sind — nur, wenn Suche oder Auswahl einschränken; sonst
          nennt „Alle" die Zahl schon. */}
      {sichtbar.length !== eintraege.length && (
        <p className="klein-text personen-zahl">{fill(t.personenCount, { n: sichtbar.length })}</p>
      )}
      {sichtbar.length > 0 && (
        <div className="karte personen-liste">
          {sichtbar.map((e) => (
            <PersonZeile
              key={e.person.id}
              eintrag={e}
              punkt={angemeldet}
              breit={desktop}
              gewaehlt={desktop && e.person.id === state.selectedPersonId}
            />
          ))}
        </div>
      )}

      {blatt === 'anlegen' && <PersonAnlegenBlatt onClose={() => setBlatt(null)} />}
      {blatt === 'filter' && <PersonenFilterBlatt filter={filter} setz={setz} onClose={() => setBlatt(null)} />}
      {blatt === 'links' && (
        <LinksSendenBlatt
          personen={sichtbar.map((e) => e.person)}
          zahlen={{ angelegt: basis.length, link: zahl('link'), angemeldet: zahl('angemeldet') }}
          onClose={() => setBlatt(null)}
        />
      )}
    </section>
  )
}

/**
 * Eine Person in der Liste: ihr Punkt, der Name („Nachname, Vorname", wie
 * sortiert), darunter Gruppe und Rolle — wer noch nicht angemeldet ist, statt
 * der Rolle sein Stand, wer heute fehlt, bis wann. Rechts ihr Recht.
 *
 * Am Desktop (`breit`, Entwurf `GDesktopPersonen`) in Spalten: Name, Gruppe
 * und Rolle, dann der Stand mit dem Recht — oder bis wann jemand fehlt.
 */
function PersonZeile({
  eintrag,
  punkt,
  breit,
  gewaehlt,
}: {
  eintrag: PersonMitLage
  /** Mit Punkt und Stand — nur, wo es Konten gibt (nicht auf der Entwicklerseite). */
  punkt: boolean
  breit: boolean
  gewaehlt: boolean
}) {
  const { state, dispatch } = useApp()
  const { t, tu } = useT()
  const { person, lage } = eintrag
  const gruppe = state.groups.find((g) => g.id === person.grp)
  const gruppenName = gruppe ? tu(gruppe.name) : ''
  const standWort = punkt ? t[STAND_KEY[lage.stand]] : ''
  const abwesend = lage.abwesenheit ? abwesendText(lage.abwesenheit, t, state.lang) : ''
  const marke = lage.rechte.admin ? t.planerLbl : lage.rechte.planer ? t.rollePlaner : ''
  const inhalt = breit ? (
    // Die Spalten in einem Behälter: Wird die Liste für die Schrift zu schmal,
    // steht der Name über Gruppe und Stand (`personen.css`, T128).
    <span className="personen-zellen">
      <span className="personen-name personen-zelle" dir="auto">
        {listName(person)}
      </span>
      <span className="klein-text personen-zelle">{[gruppenName, t[ROLE_KEY[person.role]]].filter(Boolean).join(' · ')}</span>
      <span className={abwesend ? 'klein-text personen-zelle is-problem' : 'klein-text personen-zelle'}>
        {abwesend || [standWort, marke].filter(Boolean).join(' · ')}
      </span>
    </span>
  ) : (
    <>
      <span className="personen-zeile-text">
        <span className="personen-name" dir="auto">
          {listName(person)}
        </span>
        <span className={abwesend ? 'klein-text is-problem' : 'klein-text'}>
          {abwesend ||
            [gruppenName, standWort && lage.stand !== 'angemeldet' ? standWort : t[ROLE_KEY[person.role]]]
              .filter(Boolean)
              .join(' · ')}
        </span>
      </span>
      {marke && <span className="personen-marke">{marke}</span>}
    </>
  )
  return (
    <button
      type="button"
      className="personen-zeile"
      aria-current={gewaehlt ? 'true' : undefined}
      onClick={() => dispatch({ type: 'selectPerson', id: person.id })}
    >
      {punkt && <Punkt art={PUNKT_DES_STANDS[lage.stand]} />}
      {inhalt}
      <Zeichen name="weiter" />
    </button>
  )
}

/**
 * Ein Hinweis über der Liste (feste Rollen doppelt, ohne Gruppe): Titel mit
 * Zahl, der Grund, darunter die Namen.
 */
function Hinweis({
  art,
  titel,
  zahl,
  text,
  children,
}: {
  art: string
  titel: string
  zahl: number
  text: string
  children: ReactNode
}) {
  return (
    <section className="karte personen-hinweis" data-warnung={art}>
      <h2 className="abschnitt-titel karte-titel">
        <Punkt art="problem" />
        <span className="personen-hinweis-titel">{titel}</span>
        <span className="personen-hinweis-zahl">{zahl}</span>
      </h2>
      <p className="klein-text personen-hinweis-text">{text}</p>
      {children}
    </section>
  )
}
