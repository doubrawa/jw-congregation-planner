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
  ar: {
    "ERÖFFNUNG": "الافتتاح",
    "ABSCHLUSS": "الختام",
    "SCHÄTZE AUS GOTTES WORT": "كنوز من كلمة الله",
    "UNS IM DIENST VERBESSERN": "لنكن بارعين في الخدمة",
    "UNSER LEBEN ALS CHRIST": "حياتنا كمسيحيين",
    "ÖFFENTLICHER VORTRAG": "الخطاب العام",
    "WACHTTURM-STUDIUM": "درس برج المراقبة",
    "Einleitende Worte": "كلمات افتتاحية",
    "Schlussworte": "كلمات ختامية",
    "Nach geistigen Schätzen graben": "جواهر روحية",
    "Bibellesung": "قراءة الكتاب المقدس",
    "Gespräche beginnen": "بدء المحادثات",
    "Interesse fördern": "متابعة الاهتمام",
    "Menschen zu Jüngern machen": "تلمذة الناس",
    "Unsere Glaubensansichten erklären": "شرح معتقداتنا",
    "Vortrag": "خطاب",
    "Versammlungsbibelstudium": "درس الجماعة للكتاب المقدس",
    "Aktuelles": "احتياجات محلية",
    "Besprechung": "مناقشة",
    "Gebet": "صلاة",
    "Vorsitz": "الرئيس",
    "Leiter": "المدير",
    "Leser": "القارئ",
    "Gastredner": "خطيب زائر",
    "Redner": "الخطيب",
    "Von Haus zu Haus": "من بيت إلى بيت",
    "Informell": "شهادة غير رسمية",
    "In der Öffentlichkeit": "شهادة علنية",
    "Königreichssaal": "قاعة الملكوت",
    "Gespräche beginnen (informell)": "بدء المحادثات (غير رسمي)",
    "Ton / Video": "الصوت / الفيديو",
    "Mikrofone": "الميكروفونات",
    "Ordner / Eingang": "المرشدون / المدخل",
    "Reinigung": "التنظيف",
    "Zoom-Ordner": "مرشد زوم",
    "Eingangsordner": "مرشد المدخل",
    "Saalordner": "مرشد القاعة",
    "Ältester": "شيخ",
    "Dienstamtgehilfe": "خادم مساعد",
    "Verkündiger": "ناشر",
    "Verkündigerin": "ناشرة",
    "ohne Zuteilungen": "بدون تعيينات",
    "Programm für September ist online": "برنامج سبتمبر متاح الآن",
    "vor 2 Std.": "قبل ساعتين",
    "heute, 08:00": "اليوم، 08:00",
    "Montag": "الاثنين",
    "gerade eben": "الآن",
    "Über Jehovas Eigenschaften nachzudenken, stärkt unseren Glauben": "التأمل في صفات يهوه يقوّي إيماننا",
    "Geh während der besonderen Aktion zielorientiert vor": "اعمل نحو هدف خلال الحملة الخاصة",
    "„Woran erkennt man echten Glauben?“": "«كيف نميّز الإيمان الحقيقي؟»",
    "„Dient Jehova mit Freude“": "«اخدموا يهوه بفرح»",
  },
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
  },
  it: {
    'ERÖFFNUNG': 'INTRODUZIONE', 'ABSCHLUSS': 'CONCLUSIONE',
    'SCHÄTZE AUS GOTTES WORT': 'TESORI DELLA PAROLA DI DIO',
    'UNS IM DIENST VERBESSERN': 'EFFICACI NEL MINISTERO', 'UNSER LEBEN ALS CHRIST': 'VITA CRISTIANA',
    'ÖFFENTLICHER VORTRAG': 'DISCORSO PUBBLICO', 'WACHTTURM-STUDIUM': 'STUDIO TORRE DI GUARDIA',
    'DIENSTVORTRAG': 'DISCORSO DI SERVIZIO', 'GEDÄCHTNISMAHL': 'COMMEMORAZIONE',
    'Einleitende Worte': 'Parole di introduzione', 'Schlussworte': 'Parole di conclusione',
    'Nach geistigen Schätzen graben': 'Gemme spirituali', 'Bibellesung': 'Lettura biblica',
    'Gespräche beginnen': 'Iniziare conversazioni', 'Interesse fördern': 'Coltivare l’interesse',
    'Menschen zu Jüngern machen': 'Fare discepoli', 'Unsere Glaubensansichten erklären': 'Spiegare le proprie convinzioni',
    'Vortrag': 'Discorso', 'Versammlungsbibelstudium': 'Studio biblico di congregazione',
    'Aktuelles': 'Esigenze locali', 'Besprechung': 'Trattazione con l’uditorio',
    'Gebet': 'Preghiera', 'Vorsitz': 'Presidente', 'Leiter': 'Conduttore', 'Leser': 'Lettore',
    'Gastredner': 'Oratore ospite', 'Redner': 'Oratore', 'Kreisaufseher': 'Sorvegliante di circoscrizione',
    'Von Haus zu Haus': 'Di casa in casa', 'Informell': 'Testimonianza informale', 'In der Öffentlichkeit': 'Testimonianza pubblica',
    'Königreichssaal': 'Sala del Regno',
    'Mikrofone': 'Microfoni', 'Ton / Video': 'Audio/video', 'Ordner / Eingang': 'Uscieri', 'Reinigung': 'Pulizie',
    'Zoom-Ordner': 'Usciere Zoom', 'Eingangsordner': 'Usciere all’ingresso', 'Saalordner': 'Usciere di sala', 'Dienstvortrag': 'Discorso di servizio',
    'Ältester': 'Anziano', 'Dienstamtgehilfe': 'Servitore di ministero', 'Verkündiger': 'Proclamatore', 'Verkündigerin': 'Proclamatrice'
  },
  pt: {
    'ERÖFFNUNG': 'INTRODUÇÃO', 'ABSCHLUSS': 'CONCLUSÃO',
    'SCHÄTZE AUS GOTTES WORT': 'TESOUROS DA PALAVRA DE DEUS',
    'UNS IM DIENST VERBESSERN': 'FAÇA O SEU MELHOR NO MINISTÉRIO', 'UNSER LEBEN ALS CHRIST': 'VIVER COMO CRISTÃOS',
    'ÖFFENTLICHER VORTRAG': 'DISCURSO PÚBLICO', 'WACHTTURM-STUDIUM': 'ESTUDO DE A SENTINELA',
    'DIENSTVORTRAG': 'DISCURSO DE SERVIÇO', 'GEDÄCHTNISMAHL': 'CELEBRAÇÃO',
    'Einleitende Worte': 'Palavras de introdução', 'Schlussworte': 'Palavras de conclusão',
    'Nach geistigen Schätzen graben': 'Joias espirituais', 'Bibellesung': 'Leitura da Bíblia',
    'Gespräche beginnen': 'Iniciar conversas', 'Interesse fördern': 'Cultivar o interesse',
    'Menschen zu Jüngern machen': 'Fazer discípulos', 'Unsere Glaubensansichten erklären': 'Explicar as suas crenças',
    'Vortrag': 'Discurso', 'Versammlungsbibelstudium': 'Estudo bíblico de congregação',
    'Aktuelles': 'Necessidades locais', 'Besprechung': 'Consideração com o auditório',
    'Gebet': 'Oração', 'Vorsitz': 'Presidente', 'Leiter': 'Dirigente', 'Leser': 'Leitor',
    'Gastredner': 'Orador visitante', 'Redner': 'Orador', 'Kreisaufseher': 'Superintendente de circuito',
    'Von Haus zu Haus': 'De casa em casa', 'Informell': 'Testemunho informal', 'In der Öffentlichkeit': 'Testemunho público',
    'Königreichssaal': 'Salão do Reino',
    'Mikrofone': 'Microfones', 'Ton / Video': 'Áudio/vídeo', 'Ordner / Eingang': 'Indicadores', 'Reinigung': 'Limpeza',
    'Zoom-Ordner': 'Indicador do Zoom', 'Eingangsordner': 'Indicador de entrada', 'Saalordner': 'Indicador de sala', 'Dienstvortrag': 'Discurso de serviço',
    'Ältester': 'Ancião', 'Dienstamtgehilfe': 'Servo ministerial', 'Verkündiger': 'Publicador', 'Verkündigerin': 'Publicadora'
  },
  nl: {
    'ERÖFFNUNG': 'OPENING', 'ABSCHLUSS': 'AFSLUITING',
    'SCHÄTZE AUS GOTTES WORT': 'SCHATTEN UIT GODS WOORD',
    'UNS IM DIENST VERBESSERN': 'BEKWAAM IN DE BEDIENING', 'UNSER LEBEN ALS CHRIST': 'ONS LEVEN ALS CHRISTEN',
    'ÖFFENTLICHER VORTRAG': 'OPENBARE LEZING', 'WACHTTURM-STUDIUM': 'WACHTTORENSTUDIE',
    'DIENSTVORTRAG': 'DIENSTLEZING', 'GEDÄCHTNISMAHL': 'GEDACHTENISVIERING',
    'Einleitende Worte': 'Inleidende woorden', 'Schlussworte': 'Slotwoorden',
    'Nach geistigen Schätzen graben': 'Geestelijke parels', 'Bibellesung': 'Bijbellezing',
    'Gespräche beginnen': 'Een gesprek beginnen', 'Interesse fördern': 'Belangstelling opwekken',
    'Menschen zu Jüngern machen': 'Discipelen maken', 'Unsere Glaubensansichten erklären': 'Je geloof uitleggen',
    'Vortrag': 'Lezing', 'Versammlungsbibelstudium': 'Gemeentebijbelstudie',
    'Aktuelles': 'Plaatselijke behoeften', 'Besprechung': 'Bespreking',
    'Gebet': 'Gebed', 'Vorsitz': 'Voorzitter', 'Leiter': 'Leider', 'Leser': 'Lezer',
    'Gastredner': 'Gastspreker', 'Redner': 'Spreker', 'Kreisaufseher': 'Kringopziener',
    'Von Haus zu Haus': 'Van huis tot huis', 'Informell': 'Informeel getuigenis', 'In der Öffentlichkeit': 'Openbaar getuigenis',
    'Königreichssaal': 'Koninkrijkszaal',
    'Mikrofone': 'Microfoons', 'Ton / Video': 'Audio/video', 'Ordner / Eingang': 'Zaaldienst', 'Reinigung': 'Schoonmaak',
    'Zoom-Ordner': 'Zoom-zaaldienst', 'Eingangsordner': 'Zaaldienst ingang', 'Saalordner': 'Zaaldienst zaal', 'Dienstvortrag': 'Dienstlezing',
    'Ältester': 'Ouderling', 'Dienstamtgehilfe': 'Dienaar in de bediening', 'Verkündiger': 'Verkondiger', 'Verkündigerin': 'Verkondigster'
  },
  pl: {
    'ERÖFFNUNG': 'ROZPOCZĘCIE', 'ABSCHLUSS': 'ZAKOŃCZENIE',
    'SCHÄTZE AUS GOTTES WORT': 'SKARBY ZE SŁOWA BOŻEGO',
    'UNS IM DIENST VERBESSERN': 'UDOSKONALAJMY SŁUŻBĘ', 'UNSER LEBEN ALS CHRIST': 'CHRZEŚCIJAŃSKI TRYB ŻYCIA',
    'ÖFFENTLICHER VORTRAG': 'WYKŁAD PUBLICZNY', 'WACHTTURM-STUDIUM': 'STUDIUM STRAŻNICY',
    'DIENSTVORTRAG': 'WYKŁAD SŁUŻBOWY', 'GEDÄCHTNISMAHL': 'PAMIĄTKA',
    'Einleitende Worte': 'Słowa wstępne', 'Schlussworte': 'Słowa końcowe',
    'Nach geistigen Schätzen graben': 'Perły duchowe', 'Bibellesung': 'Czytanie Biblii',
    'Gespräche beginnen': 'Rozpoczynanie rozmów', 'Interesse fördern': 'Podtrzymywanie zainteresowania',
    'Menschen zu Jüngern machen': 'Pozyskiwanie uczniów', 'Unsere Glaubensansichten erklären': 'Wyjaśnianie swoich wierzeń',
    'Vortrag': 'Przemówienie', 'Versammlungsbibelstudium': 'Zborowe studium Biblii',
    'Aktuelles': 'Potrzeby zboru', 'Besprechung': 'Omówienie z udziałem obecnych',
    'Gebet': 'Modlitwa', 'Vorsitz': 'Przewodniczący', 'Leiter': 'Prowadzący', 'Leser': 'Lektor',
    'Gastredner': 'Mówca gościnny', 'Redner': 'Mówca', 'Kreisaufseher': 'Nadzorca obwodu',
    'Von Haus zu Haus': 'Od domu do domu', 'Informell': 'Świadczenie nieformalne', 'In der Öffentlichkeit': 'Świadczenie publiczne',
    'Königreichssaal': 'Sala Królestwa',
    'Mikrofone': 'Mikrofony', 'Ton / Video': 'Dźwięk/wideo', 'Ordner / Eingang': 'Porządkowi', 'Reinigung': 'Sprzątanie',
    'Zoom-Ordner': 'Porządkowy Zoom', 'Eingangsordner': 'Porządkowy przy wejściu', 'Saalordner': 'Porządkowy w sali', 'Dienstvortrag': 'Wykład służbowy',
    'Ältester': 'Starszy', 'Dienstamtgehilfe': 'Sługa pomocniczy', 'Verkündiger': 'Głosiciel', 'Verkündigerin': 'Głosicielka'
  },
  ru: {
    'ERÖFFNUNG': 'ВСТУПЛЕНИЕ', 'ABSCHLUSS': 'ЗАКЛЮЧЕНИЕ',
    'SCHÄTZE AUS GOTTES WORT': 'СОКРОВИЩА ИЗ СЛОВА БОГА',
    'UNS IM DIENST VERBESSERN': 'ОТТАЧИВАЕМ НАВЫКИ СЛУЖЕНИЯ', 'UNSER LEBEN ALS CHRIST': 'ХРИСТИАНСКАЯ ЖИЗНЬ',
    'ÖFFENTLICHER VORTRAG': 'ПУБЛИЧНАЯ РЕЧЬ', 'WACHTTURM-STUDIUM': 'ИЗУЧЕНИЕ «СТОРОЖЕВОЙ БАШНИ»',
    'DIENSTVORTRAG': 'РЕЧЬ О СЛУЖЕНИИ', 'GEDÄCHTNISMAHL': 'ВЕЧЕРЯ ВОСПОМИНАНИЯ',
    'Einleitende Worte': 'Вступительные слова', 'Schlussworte': 'Заключительные слова',
    'Nach geistigen Schätzen graben': 'Духовные жемчужины', 'Bibellesung': 'Чтение Библии',
    'Gespräche beginnen': 'Как начинать разговоры', 'Interesse fördern': 'Как поддерживать интерес',
    'Menschen zu Jüngern machen': 'Как подготавливать учеников', 'Unsere Glaubensansichten erklären': 'Как объяснять свои взгляды',
    'Vortrag': 'Речь', 'Versammlungsbibelstudium': 'Изучение Библии в собрании',
    'Aktuelles': 'Местные объявления', 'Besprechung': 'Обсуждение со слушателями',
    'Gebet': 'Молитва', 'Vorsitz': 'Председатель', 'Leiter': 'Ведущий', 'Leser': 'Чтец',
    'Gastredner': 'Приглашённый докладчик', 'Redner': 'Докладчик', 'Kreisaufseher': 'Районный надзиратель',
    'Von Haus zu Haus': 'По домам', 'Informell': 'Неформальное свидетельствование', 'In der Öffentlichkeit': 'Публичное свидетельствование',
    'Königreichssaal': 'Зал Царства',
    'Mikrofone': 'Микрофоны', 'Ton / Video': 'Звук/видео', 'Ordner / Eingang': 'Распорядители', 'Reinigung': 'Уборка',
    'Zoom-Ordner': 'Распорядитель Zoom', 'Eingangsordner': 'Распорядитель у входа', 'Saalordner': 'Распорядитель в зале', 'Dienstvortrag': 'Речь о служении',
    'Ältester': 'Старейшина', 'Dienstamtgehilfe': 'Служебный помощник', 'Verkündiger': 'Возвещатель', 'Verkündigerin': 'Возвещательница'
  },
  uk: {
    'ERÖFFNUNG': 'ВСТУП', 'ABSCHLUSS': 'ЗАКЛЮЧНА ЧАСТИНА',
    'SCHÄTZE AUS GOTTES WORT': 'СКАРБИ БОЖОГО СЛОВА',
    'UNS IM DIENST VERBESSERN': 'УДОСКОНАЛЮЙМОСЯ В СЛУЖІННІ', 'UNSER LEBEN ALS CHRIST': 'ХРИСТИЯНСЬКЕ ЖИТТЯ',
    'ÖFFENTLICHER VORTRAG': 'ПУБЛІЧНА ПРОМОВА', 'WACHTTURM-STUDIUM': 'ВИВЧЕННЯ «ВАРТОВОЇ БАШТИ»',
    'DIENSTVORTRAG': 'ПРОМОВА ПРО СЛУЖІННЯ', 'GEDÄCHTNISMAHL': 'ВЕЧЕРЯ СПОМИНУ',
    'Einleitende Worte': 'Вступні слова', 'Schlussworte': 'Заключні слова',
    'Nach geistigen Schätzen graben': 'Духовні перлини', 'Bibellesung': 'Читання Біблії',
    'Gespräche beginnen': 'Як починати розмови', 'Interesse fördern': 'Як підтримувати зацікавлення',
    'Menschen zu Jüngern machen': 'Як робити учнів', 'Unsere Glaubensansichten erklären': 'Як пояснювати свої погляди',
    'Vortrag': 'Промова', 'Versammlungsbibelstudium': 'Вивчення Біблії у зборі',
    'Aktuelles': 'Місцеві потреби', 'Besprechung': 'Обговорення зі слухачами',
    'Gebet': 'Молитва', 'Vorsitz': 'Головуючий', 'Leiter': 'Ведучий', 'Leser': 'Читець',
    'Gastredner': 'Запрошений промовець', 'Redner': 'Промовець', 'Kreisaufseher': 'Районний наглядач',
    'Von Haus zu Haus': 'Від дому до дому', 'Informell': 'Неформальне свідчення', 'In der Öffentlichkeit': 'Свідчення в громадських місцях',
    'Königreichssaal': 'Зал Царства',
    'Mikrofone': 'Мікрофони', 'Ton / Video': 'Звук/відео', 'Ordner / Eingang': 'Розпорядники', 'Reinigung': 'Прибирання',
    'Zoom-Ordner': 'Розпорядник Zoom', 'Eingangsordner': 'Розпорядник біля входу', 'Saalordner': 'Розпорядник у залі', 'Dienstvortrag': 'Промова про служіння',
    'Ältester': 'Старійшина', 'Dienstamtgehilfe': 'Службовий помічник', 'Verkündiger': 'Вісник', 'Verkündigerin': 'Вісниця'
  },
  ro: {
    'ERÖFFNUNG': 'INTRODUCERE', 'ABSCHLUSS': 'ÎNCHEIERE',
    'SCHÄTZE AUS GOTTES WORT': 'COMORI DIN CUVÂNTUL LUI DUMNEZEU',
    'UNS IM DIENST VERBESSERN': 'SĂ FIM MAI EFICIENȚI ÎN PREDICARE', 'UNSER LEBEN ALS CHRIST': 'VIAȚA DE CREȘTIN',
    'ÖFFENTLICHER VORTRAG': 'CUVÂNTARE PUBLICĂ', 'WACHTTURM-STUDIUM': 'STUDIUL TURNULUI DE VEGHERE',
    'DIENSTVORTRAG': 'CUVÂNTARE DE SERVICIU', 'GEDÄCHTNISMAHL': 'COMEMORAREA',
    'Einleitende Worte': 'Cuvinte de introducere', 'Schlussworte': 'Cuvinte de încheiere',
    'Nach geistigen Schätzen graben': 'Perle spirituale', 'Bibellesung': 'Citirea Bibliei',
    'Gespräche beginnen': 'Inițierea unei conversații', 'Interesse fördern': 'Cultivarea interesului',
    'Menschen zu Jüngern machen': 'Facerea de discipoli', 'Unsere Glaubensansichten erklären': 'Explicarea convingerilor',
    'Vortrag': 'Cuvântare', 'Versammlungsbibelstudium': 'Studiul biblic al congregației',
    'Aktuelles': 'Necesități locale', 'Besprechung': 'Analiză cu auditoriul',
    'Gebet': 'Rugăciune', 'Vorsitz': 'Președinte', 'Leiter': 'Conducător', 'Leser': 'Cititor',
    'Gastredner': 'Vorbitor invitat', 'Redner': 'Vorbitor', 'Kreisaufseher': 'Supraveghetor de circumscripție',
    'Von Haus zu Haus': 'Din casă în casă', 'Informell': 'Mărturie informală', 'In der Öffentlichkeit': 'Mărturie publică',
    'Königreichssaal': 'Sala Regatului',
    'Mikrofone': 'Microfoane', 'Ton / Video': 'Audio/video', 'Ordner / Eingang': 'Uşieri', 'Reinigung': 'Curățenie',
    'Zoom-Ordner': 'Uşier Zoom', 'Eingangsordner': 'Uşier la intrare', 'Saalordner': 'Uşier de sală', 'Dienstvortrag': 'Cuvântare de serviciu',
    'Ältester': 'Bătrân', 'Dienstamtgehilfe': 'Slujitor auxiliar', 'Verkündiger': 'Vestitor', 'Verkündigerin': 'Vestitoare'
  },
  cs: {
    'ERÖFFNUNG': 'ÚVOD', 'ABSCHLUSS': 'ZÁVĚR',
    'SCHÄTZE AUS GOTTES WORT': 'POKLADY Z BOŽÍHO SLOVA',
    'UNS IM DIENST VERBESSERN': 'ZLEPŠUJME SE VE SLUŽBĚ', 'UNSER LEBEN ALS CHRIST': 'KŘESŤANSKÝ ŽIVOT',
    'ÖFFENTLICHER VORTRAG': 'VEŘEJNÝ PROJEV', 'WACHTTURM-STUDIUM': 'STUDIUM STRÁŽNÉ VĚŽE',
    'DIENSTVORTRAG': 'PROJEV KE SLUŽBĚ', 'GEDÄCHTNISMAHL': 'PAMÁTNÁ SLAVNOST',
    'Einleitende Worte': 'Úvodní slova', 'Schlussworte': 'Závěrečná slova',
    'Nach geistigen Schätzen graben': 'Duchovní klenoty', 'Bibellesung': 'Čtení Bible',
    'Gespräche beginnen': 'Zahájení rozhovoru', 'Interesse fördern': 'Pěstování zájmu',
    'Menschen zu Jüngern machen': 'Získávání učedníků', 'Unsere Glaubensansichten erklären': 'Vysvětlení našich názorů',
    'Vortrag': 'Proslov', 'Versammlungsbibelstudium': 'Sborové studium Bible',
    'Aktuelles': 'Místní potřeby', 'Besprechung': 'Rozbor s posluchači',
    'Gebet': 'Modlitba', 'Vorsitz': 'Předsedající', 'Leiter': 'Vedoucí', 'Leser': 'Čtenář',
    'Gastredner': 'Hostující řečník', 'Redner': 'Řečník', 'Kreisaufseher': 'Krajský dozorce',
    'Von Haus zu Haus': 'Dům od domu', 'Informell': 'Neformální svědectví', 'In der Öffentlichkeit': 'Veřejné svědectví',
    'Königreichssaal': 'Sál Království',
    'Mikrofone': 'Mikrofony', 'Ton / Video': 'Zvuk/video', 'Ordner / Eingang': 'Pořadatelé', 'Reinigung': 'Úklid',
    'Zoom-Ordner': 'Pořadatel Zoom', 'Eingangsordner': 'Pořadatel u vchodu', 'Saalordner': 'Pořadatel v sále', 'Dienstvortrag': 'Projev ke službě',
    'Ältester': 'Starší', 'Dienstamtgehilfe': 'Služební pomocník', 'Verkündiger': 'Zvěstovatel', 'Verkündigerin': 'Zvěstovatelka'
  },
  sk: {
    'ERÖFFNUNG': 'ÚVOD', 'ABSCHLUSS': 'ZÁVER',
    'SCHÄTZE AUS GOTTES WORT': 'POKLADY Z BOŽIEHO SLOVA',
    'UNS IM DIENST VERBESSERN': 'ZLEPŠUJME SA V SLUŽBE', 'UNSER LEBEN ALS CHRIST': 'KRESŤANSKÝ ŽIVOT',
    'ÖFFENTLICHER VORTRAG': 'VEREJNÝ PREJAV', 'WACHTTURM-STUDIUM': 'ŠTÚDIUM STRÁŽNEJ VEŽE',
    'DIENSTVORTRAG': 'PREJAV O SLUŽBE', 'GEDÄCHTNISMAHL': 'PAMÄTNÁ SLÁVNOSŤ',
    'Einleitende Worte': 'Úvodné slová', 'Schlussworte': 'Záverečné slová',
    'Nach geistigen Schätzen graben': 'Duchovné klenoty', 'Bibellesung': 'Čítanie Biblie',
    'Gespräche beginnen': 'Začatie rozhovoru', 'Interesse fördern': 'Pestovanie záujmu',
    'Menschen zu Jüngern machen': 'Získavanie učeníkov', 'Unsere Glaubensansichten erklären': 'Vysvetlenie našich názorov',
    'Vortrag': 'Prejav', 'Versammlungsbibelstudium': 'Zborové štúdium Biblie',
    'Aktuelles': 'Miestne potreby', 'Besprechung': 'Rozbor s poslucháčmi',
    'Gebet': 'Modlitba', 'Vorsitz': 'Predsedajúci', 'Leiter': 'Vedúci', 'Leser': 'Čitateľ',
    'Gastredner': 'Hosťujúci rečník', 'Redner': 'Rečník', 'Kreisaufseher': 'Krajský dozorca',
    'Von Haus zu Haus': 'Z domu do domu', 'Informell': 'Neformálne svedectvo', 'In der Öffentlichkeit': 'Verejné svedectvo',
    'Königreichssaal': 'Sála Kráľovstva',
    'Mikrofone': 'Mikrofóny', 'Ton / Video': 'Zvuk/video', 'Ordner / Eingang': 'Usporiadatelia', 'Reinigung': 'Upratovanie',
    'Zoom-Ordner': 'Usporiadateľ Zoom', 'Eingangsordner': 'Usporiadateľ pri vchode', 'Saalordner': 'Usporiadateľ v sále', 'Dienstvortrag': 'Prejav o službe',
    'Ältester': 'Starší', 'Dienstamtgehilfe': 'Služobný pomocník', 'Verkündiger': 'Zvestovateľ', 'Verkündigerin': 'Zvestovateľka'
  },
  hr: {
    'ERÖFFNUNG': 'UVOD', 'ABSCHLUSS': 'ZAKLJUČAK',
    'SCHÄTZE AUS GOTTES WORT': 'BLAGO IZ BOŽJE RIJEČI',
    'UNS IM DIENST VERBESSERN': 'NAPREDUJMO U SLUŽBI', 'UNSER LEBEN ALS CHRIST': 'KRŠĆANSKI ŽIVOT',
    'ÖFFENTLICHER VORTRAG': 'JAVNO PREDAVANJE', 'WACHTTURM-STUDIUM': 'PROUČAVANJE STRAŽARSKE KULE',
    'DIENSTVORTRAG': 'PREDAVANJE O SLUŽBI', 'GEDÄCHTNISMAHL': 'OBILJEŽAVANJE KRISTOVE SMRTI',
    'Einleitende Worte': 'Uvodne riječi', 'Schlussworte': 'Završne riječi',
    'Nach geistigen Schätzen graben': 'Dragulji iz Biblije', 'Bibellesung': 'Čitanje Biblije',
    'Gespräche beginnen': 'Kako započeti razgovor', 'Interesse fördern': 'Kako produbiti zanimanje',
    'Menschen zu Jüngern machen': 'Kako druge učiniti učenicima', 'Unsere Glaubensansichten erklären': 'Kako objasniti svoja vjerovanja',
    'Vortrag': 'Predavanje', 'Versammlungsbibelstudium': 'Skupštinsko proučavanje Biblije',
    'Aktuelles': 'Lokalne potrebe', 'Besprechung': 'Razmatranje s prisutnima',
    'Gebet': 'Molitva', 'Vorsitz': 'Predsjedatelj', 'Leiter': 'Voditelj', 'Leser': 'Čitač',
    'Gastredner': 'Gostujući govornik', 'Redner': 'Govornik', 'Kreisaufseher': 'Pokrajinski nadglednik',
    'Von Haus zu Haus': 'Od kuće do kuće', 'Informell': 'Neformalno svjedočenje', 'In der Öffentlichkeit': 'Javno svjedočenje',
    'Königreichssaal': 'Dvorana Kraljevstva',
    'Mikrofone': 'Mikrofoni', 'Ton / Video': 'Zvuk/video', 'Ordner / Eingang': 'Redari', 'Reinigung': 'Čišćenje',
    'Zoom-Ordner': 'Redar na Zoomu', 'Eingangsordner': 'Redar na ulazu', 'Saalordner': 'Redar u dvorani', 'Dienstvortrag': 'Predavanje o službi',
    'Ältester': 'Starješina', 'Dienstamtgehilfe': 'Sluga pomoćnik', 'Verkündiger': 'Objavitelj', 'Verkündigerin': 'Objaviteljica'
  },
  sr: {
    'ERÖFFNUNG': 'UVOD', 'ABSCHLUSS': 'ZAKLJUČAK',
    'SCHÄTZE AUS GOTTES WORT': 'BLAGO IZ BOŽJE REČI',
    'UNS IM DIENST VERBESSERN': 'NAPREDUJMO U SLUŽBI', 'UNSER LEBEN ALS CHRIST': 'HRIŠĆANSKI ŽIVOT',
    'ÖFFENTLICHER VORTRAG': 'JAVNO PREDAVANJE', 'WACHTTURM-STUDIUM': 'PROUČAVANJE STRAŽARSKE KULE',
    'DIENSTVORTRAG': 'PREDAVANJE O SLUŽBI', 'GEDÄCHTNISMAHL': 'OBELEŽAVANJE HRISTOVE SMRTI',
    'Einleitende Worte': 'Uvodne reči', 'Schlussworte': 'Završne reči',
    'Nach geistigen Schätzen graben': 'Dragulji iz Biblije', 'Bibellesung': 'Čitanje Biblije',
    'Gespräche beginnen': 'Kako započeti razgovor', 'Interesse fördern': 'Kako produbiti interesovanje',
    'Menschen zu Jüngern machen': 'Kako druge učiniti učenicima', 'Unsere Glaubensansichten erklären': 'Kako objasniti svoja verovanja',
    'Vortrag': 'Predavanje', 'Versammlungsbibelstudium': 'Skupštinsko proučavanje Biblije',
    'Aktuelles': 'Lokalne potrebe', 'Besprechung': 'Razmatranje s prisutnima',
    'Gebet': 'Molitva', 'Vorsitz': 'Predsedavajući', 'Leiter': 'Voditelj', 'Leser': 'Čitač',
    'Gastredner': 'Gostujući govornik', 'Redner': 'Govornik', 'Kreisaufseher': 'Pokrajinski nadglednik',
    'Von Haus zu Haus': 'Od kuće do kuće', 'Informell': 'Neformalno svedočenje', 'In der Öffentlichkeit': 'Javno svedočenje',
    'Königreichssaal': 'Dvorana Kraljevstva',
    'Mikrofone': 'Mikrofoni', 'Ton / Video': 'Zvuk/video', 'Ordner / Eingang': 'Redari', 'Reinigung': 'Čišćenje',
    'Zoom-Ordner': 'Redar na Zoomu', 'Eingangsordner': 'Redar na ulazu', 'Saalordner': 'Redar u dvorani', 'Dienstvortrag': 'Predavanje o službi',
    'Ältester': 'Starešina', 'Dienstamtgehilfe': 'Sluga pomoćnik', 'Verkündiger': 'Objavljivač', 'Verkündigerin': 'Objavljivačica'
  },
  bg: {
    'ERÖFFNUNG': 'УВОД', 'ABSCHLUSS': 'ЗАКЛЮЧЕНИЕ',
    'SCHÄTZE AUS GOTTES WORT': 'СЪКРОВИЩА ОТ БОЖИЕТО СЛОВО',
    'UNS IM DIENST VERBESSERN': 'ДА СЛУЖИМ ПО-ДОБРЕ', 'UNSER LEBEN ALS CHRIST': 'ХРИСТИЯНСКИ ЖИВОТ',
    'ÖFFENTLICHER VORTRAG': 'ПУБЛИЧНА РЕЧ', 'WACHTTURM-STUDIUM': 'ИЗУЧАВАНЕ НА „СТРАЖЕВА КУЛА“',
    'DIENSTVORTRAG': 'РЕЧ ЗА СЛУЖБАТА', 'GEDÄCHTNISMAHL': 'ОТБЕЛЯЗВАНЕ НА ХРИСТОВАТА СМЪРТ',
    'Einleitende Worte': 'Встъпителни думи', 'Schlussworte': 'Заключителни думи',
    'Nach geistigen Schätzen graben': 'Духовни бисери', 'Bibellesung': 'Четене на Библията',
    'Gespräche beginnen': 'Как да започваме разговори', 'Interesse fördern': 'Как да поддържаме интереса',
    'Menschen zu Jüngern machen': 'Как да правим ученици', 'Unsere Glaubensansichten erklären': 'Как да обясняваме вярванията си',
    'Vortrag': 'Реч', 'Versammlungsbibelstudium': 'Изучаване на Библията от сбора',
    'Aktuelles': 'Местни нужди', 'Besprechung': 'Обсъждане със слушателите',
    'Gebet': 'Молитва', 'Vorsitz': 'Председател', 'Leiter': 'Водещ', 'Leser': 'Четец',
    'Gastredner': 'Гостуващ оратор', 'Redner': 'Оратор', 'Kreisaufseher': 'Окръжен надзорник',
    'Von Haus zu Haus': 'От къща на къща', 'Informell': 'Неформално свидетелстване', 'In der Öffentlichkeit': 'Публично свидетелстване',
    'Königreichssaal': 'Зала на Царството',
    'Mikrofone': 'Микрофони', 'Ton / Video': 'Звук/видео', 'Ordner / Eingang': 'Разпоредители', 'Reinigung': 'Почистване',
    'Zoom-Ordner': 'Разпоредител в Zoom', 'Eingangsordner': 'Разпоредител на входа', 'Saalordner': 'Разпоредител в залата', 'Dienstvortrag': 'Реч за службата',
    'Ältester': 'Старейшина', 'Dienstamtgehilfe': 'Помощник-служител', 'Verkündiger': 'Вестител', 'Verkündigerin': 'Вестителка'
  },
  hu: {
    'ERÖFFNUNG': 'BEVEZETŐ', 'ABSCHLUSS': 'BEFEJEZÉS',
    'SCHÄTZE AUS GOTTES WORT': 'KINCSEK ISTEN SZAVÁBÓL',
    'UNS IM DIENST VERBESSERN': 'LEGYÜNK ÜGYESEBBEK A SZOLGÁLATBAN', 'UNSER LEBEN ALS CHRIST': 'KERESZTÉNY ÉLETÜNK',
    'ÖFFENTLICHER VORTRAG': 'NYILVÁNOS ELŐADÁS', 'WACHTTURM-STUDIUM': 'ŐRTORONY-TANULMÁNYOZÁS',
    'DIENSTVORTRAG': 'SZOLGÁLATI ELŐADÁS', 'GEDÄCHTNISMAHL': 'EMLÉKÜNNEP',
    'Einleitende Worte': 'Bevezető szavak', 'Schlussworte': 'Záró szavak',
    'Nach geistigen Schätzen graben': 'Szellemi kincsek', 'Bibellesung': 'Bibliaolvasás',
    'Gespräche beginnen': 'Hogyan kezdjünk beszélgetést', 'Interesse fördern': 'Hogyan tápláljuk az érdeklődést',
    'Menschen zu Jüngern machen': 'Hogyan tegyünk tanítvánnyá', 'Unsere Glaubensansichten erklären': 'Hogyan magyarázzuk el a hitünket',
    'Vortrag': 'Előadás', 'Versammlungsbibelstudium': 'Gyülekezeti bibliatanulmányozás',
    'Aktuelles': 'Helyi szükségletek', 'Besprechung': 'Megbeszélés a hallgatósággal',
    'Gebet': 'Ima', 'Vorsitz': 'Elnök', 'Leiter': 'Vezető', 'Leser': 'Felolvasó',
    'Gastredner': 'Vendégelőadó', 'Redner': 'Előadó', 'Kreisaufseher': 'Körzetfelvigyázó',
    'Von Haus zu Haus': 'Házról házra', 'Informell': 'Kötetlen tanúskodás', 'In der Öffentlichkeit': 'Nyilvános tanúskodás',
    'Königreichssaal': 'Királyság-terem',
    'Mikrofone': 'Mikrofonok', 'Ton / Video': 'Hang/videó', 'Ordner / Eingang': 'Rendezők', 'Reinigung': 'Takarítás',
    'Zoom-Ordner': 'Zoom-rendező', 'Eingangsordner': 'Bejárati rendező', 'Saalordner': 'Termi rendező', 'Dienstvortrag': 'Szolgálati előadás',
    'Ältester': 'Vén', 'Dienstamtgehilfe': 'Kisegítőszolga', 'Verkündiger': 'Hírnök', 'Verkündigerin': 'Hírnöknő'
  },
  el: {
    'ERÖFFNUNG': 'ΕΙΣΑΓΩΓΗ', 'ABSCHLUSS': 'ΣΥΜΠΕΡΑΣΜΑ',
    'SCHÄTZE AUS GOTTES WORT': 'ΘΗΣΑΥΡΟΙ ΑΠΟ ΤΟΝ ΛΟΓΟ ΤΟΥ ΘΕΟΥ',
    'UNS IM DIENST VERBESSERN': 'ΑΠΟΤΕΛΕΣΜΑΤΙΚΟΤΗΤΑ ΣΤΗ ΔΙΑΚΟΝΙΑ ΑΓΡΟΥ', 'UNSER LEBEN ALS CHRIST': 'ΠΩΣ ΝΑ ΖΟΥΜΕ ΩΣ ΧΡΙΣΤΙΑΝΟΙ',
    'ÖFFENTLICHER VORTRAG': 'ΔΗΜΟΣΙΑ ΟΜΙΛΙΑ', 'WACHTTURM-STUDIUM': 'ΜΕΛΕΤΗ ΣΚΟΠΙΑΣ',
    'DIENSTVORTRAG': 'ΟΜΙΛΙΑ ΔΙΑΚΟΝΙΑΣ', 'GEDÄCHTNISMAHL': 'ΑΝΑΜΝΗΣΤΙΚΗ ΓΙΟΡΤΗ',
    'Einleitende Worte': 'Εισαγωγικά Σχόλια', 'Schlussworte': 'Τελικά Σχόλια',
    'Nach geistigen Schätzen graben': 'Πνευματικά Πετράδια', 'Bibellesung': 'Ανάγνωση της Αγίας Γραφής',
    'Gespräche beginnen': 'Έναρξη Συζήτησης', 'Interesse fördern': 'Καλλιέργεια Ενδιαφέροντος',
    'Menschen zu Jüngern machen': 'Μαθήτευση', 'Unsere Glaubensansichten erklären': 'Εξήγηση των Πιστεύω μας',
    'Vortrag': 'Ομιλία', 'Versammlungsbibelstudium': 'Εκκλησιαστική Γραφική Μελέτη',
    'Aktuelles': 'Τοπικές Ανάγκες', 'Besprechung': 'Συζήτηση',
    'Gebet': 'Προσευχή', 'Vorsitz': 'Πρόεδρος', 'Leiter': 'Διεξαγωγέας', 'Leser': 'Αναγνώστης',
    'Gastredner': 'Φιλοξενούμενος ομιλητής', 'Redner': 'Ομιλητής', 'Kreisaufseher': 'Επίσκοπος Περιοχής',
    'Von Haus zu Haus': 'Από Σπίτι σε Σπίτι', 'Informell': 'Ανεπίσημη Μαρτυρία', 'In der Öffentlichkeit': 'Δημόσια Μαρτυρία',
    'Königreichssaal': 'Αίθουσα Βασιλείας',
    'Mikrofone': 'Μικρόφωνα', 'Ton / Video': 'Ήχος/βίντεο', 'Ordner / Eingang': 'Ταξιθέτες', 'Reinigung': 'Καθαρισμός',
    'Zoom-Ordner': 'Ταξιθέτης Zoom', 'Eingangsordner': 'Ταξιθέτης εισόδου', 'Saalordner': 'Ταξιθέτης αίθουσας', 'Dienstvortrag': 'Ομιλία διακονίας',
    'Ältester': 'Πρεσβύτερος', 'Dienstamtgehilfe': 'Διακονικός υπηρέτης', 'Verkündiger': 'Ευαγγελιζόμενος', 'Verkündigerin': 'Ευαγγελιζόμενη'
  },
  tr: {
    'ERÖFFNUNG': 'GİRİŞ', 'ABSCHLUSS': 'SONUÇ',
    'SCHÄTZE AUS GOTTES WORT': 'TANRI’NIN SÖZÜNDEKİ DEĞERLER',
    'UNS IM DIENST VERBESSERN': 'HİZMETTE DAHA YETENEKLİ OLALIM', 'UNSER LEBEN ALS CHRIST': 'İSA’NIN TAKİPÇİLERİ OLARAK HAYATIMIZ',
    'ÖFFENTLICHER VORTRAG': 'HALKA AÇIK KONUŞMA', 'WACHTTURM-STUDIUM': 'GÖZCÜ KULESİ TETKİKİ',
    'DIENSTVORTRAG': 'HİZMET KONUŞMASI', 'GEDÄCHTNISMAHL': 'ANMA YEMEĞİ',
    'Einleitende Worte': 'Giriş sözleri', 'Schlussworte': 'Kapanış sözleri',
    'Nach geistigen Schätzen graben': 'Ruhi Cevherler', 'Bibellesung': 'Kutsal Kitap okuması',
    'Gespräche beginnen': 'Sohbet Başlatmak', 'Interesse fördern': 'İlgiyi Geliştirmek',
    'Menschen zu Jüngern machen': 'Öğrenci Yetiştirmek', 'Unsere Glaubensansichten erklären': 'İnançlarımızı Açıklamak',
    'Vortrag': 'Konuşma', 'Versammlungsbibelstudium': 'Cemaat Kutsal Kitap Tetkiki',
    'Aktuelles': 'Yerel İhtiyaçlar', 'Besprechung': 'Dinleyicilerle müzakere',
    'Gebet': 'Dua', 'Vorsitz': 'Başkan', 'Leiter': 'Yönetici', 'Leser': 'Okuyucu',
    'Gastredner': 'Konuk konuşmacı', 'Redner': 'Konuşmacı', 'Kreisaufseher': 'Çevre gözetmeni',
    'Von Haus zu Haus': 'Evden eve', 'Informell': 'Resmi olmayan şahitlik', 'In der Öffentlichkeit': 'Umumi şahitlik',
    'Königreichssaal': 'İbadet Salonu',
    'Mikrofone': 'Mikrofonlar', 'Ton / Video': 'Ses/video', 'Ordner / Eingang': 'Görevliler', 'Reinigung': 'Temizlik',
    'Zoom-Ordner': 'Zoom görevlisi', 'Eingangsordner': 'Giriş görevlisi', 'Saalordner': 'Salon görevlisi', 'Dienstvortrag': 'Hizmet konuşması',
    'Ältester': 'İhtiyar', 'Dienstamtgehilfe': 'Yardımcı hizmetçi', 'Verkündiger': 'Müjdeci', 'Verkündigerin': 'Müjdeci'
  },
  sv: {
    'ERÖFFNUNG': 'INLEDNING', 'ABSCHLUSS': 'AVSLUTNING',
    'SCHÄTZE AUS GOTTES WORT': 'SKATTER FRÅN GUDS ORD',
    'UNS IM DIENST VERBESSERN': 'BLI SKICKLIGARE I TJÄNSTEN', 'UNSER LEBEN ALS CHRIST': 'VÅRT KRISTNA LIV',
    'ÖFFENTLICHER VORTRAG': 'OFFENTLIGT FÖREDRAG', 'WACHTTURM-STUDIUM': 'VAKTTORNSSTUDIET',
    'DIENSTVORTRAG': 'TJÄNSTEFÖREDRAG', 'GEDÄCHTNISMAHL': 'ÅMINNELSEN',
    'Einleitende Worte': 'Inledande ord', 'Schlussworte': 'Avslutande ord',
    'Nach geistigen Schätzen graben': 'Andliga skatter', 'Bibellesung': 'Bibelläsning',
    'Gespräche beginnen': 'Inled ett samtal', 'Interesse fördern': 'Väck intresse',
    'Menschen zu Jüngern machen': 'Gör lärjungar', 'Unsere Glaubensansichten erklären': 'Förklara din tro',
    'Vortrag': 'Föredrag', 'Versammlungsbibelstudium': 'Församlingens bibelstudium',
    'Aktuelles': 'Lokala behov', 'Besprechung': 'Diskussion med åhörarna',
    'Gebet': 'Bön', 'Vorsitz': 'Ordförande', 'Leiter': 'Ledare', 'Leser': 'Läsare',
    'Gastredner': 'Gästtalare', 'Redner': 'Talare', 'Kreisaufseher': 'Kretstillsyningsman',
    'Von Haus zu Haus': 'Hus till hus', 'Informell': 'Informellt vittnande', 'In der Öffentlichkeit': 'Offentligt vittnande',
    'Königreichssaal': 'Rikets sal',
    'Mikrofone': 'Mikrofoner', 'Ton / Video': 'Ljud/video', 'Ordner / Eingang': 'Ordningsvakter', 'Reinigung': 'Städning',
    'Zoom-Ordner': 'Zoom-vakt', 'Eingangsordner': 'Entrévakt', 'Saalordner': 'Salsvakt', 'Dienstvortrag': 'Tjänsteföredrag',
    'Ältester': 'Äldste', 'Dienstamtgehilfe': 'Biträdande tjänare', 'Verkündiger': 'Förkunnare', 'Verkündigerin': 'Förkunnare'
  },
  da: {
    'ERÖFFNUNG': 'INDLEDNING', 'ABSCHLUSS': 'AFSLUTNING',
    'SCHÄTZE AUS GOTTES WORT': 'SKATTE FRA GUDS ORD',
    'UNS IM DIENST VERBESSERN': 'BLIV BEDRE TIL AT FORKYNDE', 'UNSER LEBEN ALS CHRIST': 'VORES KRISTNE LIV',
    'ÖFFENTLICHER VORTRAG': 'OFFENTLIGT FOREDRAG', 'WACHTTURM-STUDIUM': 'VAGTTÅRNSSTUDIET',
    'DIENSTVORTRAG': 'TJENESTEFOREDRAG', 'GEDÄCHTNISMAHL': 'MINDEHØJTIDEN',
    'Einleitende Worte': 'Indledende ord', 'Schlussworte': 'Afsluttende ord',
    'Nach geistigen Schätzen graben': 'Åndelige perler', 'Bibellesung': 'Bibellæsning',
    'Gespräche beginnen': 'Indled en samtale', 'Interesse fördern': 'Vær med til at nære interessen',
    'Menschen zu Jüngern machen': 'Gør disciple', 'Unsere Glaubensansichten erklären': 'Forklar din tro',
    'Vortrag': 'Foredrag', 'Versammlungsbibelstudium': 'Menighedens bibelstudium',
    'Aktuelles': 'Lokale behov', 'Besprechung': 'Drøftelse med tilhørerne',
    'Gebet': 'Bøn', 'Vorsitz': 'Ordstyrer', 'Leiter': 'Leder', 'Leser': 'Oplæser',
    'Gastredner': 'Gæstetaler', 'Redner': 'Taler', 'Kreisaufseher': 'Kredstilsynsmand',
    'Von Haus zu Haus': 'Hus til hus', 'Informell': 'Uformel forkyndelse', 'In der Öffentlichkeit': 'Offentlig forkyndelse',
    'Königreichssaal': 'Rigssal',
    'Mikrofone': 'Mikrofoner', 'Ton / Video': 'Lyd/video', 'Ordner / Eingang': 'Ordensvagter', 'Reinigung': 'Rengøring',
    'Zoom-Ordner': 'Zoom-vagt', 'Eingangsordner': 'Indgangsvagt', 'Saalordner': 'Salvagt', 'Dienstvortrag': 'Tjenesteforedrag',
    'Ältester': 'Ældste', 'Dienstamtgehilfe': 'Menighedstjener', 'Verkündiger': 'Forkynder', 'Verkündigerin': 'Forkynder'
  },
  fi: {
    'ERÖFFNUNG': 'JOHDANTO', 'ABSCHLUSS': 'LOPETUS',
    'SCHÄTZE AUS GOTTES WORT': 'AARTEITA JUMALAN SANASTA',
    'UNS IM DIENST VERBESSERN': 'PARANNA TAITOJASI KENTTÄPALVELUKSESSA', 'UNSER LEBEN ALS CHRIST': 'KRISTITTYNÄ ELÄMINEN',
    'ÖFFENTLICHER VORTRAG': 'JULKINEN PUHE', 'WACHTTURM-STUDIUM': 'VARTIOTORNIN TUTKISTELU',
    'DIENSTVORTRAG': 'PALVELUSPUHE', 'GEDÄCHTNISMAHL': 'MUISTONVIETTO',
    'Einleitende Worte': 'Alkusanat', 'Schlussworte': 'Loppusanat',
    'Nach geistigen Schätzen graben': 'Hengellisiä timantteja', 'Bibellesung': 'Raamatunluku',
    'Gespräche beginnen': 'Keskustelun aloittaminen', 'Interesse fördern': 'Kiinnostuksen ylläpitäminen',
    'Menschen zu Jüngern machen': 'Opetuslapseksi tekeminen', 'Unsere Glaubensansichten erklären': 'Uskonkäsitystemme selittäminen',
    'Vortrag': 'Puhe', 'Versammlungsbibelstudium': 'Seurakunnan raamatuntutkistelu',
    'Aktuelles': 'Paikalliset tarpeet', 'Besprechung': 'Keskustelu kuulijoiden kanssa',
    'Gebet': 'Rukous', 'Vorsitz': 'Puheenjohtaja', 'Leiter': 'Johtaja', 'Leser': 'Lukija',
    'Gastredner': 'Vieraileva puhuja', 'Redner': 'Puhuja', 'Kreisaufseher': 'Kierrosvalvoja',
    'Von Haus zu Haus': 'Ovelta ovelle', 'Informell': 'Epävirallinen todistaminen', 'In der Öffentlichkeit': 'Julkinen todistaminen',
    'Königreichssaal': 'Valtakunnansali',
    'Mikrofone': 'Mikrofonit', 'Ton / Video': 'Ääni/video', 'Ordner / Eingang': 'Järjestyksenvalvojat', 'Reinigung': 'Siivous',
    'Zoom-Ordner': 'Zoom-valvoja', 'Eingangsordner': 'Sisäänkäynnin valvoja', 'Saalordner': 'Salin valvoja', 'Dienstvortrag': 'Palveluspuhe',
    'Ältester': 'Vanhin', 'Dienstamtgehilfe': 'Avustava palvelija', 'Verkündiger': 'Julistaja', 'Verkündigerin': 'Julistaja'
  },
  no: {
    'ERÖFFNUNG': 'INNLEDNING', 'ABSCHLUSS': 'AVSLUTNING',
    'SCHÄTZE AUS GOTTES WORT': 'SKATTER FRA GUDS ORD',
    'UNS IM DIENST VERBESSERN': 'BLI FLINKERE I TJENESTEN', 'UNSER LEBEN ALS CHRIST': 'VÅRT KRISTNE LIV',
    'ÖFFENTLICHER VORTRAG': 'OFFENTLIG FOREDRAG', 'WACHTTURM-STUDIUM': 'VAKTTÅRN-STUDIET',
    'DIENSTVORTRAG': 'TJENESTEFOREDRAG', 'GEDÄCHTNISMAHL': 'MINNEHØYTIDEN',
    'Einleitende Worte': 'Innledende ord', 'Schlussworte': 'Avsluttende ord',
    'Nach geistigen Schätzen graben': 'Åndelige perler', 'Bibellesung': 'Bibellesning',
    'Gespräche beginnen': 'Innled en samtale', 'Interesse fördern': 'Vekk interesse',
    'Menschen zu Jüngern machen': 'Gjør disipler', 'Unsere Glaubensansichten erklären': 'Forklar troen din',
    'Vortrag': 'Foredrag', 'Versammlungsbibelstudium': 'Menighetens bibelstudium',
    'Aktuelles': 'Lokale behov', 'Besprechung': 'Drøftelse med tilhørerne',
    'Gebet': 'Bønn', 'Vorsitz': 'Ordstyrer', 'Leiter': 'Leder', 'Leser': 'Oppleser',
    'Gastredner': 'Gjestetaler', 'Redner': 'Taler', 'Kreisaufseher': 'Kretstilsynsmann',
    'Von Haus zu Haus': 'Hus til hus', 'Informell': 'Uformelt vitnearbeid', 'In der Öffentlichkeit': 'Offentlig vitnearbeid',
    'Königreichssaal': 'Rikets sal',
    'Mikrofone': 'Mikrofoner', 'Ton / Video': 'Lyd/video', 'Ordner / Eingang': 'Ordensvakter', 'Reinigung': 'Rengjøring',
    'Zoom-Ordner': 'Zoom-vakt', 'Eingangsordner': 'Inngangsvakt', 'Saalordner': 'Salvakt', 'Dienstvortrag': 'Tjenesteforedrag',
    'Ältester': 'Eldste', 'Dienstamtgehilfe': 'Menighetstjener', 'Verkündiger': 'Forkynner', 'Verkündigerin': 'Forkynner'
  },
  id: {
    'ERÖFFNUNG': 'PEMBUKA', 'ABSCHLUSS': 'PENUTUP',
    'SCHÄTZE AUS GOTTES WORT': 'HARTA DARI FIRMAN ALLAH',
    'UNS IM DIENST VERBESSERN': 'TINGKATKAN KEMAMPUAN DINAS', 'UNSER LEBEN ALS CHRIST': 'KEHIDUPAN KRISTEN',
    'ÖFFENTLICHER VORTRAG': 'KHOTBAH UMUM', 'WACHTTURM-STUDIUM': 'PELAJARAN MENARA PENGAWAL',
    'DIENSTVORTRAG': 'KHOTBAH DINAS', 'GEDÄCHTNISMAHL': 'PERINGATAN',
    'Einleitende Worte': 'Kata pengantar', 'Schlussworte': 'Kata penutup',
    'Nach geistigen Schätzen graben': 'Permata Rohani', 'Bibellesung': 'Pembacaan Alkitab',
    'Gespräche beginnen': 'Memulai Percakapan', 'Interesse fördern': 'Menumbuhkan Minat',
    'Menschen zu Jüngern machen': 'Membuat Murid', 'Unsere Glaubensansichten erklären': 'Menjelaskan Keyakinan',
    'Vortrag': 'Khotbah', 'Versammlungsbibelstudium': 'Pelajaran Alkitab Sidang',
    'Aktuelles': 'Kebutuhan Setempat', 'Besprechung': 'Pembahasan dengan hadirin',
    'Gebet': 'Doa', 'Vorsitz': 'Ketua', 'Leiter': 'Pemandu', 'Leser': 'Pembaca',
    'Gastredner': 'Pembicara tamu', 'Redner': 'Pembicara', 'Kreisaufseher': 'Pengawas Wilayah',
    'Von Haus zu Haus': 'Dari rumah ke rumah', 'Informell': 'Kesaksian informal', 'In der Öffentlichkeit': 'Kesaksian umum',
    'Königreichssaal': 'Balai Kerajaan',
    'Mikrofone': 'Mikrofon', 'Ton / Video': 'Audio/video', 'Ordner / Eingang': 'Petugas', 'Reinigung': 'Kebersihan',
    'Zoom-Ordner': 'Petugas Zoom', 'Eingangsordner': 'Petugas pintu', 'Saalordner': 'Petugas ruang', 'Dienstvortrag': 'Khotbah dinas',
    'Ältester': 'Penatua', 'Dienstamtgehilfe': 'Hamba pelayanan', 'Verkündiger': 'Penyiar', 'Verkündigerin': 'Penyiar'
  },
  tl: {
    'ERÖFFNUNG': 'PAMBUNGAD', 'ABSCHLUSS': 'PANGWAKAS',
    'SCHÄTZE AUS GOTTES WORT': 'KAYAMANAN MULA SA SALITA NG DIYOS',
    'UNS IM DIENST VERBESSERN': 'MAGPAKAHUSAY SA MINISTERYO', 'UNSER LEBEN ALS CHRIST': 'PAMUMUHAY BILANG KRISTIYANO',
    'ÖFFENTLICHER VORTRAG': 'PAHAYAG PANGMADLA', 'WACHTTURM-STUDIUM': 'PAG-AARAL SA BANTAYAN',
    'DIENSTVORTRAG': 'PAHAYAG SA PAGLILINGKOD', 'GEDÄCHTNISMAHL': 'MEMORYAL',
    'Einleitende Worte': 'Pambungad na mga salita', 'Schlussworte': 'Pangwakas na mga salita',
    'Nach geistigen Schätzen graben': 'Mga Hiyas Espirituwal', 'Bibellesung': 'Pagbabasa ng Bibliya',
    'Gespräche beginnen': 'Pagsisimula ng Pag-uusap', 'Interesse fördern': 'Pagpapatibay ng Interes',
    'Menschen zu Jüngern machen': 'Paggawa ng Alagad', 'Unsere Glaubensansichten erklären': 'Pagpapaliwanag ng Paniniwala',
    'Vortrag': 'Pahayag', 'Versammlungsbibelstudium': 'Pag-aaral ng Kongregasyon sa Bibliya',
    'Aktuelles': 'Lokal na Pangangailangan', 'Besprechung': 'Pagtalakay sa mga tagapakinig',
    'Gebet': 'Panalangin', 'Vorsitz': 'Tsirman', 'Leiter': 'Konduktor', 'Leser': 'Mambabasa',
    'Gastredner': 'Panauhing tagapagsalita', 'Redner': 'Tagapagsalita', 'Kreisaufseher': 'Tagapangasiwa ng Sirkito',
    'Von Haus zu Haus': 'Bahay-bahay', 'Informell': 'Impormal na pagpapatotoo', 'In der Öffentlichkeit': 'Pampublikong pagpapatotoo',
    'Königreichssaal': 'Kingdom Hall',
    'Mikrofone': 'Mga Mikropono', 'Ton / Video': 'Audio/video', 'Ordner / Eingang': 'Mga Attendant', 'Reinigung': 'Paglilinis',
    'Zoom-Ordner': 'Attendant sa Zoom', 'Eingangsordner': 'Attendant sa pinto', 'Saalordner': 'Attendant sa hall', 'Dienstvortrag': 'Pahayag sa paglilingkod',
    'Ältester': 'Elder', 'Dienstamtgehilfe': 'Ministeryal na lingkod', 'Verkündiger': 'Mamamahayag', 'Verkündigerin': 'Mamamahayag'
  },
  vi: {
    'ERÖFFNUNG': 'MỞ ĐẦU', 'ABSCHLUSS': 'KẾT THÚC',
    'SCHÄTZE AUS GOTTES WORT': 'KHO BÁU TỪ LỜI ĐỨC CHÚA TRỜI',
    'UNS IM DIENST VERBESSERN': 'CẢI THIỆN THÁNH CHỨC', 'UNSER LEBEN ALS CHRIST': 'ĐỜI SỐNG TÍN ĐỒ',
    'ÖFFENTLICHER VORTRAG': 'BÀI GIẢNG CÔNG CỘNG', 'WACHTTURM-STUDIUM': 'HỌC THÁP CANH',
    'DIENSTVORTRAG': 'BÀI GIẢNG VỀ THÁNH CHỨC', 'GEDÄCHTNISMAHL': 'LỄ TƯỞNG NIỆM',
    'Einleitende Worte': 'Lời mở đầu', 'Schlussworte': 'Lời kết thúc',
    'Nach geistigen Schätzen graben': 'Tìm ngọc quý thiêng liêng', 'Bibellesung': 'Đọc Kinh Thánh',
    'Gespräche beginnen': 'Bắt chuyện', 'Interesse fördern': 'Vun trồng sự chú ý',
    'Menschen zu Jüngern machen': 'Đào tạo môn đồ', 'Unsere Glaubensansichten erklären': 'Giải thích niềm tin',
    'Vortrag': 'Bài giảng', 'Versammlungsbibelstudium': 'Học Kinh Thánh của hội thánh',
    'Aktuelles': 'Nhu cầu địa phương', 'Besprechung': 'Thảo luận với cử tọa',
    'Gebet': 'Cầu nguyện', 'Vorsitz': 'Chủ tọa', 'Leiter': 'Người điều khiển', 'Leser': 'Người đọc',
    'Gastredner': 'Diễn giả khách', 'Redner': 'Diễn giả', 'Kreisaufseher': 'Giám thị vòng quanh',
    'Von Haus zu Haus': 'Từng nhà', 'Informell': 'Làm chứng bán chính thức', 'In der Öffentlichkeit': 'Làm chứng nơi công cộng',
    'Königreichssaal': 'Phòng Nước Trời',
    'Mikrofone': 'Micro', 'Ton / Video': 'Âm thanh/video', 'Ordner / Eingang': 'Trật tự viên', 'Reinigung': 'Vệ sinh',
    'Zoom-Ordner': 'Trật tự viên Zoom', 'Eingangsordner': 'Trật tự viên cửa', 'Saalordner': 'Trật tự viên phòng', 'Dienstvortrag': 'Bài giảng về thánh chức',
    'Ältester': 'Trưởng lão', 'Dienstamtgehilfe': 'Phụ tá hội thánh', 'Verkündiger': 'Người công bố', 'Verkündigerin': 'Người công bố'
  },
  sw: {
    'ERÖFFNUNG': 'UTANGULIZI', 'ABSCHLUSS': 'HITIMISHO',
    'SCHÄTZE AUS GOTTES WORT': 'HAZINA ZA NENO LA MUNGU',
    'UNS IM DIENST VERBESSERN': 'KUWA STADI KATIKA HUDUMA', 'UNSER LEBEN ALS CHRIST': 'MAISHA YETU YA KIKRISTO',
    'ÖFFENTLICHER VORTRAG': 'HOTUBA YA WATU WOTE', 'WACHTTURM-STUDIUM': 'FUNZO LA MNARA WA MLINZI',
    'DIENSTVORTRAG': 'HOTUBA YA HUDUMA', 'GEDÄCHTNISMAHL': 'UKUMBUSHO',
    'Einleitende Worte': 'Maneno ya utangulizi', 'Schlussworte': 'Maneno ya kuhitimisha',
    'Nach geistigen Schätzen graben': 'Vito vya Kiroho', 'Bibellesung': 'Usomaji wa Biblia',
    'Gespräche beginnen': 'Kuanzisha Mazungumzo', 'Interesse fördern': 'Kukuza Upendezi',
    'Menschen zu Jüngern machen': 'Kufanya Wanafunzi', 'Unsere Glaubensansichten erklären': 'Kueleza Imani Yetu',
    'Vortrag': 'Hotuba', 'Versammlungsbibelstudium': 'Funzo la Biblia la Kutaniko',
    'Aktuelles': 'Mahitaji ya Kienyeji', 'Besprechung': 'Mazungumzo na wasikilizaji',
    'Gebet': 'Sala', 'Vorsitz': 'Mwenyekiti', 'Leiter': 'Kiongozi', 'Leser': 'Msomaji',
    'Gastredner': 'Msemaji mgeni', 'Redner': 'Msemaji', 'Kreisaufseher': 'Mwangalizi wa Mzunguko',
    'Von Haus zu Haus': 'Nyumba kwa nyumba', 'Informell': 'Kutoa ushahidi isivyo rasmi', 'In der Öffentlichkeit': 'Kutoa ushahidi hadharani',
    'Königreichssaal': 'Jumba la Ufalme',
    'Mikrofone': 'Maikrofoni', 'Ton / Video': 'Sauti/video', 'Ordner / Eingang': 'Wasimamizi', 'Reinigung': 'Usafi',
    'Zoom-Ordner': 'Msimamizi wa Zoom', 'Eingangsordner': 'Msimamizi wa mlango', 'Saalordner': 'Msimamizi wa jumba', 'Dienstvortrag': 'Hotuba ya huduma',
    'Ältester': 'Mzee', 'Dienstamtgehilfe': 'Mtumishi wa huduma', 'Verkündiger': 'Mhubiri', 'Verkündigerin': 'Mhubiri'
  },
  zh: {
    'ERÖFFNUNG': '开场', 'ABSCHLUSS': '结束',
    'SCHÄTZE AUS GOTTES WORT': '上帝话语的宝藏',
    'UNS IM DIENST VERBESSERN': '在传道上精益求精', 'UNSER LEBEN ALS CHRIST': '基督徒的生活',
    'ÖFFENTLICHER VORTRAG': '公众演讲', 'WACHTTURM-STUDIUM': '《守望台》研究',
    'DIENSTVORTRAG': '服务演讲', 'GEDÄCHTNISMAHL': '受难纪念',
    'Einleitende Worte': '开场白', 'Schlussworte': '结束语',
    'Nach geistigen Schätzen graben': '灵粮集锦', 'Bibellesung': '读经',
    'Gespräche beginnen': '展开话题', 'Interesse fördern': '培养兴趣',
    'Menschen zu Jüngern machen': '促成门徒', 'Unsere Glaubensansichten erklären': '解释信仰',
    'Vortrag': '演讲', 'Versammlungsbibelstudium': '会众研经班',
    'Aktuelles': '本地需要', 'Besprechung': '与听众讨论',
    'Gebet': '祷告', 'Vorsitz': '主持', 'Leiter': '主持人', 'Leser': '朗读者',
    'Gastredner': '客座讲者', 'Redner': '讲者', 'Kreisaufseher': '分区监督',
    'Von Haus zu Haus': '逐户传道', 'Informell': '非正式见证', 'In der Öffentlichkeit': '公众场所见证',
    'Königreichssaal': '王国聚会所',
    'Mikrofone': '话筒', 'Ton / Video': '音响/视频', 'Ordner / Eingang': '招待员', 'Reinigung': '清洁',
    'Zoom-Ordner': 'Zoom招待员', 'Eingangsordner': '入口招待员', 'Saalordner': '会场招待员', 'Dienstvortrag': '服务演讲',
    'Ältester': '长老', 'Dienstamtgehilfe': '助理仆人', 'Verkündiger': '传道员', 'Verkündigerin': '传道员'
  },
  ja: {
    'ERÖFFNUNG': '開会', 'ABSCHLUSS': '結び',
    'SCHÄTZE AUS GOTTES WORT': '神の言葉の宝',
    'UNS IM DIENST VERBESSERN': '宣教に工夫を', 'UNSER LEBEN ALS CHRIST': 'クリスチャンとして生きる',
    'ÖFFENTLICHER VORTRAG': '公開講演', 'WACHTTURM-STUDIUM': 'ものみの塔研究',
    'DIENSTVORTRAG': '奉仕の話', 'GEDÄCHTNISMAHL': '記念式',
    'Einleitende Worte': '開会の言葉', 'Schlussworte': '結びの言葉',
    'Nach geistigen Schätzen graben': '霊的な宝', 'Bibellesung': '聖書朗読',
    'Gespräche beginnen': '話を始める', 'Interesse fördern': '関心を育てる',
    'Menschen zu Jüngern machen': '弟子を作る', 'Unsere Glaubensansichten erklären': '信仰を説明する',
    'Vortrag': '話', 'Versammlungsbibelstudium': '会衆聖書研究',
    'Aktuelles': '地元の必要', 'Besprechung': '聴衆との討議',
    'Gebet': '祈り', 'Vorsitz': '司会', 'Leiter': '司会者', 'Leser': '朗読者',
    'Gastredner': '客演者', 'Redner': '話し手', 'Kreisaufseher': '巡回監督',
    'Von Haus zu Haus': '家から家', 'Informell': '非公式の証言', 'In der Öffentlichkeit': '公共の場所での証言',
    'Königreichssaal': '王国会館',
    'Mikrofone': 'マイク', 'Ton / Video': '音響/映像', 'Ordner / Eingang': '案内係', 'Reinigung': '清掃',
    'Zoom-Ordner': 'Zoom案内係', 'Eingangsordner': '入り口案内係', 'Saalordner': '会場案内係', 'Dienstvortrag': '奉仕の話',
    'Ältester': '長老', 'Dienstamtgehilfe': '奉仕の僕', 'Verkündiger': '伝道者', 'Verkündigerin': '伝道者'
  },
  ko: {
    'ERÖFFNUNG': '시작', 'ABSCHLUSS': '마침',
    'SCHÄTZE AUS GOTTES WORT': '하느님의 말씀에 담긴 보물',
    'UNS IM DIENST VERBESSERN': '전도 방법을 개선하기', 'UNSER LEBEN ALS CHRIST': '그리스도인의 생활',
    'ÖFFENTLICHER VORTRAG': '공개 연설', 'WACHTTURM-STUDIUM': '파수대 연구',
    'DIENSTVORTRAG': '봉사 연설', 'GEDÄCHTNISMAHL': '기념식',
    'Einleitende Worte': '여는 말', 'Schlussworte': '맺는말',
    'Nach geistigen Schätzen graben': '영적 보석', 'Bibellesung': '성경 낭독',
    'Gespräche beginnen': '대화 시작하기', 'Interesse fördern': '관심 키우기',
    'Menschen zu Jüngern machen': '제자 삼기', 'Unsere Glaubensansichten erklären': '신앙 설명하기',
    'Vortrag': '연설', 'Versammlungsbibelstudium': '회중 성서 연구',
    'Aktuelles': '지역 필요', 'Besprechung': '청중과의 토의',
    'Gebet': '기도', 'Vorsitz': '사회', 'Leiter': '사회자', 'Leser': '낭독자',
    'Gastredner': '방문 연사', 'Redner': '연사', 'Kreisaufseher': '순회 감독자',
    'Von Haus zu Haus': '호별 전도', 'Informell': '비공식 증거', 'In der Öffentlichkeit': '공개적 증거',
    'Königreichssaal': '왕국회관',
    'Mikrofone': '마이크', 'Ton / Video': '음향/영상', 'Ordner / Eingang': '안내', 'Reinigung': '청소',
    'Zoom-Ordner': 'Zoom 안내', 'Eingangsordner': '입구 안내', 'Saalordner': '회관 안내', 'Dienstvortrag': '봉사 연설',
    'Ältester': '장로', 'Dienstamtgehilfe': '봉사의 종', 'Verkündiger': '전도인', 'Verkündigerin': '전도인'
  }
};

