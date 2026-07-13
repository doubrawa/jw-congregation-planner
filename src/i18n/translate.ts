/**
 * Programm-Fragment-Übersetzer (v3): kanonisch deutsche Programm-Inhalte →
 * Zielsprache. `makeTr(code)` liefert eine Funktion, die S-38-Begriffe,
 * Lieder, Daten, Zeiten, Referenzen und „mit X“-Angaben übersetzt.
 * Unbekanntes bleibt unverändert (Rückfall auf Deutsch).
 *
 * Nahezu 1:1 aus docs/design-handoff/design/i18n.js portiert.
 */

/* eslint-disable */
import type { Lang } from '../data/types'
import { LOCALES } from './langs'

interface DateDict {
  wd: string[]
  wda: string[]
  mon: string[]
  mona: string[]
  date: (w: string, d: string, m: string) => string
  range1: (a: string, b: string, m: string) => string
  range2: (a: string, ma: string, b: string, mb: string) => string
  song: (n: string) => string
  min: (n: string) => string
  ca: (r: string) => string
  ende: (r: string) => string
  lektion: (n: string) => string
  kap: (n: string) => string
  anhang: (n: string) => string
  artikel: (n: string) => string
  mit: (x: string) => string
  vers: (x: string) => string
  gruppe: (n: string) => string
  buch: (r: string) => string
  ref: (r: string) => string
  tage: (n: string) => string
  zut: (n: string) => string
}

