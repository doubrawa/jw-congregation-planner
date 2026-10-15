import { useApp } from '../app/context'
import { MeetingTabs } from '../components/MeetingTabs'
import { Bereichstitel } from '../components/Bereichstitel'
import { UnteransichtKopf } from '../components/UnteransichtKopf'
import { useBackDismiss } from '../components/useBackDismiss'
import { DESKTOP_BREITE, TABLET_BREITE, WOCHEN_SPALTE_BREITE, useMedia } from '../components/useMedia'
import { WeekStrip } from '../components/WeekStrip'
import { AusfallBanner, MemorialBanner } from '../components/WeekBadges'
import { WochenWahl } from '../components/WochenWahl'
import { hatAuxKlasse } from '../data/aux-class'
import { mtab } from '../data/helpers'
import { geplantesThema, rechteVon, treffpunktGruppe, type Rechte } from '../data/rechte'
import type { MeetingTab } from '../data/types'
import { useProgWeek, useT } from '../i18n/useT'
import { PlanenAktionen } from './PlanenAktionen'
import { planArt, zumPlanDerWoche } from './planen-raster'
import { ZuteilenSpalte } from './AssignSheet'
import { S89Bogen } from './S89Bogen'
import { FsBereichTabs } from './FsBereichTabs'
import { aktiverFsBereich } from './fs-bereiche'
import { WeiterePlaenePlan } from './WeiterePlaenePlan'
import { GruppenbesuchePlan } from './GruppenbesuchePlan'
import { FsPlan } from './FsPlan'
import { FsRulesPanel } from './FsRulesPanel'
import { AuxCounselorPanel } from './AuxCounselorPanel'
import { WochePanel } from './WochePanel'
import { HelpersPanel } from './HelpersPanel'
import { VortragsplanPanel } from './VortragsplanPanel'
import { MeetingSection } from './MeetingSection'
import { BesetzungKarte, PlanSpur } from './WochenStand'
import { WochenSpalte } from './WochenUebersicht'
import { ZusagenAnsicht } from './ZusagenAnsicht'
// Die Karten der Abschnitte und die Zeilen der Punkte teilt das Planen mit dem
// Ansehen (T121).
import '../programm/programm.css'
import './planen.css'

/**
 * Planen (Screen 3, nur Planer): die Woche mit ihrem Stand, darunter jeder
 * Platz als Zeile (T121, Entwurf `GPlanen`) — ein Tipp öffnet das Zuteilen.
 * Jede Zeile zeigt die Lage ihres Platzes: zugesagt, wartet, ein Problem,
 * offen. „Unser Leben als Christ" ist editierbar. Der Screen orchestriert nur;
 * Stand, Abschnitte und Hilfsdienste sind eigene Bausteine.
 *
 * Seit T120 die Planen-Seite **beider Themen**: der Zusammenkünfte und des
 * Predigtdienstes. Welches gerade gezeigt wird, sagt der Reiter (`themaVon`).
 */
