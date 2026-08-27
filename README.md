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

## Offentligt link (kunder på 4G/5G/eget internet)

For at kunder kan bruge deres **egen telefon og eget internet** (ikke butikkens Wi-Fi),
bruger vi **Cloudflare Tunnel** (`cloudflared`). Det gør `http://localhost:8080`
tilgængeligt som et `https://...` link.

### Hurtig løsning (gratis, men linket skifter)
1. Hent **`cloudflared-windows-amd64.exe`** fra Cloudflare:
   https://github.com/cloudflare/cloudflared/releases/latest
   (find filen der hedder `cloudflared-windows-amd64.exe`).
2. Læg filen i **samme mappe** som `START_BAHAYA.bat`.
3. Kør `START_BAHAYA.bat`. Der åbner et vindue **"BAHAYA TUNNEL"**.
4. I det vindue står et link som:
   `https://noget-tilfaeldigt.trycloudflare.com`
5. Det link er kundens link. Del det (fx som QR-kode).

> Med denne gratis metode skifter linket hver gang du genstarter.

### Stabil løsning (fast link, fx `ko.bahayashop.dk`)
Hvis du vil have et **fast link der ikke skifter**, skal du:
1. Have et domæne (fx `bahayashop.dk`) tilføjet i en gratis **Cloudflare-konto**.
2. Oprette en **named tunnel**:
   ```
   cloudflared login
   cloudflared tunnel create bahaya
   cloudflared tunnel route dns bahaya ko.bahayashop.dk
   ```
3. Så kører du fremover tunnelen med det faste navn i stedet for `--url`.

Sig til, så laver jeg en færdig opskrift (og en `config.yml`) til netop dit domæne.

> **OBS:** Cloudflare **WARP** er IKKE det samme som **cloudflared**.
> Til tunnelen bruger vi **cloudflared** (`cloudflared-windows-amd64.exe`).

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
