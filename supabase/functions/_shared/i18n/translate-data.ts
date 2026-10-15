/**
 * i18n-Datentabellen (reine Daten, keine Logik): Programm-Fragment-
 * Wörterbücher je Sprache (FRAG, inkl. am Ende gepatchter Lied-/Platzhalter-
 * Begriffe), Datums-Wörterbücher (D), Wochentag-/Monats-Indizes und die
 * Kurzphrasen der Zusatzsprachen (EXTRA). Die Übersetzer-Engine (makeTr)
 * liegt in translate.ts.
 */

/* eslint-disable */

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
  // Verweise auf Lektionen, Kapitel, Gruppen und Versammlungen stehen in REF —
  // dort für ALLE Sprachen und gemessen statt übersetzt.
  artikel: (n: string) => string
  mit: (x: string) => string
  tage: (n: string) => string
  zut: (n: string) => string
}

const FRAG: Record<string, Record<string, string>> = {
  ar: {
    "Schüler": "الطالب", "Partner": "المعاون", "Ratgeber": "الناصح", "Kreisaufseher": "ناظر الدائرة",
    "Treffpunkte": "خدمة الحقل",
    "ERÖFFNUNG": "الافتتاح",
    "ABSCHLUSS": "الختام",
    "SCHÄTZE AUS GOTTES WORT": "كنوز من كلمة اللّٰه",
    "UNS IM DIENST VERBESSERN": "إستعِد جيدًا لخدمة الحقل",
    "UNSER LEBEN ALS CHRIST": "كلمة اللّٰه في حياتك",
    "ÖFFENTLICHER VORTRAG": "الخطاب العام",
    "WACHTTURM-STUDIUM": "درس برج المراقبة",
    "Einleitende Worte": "تعليقات افتتاحية",
    "Schlussworte": "تعليقات ختامية",
    "Nach geistigen Schätzen graben": "جواهر روحية",
    "Bibellesung": "قراءة الكتاب المقدس",
    "Gespräche beginnen": "البدء بحديث",
    "Interesse fördern": "متابعة الاهتمام", "Was würdest du sagen?": "ماذا يمكن أن تقولوا؟",
    "Menschen zu Jüngern machen": "تعليم الحق",
    "Unsere Glaubensansichten erklären": "شرح معتقداتك",
    "Vortrag": "خطاب",
    "Versammlungsbibelstudium": "درس الكتاب المقدس الجَماعي",
    "Aktuelles": "حاجات الجماعة",
    "Besprechung": "مناقشة",
    "Gebet": "صلاة",
    "Vorsitz": "العريف",
    "Leiter": "المدير",
    "Leser": "القارئ",
    "Gastredner": "الخطيب الزائر",
    "Redner": "الخطيب",
    "Von Haus zu Haus": "من بيت إلى بيت",
    "Informell": "خدمة غير رسمية",
    "In der Öffentlichkeit": "خدمة علنية",
    "Königreichssaal": "قاعة الملكوت",
    "Ton / Video": "الصوت / الفيديو",
    "Mikrofone": "الميكروفونات",
    "Ordner / Eingang": "المرشدون / المدخل",
    "Reinigung": "التنظيف",
    "Zoom-Ordner": "مرشد زوم",
    "Eingangsordner": "مرشد المدخل",
    "Saalordner": "مرشد القاعة", "Rundgangsordner": "مرشد الجولة",
    "ohne Zuteilungen": "بدون تعيينات",
    "Montag": "الاثنين",
    "Brot": "الخبز", "Wein": "الخمر", "nach Sonnenuntergang": "بعد غروب الشمس",
    "Dienstvortrag": "خطاب الخدمة", "Schlussvortrag": "خطاب", "DIENSTVORTRAG": "خطاب الخدمة", "GEDÄCHTNISMAHL": "الذِّكرى"
  },
  fa: {
    "Schüler": "شاگرد", "Partner": "دستیار", "Ratgeber": "مشاور", "Kreisaufseher": "سرپرست حوزه",
    "Treffpunkte": "خدمت موعظه",
    "ERÖFFNUNG": "آغاز",
    "ABSCHLUSS": "پایان",
    "SCHÄTZE AUS GOTTES WORT": "گنج‌هایی در کلام خدا",
    "UNS IM DIENST VERBESSERN": "آموزش برای خدمت موعظه",
    "UNSER LEBEN ALS CHRIST": "زندگی ما مسیحیان",
    "ÖFFENTLICHER VORTRAG": "سخنرانی عمومی",
    "WACHTTURM-STUDIUM": "مطالعهٔ برج دیده‌بانی",
    "Einleitende Worte": "معرفی برنامه",
    "Schlussworte": "مرور برنامه",
    "Nach geistigen Schätzen graben": "گوهرهای روحانی",
    "Bibellesung": "خواندن کتاب مقدّس",
    "Gespräche beginnen": "شروع گفتگو",
    "Interesse fördern": "ادامهٔ گفتگو", "Was würdest du sagen?": "نظر شما چیست؟",
    "Menschen zu Jüngern machen": "شاگردسازی",
    "Unsere Glaubensansichten erklären": "دلیل اعتقادتان را توضیح دهید",
    "Vortrag": "گفتار",
    "Versammlungsbibelstudium": "مطالعۀ کتاب مقدّس در جماعت",
    "Aktuelles": "نیازهای محلی",
    "Besprechung": "گفتاری با سؤال و جواب",
    "Gebet": "دعا",
    "Vorsitz": "مجری",
    "Leiter": "اداره‌کننده",
    "Leser": "قاری",
    "Gastredner": "سخنران مهمان",
    "Redner": "سخنران",
    "Von Haus zu Haus": "موعظهٔ خانه به خانه",
    "Informell": "موعظهٔ غیررسمی",
    "In der Öffentlichkeit": "موعظه در جاهای عمومی",
    "Königreichssaal": "سالن ملکوت",
    "Ton / Video": "صدا / تصویر",
    "Mikrofone": "میکروفون‌ها",
    "Ordner / Eingang": "راهنمایان / ورودی",
    "Reinigung": "نظافت",
    "Zoom-Ordner": "راهنمای زوم",
    "Eingangsordner": "راهنمای ورودی",
    "Saalordner": "راهنمای سالن",
    "Rundgangsordner": "راهنمای گشت",
    "ohne Zuteilungen": "بدون تعیین",
    "Montag": "دوشنبه",
    "Brot": "نان", "Wein": "شراب", "nach Sonnenuntergang": "پس از غروب آفتاب",
    "Dienstvortrag": "سخنرانی خدمتی", "Schlussvortrag": "سخنرانی", "DIENSTVORTRAG": "سخنرانی خدمتی", "GEDÄCHTNISMAHL": "مراسم یادبود"
  },
  en: {
    "Schüler": "Student", "Partner": "Assistant", "Ratgeber": "Counselor",
    "Treffpunkte": "Field Service",
    'ERÖFFNUNG': 'OPENING', 'ABSCHLUSS': 'CONCLUSION',
    'SCHÄTZE AUS GOTTES WORT': 'TREASURES FROM GOD\u2019S WORD',
    'UNS IM DIENST VERBESSERN': 'APPLY YOURSELF TO THE FIELD MINISTRY',
    'UNSER LEBEN ALS CHRIST': 'LIVING AS CHRISTIANS',
    'ÖFFENTLICHER VORTRAG': 'PUBLIC TALK', 'WACHTTURM-STUDIUM': 'WATCHTOWER STUDY',
    'Einleitende Worte': 'Opening Comments', 'Schlussworte': 'Concluding Comments',
    'Nach geistigen Schätzen graben': 'Spiritual Gems', 'Bibellesung': 'Bible Reading',
    'Gespräche beginnen': 'Starting a Conversation', 'Interesse fördern': 'Following Up', 'Was würdest du sagen?': 'What Would You Say?',
    'Menschen zu Jüngern machen': 'Making Disciples', 'Unsere Glaubensansichten erklären': 'Explaining Your Beliefs',
    'Vortrag': 'Talk', 'Versammlungsbibelstudium': 'Congregation Bible Study',
    'Aktuelles': 'Local Needs', 'Besprechung': 'Discussion', 'Gebet': 'Prayer',
    'Vorsitz': 'Chairman', 'Leiter': 'Conductor', 'Leser': 'Reader', 'Gastredner': 'Visiting speaker',
    'Von Haus zu Haus': 'House to house', 'Informell': 'Informal witnessing', 'In der Öffentlichkeit': 'Public witnessing',
    'Königreichssaal': 'Kingdom Hall',
    'Ton / Video': 'Audio / video', 'Mikrofone': 'Microphones', 'Ordner / Eingang': 'Attendants', 'Reinigung': 'Cleaning',
    'Zoom-Ordner': 'Zoom attendant', 'Eingangsordner': 'Entrance attendant', 'Saalordner': 'Hall attendant', 'Rundgangsordner': 'Roving attendant',
    'Dienstvortrag': 'Service talk', "Schlussvortrag": "Concluding Service Talk", 'Kreisaufseher': 'Circuit overseer', 'DIENSTVORTRAG': 'SERVICE TALK',
    'GEDÄCHTNISMAHL': 'MEMORIAL', 'Gedächtnismahl-Ansprache': 'Memorial talk',
    'Symbole herumreichen': 'Passing the emblems', 'Brot': 'Bread', 'Wein': 'Wine', 'Redner': 'Speaker',
    'nach Sonnenuntergang': 'after sundown',
    'Montag': 'Monday',
    'ohne Zuteilungen': 'without assignments',
  },
  es: {
    "Schüler": "Estudiante", "Partner": "Ayudante", "Ratgeber": "Consejero",
    "Treffpunkte": "Servicio del campo",
    'ERÖFFNUNG': 'APERTURA', 'ABSCHLUSS': 'CONCLUSIÓN',
    'SCHÄTZE AUS GOTTES WORT': 'TESOROS DE LA BIBLIA',
    'UNS IM DIENST VERBESSERN': 'SEAMOS MEJORES MAESTROS',
    'UNSER LEBEN ALS CHRIST': 'NUESTRA VIDA CRISTIANA',
    'ÖFFENTLICHER VORTRAG': 'DISCURSO PÚBLICO', 'WACHTTURM-STUDIUM': 'ESTUDIO DE LA ATALAYA',
    'Einleitende Worte': 'Palabras de introducción', 'Schlussworte': 'Palabras de conclusión',
    'Nach geistigen Schätzen graben': 'Busquemos perlas escondidas', 'Bibellesung': 'Lectura de la Biblia',
    'Gespräche beginnen': 'Empecemos conversaciones', 'Interesse fördern': 'Hagamos revisitas', 'Was würdest du sagen?': '¿Qué dirías?',
    'Menschen zu Jüngern machen': 'Hagamos discípulos', 'Unsere Glaubensansichten erklären': 'Explique sus creencias',
    'Vortrag': 'Discurso', 'Versammlungsbibelstudium': 'Estudio bíblico de la congregación',
    'Aktuelles': 'Necesidades de la congregación', 'Besprechung': 'Análisis con el auditorio', 'Gebet': 'Oración',
    'Vorsitz': 'Presidente', 'Leiter': 'Conductor', 'Leser': 'Lector', 'Gastredner': 'Orador invitado',
    'Von Haus zu Haus': 'De casa en casa', 'Informell': 'Predicación informal', 'In der Öffentlichkeit': 'Predicación pública',
    'Königreichssaal': 'Salón del Reino',
    'Ton / Video': 'Audio y video', 'Mikrofone': 'Micrófonos', 'Ordner / Eingang': 'Acomodadores', 'Reinigung': 'Limpieza',
    'Zoom-Ordner': 'Acomodador de Zoom', 'Eingangsordner': 'Acomodador de entrada', 'Saalordner': 'Acomodador de sala', 'Rundgangsordner': 'Acomodador itinerante',
    'Dienstvortrag': 'Discurso de servicio', "Schlussvortrag": "Discurso de servicio final", 'Kreisaufseher': 'Superintendente de circuito', 'DIENSTVORTRAG': 'DISCURSO DE SERVICIO',
    'GEDÄCHTNISMAHL': 'CONMEMORACIÓN', 'Gedächtnismahl-Ansprache': 'Discurso de la Conmemoración',
    'Symbole herumreichen': 'Pasar los emblemas', 'Brot': 'Pan', 'Wein': 'Vino', 'Redner': 'Orador',
    'nach Sonnenuntergang': 'después de la puesta del sol',
    'Montag': 'lunes',
    'ohne Zuteilungen': 'sin asignaciones',
  },
  fr: {
    "Schüler": "Élève", "Partner": "Interlocuteur", "Ratgeber": "Conseiller",
    "Treffpunkte": "Prédication",
    'ERÖFFNUNG': 'OUVERTURE', 'ABSCHLUSS': 'CONCLUSION',
    'SCHÄTZE AUS GOTTES WORT': 'JOYAUX DE LA PAROLE DE DIEU',
    'UNS IM DIENST VERBESSERN': 'APPLIQUE-TOI AU MINISTÈRE',
    'UNSER LEBEN ALS CHRIST': 'VIE CHRÉTIENNE',
    'ÖFFENTLICHER VORTRAG': 'DISCOURS PUBLIC', 'WACHTTURM-STUDIUM': 'ÉTUDE DE LA TOUR DE GARDE',
    'Einleitende Worte': 'Paroles d\u2019introduction', 'Schlussworte': 'Paroles de conclusion',
    'Nach geistigen Schätzen graben': 'Perles spirituelles', 'Bibellesung': 'Lecture de la Bible',
    'Gespräche beginnen': 'Engage la conversation', 'Interesse fördern': 'Entretiens l\u2019intérêt', 'Was würdest du sagen?': 'Que diriez-vous ?',
    'Menschen zu Jüngern machen': 'Fais des disciples', 'Unsere Glaubensansichten erklären': 'Explique tes croyances',
    'Vortrag': 'Discours', 'Versammlungsbibelstudium': 'Étude biblique de l\u2019assemblée',
    'Aktuelles': 'Besoins de l\u2019assemblée', 'Besprechung': 'Discussion', 'Gebet': 'Prière',
    'Vorsitz': 'Président', 'Leiter': 'Conducteur', 'Leser': 'Lecteur', 'Gastredner': 'Orateur visiteur',
    'Von Haus zu Haus': 'De maison en maison', 'Informell': 'Témoignage informel', 'In der Öffentlichkeit': 'Témoignage public',
    'Königreichssaal': 'Salle du Royaume',
    'Ton / Video': 'Sonorisation / vidéo', 'Mikrofone': 'Micros', 'Ordner / Eingang': 'Placeurs', 'Reinigung': 'Ménage',
    'Zoom-Ordner': 'Placeur Zoom', 'Eingangsordner': 'Placeur à l\u2019entrée', 'Saalordner': 'Placeur de salle', 'Rundgangsordner': 'Placeur volant',
    'Dienstvortrag': 'Discours de service', "Schlussvortrag": "Discours de service de conclusion", 'Kreisaufseher': 'Responsable de circonscription', 'DIENSTVORTRAG': 'DISCOURS DE SERVICE',
    'GEDÄCHTNISMAHL': 'MÉMORIAL', 'Gedächtnismahl-Ansprache': 'Discours du Mémorial',
    'Symbole herumreichen': 'Passage des emblèmes', 'Brot': 'Pain', 'Wein': 'Vin', 'Redner': 'Orateur',
    'nach Sonnenuntergang': 'après le coucher du soleil',
    'Montag': 'lundi',
    'ohne Zuteilungen': 'sans attributions',
  },
  it: {
    "Schüler": "Studente", "Partner": "Assistente", "Ratgeber": "Consigliere",
    "Treffpunkte": "Servizio di campo",
    'ERÖFFNUNG': 'INTRODUZIONE', 'ABSCHLUSS': 'CONCLUSIONE',
    'SCHÄTZE AUS GOTTES WORT': 'TESORI DELLA PAROLA DI DIO',
    'UNS IM DIENST VERBESSERN': 'EFFICACI NEL MINISTERO', 'UNSER LEBEN ALS CHRIST': 'VITA CRISTIANA',
    'ÖFFENTLICHER VORTRAG': 'DISCORSO PUBBLICO', 'WACHTTURM-STUDIUM': 'STUDIO TORRE DI GUARDIA',
    'DIENSTVORTRAG': 'DISCORSO DI SERVIZIO', 'GEDÄCHTNISMAHL': 'COMMEMORAZIONE',
    'Einleitende Worte': 'Commenti introduttivi', 'Schlussworte': 'Commenti conclusivi',
    'Nach geistigen Schätzen graben': 'Gemme spirituali', 'Bibellesung': 'Lettura biblica',
    'Gespräche beginnen': 'Iniziare una conversazione', 'Interesse fördern': 'Coltivare l’interesse', 'Was würdest du sagen?': 'Cosa direste?',
    'Menschen zu Jüngern machen': 'Fare discepoli', 'Unsere Glaubensansichten erklären': 'Spiegare quello in cui si crede',
    'Vortrag': 'Discorso', 'Versammlungsbibelstudium': 'Studio biblico di congregazione',
    'Aktuelles': 'Bisogni locali', 'Besprechung': 'Trattazione',
    'Gebet': 'Preghiera', 'Vorsitz': 'Presidente', 'Leiter': 'Conduttore', 'Leser': 'Lettore',
    'Gastredner': 'Oratore in visita', 'Redner': 'Oratore', 'Kreisaufseher': 'Sorvegliante di circoscrizione',
    'Von Haus zu Haus': 'Di casa in casa', 'Informell': 'Testimonianza informale', 'In der Öffentlichkeit': 'Testimonianza pubblica',
    'Königreichssaal': 'Sala del Regno',
    'Mikrofone': 'Microfoni', 'Ton / Video': 'Audio/video', 'Ordner / Eingang': 'Uscieri', 'Reinigung': 'Pulizie',
    'Zoom-Ordner': 'Usciere Zoom', 'Eingangsordner': 'Usciere all’ingresso', 'Saalordner': 'Usciere di sala', 'Rundgangsordner': 'Usciere itinerante', 'Dienstvortrag': 'Discorso di servizio', "Schlussvortrag": "Discorso di servizio conclusivo",
    "ohne Zuteilungen": "senza incarichi", "Brot": "Pane", "Wein": "Vino", "nach Sonnenuntergang": "dopo il tramonto", "Montag": "Lunedì"
  },
  pl: {
    "Schüler": "Uczeń", "Partner": "Pomocnik", "Ratgeber": "Prowadzący",
    "Treffpunkte": "Służba",
    'ERÖFFNUNG': 'ROZPOCZĘCIE', 'ABSCHLUSS': 'ZAKOŃCZENIE',
    'SCHÄTZE AUS GOTTES WORT': 'SKARBY ZE SŁOWA BOŻEGO',
    'UNS IM DIENST VERBESSERN': 'ULEPSZAJMY SWOJĄ SŁUŻBĘ', 'UNSER LEBEN ALS CHRIST': 'CHRZEŚCIJAŃSKI TRYB ŻYCIA',
    'ÖFFENTLICHER VORTRAG': 'WYKŁAD PUBLICZNY', 'WACHTTURM-STUDIUM': 'STUDIUM STRAŻNICY',
    'DIENSTVORTRAG': 'PRZEMÓWIENIE SŁUŻBOWE', 'GEDÄCHTNISMAHL': 'PAMIĄTKA',
    'Einleitende Worte': 'Uwagi wstępne', 'Schlussworte': 'Uwagi końcowe',
    'Nach geistigen Schätzen graben': 'Wyszukujemy duchowe skarby', 'Bibellesung': 'Czytanie Biblii',
    'Gespräche beginnen': 'Rozpoczynanie rozmowy', 'Interesse fördern': 'Podtrzymywanie zainteresowania', 'Was würdest du sagen?': 'Co byś powiedział?',
    'Menschen zu Jüngern machen': 'Pozyskiwanie uczniów', 'Unsere Glaubensansichten erklären': 'Wyjaśnianie swoich wierzeń',
    'Vortrag': 'Przemówienie', 'Versammlungsbibelstudium': 'Zborowe studium Biblii',
    'Aktuelles': 'Miejscowe potrzeby', 'Besprechung': 'Omówienie z udziałem obecnych',
    'Gebet': 'Modlitwa', 'Vorsitz': 'Przewodniczący', 'Leiter': 'Prowadzący', 'Leser': 'Lektor',
    'Gastredner': 'Przyjezdny mówca', 'Redner': 'Mówca', 'Kreisaufseher': 'Nadzorca obwodu',
    'Von Haus zu Haus': 'Od domu do domu', 'Informell': 'Głoszenie nieoficjalne', 'In der Öffentlichkeit': 'Świadczenie publiczne',
    'Königreichssaal': 'Sala Królestwa',
    'Mikrofone': 'Mikrofony', 'Ton / Video': 'Dźwięk/wideo', 'Ordner / Eingang': 'Porządkowi', 'Reinigung': 'Sprzątanie',
    'Zoom-Ordner': 'Porządkowy Zoom', 'Eingangsordner': 'Porządkowy przy wejściu', 'Saalordner': 'Porządkowy w sali', 'Rundgangsordner': 'Porządkowy obchodu', 'Dienstvortrag': 'Przemówienie służbowe', "Schlussvortrag": "Końcowe przemówienie służbowe",
    "ohne Zuteilungen": "bez zadań", "Brot": "Chleb", "Wein": "Wino", "nach Sonnenuntergang": "po zachodzie słońca", "Montag": "Poniedziałek"
  },
  ru: {
    "Schüler": "Учащийся", "Partner": "Помощник", "Ratgeber": "Советник",
    "Treffpunkte": "Служение",
    'ERÖFFNUNG': 'ВСТУПЛЕНИЕ', 'ABSCHLUSS': 'ЗАКЛЮЧЕНИЕ',
    'SCHÄTZE AUS GOTTES WORT': 'СОКРОВИЩА ИЗ СЛОВА БОГА',
    'UNS IM DIENST VERBESSERN': 'ОТТАЧИВАЕМ НАВЫКИ СЛУЖЕНИЯ', 'UNSER LEBEN ALS CHRIST': 'ХРИСТИАНСКАЯ ЖИЗНЬ',
    'ÖFFENTLICHER VORTRAG': 'ПУБЛИЧНАЯ РЕЧЬ', 'WACHTTURM-STUDIUM': 'ИЗУЧЕНИЕ «СТОРОЖЕВОЙ БАШНИ»',
    'DIENSTVORTRAG': 'СЛУЖЕБНАЯ РЕЧЬ', 'GEDÄCHTNISMAHL': 'ВЕЧЕРЯ ВОСПОМИНАНИЯ',
    'Einleitende Worte': 'Вступительные слова', 'Schlussworte': 'Заключительные слова',
    'Nach geistigen Schätzen graben': 'Духовные жемчужины', 'Bibellesung': 'Чтение Библии',
    'Gespräche beginnen': 'Начинайте разговор', 'Interesse fördern': 'Развивайте интерес', 'Was würdest du sagen?': 'Что бы вы сказали?',
    'Menschen zu Jüngern machen': 'Подготавливайте учеников', 'Unsere Glaubensansichten erklären': 'Объясняйте свои взгляды',
    'Vortrag': 'Речь', 'Versammlungsbibelstudium': 'Изучение Библии в собрании',
    'Aktuelles': 'Местные потребности', 'Besprechung': 'Обсуждение',
    'Gebet': 'Молитва', 'Vorsitz': 'Председатель', 'Leiter': 'Ведущий', 'Leser': 'Чтец',
    'Gastredner': 'Приглашённый докладчик', 'Redner': 'Докладчик', 'Kreisaufseher': 'Районный старейшина',
    'Von Haus zu Haus': 'Проповедь по домам', 'Informell': 'Неформальное служение', 'In der Öffentlichkeit': 'Проповедь в общественных местах',
    'Königreichssaal': 'Зал Царства',
    'Mikrofone': 'Микрофоны', 'Ton / Video': 'Звук/видео', 'Ordner / Eingang': 'Распорядители', 'Reinigung': 'Уборка',
    'Zoom-Ordner': 'Распорядитель Zoom', 'Eingangsordner': 'Распорядитель у входа', 'Saalordner': 'Распорядитель в зале', 'Rundgangsordner': 'Распорядитель обхода', 'Dienstvortrag': 'Служебная речь', "Schlussvortrag": "Заключительная служебная речь",
    "ohne Zuteilungen": "без заданий", "Brot": "Хлеб", "Wein": "Вино", "nach Sonnenuntergang": "после захода солнца", "Montag": "Понедельник"
  },
  uk: {
    "Schüler": "Учень", "Partner": "Напарник", "Ratgeber": "Порадник",
    "Treffpunkte": "Служіння",
    'ERÖFFNUNG': 'ВСТУП', 'ABSCHLUSS': 'ЗАКЛЮЧНА ЧАСТИНА',
    'SCHÄTZE AUS GOTTES WORT': 'СКАРБИ З БОЖОГО СЛОВА',
    'UNS IM DIENST VERBESSERN': 'ВДОСКОНАЛЮЙМО СВОЄ СЛУЖІННЯ', 'UNSER LEBEN ALS CHRIST': 'ХРИСТИЯНСЬКЕ ЖИТТЯ',
    'ÖFFENTLICHER VORTRAG': 'ПУБЛІЧНА ПРОМОВА', 'WACHTTURM-STUDIUM': 'ВИВЧЕННЯ «ВАРТОВОЇ БАШТИ»',
    'DIENSTVORTRAG': 'СЛУЖБОВА ПРОМОВА', 'GEDÄCHTNISMAHL': 'СПОМИН',
    'Einleitende Worte': 'Вступні слова', 'Schlussworte': 'Кінцеві слова',
    'Nach geistigen Schätzen graben': 'Духовні перлини', 'Bibellesung': 'Читання Біблії',
    'Gespräche beginnen': 'Починаємо розмову', 'Interesse fördern': 'Розвиваємо інтерес', 'Was würdest du sagen?': 'Що можна сказати?',
    'Menschen zu Jüngern machen': 'Підготовка учнів', 'Unsere Glaubensansichten erklären': 'Пояснюємо свої переконання',
    'Vortrag': 'Промова', 'Versammlungsbibelstudium': 'Вивчення Біблії у зборі',
    'Aktuelles': 'Місцеві потреби', 'Besprechung': 'Обговорення',
    'Gebet': 'Молитва', 'Vorsitz': 'Ведучий', 'Leiter': 'Ведучий', 'Leser': 'Читець',
    'Gastredner': 'Запрошений промовець', 'Redner': 'Промовець', 'Kreisaufseher': 'Районний наглядач',
    'Von Haus zu Haus': 'Від дому до дому', 'Informell': 'Неформальне свідчення', 'In der Öffentlichkeit': 'Проповідування в громадських місцях',
    'Königreichssaal': 'Зал Царства',
    'Mikrofone': 'Мікрофони', 'Ton / Video': 'Звук/відео', 'Ordner / Eingang': 'Розпорядники', 'Reinigung': 'Прибирання',
    'Zoom-Ordner': 'Розпорядник Zoom', 'Eingangsordner': 'Розпорядник біля входу', 'Saalordner': 'Розпорядник у залі', 'Rundgangsordner': 'Розпорядник обходу', 'Dienstvortrag': 'Службова промова', "Schlussvortrag": "Заключна службова промова",
    "ohne Zuteilungen": "без завдань", "Brot": "Хліб", "Wein": "Вино", "nach Sonnenuntergang": "після заходу сонця", "Montag": "Понеділок"
  },
  ro: {
    "Schüler": "Elev", "Partner": "Partener", "Ratgeber": "Consilier",
    "Treffpunkte": "Serviciul de teren",
    'ERÖFFNUNG': 'INTRODUCERE', 'ABSCHLUSS': 'ÎNCHEIERE',
    'SCHÄTZE AUS GOTTES WORT': 'COMORI DIN CUVÂNTUL LUI DUMNEZEU',
    'UNS IM DIENST VERBESSERN': 'SĂ FIM MAI EFICIENȚI ÎN PREDICARE', 'UNSER LEBEN ALS CHRIST': 'VIAȚA DE CREȘTIN',
    'ÖFFENTLICHER VORTRAG': 'CUVÂNTARE PUBLICĂ', 'WACHTTURM-STUDIUM': 'STUDIUL TURNULUI DE VEGHERE',
    'DIENSTVORTRAG': 'CUVÂNTARE DE SERVICIU', 'GEDÄCHTNISMAHL': 'COMEMORAREA',
    'Einleitende Worte': 'Cuvinte introductive', 'Schlussworte': 'Cuvinte de încheiere',
    'Nach geistigen Schätzen graben': 'Nestemate spirituale', 'Bibellesung': 'Citirea Bibliei',
    'Gespräche beginnen': 'Începe o conversație', 'Interesse fördern': 'Fă vizite ulterioare', 'Was würdest du sagen?': 'Ce ai putea spune?',
    'Menschen zu Jüngern machen': 'Fă discipoli', 'Unsere Glaubensansichten erklären': 'Explică-ți convingerile',
    'Vortrag': 'Cuvântare', 'Versammlungsbibelstudium': 'Studiul Bibliei în congregație',
    'Aktuelles': 'Necesități locale', 'Besprechung': 'Discuție',
    'Gebet': 'Rugăciune', 'Vorsitz': 'Președinte', 'Leiter': 'Conducător', 'Leser': 'Cititor',
    'Gastredner': 'Vorbitor vizitator', 'Redner': 'Vorbitor', 'Kreisaufseher': 'Supraveghetor de circumscripție',
    'Von Haus zu Haus': 'Din casă în casă', 'Informell': 'Mărturie informală', 'In der Öffentlichkeit': 'Mărturie publică',
    'Königreichssaal': 'Sala Regatului',
    'Mikrofone': 'Microfoane', 'Ton / Video': 'Audio/video', 'Ordner / Eingang': 'Uşieri', 'Reinigung': 'Curățenie',
    'Zoom-Ordner': 'Uşier Zoom', 'Eingangsordner': 'Uşier la intrare', 'Saalordner': 'Uşier de sală', 'Rundgangsordner': 'Uşier de rond', 'Dienstvortrag': 'Cuvântare de serviciu', "Schlussvortrag": "Cuvântare",
    "ohne Zuteilungen": "fără însărcinări", "Brot": "Pâine", "Wein": "Vin", "nach Sonnenuntergang": "după apusul soarelui", "Montag": "Luni"
  },
  tr: {
    "Schüler": "Öğrenci", "Partner": "Yardımcı", "Ratgeber": "Danışman",
    "Treffpunkte": "Tarla hizmeti",
    'ERÖFFNUNG': 'GİRİŞ', 'ABSCHLUSS': 'SONUÇ',
    'SCHÄTZE AUS GOTTES WORT': 'TANRI’NIN SÖZÜNDEKİ HAZİNELER',
    'UNS IM DIENST VERBESSERN': 'TARLA HİZMETİNDE KENDİNİZİ GELİŞTİRİN', 'UNSER LEBEN ALS CHRIST': 'HIRİSTİYANLAR OLARAK YAŞAM TARZIMIZ',
    'ÖFFENTLICHER VORTRAG': 'HALKA YÖNELİK KONUŞMA', 'WACHTTURM-STUDIUM': 'GÖZCÜ KULESİ İNCELEMESİ',
    'DIENSTVORTRAG': 'HİZMET KONUŞMASI', 'GEDÄCHTNISMAHL': 'ANMA TOPLANTISI',
    'Einleitende Worte': 'Açılış Sözleri', 'Schlussworte': 'Kapanış Sözleri',
    'Nach geistigen Schätzen graben': 'Kutsal Kitap’tan İnciler', 'Bibellesung': 'Kutsal Kitap Okuması',
    'Gespräche beginnen': 'Sohbet Başlatmak', 'Interesse fördern': 'Tekrar Ziyaretler Yapmak', 'Was würdest du sagen?': 'Ne Derdiniz?',
    'Menschen zu Jüngern machen': 'Öğrenci Yetiştirmek', 'Unsere Glaubensansichten erklären': 'İnançlarımızı Açıklamak',
    'Vortrag': 'Konuşma', 'Versammlungsbibelstudium': 'Cemaat Kutsal Kitap İncelemesi',
    'Aktuelles': 'Yerel İhtiyaçlar', 'Besprechung': 'Müzakere',
    'Gebet': 'Dua', 'Vorsitz': 'Başkanlık eden', 'Leiter': 'İdareci', 'Leser': 'Okuyucu',
    'Gastredner': 'Misafir konuşmacı', 'Redner': 'Konuşmacı', 'Kreisaufseher': 'Çevre gözetmeni',
    'Von Haus zu Haus': 'Evden eve', 'Informell': 'Rastlantıda şahitlik', 'In der Öffentlichkeit': 'Halka açık yerlerde şahitlik',
    'Königreichssaal': 'İbadet Salonu',
    'Mikrofone': 'Mikrofonlar', 'Ton / Video': 'Ses/video', 'Ordner / Eingang': 'Görevliler', 'Reinigung': 'Temizlik',
    'Zoom-Ordner': 'Zoom görevlisi', 'Eingangsordner': 'Giriş görevlisi', 'Saalordner': 'Salon görevlisi', 'Rundgangsordner': 'Devriye görevlisi', 'Dienstvortrag': 'Hizmet konuşması', "Schlussvortrag": "Konuşma",
    "ohne Zuteilungen": "görev atanmadan", "Brot": "Ekmek", "Wein": "Şarap", "nach Sonnenuntergang": "gün batımından sonra", "Montag": "Pazartesi"
  },
};
// --- Wochenend-Vorlage-Atome (unsere eigenen Strings, nicht von jw.org) -------
// Werden je Sprache in FRAG eingespeist, damit makeTr sie beim Anzeigen der
// (kanonisch deutschen) Wochenend-Vorlage in die Versammlungssprache übersetzt.
// „Lied“ (ohne Nummer) fehlte als Atom für zusammengesetzte Titel wie
// „Schlussworte · Lied · Gebet“. Die beiden Platzhalter erscheinen als
// editierbarer Titel, solange nichts eingetragen ist.
/**
 * Das Wort „Lied“ je Sprache — gemessen, nicht erfunden.
 *
 * Doppelt genutzt: als FRAG-Atom für zusammengesetzte Titel („Schlussworte ·
 * Lied · Gebet“) und als Beschriftung des Schlusslied-Feldes im Planen-Screen.
 * Für Letzteres wäre „SCHLUSSLIED“ treffender — und die Wörterbuch-Prüfung
 * verlangt zu Recht, dass **jede** Sprache einen Schlüssel selbst übersetzt
 * (`ui.test.ts`), ein erfundenes Wort in allen Sprachen wäre also der
 * schlechtere Tausch.
 *
 * Am 17.8.2026 gemessen statt bloß behauptet (T33): das Kongressprogramm 2018
 * führt „Schlusslied und Gebet“ und liegt unter **einer** Kennung in allen 34
 * Sprachen vor. Es trägt trotzdem nicht — 8 Sprachen hängen das Schlusswort an
 * Lied *und* Gebet zugleich („Canción y oración de conclusión“), ein Schnitt
 * ergäbe dort bloß „Lied“; Französisch schreibt gar kein Schlusswort. Also
 * bleibt es bei „Lied“ unter der ebenfalls gemessenen Überschrift ABSCHLUSS —
 * zwei belegte Hälften statt einer erfundenen. Belege in docs/analyse/todo.md
 * (T33).
 *
 * Am 26.9.2026 gegen die Eröffnungszeile des Arbeitshefts nachgemessen
 * („Song 74 and Prayer" in allen Sprachen, damals 34). Dieselbe Zeile legt
 * auch fest, wie `song(n)` in EXTRA die Nummer setzt.
 */