export function PlanenScreen() {
  const { state, dispatch } = useApp()
  const rechte = rechteVon(state)
  const breit = useMedia(TABLET_BREITE)
  const desktop = useMedia(DESKTOP_BREITE)
  // Links die Wochen (Entwurf `GDesktopPlanen`) — für den, der zuteilt, und nur
  // bei den Plänen einer Woche: Zusammenkünfte und Treffpunkte.
  const wochenSpalte = useMedia(WOCHEN_SPALTE_BREITE) && rechte.zuteilen
  // „Woche einrichten" und die Zusagen der Woche sind Unteransichten des Plans:
  // Die Zurück-Taste führt in den Plan zurück (`unteransicht`), nicht gleich zu
  // Start. Hier und nicht im Rumpf, den der Wochenstreifen dreimal zeichnet.
  useBackDismiss(unteransichtDesPlans(state.tab, rechte), () => dispatch(zumPlanDerWoche), 'unteransicht')

  // Die Weiteren Pläne (T120, Phase 5) sind ein eigenes Thema ohne Woche.
  // Planen dürfen sie Admin und Planer (der Planer verteilt die Gruppen); der
  // Gruppenaufseher landet hier gar nicht (`navigate` schickt ihn ins Ansehen).
  // Ihren Titel trägt die Ansicht selbst: Ein geöffneter Plan steht mit Zurück
  // an seiner Stelle.
  if (state.tab === 'wp' && rechte.zuteilen) return <WeiterePlaenePlan />

  // Grundplan und Gruppenbesuche haben keine Woche: Sie stehen ohne den
  // Wochenstreifen da — und auch, solange noch gar keine Woche geladen ist,
  // denn eine neue Versammlung richtet den Grundplan ein, bevor sie
  // importiert. Den Predigtdienst plant hier, wer den Reiter gewählt hat — und
  // der Gruppenaufseher, der nur ihn plant (`geplantesThema`).
  const bereich = aktiverFsBereich(state)
  if (geplantesThema(rechte, state.tab) === 'predigtdienst' && bereich !== 'treffpunkte') {
    return (
      // In derselben Spalte wie die Woche (`.screen.prog`): Karten mit Abstand.
      <section className="screen prog">
        <Bereichstitel thema="predigtdienst" />
        <FsBereichTabs />
        {bereich === 'grundplan' ? (
          // Den Grundplan ändern Admin und Planer ganz, der Gruppenaufseher
          // seine Gruppe (`treffpunktGruppe`).
          <FsRulesPanel onlyGroup={treffpunktGruppe(rechte)} />
        ) : (
          <GruppenbesuchePlan />
        )}
      </section>
    )
  }

  // Der Streifen zeichnet dieselben Inhalte dreimal — vorige, aktuelle und
  // nächste Woche — und übernimmt das Wischen. Die Aktionsleiste des Handys
  // steht außerhalb: Er verschiebt seinen Inhalt per `transform`, und eine
  // Leiste darin klebte nicht am Rand, sondern an der Woche. Aus demselben
  // Grund steht die Spalte zum Zuteilen am Desktop daneben, nicht darin.
  const plan = (
    <WeekStrip>
      <PlanenBody />
    </WeekStrip>
  )
  const art = planArt(state)
  const mitZuteilen =
    desktop && art ? (
      <div className="planen-raster">
        <div className="planen-raster-plan">{plan}</div>
        <ZuteilenSpalte />
      </div>
    ) : (
      <>
        {plan}
        {!breit && art && <PlanenAktionen art={art} leiste />}
      </>
    )
  if (!wochenSpalte) return mitZuteilen
  return (
    <div className="planen-wochen">
      <WochenSpalte />
      <div className="planen-wochen-plan">{mitZuteilen}</div>
    </div>
  )
}

/** Steht eine Unteransicht des Plans offen — „Woche einrichten" oder die Zusagen, bei dem, der plant? */
function unteransichtDesPlans(tab: MeetingTab, rechte: Rechte): boolean {
  return (tab === 'edit' || tab === 'zusagen') && rechte.zuteilen
}