const FRAG: Record<string, Record<string, string>> = {
  en: {
    'ERÖFFNUNG': 'OPENING', 'ABSCHLUSS': 'CONCLUSION',
    'SCHÄTZE AUS GOTTES WORT': 'TREASURES FROM GOD\u2019S WORD',
    'UNS IM DIENST VERBESSERN': 'APPLY YOURSELF TO THE FIELD MINISTRY',
    'UNSER LEBEN ALS CHRIST': 'LIVING AS CHRISTIANS',
    'ÖFFENTLICHER VORTRAG': 'PUBLIC TALK', 'WACHTTURM-STUDIUM': 'WATCHTOWER STUDY',
    'Einleitende Worte': 'Opening comments', 'Schlussworte': 'Concluding comments',
    'Nach geistigen Schätzen graben': 'Spiritual Gems', 'Bibellesung': 'Bible Reading',
    'Gespräche beginnen': 'Starting a Conversation', 'Interesse fördern': 'Following Up',
    'Menschen zu Jüngern machen': 'Making Disciples', 'Unsere Glaubensansichten erklären': 'Explaining Your Beliefs',
    'Vortrag': 'Talk', 'Versammlungsbibelstudium': 'Congregation Bible Study',
    'Aktuelles': 'Local Needs', 'Besprechung': 'Discussion', 'Gebet': 'Prayer',
    'Vorsitz': 'Chairman', 'Leiter': 'Conductor', 'Leser': 'Reader', 'Gastredner': 'Visiting speaker',
    'Von Haus zu Haus': 'House to house', 'Informell': 'Informal witnessing', 'In der Öffentlichkeit': 'Public witnessing',
    'Königreichssaal': 'Kingdom Hall',
    'Gespräche beginnen (informell)': 'Starting a Conversation (informal)',
    'Ton / Video': 'Audio / video', 'Mikrofone': 'Microphones', 'Ordner / Eingang': 'Attendants', 'Reinigung': 'Cleaning',
    'Zoom-Ordner': 'Zoom attendant', 'Eingangsordner': 'Entrance attendant', 'Saalordner': 'Hall attendant',
    'Dienstvortrag': 'Service talk', 'Kreisaufseher': 'Circuit overseer', 'DIENSTVORTRAG': 'SERVICE TALK',
    'GEDÄCHTNISMAHL': 'MEMORIAL', 'Gedächtnismahl-Ansprache': 'Memorial talk',
    '„Schätze Jehovas größtes Geschenk“': '“Treasure Jehovah’s Greatest Gift”',
    'Symbole herumreichen': 'Passing the emblems', 'Brot': 'Bread', 'Wein': 'Wine', 'Redner': 'Speaker',
    'nach Sonnenuntergang': 'after sundown',
    '„Lauft so, dass ihr den Preis gewinnt“': '“Run in Such a Way That You May Win the Prize”',
    '„Bleibt in Gottes Liebe“': '“Keep Yourselves in God’s Love”',
    'Ältester': 'Elder', 'Dienstamtgehilfe': 'Ministerial servant', 'Verkündiger': 'Publisher', 'Verkündigerin': 'Publisher',
    'vor 2 Std.': '2 hrs ago', 'heute, 08:00': 'today, 08:00', 'Montag': 'Monday', 'gerade eben': 'just now',
    'ohne Zuteilungen': 'without assignments', 'Programm für September ist online': 'September schedule is online',
    'Über Jehovas Eigenschaften nachzudenken, stärkt unseren Glauben': 'Meditating on Jehovah\u2019s Qualities Strengthens Our Faith',
    'Geh während der besonderen Aktion zielorientiert vor': 'Work Toward a Goal During the Special Campaign',
    '„Woran erkennt man echten Glauben?“': '\u201CHow Can Genuine Faith Be Recognized?\u201D',
    '„Dient Jehova mit Freude“': '\u201CServe Jehovah With Joy\u201D',
    'Was wir von den Rechabitern lernen': 'What We Learn From the Rechabites',
    '„Ein Name, der zählt“': '\u201CA Name That Counts\u201D',
    '„Bewahrt die Einheit“': '\u201CPreserve Unity\u201D',
    'Jehova belohnt Mut — das Beispiel Ebed-Melechs': 'Jehovah Rewards Courage\u2014The Example of Ebed-melech',
    'Baut einander auf': 'Build One Another Up',
    '„Frieden in einer unruhigen Welt“': '\u201CPeace in a Troubled World\u201D',
    '„Jehovas Barmherzigkeit widerspiegeln“': '\u201CReflect Jehovah\u2019s Mercy\u201D',
    'Auf Jehova hören — auch wenn es schwerfällt': 'Listen to Jehovah\u2014Even When It Is Difficult',
    'Jehova sorgt für sein Volk': 'Jehovah Cares for His People',
    '„Worauf gründet echte Hoffnung?“': '\u201CWhat Is the Basis for True Hope?\u201D',
    '„Bleibt wachsam“': '\u201CKeep on the Watch\u201D',
    'Jehovas Wort erfüllt sich immer': 'Jehovah\u2019s Word Always Comes True',
    'Bleib loyal wie Baruch': 'Remain Loyal Like Baruch',
    '„Wem kannst du wirklich vertrauen?“': '\u201CWhom Can You Really Trust?\u201D',
    '„Loyal in Prüfungen“': '\u201CLoyal Under Trial\u201D'
  },
  es: {
    'ERÖFFNUNG': 'APERTURA', 'ABSCHLUSS': 'CONCLUSIÓN',
    'SCHÄTZE AUS GOTTES WORT': 'TESOROS DE LA BIBLIA',
    'UNS IM DIENST VERBESSERN': 'SEAMOS MEJORES MAESTROS',
    'UNSER LEBEN ALS CHRIST': 'NUESTRA VIDA CRISTIANA',
    'ÖFFENTLICHER VORTRAG': 'DISCURSO PÚBLICO', 'WACHTTURM-STUDIUM': 'ESTUDIO DE LA ATALAYA',
    'Einleitende Worte': 'Palabras de introducción', 'Schlussworte': 'Palabras de conclusión',
    'Nach geistigen Schätzen graben': 'Busquemos perlas escondidas', 'Bibellesung': 'Lectura de la Biblia',
    'Gespräche beginnen': 'Empiece conversaciones', 'Interesse fördern': 'Haga revisitas',
    'Menschen zu Jüngern machen': 'Haga discípulos', 'Unsere Glaubensansichten erklären': 'Explique sus creencias',
    'Vortrag': 'Discurso', 'Versammlungsbibelstudium': 'Estudio bíblico de la congregación',
    'Aktuelles': 'Necesidades de la congregación', 'Besprechung': 'Análisis con el auditorio', 'Gebet': 'Oración',
    'Vorsitz': 'Presidente', 'Leiter': 'Conductor', 'Leser': 'Lector', 'Gastredner': 'Orador invitado',
    'Von Haus zu Haus': 'De casa en casa', 'Informell': 'Predicación informal', 'In der Öffentlichkeit': 'Predicación pública',
    'Königreichssaal': 'Salón del Reino',
    'Gespräche beginnen (informell)': 'Empiece conversaciones (informal)',
    'Ton / Video': 'Audio y video', 'Mikrofone': 'Micrófonos', 'Ordner / Eingang': 'Acomodadores', 'Reinigung': 'Limpieza',
    'Zoom-Ordner': 'Acomodador de Zoom', 'Eingangsordner': 'Acomodador de entrada', 'Saalordner': 'Acomodador de sala',
    'Dienstvortrag': 'Discurso de servicio', 'Kreisaufseher': 'Superintendente de circuito', 'DIENSTVORTRAG': 'DISCURSO DE SERVICIO',
    'GEDÄCHTNISMAHL': 'CONMEMORACIÓN', 'Gedächtnismahl-Ansprache': 'Discurso de la Conmemoración',
    '„Schätze Jehovas größtes Geschenk“': '“Valoremos el mayor regalo de Jehová”',
    'Symbole herumreichen': 'Pasar los emblemas', 'Brot': 'Pan', 'Wein': 'Vino', 'Redner': 'Orador',
    'nach Sonnenuntergang': 'después de la puesta del sol',
    '„Lauft so, dass ihr den Preis gewinnt“': '“Corran de tal modo que ganen el premio”',
    '„Bleibt in Gottes Liebe“': '“Manténganse en el amor de Dios”',
    'Ältester': 'Anciano', 'Dienstamtgehilfe': 'Siervo ministerial', 'Verkündiger': 'Publicador', 'Verkündigerin': 'Publicadora',
    'vor 2 Std.': 'hace 2 h', 'heute, 08:00': 'hoy, 08:00', 'Montag': 'lunes', 'gerade eben': 'ahora mismo',
    'ohne Zuteilungen': 'sin asignaciones', 'Programm für September ist online': 'El programa de septiembre está disponible',
    'Über Jehovas Eigenschaften nachzudenken, stärkt unseren Glauben': 'Meditar en las cualidades de Jehová fortalece nuestra fe',
    'Geh während der besonderen Aktion zielorientiert vor': 'Fíjese objetivos durante la campaña especial',
    '„Woran erkennt man echten Glauben?“': '\u201C¿Cómo se reconoce la fe verdadera?\u201D',
    '„Dient Jehova mit Freude“': '\u201CSirvamos a Jehová con alegría\u201D',
    'Was wir von den Rechabitern lernen': 'Lo que aprendemos de los recabitas',
    '„Ein Name, der zählt“': '\u201CUn nombre que vale\u201D',
    '„Bewahrt die Einheit“': '\u201CMantengamos la unidad\u201D',
    'Jehova belohnt Mut — das Beispiel Ebed-Melechs': 'Jehová recompensa la valentía: el ejemplo de Ebed-mélec',
    'Baut einander auf': 'Edifiquémonos unos a otros',
    '„Frieden in einer unruhigen Welt“': '\u201CPaz en un mundo agitado\u201D',
    '„Jehovas Barmherzigkeit widerspiegeln“': '\u201CImitemos la misericordia de Jehová\u201D',
    'Auf Jehova hören — auch wenn es schwerfällt': 'Escuchemos a Jehová aunque cueste',
    'Jehova sorgt für sein Volk': 'Jehová cuida de su pueblo',
    '„Worauf gründet echte Hoffnung?“': '\u201C¿En qué se basa la esperanza verdadera?\u201D',
    '„Bleibt wachsam“': '\u201CManténganse alerta\u201D',
    'Jehovas Wort erfüllt sich immer': 'La palabra de Jehová siempre se cumple',
    'Bleib loyal wie Baruch': 'Sea leal como Baruc',
    '„Wem kannst du wirklich vertrauen?“': '\u201C¿En quién puede confiar de verdad?\u201D',
    '„Loyal in Prüfungen“': '\u201CLeales en las pruebas\u201D'
  },
  fr: {
    'ERÖFFNUNG': 'OUVERTURE', 'ABSCHLUSS': 'CONCLUSION',
    'SCHÄTZE AUS GOTTES WORT': 'JOYAUX DE LA PAROLE DE DIEU',
    'UNS IM DIENST VERBESSERN': 'APPLIQUE-TOI AU MINISTÈRE',
    'UNSER LEBEN ALS CHRIST': 'VIE CHRÉTIENNE',
    'ÖFFENTLICHER VORTRAG': 'DISCOURS PUBLIC', 'WACHTTURM-STUDIUM': 'ÉTUDE DE LA TOUR DE GARDE',
    'Einleitende Worte': 'Paroles d\u2019introduction', 'Schlussworte': 'Paroles de conclusion',
    'Nach geistigen Schätzen graben': 'Perles spirituelles', 'Bibellesung': 'Lecture de la Bible',
    'Gespräche beginnen': 'Engage la conversation', 'Interesse fördern': 'Entretiens l\u2019intérêt',
    'Menschen zu Jüngern machen': 'Fais des disciples', 'Unsere Glaubensansichten erklären': 'Explique tes croyances',
    'Vortrag': 'Discours', 'Versammlungsbibelstudium': 'Étude biblique de l\u2019assemblée',
    'Aktuelles': 'Besoins de l\u2019assemblée', 'Besprechung': 'Discussion', 'Gebet': 'Prière',
    'Vorsitz': 'Président', 'Leiter': 'Conducteur', 'Leser': 'Lecteur', 'Gastredner': 'Orateur invité',
    'Von Haus zu Haus': 'De maison en maison', 'Informell': 'Témoignage informel', 'In der Öffentlichkeit': 'Témoignage public',
    'Königreichssaal': 'Salle du Royaume',
    'Gespräche beginnen (informell)': 'Engage la conversation (informel)',
    'Ton / Video': 'Sonorisation / vidéo', 'Mikrofone': 'Micros', 'Ordner / Eingang': 'Placeurs', 'Reinigung': 'Ménage',
    'Zoom-Ordner': 'Placeur Zoom', 'Eingangsordner': 'Placeur à l\u2019entrée', 'Saalordner': 'Placeur de salle',
    'Dienstvortrag': 'Discours de service', 'Kreisaufseher': 'Responsable de circonscription', 'DIENSTVORTRAG': 'DISCOURS DE SERVICE',
    'GEDÄCHTNISMAHL': 'MÉMORIAL', 'Gedächtnismahl-Ansprache': 'Discours du Mémorial',
    '„Schätze Jehovas größtes Geschenk“': '« Chérissons le plus beau cadeau de Jéhovah »',
    'Symbole herumreichen': 'Passage des emblèmes', 'Brot': 'Pain', 'Wein': 'Vin', 'Redner': 'Orateur',
    'nach Sonnenuntergang': 'après le coucher du soleil',
    '„Lauft so, dass ihr den Preis gewinnt“': '« Courez de manière à gagner le prix »',
    '„Bleibt in Gottes Liebe“': '« Gardez-vous dans l\u2019amour de Dieu »',
    'Ältester': 'Ancien', 'Dienstamtgehilfe': 'Assistant', 'Verkündiger': 'Proclamateur', 'Verkündigerin': 'Proclamatrice',
    'vor 2 Std.': 'il y a 2 h', 'heute, 08:00': 'aujourd\u2019hui, 08:00', 'Montag': 'lundi', 'gerade eben': 'à l\u2019instant',
    'ohne Zuteilungen': 'sans attributions', 'Programm für September ist online': 'Le programme de septembre est en ligne',
    'Über Jehovas Eigenschaften nachzudenken, stärkt unseren Glauben': 'Méditer sur les qualités de Jéhovah fortifie notre foi',
    'Geh während der besonderen Aktion zielorientiert vor': 'Fixe-toi des objectifs pendant la campagne spéciale',
    '„Woran erkennt man echten Glauben?“': '« À quoi reconnaît-on la vraie foi ? »',
    '„Dient Jehova mit Freude“': '« Servons Jéhovah avec joie »',
    'Was wir von den Rechabitern lernen': 'Ce que nous apprenons des Récabites',
    '„Ein Name, der zählt“': '« Un nom qui compte »',
    '„Bewahrt die Einheit“': '« Préservons l\u2019unité »',
    'Jehova belohnt Mut — das Beispiel Ebed-Melechs': 'Jéhovah récompense le courage : l\u2019exemple d\u2019Ébed-Mélek',
    'Baut einander auf': 'Encouragez-vous les uns les autres',
    '„Frieden in einer unruhigen Welt“': '« La paix dans un monde troublé »',
    '„Jehovas Barmherzigkeit widerspiegeln“': '« Imitons la miséricorde de Jéhovah »',
    'Auf Jehova hören — auch wenn es schwerfällt': 'Écoute Jéhovah, même quand c\u2019est difficile',
    'Jehova sorgt für sein Volk': 'Jéhovah prend soin de son peuple',
    '„Worauf gründet echte Hoffnung?“': '« Sur quoi repose la véritable espérance ? »',
    '„Bleibt wachsam“': '« Restez vigilants »',
    'Jehovas Wort erfüllt sich immer': 'La parole de Jéhovah se réalise toujours',
    'Bleib loyal wie Baruch': 'Reste fidèle comme Baruch',
    '„Wem kannst du wirklich vertrauen?“': '« À qui peux-tu vraiment te fier ? »',
    '„Loyal in Prüfungen“': '« Fidèles dans les épreuves »'
  }
};

