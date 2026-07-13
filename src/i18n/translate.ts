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
const EXTRA: Record<string, Extra> = {
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
