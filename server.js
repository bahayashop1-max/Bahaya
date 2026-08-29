/*
 * Bahaya Shop - Digitalt Køsystem
 * ----------------------------------
 * Simpel, robust HTTP-server uden eksterne pakker (kun Node.js indbygget).
 * - Serverer kundesiden, staff-siden og display-siden.
 * - Gemmer hele køen i state.json, så intet går tabt ved refresh eller genstart.
 * - Kunder, staff og display holder sig opdateret ved at spørge serveren hvert sekund.
 *
 * Start:  node server.js
 * Port:   8080 (kan ændres med miljøvariablen PORT)
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
// DATA_DIR kan pege paa et Railway-volume, saa koeen overlever genstart/deploy.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const SERVICES = ['MoneyGram', 'Ria', 'Western Union', 'Bahaya Shop'];

// Admin-adgangskode. Saettes som miljoevariabel ADMIN_PASSWORD paa Railway.
// (Standardvaerdien her bruges kun hvis variablen ikke er sat.)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'skift-mig';

function isAdmin(req) {
  return req.headers['x-admin-key'] === ADMIN_PASSWORD;
}

// --- Åbningstider (dansk tid) ---
const TIMEZONE = 'Europe/Copenhagen';
const OPEN_HOUR = parseInt(process.env.OPEN_HOUR || '10', 10);   // åbner kl. 10
const CLOSE_HOUR = parseInt(process.env.CLOSE_HOUR || '18', 10); // lukker kl. 18
const SLOT_MIN = 15;            // tid mellem booking-tider (minutter)
const SLOT_CAPACITY = 1;        // hvor mange kan booke samme tid

// Nuværende tid i dansk tid som { date:'YYYY-MM-DD', hour, minute, weekday }
function localParts(d) {
  d = d || new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  });
  const p = {};
  fmt.formatToParts(d).forEach(x => { p[x.type] = x.value; });
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0;
  return { date: p.year + '-' + p.month + '-' + p.day, hour: hour, minute: parseInt(p.minute, 10), weekday: p.weekday };
}

function isOpenNow(lp) {
  lp = lp || localParts();
  if (state.override === 'open') return true;     // admin tvinger åben
  if (state.override === 'closed') return false;  // admin holder fri
  return lp.hour >= OPEN_HOUR && lp.hour < CLOSE_HOUR;
}

function addDays(dateStr, n) {
  const a = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(a[0], a[1] - 1, a[2]));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.getUTCFullYear() + '-' +
    String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getUTCDate()).padStart(2, '0');
}

// Næste åbningsdag man kan booke: i dag hvis før åbning, ellers i morgen
function bookingDate(lp) {
  lp = lp || localParts();
  // Holder admin fri, eller er vi efter åbningstid -> book i morgen. Ellers (før åbning) i dag.
  if (state.override !== 'closed' && lp.hour < OPEN_HOUR) return lp.date;
  return addDays(lp.date, 1);
}

// Alle tider på en åbningsdag: 10:00, 10:15 ... 15:45
function daySlots() {
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MIN) {
      slots.push(String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'));
    }
  }
  return slots;
}

// Ledige/optagede tider for en bestemt dato
function slotAvailability(date) {
  return daySlots().map(function (time) {
    const count = state.bookings.filter(function (b) { return b.date === date && b.time === time; }).length;
    return { time: time, taken: count >= SLOT_CAPACITY };
  });
}

// Fjern bookinger fra dage der er passeret
function prunePastBookings(lp) {
  lp = lp || localParts();
  const before = state.bookings.length;
  state.bookings = state.bookings.filter(function (b) { return b.date >= lp.date; });
  if (state.bookings.length !== before) saveState();
}

// ---------------------------------------------------------------------------
// State (køens data)
// ---------------------------------------------------------------------------
let state = {
  nextNumber: 1,           // næste kønummer der uddeles
  tickets: [],             // alle numre { id, number, service, name, status, createdAt, calledAt }
  lastCalled: null,        // sidst kaldte kunde { number, name, service, at, seq }
  callSeq: 0,              // tæller op hver gang nogen kaldes ind (bruges til animation på display)
  bookings: [],            // bookede tider { id, date, time, service, name, createdAt }
  override: 'auto'         // admin-styring: 'auto' (åbningstid), 'open' (tvunget åben), 'closed' (fri)
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
      if (!Array.isArray(state.tickets)) state.tickets = [];
      if (!Array.isArray(state.bookings)) state.bookings = [];
      // migrer fra gammelt manualClosed-felt
      if (!state.override) state.override = (state.manualClosed ? 'closed' : 'auto');
      if (['auto', 'open', 'closed'].indexOf(state.override) === -1) state.override = 'auto';
      delete state.manualClosed;
      console.log('State indlæst fra state.json (' + state.tickets.length + ' numre).');
    }
  } catch (err) {
    console.error('Kunne ikke læse state.json - starter med tom kø.', err.message);
  }
}

let saveTimer = null;
function saveState() {
  // Gem lidt forsinket, så mange hurtige ændringer ikke skriver til disk hver gang.
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
      console.error('Kunne ikke gemme state.json:', err.message);
    }
  }, 200);
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------------------------------------------------------------------------
// Hjælpefunktioner til køen
// ---------------------------------------------------------------------------
// Pænt dansk dato-label, fx "I dag (fre 29-08)" / "I morgen (lør 30-08)"
function dateLabel(date, lp) {
  lp = lp || localParts();
  const wd = { Mon: 'man', Tue: 'tir', Wed: 'ons', Thu: 'tor', Fri: 'fre', Sat: 'lør', Sun: 'søn' };
  const a = date.split('-').map(Number);
  const dt = new Date(Date.UTC(a[0], a[1] - 1, a[2]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  let prefix = '';
  if (date === lp.date) prefix = 'I dag / Maanta';
  else if (date === addDays(lp.date, 1)) prefix = 'I morgen / Berri';
  return { date: date, weekday: wd[weekday] || weekday, dayMonth: date.slice(8) + '-' + date.slice(5, 7), prefix: prefix };
}

function publicState() {
  const lp = localParts();
  const bDate = bookingDate(lp);
  return {
    services: SERVICES,
    nextNumber: state.nextNumber,
    lastCalled: state.lastCalled,
    callSeq: state.callSeq,
    open: isOpenNow(lp),
    override: state.override,
    localTime: String(lp.hour).padStart(2, '0') + ':' + String(lp.minute).padStart(2, '0'),
    localDate: lp.date,
    openHour: OPEN_HOUR,
    closeHour: CLOSE_HOUR,
    bookingDate: bDate,
    bookingLabel: dateLabel(bDate, lp),
    slots: slotAvailability(bDate),
    bookings: state.bookings
      .filter(function (b) { return b.date >= lp.date; })
      .sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }),
    tickets: state.tickets.map(t => ({
      id: t.id,
      number: t.number,
      service: t.service,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt,
      calledAt: t.calledAt
    }))
  };
}

// Antal personer foran i hele køen (ventende, lavere nummer)
function peopleAhead(ticket) {
  return state.tickets.filter(t =>
    t.status === 'waiting' &&
    t.number < ticket.number
  ).length;
}

// ---------------------------------------------------------------------------
// HTTP-hjælpere
// ---------------------------------------------------------------------------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) req.destroy(); // beskyt mod for store forespørgsler
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { resolve({}); }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Ikke fundet');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function handleApi(req, res, url) {
  const route = url.pathname;

  // Admin-login (staff-siden tjekker adgangskoden her)
  if (route === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    if ((body.password || '') === ADMIN_PASSWORD) return sendJson(res, 200, { ok: true });
    return sendJson(res, 401, { error: 'wrong_password' });
  }

  // Fælles state (kunde, staff, display bruger denne)
  if (route === '/api/state' && req.method === 'GET') {
    return sendJson(res, 200, publicState());
  }

  // Status for ét bestemt nummer (kundens egen side)
  if (route === '/api/ticket' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    const ticket = state.tickets.find(t => t.id === id);
    if (!ticket) return sendJson(res, 404, { error: 'not_found' });
    return sendJson(res, 200, {
      id: ticket.id,
      number: ticket.number,
      service: ticket.service,
      name: ticket.name,
      status: ticket.status,
      ahead: peopleAhead(ticket)
    });
  }

  // Kunden tager et nummer (kun i åbningstiden)
  if (route === '/api/take' && req.method === 'POST') {
    if (!isOpenNow()) return sendJson(res, 403, { error: 'closed' });
    const body = await readBody(req);
    const service = (body.service || '').trim();
    const name = (body.name || '').trim().slice(0, 40);
    if (!SERVICES.includes(service)) return sendJson(res, 400, { error: 'invalid_service' });
    if (!name) return sendJson(res, 400, { error: 'missing_name' });

    const ticket = {
      id: makeId(),
      number: state.nextNumber++,
      service,
      name,
      status: 'waiting',
      createdAt: Date.now(),
      calledAt: null
    };
    state.tickets.push(ticket);
    saveState();
    return sendJson(res, 200, {
      id: ticket.id,
      number: ticket.number,
      service: ticket.service,
      name: ticket.name,
      status: ticket.status,
      ahead: peopleAhead(ticket)
    });
  }

  // Kunden booker en tid til næste åbningsdag
  if (route === '/api/book' && req.method === 'POST') {
    const lp = localParts();
    prunePastBookings(lp);
    const body = await readBody(req);
    const service = (body.service || '').trim();
    const name = (body.name || '').trim().slice(0, 40);
    const time = (body.time || '').trim();
    const bDate = bookingDate(lp);
    if (!SERVICES.includes(service)) return sendJson(res, 400, { error: 'invalid_service' });
    if (!name) return sendJson(res, 400, { error: 'missing_name' });
    if (!daySlots().includes(time)) return sendJson(res, 400, { error: 'invalid_time' });
    // Tjek at tiden ikke er fyldt
    const taken = state.bookings.filter(function (b) { return b.date === bDate && b.time === time; }).length;
    if (taken >= SLOT_CAPACITY) return sendJson(res, 409, { error: 'slot_taken' });

    const booking = {
      id: makeId(),
      date: bDate,
      time: time,
      service: service,
      name: name,
      createdAt: Date.now()
    };
    state.bookings.push(booking);
    saveState();
    return sendJson(res, 200, { booking: booking, label: dateLabel(bDate, lp) });
  }

  // Kunden ser sin egen booking
  if (route === '/api/booking' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    const b = state.bookings.find(function (x) { return x.id === id; });
    if (!b) return sendJson(res, 404, { error: 'not_found' });
    return sendJson(res, 200, { booking: b, label: dateLabel(b.date) });
  }

  // Admin styrer åben/lukket: mode = 'auto' | 'open' | 'closed'
  if (route === '/api/set-mode' && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'unauthorized' });
    const body = await readBody(req);
    const mode = body.mode;
    if (['auto', 'open', 'closed'].indexOf(mode) === -1) return sendJson(res, 400, { error: 'invalid_mode' });
    state.override = mode;
    saveState();
    return sendJson(res, 200, { ok: true, override: state.override });
  }

  // Staff fjerner en booking (fx når kunden er ekspederet)
  if (route === '/api/booking-remove' && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'unauthorized' });
    const body = await readBody(req);
    state.bookings = state.bookings.filter(function (b) { return b.id !== body.id; });
    saveState();
    return sendJson(res, 200, { ok: true });
  }

  // Staff kalder en kunde ind
  if (route === '/api/call' && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'unauthorized' });
    const body = await readBody(req);
    const ticket = state.tickets.find(t => t.id === body.id);
    if (!ticket) return sendJson(res, 404, { error: 'not_found' });
    ticket.status = 'called';
    ticket.calledAt = Date.now();
    state.callSeq++;
    state.lastCalled = {
      number: ticket.number,
      name: ticket.name,
      service: ticket.service,
      at: ticket.calledAt,
      seq: state.callSeq
    };
    saveState();
    return sendJson(res, 200, { ok: true });
  }

  // Staff markerer en kunde som færdig (fjernes fra listen)
  if (route === '/api/done' && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'unauthorized' });
    const body = await readBody(req);
    const ticket = state.tickets.find(t => t.id === body.id);
    if (!ticket) return sendJson(res, 404, { error: 'not_found' });
    ticket.status = 'done';
    saveState();
    return sendJson(res, 200, { ok: true });
  }

  // Staff nulstiller alle numre
  if (route === '/api/reset' && req.method === 'POST') {
    if (!isAdmin(req)) return sendJson(res, 401, { error: 'unauthorized' });
    state.nextNumber = 1;
    state.tickets = [];
    state.lastCalled = null;
    state.callSeq = 0;
    saveState();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'unknown_route' });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(err => {
      console.error('API-fejl:', err);
      sendJson(res, 500, { error: 'server_error' });
    });
    return;
  }

  // Statiske filer
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // Beskyt mod at læse uden for public-mappen
  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('403');
    return;
  }
  serveFile(res, safePath);
});

loadState();
server.listen(PORT, () => {
  console.log('====================================================');
  console.log('  BAHAYA SHOP KØSYSTEM kører');
  console.log('  Kunde:   http://localhost:' + PORT);
  console.log('  Staff:   http://localhost:' + PORT + '/staff.html');
  console.log('  Display: http://localhost:' + PORT + '/display.html');
  console.log('====================================================');
});
