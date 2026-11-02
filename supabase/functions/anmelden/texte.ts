/**
 * **Neue Anmeldung** — Titel und Text je Sprache.
 *
 * Meldet sich ein Gerät mit dem Link oder Code einer Person an, die schon ein
 * Konto hat, erfährt das Konto davon: in der Glocke und per Push an seine
 * übrigen Geräte. Einen neuen Link stellt der Admin aus; ohne die Meldung
 * könnte er sich damit unbemerkt als jedes Mitglied anmelden.
 *
 * Der Push ist fertiger Text, sobald er das Gerät erreicht. Die Glocke steht
 * kanonisch deutsch in der Datenbank und übersetzt beim Anzeigen
 * (`NOTIF_TITLE_KEY`, `NOTIF_TEXT_KEY` in `src/i18n/ui.ts`) — dort stehen
 * dieselben Sätze, und `texte.test.ts` hält beide Ablagen gleich.
 */

import { texteFuer } from '../_shared/texte.ts'

export interface AnmeldeTexte {
  titel: string
  text: string
}

/** Kanonisch deutsch — zugleich die Schlüssel, unter denen die Glocke übersetzt. */
export const TITEL_NEUE_ANMELDUNG = 'Neue Anmeldung'
export const TEXT_NEUE_ANMELDUNG = 'Mit deinem Zugang wurde ein Gerät angemeldet. Warst du das nicht, sag es bitte den Ältesten.'

const DE: AnmeldeTexte = { titel: TITEL_NEUE_ANMELDUNG, text: TEXT_NEUE_ANMELDUNG }

const TEXTE: Record<string, AnmeldeTexte> = {
  de: DE,
  ar: { titel: 'تسجيل دخول جديد', text: 'تم تسجيل الدخول إلى حسابك من جهاز. إن لم يكن ذلك منك، فيُرجى إبلاغ الشيوخ.' },
  en: { titel: 'New login', text: 'A device has been logged in to your account. If that wasn’t you, please tell the elders.' },
  es: { titel: 'Nuevo inicio de sesión', text: 'Se inició sesión en un dispositivo con tu acceso. Si no fuiste tú, díselo a los ancianos.' },
  fa: { titel: 'ورود جدید', text: 'یک دستگاه با حساب شما وارد شد. اگر شما نبودید، لطفاً به پیران جماعت اطلاع دهید.' },
  fr: { titel: 'Nouvelle connexion', text: 'Un appareil s’est connecté avec ton accès. Si ce n’était pas toi, préviens les anciens.' },
  it: { titel: 'Nuovo accesso', text: 'Un dispositivo ha effettuato l’accesso al tuo account. Se non eri tu, avvisa gli anziani.' },
  pl: { titel: 'Nowe logowanie', text: 'Na twoje konto zalogowano się na urządzeniu. Jeśli to nie ty, powiedz o tym starszym.' },
  ro: { titel: 'Autentificare nouă', text: 'Un dispozitiv s-a conectat la contul tău. Dacă nu ai fost tu, spune-le bătrânilor.' },
  ru: { titel: 'Новый вход', text: 'В ваш аккаунт вошли с устройства. Если это были не вы, сообщите старейшинам.' },
  tr: { titel: 'Yeni giriş', text: 'Hesabına bir cihazdan giriş yapıldı. Sen değilsen lütfen ihtiyarlara söyle.' },
  uk: { titel: 'Новий вхід', text: 'У ваш акаунт увійшли з пристрою. Якщо це були не ви, скажіть про це старійшинам.' },
}

/** Texte für eine Sprache; unbekannte Codes fallen auf Deutsch zurück. */
export const anmeldeTexte = texteFuer(TEXTE, DE)
