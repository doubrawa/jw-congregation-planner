#!/usr/bin/env bash
#
# Erzeugt alle Screenshots der Benutzerdokumentation neu.
#
# Voraussetzung: der Dev-Server läuft (`npm run dev`, Port 5173). Die App wird
# über den DEV-Debug-Hash direkt in den jeweiligen Zustand versetzt
# (Demo-Modus, kein Login/Netz):
#   #s=<screen>&tab=<mid|we|fs>&pl=<0|1>&p=<personId>&me=<personId>&t=<theme>&l=<lang>&c=<congLang>
# (`p=` waehlt eine Person im Personen-Screen aus, `me=` meldet sie an — davon
#  haengt ab, was jemand von seiner eigenen Gruppe sieht.)
# Details siehe src/app/init.ts (parseDebugHash).
#
# Aufruf:  bash docs/user-guide/capture-screenshots.sh
#
set -euo pipefail

CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
BASE="http://localhost:5173"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/screenshots"
PROFILE="${TEMP:-/tmp}/jw-doc-chrome"
# `--window-size` meint hier das FENSTER, nicht den Sichtbereich: Chrome unter
# Windows zieht den Rahmen ab, aus 920 werden rund 904 px Sichtbereich. Der
# ganze Bestand ist deshalb in der schmalen Spalte aufgenommen — Sidebar 232 +
# App-Spalte 430 = 662 px breit, der 920er-Umbruch auf 660 px greift nicht.
# Ein Chromium unter Linux (headless=new) zieht anders ab: die Breite bleibt,
# von der Höhe gehen 87 px weg, und --screenshot nimmt nur den Sichtbereich auf
# statt der ganzen Seite. Damit fallen die Bilder kürzer aus als die abgelegten.
# Wer dort aufnimmt, stellt deshalb nicht das Fenster ein, sondern steuert den
# Browser fern: Sichtbereich (W-16)x(H-95), Aufnahme der ganzen Seite,
# zugeschnitten auf WxH. Das ist genau das, was Chrome unter Windows von selbst
# tut, und trifft den abgelegten Bestand auf ein paar Pixel genau (die
# Schriftmetrik unterscheidet sich). Einzelne Shots (Login ohne Sidebar)
# überschreiben die Größe über ein drittes Feld `BxH`.
W=920
H=940

mkdir -p "$OUT_DIR"

# Aufgenommen wird zuerst daneben; abgelegt wird nur, was wirklich entstanden
# ist (siehe unten).
ROH="$(mktemp -d)"
trap 'rm -rf "$ROH"' EXIT

if ! curl -s -o /dev/null "$BASE/"; then
  echo "FEHLER: Dev-Server läuft nicht auf $BASE — bitte 'npm run dev' starten." >&2
  exit 1
fi

# name|hash[|BxH]  (hash ohne führendes #; optionale Größe überschreibt W×H —
# die Breite bleibt dabei ${W}, damit ein geändertes W wirklich für alle gilt)
SHOTS=(
  # 860 statt 780, seit Zweck-Satz und Kontaktzeile dazukamen (T113): Der
  # Inhalt ist rund 756 px hoch, bei 780 blieben nur 24 px Luft.
  "login|s=login|${W}x860"
  "programm-woche|s=programm&tab=mid"
  "programm-wochenende|s=programm&tab=we"
  "programm-treffpunkte|s=programm&tab=fs"
  "verkuendiger-start|s=start&pl=0&p=p9"
  "verkuendiger-aufgaben|s=aufgaben&pl=0&p=p9"
  "verkuendiger-profil|s=profil&pl=0&p=p9"
  # Angemeldet als p9 (Gruppe 1): zeigt die Treffpunkte der EIGENEN Gruppe —
  # fremde Gruppen stehen hier bewusst nicht (siehe fsVisible in src/data/fs.ts).
  "verkuendiger-treffpunkte|s=programm&tab=fs&pl=0&me=p9"
  # Angemeldet (me=), damit der Gruß einen Namen trägt; höher als der Rest, weil
  # die Planungs-Karte (T95) über der Zeitleiste steht und im Demo-Bestand
  # vier Wochen nennt — nichts davon ist gesendet.
  "planer-start|s=start&me=p9|${W}x1300"
  "planer-aufgaben|s=aufgaben"
  "planer-planen-woche|s=planen&tab=mid"
  "planer-planen-treffpunkte|s=planen&tab=fs"
  # „Plan senden" (T99) steht am Ende der Woche. Aufgenommen im
  # Treffpunkt-Reiter, weil der kurz genug ist, dass die Karte mit ins Bild
  # passt — sie gilt ohnehin für die ganze Woche, nicht für den Reiter.
  "planer-plan-senden|s=planen&tab=fs|${W}x2100"
  "planer-personen|s=personen"
  # höher als der Rest: unter den Stammdaten folgen die Zeitleiste der
  # Zuteilungen, die Abwesenheiten und die beiden Bereichs-Karten (Aufgaben,
  # Hilfsdienste). Reicht die Höhe nicht, schneidet Chrome unten ab — die Seite
  # war mit der Abwesenheiten-Karte auf 2946px gewachsen.
  "planer-person-detail|s=personen&p=p1|${W}x3100"
  "planer-einstellungen|s=einstellungen"
  # Gruppenaufseher: kein Planer (pl=0), aber Aufseher von Gruppe 1 (p1). Die
  # Planen-Seite zeigt ihm ausschließlich die Treffpunkte SEINER Gruppe —
  # deshalb hier und nicht im Planer-Kapitel.
  "verkuendiger-gruppenaufseher|s=planen&pl=0&me=p1"
  "offline-stand|s=programm&tab=mid&stale=5"
)

# Zugeschnitten wird nur, was eben aufgenommen wurde. Schneidet man den ganzen
# Ordner, trifft es auch die abgelegten Bilder, die gar nicht neu entstanden
# sind (Chrome gescheitert) — und ein zweiter Schnitt frisst jedes Mal ein
# Stück Rand weg.
FRISCH=()

for entry in "${SHOTS[@]}"; do
  IFS='|' read -r name hash size <<< "$entry"
  w="$W"; h="$H"
  if [ -n "${size:-}" ]; then w="${size%x*}"; h="${size#*x}"; fi
  hash="$hash&t=weiss&shot=1" # helles Theme + Screenshot-Modus (Spaltenschatten aus)
  roh="$ROH/$name.png"
  # Windows-Pfad für Chrome (Vorwärts-Slashes funktionieren)
  "$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$PROFILE" --window-size="$w,$h" --force-device-scale-factor=1 \
    --hide-scrollbars --virtual-time-budget=8000 \
    --screenshot="$roh" "$BASE/#$hash" >/dev/null 2>&1 || true
  if [ -f "$roh" ]; then
    mv "$roh" "$OUT_DIR/$name.png"
    echo "  ✓ $name.png"
    FRISCH+=("$OUT_DIR/$name.png")
  else
    echo "  ✗ $name.png (nicht erzeugt — das abgelegte Bild bleibt stehen)" >&2
  fi
done

if [ "${#FRISCH[@]}" -eq 0 ]; then
  echo "FEHLER: kein einziges Bild entstanden — nichts zugeschnitten." >&2
  exit 1
fi

# Auf den Inhalt zuschneiden (entfernt die einfarbige Zentrier-Lücke rundherum).
echo "Zuschneiden ..."
node "$(dirname "$0")/trim.mjs" "${FRISCH[@]}"

echo "Fertig — ${#FRISCH[@]} Screenshots in $OUT_DIR"
