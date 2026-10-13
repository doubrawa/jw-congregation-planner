import { useApp, type AppAction } from '../app/context'
import { Zeichen } from '../bausteine/Zeichen'
import { MeetingTabs } from '../components/MeetingTabs'
import { Bereichstitel } from '../components/Bereichstitel'
import { useBackDismiss } from '../components/useBackDismiss'
import { DESKTOP_BREITE, TABLET_BREITE, useMedia } from '../components/useMedia'
import { WeekStrip } from '../components/WeekStrip'
import { AusfallBanner, MemorialBanner } from '../components/WeekBadges'
import { WochenWahl } from '../components/WochenWahl'
import { hatAuxKlasse } from '../data/aux-class'
import { mtab } from '../data/helpers'
import { geplantesThema, rechteVon } from '../data/rechte'
import { useProgWeek, useT } from '../i18n/useT'
import { PlanenAktionen } from './PlanenAktionen'
import { planArt } from './planen-raster'
import { ZuteilenSpalte } from './AssignSheet'
import { S89Bogen } from './S89Bogen'
import { FsBereichTabs } from './FsBereichTabs'
import { aktiverFsBereich } from './fs-bereiche'
import { WeiterePlaenePlan } from './WeiterePlaenePlan'
import { GruppenbesuchePlan } from './GruppenbesuchePlan'
import { ZeugnisPlan } from './ZeugnisPlan'
import { FsPlan } from './FsPlan'
import { FsRulesPanel } from './FsRulesPanel'
import { AuxCounselorPanel } from './AuxCounselorPanel'
import { WochePanel } from './WochePanel'
import { HelpersPanel } from './HelpersPanel'
import { VortragsplanPanel } from './VortragsplanPanel'
import { MeetingSection } from './MeetingSection'
import { BesetzungKarte, PlanSpur } from './WochenStand'
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
  // „Woche einrichten" ist eine Unteransicht des Plans: Die Zurück-Taste führt
  // in den Plan zurück (`unteransicht`), nicht gleich zu Start. Hier und nicht
  // im Rumpf, den der Wochenstreifen dreimal zeichnet.
  useBackDismiss(state.tab === 'edit' && rechte.admin, () => dispatch(zumPlanDerWoche), 'unteransicht')

  // Die Weiteren Pläne (T120, Phase 5) sind ein eigenes Thema ohne Woche.
  // Planen dürfen sie Admin und Planer (der Planer verteilt die Gruppen); der
  // Gruppenaufseher landet hier gar nicht (`navigate` schickt ihn ins Ansehen).
  if (state.tab === 'wp' && rechte.zuteilen) {
    return (
      <section className="screen">
        <Bereichstitel thema="weitere" />
        <WeiterePlaenePlan />
      </section>
    )
  }

  // Grundplan, Gruppenbesuche und öffentliches Zeugnisgeben haben keine Woche:
  // Sie stehen ohne den Wochenstreifen da — und auch, solange noch gar keine
  // Woche geladen ist, denn eine neue Versammlung richtet den Grundplan ein,
  // bevor sie importiert. Den Predigtdienst plant hier, wer den Reiter gewählt
  // hat — und der Gruppenaufseher, der nur ihn plant (`geplantesThema`).
  const bereich = aktiverFsBereich(state)
  if (geplantesThema(rechte, state.tab) === 'predigtdienst' && bereich !== 'treffpunkte') {
    return (
      // Der Grundplan steht in derselben Spalte wie die Woche (`.screen.prog`):
      // Karten mit Abstand. Besuche und Zeugnisgeben bringen als alte Bausteine
      // ihre eigenen Ränder mit — bis zu ihrem Umbau (5e-3, Phase 7) ohne sie.
      <section className={bereich === 'grundplan' ? 'screen prog' : 'screen'}>
        <Bereichstitel thema="predigtdienst" />
        <FsBereichTabs />
        {bereich === 'grundplan' ? (
          // Den Grundplan ändert der Admin ganz, der Gruppenaufseher seine
          // Gruppe — auch, wenn er zugleich Planer ist (`fsBereiche`).
          <FsRulesPanel onlyGroup={rechte.admin ? null : rechte.gruppe} />
        ) : bereich === 'zeugnis' ? (
          <ZeugnisPlan />
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
  if (desktop && art) {
    return (
      <div className="planen-raster">
        <div className="planen-raster-plan">{plan}</div>
        <ZuteilenSpalte />
      </div>
    )
  }
  return (
    <>
      {plan}
      {!breit && art && <PlanenAktionen art={art} leiste />}
    </>
  )
}

/** Aus „Woche einrichten" zurück in den Plan — der Zusammenkunft unter der Woche. */
const zumPlanDerWoche: AppAction = { type: 'setTab', tab: 'mid' }

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

  // Die Bearbeiten-Ansicht (T64) gibt es nur für den Admin: Anlass,
  // Sonderwoche und Termine ändern den Plan, sie teilen nichts zu (4.10.2026).
  const isEdit = state.tab === 'edit' && rechte.admin
  const tab = mtab(state.tab)
  const meeting = week[tab]
  const rawMeeting = rawWeek[tab]

  return (
    <section className="screen prog">
      {/* „Woche einrichten" ist eine Unteransicht des Plans (`GWochePlanen`):
          Zurück führt in den Plan der Woche, nicht aus dem Planen hinaus. */}
      {isEdit ? (
        <div className="einrichten-kopf">
          <button type="button" className="rund-knopf" aria-label={t.a11yZurueck} onClick={() => dispatch(zumPlanDerWoche)}>
            <Zeichen name="zurueck" />
          </button>
          <h1 className="seitentitel">{t.wocheEinrichten}</h1>
        </div>
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
          showEdit={rechte.admin}
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
