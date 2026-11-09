'use strict';

const item = document.querySelector('#item');
const message = document.querySelector('#message');
const pay = document.querySelector('#pay');
const params = new URLSearchParams(window.location.search);
const sessionId = params.get('session_id');
let attempt;

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error('Checkout request failed');
  return response.json();
}

async function showStatus() {
  message.textContent = 'Waxaan sugaynaa xaqiijinta lacag-bixinta…';
  for (let tries = 0; tries < 10; tries++) {
    const { status } = await request('/api/status?session_id=' + encodeURIComponent(sessionId));
    if (status === 'paid') {
      message.textContent = 'Lacag-bixinta waa la xaqiijiyey.';
      return;
    }
    if (status === 'failed') {
      message.textContent = 'Lacag-bixintu ma guulaysan.';
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  message.textContent = 'Xaqiijintu weli way socotaa. Boggan dib u fur si aad u eegto xaaladda.';
}

async function showItem() {
  const product = await request('/api/item');
  const amount = new Intl.NumberFormat('da-DK', {
    style: 'currency', currency: 'DKK'
  }).format(product.amount / 100);
  item.textContent = product.name + ' · ' + amount;
  const notice = product.live ? '' : 'Habka tijaabada. ';
  message.textContent = notice + (params.has('cancelled') ?
    'Waxaad ka soo noqotay bogga lacag-bixinta.' : 'Dooro habka lacag-bixinta markaad gaarto Stripe.');
  pay.hidden = false;
}

pay.addEventListener('click', async () => {
  pay.disabled = true;
  message.textContent = 'Waxaa la furayaa bogga lacag-bixinta…';
  try {
    attempt ||= crypto.randomUUID();
    const { url } = await request('/api/session', {
      method: 'POST',
      headers: { 'X-Checkout-Attempt': attempt }
    });
    window.location.assign(url);
  } catch {
    message.textContent = 'Bogga lacag-bixinta lama furin. Mar kale isku day.';
    pay.disabled = false;
  }
});

window.addEventListener('pageshow', event => {
  if (event.persisted && !pay.hidden) {
    pay.disabled = false;
    message.textContent = 'Dib ugu noqo bogga lacag-bixinta.';
  }
});

(sessionId ? showStatus() : showItem()).catch(() => {
  message.textContent = 'Xogta lama soo heli karo. Dib u cusboonaysii bogga.';
});