const SONG_WORD: Record<string, string> = {
  en: 'Song', es: 'Canción', fr: 'Cantique', it: 'Cantico', 
  pl: 'Pieśń', ru: 'Песня', uk: 'Пісня', ro: 'Cântarea',
  
  tr: 'İlahi', 
  
  ar: 'الترنيمة',
  fa: 'سرود', 
}
const TALK_PLACEHOLDER: Record<string, string> = {
  en: '(enter talk title)', es: '(escribir el tema del discurso)', fr: '(indiquer le thème du discours)',
  it: '(inserire il tema del discorso)', 
  pl: '(wpisz temat wykładu)', ru: '(укажите тему речи)', uk: '(вкажіть тему промови)',
  ro: '(introdu tema cuvântării)', 
  
  tr: '(konuşma konusunu gir)',
  
  
  
  ar: '(أدخل موضوع الخطاب)',
  fa: '(موضوع سخنرانی را وارد کنید)', 
}
const STUDY_PLACEHOLDER: Record<string, string> = {
  en: '(enter study article)', es: '(escribir el artículo de estudio)', fr: '(indiquer l’article d’étude)',
  it: '(inserire l’articolo di studio)', 
  pl: '(wpisz artykuł do studium)', ru: '(укажите статью для изучения)', uk: '(вкажіть статтю для вивчення)',
  ro: '(introdu articolul de studiu)', 
  
  tr: '(inceleme makalesini gir)',
  
  
  
  ar: '(أدخل مقالة الدرس)',
  fa: '(مقالهٔ مطالعه را وارد کنید)', 
}
/**
 * „Treffpunkt-Leiter“ je Sprache — die Bezeichnung, mit der die Edge Functions
 * eine Treffpunkt-Leitung in Mitteilung und Push benennen (`FS_LEITER` in
 * `_shared/zuteilungen.ts`).
 *
 * **Warum das hier noch einmal steht.** Die Übersetzung gibt es längst: als
 * `fsLeiterRolle` im App-Wörterbuch (am 26.9.2026 am od Kap. 7 und per
 * WOL-Suche nachgemessen — vorher stand in 25 Sprachen das Wort für die
 * Versammlungszusammenkunft darin). Nur kommt die
 * Edge-Laufzeit nicht an `src/` heran, und der Rumpf einer Mitteilung wird Atom
 * für Atom über FRAG übersetzt — dort fehlte das Wort als einziges aller
 * Rollen. Ein Treffpunkt-Leiter las in der Glocke und im Push „Treffpunkt-
 * Leiter“ auf Deutsch, während „Meine Aufgaben“ daneben seine Sprache zeigte.
 *
 * Keine zweite Übersetzung, nur eine zweite Ablage derselben —
 * `rollen-uebersetzt.test.ts` hält beide Seiten Zeichen für Zeichen zusammen.
 *
 * **Im Singular**, wie `fsLeiterRolle`: Eine Mitteilung nennt die Rolle
 * **einer** Aufgabe. Hier stand bis zum 25.9.2026 der Plural von `fsLeiterLbl`
 * („Meeting-point leaders", „Ведущие…"), der die Zuteilen-Zeile beschriftet —
 * im Deutschen fiel es nicht auf, „Leiter" ist beides.
 */
