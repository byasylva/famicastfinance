'use strict';
/* Finanças da Família — front-end estático (GitHub Pages) + Supabase */

const cfg = window.APP_CONFIG || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const brl = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
const num = v => Number(v) || 0;
const sum = arr => arr.reduce((a, b) => a + num(b), 0);
const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

function parseBR(s) {
  s = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const isNetErr = e => !navigator.onLine || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(String(e?.message || e));
const safeImg = s => (typeof s === 'string' && s.length < 600000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) ? s : '';
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
const hue = n => { let h = 0; for (const c of String(n)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function avatar(src, name, size = 36) {
  const s = safeImg(src);
  return s ? `<img class="av" src="${s}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="av ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .4)}px;background:hsl(${hue(name)} 55% 42%)">${esc(initials(name))}</span>`;
}
/* escolhe uma foto (câmera/galeria), recorta e reduz; devolve data URL JPEG */
function pickImage(maxPx = 480, square = false) {
  return new Promise((resolve, reject) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const file = inp.files && inp.files[0]; if (!file) return resolve(null);
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        let sw = img.width, sh = img.height, sx = 0, sy = 0;
        if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
        const k = Math.min(1, maxPx / Math.max(sw, sh)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
        c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let q = .82, out = c.toDataURL('image/jpeg', q);
        while (out.length > 300000 && q > .4) { q -= .1; out = c.toDataURL('image/jpeg', q); }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler essa imagem.')); };
      img.src = url;
    };
    inp.click();
  });
}
const sqlHint = e => /avatar|family_items|item_id|schema cache|does not exist/i.test(String(e?.message)) ? new Error('Falta rodar o SQL “migracao_perfis_offline.sql” no Supabase (SQL Editor → Run).') : e;
/* armazenamento local (IndexedDB) para uso offline */
const idb = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('fin-familia', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async get(k) { try { const db = await this.open(); return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch { return undefined; } },
  async set(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch { } },
};
const toInput = n => (n === '' || n == null ? '' : String(n).replace('.', ','));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = d => d ? d.split('-').reverse().join('/') : '';
function addMonths(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = y * 12 + (m - 1) + n, ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, new Date(ny, nm, 0).getDate()))}`;
}
const monthLabel = k => { const [y, m] = k.split('-').map(Number); const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); return s[0].toUpperCase() + s.slice(1); };
const monthShort = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''); };

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

/* ---------- Config / cliente ---------- */
if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('SEU-PROJETO')) {
  document.body.innerHTML = `<div class="setup card"><h1>⚙️ Falta configurar</h1>
    <p>Edite <code>js/config.js</code> com a <b>URL</b> e a <b>anon key</b> do seu projeto Supabase
    (Project Settings → API) e faça o deploy novamente. Veja o README.</p></div>`;
  throw new Error('Supabase não configurado');
}
const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

/* ---------- Estado ---------- */
const ACC_TYPES = { checking: 'Conta corrente', savings: 'Poupança', cash: 'Dinheiro', credit: 'Cartão de crédito', investment: 'Investimentos' };
const VIEWS = {
  painel: ['📊', 'Painel'], caixa: ['💰', 'Caixa'], pagar: ['📤', 'A pagar'], receber: ['📥', 'A receber'],
  lancamentos: ['💸', 'Lançamentos'], orcamento: ['🎯', 'Orçamento'], metas: ['🏁', 'Metas'],
  contas: ['🏦', 'Contas'], perfis: ['👨‍👧‍👦', 'Perfis'], familia: ['👨‍👩‍👧', 'Família'], mais: ['☰', 'Mais'],
};
const KINDS = { child: ['👶', 'Filho(a)'], person: ['🧑', 'Pessoa / dependente'], vehicle: ['🚗', 'Veículo'], pet: ['🐶', 'Pet'], other: ['📦', 'Outro'] };
const PRIMARY = ['painel', 'caixa', 'pagar', 'receber'];
const state = {
  user: null, hid: null, hh: null, role: null, myName: '',
  members: [], accounts: [], categories: [], goals: [], tx: [],
  month: today().slice(0, 7), view: 'painel', limit: 100,
  f: { q: '', kind: '', account: '', category: '', member: '', period: 'month', status: '', item: '' },
  items: [], itemsOk: true, queue: [], snapTs: 0,
  cf: { q: '', kind: '', account: '' },
  pg: { q: '', st: 'pending', range: 'all' }, rc: { q: '', st: 'pending', range: 'all' },
};
let charts = [], chan = null, chan2 = null, reloadTimer = null;

const catById = id => state.categories.find(c => c.id === id);
const accById = id => state.accounts.find(a => a.id === id);
const memberName = uid => state.members.find(m => m.user_id === uid)?.display_name || '—';
const monthTx = () => state.tx.filter(t => t.date.startsWith(state.month));
const txSum = (list, kind) => sum(list.filter(t => t.kind === kind).map(t => t.amount));
const isPaid = t => t.status !== 'pending';
const isOverdue = t => !isPaid(t) && t.date < today();
const cashDate = t => t.paid_at || t.date;
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const accBalance = a => {
  const own = state.tx.filter(t => t.account_id === a.id && isPaid(t));
  return num(a.initial_balance) + txSum(own, 'income') - txSum(own, 'expense');
};

/* ---------- Modal ---------- */
function modal(title, body, onSubmit, { submit = 'Salvar', offlineOk = false } = {}) {
  const m = $('#modal');
  m.innerHTML = `<form class="modal-form"><h3>${esc(title)}</h3>${body}
    <div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button>
    ${onSubmit ? `<button class="btn primary">${esc(submit)}</button>` : ''}</div></form>`;
  const f = $('form', m);
  $('[data-close]', m).onclick = () => m.close();
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('.primary', f); btn.disabled = true;
    try {
      if (!navigator.onLine && !offlineOk) throw new Error('Sem internet: conecte-se para salvar esta alteração.');
      await onSubmit(new FormData(f), f); m.close();
    }
    catch (err) { toast(err.message || String(err), 'error'); btn.disabled = false; }
  };
  m.showModal();
  const first = $('input:not([type=radio]):not([type=hidden]), select', f); first && first.focus();
  return f;
}

/* ---------- Dados ---------- */
async function fetchAllTx() {
  let out = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from('transactions').select('*').eq('household_id', state.hid)
      .order('date', { ascending: false }).order('id').range(from, from + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) return out;
    from += 1000;
  }
}
function withQueued(tx) {
  const mine = state.queue.filter(e => e.uid === state.user?.id).flatMap(e => e.rows);
  const ids = new Set(tx.map(t => t.id));
  return [...mine.filter(r => !ids.has(r.id)).map(r => ({ ...r, _pending: true })), ...tx];
}
function saveSnapshot() {
  idb.set('snapshot', {
    uid: state.user.id, hid: state.hid, role: state.role, myName: state.myName, hh: state.hh, members: state.members,
    accounts: state.accounts, categories: state.categories, goals: state.goals, items: state.items, itemsOk: state.itemsOk,
    tx: state.tx.filter(t => !t._pending), ts: Date.now(),
  });
}
async function loadSnapshot() {
  const s = await idb.get('snapshot');
  if (!s || s.uid !== state.user?.id || s.hid !== state.hid) return false;
  Object.assign(state, { hh: s.hh, members: s.members, accounts: s.accounts, categories: s.categories, goals: s.goals, items: s.items || [], itemsOk: s.itemsOk !== false, snapTs: s.ts });
  state.tx = withQueued(s.tx);
  return true;
}
async function reload() {
  try {
    const q = t => sb.from(t).select('*').eq('household_id', state.hid);
    const [acc, cat, goal, mem, hh, tx, itm] = await Promise.all([
      q('accounts').order('created_at'), q('categories').order('name'), q('goals').order('created_at'),
      q('household_members').order('joined_at'),
      sb.from('households').select('name,invite_code').eq('id', state.hid).single(),
      fetchAllTx(),
      q('family_items').order('created_at').then(r => r, e => ({ error: e })),
    ]);
    for (const r of [acc, cat, goal, mem, hh]) if (r.error) throw r.error;
    state.accounts = acc.data; state.categories = cat.data; state.goals = goal.data;
    state.members = mem.data; state.hh = hh.data;
    state.itemsOk = !itm.error; state.items = itm.error ? [] : itm.data;
    state.tx = withQueued(tx); state.snapTs = 0;
    saveSnapshot(); render();
  } catch (e) {
    if (isNetErr(e) && await loadSnapshot()) return render();
    toast('Erro ao carregar: ' + (e.message || e), 'error');
  }
}
const persistQueue = () => idb.set('queue', state.queue);
let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine || !state.user || !state.hid) return;
  const mine = state.queue.filter(e => e.uid === state.user.id && e.hid === state.hid);
  if (!mine.length) return;
  flushing = true; let sent = 0;
  try {
    for (const e of mine) {
      const { error } = await sb.from('transactions').upsert(e.rows, { onConflict: 'id' });
      if (error) {
        if (isNetErr(error)) break;
        toast('Um lançamento salvo offline foi recusado: ' + error.message, 'error');
      } else sent += e.rows.length;
      state.queue = state.queue.filter(x => x !== e); await persistQueue();
    }
  } finally { flushing = false; }
  if (sent) toast(`✔ ${sent} lançamento(s) enviado(s)`);
  await reload();
}
/* grava lançamentos; sem internet, guarda no aparelho e envia depois. Devolve true se ficou na fila */
async function insertTx(rows) {
  rows = rows.map(r => ({ ...r, id: r.id || uuid(), user_id: state.user.id }));
  if (navigator.onLine) {
    const { error } = await sb.from('transactions').insert(rows);
    if (!error) return false;
    if (!isNetErr(error)) throw sqlHint(error);
  }
  state.queue.push({ uid: state.user.id, hid: state.hid, rows }); await persistQueue();
  return true;
}
function netBarHtml() {
  const pend = state.queue.filter(e => e.uid === state.user?.id).reduce((n, e) => n + e.rows.length, 0);
  if (!navigator.onLine) {
    const when = state.snapTs ? ' (de ' + new Date(state.snapTs).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ')' : '';
    return `<div class="netbar off">📴 <span><b>Sem conexão.</b> Você está vendo os dados salvos neste aparelho${when}. Novos lançamentos ficam guardados e são enviados quando a internet voltar${pend ? ` — ${pend} aguardando envio` : ''}.</span></div>`;
  }
  return pend ? `<div class="netbar">⏳ ${pend} lançamento(s) aguardando envio…</div>` : '';
}
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 400); }
function subscribe() {
  if (chan) sb.removeChannel(chan);
  chan = sb.channel('hh-' + state.hid);
  for (const table of ['accounts', 'categories', 'transactions', 'goals', 'household_members'])
    chan.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${state.hid}` }, scheduleReload);
  chan.subscribe();
  if (chan2) sb.removeChannel(chan2);
  chan2 = sb.channel('hi-' + state.hid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'family_items', filter: `household_id=eq.${state.hid}` }, scheduleReload)
    .subscribe();
}

