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
  painel: ['📊', 'Painel'], lancamentos: ['💸', 'Lançamentos'], orcamento: ['🎯', 'Orçamento'],
  metas: ['🏁', 'Metas'], contas: ['🏦', 'Contas'], familia: ['👨‍👩‍👧', 'Família'],
};
const state = {
  user: null, hid: null, hh: null, role: null, myName: '',
  members: [], accounts: [], categories: [], goals: [], tx: [],
  month: today().slice(0, 7), view: 'painel', limit: 100,
  f: { q: '', kind: '', account: '', category: '', member: '', period: 'month' },
};
let charts = [], chan = null, reloadTimer = null;

const catById = id => state.categories.find(c => c.id === id);
const accById = id => state.accounts.find(a => a.id === id);
const memberName = uid => state.members.find(m => m.user_id === uid)?.display_name || '—';
const monthTx = () => state.tx.filter(t => t.date.startsWith(state.month));
const txSum = (list, kind) => sum(list.filter(t => t.kind === kind).map(t => t.amount));
const accBalance = a => num(a.initial_balance) + txSum(state.tx.filter(t => t.account_id === a.id), 'income') - txSum(state.tx.filter(t => t.account_id === a.id), 'expense');

/* ---------- Modal ---------- */
function modal(title, body, onSubmit, { submit = 'Salvar' } = {}) {
  const m = $('#modal');
  m.innerHTML = `<form class="modal-form"><h3>${esc(title)}</h3>${body}
    <div class="actions"><button type="button" class="btn ghost" data-close>Cancelar</button>
    ${onSubmit ? `<button class="btn primary">${esc(submit)}</button>` : ''}</div></form>`;
  const f = $('form', m);
  $('[data-close]', m).onclick = () => m.close();
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = $('.primary', f); btn.disabled = true;
    try { await onSubmit(new FormData(f), f); m.close(); }
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
async function reload() {
  try {
    const q = t => sb.from(t).select('*').eq('household_id', state.hid);
    const [acc, cat, goal, mem, hh, tx] = await Promise.all([
      q('accounts').order('created_at'), q('categories').order('name'), q('goals').order('created_at'),
      q('household_members').order('joined_at'),
      sb.from('households').select('name,invite_code').eq('id', state.hid).single(),
      fetchAllTx(),
    ]);
    for (const r of [acc, cat, goal, mem, hh]) if (r.error) throw r.error;
    state.accounts = acc.data; state.categories = cat.data; state.goals = goal.data;
    state.members = mem.data; state.hh = hh.data; state.tx = tx;
    render();
  } catch (e) { toast('Erro ao carregar: ' + (e.message || e), 'error'); }
}
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(reload, 400); }
function subscribe() {
  if (chan) sb.removeChannel(chan);
  chan = sb.channel('hh-' + state.hid);
  for (const table of ['accounts', 'categories', 'transactions', 'goals', 'household_members'])
    chan.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${state.hid}` }, scheduleReload);
  chan.subscribe();
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
  const { data, error } = await sb.from('household_members')
    .select('household_id,role,display_name').eq('user_id', state.user.id).maybeSingle();
  if (error) return toast(error.message, 'error');
  if (!data) { state.hid = null; show('onboard'); return; }
  Object.assign(state, { hid: data.household_id, role: data.role, myName: data.display_name });
  show('app'); subscribe(); await reload();
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
  $('#monthBar').style.visibility = ['metas', 'contas', 'familia'].includes(state.view) ? 'hidden' : 'visible';
  $('#nav').innerHTML = Object.entries(VIEWS).map(([k, [ico, lbl]]) =>
    `<button data-view="${k}" class="${k === state.view ? 'active' : ''}"><span>${ico}</span>${lbl}</button>`).join('');
  charts.forEach(c => c.destroy()); charts = [];
  const view = $('#view');
  const active = document.activeElement, keepFocus = active && view.contains(active) && active.dataset.filter ? active.dataset.filter : null;
  view.innerHTML = { painel: vPainel, lancamentos: vLanc, orcamento: vOrc, metas: vMetas, contas: vContas, familia: vFamilia }[state.view]();
  if (state.view === 'painel') drawCharts();
  if (keepFocus) { const el = $(`[data-filter="${keepFocus}"]`, view); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch { } } }
}

/* ---------- Painel ---------- */
function vPainel() {
  const mt = monthTx(), inc = txSum(mt, 'income'), exp = txSum(mt, 'expense');
  const total = sum(state.accounts.map(accBalance));
  const budgets = state.categories.filter(c => c.kind === 'expense' && num(c.monthly_budget) > 0)
    .map(c => ({ c, spent: sum(mt.filter(t => t.category_id === c.id && t.kind === 'expense').map(t => t.amount)) }))
    .sort((a, b) => b.spent / b.c.monthly_budget - a.spent / a.c.monthly_budget).slice(0, 5);
  const hasExp = exp > 0;
  return `
  <div class="stats">
    <div class="card stat"><div class="label">Receitas</div><div class="value income num">${brl(inc)}</div></div>
    <div class="card stat"><div class="label">Despesas</div><div class="value expense num">${brl(exp)}</div></div>
    <div class="card stat"><div class="label">Resultado do mês</div><div class="value num ${inc - exp >= 0 ? 'income' : 'expense'}">${brl(inc - exp)}</div></div>
    <div class="card stat"><div class="label">Saldo nas contas</div><div class="value num">${brl(total)}</div></div>
  </div>
  <div class="cols">
    <div class="card"><h3>Despesas por categoria</h3>
      ${hasExp ? '<div class="chart-box"><canvas id="chCat"></canvas></div>' : '<div class="empty">Sem despesas neste mês.</div>'}</div>
    <div class="card"><h3>Últimos 6 meses</h3><div class="chart-box"><canvas id="chMonths"></canvas></div></div>
  </div>
  <div class="cols">
    <div class="card"><h3>Orçamento do mês</h3>
      ${budgets.length ? budgets.map(({ c, spent }) => budgetRow(c, spent)).join('') :
      '<div class="empty">Defina orçamentos na aba <b>Orçamento</b> para acompanhar aqui.</div>'}</div>
    <div class="card"><h3>Últimos lançamentos</h3>
      ${mt.length ? `<div class="list">${mt.slice(0, 6).map(txRow).join('')}</div>` : '<div class="empty">Nenhum lançamento neste mês. Use o botão ＋.</div>'}</div>
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
function txRow(t) {
  const c = catById(t.category_id), a = accById(t.account_id), inc = t.kind === 'income';
  return `<div class="item">
    <span class="dot" style="background:${esc(c?.color || '#94a3b8')}"></span>
    <div class="grow"><div class="title">${esc(t.description)}</div>
      <div class="sub">${fmtDate(t.date)} · ${esc(c?.name || 'Sem categoria')} · ${esc(a?.name || '')} · ${esc(memberName(t.user_id))}</div></div>
    <div class="num ${inc ? 'income' : 'expense'}"><b>${inc ? '+' : '−'} ${brl(t.amount)}</b></div>
    <div class="row-actions">
      <button class="icon-btn" title="Editar" data-act="tx-edit" data-id="${t.id}">✏️</button>
      <button class="icon-btn" title="Excluir" data-act="tx-del" data-id="${t.id}">🗑️</button></div></div>`;
}
function filteredTx() {
  const f = state.f, q = f.q.trim().toLowerCase();
  return state.tx.filter(t =>
    (f.period === 'all' || t.date.startsWith(state.month)) &&
    (!f.kind || t.kind === f.kind) && (!f.account || t.account_id === f.account) &&
    (!f.category || t.category_id === f.category || (f.category === '_' && !t.category_id)) &&
    (!f.member || t.user_id === f.member) &&
    (!q || t.description.toLowerCase().includes(q) || (catById(t.category_id)?.name || '').toLowerCase().includes(q)));
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
    <select data-filter="account">${opt('', 'Todas as contas', !f.account)}${state.accounts.map(a => opt(a.id, a.name, f.account === a.id)).join('')}</select>
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
function txModal(t) {
  if (!state.accounts.length) return toast('Crie uma conta antes de lançar.', 'error');
  const isNew = !t;
  t = t || { kind: 'expense', date: today(), amount: '', description: '', account_id: state.accounts[0].id, category_id: '' };
  const f = modal(isNew ? 'Novo lançamento' : 'Editar lançamento', `
    <div class="seg exp"><label><input type="radio" name="kind" value="expense" ${t.kind === 'expense' ? 'checked' : ''}><span>Despesa</span></label>
      <label><input type="radio" name="kind" value="income" ${t.kind === 'income' ? 'checked' : ''}><span>Receita</span></label></div>
    <label>Valor (R$)<input name="amount" inputmode="decimal" required placeholder="0,00" value="${esc(toInput(t.amount))}"></label>
    <label>Descrição<input name="description" required maxlength="120" value="${esc(t.description)}"></label>
    <div class="row2">
      <label>Data<input type="date" name="date" required value="${t.date}"></label>
      <label>Conta<select name="account_id">${state.accounts.map(a => `<option value="${a.id}" ${a.id === t.account_id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    </div>
    <label>Categoria<select name="category_id"></select></label>
    ${isNew ? `<div class="row2">
      <label>Repetição<select name="repeat"><option value="none">Única</option><option value="inst">Parcelado (divide o valor)</option><option value="monthly">Mensal (repete o valor)</option></select></label>
      <label>Vezes<input type="number" name="times" min="2" max="60" value="2"></label></div>` : ''}`,
    async fd => {
      const amount = parseBR(fd.get('amount'));
      if (!(amount > 0)) throw new Error('Informe um valor maior que zero.');
      const kind = fd.get('kind'), date = fd.get('date');
      const base = {
        household_id: state.hid, kind, description: fd.get('description').trim(), account_id: fd.get('account_id'),
        category_id: fd.get('category_id') || null,
      };
      if (!isNew) {
        const { error } = await sb.from('transactions').update({ ...base, amount, date }).eq('id', t.id);
        if (error) throw error;
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
          rows.push({ ...base, description: desc, amount: a, date: addMonths(date, i) });
        }
        const { error } = await sb.from('transactions').insert(rows);
        if (error) throw error;
      }
      await reload(); toast('Lançamento salvo ✔');
    });
  const sync = (keep) => { $('[name=category_id]', f).innerHTML = catOptions($('[name=kind]:checked', f).value, keep); };
  sync(t.category_id);
  $$('[name=kind]', f).forEach(r => r.onchange = () => sync(''));
  const rep = $('[name=repeat]', f);
  if (rep) { const tm = $('[name=times]', f).closest('label'); const upd = () => tm.style.visibility = rep.value === 'none' ? 'hidden' : 'visible'; rep.onchange = upd; upd(); }
}
function exportCsv() {
  const safe = v => { v = String(v ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const head = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Membro', 'Valor'];
  const lines = [head, ...filteredTx().map(t => [fmtDate(t.date), t.kind === 'income' ? 'Receita' : 'Despesa', t.description,
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
      <div class="item"><div class="grow"><div class="title">${esc(m.display_name)} ${m.user_id === state.user.id ? '<span class="muted small">(você)</span>' : ''}</div>
        <div class="sub">${m.role === 'owner' ? 'Administrador' : 'Membro'}</div></div>
        ${owner && m.user_id !== state.user.id ? `<button class="btn sm danger" data-act="kick" data-id="${m.user_id}">Remover</button>` : ''}</div>`).join('')}</div></div>
  </div>
  <div class="card"><h3>Minha conta</h3>
    <p class="muted small">${esc(state.user.email)}</p>
    <div class="actions" style="justify-content:flex-start;flex-wrap:wrap">
      <button class="btn sm" data-act="rename-me">Alterar meu nome</button>
      <button class="btn sm" data-act="logout">Sair</button>
      <button class="btn sm danger" data-act="leave">${state.members.length === 1 ? 'Excluir família' : 'Sair da família'}</button></div></div>`;
}
function promptModal(title, label, value, onSave) {
  modal(title, `<label>${esc(label)}<input name="v" required maxlength="80" value="${esc(value)}"></label>`,
    async fd => { await onSave(fd.get('v').trim()); await reload(); toast('Salvo ✔'); });
}

/* ---------- Ações (delegação de eventos) ---------- */
const ACTIONS = {
  'tx-new': () => txModal(),
  'tx-edit': id => txModal(state.tx.find(t => t.id === id)),
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

function initApp() {
  $('#view').addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = ACTIONS[el.dataset.act]; fn && fn(el.dataset.id);
  });
  const onFilter = e => {
    const k = e.target.dataset.filter; if (!k) return;
    state.f[k] = e.target.value; state.limit = 100; render();
  };
  $('#view').addEventListener('input', e => e.target.matches('input[data-filter]') && onFilter(e));
  $('#view').addEventListener('change', e => e.target.matches('select[data-filter]') && onFilter(e));
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  $('#fab').onclick = () => txModal();
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
sb.auth.onAuthStateChange((event, session) => {
  // não aguardar chamadas ao Supabase dentro do callback (evita deadlock)
  setTimeout(() => (event === 'PASSWORD_RECOVERY' ? recoveryModal() : handleSession(session)), 0);
});