const FS_LEADER_WORD: Record<string, string> = {
  ar: "مدير اجتماع خدمة الحقل", 
  en: "Field service meeting conductor", es: "Encargado de la reunión para el servicio", fa: "اداره‌کنندهٔ جلسهٔ خدمت موعظه",
  fr: "Conducteur de la réunion pour la prédication", 
  it: "Conduttore dell’adunanza per il servizio", 
  pl: "Prowadzący zbiórkę do służby",
  ro: "Conducătorul întrunirii pentru serviciu", ru: "Ведущий встречи для проповеди", 
  
  tr: "Tarla buluşmasını idare eden", uk: "Ведучий зустрічі для служіння", 
}
for (const code of Object.keys(FRAG)) {
  const f = FRAG[code]
  if (!f) continue // über `Object.keys` unmöglich; der Index-Zugriff weiß das nicht
  const lied = SONG_WORD[code]
  const vortrag = TALK_PLACEHOLDER[code]
  const studium = STUDY_PLACEHOLDER[code]
  const fsLeiter = FS_LEADER_WORD[code]
  if (lied) f['Lied'] = lied
  if (vortrag) f['(Vortragsthema eintragen)'] = vortrag
  if (studium) f['(Studienartikel eintragen)'] = studium
  if (fsLeiter) f['Treffpunkt-Leiter'] = fsLeiter
}