/* ---------- Telas / autenticação ---------- */
function show(which) {
  for (const id of ['auth', 'onboard', 'app']) $('#' + id).classList.toggle('hidden', id !== which);
}
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  const su = mode === 'signup';
  $('#nameRow').classList.toggle('hidden', !su);
  $('#nameRow input').required = su;
  $('#authBtn').textContent = su ? 'Criar conta' : 'Entrar';
  $('#toggleAuth').textContent = su ? 'Já tenho conta' : 'Criar conta';
  $('#authForm [name=password]').autocomplete = su ? 'new-password' : 'current-password';
  $('#authSub').textContent = su ? 'Crie sua conta para começar.' : 'Entre para ver as finanças de vocês.';
  authMsg('');
}
function authMsg(t, err = false) { const el = $('#authMsg'); el.textContent = t; el.classList.toggle('error', err); }

function initAuthUI() {
  $('#toggleAuth').onclick = e => { e.preventDefault(); setAuthMode(authMode === 'login' ? 'signup' : 'login'); };
  $('#forgot').onclick = async e => {
    e.preventDefault();
    const email = $('#authForm [name=email]').value.trim();
    if (!email) return authMsg('Digite seu e-mail acima primeiro.', true);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    error ? authMsg(error.message, true) : authMsg('Enviamos um link para redefinir a senha.');
  };
  $('#authForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target), email = fd.get('email').trim(), password = fd.get('password');
    const btn = $('#authBtn'); btn.disabled = true; authMsg('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name: fd.get('nome').trim() } } });
        if (error) throw error;
        if (!data.session) authMsg('Conta criada! Confirme o e-mail que enviamos e depois entre.');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) { authMsg(traduz(err.message), true); }
    btn.disabled = false;
  };
  $('#createForm').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target);
    const { error } = await sb.rpc('create_household', { p_name: fd.get('hname'), p_display_name: fd.get('me') });
    error ? toast(error.message, 'error') : loadMembership();
  };
  $('#joinForm').onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target);
    const { error } = await sb.rpc('join_household', { p_code: fd.get('code'), p_display_name: fd.get('me') });
    error ? toast(error.message, 'error') : loadMembership();
  };
  $('#obLogout').onclick = e => { e.preventDefault(); logout(); };
}
function traduz(msg = '') {
  if (/Invalid login/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/already registered/i.test(msg)) return 'Este e-mail já está cadastrado.';
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.';
  if (/at least 6/i.test(msg)) return 'A senha precisa ter ao menos 6 caracteres.';
  return msg;
}
async function logout() {
  if (chan) { sb.removeChannel(chan); chan = null; }
  if (chan2) { sb.removeChannel(chan2); chan2 = null; }
  await idb.set('snapshot', null);
  await sb.auth.signOut();
}

async function handleSession(session) {
  if (!session) {
    Object.assign(state, { user: null, hid: null, tx: [], accounts: [], categories: [], goals: [], members: [] });
    show('auth'); return;
  }
  if (state.user?.id === session.user.id && state.hid) return;   // refresh de token
  state.user = session.user;
  const nm = session.user.user_metadata?.name || '';
  $$('#createForm [name=me], #joinForm [name=me]').forEach(i => { if (!i.value) i.value = nm; });
  await loadMembership();
}
async function loadMembership() {
  state.queue = (await idb.get('queue')) || [];
  let data = null, error = null;
  try { ({ data, error } = await sb.from('household_members').select('household_id,role,display_name').eq('user_id', state.user.id).maybeSingle()); }
  catch (e) { error = e; }
  if (error) {
    if (isNetErr(error)) {
      const s = await idb.get('snapshot');
      if (s && s.uid === state.user.id) { Object.assign(state, { hid: s.hid, role: s.role, myName: s.myName }); show('app'); await reload(); return; }
    }
    return toast(error.message, 'error');
  }
  if (!data) { state.hid = null; show('onboard'); return; }
  Object.assign(state, { hid: data.household_id, role: data.role, myName: data.display_name });
  show('app'); subscribe(); await reload(); flushQueue();
}

function recoveryModal() {
  show('auth');
  modal('Nova senha', `<label>Nova senha<input type="password" name="pw" minlength="6" required autocomplete="new-password"></label>`,
    async fd => {
      const { error } = await sb.auth.updateUser({ password: fd.get('pw') });
      if (error) throw error;
      toast('Senha atualizada!');
      const { data } = await sb.auth.getSession(); handleSession(data.session);
    }, { submit: 'Salvar senha' });
}

/* ---------- Navegação / render ---------- */
function setView(v) {
  if (!VIEWS[v]) v = 'painel';
  state.view = v; state.limit = 100;
  if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
  render();
}
function render() {
  if (!state.hid) return;
  $('#hhName').textContent = state.hh?.name || 'Família';
  $('#monthLabel').textContent = monthLabel(state.month);
  $('#monthBar').style.visibility = ['metas', 'contas', 'familia', 'mais'].includes(state.view) ? 'hidden' : 'visible';
  $('#nav').innerHTML = Object.entries(VIEWS).filter(([k]) => k !== 'mais').map(([k, [ico, lbl]]) =>
    `<button data-view="${k}" class="${PRIMARY.includes(k) ? '' : 'sec'} ${k === state.view ? 'active' : ''}"><span>${ico}</span>${lbl}</button>`).join('') +
    `<button data-view="mais" class="more ${PRIMARY.includes(state.view) ? '' : 'active'}"><span>☰</span>Mais</button>`;
  charts.forEach(c => c.destroy()); charts = [];
  const view = $('#view');
  const active = document.activeElement, keepFocus = active && view.contains(active) && active.dataset.filter ? active.dataset.filter : null;
  const me = state.members.find(m => m.user_id === state.user?.id);
  $('#userBtn').innerHTML = avatar(me?.avatar, state.myName || state.user?.email, 36);
  view.innerHTML = netBarHtml() + { painel: vPainel, caixa: vCaixa, pagar: () => vTitulos('expense'), receber: () => vTitulos('income'), lancamentos: vLanc, orcamento: vOrc, metas: vMetas, contas: vContas, perfis: vPerfis, familia: vFamilia, mais: vMais }[state.view]();
  if (state.view === 'painel') drawCharts();
  if (keepFocus) { const el = $(`[data-filter="${keepFocus}"]`, view); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch { } } }
}

