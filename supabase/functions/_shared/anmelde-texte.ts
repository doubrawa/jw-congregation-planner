// =============================================================================
// Geteilt: die E-Mail mit dem Anmelde-Link (T121, Phase 8)
// =============================================================================
// **Erzeugt, nicht erfunden.** Jeder Satz hier steht wörtlich so im
// App-Wörterbuch (`linkMailBetreff` / `linkMailText` in `src/i18n/de.ts` und den
// Overlays) — dieselbe E-Mail, die der Admin aus seinem eigenen Mail-Programm
// schickt, solange die App selbst keine senden kann. Ein Test hält beide
// Fassungen zusammen (`_test/anmeldung.test.ts`).
//
// Zwei Functions schicken sie: `send-invite` (der Admin stellt Links aus) und
// `anmelden` (Selbstbedienung auf der Anmeldeseite, „Link senden"). Die
// Sprache ist die der **Versammlung**: Der Empfänger hat noch keine gewählt.
// =============================================================================

import { texteFuer } from './texte.ts'

export interface LinkMailTexte {
  /** Betreff mit {versammlung}. */
  betreff: string
  /** Text mit {name}, {versammlung}, {url} und {datum}. */
  text: string
}

const TEXTE: Record<string, LinkMailTexte> = {
  en: {
    betreff: "Your access to the {versammlung} Congregation",
    text: "Hello {name},\n\nthe {versammlung} Congregation plans its meetings and field service with Versammlung.app. Your access is ready.\n\nLog in now:\n{url}\n\nThe link is valid until {datum} and logs only you in. You don’t need a password. If it has expired, open the app and tap “Send link”.\n\nYou are receiving this email because you are listed in the {versammlung} Congregation. If you have questions, please speak to the elders.",
  },
  es: {
    betreff: "Tu acceso a la congregación {versammlung}",
    text: "Hola, {name}:\n\nla congregación {versammlung} organiza las reuniones y el servicio del campo con Versammlung.app. Tu acceso ya está listo.\n\nInicia sesión ahora:\n{url}\n\nEl enlace es válido hasta el {datum} y solo te da acceso a ti. No necesitas contraseña. Si ha caducado, abre la aplicación y toca “Enviar enlace”.\n\nRecibes este correo porque figuras en la congregación {versammlung}. Si tienes preguntas, habla con los ancianos.",
  },
  fr: {
    betreff: "Ton accès à l’assemblée de {versammlung}",
    text: "Bonjour {name},\n\nl’assemblée de {versammlung} planifie les réunions et la prédication avec Versammlung.app. Ton accès est prêt.\n\nConnecte-toi maintenant\u00a0:\n{url}\n\nLe lien est valable jusqu’au {datum} et ne connecte que toi. Tu n’as pas besoin de mot de passe. S’il a expiré, ouvre l’application et appuie sur «\u00a0Envoyer le lien\u00a0».\n\nTu reçois cet e-mail parce que tu fais partie de l’assemblée de {versammlung}. Si tu as des questions, parles-en aux anciens.",
  },
  it: {
    betreff: "Il tuo accesso alla congregazione di {versammlung}",
    text: "Ciao {name},\n\nla congregazione di {versammlung} pianifica le adunanze e il servizio di campo con Versammlung.app. Il tuo accesso è pronto.\n\nAccedi ora:\n{url}\n\nIl link è valido fino al {datum} e fa accedere solo te. Non ti serve una password. Se è scaduto, apri l’app e tocca “Invia link”.\n\nRicevi questa email perché fai parte della congregazione di {versammlung}. Se hai domande, parlane con gli anziani.",
  },
  pt: {
    betreff: "Seu acesso à Congregação de {versammlung}",
    text: "Olá, {name},\n\na Congregação de {versammlung} planeja as reuniões e o serviço de campo com o Versammlung.app. Seu acesso está pronto.\n\nEntre agora:\n{url}\n\nO link vale até {datum} e dá acesso só a você. Você não precisa de senha. Se ele tiver expirado, abra o app e toque em “Enviar link”.\n\nVocê está recebendo este e-mail porque faz parte da Congregação de {versammlung}. Se tiver perguntas, fale com os anciãos.",
  },
  nl: {
    betreff: "Je toegang tot gemeente {versammlung}",
    text: "Hallo {name},\n\ngemeente {versammlung} plant de vergaderingen en de velddienst met Versammlung.app. Je toegang is klaar.\n\nNu inloggen:\n{url}\n\nDe link is geldig tot {datum} en logt alleen jou in. Je hebt geen wachtwoord nodig. Is hij verlopen, open dan de app en tik op ‘Link sturen’.\n\nJe krijgt deze e-mail omdat je in gemeente {versammlung} staat ingeschreven. Heb je vragen, spreek dan de ouderlingen aan.",
  },
  pl: {
    betreff: "Twój dostęp do zboru {versammlung}",
    text: "Cześć {name},\n\nzbór {versammlung} planuje zebrania i służbę za pomocą Versammlung.app. Twój dostęp jest gotowy.\n\nZaloguj się teraz:\n{url}\n\nLink jest ważny do {datum} i loguje tylko ciebie. Hasło nie jest potrzebne. Jeśli wygasł, otwórz aplikację i stuknij „Wyślij link”.\n\nOtrzymujesz tego e-maila, ponieważ należysz do zboru {versammlung}. Jeśli masz pytania, porozmawiaj ze starszymi.",
  },
  ru: {
    betreff: "Ваш доступ к собранию {versammlung}",
    text: "Здравствуйте, {name}!\n\nСобрание {versammlung} планирует встречи и служение с помощью Versammlung.app. Ваш доступ готов.\n\nВойдите сейчас:\n{url}\n\nСсылка действует до {datum} и открывает вход только для вас. Пароль не нужен. Если срок действия истёк, откройте приложение и нажмите «Отправить ссылку».\n\nВы получили это письмо, потому что состоите в собрании {versammlung}. Если у вас есть вопросы, обратитесь к старейшинам.",
  },
  uk: {
    betreff: "Ваш доступ до збору {versammlung}",
    text: "Вітаємо, {name}!\n\nЗбір {versammlung} планує зібрання і служіння за допомогою Versammlung.app. Ваш доступ готовий.\n\nУвійдіть зараз:\n{url}\n\nПосилання дійсне до {datum} і відкриває вхід лише для вас. Пароль не потрібен. Якщо строк дії минув, відкрийте застосунок і натисніть «Надіслати посилання».\n\nВи отримали цей лист, бо належите до збору {versammlung}. Якщо у вас є запитання, зверніться до старійшин.",
  },
  ro: {
    betreff: "Accesul tău la congregația {versammlung}",
    text: "Bună, {name},\n\ncongregația {versammlung} planifică întrunirile și serviciul de teren cu Versammlung.app. Accesul tău este pregătit.\n\nAutentifică-te acum:\n{url}\n\nLinkul este valabil până la {datum} și te autentifică doar pe tine. Nu ai nevoie de parolă. Dacă a expirat, deschide aplicația și atinge „Trimite linkul”.\n\nPrimești acest e-mail pentru că faci parte din congregația {versammlung}. Dacă ai întrebări, vorbește cu bătrânii.",
  },
  el: {
    betreff: "Η πρόσβασή σας στην εκκλησία {versammlung}",
    text: "Γεια σας {name},\n\nη εκκλησία {versammlung} προγραμματίζει τις συναθροίσεις και την υπηρεσία αγρού με το Versammlung.app. Η πρόσβασή σας είναι έτοιμη.\n\nΣυνδεθείτε τώρα:\n{url}\n\nΟ σύνδεσμος ισχύει μέχρι τις {datum} και συνδέει μόνο εσάς. Δεν χρειάζεστε κωδικό πρόσβασης. Αν έχει λήξει, ανοίξτε την εφαρμογή και πατήστε «Αποστολή συνδέσμου».\n\nΛαμβάνετε αυτό το email επειδή ανήκετε στην εκκλησία {versammlung}. Αν έχετε ερωτήσεις, μιλήστε με τους πρεσβυτέρους.",
  },
  cs: {
    betreff: "Tvůj přístup do sboru {versammlung}",
    text: "Ahoj {name},\n\nsbor {versammlung} plánuje shromáždění a službu pomocí aplikace Versammlung.app. Tvůj přístup je připravený.\n\nPřihlas se teď:\n{url}\n\nOdkaz platí do {datum} a přihlásí jen tebe. Heslo nepotřebuješ. Pokud vypršel, otevři aplikaci a klepni na „Poslat odkaz“.\n\nTento e-mail dostáváš, protože patříš do sboru {versammlung}. Pokud máš otázky, obrať se na starší.",
  },
  sk: {
    betreff: "Tvoj prístup do zboru {versammlung}",
    text: "Ahoj {name},\n\nzbor {versammlung} plánuje zhromaždenia a službu pomocou aplikácie Versammlung.app. Tvoj prístup je pripravený.\n\nPrihlás sa teraz:\n{url}\n\nOdkaz platí do {datum} a prihlási iba teba. Heslo nepotrebuješ. Ak vypršal, otvor aplikáciu a ťukni na „Poslať odkaz“.\n\nTento e-mail dostávaš, pretože patríš do zboru {versammlung}. Ak máš otázky, obráť sa na starších.",
  },
  hu: {
    betreff: "Hozzáférésed: {versammlung} gyülekezet",
    text: "Szia {name}!\n\nA gyülekezeted ({versammlung}) a Versammlung.app segítségével tervezi az összejöveteleket és a szolgálatot. A hozzáférésed készen áll.\n\nJelentkezz be most:\n{url}\n\nA link eddig érvényes: {datum}, és csak téged jelentkeztet be. Jelszóra nincs szükséged. Ha lejárt, nyisd meg az appot, és koppints a „Link küldése” gombra.\n\nAzért kapod ezt az e-mailt, mert szerepelsz a gyülekezeted ({versammlung}) névsorában. Ha kérdésed van, beszélj a vénekkel.",
  },
  hr: {
    betreff: "Tvoj pristup skupštini {versammlung}",
    text: "Bok {name},\n\nskupština {versammlung} planira sastanke i službu propovijedanja s aplikacijom Versammlung.app. Tvoj pristup je spreman.\n\nPrijavi se sada:\n{url}\n\nPoveznica vrijedi do {datum} i prijavljuje samo tebe. Lozinka ti ne treba. Ako je istekla, otvori aplikaciju i dodirni “Pošalji poveznicu”.\n\nOvu poruku dobivaš jer pripadaš skupštini {versammlung}. Ako imaš pitanja, razgovaraj sa starješinama.",
  },
  sr: {
    betreff: "Tvoj pristup skupštini {versammlung}",
    text: "Zdravo {name},\n\nskupština {versammlung} planira sastanke i službu propovedanja uz Versammlung.app. Tvoj pristup je spreman.\n\nPrijavi se sada:\n{url}\n\nLink važi do {datum} i prijavljuje samo tebe. Lozinka ti ne treba. Ako je istekao, otvori aplikaciju i dodirni „Pošalji link“.\n\nOvaj imejl dobijaš jer pripadaš skupštini {versammlung}. Ako imaš pitanja, razgovaraj sa starešinama.",
  },
  bg: {
    betreff: "Твоят достъп до сбор {versammlung}",
    text: "Здравей, {name},\n\nсбор {versammlung} планира събранията и проповедната служба с Versammlung.app. Достъпът ти е готов.\n\nВлез сега:\n{url}\n\nВръзката е валидна до {datum} и влиза само с твоя профил. Не ти трябва парола. Ако е изтекла, отвори приложението и докосни „Изпрати връзка“.\n\nПолучаваш този имейл, защото принадлежиш към сбор {versammlung}. Ако имаш въпроси, говори със старейшините.",
  },
  sv: {
    betreff: "Din åtkomst till Församlingen {versammlung}",
    text: "Hej {name},\n\nFörsamlingen {versammlung} planerar mötena och tjänsten med Versammlung.app. Din åtkomst är klar.\n\nLogga in nu:\n{url}\n\nLänken gäller till {datum} och loggar bara in dig. Du behöver inget lösenord. Om den har gått ut öppnar du appen och trycker på ”Skicka länk”.\n\nDu får det här e-postmeddelandet eftersom du finns med i Församlingen {versammlung}. Om du har frågor kan du prata med de äldste.",
  },
  da: {
    betreff: "Din adgang til Menigheden {versammlung}",
    text: "Hej {name}\n\nMenigheden {versammlung} planlægger møderne og tjenesten med Versammlung.app. Din adgang er klar.\n\nLog ind nu:\n{url}\n\nLinket gælder til {datum} og logger kun dig ind. Du skal ikke bruge nogen adgangskode. Hvis det er udløbet, så åbn appen og tryk på “Send link”.\n\nDu får denne e-mail, fordi du hører til Menigheden {versammlung}. Har du spørgsmål, så tal med de ældste.",
  },
  fi: {
    betreff: "Pääsysi: {versammlung} seurakunta",
    text: "Hei {name},\n\n{versammlung} seurakunta suunnittelee kokoukset ja kenttäpalveluksen Versammlung.app-sovelluksella. Pääsysi on valmis.\n\nKirjaudu nyt:\n{url}\n\nLinkki on voimassa {datum} asti ja kirjaa sisään vain sinut. Salasanaa et tarvitse. Jos linkki on vanhentunut, avaa sovellus ja napauta ”Lähetä linkki”.\n\nSaat tämän sähköpostin, koska kuulut {versammlung} seurakuntaan. Jos sinulla on kysyttävää, puhu vanhinten kanssa.",
  },
  no: {
    betreff: "Din tilgang til Menigheten {versammlung}",
    text: "Hei {name},\n\nMenigheten {versammlung} planlegger møtene og felttjenesten med Versammlung.app. Tilgangen din er klar.\n\nLogg inn nå:\n{url}\n\nLenken gjelder til {datum} og logger bare inn deg. Du trenger ikke noe passord. Hvis den har utløpt, åpner du appen og trykker på «Send lenke».\n\nDu får denne e-posten fordi du hører til Menigheten {versammlung}. Har du spørsmål, kan du snakke med de eldste.",
  },
  tr: {
    betreff: "{versammlung} Cemaatine erişimin",
    text: "Merhaba {name},\n\n{versammlung} Cemaati ibadetleri ve tarla hizmetini Versammlung.app ile planlıyor. Erişimin hazır.\n\nŞimdi giriş yap:\n{url}\n\nBağlantı {datum} tarihine kadar geçerli ve yalnızca seni giriş yaptırır. Şifreye ihtiyacın yok. Süresi dolduysa uygulamayı aç ve “Bağlantı gönder” düğmesine dokun.\n\nBu e-postayı, {versammlung} Cemaatine bağlı olduğun için alıyorsun. Soruların varsa ihtiyarlarla konuş.",
  },
  zh: {
    betreff: "你在 {versammlung} 会众的登录方式",
    text: "{name}，你好：\n\n{versammlung} 会众使用 Versammlung.app 安排聚会和传道。你的账号已经准备好了。\n\n现在登录：\n{url}\n\n这个链接在{datum}前有效，只能让你本人登录。你不需要密码。如果链接已经过期，请打开应用，点按“发送链接”。\n\n你收到这封电子邮件，是因为你是 {versammlung} 会众的成员。如有问题，请跟长老联系。",
  },
  ja: {
    betreff: "{versammlung} 会衆へのアクセス",
    text: "{name} さん\n\n{versammlung} 会衆では、集会と野外奉仕の予定を Versammlung.app で立てています。あなたのアクセスの準備ができました。\n\n今すぐログインしてください：\n{url}\n\nこのリンクは {datum} まで有効で、あなただけがログインできます。パスワードは必要ありません。期限が切れた場合は、アプリを開いて「リンクを送信」をタップしてください。\n\nこのメールは、あなたが {versammlung} 会衆に属しているためお送りしています。ご不明な点は長老にご相談ください。",
  },
  ko: {
    betreff: "{versammlung} 회중 접속 안내",
    text: "{name} 님,\n\n{versammlung} 회중은 Versammlung.app으로 집회와 야외 봉사를 계획합니다. 접속 준비가 끝났습니다.\n\n지금 로그인하세요:\n{url}\n\n이 링크는 {datum}까지 유효하며 본인만 로그인됩니다. 비밀번호는 필요 없습니다. 링크가 만료되었으면 앱을 열고 ‘링크 보내기’를 누르세요.\n\n{versammlung} 회중의 성원이시기 때문에 이 이메일을 보내 드립니다. 궁금한 점이 있으면 장로들에게 문의하십시오.",
  },
  id: {
    betreff: "Akses Anda ke Sidang {versammlung}",
    text: "Halo {name},\n\nSidang {versammlung} merencanakan perhimpunan dan dinas lapangan dengan Versammlung.app. Akses Anda sudah siap.\n\nMasuk sekarang:\n{url}\n\nTautan ini berlaku sampai {datum} dan hanya untuk Anda. Anda tidak perlu kata sandi. Jika sudah kedaluwarsa, buka aplikasi dan ketuk ”Kirim tautan”.\n\nAnda menerima email ini karena Anda anggota Sidang {versammlung}. Jika ada pertanyaan, silakan bicara dengan para penatua.",
  },
  tl: {
    betreff: "Ang access mo sa Kongregasyon ng {versammlung}",
    text: "Kumusta {name},\n\nginagamit ng Kongregasyon ng {versammlung} ang Versammlung.app para iplano ang mga pulong at ang paglilingkod sa larangan. Handa na ang access mo.\n\nMag-log in ngayon:\n{url}\n\nPuwedeng gamitin ang link hanggang {datum}, at ikaw lang ang mai-log in nito. Hindi mo kailangan ng password. Kung expired na ito, buksan ang app at i-tap ang “Ipadala ang link”.\n\nNatanggap mo ang email na ito dahil kabilang ka sa Kongregasyon ng {versammlung}. Kung may tanong ka, kausapin ang mga elder.",
  },
  vi: {
    betreff: "Quyền truy cập của bạn vào Hội thánh {versammlung}",
    text: "Chào {name},\n\nHội thánh {versammlung} lên kế hoạch các buổi nhóm họp và việc rao giảng bằng Versammlung.app. Quyền truy cập của bạn đã sẵn sàng.\n\nĐăng nhập ngay:\n{url}\n\nĐường liên kết có hiệu lực đến {datum} và chỉ dành cho bạn. Bạn không cần mật khẩu. Nếu đã hết hạn, hãy mở ứng dụng và nhấn “Gửi liên kết”.\n\nBạn nhận được email này vì bạn thuộc Hội thánh {versammlung}. Nếu có thắc mắc, hãy nói chuyện với các trưởng lão.",
  },
  sw: {
    betreff: "Ufikiaji wako kwa Kutaniko la {versammlung}",
    text: "Habari {name},\n\nKutaniko la {versammlung} linapanga mikutano na utumishi wa shambani kwa kutumia Versammlung.app. Ufikiaji wako uko tayari.\n\nIngia sasa:\n{url}\n\nKiungo hiki ni halali hadi {datum} na kinakuingiza wewe peke yako. Huhitaji nenosiri. Kikiwa kimeisha muda wake, fungua programu na ugonge “Tuma kiungo”.\n\nUnapokea barua pepe hii kwa sababu wewe ni mshiriki wa Kutaniko la {versammlung}. Ukiwa na maswali, zungumza na wazee.",
  },
  ar: {
    betreff: "وصولك إلى جماعة {versammlung}",
    text: "مرحبًا {name}،\n\nتخطّط جماعة {versammlung} الاجتماعات وخدمة الحقل باستخدام Versammlung.app. وصولك جاهز.\n\nسجّل الدخول الآن:\n{url}\n\nالرابط صالح حتى {datum} ويسجّل دخولك أنت فقط. لا تحتاج إلى كلمة مرور. إذا انتهت صلاحيته، فافتح التطبيق واضغط على «إرسال الرابط».\n\nتصلك هذه الرسالة لأنك تنتمي إلى جماعة {versammlung}. إذا كانت لديك أسئلة، فتحدّث مع الشيوخ.",
  },
  he: {
    betreff: "הגישה שלך לקהילת {versammlung}",
    text: "שלום {name},\n\nקהילת {versammlung} מתכננת את האסיפות ואת שירות השדה באמצעות Versammlung.app. הגישה שלך מוכנה.\n\nלכניסה עכשיו:\n{url}\n\nהקישור בתוקף עד {datum} ומכניס רק אותך. אין צורך בסיסמה. אם פג תוקפו, פתח את היישום ולחץ על ”שליחת קישור”.\n\nקיבלת הודעה זו כי אתה שייך לקהילת {versammlung}. אם יש לך שאלות, דבר עם זקני הקהילה.",
  },
  fa: {
    betreff: "دسترسی شما به جماعت {versammlung}",
    text: "سلام {name}،\n\nجماعت {versammlung} جلسات و خدمت موعظه را با Versammlung.app برنامه‌ریزی می‌کند. دسترسی شما آماده است.\n\nاکنون وارد شوید:\n{url}\n\nاین پیوند تا {datum} معتبر است و فقط شما را وارد می‌کند. به رمز عبور نیازی ندارید. اگر منقضی شده است، برنامه را باز کنید و روی «ارسال پیوند» بزنید.\n\nاین ایمیل را دریافت می‌کنید، چون عضو جماعت {versammlung} هستید. اگر سؤالی دارید، با پیران جماعت صحبت کنید.",
  },
  ur: {
    betreff: "{versammlung} کلیسیا تک آپ کی رسائی",
    text: "سلام {name}،\n\n{versammlung} کلیسیا اپنے اِجلاسوں اور میدانی خدمت کی منصوبہ بندی Versammlung.app سے کرتی ہے۔ آپ کی رسائی تیار ہے۔\n\nابھی لاگ اِن کریں:\n{url}\n\nیہ لنک {datum} تک کارآمد ہے اور صرف آپ کو لاگ اِن کرتا ہے۔ آپ کو پاس ورڈ کی ضرورت نہیں۔ اگر اِس کی مدت ختم ہو گئی ہو تو ایپ کھولیں اور ”لنک بھیجیں“ پر ٹیپ کریں۔\n\nآپ کو یہ ای میل اِس لیے ملی ہے کیونکہ آپ {versammlung} کلیسیا کے رکن ہیں۔ اگر آپ کا کوئی سوال ہو تو بزرگوں سے بات کریں۔",
  },
}

/** Deutsch — der Rückfall, wenn die Sprache fehlt oder unbekannt ist. */
const DE: LinkMailTexte = {
  betreff: "Dein Zugang zur Versammlung {versammlung}",
  text: "Hallo {name},\n\ndie Versammlung {versammlung} plant die Zusammenkünfte und den Predigtdienst mit Versammlung.app. Dein Zugang ist eingerichtet.\n\nJetzt anmelden:\n{url}\n\nDer Link gilt bis {datum} und meldet nur dich an. Ein Passwort brauchst du nicht. Ist er abgelaufen, öffne die App und tippe auf „Link senden“.\n\nDu bekommst diese E-Mail, weil du in der Versammlung {versammlung} eingetragen bist. Bei Fragen sprich die Ältesten an.",
}

/** Texte für einen Sprachcode der App. Unbekannt oder fehlend → Deutsch. */
export const linkMailTexte = texteFuer(TEXTE, DE)