/* ---- Verweise auf Studienstoff, Gruppen, Versammlungen ------------------
 * EINE Tabelle für alle Sprachen. Vorher gab es zwei Quellen: Funktionen im
 * DateDict (nur en/es/fr) und für alle anderen gar nichts — deshalb blieb
 * „Gruppe 2" in 30 Sprachen deutsch stehen.
 *
 * Die Vorlagen sind GEMESSEN, nicht übersetzt: dieselbe Arbeitsheft-Woche in
 * Deutsch und in der Zielsprache von jw.org geholt und die Verweise über ihre
 * Zahlenfolge einander zugeordnet. Nur so fällt auf, dass Englisch bei „th"
 * study schreibt, bei lmd/lff aber lesson, dass Türkisch die Zahl voranstellt
 * („lmd 1. bölüm 5. nokta") — und dass die RTL-Sprachen das Kürzel MIT
 * übersetzen.
 *
 * Genau deshalb steht hier je Publikation eine eigene Vorlage und nicht eine
 * gemeinsame für alle Buch-Kürzel: „th" und „wcg" sind auf Persisch
 * verschiedene Wörter. Eine gemeinsame Regel setzte dort das falsche Kürzel
 * ein.
 *
 * Fehlt eine Vorlage, bleibt der deutsche Verweis stehen — eine erfundene wäre
 * schlimmer. Die Anhang-Verweise von tr/fa sind am 26.9.2026 an den Wochen 27
 * und 32/2026 nachgemessen („lmd Ek 1, 19. nokta"); sie zählen den Anhang als
 * „1", nicht „A".
 *
 * „Gruppe" ist Alltagssprache und daher hier direkt übersetzt; „Vers." nutzt
 * das Wort für Versammlung aus der Oberflächen-Übersetzung derselben Sprache.
 */