/* ---------- Painel ---------- */
function vPainel() {
  const tdy = today(), mk = state.month;
  const paid = state.tx.filter(isPaid), pend = state.tx.filter(t => !isPaid(t));
  const caixa = sum(state.accounts.map(accBalance));
  const rec = txSum(pend, 'income'), pag = txSum(pend, 'expense');
  const recLate = txSum(pend.filter(t => t.date < tdy), 'income'), pagLate = txSum(pend.filter(t => t.date < tdy), 'expense');
  const inM = paid.filter(t => cashDate(t).startsWith(mk));
  const ent = txSum(inM, 'income'), sai = txSum(inM, 'expense');
  const pendM = pend.filter(t => t.date.startsWith(mk));
  const recM = txSum(pendM, 'income'), pagM = txSum(pendM, 'expense');
  const mt = monthTx(), exp = txSum(mt, 'expense'), hasExp = exp > 0;
  const budgets = state.categories.filter(c => c.kind === 'expense' && num(c.monthly_budget) > 0)
    .map(c => ({ c, spent: sum(mt.filter(t => t.category_id === c.id && t.kind === 'expense').map(t => t.amount)) }))
    .sort((a, b) => b.spent / b.c.monthly_budget - a.spent / a.c.monthly_budget).slice(0, 5);
  const next = kind => pend.filter(t => t.kind === kind).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 5);
  const nextCard = (kind, title, go) => { const l = next(kind); return `<div class="card">
    <div class="view-head" style="margin-bottom:.25rem"><h3 style="margin:0">${title}</h3><a href="#${go}" data-go="${go}" class="small">Ver todas ›</a></div>
    ${l.length ? `<div class="list">${l.map(t => txRow(t)).join('')}</div>` : '<div class="empty">Nada pendente 🎉</div>'}</div>`; };
  const recent = paid.slice().sort((x, y) => cashDate(y).localeCompare(cashDate(x))).slice(0, 5);
  const proj = caixa + rec - pag, res = ent - sai;
  return `
  <div class="stats">
    <div class="card stat"><div class="label">Saldo em caixa</div><div class="value num ${caixa < 0 ? 'expense' : ''}">${brl(caixa)}</div><div class="sub">Somente o que já foi pago/recebido</div></div>
    <div class="card stat"><div class="label">A receber</div><div class="value income num">${brl(rec)}</div><div class="sub">${recLate > 0 ? `<b class="expense">Atrasado ${brl(recLate)}</b>` : 'Nada atrasado'}</div></div>
    <div class="card stat"><div class="label">A pagar</div><div class="value expense num">${brl(pag)}</div><div class="sub">${pagLate > 0 ? `<b class="expense">Atrasado ${brl(pagLate)}</b>` : 'Nada atrasado'}</div></div>
    <div class="card stat"><div class="label">Saldo projetado</div><div class="value num ${proj < 0 ? 'expense' : ''}">${brl(proj)}</div><div class="sub">Caixa + a receber − a pagar</div></div>
  </div>
  <div class="stats three">
    <div class="card stat"><div class="label">Entradas no mês</div><div class="value income num">${brl(ent)}</div><div class="sub">A receber no mês ${brl(recM)}</div></div>
    <div class="card stat"><div class="label">Saídas no mês</div><div class="value expense num">${brl(sai)}</div><div class="sub">A pagar no mês ${brl(pagM)}</div></div>
    <div class="card stat"><div class="label">Resultado do mês (caixa)</div><div class="value num ${res >= 0 ? 'income' : 'expense'}">${brl(res)}</div><div class="sub">Previsto: ${brl(ent + recM - sai - pagM)}</div></div>
  </div>
  <div class="cols">${nextCard('expense', 'Próximas contas a pagar', 'pagar')}${nextCard('income', 'Próximos recebimentos', 'receber')}</div>
  <div class="cols">
    <div class="card"><h3>Despesas por categoria</h3>
      ${hasExp ? '<div class="chart-box"><canvas id="chCat"></canvas></div>' : '<div class="empty">Sem despesas neste mês.</div>'}</div>
    <div class="card"><h3>Entradas × saídas (6 meses)</h3><div class="chart-box"><canvas id="chMonths"></canvas></div></div>
  </div>
  <div class="cols">
    <div class="card"><h3>Orçamento do mês</h3>
      ${budgets.length ? budgets.map(({ c, spent }) => budgetRow(c, spent)).join('') :
      '<div class="empty">Defina orçamentos na aba <b>Orçamento</b> (menu Mais) para acompanhar aqui.</div>'}</div>
    <div class="card"><div class="view-head" style="margin-bottom:.25rem"><h3 style="margin:0">Últimas movimentações</h3><a href="#caixa" data-go="caixa" class="small">Ver caixa ›</a></div>
      ${recent.length ? `<div class="list">${recent.map(t => txRow(t, { cash: true })).join('')}</div>` : '<div class="empty">Nenhuma movimentação ainda. Use o botão ＋.</div>'}</div>
  </div>`;
}
function drawCharts() {
  if (typeof Chart === 'undefined') return;
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.color = css.getPropertyValue('--muted').trim();
  Chart.defaults.borderColor = css.getPropertyValue('--line').trim();
  const mt = monthTx();
  const byCat = {};
  for (const t of mt) if (t.kind === 'expense') byCat[t.category_id || '_'] = (byCat[t.category_id || '_'] || 0) + num(t.amount);
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const c1 = $('#chCat');
  if (c1) charts.push(new Chart(c1, {
    type: 'doughnut',
    data: {
      labels: rows.map(([id]) => catById(id)?.name || 'Sem categoria'),
      datasets: [{ data: rows.map(r => round2(r[1])), backgroundColor: rows.map(([id]) => catById(id)?.color || '#94a3b8'), borderWidth: 0 }],
    },
    options: {
      maintainAspectRatio: false, cutout: '62%',
      plugins: { legend: { position: window.innerWidth < 520 ? 'bottom' : 'right', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: x => ` ${x.label}: ${brl(x.parsed)}` } } },
    },
  }));
  const keys = [...Array(6)].map((_, i) => addMonths(state.month + '-01', i - 5).slice(0, 7));
  const c2 = $('#chMonths');
  if (c2) charts.push(new Chart(c2, {
    type: 'bar',
    data: {
      labels: keys.map(monthShort),
      datasets: [
        { label: 'Receitas', backgroundColor: '#16a34a', borderRadius: 4, data: keys.map(k => round2(txSum(state.tx.filter(t => t.date.startsWith(k)), 'income'))) },
        { label: 'Despesas', backgroundColor: '#dc2626', borderRadius: 4, data: keys.map(k => round2(txSum(state.tx.filter(t => t.date.startsWith(k)), 'expense'))) },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: x => ` ${x.dataset.label}: ${brl(x.parsed.y)}` } }, legend: { labels: { boxWidth: 10 } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => brl(v).replace(/,00$/, '') } } },
    },
  }));
}
function budgetRow(c, spent) {
  const b = num(c.monthly_budget), pct = b ? spent / b * 100 : 0;
  const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
  return `<div style="margin-bottom:.8rem"><div class="item" style="padding:0;border:0">
    <span class="dot" style="background:${esc(c.color)}"></span><div class="grow title">${esc(c.name)}</div>
    <div class="num small ${pct > 100 ? 'expense' : ''}">${brl(spent)} / ${brl(b)}</div></div>
    <div class="bar"><i class="${cls}" style="width:${Math.min(pct, 100)}%"></i></div></div>`;
}

/* ---------- Lançamentos ---------- */
function txRow(t, o = {}) {
  const c = catById(t.category_id), a = accById(t.account_id), inc = t.kind === 'income';
  const paid = isPaid(t), late = isOverdue(t);
  const when = o.cash ? cashDate(t) : t.date;
  const status = o.cash ? '' : paid ? (t.paid_at && t.paid_at !== t.date ? ` · ${inc ? 'recebido' : 'pago'} em ${fmtDate(t.paid_at)}` : '')
    : ` · <b class="${late ? 'expense' : ''}">${late ? 'Atrasado' : (inc ? 'A receber' : 'A pagar')}</b>`;
  const it = state.items.find(x => x.id === t.item_id);
  const sub = [fmtDate(when), c?.name || 'Sem categoria', a?.name || '', memberName(t.user_id), it ? `${(KINDS[it.kind] || KINDS.other)[0]} ${it.name}` : ''].filter(Boolean).map(esc).join(' · ')
    + (t._pending ? ' · <b>⏳ aguardando envio</b>' : '');
  const btn = t._pending ? '' : !paid ? `<button class="btn sm primary pay-btn" data-act="tx-pay" data-id="${t.id}">✓ ${inc ? 'Receber' : 'Pagar'} / abater</button>`
    : o.undo ? `<button class="btn sm ghost pay-btn" data-act="tx-unpay" data-id="${t.id}">↩ Estornar baixa</button>` : '';
  return `<div class="item ${paid ? '' : 'pending'}">
    <span class="dot" style="background:${esc(c?.color || '#94a3b8')}"></span>
    <div class="grow"><div class="title">${esc(t.description)}</div>
      <div class="sub">${sub}${status}</div>
      ${o.bal !== undefined ? `<div class="sub num">Saldo: ${brl(o.bal)}</div>` : ''}${btn}</div>
    <div class="num ${inc ? 'income' : 'expense'}"><b>${inc ? '+' : '−'} ${brl(t.amount)}</b></div>
    ${t._pending ? '' : `<div class="row-actions">
      <button class="icon-btn" title="Editar" data-act="tx-edit" data-id="${t.id}">✏️</button>
      <button class="icon-btn" title="Excluir" data-act="tx-del" data-id="${t.id}">🗑️</button></div>`}</div>`;
}
function filteredTx() {
  const f = state.f, q = f.q.trim().toLowerCase();
  return state.tx.filter(t =>
    (f.period === 'all' || t.date.startsWith(state.month)) &&
    (!f.kind || t.kind === f.kind) && (!f.status || (f.status === 'paid' ? isPaid(t) : !isPaid(t))) && (!f.account || t.account_id === f.account) &&
    (!f.category || t.category_id === f.category || (f.category === '_' && !t.category_id)) &&
    (!f.member || t.user_id === f.member) && (!f.item || (f.item === '_' ? !t.item_id : t.item_id === f.item)) &&
    (!q || t.description.toLowerCase().includes(q) || (catById(t.category_id)?.name || '').toLowerCase().includes(q)));
}
/* ---------- Caixa (extrato de entradas e saídas realizadas) ---------- */
function vCaixa() {
  const f = state.cf, mk = state.month, first = mk + '-01';
  const accs = f.account ? state.accounts.filter(x => x.id === f.account) : state.accounts;
  const ids = new Set(accs.map(x => x.id));
  const paid = state.tx.filter(t => isPaid(t) && ids.has(t.account_id));
  const open = sum(accs.map(x => x.initial_balance)) + txSum(paid.filter(t => cashDate(t) < first), 'income') - txSum(paid.filter(t => cashDate(t) < first), 'expense');
  const inM = paid.filter(t => cashDate(t).startsWith(mk)).sort((x, y) => cashDate(x).localeCompare(cashDate(y)) || String(x.created_at).localeCompare(String(y.created_at)));
  let run = open; const bal = new Map();
  for (const t of inM) { run += t.kind === 'income' ? num(t.amount) : -num(t.amount); bal.set(t.id, round2(run)); }
  const ent = txSum(inM, 'income'), sai = txSum(inM, 'expense'), q = f.q.trim().toLowerCase();
  const list = inM.filter(t => (!f.kind || t.kind === f.kind) && (!q || t.description.toLowerCase().includes(q) || (catById(t.category_id)?.name || '').toLowerCase().includes(q))).reverse();
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  return `
  <div class="view-head"><h2>Caixa</h2>
    <div><button class="btn sm" data-act="cx-in">＋ Entrada</button> <button class="btn sm primary" data-act="cx-out">＋ Saída</button></div></div>
  <div class="stats">
    <div class="card stat"><div class="label">Saldo inicial</div><div class="value num">${brl(open)}</div></div>
    <div class="card stat"><div class="label">Entradas</div><div class="value income num">${brl(ent)}</div></div>
    <div class="card stat"><div class="label">Saídas</div><div class="value expense num">${brl(sai)}</div></div>
    <div class="card stat"><div class="label">Saldo final</div><div class="value num ${run < 0 ? 'expense' : ''}">${brl(run)}</div></div>
  </div>
  <div class="filters filters3">
    <input class="q" data-scope="cf" data-filter="q" type="search" placeholder="Buscar…" value="${esc(f.q)}">
    <select data-scope="cf" data-filter="kind">${opt('', 'Entradas e saídas', !f.kind)}${opt('income', 'Só entradas', f.kind === 'income')}${opt('expense', 'Só saídas', f.kind === 'expense')}</select>
    <select data-scope="cf" data-filter="account">${opt('', 'Todas as contas', !f.account)}${state.accounts.map(x => opt(x.id, x.name, f.account === x.id)).join('')}</select>
  </div>
  <div class="card">
    <div class="small muted" style="margin-bottom:.4rem">Movimentações pela <b>data do pagamento/recebimento</b>. O que está pendente não entra no caixa.</div>
    ${list.length ? `<div class="list">${list.map(t => txRow(t, { cash: true, bal: bal.get(t.id), undo: true })).join('')}</div>` : '<div class="empty">Nenhuma movimentação no caixa neste mês.</div>'}
  </div>`;
}

