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
const STATE_FILE = path.join(__dirname, 'state.json');

const SERVICES = ['MoneyGram', 'Ria', 'Western Union'];

// ---------------------------------------------------------------------------
// State (køens data)
// ---------------------------------------------------------------------------
let state = {
  nextNumber: 1,           // næste kønummer der uddeles
  tickets: [],             // alle numre { id, number, service, name, status, createdAt, calledAt }
  lastCalled: null,        // sidst kaldte kunde { number, name, service, at, seq }
  callSeq: 0               // tæller op hver gang nogen kaldes ind (bruges til animation på display)
};

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
      if (!Array.isArray(state.tickets)) state.tickets = [];
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
function publicState() {
  return {
    services: SERVICES,
    nextNumber: state.nextNumber,
    lastCalled: state.lastCalled,
    callSeq: state.callSeq,
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

// Antal personer foran (samme service, ventende, lavere nummer)
function peopleAhead(ticket) {
  return state.tickets.filter(t =>
    t.status === 'waiting' &&
    t.service === ticket.service &&
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

  // Kunden tager et nummer
  if (route === '/api/take' && req.method === 'POST') {
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

  // Staff kalder en kunde ind
  if (route === '/api/call' && req.method === 'POST') {
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
    const body = await readBody(req);
    const ticket = state.tickets.find(t => t.id === body.id);
    if (!ticket) return sendJson(res, 404, { error: 'not_found' });
    ticket.status = 'done';
    saveState();
    return sendJson(res, 200, { ok: true });
  }

  // Staff nulstiller alle numre
  if (route === '/api/reset' && req.method === 'POST') {
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