interface RefDict {
  thLek?: (n: string) => string              // „th Lektion 5"
  lmdLekP?: (n: string, p: string) => string // „lmd Lektion 1 Punkt 5"
  lmdLek?: (n: string) => string             // „lmd Lektion 3"
  lffLekP?: (n: string, p: string) => string // „lff Lektion 20 Punkt 4"
  lffLek?: (n: string) => string             // „lff Lektion 20"
  wcgKap?: (n: string) => string             // „wcg Kap. 15"
  lmdAnh?: (n: string) => string             // „lmd Anhang A Punkt 21"
  gruppe?: (n: string) => string             // „Gruppe 2"
  vers?: (x: string) => string               // „Vers. Nordheim"
}

const REF: Record<string, RefDict> = {
  en: {
    thLek: n => 'th study ' + n,
    lmdLekP: (n, p) => 'lmd lesson ' + n + ' point ' + p,
    lmdLek: n => 'lmd lesson ' + n,
    lffLekP: (n, p) => 'lff lesson ' + n + ' point ' + p,
    lffLek: n => 'lff lesson ' + n,
    wcgKap: n => 'wcg chap. ' + n,
    lmdAnh: n => 'lmd appendix A point ' + n,
    gruppe: n => 'Group ' + n,
    vers: x => 'Cong. ' + x,
  },
  es: {
    thLek: n => 'th lección ' + n,
    lmdLekP: (n, p) => 'lmd lección ' + n + ' punto ' + p,
    lmdLek: n => 'lmd lección ' + n,
    lffLekP: (n, p) => 'lff lección ' + n + ' punto ' + p,
    lffLek: n => 'lff lección ' + n,
    wcgKap: n => 'wcg cap. ' + n,
    lmdAnh: n => 'lmd apéndice A punto ' + n,
    gruppe: n => 'Grupo ' + n,
    vers: x => 'Congr. ' + x,
  },
  fr: {
    thLek: n => 'th leçon ' + n,
    lmdLekP: (n, p) => 'lmd leçon ' + n + ' idée ' + p,
    lmdLek: n => 'lmd leçon ' + n,
    lffLekP: (n, p) => 'lff leçon ' + n + ' idée principale ' + p,
    lffLek: n => 'lff leçon ' + n,
    wcgKap: n => 'wcg chap. ' + n,
    lmdAnh: n => 'lmd appendice A idée ' + n,
    gruppe: n => 'Groupe ' + n,
    vers: x => 'Ass. ' + x,
  },
  it: {
    thLek: n => 'th lezione ' + n,
    lmdLekP: (n, p) => 'lmd lezione ' + n + ' punto ' + p,
    lmdLek: n => 'lmd lezione ' + n,
    lffLekP: (n, p) => 'lff lezione ' + n + ' punto ' + p,
    lffLek: n => 'lff lezione ' + n,
    wcgKap: n => 'wcg cap. ' + n,
    lmdAnh: n => 'lmd appendice A punto ' + n,
    gruppe: n => 'Gruppo ' + n,
    vers: x => 'Congregazione ' + x,
  },
  pl: {
    thLek: n => 'th lekcja ' + n,
    lmdLekP: (n, p) => 'lmd lekcja ' + n + ', punkt ' + p,
    lmdLek: n => 'lmd lekcja ' + n,
    lffLekP: (n, p) => 'lff lekcja ' + n + ', punkt ' + p,
    lffLek: n => 'lff lekcja ' + n,
    wcgKap: n => 'wcg rozdz. ' + n,
    lmdAnh: n => 'lmd dodatek A, punkt ' + n,
    gruppe: n => 'Grupa ' + n,
    vers: x => 'Zbór ' + x,
  },
  ru: {
    thLek: n => 'th урок ' + n,
    lmdLekP: (n, p) => 'lmd урок ' + n + ', пункт ' + p,
    lmdLek: n => 'lmd урок ' + n,
    lffLekP: (n, p) => 'lff урок ' + n + ', пункт ' + p,
    lffLek: n => 'lff урок ' + n,
    wcgKap: n => 'wcg гл. ' + n,
    lmdAnh: n => 'lmd Приложение A, пункт ' + n,
    gruppe: n => 'Группа ' + n,
    vers: x => 'Собрание ' + x,
  },
  uk: {
    thLek: n => 'th урок ' + n,
    lmdLekP: (n, p) => 'lmd урок ' + n + ', пункт ' + p,
    lmdLek: n => 'lmd урок ' + n,
    lffLekP: (n, p) => 'lff урок ' + n + ', пункт ' + p,
    lffLek: n => 'lff урок ' + n,
    wcgKap: n => 'wcg розд. ' + n,
    lmdAnh: n => 'lmd додаток А, пункт ' + n,
    gruppe: n => 'Група ' + n,
    vers: x => 'Збір ' + x,
  },
  ro: {
    thLek: n => 'th lecția ' + n,
    lmdLekP: (n, p) => 'lmd lecția ' + n + ', punctul ' + p,
    lmdLek: n => 'lmd lecția ' + n,
    lffLekP: (n, p) => 'lff lecția ' + n + ', punctul ' + p,
    lffLek: n => 'lff lecția ' + n,
    wcgKap: n => 'wcg cap. ' + n,
    lmdAnh: n => 'lmd apendice A, punctul ' + n,
    gruppe: n => 'Grupa ' + n,
    vers: x => 'Congregație ' + x,
  },
  tr: {
    thLek: n => 'th çalışma konusu ' + n,
    lmdLekP: (n, p) => 'lmd ' + n + '. bölüm ' + p + '. nokta',
    lffLekP: (n, p) => 'lff ' + n + '. bölüm ' + p + '. nokta',
    wcgKap: n => 'wcg ' + n + '. bölüm',
    lmdAnh: n => 'lmd Ek 1, ' + n + '. nokta',
    gruppe: n => 'Grup ' + n,
    vers: x => 'Cemaat ' + x,
  },
  ar: {
    thLek: n => 'ق‌ت الدرس ' + n,
    lmdLekP: (n, p) => 'أن الدرس ' + n + ' النقطة ' + p,
    lmdLek: n => 'أن الدرس ' + n,
    lffLekP: (n, p) => 'ع‌ف الدرس ' + n + ': النقطة ' + p,
    lffLek: n => 'ع‌ف الدرس ' + n,
    wcgKap: n => 'س‌ش‌ا الدرس ' + n,
    lmdAnh: n => 'أن الملحق أ النقطة ' + n,
    gruppe: n => 'فريق ' + n,
    vers: x => 'الجماعة ' + x,
  },
  fa: {
    thLek: n => 'ب-تعلیم درس ' + n,
    lmdLekP: (n, p) => 'ب-محبت درس ' + n + ' نکتهٔ ' + p,
    lmdLek: n => 'ب-محبت درس ' + n,
    lffLekP: (n, p) => 'ک-زندگی درس ' + n + ' نکتهٔ ' + p,
    lffLek: n => 'ک-زندگی درس ' + n,
    wcgKap: n => 'ک-شجاع فصل ' + n,
    lmdAnh: n => 'ب-محبت ضمیمهٔ 1 نکتهٔ ' + n,
    gruppe: n => 'گروه ' + n,
    vers: x => 'جماعت ' + x,
  },
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
    artikel: n => 'Study article ' + n, mit: x => 'with ' + x,
    tage: n => 'in ' + n + ' days', zut: n => n + ' assignments'
  },
  es: {
    wd: ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'],
    wda: ['lun.','mar.','mié.','jue.','vie.','sáb.','dom.'],
    mon: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
    mona: ['ene.','feb.','mar.','abr.','may.','jun.','jul.','ago.','sep.','oct.','nov.','dic.'],
    date: (w, d, m) => w + ', ' + d + ' de ' + m,
    range1: (a, b, m) => a + ' al ' + b + ' de ' + m,
    range2: (a, ma, b, mb) => a + ' de ' + ma + ' al ' + b + ' de ' + mb,
    song: n => 'Canción ' + n, min: n => n + (n === '1' ? ' min.' : ' mins.'), ca: r => 'aprox. ' + r, ende: r => 'Termina aprox. ' + r,
    artikel: n => 'Artículo de estudio ' + n, mit: x => 'con ' + x,
    tage: n => 'en ' + n + ' días', zut: n => n + ' asignaciones'
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
    artikel: n => 'Article d\u2019étude ' + n, mit: x => 'avec ' + x,
    tage: n => 'dans ' + n + ' jours', zut: n => n + ' attributions'
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
  /*
   * KEIN `artikel` — anders als `DateDict` oben. „Studienartikel 28" bleibt
   * über diesen Pfad deshalb deutsch stehen (siehe die Notiz in
   * `translate.ts`). Ein optionales Feld mit englischem Rückfall wäre schnell
   * geschrieben und würde die Vollständigkeitsprüfung in
   * `translate-data.test.ts` unterlaufen, die die Pflichtfelder aus `EXTRA_EN`
   * ableitet. Erst messen, dann eintragen — für alle Sprachen zugleich.
   */
}