// Datums-/Musterdaten
const WD: Record<string, number> = { Montag: 0, Dienstag: 1, Mittwoch: 2, Donnerstag: 3, Freitag: 4, Samstag: 5, Sonntag: 6 };
const WDA: Record<string, number> = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 };
const MON: Record<string, number> = { Januar: 0, Februar: 1, 'März': 2, April: 3, Mai: 4, Juni: 5, Juli: 6, August: 7, September: 8, Oktober: 9, November: 10, Dezember: 11 };
const MONA: Record<string, number> = { Jan: 0, Feb: 1, 'Mär': 2, Apr: 3, Mai: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Okt: 9, Nov: 10, Dez: 11 };

const D: Record<string, DateDict> = {
  en: {
    wd: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
    wda: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    mon: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    mona: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    date: (w, d, m) => w + ', ' + m + ' ' + d,
    range1: (a, b, m) => m + ' ' + a + '\u2013' + b,
    range2: (a, ma, b, mb) => ma + ' ' + a + ' \u2013 ' + mb + ' ' + b,
    song: n => 'Song ' + n, min: n => n + ' min.', ca: r => 'approx. ' + r, ende: r => 'Ends approx. ' + r,
    lektion: n => 'lesson ' + n, kap: n => 'chap. ' + n, anhang: n => 'appendix A point ' + n,
    artikel: n => 'Study article ' + n, mit: x => 'with ' + x, vers: x => 'Cong. ' + x, gruppe: n => 'Group ' + n,
    buch: r => 'Jeremiah ' + r, ref: r => 'Jer ' + r, tage: n => 'in ' + n + ' days', zut: n => n + ' assignments'
  },
  es: {
    wd: ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'],
    wda: ['lun.','mar.','mié.','jue.','vie.','sáb.','dom.'],
    mon: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
    mona: ['ene.','feb.','mar.','abr.','may.','jun.','jul.','ago.','sep.','oct.','nov.','dic.'],
    date: (w, d, m) => w + ', ' + d + ' de ' + m,
    range1: (a, b, m) => a + ' al ' + b + ' de ' + m,
    range2: (a, ma, b, mb) => a + ' de ' + ma + ' al ' + b + ' de ' + mb,
    song: n => 'Canción ' + n, min: n => n + ' min.', ca: r => 'aprox. ' + r, ende: r => 'Termina aprox. ' + r,
    lektion: n => 'lección ' + n, kap: n => 'cap. ' + n, anhang: n => 'apéndice A punto ' + n,
    artikel: n => 'Artículo de estudio ' + n, mit: x => 'con ' + x, vers: x => 'Congr. ' + x, gruppe: n => 'Grupo ' + n,
    buch: r => 'Jeremías ' + r, ref: r => 'Jer ' + r, tage: n => 'en ' + n + ' días', zut: n => n + ' asignaciones'
  },
  fr: {
    wd: ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'],
    wda: ['lun.','mar.','mer.','jeu.','ven.','sam.','dim.'],
    mon: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
    mona: ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'],
    date: (w, d, m) => w + ' ' + d + ' ' + m,
    range1: (a, b, m) => a + '-' + b + ' ' + m,
    range2: (a, ma, b, mb) => a + ' ' + ma + ' \u2013 ' + b + ' ' + mb,
    song: n => 'Cantique ' + n, min: n => n + ' min', ca: r => 'vers ' + r, ende: r => 'Fin vers ' + r,
    lektion: n => 'leçon ' + n, kap: n => 'chap. ' + n, anhang: n => 'appendice A idée ' + n,
    artikel: n => 'Article d\u2019étude ' + n, mit: x => 'avec ' + x, vers: x => 'Ass. ' + x, gruppe: n => 'Groupe ' + n,
    buch: r => 'Jérémie ' + r, ref: r => 'Jér ' + r, tage: n => 'dans ' + n + ' jours', zut: n => n + ' attributions'
  }
};