/** Planung EINER Woche; welche, sagt der Zustand (im Streifen überschrieben). */
function PlanenBody() {
  const { state, dispatch } = useApp()
  const { t } = useT()
  const breit = useMedia(TABLET_BREITE)
  const art = planArt(state)
  // Anzeige in der Programmsprache des Nutzers (Sprachvariante, falls geholt);
  // die Logik (LAC-Erkennung, Minuten, Slots) läuft auf der kanonischen Woche.
  const rawWeek = state.weeks[state.week]
  const { week, tpw } = useProgWeek(rawWeek)

  const rechte = rechteVon(state)
  const thema = geplantesThema(rechte, state.tab)
  const isFs = thema === 'predigtdienst'

  // Noch keine Wochen (z. B. frisch eingerichtete Versammlung) → Hinweis. Im
  // Predigtdienst bleibt der Grundplan erreichbar.
  if (!rawWeek || !week) {
    return (
      <section className="screen">
        <Bereichstitel thema={thema} />
        {isFs && <FsBereichTabs />}
        <div className="panel panel--lead" data-farbe="neutral">
          <h2 className="panel-label">{t.keineWochenTitel}</h2>
          <p className="prog-meta">{t.keineWochenHinweis}</p>
        </div>
      </section>
    )
  }

  // Die Zusagen der Woche (T121, Phase 5g) stehen über beiden Zusammenkünften —
  // eine eigene Ansicht, im Streifen, damit sich die Woche wechseln lässt.
  if (state.tab === 'zusagen' && rechte.zuteilen) return <ZusagenAnsicht week={week} rawWeek={rawWeek} tpw={tpw} />

  // Die Bearbeiten-Ansicht (T64): Anlass, Sonderwoche und Termine — für Admin
  // und Planer (seit dem 15.10.2026; bis dahin nur der Admin).
  const isEdit = state.tab === 'edit' && rechte.zuteilen
  const tab = mtab(state.tab)
  const meeting = week[tab]
  const rawMeeting = rawWeek[tab]

  return (
    <section className="screen prog">
      {/* „Woche einrichten" ist eine Unteransicht des Plans (`GWochePlanen`):
          Zurück führt in den Plan der Woche, nicht aus dem Planen hinaus. */}
      {isEdit ? (
        <UnteransichtKopf titel={t.wocheEinrichten} onZurueck={() => dispatch(zumPlanDerWoche)} />
      ) : (
        <Bereichstitel thema={thema} />
      )}

      {/* Die Reiter des Predigtdienstes stehen über der Woche: Der Grundplan
          hat keine. */}
      {isFs && <FsBereichTabs />}

      {/* Ab dem Tablet stehen „Automatisch" und „Plan senden" rechts neben der
          Woche (`GDesktopPlanen`); am Handy unten in der Leiste. */}
      <WochenWahl week={week} rawWeek={rawWeek} tpw={tpw} rechts={breit && art ? <PlanenAktionen art={art} /> : undefined} />

      {!isFs && !isEdit && (
        <MeetingTabs
          tab={state.tab}
          week={rawWeek}
          showEdit={rechte.zuteilen}
          onChange={(tab) => dispatch({ type: 'setTab', tab })}
        />
      )}

      {isEdit ? (
        <WochePanel />
      ) : isFs ? (
        // „Automatisch" und „Plan senden" stehen in der Leiste, wie bei den
        // Zusammenkünften (`PlanenAktionen`).
        <FsPlan />
      ) : (
        <>
          <MemorialBanner week={week} tab={state.tab} />
          <AusfallBanner week={rawWeek} tab={tab} />

          {/* Wie weit die Woche ist und was zu klären ist (T121, `GPlanen`) —
              an der Stelle der früheren Banner und ihrer Legende. */}
          <PlanSpur tab={tab} />
          <BesetzungKarte tab={tab} tpw={tpw} />

          {/* Schulungsaufgaben gibt es nur unter der Woche — der Bogen steht
              deshalb nur dort und zeigt sich gar nicht, wenn keine da sind. */}
          {tab === 'mid' && <S89Bogen />}

          {/* Die Sprachvariante ist strukturgleich zur kanonischen Woche
              (`localizedWeek` prüft das) — fehlt der Abschnitt dort trotzdem,
              wird er übersprungen statt die Ansicht abstürzen zu lassen. */}
          {meeting.sections.map((section, si) => {
            const rawSection = rawMeeting.sections[si]
            if (!rawSection) return null
            return (
              <MeetingSection
                key={rawSection.label}
                si={si}
                section={section}
                rawSection={rawSection}
                mitAux={hatAuxKlasse(rawMeeting)}
                tpw={tpw}
              />
            )
          })}

          <AuxCounselorPanel meeting={rawMeeting} />

          <HelpersPanel meeting={meeting} />

          {/* Der Vortragsplan aus dem Planungsprogramm (T122) gilt für viele
              Wochen auf einmal und kommt selten — deshalb unten, nur am
              Wochenende, wo der Vortrag steht. */}
          {tab === 'we' && <VortragsplanPanel />}
        </>
      )}
    </section>
  )
}