const EXTRA_EN: Extra = {
  song: n => 'Song ' + n, min: n => n + ' min.', ca: r => 'approx. ' + r, ende: r => 'Ends approx. ' + r,
  mit: x => 'with ' + x, tage: n => 'in ' + n + ' days', zut: n => n + ' assignments',
}

// Kurze Phrasen je Zusatz-Sprache (Datum/Namen kommen aus Intl). Wird batch-
// weise gefüllt; fehlende Sprachen nutzen EXTRA_EN.
const EXTRA: Record<string, Extra> = {
  ar: { song: n => 'الترنيمة ' + n, min: n => n + ' دق', ca: r => 'حوالي ' + r, ende: r => 'ينتهي حوالي ' + r, mit: x => 'مع ' + x, tage: n => 'بعد ' + n + ' أيام', zut: n => n + ' تعيينات' },
  fa: { song: n => 'سرود ' + n, min: n => n + ' دقیقه', ca: r => 'حدود ' + r, ende: r => 'پایان حدود ' + r, mit: x => 'با ' + x, tage: n => n + ' روز دیگر', zut: n => n + ' وظیفه' },
  it: { song: n => 'Cantico ' + n, min: n => n + ' min', ca: r => 'circa ' + r, ende: r => 'Fine circa ' + r, mit: x => 'con ' + x, tage: n => 'tra ' + n + ' giorni', zut: n => n + ' incarichi' },
  pl: { song: n => 'Pieśń ' + n, min: n => n + ' min', ca: r => 'ok. ' + r, ende: r => 'Koniec ok. ' + r, mit: x => 'z ' + x, tage: n => 'za ' + n + ' dni', zut: n => n + ' zadań' },
  ru: { song: n => 'Песня ' + n, min: n => n + ' мин.', ca: r => 'ок. ' + r, ende: r => 'Конец ок. ' + r, mit: x => 'с ' + x, tage: n => 'через ' + n + ' дн.', zut: n => n + ' назначений' },
  uk: { song: n => 'Пісня ' + n, min: n => n + ' хв', ca: r => 'бл. ' + r, ende: r => 'Кінець бл. ' + r, mit: x => 'з ' + x, tage: n => 'через ' + n + ' дн.', zut: n => n + ' призначень' },
  ro: { song: n => 'Cântarea ' + n, min: n => n + ' min.', ca: r => 'aprox. ' + r, ende: r => 'Sfârșit aprox. ' + r, mit: x => 'cu ' + x, tage: n => 'peste ' + n + ' zile', zut: n => n + ' însărcinări' },
  tr: { song: n => 'İlahi ' + n, min: n => n + ' dk.', ca: r => 'yaklaşık ' + r, ende: r => 'Bitiş yaklaşık ' + r, mit: x => x + ' ile', tage: n => n + ' gün sonra', zut: n => n + ' görev' },
}

export { FRAG, D, REF, WD, WDA, MON, MONA, EXTRA, EXTRA_EN, SONG_WORD }
export type { DateDict, Extra, RefDict }