/* ---- Intl-Pfad für zusätzliche App-Sprachen -----------------------------
 * Für Sprachen ohne handgepflegtes Datums-Wörterbuch (D) übernimmt Intl die
 * Wochentags-/Monatsnamen und die lokale Reihenfolge automatisch. FRAG (Rollen/
 * Dienste/Sektionen) und EXTRA (kurze Phrasen) liefern den Rest; fehlt eine
 * Sprache dort, greift Englisch als Fallback. */

interface Extra {
  song: (n: string) => string
  min: (n: string) => string
  ca: (r: string) => string
  ende: (r: string) => string
  mit: (x: string) => string
  tage: (n: string) => string
  zut: (n: string) => string
}

const EXTRA_EN: Extra = {
  song: n => 'Song ' + n, min: n => n + ' min.', ca: r => 'approx. ' + r, ende: r => 'Ends approx. ' + r,
  mit: x => 'with ' + x, tage: n => 'in ' + n + ' days', zut: n => n + ' assignments',
}

// Kurze Phrasen je Zusatz-Sprache (Datum/Namen kommen aus Intl). Wird batch-
// weise gefüllt; fehlende Sprachen nutzen EXTRA_EN.
const EXTRA: Record<string, Extra> = {}

/** Datum mit passendem Jahr finden, damit Intl den richtigen Wochentag zeigt. */
function findDateForWeekday(monthIdx: number, day: number, weekdayIdx: number): Date {
  for (let y = 2024; y < 2041; y++) {
    const d = new Date(Date.UTC(y, monthIdx, day))
    if (((d.getUTCDay() + 6) % 7) === weekdayIdx) return d
  }
  return new Date(Date.UTC(2025, monthIdx, day))
}
function intlWeekdayDate(locale: string, weekdayIdx: number, day: number, monthIdx: number, style: 'long' | 'short'): string {
  const d = findDateForWeekday(monthIdx, day, weekdayIdx)
  return new Intl.DateTimeFormat(locale, { weekday: style, day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d)
}
function intlWeekdayShort(locale: string, weekdayIdx: number): string {
  const d = findDateForWeekday(0, 1, weekdayIdx)
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d)
}
function intlRange(locale: string, d1: number, mo1: number, d2: number, mo2: number): string {
  const a = new Date(Date.UTC(2025, mo1, d1))
  const b = new Date(Date.UTC(2025, mo2, d2))
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatRange(a, b)
}

