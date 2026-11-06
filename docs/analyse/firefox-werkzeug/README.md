# Firefox messen

Das Browser-Pane der Desktop-App ist Chromium. Was nur Firefox tut, zeigt nur
Firefox selbst: hier ohne Fenster, mit einem Wegwerf-Profil, gesteuert über
WebDriver BiDi. Firefox bringt das mit (gefahren mit 159), Node ab 22 den
`WebSocket` — es braucht kein Paket. Der Firefox des Benutzers bleibt
unberührt (`--no-remote`, eigenes Profil).

## Fahren

Dev-Server starten (`npm run dev`, Port 5173), dann:

```
node docs/analyse/firefox-werkzeug/firefox.mjs --url "http://localhost:5173/demo.html?x=1#s=planen&tab=wp&me=p6&t=dunkel&fs=1" --aufbau plan-vorschau-aufbau.js --messen plan-vorschau-messen.js --varianten t162-varianten.json
```

Schmal: `--breite 320 --hoehe 900` und `fs=1.45` im Hash; `l=ar` für
rechts nach links. Je Variante steht die Messung in der Konsole und ein Bild in
`%TEMP%\firefox-messung` (`--aus` ändert das). Eine Variante ist CSS, das über
den Stand gelegt wird — so lassen sich alt und neu in einem Lauf vergleichen.

Die Messung gilt für Firefox. In Chromium meldet dieselbe Probe Kürzungen um
3 bis 8 px, die es im Bild nicht gibt.

## T162, Befund 11 (6.11.2026, Firefox 159)

`alt` ist die Grenze `calc(100% - 54px)`, `neu` die an der Zeile (`100cqi`).

- Alle 109 Namen der Demo samt „Gruppe 1" bis „Gruppe 9" in der ersten Zeile,
  1440 px: `alt` kürzt je Schriftstufe 1 bis 14 davon um 1/60 px (bei Stufe 1
  unter anderem „Gruppe 5" und „Erik Kühn"), `neu` keinen.
- 320, 375, 768 und 1440 px, Stufe 1 und 1,45, Deutsch und Arabisch (16 Läufe):
  `neu` meldet nie mehr als `alt`. Wo `alt` nur um 1/60 px kürzt, ist `neu`
  frei; wo neben dem ✕ wirklich der Platz fehlt (320 und 375 px, Stufe 1,45),
  kürzen beide dieselben langen Namen um dasselbe. Nirgends ein Rollbalken, ein
  ✕ unter der Auswahl oder etwas, das aus der Zeile ragt.

Hintergrund im Abschnitt zu T162 in `docs/analyse/todo.md`.