/* ---------- A pagar / A receber ---------- */
function vTitulos(kind) {
  const isE = kind === 'expense', sc = isE ? 'pg' : 'rc', f = state[sc], tdy = today(), mk = state.month;
  const all = state.tx.filter(t => t.kind === kind), pend = all.filter(t => !isPaid(t));
  const late = pend.filter(t => t.date < tdy), soon = pend.filter(t => t.date >= tdy && t.date <= addDays(tdy, 7));
  const doneM = all.filter(t => isPaid(t) && cashDate(t).startsWith(mk));
  const q = f.q.trim().toLowerCase();
  let list;
  if (f.st === 'pending') {
    list = pend.filter(t => ({
      all: true, late: t.date < tdy, today: t.date === tdy, week: t.date >= tdy && t.date <= addDays(tdy, 7), month: t.date.startsWith(mk),
    }[f.range])).sort((x, y) => x.date.localeCompare(y.date));
  } else list = doneM.slice().sort((x, y) => cashDate(y).localeCompare(cashDate(x)));
  list = list.filter(t => !q || t.description.toLowerCase().includes(q) || (catById(t.category_id)?.name || '').toLowerCase().includes(q));
  const opt = (v, l) => `<option value="${v}" ${f.range === v ? 'selected' : ''}>${l}</option>`;
  const cls = isE ? 'expense' : 'income', words = isE ? ['a pagar', 'Pagas', 'Pago'] : ['a receber', 'Recebidas', 'Recebido'];
  return `
  <div class="view-head"><h2>Contas ${words[0]}</h2><button class="btn sm primary" data-act="${isE ? 'new-pay' : 'new-rec'}">＋ Nova conta ${words[0]}</button></div>
  <div class="stats">
    <div class="card stat"><div class="label">Total ${words[0]}</div><div class="value ${cls} num">${brl(txSum(pend, kind))}</div><div class="sub">${pend.length} pendente(s)</div></div>
    <div class="card stat"><div class="label">Atrasadas</div><div class="value ${late.length ? 'expense' : ''} num">${brl(txSum(late, kind))}</div><div class="sub">${late.length} conta(s)</div></div>
    <div class="card stat"><div class="label">Próximos 7 dias</div><div class="value num">${brl(txSum(soon, kind))}</div><div class="sub">${soon.length} conta(s)</div></div>
    <div class="card stat"><div class="label">${words[2]} no mês</div><div class="value num">${brl(txSum(doneM, kind))}</div><div class="sub">${doneM.length} conta(s)</div></div>
  </div>
  <div class="tabs">
    <button class="btn sm ${f.st === 'pending' ? 'primary' : ''}" data-act="set-st" data-scope="${sc}" data-val="pending">Pendentes</button>
    <button class="btn sm ${f.st === 'paid' ? 'primary' : ''}" data-act="set-st" data-scope="${sc}" data-val="paid">${words[1]} no mês</button>
  </div>
  <div class="filters filters3">
    <input class="q" data-scope="${sc}" data-filter="q" type="search" placeholder="Buscar…" value="${esc(f.q)}">
    ${f.st === 'pending' ? `<select data-scope="${sc}" data-filter="range">${opt('all', 'Todas pendentes')}${opt('late', 'Atrasadas')}${opt('today', 'Vencem hoje')}${opt('week', 'Próximos 7 dias')}${opt('month', 'Vencem no mês selecionado')}</select>` : ''}
  </div>
  <div class="card">
    ${list.length ? `<div class="list">${list.map(t => txRow(t, { undo: f.st === 'paid' })).join('')}</div>` :
      `<div class="empty">${f.st === 'pending' ? 'Nenhuma conta pendente neste filtro 🎉' : 'Nada baixado neste mês.'}</div>`}
  </div>`;
}

/* ---------- Menu "Mais" (celular) ---------- */
function vMais() {
  const item = (k, desc) => `<button class="menu-item" data-go="${k}"><span class="mi">${VIEWS[k][0]}</span><span><b>${VIEWS[k][1]}</b><br><span class="small muted">${desc}</span></span><span class="muted">›</span></button>`;
  return `<div class="view-head"><h2>Mais</h2></div><div class="card stack-sm">
    ${item('lancamentos', 'Todos os lançamentos, busca e exportar CSV')}${item('orcamento', 'Categorias e orçamento mensal')}
    ${item('metas', 'Metas de economia')}${item('contas', 'Contas bancárias e saldos')}${item('perfis', 'Filhos, veículos, pets… com foto')}${item('familia', 'Membros, convite e minha conta')}
    <button class="menu-item" data-act="logout"><span class="mi">⎋</span><span><b>Sair da conta</b><br><span class="small muted">${esc(state.user?.email || '')}</span></span><span class="muted">›</span></button></div>`;
}

function vLanc() {
  const f = state.f, list = filteredTx();
  const inc = txSum(list, 'income'), exp = txSum(list, 'expense');
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
  return `
  <div class="view-head"><h2>Lançamentos</h2>
    <div><button class="btn sm" data-act="export">⬇️ CSV</button> <button class="btn sm primary" data-act="tx-new">＋ Novo</button></div></div>
  <div class="filters">
    <input class="q" data-filter="q" type="search" placeholder="Buscar…" value="${esc(f.q)}">
    <select data-filter="period">${opt('month', 'Mês selecionado', f.period === 'month')}${opt('all', 'Todo o período', f.period === 'all')}</select>
    <select data-filter="kind">${opt('', 'Todos os tipos', !f.kind)}${opt('expense', 'Despesas', f.kind === 'expense')}${opt('income', 'Receitas', f.kind === 'income')}</select>
    <select data-filter="status">${opt('', 'Todos os status', !f.status)}${opt('pending', 'Pendentes (a pagar/receber)', f.status === 'pending')}${opt('paid', 'Pagos / recebidos', f.status === 'paid')}</select>
    <select data-filter="account">${opt('', 'Todas as contas', !f.account)}${state.accounts.map(a => opt(a.id, a.name, f.account === a.id)).join('')}</select>
    ${state.items.length ? `<select data-filter="item">${opt('', 'Todos os perfis', !f.item)}${opt('_', 'Sem perfil', f.item === '_')}${state.items.map(i => opt(i.id, `${(KINDS[i.kind] || KINDS.other)[0]} ${i.name}`, f.item === i.id)).join('')}</select>` : ''}
    <select data-filter="category">${opt('', 'Todas as categorias', !f.category)}${opt('_', 'Sem categoria', f.category === '_')}${state.categories.map(c => opt(c.id, c.name, f.category === c.id)).join('')}</select>
    <select data-filter="member">${opt('', 'Todos os membros', !f.member)}${state.members.map(m => opt(m.user_id, m.display_name, f.member === m.user_id)).join('')}</select>
  </div>
  <div class="card">
    <div class="small muted" style="margin-bottom:.4rem">${list.length} lançamento(s) · <span class="income">${brl(inc)}</span> · <span class="expense">${brl(exp)}</span> · saldo <b>${brl(inc - exp)}</b></div>
    ${list.length ? `<div class="list">${list.slice(0, state.limit).map(txRow).join('')}</div>` : '<div class="empty">Nada encontrado.</div>'}
    ${list.length > state.limit ? '<p class="center"><button class="btn sm" data-act="more">Mostrar mais</button></p>' : ''}
  </div>`;
}
function catOptions(kind, sel) {
  return `<option value="">Sem categoria</option>` + state.categories.filter(c => c.kind === kind)
    .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}