function makeTrIntl(code: Lang): (s: string) => string {
  const locale = LOCALES[code] ?? code
  const M: Record<string, string> = FRAG[code] ?? FRAG.en
  const ex: Extra = EXTRA[code] ?? EXTRA_EN
  const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^Lied (\d+)$/, m => ex.song(m[1])],
    [/^(\d+) Min\.$/, m => ex.min(m[1])],
    [/^Ende ca\. (.+)$/, m => ex.ende(m[1])],
    [/^ca\. (.+)$/, m => ex.ca(m[1])],
    [/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. ([A-Za-zäöü]+)$/, m => intlWeekdayDate(locale, WD[m[1]], +m[2], MON[m[3]], 'long')],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So), (\d+)\. ([A-Za-zäöü]+)$/, m => intlWeekdayDate(locale, WDA[m[1]], +m[2], MON[m[3]], 'short')],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So) (\d+:\d+)$/, m => intlWeekdayShort(locale, WDA[m[1]]) + ' ' + m[2]],
    [/^(\d+)\.–(\d+)\. ([A-Za-zäöü]+)$/, m => intlRange(locale, +m[1], MON[m[3]], +m[2], MON[m[3]])],
    [/^(\d+)\. ([A-Za-zäöü]{3}) – (\d+)\. ([A-Za-zäöü]{3})$/, m => intlRange(locale, +m[1], MONA[m[2]], +m[3], MONA[m[4]])],
    [/^mit (.+)$/, m => ex.mit(m[1])],
    [/^in (\d+) Tagen$/, m => ex.tage(m[1])],
    [/^(\d+) Zuteilungen$/, m => ex.zut(m[1])],
  ]
  const one = (f: string): string => {
    if (M[f] != null) return M[f]
    for (const [re, fn] of rules) { const m = f.match(re); if (m) return fn(m) }
    if (f.includes(' — ')) return f.split(' — ').map(one).join(' — ')
    return f
  }
  return (s: string): string => {
    if (s == null || s === '') return s
    if (M[s] != null) return M[s]
    return s.split(' · ').map(one).join(' · ')
  }
}

