# Bahaya Shop – Digitalt Køsystem

Et enkelt, robust køsystem til Bahaya Shop (MoneyGram, Ria, Western Union).
Kunder tager et nummer på deres egen telefon, personalet kalder dem ind, og
et TV/display viser det aktuelle nummer.

---

## Hvad er hvad

| Fil / mappe            | Hvad det er                                             |
|------------------------|---------------------------------------------------------|
| `server.js`            | Motoren (serveren) der styrer køen. Kræver Node.js.     |
| `public/index.html`    | **Kundesiden** – vælg service, skriv navn, tag nummer.  |
| `public/staff.html`    | **Staff-siden** – se kø, kald ind, nulstil.             |
| `public/display.html`  | **Display/TV-siden** – stort tal på skærmen.            |
| `START_BAHAYA.bat`     | Start hele systemet med ét dobbeltklik.                 |
| `state.json`           | Køens data. **Oprettes automatisk** – slet den ikke.    |

Adresser når systemet kører:

- Kunde:   `http://localhost:8080`
- Staff:   `http://localhost:8080/staff.html`
- Display: `http://localhost:8080/display.html`

---

## Sådan starter du systemet (om morgenen)

### Én gang – installer Node.js
1. Gå til **https://nodejs.org**
2. Klik på den store knap der siger **"LTS"** og installer (bare klik Næste/Next hele vejen).
3. Genstart computeren én gang.

Det skal du kun gøre **én gang**.

### Hver morgen
1. Åbn mappen `Bahaya_Queue_Network` (den **udpakkede** mappe – ikke inde i en ZIP).
2. Dobbeltklik på **`START_BAHAYA.bat`**.
3. Der åbner sig et par sorte vinduer og tre sider i browseren. **Luk ikke de sorte vinduer** – de skal blive åbne så længe butikken har åbent.

Færdig. Systemet kører nu.

> ⚠️ **Vigtigt:** Kør altid filerne fra den **udpakkede** mappe.
> Åbn dem ALDRIG direkte inde fra ZIP/WinRAR – så virker serverforbindelsen ikke.

---

## Offentligt link – Railway (anbefalet)

I stedet for laptop + Cloudflare kører systemet på **Railway**. Railway giver dig
automatisk et **fast, offentligt `https://...`-link**, der ikke skifter, og som
kunder kan åbne på deres egen telefon (4G/5G/eget Wi-Fi). Ingen laptop skal stå tændt.

Adresser når det kører på Railway (samme link, forskellige sider):

- Kunde:   `https://DIT-PROJEKT.up.railway.app`
- Staff:   `https://DIT-PROJEKT.up.railway.app/staff.html`
- Display: `https://DIT-PROJEKT.up.railway.app/display.html`

### Kom på Railway
1. Push denne kode til GitHub (branchen er allerede pushet).
2. Gå til **railway.app** → **New Project** → **Deploy from GitHub repo** → vælg `bahaya-shop`.
3. Railway ser selv `package.json` og starter med `npm start`. Ingen ekstra opsætning.
4. Under **Settings → Networking → Generate Domain** får du dit faste link.

### Så køen ikke nulstilles ved genstart (valgfrit men anbefalet)
Railways disk nulstilles ved hver ny deploy. For at gemme køen permanent:
1. I Railway: **New → Volume**, mount path fx `/data`.
2. Under **Variables** tilføj: `DATA_DIR = /data`
Så gemmes `state.json` på volumet og overlever genstart og deploy.

### Eget domæne (fx `ko.bahayashop.dk`)
Har du et domæne (fx via GitHub Student Pack / Namecheap), kan du i Railway under
**Settings → Networking → Custom Domain** skrive `ko.bahayashop.dk` og oprette den
CNAME-record Railway viser hos din domæne-udbyder.

---

## Lokal kørsel (kun til test på egen PC)

`START_BAHAYA.bat` kan stadig bruges til at teste lokalt uden internet.
Til rigtige kunder bruger du Railway-linket ovenfor.

---

## Sådan bruger personalet det

1. Åbn **staff-siden**: `http://localhost:8080/staff.html`
2. Se alle i kø. Filtrér øverst på **Alle / MoneyGram / Ria / Western Union**.
3. Tryk **"U yeer / Kald ind"** ud for den kunde du vil ekspedere.
   - Kundens telefon skifter automatisk til "DU BLIVER KALDT IND".
   - Display/TV viser nummeret stort.
4. Tryk **"Færdig"** når kunden er ekspederet (fjerner dem fra listen).
5. **"Reset Numbers"** nulstiller hele køen (fx næste dag).

---

## Åbningstider og booking

Systemet har åbningstider (standard **10:00–18:00**, dansk tid):

- **Inden for åbningstid:** kunden tager et live-nummer som normalt.
- **Uden for åbningstid (lukket):** kunden kan ikke tage nummer, men kan **booke en tid**
  til næste åbningsdag (tider hvert 15. minut). Personalet ser bookingerne nederst
  på staff-siden under **"Ballamaha / Bookede tider"**.

Vil du ændre åbningstiderne? I Railway → **Variables**:
- `OPEN_HOUR` = fx `10`
- `CLOSE_HOUR` = fx `18`

**Manuel styring (åbn/luk):** Øverst på staff-siden vises butikkens status og en knap:

- Er butikken **åben** → knappen hedder **"Hold fri / Luk butik"** (lukker med det samme, også i åbningstiden).
- Er butikken **lukket** → knappen hedder **"Åbn butik nu"** (åbner med det samme, også uden for 10–18).
- Har du overstyret manuelt, vises **"↺ Automatisk efter åbningstid"** — tryk for at følge de normale tider igen.

Så du kan altid selv **åbne** eller **lukke** butikken, uanset klokken.

## Data og sikkerhed

- Hele køen gemmes i **`state.json`**. Derfor:
  - Kunder mister ikke deres nummer ved at opdatere (refresh) siden.
  - Køen overlever hvis serveren genstartes.
- Bliver et nummer væk pga. reset, får kundens side automatisk besked.

---

## Hvis noget ikke virker

- **"Node.js er ikke installeret"** i det sorte vindue → installer Node.js (se ovenfor).
- **Siderne åbner ikke** → tjek at **BAHAYA SERVER**-vinduet er åbent og ikke viser en fejl.
- **Kunder udefra kan ikke komme på** → tjek at **BAHAYA TUNNEL**-vinduet er åbent, og at du bruger `https://...trycloudflare.com`-linket derfra.

Send et screenshot af det sorte vindue, hvis du er i tvivl – så hjælper jeg videre.