// --- Wochenend-Vorlage-Atome (unsere eigenen Strings, nicht von jw.org) -------
// Werden je Sprache in FRAG eingespeist, damit makeTr sie beim Anzeigen der
// (kanonisch deutschen) Wochenend-Vorlage in die Versammlungssprache übersetzt.
// „Lied“ (ohne Nummer) fehlte als Atom für zusammengesetzte Titel wie
// „Schlussworte · Lied · Gebet“. Die beiden Platzhalter erscheinen als
// editierbarer Titel, solange nichts eingetragen ist.
const SONG_WORD: Record<string, string> = {
  en: 'Song', es: 'Canción', fr: 'Cantique', it: 'Cantico', pt: 'Cântico',
  nl: 'Lied', pl: 'Pieśń', ru: 'Песня', uk: 'Пісня', ro: 'Cântarea',
  cs: 'Píseň', sk: 'Pieseň', hr: 'Pjesma', sr: 'Pesma', bg: 'Песен',
  hu: 'Ének', el: 'Ύμνος', tr: 'İlahi', sv: 'Sång', da: 'Sang', fi: 'Laulu',
  no: 'Sang', id: 'Lagu', tl: 'Awit', vi: 'Bài hát', sw: 'Wimbo',
  zh: '歌', ja: '歌', ko: '노래', ar: 'الترنيمة',
}
const TALK_PLACEHOLDER: Record<string, string> = {
  en: '(enter talk title)', es: '(indique el tema del discurso)', fr: '(indiquer le thème du discours)',
  it: '(inserire il tema del discorso)', pt: '(inserir o tema do discurso)', nl: '(lezingthema invullen)',
  pl: '(wpisz temat wykładu)', ru: '(укажите тему речи)', uk: '(вкажіть тему промови)',
  ro: '(introduceți tema cuvântării)', cs: '(zadejte téma proslovu)', sk: '(zadajte tému prejavu)',
  hr: '(upišite temu predavanja)', sr: '(unesite temu predavanja)', bg: '(въведете темата на речта)',
  hu: '(add meg az előadás témáját)', el: '(καταχωρίστε το θέμα της ομιλίας)', tr: '(konuşma konusunu girin)',
  sv: '(ange talets tema)', da: '(angiv foredragets emne)', fi: '(kirjoita puheen aihe)',
  no: '(angi talens tema)', id: '(masukkan tema khotbah)', tl: '(ilagay ang tema ng pahayag)',
  vi: '(nhập chủ đề bài giảng)', sw: '(weka mada ya hotuba)',
  zh: '(输入演讲主题)', ja: '(講演の題を入力)', ko: '(공개 강연 제목 입력)', ar: '(أدخل موضوع الخطاب)',
}
const STUDY_PLACEHOLDER: Record<string, string> = {
  en: '(enter study article)', es: '(indique el artículo de estudio)', fr: '(indiquer l’article d’étude)',
  it: '(inserire l’articolo di studio)', pt: '(inserir o artigo de estudo)', nl: '(studieartikel invullen)',
  pl: '(wpisz artykuł do studium)', ru: '(укажите статью для изучения)', uk: '(вкажіть статтю для вивчення)',
  ro: '(introduceți articolul de studiu)', cs: '(zadejte studijní článek)', sk: '(zadajte študijný článok)',
  hr: '(upišite članak za razmatranje)', sr: '(unesite članak za razmatranje)', bg: '(въведете статията за изучаване)',
  hu: '(add meg a tanulmányozási cikket)', el: '(καταχωρίστε το άρθρο μελέτης)', tr: '(tetkik makalesini girin)',
  sv: '(ange studieartikeln)', da: '(angiv studieartiklen)', fi: '(kirjoita tutkittava artikkeli)',
  no: '(angi studieartikkelen)', id: '(masukkan artikel pelajaran)', tl: '(ilagay ang artikulo sa pag-aaral)',
  vi: '(nhập bài học)', sw: '(weka makala ya funzo)',
  zh: '(输入研究文章)', ja: '(研究記事を入力)', ko: '(연구 기사 입력)', ar: '(أدخل مقالة الدرس)',
}
for (const code of Object.keys(FRAG)) {
  const f = FRAG[code]
  if (SONG_WORD[code]) f['Lied'] = SONG_WORD[code]
  if (TALK_PLACEHOLDER[code]) f['(Vortragsthema eintragen)'] = TALK_PLACEHOLDER[code]
  if (STUDY_PLACEHOLDER[code]) f['(Studienartikel eintragen)'] = STUDY_PLACEHOLDER[code]
}

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
const EXTRA: Record<string, Extra> = {
  ar: { song: n => 'الترنيمة ' + n, min: n => n + ' دقيقة', ca: r => 'حوالي ' + r, ende: r => 'ينتهي حوالي ' + r, mit: x => 'مع ' + x, tage: n => 'خلال ' + n + ' أيام', zut: n => n + ' تعيينات' },
  it: { song: n => 'Cantico ' + n, min: n => n + ' min', ca: r => 'circa ' + r, ende: r => 'Fine circa ' + r, mit: x => 'con ' + x, tage: n => 'tra ' + n + ' giorni', zut: n => n + ' incarichi' },
  pt: { song: n => 'Cântico ' + n, min: n => n + ' min', ca: r => 'aprox. ' + r, ende: r => 'Fim aprox. ' + r, mit: x => 'com ' + x, tage: n => 'em ' + n + ' dias', zut: n => n + ' designações' },
  nl: { song: n => 'Lied ' + n, min: n => n + ' min.', ca: r => 'ca. ' + r, ende: r => 'Einde ca. ' + r, mit: x => 'met ' + x, tage: n => 'over ' + n + ' dagen', zut: n => n + ' toewijzingen' },
  pl: { song: n => 'Pieśń ' + n, min: n => n + ' min', ca: r => 'ok. ' + r, ende: r => 'Koniec ok. ' + r, mit: x => 'z ' + x, tage: n => 'za ' + n + ' dni', zut: n => n + ' zadań' },
  ru: { song: n => 'Песня ' + n, min: n => n + ' мин.', ca: r => 'ок. ' + r, ende: r => 'Конец ок. ' + r, mit: x => 'с ' + x, tage: n => 'через ' + n + ' дн.', zut: n => n + ' назначений' },
  uk: { song: n => 'Пісня ' + n, min: n => n + ' хв.', ca: r => 'бл. ' + r, ende: r => 'Кінець бл. ' + r, mit: x => 'з ' + x, tage: n => 'через ' + n + ' дн.', zut: n => n + ' призначень' },
  ro: { song: n => 'Cântarea ' + n, min: n => n + ' min', ca: r => 'aprox. ' + r, ende: r => 'Sfârșit aprox. ' + r, mit: x => 'cu ' + x, tage: n => 'peste ' + n + ' zile', zut: n => n + ' însărcinări' },
  cs: { song: n => 'Píseň ' + n, min: n => n + ' min', ca: r => 'cca ' + r, ende: r => 'Konec cca ' + r, mit: x => 's ' + x, tage: n => 'za ' + n + ' dní', zut: n => n + ' úkolů' },
  sk: { song: n => 'Pieseň ' + n, min: n => n + ' min', ca: r => 'cca ' + r, ende: r => 'Koniec cca ' + r, mit: x => 's ' + x, tage: n => 'o ' + n + ' dní', zut: n => n + ' úloh' },
  hr: { song: n => 'Pjesma ' + n, min: n => n + ' min', ca: r => 'oko ' + r, ende: r => 'Kraj oko ' + r, mit: x => 's ' + x, tage: n => 'za ' + n + ' dana', zut: n => n + ' zadataka' },
  sr: { song: n => 'Pesma ' + n, min: n => n + ' min', ca: r => 'oko ' + r, ende: r => 'Kraj oko ' + r, mit: x => 'sa ' + x, tage: n => 'za ' + n + ' dana', zut: n => n + ' zaduženja' },
  bg: { song: n => 'Песен ' + n, min: n => n + ' мин', ca: r => 'ок. ' + r, ende: r => 'Край ок. ' + r, mit: x => 'с ' + x, tage: n => 'след ' + n + ' дни', zut: n => n + ' назначения' },
  hu: { song: n => n + '. ének', min: n => n + ' perc', ca: r => 'kb. ' + r, ende: r => 'Vége kb. ' + r, mit: x => x + ' (társ)', tage: n => n + ' nap múlva', zut: n => n + ' feladat' },
  el: { song: n => 'Ύμνος ' + n, min: n => n + ' λεπτά', ca: r => 'περ. ' + r, ende: r => 'Τέλος περ. ' + r, mit: x => 'με ' + x, tage: n => 'σε ' + n + ' ημέρες', zut: n => n + ' αναθέσεις' },
  tr: { song: n => n + '. ilahi', min: n => n + ' dk', ca: r => 'yaklaşık ' + r, ende: r => 'Bitiş yaklaşık ' + r, mit: x => x + ' ile', tage: n => n + ' gün sonra', zut: n => n + ' görev' },
  sv: { song: n => 'Sång ' + n, min: n => n + ' min', ca: r => 'cirka ' + r, ende: r => 'Slut cirka ' + r, mit: x => 'med ' + x, tage: n => 'om ' + n + ' dagar', zut: n => n + ' uppgifter' },
  da: { song: n => 'Sang ' + n, min: n => n + ' min', ca: r => 'ca. ' + r, ende: r => 'Slut ca. ' + r, mit: x => 'med ' + x, tage: n => 'om ' + n + ' dage', zut: n => n + ' opgaver' },
  fi: { song: n => 'Laulu ' + n, min: n => n + ' min', ca: r => 'n. ' + r, ende: r => 'Loppuu n. ' + r, mit: x => x + ' (avustaja)', tage: n => n + ' päivän kuluttua', zut: n => n + ' tehtävää' },
  no: { song: n => 'Sang ' + n, min: n => n + ' min', ca: r => 'ca. ' + r, ende: r => 'Slutt ca. ' + r, mit: x => 'med ' + x, tage: n => 'om ' + n + ' dager', zut: n => n + ' oppgaver' },
  id: { song: n => 'Lagu ' + n, min: n => n + ' mnt', ca: r => 'sekitar ' + r, ende: r => 'Selesai sekitar ' + r, mit: x => 'dengan ' + x, tage: n => n + ' hari lagi', zut: n => n + ' tugas' },
  tl: { song: n => 'Awit ' + n, min: n => n + ' min', ca: r => 'mga ' + r, ende: r => 'Tapos mga ' + r, mit: x => 'kasama si ' + x, tage: n => n + ' araw pa', zut: n => n + ' atas' },
  vi: { song: n => 'Bài hát ' + n, min: n => n + ' phút', ca: r => 'khoảng ' + r, ende: r => 'Kết thúc khoảng ' + r, mit: x => 'với ' + x, tage: n => 'trong ' + n + ' ngày', zut: n => n + ' nhiệm vụ' },
  sw: { song: n => 'Wimbo ' + n, min: n => n + ' dak', ca: r => 'mnamo ' + r, ende: r => 'Mwisho mnamo ' + r, mit: x => 'na ' + x, tage: n => 'baada ya siku ' + n, zut: n => 'migawo ' + n },
  zh: { song: n => '第' + n + '首歌', min: n => n + '分钟', ca: r => '约' + r, ende: r => '约' + r + '结束', mit: x => '与' + x, tage: n => n + '天后', zut: n => n + '项任务' },
  ja: { song: n => '歌' + n + '番', min: n => n + '分', ca: r => '約' + r, ende: r => '約' + r + '終了', mit: x => x + 'と', tage: n => n + '日後', zut: n => n + '件' },
  ko: { song: n => n + '번 노래', min: n => n + '분', ca: r => '약 ' + r, ende: r => '약 ' + r + ' 종료', mit: x => x + '와 함께', tage: n => n + '일 후', zut: n => n + '건' },
}

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
