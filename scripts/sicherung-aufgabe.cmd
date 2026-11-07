@echo off
rem ===========================================================================
rem  Woechentliche Sicherung, gestartet von der Windows-Aufgabenplanung (T168).
rem ===========================================================================
rem  Eintragen (einmal, in einer Eingabeaufforderung als der angemeldete Nutzer):
rem
rem    schtasks /Create /TN "Versammlung.app Sicherung" /SC WEEKLY /D MON
rem      /ST 07:30 /TR "\"C:\DATA\Claude\jw-congregation-planner\scripts\sicherung-aufgabe.cmd\""
rem
rem  Warum eine .cmd und nicht direkt `node`: Die Aufgabenplanung kennt kein
rem  Arbeitsverzeichnis fuer den Befehl, `zugangsdaten()` liest den Schluessel
rem  aber aus `.env.local` im Projektordner. Das `cd` unten ist der Grund
rem  dieser Datei; der Pfad kommt aus ihrer eigenen Lage (%~dp0), damit ein
rem  verschobenes Projekt nicht still ins Leere laeuft.
rem
rem  Ohne Argument geht die Sicherung nach ZIEL_VORGABE aus scripts/sicherung.mjs
rem  (ein Test haelt beide Angaben gleich). Ein erstes Argument ueberschreibt es.
rem
rem  Alles, was der Lauf sagt, landet in lauf.log im Sicherungsordner — sonst
rem  liefe die Aufgabe jahrelang und niemand wuesste, ob sie je etwas schrieb.
rem ===========================================================================
setlocal
set "ZIEL=%~1"
if "%ZIEL%"=="" set "ZIEL=C:\DATA\Claude\jw-sicherungen"
cd /d "%~dp0.." || exit /b 1
if not exist "%ZIEL%" mkdir "%ZIEL%"
echo ==== %DATE% %TIME% >> "%ZIEL%\lauf.log"
node scripts\sicherung.mjs --ziel "%ZIEL%" >> "%ZIEL%\lauf.log" 2>&1
set RC=%ERRORLEVEL%
echo ---- Ende, Rueckgabe %RC% >> "%ZIEL%\lauf.log"
exit /b %RC%
