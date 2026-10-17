// Peetako Phase 2C client: coins and check-in, shop and wardrobe, friends (visit, Pamper, battle, gift,
// Report), Tangkap Kelip-kelip and leaderboards, share and invite, PIN change and the Tier 7 title.
// app.js owns the pet screen; this module owns the dialogs opened from the social bar and the menu.
import { drawPet, drawItem } from './art.js';
import { moodOf } from './mood.js';
import { playKelip } from './kelip.js';
import { showArena } from './arena.js';

// Names for items in news and gift lists (the shop gets the full catalogue from the server).
export const ITEM_NAMES = {
  'ikat-manik': ['Beaded headband', 'LED headband'], 'rantai-manik': ['Bead necklace', 'Bead cable'],
  terendak: ['Terendak hat', 'Terendak dish'], 'selempang-pua': ['Pua sash', 'Pua circuit sash'],
  'sayap-kelip': ['Firefly wings', 'Firefly thrusters'], payung: ['Parasol', 'Solar parasol'],
  'bg-kinabalu': ['Kinabalu from Kundasang backdrop'], 'bg-rajang': ['Rajang River backdrop'],
};
export const itemName = (id, type = 'organic') => (ITEM_NAMES[id] || [id])[type === 'robot' ? 1 : 0] || (ITEM_NAMES[id] || [id])[0];
export const PRICES = { 'ikat-manik': 100, 'rantai-manik': 100, terendak: 300, 'selempang-pua': 300, 'sayap-kelip': 800, payung: 800, 'bg-kinabalu': 500, 'bg-rajang': 500 };
const SLOT_LABEL = { head: 'Head', neck: 'Neck', back: 'Back', backdrop: 'Backdrop' };
const RECENT_KEY = 'peetako_recent_visits';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtReset = (ms) => { const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000); return h ? `${h}h ${m}m` : `${m}m`; };
export const shownName = (p) => (p.name ? p.name : 'Name under review');
export const wearOf = (p) => ({ head: p.equipped?.head, neck: p.equipped?.neck, back: p.equipped?.back });
export const petSvg = (p, mood) => drawPet({ type: p.type, tier: p.tier, status: p.status, pal: p.palette, mood: mood || moodOf(p).face, wear: wearOf(p) });