function txModal(t, preset = {}) {
  if (!state.accounts.length) return toast('Crie uma conta antes de lançar.', 'error');
  const isNew = !t;
  t = t || { kind: preset.kind || 'expense', status: preset.paid === false ? 'pending' : 'paid', date: today(), amount: '', description: '', account_id: state.accounts[0].id, category_id: '' };
  const f = modal(!isNew ? 'Editar lançamento' : preset.paid === false ? (t.kind === 'income' ? 'Nova conta a receber' : 'Nova conta a pagar') : (t.kind === 'income' ? 'Nova entrada' : 'Novo lançamento'), `
    <div class="seg exp"><label><input type="radio" name="kind" value="expense" ${t.kind === 'expense' ? 'checked' : ''}><span>Despesa</span></label>
      <label><input type="radio" name="kind" value="income" ${t.kind === 'income' ? 'checked' : ''}><span>Receita</span></label></div>
    <label>Valor (R$)<input name="amount" inputmode="decimal" required placeholder="0,00" value="${esc(toInput(t.amount))}"></label>
    <label>Descrição<input name="description" required maxlength="120" value="${esc(t.description)}"></label>
    <div class="row2">
      <label>Data / vencimento<input type="date" name="date" required value="${t.date}"></label>
      <label>Conta<select name="account_id">${state.accounts.map(a => `<option value="${a.id}" ${a.id === t.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    </div>
    <label>Categoria<select name="category_id"></select></label>
    ${state.items.length ? `<label>Vincular a (opcional)<select name="item_id"><option value="">Geral da família</option>${state.items.map(i => `<option value="${i.id}" ${i.id === t.item_id ? 'selected' : ''}>${(KINDS[i.kind] || KINDS.other)[0]} ${esc(i.name)}</option>`).join('')}</select></label>` : ''}
    <label class="check"><input type="checkbox" name="paid" ${t.status !== 'pending' ? 'checked' : ''}><span id="paidLbl">Já foi pago</span></label>
    ${isNew ? `<div class="row2">
      <label>Repetição<select name="repeat"><option value="none">Única</option><option value="inst">Parcelado (divide o valor)</option><option value="monthly">Mensal (repete o valor)</option></select></label>
      <label>Vezes<input type="number" name="times" min="2" max="60" value="2"></label></div>` : ''}`,
    async fd => {
      const amount = parseBR(fd.get('amount'));
      if (!(amount > 0)) throw new Error('Informe um valor maior que zero.');
      const kind = fd.get('kind'), date = fd.get('date');
      const paid = fd.get('paid') === 'on', tdy = today(), payDate = d => (d <= tdy ? d : tdy);
      const base = {
        household_id: state.hid, kind, description: fd.get('description').trim(), account_id: fd.get('account_id'),
        category_id: fd.get('category_id') || null,
      };
      const itemSel = fd.get('item_id') || null;
      if (itemSel) base.item_id = itemSel;
      if (!isNew) {
        if (!navigator.onLine) throw new Error('Sem internet: para editar um lançamento é preciso estar conectado.');
        const upd = { ...base, amount, date, status: paid ? 'paid' : 'pending', paid_at: paid ? (t.paid_at || payDate(date)) : null };
        if (!itemSel && t.item_id) upd.item_id = null;
        const { error } = await sb.from('transactions').update(upd).eq('id', t.id);
        if (error) throw sqlHint(error);
        await reload(); toast('Lançamento salvo ✔');
      } else {
        const rep = fd.get('repeat'), n = rep === 'none' ? 1 : Math.min(60, Math.max(2, parseInt(fd.get('times')) || 2));
        const rows = [];
        for (let i = 0; i < n; i++) {
          let a = amount, desc = base.description;
          if (rep === 'inst') {
            const part = Math.floor(amount * 100 / n) / 100;
            a = i === n - 1 ? round2(amount - part * (n - 1)) : part;
            desc = `${base.description} (${i + 1}/${n})`;
          } else if (rep === 'monthly') desc = `${base.description} (${i + 1}/${n})`;
          const d = addMonths(date, i), p = paid && (i === 0 || d <= tdy);
          rows.push({ ...base, description: desc, amount: a, date: d, status: p ? 'paid' : 'pending', paid_at: p ? payDate(d) : null });
        }
        const queued = await insertTx(rows);
        await reload();
        toast(queued ? '📴 Salvo no aparelho — será enviado quando a internet voltar' : 'Lançamento salvo ✔');
      }
    }, { offlineOk: true });
  const sync = (keep) => {
    const k = $('[name=kind]:checked', f).value;
    $('[name=category_id]', f).innerHTML = catOptions(k, keep);
    $('#paidLbl', f).textContent = k === 'income' ? 'Já foi recebido' : 'Já foi pago';
  };
  sync(t.category_id);
  $$('[name=kind]', f).forEach(r => r.onchange = () => sync(''));
  const rep = $('[name=repeat]', f);
  if (rep) { const tm = $('[name=times]', f).closest('label'); const upd = () => tm.style.visibility = rep.value === 'none' ? 'hidden' : 'visible'; rep.onchange = upd; upd(); }
}
function exportCsv() {
  const safe = v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const head = ['Data', 'Tipo', 'Status', 'Descrição', 'Categoria', 'Conta', 'Membro', 'Valor'];
  const lines = [head, ...filteredTx().map(t => [fmtDate(t.date), t.kind === 'income' ? 'Receita' : 'Despesa', isPaid(t) ? 'Pago' : 'Pendente', t.description,
    catById(t.category_id)?.name || '', accById(t.account_id)?.name || '', memberName(t.user_id), String(t.amount).replace('.', ',')])]
    .map(r => r.map(safe).join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `lancamentos-${state.f.period === 'all' ? 'todos' : state.month}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Orçamento / categorias ---------- */
function vOrc() {
  const mt = monthTx();
  const spentOf = c => sum(mt.filter(t => t.category_id === c.id && t.kind === 'expense').map(t => t.amount));
  const exps = state.categories.filter(c => c.kind === 'expense'), incs = state.categories.filter(c => c.kind === 'income');
  const totalB = sum(exps.map(c => c.monthly_budget)), totalS = sum(exps.filter(c => num(c.monthly_budget) > 0).map(spentOf));
  const row = c => {
    const spent = spentOf(c), b = num(c.monthly_budget), pct = b ? spent / b * 100 : 0;
    return `<div class="item"><span class="dot" style="background:${esc(c.color)}"></span>
      <div class="grow"><div class="title">${esc(c.name)}</div>
        ${b ? `<div class="bar"><i class="${pct > 100 ? 'over' : pct >= 80 ? 'warn' : ''}" style="width:${Math.min(pct, 100)}%"></i></div>` : ''}
        <div class="sub">${brl(spent)} gastos${b ? ` de ${brl(b)} (${Math.round(pct)}%)` : ' · sem orçamento'}</div></div>
      <div class="row-actions"><button class="icon-btn" data-act="cat-edit" data-id="${c.id}" title="Editar">✏️</button></div></div>`;
  };
  return `
  <div class="view-head"><h2>Orçamento</h2><button class="btn sm primary" data-act="cat-new">＋ Categoria</button></div>
  <div class="card stat" style="margin-bottom:1rem"><div class="label">Orçado no mês</div>
    <div class="value num">${brl(totalS)} <span class="muted small">de ${brl(totalB)}</span></div>
    <div class="bar"><i class="${totalS > totalB ? 'over' : ''}" style="width:${totalB ? Math.min(totalS / totalB * 100, 100) : 0}%"></i></div></div>
  <div class="section-title">Despesas</div><div class="card"><div class="list">${exps.map(row).join('') || '<div class="empty">Sem categorias.</div>'}</div></div>
  <div class="section-title">Receitas</div><div class="card"><div class="list">${incs.map(row).join('') || '<div class="empty">Sem categorias.</div>'}</div></div>`;
}
function catModal(c) {
  const isNew = !c; c = c || { name: '', kind: 'expense', color: '#0f766e', monthly_budget: 0 };
  const f = modal(isNew ? 'Nova categoria' : 'Editar categoria', `
    <label>Nome<input name="nome" required maxlength="60" value="${esc(c.name)}"></label>
    <div class="row2"><label>Tipo<select name="kind" ${isNew ? '' : 'disabled'}>
      <option value="expense" ${c.kind === 'expense' ? 'selected' : ''}>Despesa</option><option value="income" ${c.kind === 'income' ? 'selected' : ''}>Receita</option></select></label>
      <label>Cor<input type="color" name="color" value="${esc(c.color)}"></label></div>
    <label data-budget>Orçamento mensal (R$)<input name="budget" inputmode="decimal" value="${num(c.monthly_budget) ? toInput(c.monthly_budget) : ''}" placeholder="0,00 (sem limite)"></label>
    ${isNew ? '' : '<button type="button" class="btn danger sm" data-del>Excluir categoria</button>'}`,
    async fd => {
      const budget = fd.get('budget').trim() ? parseBR(fd.get('budget')) : 0;
      if (!(budget >= 0)) throw new Error('Orçamento inválido.');
      const kind = isNew ? fd.get('kind') : c.kind;
      const row = { name: fd.get('nome').trim(), color: fd.get('color'), monthly_budget: kind === 'expense' ? budget : 0 };
      const { error } = isNew ? await sb.from('categories').insert({ ...row, kind, household_id: state.hid })
        : await sb.from('categories').update(row).eq('id', c.id);
      if (error) throw error;
      await reload(); toast('Categoria salva ✔');
    });
  const kindSel = $('[name=kind]', f), bl = $('[data-budget]', f);
  const upd = () => bl.classList.toggle('hidden', kindSel.value !== 'expense'); kindSel.onchange = upd; upd();
  const del = $('[data-del]', f);
  if (del) del.onclick = async () => {
    if (!confirm('Excluir esta categoria? Os lançamentos ficarão "sem categoria".')) return;
    const { error } = await sb.from('categories').delete().eq('id', c.id);
    if (error) return toast(error.message, 'error');
    $('#modal').close(); await reload(); toast('Categoria excluída');
  };
}

/* ---------- Metas ---------- */
function vMetas() {
  const card = g => {
    const cur = num(g.current_amount), tgt = num(g.target_amount), pct = Math.min(cur / tgt * 100, 100), left = Math.max(tgt - cur, 0);
    let extra = '';
    if (g.deadline && left > 0) {
      const [y, m] = today().split('-').map(Number), [y2, m2] = g.deadline.split('-').map(Number);
      const months = Math.max(1, (y2 * 12 + m2) - (y * 12 + m));
      extra = ` · prazo ${fmtDate(g.deadline)} · guardar ${brl(left / months)}/mês`;
    }
    return `<div class="card"><div class="item" style="border:0;padding:0">
      <div class="grow"><div class="title">${esc(g.name)} ${cur >= tgt ? '<span class="badge">Concluída 🎉</span>' : ''}</div>
        <div class="sub num">${brl(cur)} de ${brl(tgt)} (${Math.round(pct)}%)${esc(extra)}</div></div>
      <div class="row-actions"><button class="icon-btn" data-act="goal-edit" data-id="${g.id}" title="Editar">✏️</button>
        <button class="icon-btn" data-act="goal-del" data-id="${g.id}" title="Excluir">🗑️</button></div></div>
      <div class="bar" style="height:10px"><i style="width:${pct}%"></i></div>
      <p style="margin:.7rem 0 0"><button class="btn sm" data-act="goal-dep" data-id="${g.id}">＋ Depositar / retirar</button></p></div>`;
  };
  return `<div class="view-head"><h2>Metas</h2><button class="btn sm primary" data-act="goal-new">＋ Nova meta</button></div>
    <div class="stack">${state.goals.map(card).join('') || '<div class="card empty">Crie metas como “Viagem”, “Reserva de emergência” ou “Entrada do apê”.</div>'}</div>`;
}
function goalModal(g) {
  const isNew = !g; g = g || { name: '', target_amount: '', current_amount: 0, deadline: '' };
  modal(isNew ? 'Nova meta' : 'Editar meta', `
    <label>Nome<input name="nome" required maxlength="80" value="${esc(g.name)}"></label>
    <div class="row2"><label>Valor da meta<input name="target" inputmode="decimal" required value="${esc(toInput(g.target_amount))}"></label>
      <label>Já guardado<input name="current" inputmode="decimal" value="${esc(toInput(g.current_amount))}"></label></div>
    <label>Prazo (opcional)<input type="date" name="deadline" value="${g.deadline || ''}"></label>`,
    async fd => {
      const target = parseBR(fd.get('target')), current = fd.get('current').trim() ? parseBR(fd.get('current')) : 0;
      if (!(target > 0) || !(current >= 0)) throw new Error('Valores inválidos.');
      const row = { name: fd.get('nome').trim(), target_amount: target, current_amount: current, deadline: fd.get('deadline') || null };
      const { error } = isNew ? await sb.from('goals').insert({ ...row, household_id: state.hid }) : await sb.from('goals').update(row).eq('id', g.id);
      if (error) throw error;
      await reload(); toast('Meta salva ✔');
    });
}
function goalDeposit(g) {
  modal(`Movimentar: ${g.name}`, `
    <div class="seg"><label><input type="radio" name="op" value="dep" checked><span>Depositar</span></label><label><input type="radio" name="op" value="wd"><span>Retirar</span></label></div>
    <label>Valor (R$)<input name="amount" inputmode="decimal" required placeholder="0,00"></label>`,
    async fd => {
      const v = parseBR(fd.get('amount'));
      if (!(v > 0)) throw new Error('Informe um valor maior que zero.');
      const next = round2(num(g.current_amount) + (fd.get('op') === 'dep' ? v : -v));
      if (next < 0) throw new Error('A retirada é maior que o valor guardado.');
      const { error } = await sb.from('goals').update({ current_amount: next }).eq('id', g.id);
      if (error) throw error;
      await reload(); toast('Meta atualizada ✔');
    });
}

/* ---------- Contas ---------- */
function vContas() {
  const total = sum(state.accounts.map(accBalance));
  return `<div class="view-head"><h2>Contas</h2><button class="btn sm primary" data-act="acc-new">＋ Nova conta</button></div>
    <div class="card stat" style="margin-bottom:1rem"><div class="label">Saldo total</div><div class="value num ${total < 0 ? 'expense' : ''}">${brl(total)}</div></div>
    <div class="card"><div class="list">${state.accounts.map(a => { const b = accBalance(a); return `
      <div class="item"><div class="grow"><div class="title">${esc(a.name)}</div><div class="sub">${esc(ACC_TYPES[a.type] || a.type)}</div></div>
        <div class="num"><b class="${b < 0 ? 'expense' : ''}">${brl(b)}</b></div>
        <div class="row-actions"><button class="icon-btn" data-act="acc-edit" data-id="${a.id}" title="Editar">✏️</button>
          <button class="icon-btn" data-act="acc-del" data-id="${a.id}" title="Excluir">🗑️</button></div></div>`; }).join('') || '<div class="empty">Nenhuma conta.</div>'}</div></div>`;
}
function accModal(a) {
  const isNew = !a; a = a || { name: '', type: 'checking', initial_balance: 0 };
  modal(isNew ? 'Nova conta' : 'Editar conta', `
    <label>Nome<input name="nome" required maxlength="60" value="${esc(a.name)}" placeholder="Nubank, Itaú, Carteira…"></label>
    <div class="row2"><label>Tipo<select name="type">${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Saldo inicial<input name="bal" inputmode="decimal" value="${esc(toInput(a.initial_balance))}" placeholder="0,00"></label></div>`,
    async fd => {
      const bal = fd.get('bal').trim() ? parseBR(fd.get('bal')) : 0;
      if (!Number.isFinite(bal)) throw new Error('Saldo inválido.');
      const row = { name: fd.get('nome').trim(), type: fd.get('type'), initial_balance: bal };
      const { error } = isNew ? await sb.from('accounts').insert({ ...row, household_id: state.hid }) : await sb.from('accounts').update(row).eq('id', a.id);
      if (error) throw error;
      await reload(); toast('Conta salva ✔');
    });
}

/* ---------- Família ---------- */
function vFamilia() {
  const owner = state.role === 'owner';
  return `<div class="view-head"><h2>Família</h2></div>
  <div class="cols">
    <div class="card"><h3>${esc(state.hh?.name)}</h3>
      <p class="muted small">Compartilhe este código para convidar alguém (a pessoa cria a conta e escolhe “Entrar com convite”).</p>
      <div class="code">${esc(state.hh?.invite_code)}</div>
      <div class="actions" style="justify-content:center">
        <button class="btn sm" data-act="copy-code">📋 Copiar</button>
        ${owner ? '<button class="btn sm" data-act="regen-code">🔄 Novo código</button><button class="btn sm" data-act="rename-hh">✏️ Renomear</button>' : ''}</div></div>
    <div class="card"><h3>Membros</h3><div class="list">${state.members.map(m => `
      <div class="item">${avatar(m.avatar, m.display_name, 42)}<div class="grow"><div class="title">${esc(m.display_name)} ${m.user_id === state.user.id ? '<span class="muted small">(você)</span>' : ''}</div>
        <div class="sub">${m.role === 'owner' ? 'Administrador' : 'Membro'}</div></div>
        ${owner && m.user_id !== state.user.id ? `<button class="btn sm danger" data-act="kick" data-id="${m.user_id}">Remover</button>` : ''}</div>`).join('')}</div></div>
  </div>
  <div class="card"><h3>Minha conta</h3>
    <p class="muted small">${esc(state.user.email)}</p>
    <div class="actions" style="justify-content:flex-start;flex-wrap:wrap">
      <button class="btn sm" data-act="u-photo">📷 Alterar minha foto</button>
      <button class="btn sm" data-act="rename-me">Alterar meu nome</button>
      <button class="btn sm" data-act="logout">Sair</button>
      <button class="btn sm danger" data-act="leave">${state.members.length === 1 ? 'Excluir família' : 'Sair da família'}</button></div></div>`;
}
function ageStr(d) {
  if (!d) return '';
  const [y, m, dd] = d.split('-').map(Number), n = new Date();
  let months = (n.getFullYear() - y) * 12 + (n.getMonth() + 1 - m) - (n.getDate() < dd ? 1 : 0);
  if (months < 0) return '';
  return months < 24 ? `${months} ${months === 1 ? 'mês' : 'meses'}` : `${Math.floor(months / 12)} anos`;
}
function vPerfis() {
  const mk = state.month;
  const stat = it => {
    const l = state.tx.filter(t => t.item_id === it.id && t.kind === 'expense');
    return { m: txSum(l.filter(t => t.date.startsWith(mk)), 'expense'), all: txSum(l, 'expense') };
  };
  const card = it => {
    const [emo, lbl] = KINDS[it.kind] || KINDS.other, s = stat(it), ph = safeImg(it.photo), age = ageStr(it.birth_date);
    return `<div class="card pcard"><div class="pcover">${ph ? `<img src="${ph}" alt="">` : `<span>${emo}</span>`}</div>
      <div class="pbody"><div class="title">${esc(it.name)}</div>
        <div class="sub">${esc(lbl)}${it.detail ? ' · ' + esc(it.detail) : ''}${age ? ' · ' + age : ''}</div>
        <div class="pstat"><div><span class="small muted">No mês</span><br><b class="expense num">${brl(s.m)}</b></div>
          <div><span class="small muted">Total gasto</span><br><b class="num">${brl(s.all)}</b></div></div>
        <div class="actions" style="justify-content:flex-start;flex-wrap:wrap">
          <button class="btn sm" data-act="item-tx" data-id="${it.id}">Ver gastos</button>
          <button class="btn sm" data-act="item-edit" data-id="${it.id}">✏️ Editar</button></div></div></div>`;
  };
  const groups = Object.entries(KINDS).map(([k, [emo, lbl]]) => [k, emo, lbl, state.items.filter(i => i.kind === k)]).filter(g => g[3].length);
  return `<div class="view-head"><h2>Perfis</h2><button class="btn sm primary" data-act="item-new">＋ Adicionar</button></div>
  <p class="muted small" style="margin-top:0">Cadastre filhos, veículos, pets… com foto. Ao lançar um gasto você pode vincular a um perfil e ver quanto cada um custa.</p>
  ${!state.itemsOk ? '<div class="card" style="margin-bottom:1rem"><b>⚠️ Falta ativar no banco.</b><p class="small muted" style="margin:.3rem 0 0">Rode o SQL <code>migracao_perfis_offline.sql</code> no Supabase (SQL Editor → Run) e recarregue.</p></div>' : ''}
  ${groups.length ? groups.map(([k, emo, lbl, list]) => `<div class="section-title">${emo} ${lbl}</div><div class="pgrid">${list.map(card).join('')}</div>`).join('')
    : (state.itemsOk ? '<div class="card empty">Nenhum perfil ainda. Toque em <b>＋ Adicionar</b> para cadastrar um filho, veículo ou pet.</div>' : '')}`;
}
function itemModal(it) {
  const isNew = !it; it = it || { kind: 'child', name: '', detail: '', birth_date: '', photo: '' };
  let photo = safeImg(it.photo);
  const f = modal(isNew ? 'Novo perfil' : 'Editar perfil', `
    <div class="photo-pick"><div class="pp-prev" id="ppPrev"></div>
      <div class="pp-btns"><button type="button" class="btn sm" id="ppSel">📷 Escolher foto</button><button type="button" class="btn sm ghost" id="ppClr">Remover foto</button></div></div>
    <label>Tipo<select name="kind">${Object.entries(KINDS).map(([k, [emo, lbl]]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${emo} ${lbl}</option>`).join('')}</select></label>
    <label>Nome<input name="nome" required maxlength="60" value="${esc(it.name)}" placeholder="Ex.: Pedro, Gol branco, Thor"></label>
    <label id="detLbl">Detalhe (opcional)<input name="detail" maxlength="80" value="${esc(it.detail || '')}"></label>
    <label id="birthLbl">Nascimento<input type="date" name="birth" value="${it.birth_date || ''}"></label>
    ${isNew ? '' : '<button type="button" class="btn danger sm" data-del>Excluir perfil</button>'}`,
    async fd => {
      const row = { name: fd.get('nome').trim(), kind: fd.get('kind'), detail: fd.get('detail').trim() || null, birth_date: fd.get('birth') || null, photo: photo || null };
      const { error } = isNew ? await sb.from('family_items').insert({ ...row, household_id: state.hid }) : await sb.from('family_items').update(row).eq('id', it.id);
      if (error) throw sqlHint(error);
      await reload(); toast('Perfil salvo ✔');
    });
  const kindSel = $('[name=kind]', f);
  const prev = () => { $('#ppPrev', f).innerHTML = photo ? `<img src="${photo}" alt="">` : `<span>${(KINDS[kindSel.value] || KINDS.other)[0]}</span>`; };
  const hints = { child: 'Escola / série', person: 'Parentesco ou observação', vehicle: 'Placa · ano · modelo', pet: 'Raça', other: 'Detalhe' };
  const sync = () => {
    $('#detLbl', f).firstChild.textContent = hints[kindSel.value] + ' (opcional)';
    $('#birthLbl', f).classList.toggle('hidden', kindSel.value === 'vehicle' || kindSel.value === 'other');
    prev();
  };
  kindSel.onchange = sync; sync();
  $('#ppSel', f).onclick = async () => { try { const d = await pickImage(480); if (d) { photo = d; prev(); } } catch (e) { toast(e.message, 'error'); } };
  $('#ppClr', f).onclick = () => { photo = ''; prev(); };
  const del = $('[data-del]', f);
  if (del) del.onclick = async () => {
    if (!navigator.onLine) return toast('Sem internet: conecte-se para excluir.', 'error');
    if (!confirm('Excluir este perfil? Os lançamentos continuam, só perdem o vínculo.')) return;
    const { error } = await sb.from('family_items').delete().eq('id', it.id);
    if (error) return toast(error.message, 'error');
    $('#modal').close(); await reload(); toast('Perfil excluído');
  };
}
function promptModal(title, label, value, onSave) {
  modal(title, `<label>${esc(label)}<input name="v" required maxlength="80" value="${esc(value)}"></label>`,
    async fd => { await onSave(fd.get('v').trim()); await reload(); toast('Salvo ✔'); });
}

/* ---------- Ações (delegação de eventos) ---------- */
const ACTIONS = {
  'tx-new': () => txModal(),
  'item-new': () => itemModal(), 'item-edit': id => itemModal(state.items.find(i => i.id === id)),
  'item-tx': id => { state.f.item = id; state.f.period = 'all'; state.f.status = ''; setView('lancamentos'); },
  'u-photo': async () => {
    try {
      const d = await pickImage(256, true); if (!d) return;
      if (!navigator.onLine) throw new Error('Sem internet: conecte-se para trocar a foto.');
      const { error } = await sb.from('household_members').update({ avatar: d }).eq('household_id', state.hid).eq('user_id', state.user.id);
      if (error) throw sqlHint(error);
      await reload(); toast('Foto atualizada ✔');
    } catch (e) { toast(e.message || String(e), 'error'); }
  },
  'u-photo-rm': async () => {
    if (!navigator.onLine) return toast('Sem internet: conecte-se para remover a foto.', 'error');
    const { error } = await sb.from('household_members').update({ avatar: null }).eq('household_id', state.hid).eq('user_id', state.user.id);
    error ? toast(sqlHint(error).message, 'error') : (await reload(), toast('Foto removida'));
  },
  'cx-in': () => txModal(null, { kind: 'income', paid: true }),
  'cx-out': () => txModal(null, { kind: 'expense', paid: true }),
  'new-pay': () => txModal(null, { kind: 'expense', paid: false }),
  'new-rec': () => txModal(null, { kind: 'income', paid: false }),
  'set-st': (id, el) => { state[el.dataset.scope].st = el.dataset.val; render(); },
  'tx-unpay': async id => {
    if (!confirm('Estornar a baixa? O lançamento volta para pendente e sai do caixa.')) return;
    const { error } = await sb.from('transactions').update({ status: 'pending', paid_at: null }).eq('id', id);
    error ? toast(error.message, 'error') : (await reload(), toast('Baixa estornada'));
  },
  'tx-edit': id => txModal(state.tx.find(t => t.id === id)),
  'tx-pay': id => {
    const t = state.tx.find(x => x.id === id); if (!t) return;
    const inc = t.kind === 'income', total = num(t.amount);
    const f = modal(inc ? 'Receber ou abater' : 'Pagar ou abater',
      `<p class="muted small"><b>${esc(t.description)}</b><br>Valor em aberto: <b>${brl(total)}</b> · venc. ${fmtDate(t.date)}</p>
       <label>${inc ? 'Valor recebido agora (R$)' : 'Valor pago agora (R$)'}<input name="v" inputmode="decimal" required value="${esc(toInput(total))}"></label>
       <div class="chips"><button type="button" class="btn sm" data-frac="1">Valor total</button><button type="button" class="btn sm" data-frac="0.5">Metade</button></div>
       <p class="small" id="restLbl"></p>
       <div class="row2"><label>${inc ? 'Data do recebimento' : 'Data do pagamento'}<input type="date" name="d" required value="${today()}"></label>
         <label>Conta<select name="acc">${state.accounts.map(x => `<option value="${x.id}" ${x.id === t.account_id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>`,
      async fd => {
        const v = parseBR(fd.get('v'));
        if (!(v > 0)) throw new Error('Informe um valor maior que zero.');
        if (v > total + 0.004) throw new Error(`O valor é maior que o que está em aberto (${brl(total)}).`);
        const d = fd.get('d'), acc = fd.get('acc');
        if (v >= total - 0.004) {                       // baixa total
          const { error } = await sb.from('transactions').update({ status: 'paid', paid_at: d, account_id: acc }).eq('id', id);
          if (error) throw error;
        } else {                                        // abatimento parcial: registra o pago e mantém o restante em aberto
          const ins = await sb.from('transactions').insert({
            household_id: state.hid, kind: t.kind, account_id: acc, category_id: t.category_id, amount: round2(v),
            description: (t.description + ' — abatimento').slice(0, 120), date: t.date, status: 'paid', paid_at: d,
          }).select('id').single();
          if (ins.error) throw ins.error;
          const up = await sb.from('transactions').update({ amount: round2(total - v) }).eq('id', id);
          if (up.error) { await sb.from('transactions').delete().eq('id', ins.data.id); throw up.error; }
        }
        await reload();
        toast(v >= total - 0.004 ? (inc ? 'Recebimento confirmado ✔' : 'Baixa realizada ✔') : `Abatido ${brl(v)} — restam ${brl(total - v)}`);
      }, { submit: 'Confirmar' });
    const inp = $('[name=v]', f);
    const upd = () => {
      const v = parseBR(inp.value), r = round2(total - (Number.isFinite(v) ? v : 0));
      $('#restLbl', f).innerHTML = v > total + 0.004 ? '<b class="expense">Maior que o valor em aberto</b>'
        : r > 0.004 ? `Restará em aberto: <b>${brl(r)}</b>` : '<b class="income">Quita totalmente ✔</b>';
    };
    inp.addEventListener('input', upd);
    $$('[data-frac]', f).forEach(b => b.onclick = () => { inp.value = toInput(round2(total * Number(b.dataset.frac))); upd(); });
    upd();
  },
  'tx-del': async id => {
    if (!confirm('Excluir este lançamento?')) return;
    const { error } = await sb.from('transactions').delete().eq('id', id);
    error ? toast(error.message, 'error') : (await reload(), toast('Lançamento excluído'));
  },
  export: exportCsv,
  more: () => { state.limit += 100; render(); },
  'cat-new': () => catModal(), 'cat-edit': id => catModal(catById(id)),
  'goal-new': () => goalModal(), 'goal-edit': id => goalModal(state.goals.find(g => g.id === id)),
  'goal-dep': id => goalDeposit(state.goals.find(g => g.id === id)),
  'goal-del': async id => {
    if (!confirm('Excluir esta meta?')) return;
    const { error } = await sb.from('goals').delete().eq('id', id);
    error ? toast(error.message, 'error') : (await reload(), toast('Meta excluída'));
  },
  'acc-new': () => accModal(), 'acc-edit': id => accModal(accById(id)),
  'acc-del': async id => {
    if (!confirm('Excluir esta conta?')) return;
    const { error } = await sb.from('accounts').delete().eq('id', id);
    if (error) return toast(/foreign key|violates/i.test(error.message) ? 'Esta conta possui lançamentos. Exclua ou mude os lançamentos antes.' : error.message, 'error');
    await reload(); toast('Conta excluída');
  },
  'copy-code': async () => {
    try { await navigator.clipboard.writeText(state.hh.invite_code); toast('Código copiado'); } catch { toast('Copie manualmente: ' + state.hh.invite_code); }
  },
  'regen-code': async () => {
    if (!confirm('Gerar um novo código? O código antigo deixará de funcionar.')) return;
    const { error } = await sb.rpc('regenerate_invite_code', { p_hid: state.hid });
    error ? toast(error.message, 'error') : (await reload(), toast('Novo código gerado'));
  },
  'rename-hh': () => promptModal('Renomear família', 'Nome da família', state.hh.name, async v => {
    const { error } = await sb.from('households').update({ name: v }).eq('id', state.hid); if (error) throw error;
  }),
  'rename-me': () => promptModal('Seu nome', 'Como você aparece para a família', state.myName, async v => {
    const { error } = await sb.from('household_members').update({ display_name: v }).eq('household_id', state.hid).eq('user_id', state.user.id);
    if (error) throw error; state.myName = v;
  }),
  kick: async id => {
    if (!confirm('Remover este membro da família?')) return;
    const { error } = await sb.from('household_members').delete().eq('household_id', state.hid).eq('user_id', id);
    error ? toast(error.message, 'error') : (await reload(), toast('Membro removido'));
  },
  leave: async () => {
    const alone = state.members.length === 1;
    if (!alone && state.role === 'owner') return toast('Você é o administrador: remova os outros membros antes de sair.', 'error');
    if (!confirm(alone ? 'Excluir a família e TODOS os dados? Isso não pode ser desfeito.' : 'Sair da família?')) return;
    const { error } = alone ? await sb.from('households').delete().eq('id', state.hid)
      : await sb.from('household_members').delete().eq('household_id', state.hid).eq('user_id', state.user.id);
    if (error) return toast(error.message, 'error');
    if (chan) { sb.removeChannel(chan); chan = null; }
    state.hid = null; show('onboard');
  },
  logout,
};

const NEEDS_ONLINE = new Set(['tx-del', 'tx-unpay', 'goal-del', 'acc-del', 'regen-code', 'kick', 'leave', 'u-photo-rm']);
function runAct(el) {
  const act = el.dataset.act, fn = ACTIONS[act]; if (!fn) return;
  if (!navigator.onLine && NEEDS_ONLINE.has(act)) return toast('Sem internet: esta ação precisa de conexão.', 'error');
  fn(el.dataset.id, el);
}
function openUserMenu() {
  const m = $('#userMenu'), me = state.members.find(x => x.user_id === state.user?.id), name = state.myName || state.user?.email || '';
  if (!m.classList.contains('hidden')) return m.classList.add('hidden');
  m.innerHTML = `<div class="um-head">${avatar(me?.avatar, name, 56)}<div style="min-width:0"><b>${esc(name)}</b><div class="small muted" style="overflow:hidden;text-overflow:ellipsis">${esc(state.user?.email || '')}</div></div></div>
    <button class="um-item" data-act="u-photo">📷 ${me?.avatar ? 'Trocar' : 'Adicionar'} minha foto</button>
    ${me?.avatar ? '<button class="um-item" data-act="u-photo-rm">🗑️ Remover foto</button>' : ''}
    <button class="um-item" data-act="rename-me">✏️ Alterar meu nome</button>
    <button class="um-item" data-go="familia">👨‍👩‍👧 Família e convite</button>
    <button class="um-item out" data-act="logout">⎋ Sair da conta</button>`;
  m.classList.remove('hidden');
}
function initApp() {
  $('#view').addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); return setView(go.dataset.go); }
    const el = e.target.closest('[data-act]'); if (!el) return;
    runAct(el);
  });
  document.addEventListener('click', e => {
    const menu = $('#userMenu');
    if (e.target.closest('#userBtn')) { openUserMenu(); return; }
    if (e.target.closest('#userMenu')) {
      const g = e.target.closest('[data-go]'), el = e.target.closest('[data-act]');
      if (g) setView(g.dataset.go); else if (el) runAct(el);
      if (g || el) menu.classList.add('hidden');
      return;
    }
    menu.classList.add('hidden');
  });
  window.addEventListener('online', () => { render(); flushQueue(); });
  window.addEventListener('offline', () => render());
  setInterval(() => { if (state.queue.length) flushQueue(); }, 30000);
  const onFilter = e => {
    const k = e.target.dataset.filter; if (!k) return;
    state[e.target.dataset.scope || 'f'][k] = e.target.value; state.limit = 100; render();
  };
  $('#view').addEventListener('input', e => e.target.matches('input[data-filter]') && onFilter(e));
  $('#view').addEventListener('change', e => e.target.matches('select[data-filter]') && onFilter(e));
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  $('#fab').onclick = () => txModal(null, { pagar: { kind: 'expense', paid: false }, receber: { kind: 'income', paid: false } }[state.view] || {});
  $('#prevM').onclick = () => { state.month = addMonths(state.month + '-01', -1).slice(0, 7); render(); };
  $('#nextM').onclick = () => { state.month = addMonths(state.month + '-01', 1).slice(0, 7); render(); };
  window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS[v] && v !== state.view && state.hid) setView(v); });
  if (VIEWS[location.hash.slice(1)]) state.view = location.hash.slice(1);
  let narrow = window.innerWidth < 520, rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { const n = window.innerWidth < 520; if (n !== narrow) { narrow = n; if (state.hid && state.view === 'painel') render(); } }, 200);
  });
}

/* ---------- Boot ---------- */
initAuthUI(); initApp(); setAuthMode('login');
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol))
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
sb.auth.onAuthStateChange((event, session) => {
  // não aguardar chamadas ao Supabase dentro do callback (evita deadlock)
  setTimeout(() => (event === 'PASSWORD_RECOVERY' ? recoveryModal() : handleSession(session)), 0);
});
