@echo off
REM ============================================================
REM   BAHAYA SHOP - Digitalt Koesystem - START
REM   Dobbeltklik paa denne fil om morgenen for at starte alt.
REM ============================================================
title BAHAYA SHOP - Kontrol
cd /d "%~dp0"

echo.
echo ==========================================================
echo    BAHAYA SHOP KOESYSTEM starter...
echo ==========================================================
echo.

REM --- Tjek at Node.js er installeret ---
where node >nul 2>nul
if errorlevel 1 (
  echo FEJL: Node.js er ikke installeret.
  echo Hent og installer Node.js fra: https://nodejs.org  ^(vaelg "LTS"^)
  echo Koer derefter denne fil igen.
  echo.
  pause
  exit /b
)

REM --- 1) Start koeserveren i sit eget vindue ---
echo Starter koeserveren paa port 8080...
start "BAHAYA SERVER (luk ikke)" cmd /k "node server.js"

REM Vent lidt saa serveren naar at starte
timeout /t 3 /nobreak >nul

REM --- 2) Start Cloudflare-tunnel (offentligt link), hvis filen findes ---
if exist "cloudflared-windows-amd64.exe" (
  echo Starter offentligt internet-link ^(Cloudflare^)...
  start "BAHAYA TUNNEL (luk ikke)" cmd /k "cloudflared-windows-amd64.exe tunnel --url http://localhost:8080"
) else (
  echo BEMAERK: cloudflared-windows-amd64.exe blev ikke fundet.
  echo Systemet virker lokalt, men kunder udefra kan ikke komme paa endnu.
  echo Se README for hvordan du saetter det offentlige link op.
)

REM Vent lidt inden vi aabner siderne
timeout /t 3 /nobreak >nul

REM --- 3) Aabn de tre sider i browseren ---
echo Aabner sider...
start "" "http://localhost:8080/staff.html"
start "" "http://localhost:8080/display.html"
start "" "http://localhost:8080"

echo.
echo ==========================================================
echo    ALT ER STARTET.
echo    - Server-vinduet og Tunnel-vinduet skal blive aabne.
echo    - Luk dem IKKE, saa laenge butikken har aabent.
echo.
echo    Staff:   http://localhost:8080/staff.html
echo    Display: http://localhost:8080/display.html
echo    Kunde:   http://localhost:8080
echo.
echo    Det offentlige kunde-link ^(https://....trycloudflare.com^)
echo    staar i "BAHAYA TUNNEL"-vinduet.
echo ==========================================================
echo.
echo Dette vindue kan du lukke. De to andre skal blive aabne.
pause