export function initSocial({ $, api, toast, Sound, getPet, getMe, onPet, onMe }) {
  const dlg = (id) => $(id);
  const pet = () => getPet();
  const me = () => getMe() || { coins: 0, today: {}, caps: {}, owned: [] };
  const fail = (e) => { Sound.play('error'); toast(e.message || 'Something went wrong.'); };

  // ---------- coins and check-in ----------
  async function checkin() {
    try {
      const d = await api('/api/checkin', {});
      Sound.play('coin');
      onMe(d.me);
      toast(d.earned.streak ? `Day ${d.streak} in a row! +${d.earned.checkin} coins and a +${d.earned.streak} streak bonus.` : `Checked in: +${d.earned.checkin} coins (day ${d.streak} in a row).`, 4500);
    } catch (e) { fail(e); }
  }

  // ---------- news: gifts, Pamper, battles, invites while the owner was away ----------
  let newsBusy = false;
  async function showNews(m) {
    if (newsBusy || !m?.events?.length) return;
    newsBusy = true;
    const p = pet();
    const lines = m.events.slice(0, 4).reverse().map((e) => {
      const who = e.from ? (e.from.name || e.from.callCode) : 'Someone';
      if (e.kind === 'gift') return `🎁 ${who} sent you a gift: ${itemName(e.data.item, p?.type)}!`;
      if (e.kind === 'pamper') return `💗 ${who} Pampered ${p?.name || 'your Peetako'} (+${e.data.fun || 5} FUN).`;
      if (e.kind === 'battle') return `⚔️ ${who} challenged ${p?.name || 'your Peetako'} — ${e.data.won ? 'you won!' : 'they won this time.'}`;
      if (e.kind === 'referral') return `🥚 ${who} hatched from your invite: +${e.data.coins} coins!`;
      return null;
    }).filter(Boolean);
    if (m.events.length > 4) lines.push(`…and ${m.events.length - 4} more.`);
    Sound.play('gift');
    for (const line of lines) { toast(line, 3600); await new Promise((r) => setTimeout(r, 3700)); }
    try { await api('/api/events/seen', { upTo: m.events[0].id }); } catch { /* shown again next time */ }
    newsBusy = false;
  }

  // ---------- shop and wardrobe ----------
  async function openShop() {
    Sound.play('tap');
    const d = dlg('#shop-dialog');
    $('#shop-list').innerHTML = '<p>Loading…</p>';
    if (!d.open) d.showModal();
    try { renderShop(await api('/api/shop')); } catch (e) { $('#shop-list').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }
  function renderShop(s) {
    const p = pet();
    $('#shop-coins').textContent = String(s.coins);
    const groups = ['head', 'neck', 'back', 'backdrop'];
    $('#shop-list').innerHTML = groups.map((slot) => {
      const items = s.items.filter((i) => i.slot === slot);
      return `<h3 class="px shop-slot">${SLOT_LABEL[slot]}</h3><div class="shop-grid">${items.map((i) => {
        const on = s.equipped[slot] === i.id;
        const name = slot === 'backdrop' ? i.name : (p.type === 'robot' ? i.robot : i.name);
        const btn = i.owned
          ? `<button class="rbtn small ${on ? 'light' : ''}" data-equip="${i.id}" data-slot="${slot}" data-on="${on ? 1 : 0}">${on ? 'Take off' : 'Wear'}</button>`
          : `<button class="rbtn small" data-buy="${i.id}" ${s.coins < i.price ? 'disabled' : ''} aria-label="Buy ${esc(name)} for ${i.price} coins">Buy · ${i.price}</button>`;
        return `<div class="shop-item${on ? ' on' : ''}"><div class="shop-pic" aria-hidden="true">${drawItem(i.id, p.type, p.palette)}</div>
          <div class="shop-name">${esc(name)}<small>${esc(i.ms)}</small></div>${btn}</div>`;
      }).join('')}</div>`;
    }).join('');
  }
  async function shopClick(e) {
    const b = e.target.closest('button[data-buy], button[data-equip]');
    if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.buy) {
        const d = await api('/api/shop/buy', { item: b.dataset.buy });
        Sound.play('coin');
        onPet(d.pet); onMe(d.me);
        toast(`New: ${itemName(d.item, pet().type)}! Your Peetako is wearing it.`);
      } else {
        const d = await api('/api/equip', { slot: b.dataset.slot, item: b.dataset.on === '1' ? null : b.dataset.equip });
        Sound.play('tap');
        onPet(d.pet);
      }
      renderShop(await api('/api/shop'));
    } catch (err) { fail(err); b.disabled = false; }
  }

  // ---------- friends: visit by Call Code ----------
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 6); } catch { return []; } };
  const remember = (code) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([code, ...recent().filter((c) => c !== code)].slice(0, 6))); } catch { /* ignore */ } };
  function openFriends(code) {
    Sound.play('tap');
    $('#visit-card').innerHTML = '';
    $('#visit-error').textContent = '';
    $('#visit-code').value = code || '';
    $('#visit-recent').innerHTML = recent().map((c) => `<button type="button" class="chip-btn" data-code="${esc(c)}">${esc(c)}</button>`).join('');
    const d = dlg('#friends-dialog');
    if (!d.open) d.showModal();
    if (code) visit(code);
    else $('#visit-code').focus();
  }
  let visiting = null;
  async function visit(code) {
    $('#visit-error').textContent = '';
    try {
      const d = await api(`/api/visit?code=${encodeURIComponent(code)}`);
      visiting = d;
      if (!d.self) remember(d.pet.callCode);
      renderVisit(d);
    } catch (e) { $('#visit-card').innerHTML = ''; $('#visit-error').textContent = e.message; Sound.play('error'); }
  }
  function renderVisit(d) {
    const p = d.pet;
    const m = me();
    const why = (key) => {
      if (d.self) return 'This is your own Peetako.';
      if (p.status === 'dead' || p.status === 'ascended') return 'This Peetako is no longer playing.';
      if (key === 'pamper') return (m.today.pampers || 0) >= (m.caps.pampers || 3) ? 'No Pampers left today.' : 'Already Pampered today.';
      if (key === 'battle') {
        if (p.tier < 1) return 'Still an egg.';
        if ((pet()?.tier ?? 0) < 1) return 'Hatch first.';
        if (pet()?.status !== 'active') return 'Care for your Peetako first.';
        if ((m.today.battles || 0) >= (m.caps.battles || 5)) return 'No battles left today.';
        return 'Not taking challenges.';
      }
      return 'No gifts left today.';
    };
    const action = (key, label, color) => d.can[key]
      ? `<button type="button" class="rbtn small" style="--b:${color}" data-act="${key}">${label}</button>`
      : `<button type="button" class="rbtn small" disabled title="${esc(why(key))}">${label}</button>`;
    const giftable = Object.keys(PRICES).filter((id) => !d.owns.includes(id));
    $('#visit-card').innerHTML = `
      <div class="visit">
        <div class="visit-pic">${petSvg(p)}</div>
        <div class="visit-info">
          <p class="visit-name">${esc(shownName(p))}${p.title ? `<small>“${esc(p.title)}”</small>` : ''}</p>
          <p class="px visit-meta">${esc(p.callCode)}</p>
          <p>T${p.tier} ${esc(p.tierName)} · ${Math.floor(p.ageHours / 24)} days · ${p.type === 'robot' ? 'Robot' : 'Organic'}</p>
          <p>Battles: ${p.battles.wins} won, ${p.battles.losses} lost</p>
        </div>
      </div>
      ${d.self ? '<p class="hint">That is you! Share your Call Code so friends can visit.</p>' : `
      <div class="btn-row">
        ${action('pamper', 'Pamper ♥', 'var(--b4)')}${action('battle', 'Battle ⚔', 'var(--b1)')}
        <button type="button" class="rbtn small light" data-act="giftmenu" ${d.can.gift ? '' : `disabled title="${esc(why('gift'))}"`}>Gift 🎁</button>
      </div>
      <div id="gift-pick" class="gift-pick" hidden>
        <p>Send a gift (you pay the price; ${Math.max(0, (m.caps.gifts || 5) - (m.today.gifts || 0))} gifts left today). You have <b>${m.coins}</b> coins.</p>
        ${giftable.length ? `<div class="gift-grid">${giftable.map((id) => `<button type="button" class="gift-opt" data-gift="${id}" ${m.coins < PRICES[id] ? 'disabled' : ''}>
          <span class="shop-pic" aria-hidden="true">${drawItem(id, p.type, p.palette)}</span><span>${esc(itemName(id, p.type))}</span><b>${PRICES[id]}</b></button>`).join('')}</div>` : '<p>They already have every item!</p>'}
      </div>
      <p class="visit-links"><a href="/p/${encodeURIComponent(p.callCode)}" target="_blank" rel="noopener">Open their page</a>
        ${p.canReport.name ? '<button type="button" class="linkbtn dark" data-report="name">Report name</button>' : ''}
        ${p.canReport.title ? '<button type="button" class="linkbtn dark" data-report="title">Report title</button>' : ''}</p>`}`;
  }
  async function visitClick(e) {
    const b = e.target.closest('button');
    if (!b || !visiting) return;
    const code = visiting.pet.callCode;
    if (b.dataset.act === 'giftmenu') { $('#gift-pick').hidden = !$('#gift-pick').hidden; return; }
    if (b.dataset.report) {
      if (!confirm(`Report this ${b.dataset.report} as unkind or unsafe? It will be hidden until we review it.`)) return;
      try { const r = await api('/api/report', { target: code, field: b.dataset.report }); toast(r.message, 4000); visit(code); } catch (err) { fail(err); }
      return;
    }
    b.disabled = true;
    try {
      if (b.dataset.gift) {
        const d = await api('/api/gift', { to: code, item: b.dataset.gift });
        Sound.play('gift'); onMe(d.me);
        toast(`Gift sent: ${itemName(d.item, d.to.type)} for ${shownName(d.to)}!`, 4000);
      } else if (b.dataset.act === 'pamper') {
        const d = await api('/api/pamper', { to: code });
        onMe(d.me);
        dlg('#friends-dialog').close();
        await showArena({ mode: 'pamper', mine: d.mine, them: d.to, sound: Sound });
      } else if (b.dataset.act === 'battle') {
        const d = await api('/api/battle', { to: code });
        onMe(d.me);
        dlg('#friends-dialog').close();
        await showArena({ mode: 'battle', mine: d.mine, them: d.them, result: d, sound: Sound });
        return;
      }
      if (dlg('#friends-dialog').open) await visit(code);
    } catch (err) { fail(err); b.disabled = false; }
  }

  // ---------- Tangkap Kelip-kelip ----------
  async function playGame() {
    Sound.play('tap');
    let run;
    try { run = await api('/api/game/start', {}); } catch (e) { return fail(e); }
    const p = pet();
    playKelip({
      durationMs: run.durationMs, petSvg: p ? petSvg(p, 'excited') : '', sound: Sound,
      onEnd: async (score) => {
        if (score === null) { toast('Run stopped. Fireflies will be back!'); return; }
        try {
          const d = await api('/api/game/finish', { run: run.run, score });
          onMe(d.me);
          showResult(d);
        } catch (e) { fail(e); }
      },
    });
  }
  function showResult(d) {
    const m = d.me;
    const capped = m.today.gameCoins >= m.caps.gameCoins;
    $('#result-body').innerHTML = `
      <p class="result-score px">${d.score} <small>fireflies</small></p>
      <p>${d.coins ? `+${d.coins} coins!` : capped ? 'No coins this time: today’s 50 game coins are already yours.' : 'Catch 5 fireflies for a coin.'}</p>
      <p>Best today: <b>${d.best}</b>${d.rankDay ? ` (#${d.rankDay} today)` : ''} · Best ever: <b>${d.allTime}</b>${d.rankAll ? ` (#${d.rankAll})` : ''}</p>
      <p class="hint">Game coins today: ${m.today.gameCoins} / ${m.caps.gameCoins}</p>`;
    if (d.coins) Sound.play('coin');
    dlg('#result-dialog').showModal();
  }

  // ---------- leaderboards ----------
  async function openBoard(period = 'day') {
    Sound.play('tap');
    const d = dlg('#board-dialog');
    for (const r of document.querySelectorAll('input[name="board"]')) r.checked = r.value === period;
    $('#board-list').innerHTML = '<p>Loading…</p>';
    if (!d.open) d.showModal();
    try {
      const b = await api(`/api/leaderboard?period=${period}`);
      const mine = pet()?.callCode;
      $('#board-note').textContent = period === 'day' ? `Today (Malaysia time) · resets in ${fmtReset(b.resetsInMs)}` : 'Best score ever, one per Peetako';
      $('#board-list').innerHTML = b.rows.length ? `<ol class="board">${b.rows.map((r) => `
        <li class="${r.callCode === mine ? 'me' : ''}"><span class="px rank">${r.rank}</span>
          <span class="who"><a href="/p/${encodeURIComponent(r.callCode)}">${esc(r.name || 'Name under review')}</a><small>${esc(r.callCode)} · T${r.tier}</small></span>
          <span class="px score">${r.score}</span></li>`).join('')}</ol>${b.me && b.me.rank > b.rows.length ? `<p>You: #${b.me.rank} with ${b.me.score}</p>` : ''}`
        : '<p>No scores yet. Be the first to catch some fireflies!</p>';
    } catch (e) { $('#board-list').innerHTML = `<p class="error">${esc(e.message)}</p>`; }
  }

  // ---------- share and invite ----------
  const shareTargets = (url, text) => [
    ['WhatsApp', `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`],
    ['X', `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`],
    ['Telegram', `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`],
    ['Threads', `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text} ${url}`)}`],
  ];
  function shareBlock(id, title, blurb, url, text) {
    return `<section class="share-block"><h3 class="px">${title}</h3><p>${blurb}</p>
      <div class="share-url"><input type="text" readonly value="${esc(url)}" aria-label="${esc(title)} link"><button type="button" class="rbtn small light" data-copy="${esc(url)}">Copy</button></div>
      <div class="share-row">${navigator.share ? `<button type="button" class="rbtn small" data-native="${id}">Share…</button>` : ''}
        ${shareTargets(url, text).map(([n, href]) => `<a class="rbtn small light" href="${href}" target="_blank" rel="noopener">${n}</a>`).join('')}</div></section>`;
  }
  let shares = {};
  function openShare(focus = 'pet') {
    Sound.play('tap');
    const p = pet();
    if (!p) return;
    const base = location.origin;
    shares = {
      pet: { url: `${base}/p/${p.callCode}`, text: `Meet ${p.name}, my Peetako from Malaysian Borneo! Pamper it or challenge it to a friendly battle.` },
      invite: { url: `${base}/?ref=${p.callCode}`, text: 'Hatch your own Peetako — a square-faced gecko from Malaysian Borneo. Free, no account.' },
    };
    $('#share-body').innerHTML =
      shareBlock('pet', `Share ${esc(p.name)}`, 'Friends can visit, Pamper, send gifts or battle. Only your Call Code is shared — never your PIN.', shares.pet.url, shares.pet.text) +
      shareBlock('invite', 'Invite a friend', `When a friend hatches a Peetako from this link and cares for it after its first day, you get 100 coins and they get 50.`, shares.invite.url, shares.invite.text);
    dlg('#share-dialog').showModal();
    if (focus === 'invite') $('#share-body .share-block:last-child')?.scrollIntoView();
  }
  async function shareClick(e) {
    const b = e.target.closest('[data-copy], [data-native]');
    if (!b) return;
    if (b.dataset.copy) {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast('Link copied.'); } catch { toast('Copy failed — select the link and copy it.'); }
    } else {
      const s = shares[b.dataset.native];
      try { await navigator.share({ title: 'Peetako', text: s.text, url: s.url }); } catch { /* cancelled */ }
    }
  }

  // ---------- PIN and title ----------
  function openPin() {
    $('#pin-old').value = ''; $('#pin-new').value = ''; $('#pin-new2').value = ''; $('#pin-error').textContent = '';
    dlg('#pin-dialog').showModal();
  }
  async function savePin(ev) {
    ev.preventDefault();
    const err = $('#pin-error');
    err.textContent = '';
    if ($('#pin-new').value !== $('#pin-new2').value) { err.textContent = 'The new PINs do not match.'; return; }
    try {
      await api('/api/pin', { oldPin: $('#pin-old').value, newPin: $('#pin-new').value });
      dlg('#pin-dialog').close();
      toast('PIN changed. Other devices were signed out.', 4000);
    } catch (e) { err.textContent = e.message; Sound.play('error'); }
  }
  function openTitle() {
    const p = pet();
    $('#title-input').value = p?.title || '';
    $('#title-error').textContent = '';
    $('#title-note').textContent = p?.titleStatus === 'hidden' ? 'Your title was reported and is hidden until it is reviewed.' : '';
    dlg('#title-dialog').showModal();
  }
  async function saveTitle(ev) {
    ev.preventDefault();
    try {
      const d = await api('/api/title', { title: $('#title-input').value });
      onPet(d.pet);
      dlg('#title-dialog').close();
      toast(d.pet.title ? `Title set: “${d.pet.title}”` : 'Title removed.');
    } catch (e) { $('#title-error').textContent = e.message; Sound.play('error'); }
  }

  // ---------- wiring ----------
  $('#social').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-open]');
    if (!b) return;
    ({ checkin, game: playGame, shop: openShop, friends: () => openFriends(), board: () => openBoard(), share: () => openShare() })[b.dataset.open]?.();
  });
  $('#coins-btn').addEventListener('click', openShop);
  $('#shop-list').addEventListener('click', shopClick);
  $('#visit-form').addEventListener('submit', (e) => { e.preventDefault(); const c = $('#visit-code').value.trim(); if (c) visit(c); });
  $('#visit-recent').addEventListener('click', (e) => { const b = e.target.closest('[data-code]'); if (b) { $('#visit-code').value = b.dataset.code; visit(b.dataset.code); } });
  $('#visit-card').addEventListener('click', visitClick);
  for (const r of document.querySelectorAll('input[name="board"]')) r.addEventListener('change', (e) => openBoard(e.target.value));
  $('#share-body').addEventListener('click', shareClick);
  $('#result-again').addEventListener('click', () => { dlg('#result-dialog').close(); playGame(); });
  $('#result-board').addEventListener('click', () => { dlg('#result-dialog').close(); openBoard('day'); });
  $('#pin-form').addEventListener('submit', savePin);
  $('#title-form').addEventListener('submit', saveTitle);
  $('#menu-pin').addEventListener('click', () => { $('#menu').close(); openPin(); });
  $('#menu-set-title').addEventListener('click', () => { $('#menu').close(); openTitle(); });
  $('#menu-invite').addEventListener('click', () => { $('#menu').close(); openShare('invite'); });

  return { showNews, openFriends, openShop };
}