export function makeTr(code: Lang): (s: string) => string {
  if (!code || code === 'de') return s => s
  if (!D[code]) return makeTrIntl(code) // Zusatz-Sprachen: Intl-Datum + FRAG/EXTRA
  const M: Record<string, string> = FRAG[code] ?? {}, L: DateDict = D[code];
  const rules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^Lied (\d+)$/, m => L.song(m[1])],
    [/^(\d+) Min\.$/, m => L.min(m[1])],
    [/^Ende ca\. (.+)$/, m => L.ende(m[1])],
    [/^ca\. (.+)$/, m => L.ca(m[1])],
    [/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. ([A-Za-zäöü]+)$/, m => L.date(L.wd[WD[m[1]]], m[2], L.mon[MON[m[3]]])],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So), (\d+)\. ([A-Za-zäöü]+)$/, m => L.date(L.wda[WDA[m[1]]], m[2], L.mon[MON[m[3]]])],
    [/^(Mo|Di|Mi|Do|Fr|Sa|So) (\d+:\d+)$/, m => L.wda[WDA[m[1]]] + ' ' + m[2]],
    [/^(\d+)\.\u2013(\d+)\. ([A-Za-zäöü]+)$/, m => L.range1(m[1], m[2], L.mon[MON[m[3]]])],
    [/^(\d+)\. ([A-Za-zäöü]{3}) \u2013 (\d+)\. ([A-Za-zäöü]{3})$/, m => L.range2(m[1], L.mona[MONA[m[2]]], m[3], L.mona[MONA[m[4]]])],
    [/^Jeremia (.+)$/, m => L.buch(m[1])],
    [/^Jer (.+)$/, m => L.ref(m[1])],
    [/^th Lektion (\d+)$/, m => 'th ' + L.lektion(m[1])],
    [/^(wcg|lff) Kap\. (\d+)$/, m => m[1] + ' ' + L.kap(m[2])],
    [/^lmd Lektion (\d+)$/, m => 'lmd ' + L.lektion(m[1])],
    [/^lmd Anhang A Punkt (\d+)$/, m => 'lmd ' + L.anhang(m[1])],
    [/^Studienartikel (\d+)$/, m => L.artikel(m[1])],
    [/^mit (.+)$/, m => L.mit(m[1])],
    [/^Vers\. (.+)$/, m => L.vers(m[1])],
    [/^Gruppe (\d+)$/, m => L.gruppe(m[1])],
    [/^in (\d+) Tagen$/, m => L.tage(m[1])],
    [/^(\d+) Zuteilungen$/, m => L.zut(m[1])]
  ];
  const one = (f: string): string => {
    if (M[f] != null) return M[f];
    for (const [re, fn] of rules) { const m = f.match(re); if (m) return fn(m); }
    if (f.includes(' — ')) return f.split(' — ').map(one).join(' — ');
    return f;
  };
  return (s: string): string => {
    if (s == null || s === '') return s;
    if (M[s] != null) return M[s];
    return s.split(' · ').map(one).join(' · ');
  };
}
