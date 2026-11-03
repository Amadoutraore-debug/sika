/* Sika — devis & factures, données stockées localement (localStorage). */
(function () {
  'use strict';

  const STORE_KEY = 'sika.v1';
  const PAY_METHODS = ['Espèces', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Wave', 'Virement bancaire', 'Chèque'];
  const TYPE_LABEL = { devis: 'Devis', facture: 'Facture' };

  // ---------- Stockage ----------
  function defaultState() {
    return {
      company: {
        name: '', logo: '', activity: '', address: '', city: 'Abidjan', phone: '', email: '',
        rccm: '', ncc: '', bank: '', footer: '',
        tva: 18, quotePrefix: 'DEV', invoicePrefix: 'FAC', validityDays: 30, paymentDays: 30,
        quoteNotes: 'Devis valable 30 jours. Acompte de 50 % à la commande.',
        invoiceNotes: 'Paiement à réception de facture. Merci pour votre confiance.'
      },
      clients: [],
      docs: [],
      counters: {}
    };
  }

  function normalize(data) {
    const base = defaultState();
    return {
      company: Object.assign(base.company, (data && data.company) || {}),
      clients: (data && data.clients) || [],
      docs: (data && data.docs) || [],
      counters: (data && data.counters) || {}
    };
  }

  function hasLocal(key) {
    try { return !!localStorage.getItem(key); } catch (e) { return false; }
  }

  function load(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? normalize(JSON.parse(raw)) : defaultState();
    } catch (e) {
      return defaultState();
    }
  }

  // Mode en ligne : actif seulement si config.js contient les clés Supabase
  const CFG = window.SIKA_CONFIG || {};
  const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  let sb = null, user = null, storeKey = STORE_KEY;
  let pushTimer = null, pushing = false, pending = false, lastSynced = '';

  let state = load(storeKey);

  function save() {
    let ok = true;
    try {
      localStorage.setItem(storeKey, JSON.stringify(state));
    } catch (e) {
      ok = false;
      if (!CLOUD) toast('Impossible d\'enregistrer : stockage plein ou bloqué');
    }
    if (CLOUD && user) { queuePush(); return true; }
    return ok;
  }

  function queuePush() {
    pending = true;
    setSync('saving');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushCloud, 700);
  }

  async function pushCloud() {
    if (!user) return;
    if (pushing) { queuePush(); return; }
    pushing = true;
    pending = false;
    const stamp = new Date().toISOString();
    const { error } = await sb.from('sika_data').upsert({ user_id: user.id, data: state, updated_at: stamp });
    pushing = false;
    if (error) { pending = true; setSync('error'); return; }
    lastSynced = stamp;
    if (!pending) setSync('ok');
  }

  window.addEventListener('online', () => { if (CLOUD && user && pending) pushCloud(); });

  function setSync(s) {
    const el = $('#sync-status');
    if (!el) return;
    if (!CLOUD) { el.textContent = 'Données enregistrées sur cet appareil'; return; }
    if (!user) { el.textContent = ''; return; }
    const label = { ok: '● Synchronisé', saving: '● Enregistrement…', error: '● Hors ligne : en attente d\'envoi' }[s] || '';
    el.innerHTML = '<div>' + esc(user.email) + '</div><div class="sync ' + (s || '') + '">' + label + '</div><button class="btn btn-sm btn-ghost logout" id="logout">Se déconnecter</button>';
    $('#logout').onclick = logout;
  }

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const money = (v) => nf.format(Math.round(v || 0)).replace(/ | /g, ' ') + ' FCFA';
  const today = () => toISO(new Date());
  function toISO(d) { const z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }
  function addDays(iso, days) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + Number(days || 0)); return toISO(d); }
  function fmtDate(iso) { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // Montant en lettres (français)
  const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  function below100(n, final) {
    if (n < 17) return UNITS[n];
    if (n < 20) return 'dix-' + UNITS[n - 10];
    const t = Math.floor(n / 10), u = n % 10;
    if (t === 7) return n === 71 ? 'soixante et onze' : 'soixante-' + below100(n - 60, final);
    if (t === 8) return u === 0 ? (final ? 'quatre-vingts' : 'quatre-vingt') : 'quatre-vingt-' + UNITS[u];
    if (t === 9) return 'quatre-vingt-' + below100(n - 80, final);
    if (u === 0) return TENS[t];
    if (u === 1) return TENS[t] + ' et un';
    return TENS[t] + '-' + UNITS[u];
  }
  function below1000(n, final) {
    const h = Math.floor(n / 100), r = n % 100;
    if (h === 0) return below100(r, final);
    const head = h === 1 ? 'cent' : UNITS[h] + ' cent';
    if (r === 0) return h > 1 && final ? head + 's' : head;
    return head + ' ' + below100(r, final);
  }
  function inWords(value) {
    let n = Math.round(Math.abs(value));
    if (n === 0) return 'zéro';
    const parts = [];
    const bil = Math.floor(n / 1e9); n %= 1e9;
    const mil = Math.floor(n / 1e6); n %= 1e6;
    const th = Math.floor(n / 1e3); n %= 1e3;
    if (bil) parts.push(below1000(bil, true) + ' milliard' + (bil > 1 ? 's' : ''));
    if (mil) parts.push(below1000(mil, true) + ' million' + (mil > 1 ? 's' : ''));
    if (th) parts.push(th === 1 ? 'mille' : below1000(th, false) + ' mille');
    if (n) parts.push(below1000(n, true));
    return parts.join(' ');
  }

  // ---------- Calculs ----------
  function totals(doc) {
    const ht = (doc.items || []).reduce((s, it) => s + num(it.qty) * num(it.price), 0);
    const discount = Math.round(ht * num(doc.discount) / 100);
    const base = ht - discount;
    const tva = Math.round(base * num(doc.tva) / 100);
    const ttc = base + tva;
    const paid = (doc.payments || []).reduce((s, p) => s + num(p.amount), 0);
    return { ht: Math.round(ht), discount, base: Math.round(base), tva, ttc: Math.round(ttc), paid, due: Math.max(0, Math.round(ttc) - paid) };
  }

  // Statut affiché (calculé à partir du statut enregistré, des paiements et des dates)
  function status(doc) {
    const t = totals(doc);
    if (doc.type === 'facture') {
      if (doc.status === 'annulee') return { key: 'annulee', label: 'Annulée', cls: 'b-gray' };
      if (t.ttc > 0 && t.paid >= t.ttc) return { key: 'payee', label: 'Payée', cls: 'b-green' };
      if (doc.status === 'brouillon') return { key: 'brouillon', label: 'Brouillon', cls: 'b-gray' };
      if (doc.due && doc.due < today()) return { key: 'retard', label: 'En retard', cls: 'b-red' };
      if (t.paid > 0) return { key: 'partielle', label: 'Payée en partie', cls: 'b-gold' };
      return { key: 'envoyee', label: 'Envoyée', cls: 'b-blue' };
    }
    if (doc.status === 'accepte') return { key: 'accepte', label: doc.invoiceId ? 'Facturé' : 'Accepté', cls: 'b-green' };
    if (doc.status === 'refuse') return { key: 'refuse', label: 'Refusé', cls: 'b-red' };
    if (doc.status === 'brouillon') return { key: 'brouillon', label: 'Brouillon', cls: 'b-gray' };
    if (doc.due && doc.due < today()) return { key: 'expire', label: 'Expiré', cls: 'b-gold' };
    return { key: 'envoye', label: 'Envoyé', cls: 'b-blue' };
  }

  function nextNumber(type, dateIso) {
    const year = (dateIso || today()).slice(0, 4);
    const key = type + '-' + year;
    const n = (state.counters[key] || 0) + 1;
    state.counters[key] = n;
    const prefix = type === 'devis' ? state.company.quotePrefix : state.company.invoicePrefix;
    return (prefix || (type === 'devis' ? 'DEV' : 'FAC')) + '-' + year + '-' + String(n).padStart(3, '0');
  }

  const clientById = (id) => state.clients.find((c) => c.id === id);
  const docById = (id) => state.docs.find((d) => d.id === id);
  const clientName = (id) => (clientById(id) || {}).name || 'Client supprimé';

  // ---------- Routeur ----------
  const routes = [
    [/^\/?$/, renderDashboard, 'dashboard'],
    [/^\/devis$/, () => renderList('devis'), 'devis'],
    [/^\/factures$/, () => renderList('facture'), 'factures'],
    [/^\/nouveau\/(devis|facture)$/, (m) => renderEditor(null, m[1]), null],
    [/^\/doc\/([\w]+)$/, (m) => renderDoc(m[1]), null],
    [/^\/doc\/([\w]+)\/modifier$/, (m) => renderEditor(m[1]), null],
    [/^\/clients$/, renderClients, 'clients'],
    [/^\/client\/([\w]+)$/, (m) => renderClient(m[1]), 'clients'],
    [/^\/parametres$/, renderSettings, 'parametres'],
    [/^\/boutique$/, () => renderShop(), 'boutique'],
    [/^\/commandes$/, () => renderOrders(), 'commandes'],
    [/^\/commande\/([\w-]+)$/, (m) => renderOrder(m[1]), 'commandes']
  ];

  function router() {
    if (CLOUD && !user) return;
    const path = (location.hash || '#/').slice(1).split('?')[0];
    const view = $('#view');
    for (const [re, fn, nav] of routes) {
      const m = path.match(re);
      if (m) {
        let navKey = nav;
        if (!navKey && m[1]) {
          const d = docById(m[1]);
          navKey = m[1] === 'devis' || (d && d.type === 'devis') ? 'devis' : 'factures';
        }
        $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
        view.innerHTML = '';
        fn(m);
        window.scrollTo(0, 0);
        return;
      }
    }
    location.hash = '#/';
  }

  const go = (hash) => { if (location.hash === hash) router(); else location.hash = hash; };

  // ---------- Petits composants ----------
  const badge = (doc) => { const s = status(doc); return '<span class="badge ' + s.cls + '">' + s.label + '</span>'; };
  const ICON = {
    plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v14h-2zM5 11h14v2H5z"/></svg>',
    print: '<svg viewBox="0 0 24 24"><path d="M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3zm-3 11H8v-5h8zm3-7a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm-1-9H6v4h12z"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M3 17.3V21h3.8L17.8 9.9l-3.7-3.7zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z"/></svg>',
    money: '<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.3-.6-3-1.2-3-2.1 0-1.1 1-1.9 2.7-1.9 1.8 0 2.4.8 2.5 2.1h2.2a4 4 0 0 0-3.2-3.8V3h-3v2.2C7.6 5.6 6.3 6.8 6.3 8.8c0 2.4 2 3.6 4.9 4.3 2.6.6 3.1 1.5 3.1 2.5 0 .7-.5 1.9-2.7 1.9-2.1 0-2.9-.9-3-2.1H6.3c.1 2.2 1.8 3.5 3.7 3.9V21h3v-2.2c1.9-.4 3.5-1.5 3.5-3.6 0-2.8-2.4-3.8-4.7-4.3z"/></svg>',
    convert: '<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6 6 6 0 0 1-.7 2.8l1.5 1.5A8 8 0 0 0 12 4zm0 14a6 6 0 0 1-6-6 6 6 0 0 1 .7-2.8L5.2 7.7A8 8 0 0 0 12 20v3l4-4-4-4z"/></svg>',
    wa: '<svg viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.2c-.2.2-.3.2-.6.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.3zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zM12 0a12 12 0 0 0-10.3 18l-1.7 6 6.2-1.6A12 12 0 1 0 12 0z"/></svg>'
  };

  function head(title, sub, actions) {
    return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' +
      (actions ? '<div class="head-actions">' + actions + '</div>' : '') + '</div>';
  }

  // ---------- Tableau de bord ----------
  function renderDashboard() {
    const view = $('#view');
    const invoices = state.docs.filter((d) => d.type === 'facture' && d.status !== 'annulee');
    const quotes = state.docs.filter((d) => d.type === 'devis');
    const month = today().slice(0, 7);

    let cashedMonth = 0, toCash = 0, late = 0, lateCount = 0;
    invoices.forEach((d) => {
      const t = totals(d);
      (d.payments || []).forEach((p) => { if ((p.date || '').slice(0, 7) === month) cashedMonth += num(p.amount); });
      if (d.status !== 'brouillon') toCash += t.due;
      if (status(d).key === 'retard') { late += t.due; lateCount++; }
    });
    const pendingQuotes = quotes.filter((d) => status(d).key === 'envoye');
    const pendingQuotesSum = pendingQuotes.reduce((s, d) => s + totals(d).ttc, 0);

    // Encaissements des 6 derniers mois
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: toISO(d).slice(0, 7), label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''), value: 0 });
    }
    invoices.forEach((d) => (d.payments || []).forEach((p) => {
      const m = months.find((x) => x.key === (p.date || '').slice(0, 7));
      if (m) m.value += num(p.amount);
    }));
    const max = Math.max(1, ...months.map((m) => m.value));
    const short = (v) => v >= 1e6 ? (v / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' M' : v >= 1e3 ? Math.round(v / 1e3) + ' k' : String(Math.round(v));

    const recent = state.docs.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 6);
    const name = state.company.name ? 'Bonjour, ' + esc(state.company.name) : 'Bonjour';

    view.innerHTML =
      head(name, new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        '<a class="btn" href="#/nouveau/devis">' + ICON.plus + 'Devis</a><a class="btn btn-primary" href="#/nouveau/facture">' + ICON.plus + 'Facture</a>') +
      shopBanner() +
      (!state.company.name ? '<div class="card card-pad" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><div class="strong">Commencez par renseigner votre entreprise</div><div class="muted small">Nom, logo, RCCM, NCC : ils apparaîtront sur vos devis et factures.</div></div><a class="btn btn-gold" href="#/parametres">Configurer</a></div>' : '') +
      '<div class="grid kpis">' +
        '<div class="card kpi accent"><div class="label">Encaissé ce mois</div><div class="value">' + money(cashedMonth) + '</div><div class="hint">' + new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) + '</div></div>' +
        '<div class="card kpi"><div class="label">Reste à encaisser</div><div class="value">' + money(toCash) + '</div><div class="hint">Factures envoyées non soldées</div></div>' +
        '<div class="card kpi"><div class="label">En retard</div><div class="value" style="color:var(--danger)">' + money(late) + '</div><div class="hint">' + lateCount + ' facture' + (lateCount > 1 ? 's' : '') + ' échue' + (lateCount > 1 ? 's' : '') + '</div></div>' +
        '<div class="card kpi"><div class="label">Devis en attente</div><div class="value">' + money(pendingQuotesSum) + '</div><div class="hint">' + pendingQuotes.length + ' devis envoyé' + (pendingQuotes.length > 1 ? 's' : '') + '</div></div>' +
      '</div>' +
      '<div class="grid two-cols">' +
        '<div class="card card-pad"><h2>Encaissements des 6 derniers mois</h2><div class="chart">' +
          months.map((m, i) => '<div class="bar-col"><span class="bar-val">' + (m.value ? short(m.value) : '') + '</span><div class="bar' + (i === 5 ? ' current' : '') + '" style="height:' + Math.max(2, (m.value / max) * 100) + '%" title="' + money(m.value) + '"></div><span class="bar-lbl">' + m.label + '</span></div>').join('') +
        '</div></div>' +
        '<div class="card"><div class="card-pad" style="padding-bottom:6px"><h2 style="margin:0">Activité récente</h2></div>' +
          (recent.length ? recent.map((d) => '<a class="row-card" href="#/doc/' + d.id + '"><div><div class="strong">' + esc(d.number) + '</div><div class="muted small">' + esc(clientName(d.clientId)) + '</div></div><div class="r"><div class="strong">' + money(totals(d).ttc) + '</div>' + badge(d) + '</div></a>').join('')
            : '<div class="empty"><div class="big">Aucun document</div>Créez votre premier devis ou chargez des exemples pour tester.<br><button class="btn" data-act="demo">Charger des exemples</button></div>') +
        '</div>' +
      '</div>';

    const demoBtn = $('[data-act="demo"]', view);
    if (demoBtn) demoBtn.onclick = loadDemo;
  }

  // ---------- Listes devis / factures ----------
  const listFilter = { devis: 'tous', facture: 'tous', q: '' };

  function renderList(type) {
    const view = $('#view');
    const filters = type === 'devis'
      ? [['tous', 'Tous'], ['brouillon', 'Brouillons'], ['envoye', 'Envoyés'], ['accepte', 'Acceptés'], ['refuse', 'Refusés'], ['expire', 'Expirés']]
      : [['tous', 'Toutes'], ['brouillon', 'Brouillons'], ['envoyee', 'Envoyées'], ['partielle', 'Partielles'], ['retard', 'En retard'], ['payee', 'Payées']];
    const title = type === 'devis' ? 'Devis' : 'Factures';
    const all = state.docs.filter((d) => d.type === type);
    const sum = all.filter((d) => d.status !== 'annulee').reduce((s, d) => s + totals(d).ttc, 0);

    view.innerHTML =
      head(title, all.length + ' document' + (all.length > 1 ? 's' : '') + ' · ' + money(sum),
        '<a class="btn btn-primary" href="#/nouveau/' + type + '">' + ICON.plus + (type === 'devis' ? 'Nouveau devis' : 'Nouvelle facture') + '</a>') +
      '<div class="toolbar"><input type="search" id="q" placeholder="Rechercher un numéro, un client, un objet…" value="' + esc(listFilter.q) + '"></div>' +
      '<div class="chips" style="margin-bottom:14px">' + filters.map(([k, l]) => '<button class="chip' + (listFilter[type] === k ? ' active' : '') + '" data-f="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<div class="card" id="list"></div>';

    function draw() {
      const q = listFilter.q.trim().toLowerCase();
      const f = listFilter[type];
      const rows = all
        .filter((d) => f === 'tous' || status(d).key === f || (f === 'accepte' && status(d).key === 'accepte'))
        .filter((d) => !q || [d.number, clientName(d.clientId), d.subject].join(' ').toLowerCase().includes(q))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
      const box = $('#list', view);
      if (!rows.length) {
        box.innerHTML = '<div class="empty"><div class="big">' + (all.length ? 'Aucun résultat' : 'Aucun ' + (type === 'devis' ? 'devis' : 'facture') + ' pour le moment') + '</div>' +
          (all.length ? 'Essayez un autre filtre.' : '<a class="btn btn-primary" href="#/nouveau/' + type + '">' + ICON.plus + 'Créer</a>') + '</div>';
        return;
      }
      box.innerHTML =
        '<table class="table table-desktop"><thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>' + (type === 'devis' ? 'Validité' : 'Échéance') + '</th><th class="num">Montant TTC</th>' + (type === 'facture' ? '<th class="num">Reste dû</th>' : '') + '<th>Statut</th></tr></thead><tbody>' +
        rows.map((d) => {
          const t = totals(d);
          return '<tr class="clickable" data-id="' + d.id + '"><td class="strong">' + esc(d.number) + (d.subject ? '<div class="muted small">' + esc(d.subject) + '</div>' : '') + '</td><td>' + esc(clientName(d.clientId)) + '</td><td>' + fmtDate(d.date) + '</td><td>' + fmtDate(d.due) + '</td><td class="num strong">' + money(t.ttc) + '</td>' +
            (type === 'facture' ? '<td class="num">' + (t.due ? money(t.due) : '—') + '</td>' : '') + '<td>' + badge(d) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<div class="list-mobile">' + rows.map((d) => '<a class="row-card" href="#/doc/' + d.id + '"><div><div class="strong">' + esc(d.number) + '</div><div class="muted small">' + esc(clientName(d.clientId)) + ' · ' + fmtDate(d.date) + '</div></div><div class="r"><div class="strong">' + money(totals(d).ttc) + '</div>' + badge(d) + '</div></a>').join('') + '</div>';
      $$('tr[data-id]', box).forEach((tr) => tr.onclick = () => go('#/doc/' + tr.dataset.id));
    }

    $('#q', view).oninput = (e) => { listFilter.q = e.target.value; draw(); };
    $$('.chip', view).forEach((c) => c.onclick = () => {
      listFilter[type] = c.dataset.f;
      $$('.chip', view).forEach((x) => x.classList.toggle('active', x === c));
      draw();
    });
    draw();
  }

  // ---------- Éditeur ----------
  function renderEditor(id, newType) {
    const existing = id ? docById(id) : null;
    if (id && !existing) return go('#/');
    const c = state.company;
    const type = existing ? existing.type : newType;
    const params = new URLSearchParams((location.hash.split('?')[1]) || '');
    const doc = existing ? JSON.parse(JSON.stringify(existing)) : {
      type,
      clientId: params.get('client') || '',
      date: today(),
      due: addDays(today(), type === 'devis' ? c.validityDays : c.paymentDays),
      subject: '',
      items: [{ desc: '', qty: 1, price: 0 }],
      discount: 0,
      tva: c.tva,
      notes: type === 'devis' ? c.quoteNotes : c.invoiceNotes,
      status: 'brouillon',
      payments: []
    };

    const view = $('#view');
    view.innerHTML =
      head(existing ? 'Modifier ' + (type === 'devis' ? 'le devis' : 'la facture') : (type === 'devis' ? 'Nouveau devis' : 'Nouvelle facture'),
        existing ? esc(existing.number) : 'Le numéro sera attribué à l\'enregistrement',
        '<a class="btn" href="' + (existing ? '#/doc/' + existing.id : (type === 'devis' ? '#/devis' : '#/factures')) + '">Annuler</a>') +
      '<form id="ed" class="editor" novalidate>' +
        '<div class="grid">' +
          '<div class="card card-pad"><h2>Client et dates</h2><div class="form-grid">' +
            '<div class="field full"><label for="f-client">Client</label><div class="field-row"><select id="f-client" required></select><button type="button" class="btn" id="add-client" style="flex:0">' + ICON.plus + 'Nouveau</button></div></div>' +
            '<div class="field"><label for="f-date">Date</label><input type="date" id="f-date" value="' + esc(doc.date) + '"></div>' +
            '<div class="field"><label for="f-due">' + (type === 'devis' ? 'Valable jusqu\'au' : 'Échéance de paiement') + '</label><input type="date" id="f-due" value="' + esc(doc.due) + '"></div>' +
            '<div class="field full"><label for="f-subject">Objet</label><input type="text" id="f-subject" placeholder="Ex. : Couverture vidéo de l\'inauguration" value="' + esc(doc.subject) + '"></div>' +
          '</div></div>' +
          '<div class="card card-pad"><h2>Prestations</h2>' +
            '<table class="lines"><thead><tr><th>Désignation</th><th class="c-qty">Qté</th><th class="c-price">Prix unitaire</th><th class="c-total" style="padding-top:0">Total</th><th class="c-del"></th></tr></thead><tbody id="lines"></tbody></table>' +
            '<button type="button" class="btn" id="add-line" style="margin-top:10px">' + ICON.plus + 'Ajouter une ligne</button>' +
          '</div>' +
          '<div class="card card-pad"><h2>Conditions et notes</h2><textarea id="f-notes" rows="3">' + esc(doc.notes) + '</textarea></div>' +
        '</div>' +
        '<div class="card card-pad totals-box"><h2>Récapitulatif</h2>' +
          '<div class="tot-row"><span>Total HT</span><span id="t-ht" class="strong"></span></div>' +
          '<div class="tot-row"><span>Remise (%)</span><input type="number" id="f-discount" min="0" max="100" step="0.5" value="' + esc(doc.discount) + '"></div>' +
          '<div class="tot-row muted small"><span>Montant remise</span><span id="t-disc"></span></div>' +
          '<div class="tot-row"><span>TVA (%)</span><input type="number" id="f-tva" min="0" max="100" step="0.5" value="' + esc(doc.tva) + '"></div>' +
          '<div class="tot-row muted small"><span>Montant TVA</span><span id="t-tva"></span></div>' +
          '<div class="tot-row grand"><span>Total TTC</span><span id="t-ttc"></span></div>' +
          '<p class="muted small" id="t-words" style="margin:8px 0 16px"></p>' +
          '<div class="action-list">' +
            '<button type="submit" class="btn btn-primary" data-save="send">' + ICON.check + 'Enregistrer ' + (existing && existing.status !== 'brouillon' ? '' : 'et finaliser') + '</button>' +
            (!existing || existing.status === 'brouillon' ? '<button type="submit" class="btn" data-save="draft">Enregistrer en brouillon</button>' : '') +
          '</div>' +
        '</div>' +
      '</form>';

    const form = $('#ed', view);
    const sel = $('#f-client', form);
    function fillClients(selected) {
      sel.innerHTML = '<option value="">— Choisir un client —</option>' +
        state.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((cl) => '<option value="' + cl.id + '"' + (cl.id === selected ? ' selected' : '') + '>' + esc(cl.name) + '</option>').join('');
    }
    fillClients(doc.clientId);
    $('#add-client', form).onclick = () => clientModal(null, (cl) => { fillClients(cl.id); });

    const tbody = $('#lines', form);
    function drawLines() {
      tbody.innerHTML = doc.items.map((it, i) =>
        '<tr data-i="' + i + '">' +
          '<td class="c-desc"><textarea data-k="desc" rows="1" placeholder="Description de la prestation">' + esc(it.desc) + '</textarea></td>' +
          '<td class="c-qty"><input type="number" data-k="qty" min="0" step="any" value="' + esc(it.qty) + '" aria-label="Quantité"></td>' +
          '<td class="c-price"><input type="number" data-k="price" min="0" step="any" value="' + esc(it.price) + '" aria-label="Prix unitaire"></td>' +
          '<td class="c-total">' + money(num(it.qty) * num(it.price)) + '</td>' +
          '<td class="c-del"><button type="button" class="btn btn-ghost icon-btn" data-del="' + i + '" aria-label="Supprimer la ligne">' + ICON.trash + '</button></td>' +
        '</tr>').join('');
    }
    function recalc() {
      doc.discount = num($('#f-discount', form).value);
      doc.tva = num($('#f-tva', form).value);
      const t = totals(doc);
      $('#t-ht', form).textContent = money(t.ht);
      $('#t-disc', form).textContent = '− ' + money(t.discount);
      $('#t-tva', form).textContent = money(t.tva);
      $('#t-ttc', form).textContent = money(t.ttc);
      $('#t-words', form).textContent = t.ttc ? capitalize(inWords(t.ttc)) + ' francs CFA' : '';
      $$('tr[data-i]', tbody).forEach((tr) => {
        const it = doc.items[+tr.dataset.i];
        $('.c-total', tr).textContent = money(num(it.qty) * num(it.price));
      });
    }
    tbody.addEventListener('input', (e) => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr || !e.target.dataset.k) return;
      doc.items[+tr.dataset.i][e.target.dataset.k] = e.target.dataset.k === 'desc' ? e.target.value : e.target.value;
      recalc();
    });
    tbody.addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (!b) return;
      doc.items.splice(+b.dataset.del, 1);
      if (!doc.items.length) doc.items.push({ desc: '', qty: 1, price: 0 });
      drawLines(); recalc();
    });
    $('#add-line', form).onclick = () => {
      doc.items.push({ desc: '', qty: 1, price: 0 });
      drawLines(); recalc();
      const last = $$('textarea[data-k="desc"]', tbody).pop();
      if (last) last.focus();
    };
    $('#f-discount', form).oninput = recalc;
    $('#f-tva', form).oninput = recalc;
    $('#f-date', form).onchange = (e) => {
      if (!existing && e.target.value) $('#f-due', form).value = addDays(e.target.value, type === 'devis' ? c.validityDays : c.paymentDays);
    };

    let mode = 'send';
    $$('[data-save]', form).forEach((b) => b.onclick = () => { mode = b.dataset.save; });
    form.onsubmit = (e) => {
      e.preventDefault();
      doc.clientId = sel.value;
      doc.date = $('#f-date', form).value || today();
      doc.due = $('#f-due', form).value;
      doc.subject = $('#f-subject', form).value.trim();
      doc.notes = $('#f-notes', form).value;
      doc.items = doc.items
        .map((it) => ({ desc: String(it.desc).trim(), qty: num(it.qty), price: num(it.price) }))
        .filter((it) => it.desc || it.price);
      if (!doc.clientId) { toast('Choisissez un client'); sel.focus(); return; }
      if (!doc.items.length) { toast('Ajoutez au moins une prestation'); doc.items = [{ desc: '', qty: 1, price: 0 }]; drawLines(); return; }

      if (existing) {
        if (mode === 'send' && existing.status === 'brouillon') doc.status = type === 'devis' ? 'envoye' : 'envoyee';
        doc.updatedAt = Date.now();
        Object.assign(existing, doc);
        save();
        toast('Modifications enregistrées');
        go('#/doc/' + existing.id);
      } else {
        doc.id = uid();
        doc.number = nextNumber(type, doc.date);
        doc.status = mode === 'draft' ? 'brouillon' : (type === 'devis' ? 'envoye' : 'envoyee');
        doc.createdAt = doc.updatedAt = Date.now();
        state.docs.push(doc);
        save();
        toast(TYPE_LABEL[type] + ' ' + doc.number + ' créé' + (type === 'facture' ? 'e' : ''));
        go('#/doc/' + doc.id);
      }
    };

    drawLines(); recalc();
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- Rendu papier (aperçu + impression) ----------
  function paperHTML(doc) {
    const c = state.company;
    const cl = clientById(doc.clientId) || {};
    const t = totals(doc);
    const isQuote = doc.type === 'devis';
    const st = status(doc);
    const companyLines = [c.activity, c.address, c.city, c.phone ? 'Tél. : ' + c.phone : '', c.email].filter(Boolean).join('\n');
    const legal = [c.rccm ? 'RCCM : ' + c.rccm : '', c.ncc ? 'NCC : ' + c.ncc : '', c.bank ? 'Banque : ' + c.bank : ''].filter(Boolean).join(' · ');
    const clientLines = [cl.contact, cl.address, cl.phone ? 'Tél. : ' + cl.phone : '', cl.email, cl.ncc ? 'NCC : ' + cl.ncc : ''].filter(Boolean).join('\n');

    return '<div class="paper">' +
      '<div class="p-head"><div>' +
        (c.logo ? '<img class="p-logo" src="' + esc(c.logo) + '" alt="">' : '') +
        '<div class="p-company">' + esc(c.name || 'Votre entreprise') + '</div>' +
        '<div class="p-company-info">' + esc(companyLines) + '</div>' +
      '</div><div class="p-title"><h2>' + (isQuote ? 'DEVIS' : 'FACTURE') + '</h2>' +
        '<div class="p-meta">N° <b>' + esc(doc.number) + '</b><br>Date : <b>' + fmtDate(doc.date) + '</b><br>' + (isQuote ? 'Valable jusqu\'au' : 'Échéance') + ' : <b>' + fmtDate(doc.due) + '</b></div>' +
        (st.key === 'payee' ? '<div class="p-stamp">PAYÉE</div>' : st.key === 'annulee' ? '<div class="p-stamp" style="color:#b42318;border-color:#b42318">ANNULÉE</div>' : '') +
      '</div></div>' +
      '<div class="p-parties"><div></div><div class="p-box"><div class="lbl">' + (isQuote ? 'Destinataire' : 'Facturé à') + '</div><div class="name">' + esc(cl.name || '—') + '</div><div style="white-space:pre-line;font-size:12.5px;color:#444">' + esc(clientLines) + '</div></div></div>' +
      (doc.subject ? '<div class="p-object"><b>Objet :</b> ' + esc(doc.subject) + '</div>' : '') +
      '<table><thead><tr><th style="width:50%">Désignation</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Montant</th></tr></thead><tbody>' +
        doc.items.map((it) => '<tr><td>' + esc(it.desc) + '</td><td class="num">' + nf.format(num(it.qty)).replace(/ | /g, ' ') + '</td><td class="num">' + money(it.price) + '</td><td class="num">' + money(num(it.qty) * num(it.price)) + '</td></tr>').join('') +
      '</tbody></table>' +
      '<div class="p-totals"><table>' +
        '<tr><td>Total HT</td><td class="num">' + money(t.ht) + '</td></tr>' +
        (t.discount ? '<tr><td>Remise (' + num(doc.discount) + ' %)</td><td class="num">− ' + money(t.discount) + '</td></tr><tr><td>Net HT</td><td class="num">' + money(t.base) + '</td></tr>' : '') +
        '<tr><td>TVA (' + num(doc.tva) + ' %)</td><td class="num">' + money(t.tva) + '</td></tr>' +
        '<tr class="grand"><td>Total TTC</td><td class="num">' + money(t.ttc) + '</td></tr>' +
        (!isQuote && t.paid ? '<tr><td>Déjà réglé</td><td class="num">− ' + money(t.paid) + '</td></tr><tr><td><b>Reste à payer</b></td><td class="num"><b>' + money(t.due) + '</b></td></tr>' : '') +
      '</table></div>' +
      '<div class="p-words">Arrêté' + (isQuote ? ' le présent devis' : 'e la présente facture') + ' à la somme de : <b>' + esc(capitalize(inWords(t.ttc))) + ' francs CFA</b>.</div>' +
      (doc.notes ? '<div class="p-notes">' + esc(doc.notes) + '</div>' : '') +
      '<div class="p-sign"><div>' + (isQuote ? 'Bon pour accord — date, signature et cachet du client' : 'Signature et cachet') + '</div></div>' +
      '<div class="p-foot">' + esc([c.name, legal, c.footer].filter(Boolean).join('\n')) + '</div>' +
    '</div>';
  }

  function printDoc(doc) {
    $('#print-area').innerHTML = paperHTML(doc);
    const old = document.title;
    document.title = doc.number + ' - ' + clientName(doc.clientId);
    setTimeout(() => { window.print(); document.title = old; }, 50);
  }

  // ---------- Vue d'un document ----------
  function renderDoc(id) {
    const doc = docById(id);
    if (!doc) return go('#/');
    const view = $('#view');
    const t = totals(doc);
    const st = status(doc);
    const isQuote = doc.type === 'devis';
    const cl = clientById(doc.clientId);
    const linked = doc.invoiceId ? docById(doc.invoiceId) : doc.quoteId ? docById(doc.quoteId) : null;

    const actions = [];
    actions.push('<button class="btn btn-primary" data-a="print">' + ICON.print + 'Imprimer / PDF</button>');
    if (cl && cl.phone) actions.push('<button class="btn" data-a="wa">' + ICON.wa + 'Envoyer par WhatsApp</button>');
    if (doc.status === 'brouillon') actions.push('<button class="btn" data-a="finalize">' + ICON.send + 'Marquer comme envoyé' + (isQuote ? '' : 'e') + '</button>');
    if (isQuote && !['accepte', 'refuse', 'brouillon'].includes(doc.status)) {
      actions.push('<button class="btn" data-a="accept">' + ICON.check + 'Accepté par le client</button>');
      actions.push('<button class="btn" data-a="refuse">' + ICON.close + 'Refusé</button>');
    }
    if (isQuote && !doc.invoiceId && doc.status !== 'refuse') actions.push('<button class="btn btn-gold" data-a="convert">' + ICON.convert + 'Transformer en facture</button>');
    if (!isQuote && doc.status !== 'annulee' && t.due > 0) actions.push('<button class="btn btn-gold" data-a="pay">' + ICON.money + 'Enregistrer un paiement</button>');
    actions.push('<a class="btn" href="#/doc/' + doc.id + '/modifier">' + ICON.edit + 'Modifier</a>');
    actions.push('<button class="btn" data-a="dup">' + ICON.copy + 'Dupliquer</button>');
    if (!isQuote && doc.status !== 'annulee' && !t.paid) actions.push('<button class="btn btn-danger" data-a="cancel">' + ICON.close + 'Annuler la facture</button>');
    actions.push('<button class="btn btn-danger" data-a="delete">' + ICON.trash + 'Supprimer</button>');

    const pct = t.ttc ? Math.min(100, Math.round(t.paid / t.ttc * 100)) : 0;

    view.innerHTML =
      head(TYPE_LABEL[doc.type] + ' ' + doc.number, '<span class="badge ' + st.cls + '">' + st.label + '</span> &nbsp;' + esc(clientName(doc.clientId)) + ' · ' + money(t.ttc),
        '<a class="btn" href="' + (isQuote ? '#/devis' : '#/factures') + '">← Retour</a>') +
      '<div class="doc-layout">' +
        '<div class="paper-wrap">' + paperHTML(doc) + '</div>' +
        '<div class="doc-side">' +
          '<div class="card card-pad"><h2>Actions</h2><div class="action-list">' + actions.join('') + '</div></div>' +
          (!isQuote ? '<div class="card card-pad"><h2>Paiements</h2>' +
            '<div class="tot-row small"><span>Payé</span><span class="strong">' + money(t.paid) + '</span></div>' +
            '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
            '<div class="tot-row small"><span>Reste dû</span><span class="strong">' + money(t.due) + '</span></div>' +
            ((doc.payments || []).length ? '<div style="margin-top:8px">' + doc.payments.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map((p) =>
              '<div class="pay-item"><div><div class="strong">' + money(p.amount) + '</div><div class="muted small">' + fmtDate(p.date) + ' · ' + esc(p.method) + (p.ref ? ' · ' + esc(p.ref) : '') + '</div></div><button class="btn btn-ghost icon-btn" data-delpay="' + p.id + '" aria-label="Supprimer ce paiement">' + ICON.trash + '</button></div>').join('') + '</div>' : '<p class="muted small" style="margin:8px 0 0">Aucun paiement enregistré.</p>') +
          '</div>' : '') +
          (linked ? '<div class="card card-pad"><h2>Document lié</h2><a class="row-card" style="padding:0;border:0" href="#/doc/' + linked.id + '"><div class="strong">' + TYPE_LABEL[linked.type] + ' ' + esc(linked.number) + '</div>' + badge(linked) + '</a></div>' : '') +
        '</div>' +
      '</div>';

    const act = {
      print: () => printDoc(doc),
      wa: () => {
        let phone = (cl.phone || '').replace(/\D/g, '');
        if (phone.length === 10) phone = '225' + phone;
        const txt = 'Bonjour ' + cl.name + ',\n\nVeuillez trouver ' + (isQuote ? 'notre devis' : 'notre facture') + ' N° ' + doc.number +
          (doc.subject ? ' (' + doc.subject + ')' : '') + ' d\'un montant de ' + money(t.ttc) + '.' +
          (!isQuote && t.due ? '\nReste à payer : ' + money(t.due) + ', échéance le ' + fmtDate(doc.due) + '.' : '') +
          '\n\nCordialement,\n' + (state.company.name || '');
        window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
      },
      finalize: () => { doc.status = isQuote ? 'envoye' : 'envoyee'; touch(doc); },
      accept: () => { doc.status = 'accepte'; touch(doc, 'Devis accepté'); },
      refuse: () => { doc.status = 'refuse'; touch(doc, 'Devis marqué comme refusé'); },
      convert: () => {
        const inv = {
          id: uid(), type: 'facture', clientId: doc.clientId, date: today(),
          due: addDays(today(), state.company.paymentDays), subject: doc.subject,
          items: JSON.parse(JSON.stringify(doc.items)), discount: doc.discount, tva: doc.tva,
          notes: state.company.invoiceNotes, status: 'envoyee', payments: [], quoteId: doc.id,
          createdAt: Date.now(), updatedAt: Date.now()
        };
        inv.number = nextNumber('facture', inv.date);
        state.docs.push(inv);
        doc.status = 'accepte';
        doc.invoiceId = inv.id;
        doc.updatedAt = Date.now();
        save();
        toast('Facture ' + inv.number + ' créée à partir du devis');
        go('#/doc/' + inv.id);
      },
      pay: () => paymentModal(doc),
      dup: () => {
        const copy = JSON.parse(JSON.stringify(doc));
        Object.assign(copy, { id: uid(), date: today(), due: addDays(today(), isQuote ? state.company.validityDays : state.company.paymentDays), status: 'brouillon', payments: [], createdAt: Date.now(), updatedAt: Date.now() });
        delete copy.invoiceId; delete copy.quoteId;
        copy.number = nextNumber(copy.type, copy.date);
        state.docs.push(copy);
        save();
        toast('Copie créée : ' + copy.number);
        go('#/doc/' + copy.id + '/modifier');
      },
      cancel: () => confirmModal('Annuler la facture ' + doc.number + ' ?', 'Elle restera dans l\'historique avec le statut « Annulée » et ne comptera plus dans vos montants à encaisser.', 'Annuler la facture', () => { doc.status = 'annulee'; touch(doc, 'Facture annulée'); }),
      delete: () => confirmModal('Supprimer ' + (isQuote ? 'le devis ' : 'la facture ') + doc.number + ' ?', 'Cette action est définitive' + (!isQuote ? ' et supprime aussi les paiements enregistrés' : '') + '.', 'Supprimer', () => {
        state.docs = state.docs.filter((d) => d.id !== doc.id);
        state.docs.forEach((d) => { if (d.invoiceId === doc.id) delete d.invoiceId; if (d.quoteId === doc.id) delete d.quoteId; });
        save();
        toast('Document supprimé');
        go(isQuote ? '#/devis' : '#/factures');
      })
    };
    $$('[data-a]', view).forEach((b) => b.onclick = () => act[b.dataset.a]());
    $$('[data-delpay]', view).forEach((b) => b.onclick = () => confirmModal('Supprimer ce paiement ?', 'Le montant sera de nouveau compté comme dû.', 'Supprimer', () => {
      doc.payments = doc.payments.filter((p) => p.id !== b.dataset.delpay);
      touch(doc, 'Paiement supprimé');
    }));
  }

  function touch(doc, msg) {
    doc.updatedAt = Date.now();
    save();
    if (msg) toast(msg);
    router();
  }

  // ---------- Modales ----------
  const modal = $('#modal');
  function openModal(html) {
    $('#modal-body').innerHTML = html;
    if (!modal.open) modal.showModal();
    const first = $('input, select, textarea', modal);
    if (first) first.focus();
  }
  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });

  function confirmModal(title, text, okLabel, onOk) {
    openModal('<div class="modal-head"><h3>' + esc(title) + '</h3></div><div class="modal-content"><p class="muted" style="margin:0">' + esc(text) + '</p></div>' +
      '<div class="modal-foot"><button class="btn" data-close>Retour</button><button class="btn btn-primary" id="m-ok" style="background:var(--danger);border-color:var(--danger)">' + esc(okLabel) + '</button></div>');
    $('#m-ok').onclick = () => { closeModal(); onOk(); };
  }

  function paymentModal(doc) {
    const t = totals(doc);
    openModal('<form id="pf"><div class="modal-head"><h3>Paiement — ' + esc(doc.number) + '</h3><button type="button" class="btn btn-ghost icon-btn" data-close aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="modal-content"><div class="form-grid">' +
        '<div class="field"><label for="p-amount">Montant (FCFA)</label><input type="number" id="p-amount" min="1" step="any" value="' + t.due + '" required></div>' +
        '<div class="field"><label for="p-date">Date</label><input type="date" id="p-date" value="' + today() + '"></div>' +
        '<div class="field"><label for="p-method">Moyen de paiement</label><select id="p-method">' + PAY_METHODS.map((m) => '<option>' + m + '</option>').join('') + '</select></div>' +
        '<div class="field"><label for="p-ref">Référence (facultatif)</label><input type="text" id="p-ref" placeholder="N° de transaction…"></div>' +
      '</div><p class="muted small" style="margin:12px 0 0">Reste dû avant ce paiement : <b>' + money(t.due) + '</b></p></div>' +
      '<div class="modal-foot"><button type="button" class="btn" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div></form>');
    $('#pf').onsubmit = (e) => {
      e.preventDefault();
      const amount = num($('#p-amount').value);
      if (amount <= 0) { toast('Montant invalide'); return; }
      doc.payments = doc.payments || [];
      doc.payments.push({ id: uid(), amount, date: $('#p-date').value || today(), method: $('#p-method').value, ref: $('#p-ref').value.trim() });
      if (doc.status === 'brouillon') doc.status = 'envoyee';
      closeModal();
      touch(doc, totals(doc).due === 0 ? 'Facture soldée' : 'Paiement enregistré');
    };
  }

  function clientModal(client, onSaved) {
    const c = client || {};
    openModal('<form id="cf"><div class="modal-head"><h3>' + (client ? 'Modifier le client' : 'Nouveau client') + '</h3><button type="button" class="btn btn-ghost icon-btn" data-close aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="modal-content"><div class="form-grid">' +
        '<div class="field full"><label for="c-name">Nom ou raison sociale *</label><input type="text" id="c-name" value="' + esc(c.name) + '" required></div>' +
        '<div class="field"><label for="c-contact">Personne à contacter</label><input type="text" id="c-contact" value="' + esc(c.contact) + '"></div>' +
        '<div class="field"><label for="c-phone">Téléphone</label><input type="tel" id="c-phone" placeholder="07 00 00 00 00" value="' + esc(c.phone) + '"></div>' +
        '<div class="field"><label for="c-email">E-mail</label><input type="email" id="c-email" value="' + esc(c.email) + '"></div>' +
        '<div class="field"><label for="c-ncc">NCC (compte contribuable)</label><input type="text" id="c-ncc" value="' + esc(c.ncc) + '"></div>' +
        '<div class="field full"><label for="c-address">Adresse</label><input type="text" id="c-address" placeholder="Quartier, ville" value="' + esc(c.address) + '"></div>' +
      '</div></div>' +
      '<div class="modal-foot"><button type="button" class="btn" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div></form>');
    $('#cf').onsubmit = (e) => {
      e.preventDefault();
      const name = $('#c-name').value.trim();
      if (!name) { toast('Le nom est obligatoire'); return; }
      const data = { name, contact: $('#c-contact').value.trim(), phone: $('#c-phone').value.trim(), email: $('#c-email').value.trim(), ncc: $('#c-ncc').value.trim(), address: $('#c-address').value.trim() };
      let saved;
      if (client) { Object.assign(client, data); saved = client; }
      else { saved = Object.assign({ id: uid(), createdAt: Date.now() }, data); state.clients.push(saved); }
      save();
      closeModal();
      toast(client ? 'Client modifié' : 'Client ajouté');
      if (onSaved) onSaved(saved);
    };
  }

  // ---------- Clients ----------
  function clientStats(id) {
    const docs = state.docs.filter((d) => d.clientId === id);
    const inv = docs.filter((d) => d.type === 'facture' && d.status !== 'annulee');
    return {
      docs,
      billed: inv.reduce((s, d) => s + totals(d).ttc, 0),
      due: inv.filter((d) => d.status !== 'brouillon').reduce((s, d) => s + totals(d).due, 0)
    };
  }

  function renderClients() {
    const view = $('#view');
    view.innerHTML = head('Clients', state.clients.length + ' client' + (state.clients.length > 1 ? 's' : ''), '<button class="btn btn-primary" id="new-client">' + ICON.plus + 'Nouveau client</button>') +
      '<div class="toolbar"><input type="search" id="cq" placeholder="Rechercher un client…"></div><div class="card" id="clist"></div>';
    $('#new-client', view).onclick = () => clientModal(null, () => router());
    function draw() {
      const q = $('#cq', view).value.trim().toLowerCase();
      const rows = state.clients.filter((c) => !q || [c.name, c.contact, c.phone, c.email].join(' ').toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
      const box = $('#clist', view);
      if (!rows.length) {
        box.innerHTML = '<div class="empty"><div class="big">' + (state.clients.length ? 'Aucun résultat' : 'Aucun client') + '</div>' + (state.clients.length ? '' : 'Ajoutez vos clients pour leur adresser devis et factures.') + '</div>';
        return;
      }
      box.innerHTML = '<table class="table table-desktop"><thead><tr><th>Client</th><th>Contact</th><th class="num">Facturé</th><th class="num">Reste dû</th></tr></thead><tbody>' +
        rows.map((c) => { const s = clientStats(c.id); return '<tr class="clickable" data-id="' + c.id + '"><td class="strong">' + esc(c.name) + (c.address ? '<div class="muted small">' + esc(c.address) + '</div>' : '') + '</td><td>' + esc(c.contact || '') + '<div class="muted small">' + esc([c.phone, c.email].filter(Boolean).join(' · ')) + '</div></td><td class="num">' + money(s.billed) + '</td><td class="num' + (s.due ? ' strong' : ' muted') + '">' + money(s.due) + '</td></tr>'; }).join('') +
        '</tbody></table><div class="list-mobile">' +
        rows.map((c) => { const s = clientStats(c.id); return '<a class="row-card" href="#/client/' + c.id + '"><div><div class="strong">' + esc(c.name) + '</div><div class="muted small">' + esc(c.phone || c.email || '') + '</div></div><div class="r"><div class="small muted">Reste dû</div><div class="strong">' + money(s.due) + '</div></div></a>'; }).join('') + '</div>';
      $$('tr[data-id]', box).forEach((tr) => tr.onclick = () => go('#/client/' + tr.dataset.id));
    }
    $('#cq', view).oninput = draw;
    draw();
  }

  function renderClient(id) {
    const c = clientById(id);
    if (!c) return go('#/clients');
    const s = clientStats(id);
    const view = $('#view');
    view.innerHTML = head(c.name, esc([c.contact, c.phone, c.email].filter(Boolean).join(' · ')),
      '<a class="btn" href="#/clients">← Retour</a><button class="btn" id="ed-c">' + ICON.edit + 'Modifier</button><a class="btn" href="#/nouveau/devis?client=' + c.id + '">' + ICON.plus + 'Devis</a><a class="btn btn-primary" href="#/nouveau/facture?client=' + c.id + '">' + ICON.plus + 'Facture</a>') +
      '<div class="grid kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">' +
        '<div class="card kpi"><div class="label">Total facturé</div><div class="value">' + money(s.billed) + '</div></div>' +
        '<div class="card kpi"><div class="label">Reste dû</div><div class="value">' + money(s.due) + '</div></div>' +
        '<div class="card kpi"><div class="label">Documents</div><div class="value">' + s.docs.length + '</div></div>' +
      '</div>' +
      '<div class="card">' + (s.docs.length ? s.docs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((d) => '<a class="row-card" href="#/doc/' + d.id + '"><div><div class="strong">' + TYPE_LABEL[d.type] + ' ' + esc(d.number) + '</div><div class="muted small">' + fmtDate(d.date) + (d.subject ? ' · ' + esc(d.subject) : '') + '</div></div><div class="r"><div class="strong">' + money(totals(d).ttc) + '</div>' + badge(d) + '</div></a>').join('') : '<div class="empty"><div class="big">Aucun document</div>Créez un devis ou une facture pour ce client.</div>') + '</div>' +
      (s.docs.length ? '' : '<div style="margin-top:16px"><button class="btn btn-danger" id="del-c">' + ICON.trash + 'Supprimer ce client</button></div>');
    $('#ed-c', view).onclick = () => clientModal(c, () => router());
    const del = $('#del-c', view);
    if (del) del.onclick = () => confirmModal('Supprimer ' + c.name + ' ?', 'Cette action est définitive.', 'Supprimer', () => {
      state.clients = state.clients.filter((x) => x.id !== id);
      save(); toast('Client supprimé'); go('#/clients');
    });
  }

  // ---------- Réglages ----------
  function renderSettings() {
    const c = state.company;
    const view = $('#view');
    const f = (id, label, val, extra) => '<div class="field' + (extra && extra.full ? ' full' : '') + '"><label for="s-' + id + '">' + label + '</label>' +
      (extra && extra.area ? '<textarea id="s-' + id + '" rows="2">' + esc(val) + '</textarea>' : '<input type="' + ((extra && extra.type) || 'text') + '" id="s-' + id + '" value="' + esc(val) + '"' + (extra && extra.ph ? ' placeholder="' + esc(extra.ph) + '"' : '') + '>') + '</div>';
    view.innerHTML = head('Réglages', 'Ces informations apparaissent sur vos devis et factures') +
      '<form id="sf" class="grid">' +
        '<div class="card card-pad"><h2>Votre entreprise</h2><div class="form-grid">' +
          '<div class="field full"><label>Logo</label><div class="logo-preview">' + (c.logo ? '<img src="' + esc(c.logo) + '" alt="Logo">' : '') +
            '<label class="btn" style="margin:0">Choisir une image<input type="file" id="s-logo" accept="image/*" hidden></label>' + (c.logo ? '<button type="button" class="btn btn-ghost" id="rm-logo">Retirer</button>' : '') + '</div></div>' +
          f('name', 'Nom de l\'entreprise', c.name, { ph: 'Ex. : DÉO-CI' }) +
          f('activity', 'Activité', c.activity, { ph: 'Ex. : Communication digitale & production vidéo' }) +
          f('address', 'Adresse', c.address, { ph: 'Quartier, rue' }) +
          f('city', 'Ville', c.city) +
          f('phone', 'Téléphone', c.phone, { type: 'tel' }) +
          f('email', 'E-mail', c.email, { type: 'email' }) +
          f('rccm', 'RCCM', c.rccm, { ph: 'CI-ABJ-…' }) +
          f('ncc', 'NCC (compte contribuable)', c.ncc) +
          f('bank', 'Coordonnées bancaires / Mobile Money', c.bank, { full: true, ph: 'Banque, RIB ou numéro Wave / Orange Money' }) +
          f('footer', 'Mention en pied de page', c.footer, { full: true, ph: 'Ex. : SARL au capital de 1 000 000 FCFA' }) +
        '</div></div>' +
        '<div class="card card-pad"><h2>Devis et factures</h2><div class="form-grid">' +
          f('tva', 'TVA par défaut (%)', c.tva, { type: 'number' }) +
          '<div class="field"></div>' +
          f('quotePrefix', 'Préfixe des devis', c.quotePrefix) +
          f('invoicePrefix', 'Préfixe des factures', c.invoicePrefix) +
          f('validityDays', 'Validité d\'un devis (jours)', c.validityDays, { type: 'number' }) +
          f('paymentDays', 'Délai de paiement (jours)', c.paymentDays, { type: 'number' }) +
          f('quoteNotes', 'Conditions par défaut des devis', c.quoteNotes, { full: true, area: true }) +
          f('invoiceNotes', 'Conditions par défaut des factures', c.invoiceNotes, { full: true, area: true }) +
        '</div><div style="margin-top:16px"><button class="btn btn-primary">' + ICON.check + 'Enregistrer les réglages</button></div></div>' +
        '<div class="card card-pad"><h2>Sauvegarde</h2><p class="muted small" style="margin-top:-6px">Vos données sont stockées dans ce navigateur. Exportez régulièrement une sauvegarde pour ne rien perdre (changement de téléphone, nettoyage du navigateur…).</p>' +
          '<div class="head-actions"><button type="button" class="btn" id="export">Exporter une sauvegarde</button><label class="btn" style="margin:0">Importer une sauvegarde<input type="file" id="import" accept="application/json,.json" hidden></label><button type="button" class="btn" id="demo">Charger des exemples</button><button type="button" class="btn btn-danger" id="reset">Tout effacer</button></div></div>' +
      '</form>';

    const form = $('#sf', view);
    form.onsubmit = (e) => {
      e.preventDefault();
      ['name', 'activity', 'address', 'city', 'phone', 'email', 'rccm', 'ncc', 'bank', 'footer', 'quotePrefix', 'invoicePrefix', 'quoteNotes', 'invoiceNotes'].forEach((k) => { c[k] = $('#s-' + k, form).value.trim(); });
      ['tva', 'validityDays', 'paymentDays'].forEach((k) => { c[k] = num($('#s-' + k, form).value); });
      if (save()) toast('Réglages enregistrés');
    };
    $('#s-logo', form).onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        // Réduit le logo pour ne pas saturer le stockage local
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 400 / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          c.logo = cv.toDataURL('image/png');
          if (save()) { toast('Logo enregistré'); router(); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    const rm = $('#rm-logo', form);
    if (rm) rm.onclick = () => { c.logo = ''; save(); router(); };

    $('#export', form).onclick = () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sika-sauvegarde-' + today() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#import', form).onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || !Array.isArray(data.docs) || !Array.isArray(data.clients)) throw new Error('format');
          confirmModal('Remplacer les données actuelles ?', 'La sauvegarde contient ' + data.clients.length + ' clients et ' + data.docs.length + ' documents. Les données actuelles de cet appareil seront remplacées.', 'Importer', () => {
            state = normalize(data);
            save(); toast('Sauvegarde importée'); go('#/');
          });
        } catch (err) { toast('Fichier de sauvegarde invalide'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    };
    $('#demo', form).onclick = loadDemo;
    $('#reset', form).onclick = () => confirmModal('Tout effacer ?', 'Clients, devis, factures et réglages de cet appareil seront supprimés. Pensez à exporter une sauvegarde avant.', 'Tout effacer', () => {
      state = defaultState(); save(); toast('Données effacées'); go('#/');
    });
  }

  // ---------- Données d'exemple ----------
  function loadDemo() {
    const d = (offset) => addDays(today(), offset);
    const mk = (name, contact, phone, address) => { const cl = { id: uid(), name, contact, phone, email: '', ncc: '', address, createdAt: Date.now() }; state.clients.push(cl); return cl; };
    const c1 = mk('Mairie de Bouaké', 'Service communication', '07 07 00 11 22', 'Bouaké, Commerce');
    const c2 = mk('Hôtel Les Palmiers', 'M. Koné', '05 05 33 44 55', 'Bouaké, Air France 2');
    const c3 = mk('Boutique Awa Mode', 'Awa Diabaté', '01 01 66 77 88', 'Abidjan, Cocody Angré');

    const add = (type, cl, date, dueOff, subject, items, extra) => {
      const doc = Object.assign({ id: uid(), type, clientId: cl.id, date, due: addDays(date, dueOff), subject, items, discount: 0, tva: 18,
        notes: type === 'devis' ? state.company.quoteNotes : state.company.invoiceNotes, status: type === 'devis' ? 'envoye' : 'envoyee', payments: [], createdAt: Date.now(), updatedAt: Date.now() }, extra || {});
      doc.number = nextNumber(type, date);
      state.docs.push(doc);
      return doc;
    };
    add('facture', c1, d(-120), 30, 'Couverture vidéo — cérémonie de la première pierre', [{ desc: 'Tournage (2 caméras, 1 journée)', qty: 1, price: 350000 }, { desc: 'Montage et étalonnage', qty: 1, price: 250000 }], { payments: [{ id: uid(), amount: 708000, date: d(-100), method: 'Virement bancaire', ref: '' }] });
    add('facture', c2, d(-75), 30, 'Gestion des réseaux sociaux — 1 mois', [{ desc: 'Community management (Facebook, Instagram)', qty: 1, price: 150000 }, { desc: 'Visuels publicitaires', qty: 8, price: 10000 }], { payments: [{ id: uid(), amount: 271400, date: d(-50), method: 'Wave', ref: '' }] });
    add('facture', c3, d(-45), 15, 'Shooting photo collection', [{ desc: 'Séance photo produits (demi-journée)', qty: 1, price: 120000 }, { desc: 'Retouche photo', qty: 30, price: 2000 }], { payments: [{ id: uid(), amount: 100000, date: d(-25), method: 'Orange Money', ref: 'OM-48213' }] });
    add('facture', c1, d(-10), 30, 'Spot institutionnel 60 s', [{ desc: 'Écriture et réalisation du spot', qty: 1, price: 450000 }, { desc: 'Voix off', qty: 1, price: 75000 }], { payments: [{ id: uid(), amount: 300000, date: d(-2), method: 'Virement bancaire', ref: '' }] });
    add('devis', c2, d(-5), 30, 'Vidéo de présentation de l\'hôtel', [{ desc: 'Tournage drone et intérieur', qty: 1, price: 400000 }, { desc: 'Montage 2 min + version 30 s', qty: 1, price: 200000 }], {});
    add('devis', c3, d(-2), 30, 'Pack lancement boutique en ligne', [{ desc: 'Création de la page Facebook et Instagram', qty: 1, price: 50000 }, { desc: 'Publications sponsorisées (gestion)', qty: 4, price: 25000 }], { status: 'brouillon' });
    save();
    toast('Exemples chargés');
    go('#/');
  }

  // ---------- Boutique en ligne (espace vendeur) ----------
  const shopData = { loaded: false, shop: null, products: [], orders: [] };
  const ORDER_STATUS = {
    nouvelle: { label: 'Nouvelle', cls: 'b-gold' },
    validee: { label: 'Validée', cls: 'b-blue' },
    livree: { label: 'Livrée', cls: 'b-green' },
    annulee: { label: 'Annulée', cls: 'b-gray' }
  };
  const orderBadge = (o) => '<span class="badge ' + ORDER_STATUS[o.status].cls + '">' + ORDER_STATUS[o.status].label + '</span>';
  const fmtDateTime = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const digits = (p) => String(p || '').replace(/\D/g, '');
  function waNumber(p) { let d = digits(p); if (d.length === 10) d = '225' + d; return d; }
  function shopUrl(pid) {
    const base = new URL('boutique.html', location.origin + location.pathname).href;
    return base + '?b=' + encodeURIComponent(shopData.shop.slug) + (pid ? '&p=' + pid : '');
  }
  function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }
  async function copyText(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg || 'Lien copié'); }
    catch (e) { window.prompt('Copiez ce lien :', text); }
  }
  const waShare = (text) => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');

  async function loadShopData() {
    if (!CLOUD || !user) return;
    const { data: shop, error } = await sb.from('shops').select('*').eq('owner', user.id).maybeSingle();
    if (error) return;
    shopData.shop = shop;
    if (shop) {
      const [p, o] = await Promise.all([
        sb.from('products').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }),
        sb.from('orders').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(300)
      ]);
      shopData.products = p.data || [];
      shopData.orders = o.data || [];
    }
    shopData.loaded = true;
    updateOrderBadge();
  }

  function updateOrderBadge() {
    const n = shopData.orders.filter((o) => o.status === 'nouvelle').length;
    $$('.nav [data-count]').forEach((el) => { el.textContent = n; el.hidden = !n; });
  }

  // Nouvelles commandes : vérification toutes les minutes quand la page est visible
  setInterval(async () => {
    if (!user || !shopData.shop || document.visibilityState !== 'visible') return;
    const before = shopData.orders.filter((o) => o.status === 'nouvelle').length;
    const { data } = await sb.from('orders').select('*').eq('shop_id', shopData.shop.id).order('created_at', { ascending: false }).limit(300);
    if (!data) return;
    shopData.orders = data;
    updateOrderBadge();
    const after = data.filter((o) => o.status === 'nouvelle').length;
    if (after > before) {
      toast(after - before > 1 ? (after - before) + ' nouvelles commandes !' : 'Nouvelle commande reçue !');
      if (/^#\/(commandes)?$/.test(location.hash) || location.hash === '') router();
    }
  }, 60000);

  function needShop(view, render) {
    if (!CLOUD || !user) {
      view.innerHTML = head('Boutique en ligne') + '<div class="card empty"><div class="big">Connexion requise</div>La boutique en ligne nécessite un compte.</div>';
      return false;
    }
    if (!shopData.loaded) {
      view.innerHTML = '<div class="empty">Chargement…</div>';
      const h = location.hash;
      loadShopData().then(() => { if (location.hash === h) render(); });
      return false;
    }
    return true;
  }

  function shopBanner() {
    if (!CLOUD || !user || !shopData.loaded) return '';
    if (!shopData.shop) {
      return '<div class="card card-pad shop-cta"><div><div class="strong">Créez votre boutique en ligne</div><div class="muted small">Ajoutez vos produits, partagez le lien à vos contacts, recevez les commandes et facturez en un clic.</div></div><a class="btn btn-gold" href="#/boutique">Créer ma boutique</a></div>';
    }
    const fresh = shopData.orders.filter((o) => o.status === 'nouvelle');
    if (!fresh.length) return '';
    const sum = fresh.reduce((s, o) => s + Number(o.total), 0);
    return '<a class="card card-pad shop-cta new-orders" href="#/commandes"><div><div class="strong">' + fresh.length + ' nouvelle' + (fresh.length > 1 ? 's commandes' : ' commande') + ' à traiter</div><div class="muted small">' + money(sum) + ' en attente de validation</div></div><span class="btn btn-primary">Voir</span></a>';
  }

  async function resizeToBlob(file, maxSide) {
    const url = URL.createObjectURL(file);
    try {
      const imgEl = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const scale = Math.min(1, maxSide / Math.max(imgEl.width, imgEl.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(imgEl.width * scale); cv.height = Math.round(imgEl.height * scale);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(imgEl, 0, 0, cv.width, cv.height);
      return await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.84));
    } finally { URL.revokeObjectURL(url); }
  }

  async function uploadImage(file, prefix) {
    const blob = await resizeToBlob(file, prefix === 'logo' ? 400 : 1000);
    const path = user.id + '/' + prefix + '-' + uid() + '.jpg';
    const { error } = await sb.storage.from('produits').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    return sb.storage.from('produits').getPublicUrl(path).data.publicUrl;
  }

  function removeImage(url) {
    const marker = '/object/public/produits/';
    if (!url || url.indexOf(marker) < 0) return;
    sb.storage.from('produits').remove([decodeURIComponent(url.split(marker)[1])]);
  }

  // Page « Ma boutique »
  function renderShop() {
    const view = $('#view');
    if (!needShop(view, renderShop)) return;
    const shop = shopData.shop;
    if (!shop) return renderShopCreate(view);

    const prods = shopData.products;
    view.innerHTML =
      head('Ma boutique', esc(shop.name) + (shop.active ? '' : ' · <span class="badge b-gray">Fermée</span>'),
        '<button class="btn" id="shop-settings">' + ICON.edit + 'Paramètres</button><a class="btn" target="_blank" rel="noopener" href="' + esc(shopUrl()) + '">Voir ma boutique</a>') +
      '<div class="card card-pad share-box"><div class="share-text"><div class="strong">Lien de votre boutique</div><div class="muted small">Envoyez-le à vos contacts, mettez-le en statut WhatsApp ou sur Facebook.</div>' +
        '<div class="link-field"><input type="text" readonly value="' + esc(shopUrl()) + '" aria-label="Lien de la boutique"></div></div>' +
        '<div class="head-actions"><button class="btn btn-primary" id="copy-shop">' + ICON.copy + 'Copier le lien</button><button class="btn" id="wa-shop">' + ICON.wa + 'Partager sur WhatsApp</button></div></div>' +
      '<div class="page-head" style="margin:24px 0 14px"><div><h1 style="font-size:20px">Produits</h1><p class="sub">' + prods.length + ' produit' + (prods.length > 1 ? 's' : '') + ' · ' + prods.filter((p) => p.active).length + ' en vente</p></div>' +
        '<div class="head-actions"><button class="btn btn-gold" id="add-product">' + ICON.plus + 'Ajouter un produit</button></div></div>' +
      (prods.length
        ? '<div class="seller-products">' + prods.map((p) =>
            '<div class="card sp-card' + (p.active ? '' : ' off') + '">' +
              '<div class="sp-img">' + (p.image_url ? '<img src="' + esc(p.image_url) + '" alt="" loading="lazy">' : '<span>' + esc((p.name[0] || '?').toUpperCase()) + '</span>') +
                (!p.active ? '<span class="badge b-gray sp-flag">Masqué</span>' : p.stock === 0 ? '<span class="badge b-red sp-flag">Épuisé</span>' : '') + '</div>' +
              '<div class="sp-body"><div class="strong sp-name">' + esc(p.name) + '</div>' +
                '<div class="sp-price">' + money(p.price) + (p.old_price && Number(p.old_price) > Number(p.price) ? ' <s class="muted small">' + money(p.old_price) + '</s>' : '') + '</div>' +
                '<div class="muted small">' + (p.stock == null ? 'Stock illimité' : 'Stock : ' + p.stock) + '</div>' +
                '<div class="sp-actions"><button class="btn btn-sm" data-edit="' + p.id + '">' + ICON.edit + 'Modifier</button>' +
                  '<button class="btn btn-sm icon-btn" data-copy="' + p.id + '" aria-label="Copier le lien du produit" title="Copier le lien">' + ICON.copy + '</button>' +
                  '<button class="btn btn-sm icon-btn" data-wa="' + p.id + '" aria-label="Partager sur WhatsApp" title="Partager sur WhatsApp">' + ICON.wa + '</button></div>' +
              '</div></div>').join('') + '</div>'
        : '<div class="card empty"><div class="big">Aucun produit</div>Ajoutez votre premier produit : photo, nom et prix suffisent.<br><button class="btn btn-gold" id="add-product-2">' + ICON.plus + 'Ajouter un produit</button></div>');

    $('#copy-shop', view).onclick = () => copyText(shopUrl());
    $('#wa-shop', view).onclick = () => waShare('Découvrez ma boutique ' + shop.name + ' et commandez directement en ligne 👉 ' + shopUrl());
    $('#shop-settings', view).onclick = shopSettingsModal;
    $('#add-product', view).onclick = () => productModal(null);
    const add2 = $('#add-product-2', view);
    if (add2) add2.onclick = () => productModal(null);
    $$('[data-edit]', view).forEach((b) => b.onclick = () => productModal(prods.find((p) => p.id === b.dataset.edit)));
    $$('[data-copy]', view).forEach((b) => b.onclick = () => copyText(shopUrl(b.dataset.copy), 'Lien du produit copié'));
    $$('[data-wa]', view).forEach((b) => b.onclick = () => {
      const p = prods.find((x) => x.id === b.dataset.wa);
      waShare(p.name + ' à ' + money(p.price) + ' chez ' + shop.name + '. Commandez ici 👉 ' + shopUrl(p.id));
    });
  }

  function renderShopCreate(view) {
    const c = state.company;
    view.innerHTML = head('Créer ma boutique', 'Quelques informations et votre boutique est en ligne') +
      '<form id="shf" class="card card-pad" style="max-width:640px"><div class="form-grid">' +
        '<div class="field full"><label for="sh-name">Nom de la boutique *</label><input type="text" id="sh-name" required maxlength="80" value="' + esc(c.name) + '" placeholder="Ex. : Awa Mode"></div>' +
        '<div class="field full"><label for="sh-slug">Adresse de la boutique *</label><div class="slug-field"><span>…/boutique.html?b=</span><input type="text" id="sh-slug" required maxlength="40" value="' + esc(slugify(c.name)) + '"></div><div class="muted small" style="margin-top:4px">Lettres minuscules, chiffres et tirets (3 caractères minimum).</div></div>' +
        '<div class="field"><label for="sh-phone">Numéro WhatsApp *</label><input type="tel" id="sh-phone" required value="' + esc(c.phone) + '" placeholder="07 00 00 00 00"></div>' +
        '<div class="field"><label for="sh-city">Ville</label><input type="text" id="sh-city" value="' + esc(c.city) + '"></div>' +
      '</div><button class="btn btn-gold" style="margin-top:18px">' + ICON.check + 'Créer ma boutique</button><p class="auth-msg small" id="sh-msg"></p></form>';
    const name = $('#sh-name', view), slugIn = $('#sh-slug', view);
    let touched = false;
    name.oninput = () => { if (!touched) slugIn.value = slugify(name.value); };
    slugIn.oninput = () => { touched = true; slugIn.value = slugify(slugIn.value); };
    $('#shf', view).onsubmit = async (e) => {
      e.preventDefault();
      const msg = $('#sh-msg', view);
      const slug = slugify(slugIn.value);
      if (slug.length < 3) { msg.textContent = 'L\'adresse doit contenir au moins 3 caractères'; return; }
      if (digits($('#sh-phone', view).value).length < 8) { msg.textContent = 'Numéro WhatsApp invalide'; return; }
      msg.className = 'auth-msg small ok'; msg.textContent = 'Création…';
      const { data, error } = await sb.from('shops').insert({
        owner: user.id, slug, name: name.value.trim(), phone: $('#sh-phone', view).value.trim(), city: $('#sh-city', view).value.trim(),
        delivery: 'Livraison possible. Paiement à la livraison ou par Mobile Money.'
      }).select().single();
      if (error) {
        msg.className = 'auth-msg small';
        msg.textContent = error.code === '23505' ? (/slug/.test(error.message) ? 'Cette adresse est déjà prise, choisissez-en une autre' : 'Vous avez déjà une boutique') : 'Erreur : ' + error.message;
        return;
      }
      shopData.shop = data; shopData.products = []; shopData.orders = [];
      toast('Boutique créée !');
      renderShop();
    };
  }

  function shopSettingsModal() {
    const s = shopData.shop;
    openModal('<form id="ssf"><div class="modal-head"><h3>Paramètres de la boutique</h3><button type="button" class="btn btn-ghost icon-btn" data-close aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="modal-content"><div class="form-grid">' +
        '<div class="field full"><label>Logo</label><div class="logo-preview">' + (s.logo_url ? '<img src="' + esc(s.logo_url) + '" alt="Logo" id="ss-logo-img">' : '<span class="muted small" id="ss-logo-img">Aucun logo</span>') +
          '<label class="btn" style="margin:0">Choisir<input type="file" id="ss-logo" accept="image/*" hidden></label></div></div>' +
        '<div class="field full"><label for="ss-name">Nom</label><input type="text" id="ss-name" maxlength="80" value="' + esc(s.name) + '"></div>' +
        '<div class="field full"><label for="ss-desc">Présentation</label><textarea id="ss-desc" rows="3" placeholder="Ce que vous vendez, vos horaires…">' + esc(s.description) + '</textarea></div>' +
        '<div class="field"><label for="ss-phone">WhatsApp</label><input type="tel" id="ss-phone" value="' + esc(s.phone) + '"></div>' +
        '<div class="field"><label for="ss-city">Ville</label><input type="text" id="ss-city" value="' + esc(s.city) + '"></div>' +
        '<div class="field full"><label for="ss-delivery">Livraison et paiement (affiché aux clients)</label><input type="text" id="ss-delivery" value="' + esc(s.delivery) + '"></div>' +
        '<label class="check-row full"><input type="checkbox" id="ss-active"' + (s.active ? ' checked' : '') + '> Boutique ouverte (visible par les clients)</label>' +
      '</div></div>' +
      '<div class="modal-foot"><button type="button" class="btn" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div></form>');
    let logoUrl = s.logo_url;
    $('#ss-logo').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      toast('Envoi du logo…');
      try {
        logoUrl = await uploadImage(f, 'logo');
        $('#ss-logo-img').outerHTML = '<img src="' + esc(logoUrl) + '" alt="Logo" id="ss-logo-img">';
      } catch (err) { toast('Envoi du logo impossible'); }
    };
    $('#ssf').onsubmit = async (e) => {
      e.preventDefault();
      const patch = {
        name: $('#ss-name').value.trim() || s.name, description: $('#ss-desc').value.trim(), phone: $('#ss-phone').value.trim(),
        city: $('#ss-city').value.trim(), delivery: $('#ss-delivery').value.trim(), active: $('#ss-active').checked, logo_url: logoUrl
      };
      const { data, error } = await sb.from('shops').update(patch).eq('id', s.id).select().single();
      if (error) { toast('Erreur : ' + error.message); return; }
      if (s.logo_url && s.logo_url !== logoUrl) removeImage(s.logo_url);
      shopData.shop = data;
      closeModal(); toast('Boutique mise à jour'); renderShop();
    };
  }

  function productModal(p) {
    const isNew = !p;
    p = p || { name: '', price: '', old_price: null, stock: null, description: '', image_url: '', active: true };
    let imageUrl = p.image_url;
    let file = null;
    openModal('<form id="pf2"><div class="modal-head"><h3>' + (isNew ? 'Nouveau produit' : 'Modifier le produit') + '</h3><button type="button" class="btn btn-ghost icon-btn" data-close aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="modal-content"><div class="form-grid">' +
        '<div class="field full"><label>Photo</label><label class="photo-pick" id="pp">' + (imageUrl ? '<img src="' + esc(imageUrl) + '" alt="">' : '<span>+ Ajouter une photo</span>') + '<input type="file" id="pp-file" accept="image/*" hidden></label></div>' +
        '<div class="field full"><label for="pp-name">Nom du produit *</label><input type="text" id="pp-name" required maxlength="120" value="' + esc(p.name) + '"></div>' +
        '<div class="field"><label for="pp-price">Prix (FCFA) *</label><input type="number" id="pp-price" min="0" step="1" required value="' + esc(p.price) + '"></div>' +
        '<div class="field"><label for="pp-old">Ancien prix (barré)</label><input type="number" id="pp-old" min="0" step="1" value="' + esc(p.old_price == null ? '' : p.old_price) + '" placeholder="Facultatif"></div>' +
        '<div class="field"><label for="pp-stock">Stock</label><input type="number" id="pp-stock" min="0" step="1" value="' + esc(p.stock == null ? '' : p.stock) + '" placeholder="Vide = illimité"></div>' +
        '<label class="check-row" style="align-self:end"><input type="checkbox" id="pp-active"' + (p.active ? ' checked' : '') + '> En vente</label>' +
        '<div class="field full"><label for="pp-desc">Description</label><textarea id="pp-desc" rows="3" placeholder="Taille, couleur, matière…">' + esc(p.description) + '</textarea></div>' +
      '</div></div>' +
      '<div class="modal-foot">' + (isNew ? '' : '<button type="button" class="btn btn-danger" id="pp-del" style="margin-right:auto">' + ICON.trash + 'Supprimer</button>') +
        '<button type="button" class="btn" data-close>Annuler</button><button class="btn btn-primary">Enregistrer</button></div></form>');
    $('#pp-file').onchange = (e) => {
      file = e.target.files[0];
      if (!file) return;
      const prev = URL.createObjectURL(file);
      $('#pp').firstChild.outerHTML = '<img src="' + prev + '" alt="">';
    };
    const del = $('#pp-del');
    if (del) del.onclick = () => confirmModal('Supprimer « ' + p.name + ' » ?', 'Le produit disparaîtra de votre boutique. Les commandes déjà passées restent intactes.', 'Supprimer', async () => {
      const { error } = await sb.from('products').delete().eq('id', p.id);
      if (error) { toast('Erreur : ' + error.message); return; }
      removeImage(p.image_url);
      shopData.products = shopData.products.filter((x) => x.id !== p.id);
      toast('Produit supprimé'); renderShop();
    });
    $('#pf2').onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#pf2 .modal-foot .btn-primary');
      const name = $('#pp-name').value.trim();
      const price = num($('#pp-price').value);
      if (!name) { toast('Le nom est obligatoire'); return; }
      const oldRaw = $('#pp-old').value.trim(), stockRaw = $('#pp-stock').value.trim();
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        if (file) imageUrl = await uploadImage(file, 'produit');
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Enregistrer';
        toast('Envoi de la photo impossible'); return;
      }
      const row = {
        name, price: Math.round(price), old_price: oldRaw ? Math.round(num(oldRaw)) : null,
        stock: stockRaw === '' ? null : Math.max(0, Math.round(num(stockRaw))),
        description: $('#pp-desc').value.trim(), active: $('#pp-active').checked, image_url: imageUrl || ''
      };
      const q = isNew
        ? sb.from('products').insert(Object.assign({ shop_id: shopData.shop.id }, row)).select().single()
        : sb.from('products').update(row).eq('id', p.id).select().single();
      const { data, error } = await q;
      if (error) { btn.disabled = false; btn.textContent = 'Enregistrer'; toast('Erreur : ' + error.message); return; }
      if (!isNew && p.image_url && p.image_url !== imageUrl) removeImage(p.image_url);
      if (isNew) shopData.products.unshift(data);
      else shopData.products = shopData.products.map((x) => (x.id === data.id ? data : x));
      closeModal(); toast(isNew ? 'Produit ajouté à la boutique' : 'Produit modifié'); renderShop();
    };
  }

  // Page « Commandes »
  let orderFilter = 'nouvelle';
  function renderOrders() {
    const view = $('#view');
    if (!needShop(view, renderOrders)) return;
    if (!shopData.shop) return renderShop();
    const all = shopData.orders;
    const counts = {};
    all.forEach((o) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    const filters = [['nouvelle', 'Nouvelles'], ['validee', 'Validées'], ['livree', 'Livrées'], ['annulee', 'Annulées'], ['toutes', 'Toutes']];
    const rows = all.filter((o) => orderFilter === 'toutes' || o.status === orderFilter);
    view.innerHTML = head('Commandes', all.length + ' commande' + (all.length > 1 ? 's' : '') + ' reçue' + (all.length > 1 ? 's' : '') + ' sur votre boutique',
      '<button class="btn" id="refresh-orders">Actualiser</button>') +
      '<div class="chips" style="margin-bottom:14px">' + filters.map(([k, l]) => '<button class="chip' + (orderFilter === k ? ' active' : '') + '" data-f="' + k + '">' + l + (counts[k] ? ' (' + counts[k] + ')' : '') + '</button>').join('') + '</div>' +
      '<div class="card">' + (rows.length
        ? '<table class="table table-desktop"><thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Articles</th><th class="num">Total</th><th>Statut</th></tr></thead><tbody>' +
            rows.map((o) => '<tr class="clickable" data-id="' + o.id + '"><td class="strong">#' + o.number + '</td><td>' + esc(o.customer_name) + '<div class="muted small">' + esc(o.customer_phone) + '</div></td><td>' + fmtDateTime(o.created_at) + '</td><td>' + o.items.reduce((s, i) => s + i.qty, 0) + '</td><td class="num strong">' + money(o.total) + '</td><td>' + orderBadge(o) + (o.invoice_number ? ' <span class="badge b-green">Facturée</span>' : '') + '</td></tr>').join('') +
          '</tbody></table><div class="list-mobile">' +
            rows.map((o) => '<a class="row-card" href="#/commande/' + o.id + '"><div><div class="strong">#' + o.number + ' · ' + esc(o.customer_name) + '</div><div class="muted small">' + fmtDateTime(o.created_at) + '</div></div><div class="r"><div class="strong">' + money(o.total) + '</div>' + orderBadge(o) + '</div></a>').join('') + '</div>'
        : '<div class="empty"><div class="big">' + (all.length ? 'Aucune commande dans cette catégorie' : 'Pas encore de commande') + '</div>' +
            (all.length ? '' : 'Partagez le lien de votre boutique pour recevoir vos premières commandes.<br><a class="btn btn-primary" href="#/boutique">Partager ma boutique</a>') + '</div>') +
      '</div>';
    $$('.chip', view).forEach((c) => c.onclick = () => { orderFilter = c.dataset.f; renderOrders(); });
    $$('tr[data-id]', view).forEach((tr) => tr.onclick = () => go('#/commande/' + tr.dataset.id));
    $('#refresh-orders', view).onclick = async () => { shopData.loaded = false; await loadShopData(); renderOrders(); toast('Commandes à jour'); };
  }

  function renderOrder(id) {
    const view = $('#view');
    if (!needShop(view, () => renderOrder(id))) return;
    const o = shopData.orders.find((x) => x.id === id);
    if (!o) return go('#/commandes');
    const invoice = state.docs.find((d) => d.orderId === o.id);
    const statusMsg = {
      nouvelle: 'Bonjour ' + o.customer_name + ', nous avons bien reçu votre commande n° ' + o.number + ' (' + money(o.total) + ') sur ' + shopData.shop.name + '.',
      validee: 'Bonjour ' + o.customer_name + ', votre commande n° ' + o.number + ' est confirmée (' + money(o.total) + '). Nous vous contactons pour la livraison.',
      livree: 'Bonjour ' + o.customer_name + ', merci pour votre achat chez ' + shopData.shop.name + ' ! À bientôt.',
      annulee: 'Bonjour ' + o.customer_name + ', votre commande n° ' + o.number + ' a été annulée.'
    }[o.status];

    const actions = [];
    if (o.status !== 'annulee' && !invoice) actions.push('<button class="btn btn-gold" data-o="invoice">' + ICON.money + 'Créer la facture</button>');
    if (invoice) actions.push('<a class="btn btn-gold" href="#/doc/' + invoice.id + '">Voir la facture ' + esc(invoice.number) + '</a>');
    if (o.status === 'nouvelle') actions.push('<button class="btn btn-primary" data-o="validee">' + ICON.check + 'Valider la commande</button>');
    if (o.status === 'validee') actions.push('<button class="btn btn-primary" data-o="livree">' + ICON.check + 'Marquer comme livrée</button>');
    actions.push('<a class="btn" target="_blank" rel="noopener" href="https://wa.me/' + waNumber(o.customer_phone) + '?text=' + encodeURIComponent(statusMsg) + '">' + ICON.wa + 'Écrire au client</a>');
    actions.push('<a class="btn" href="tel:' + esc(o.customer_phone.replace(/\s/g, '')) + '">Appeler</a>');
    if (o.status === 'nouvelle' || o.status === 'validee') actions.push('<button class="btn btn-danger" data-o="annulee">' + ICON.close + 'Annuler la commande</button>');

    view.innerHTML = head('Commande #' + o.number, orderBadge(o) + ' &nbsp;' + fmtDateTime(o.created_at), '<a class="btn" href="#/commandes">← Retour</a>') +
      '<div class="doc-layout">' +
        '<div class="grid">' +
          '<div class="card card-pad"><h2>Client</h2><div class="strong" style="font-size:17px">' + esc(o.customer_name) + '</div>' +
            '<div>' + esc(o.customer_phone) + '</div>' +
            (o.customer_address ? '<div class="muted" style="margin-top:6px">📍 ' + esc(o.customer_address) + '</div>' : '') +
            (o.note ? '<div class="order-note">' + esc(o.note) + '</div>' : '') + '</div>' +
          '<div class="card"><table class="table"><thead><tr><th>Produit</th><th class="num">Qté</th><th class="num">Prix</th><th class="num">Montant</th></tr></thead><tbody>' +
            o.items.map((i) => '<tr><td>' + esc(i.name) + '</td><td class="num">' + i.qty + '</td><td class="num">' + money(i.price) + '</td><td class="num strong">' + money(i.price * i.qty) + '</td></tr>').join('') +
            '<tr><td colspan="3" class="strong">Total</td><td class="num strong" style="font-size:17px">' + money(o.total) + '</td></tr></tbody></table></div>' +
        '</div>' +
        '<div class="doc-side"><div class="card card-pad"><h2>Actions</h2><div class="action-list">' + actions.join('') + '</div></div></div>' +
      '</div>';

    $$('[data-o]', view).forEach((b) => b.onclick = async () => {
      const a = b.dataset.o;
      if (a === 'invoice') return invoiceFromOrder(o);
      const apply = async () => {
        const { data, error } = await sb.from('orders').update({ status: a }).eq('id', o.id).select().single();
        if (error) { toast('Erreur : ' + error.message); return; }
        Object.assign(o, data);
        if (a === 'annulee') loadShopData();
        updateOrderBadge();
        toast({ validee: 'Commande validée', livree: 'Commande livrée', annulee: 'Commande annulée' }[a]);
        renderOrder(o.id);
      };
      if (a === 'annulee') confirmModal('Annuler la commande #' + o.number + ' ?', 'Les quantités seront remises en stock.', 'Annuler la commande', apply);
      else apply();
    });
  }

  async function invoiceFromOrder(o) {
    // Entreprise pas encore renseignée : on reprend les infos de la boutique
    const c = state.company, s = shopData.shop;
    if (!c.name) Object.assign(c, { name: s.name, phone: c.phone || s.phone, city: s.city || c.city, logo: c.logo || '' });
    // Client : retrouvé par son numéro, sinon créé
    let client = state.clients.find((c) => digits(c.phone) && digits(c.phone).slice(-8) === digits(o.customer_phone).slice(-8));
    if (!client) {
      client = { id: uid(), name: o.customer_name, contact: '', phone: o.customer_phone, email: '', ncc: '', address: o.customer_address, createdAt: Date.now() };
      state.clients.push(client);
    }
    const doc = {
      id: uid(), type: 'facture', clientId: client.id, date: today(), due: today(),
      subject: 'Commande n° ' + o.number + ' — boutique en ligne',
      items: o.items.map((i) => ({ desc: i.name, qty: i.qty, price: Number(i.price) })),
      discount: 0, tva: 0, notes: state.company.invoiceNotes, status: 'envoyee', payments: [], orderId: o.id,
      createdAt: Date.now(), updatedAt: Date.now()
    };
    doc.number = nextNumber('facture', doc.date);
    state.docs.push(doc);
    save();
    const patch = { invoice_number: doc.number };
    if (o.status === 'nouvelle') patch.status = 'validee';
    const { data } = await sb.from('orders').update(patch).eq('id', o.id).select().single();
    if (data) Object.assign(o, data);
    updateOrderBadge();
    toast('Facture ' + doc.number + ' créée');
    go('#/doc/' + doc.id);
  }

  // Menu « Plus » sur mobile
  document.addEventListener('click', (e) => {
    const more = e.target.closest('[data-more]');
    if (!more) return;
    e.preventDefault();
    openModal('<div class="modal-head"><h3>Menu</h3><button class="btn btn-ghost icon-btn" data-close aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="modal-content more-menu">' +
        '<a class="btn" href="#/devis">Devis</a><a class="btn" href="#/clients">Clients</a><a class="btn" href="#/parametres">Réglages</a>' +
        (user ? '<button class="btn btn-danger" id="more-logout">Se déconnecter</button>' : '') + '</div>');
    const lo = $('#more-logout');
    if (lo) lo.onclick = () => { closeModal(); logout(); };
  });

  // ---------- Comptes (mode en ligne) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const appUrl = () => location.origin + location.pathname;

  function authError(err) {
    const m = (err && err.message) || '';
    if (/invalid login/i.test(m)) return 'E-mail ou mot de passe incorrect';
    if (/not confirmed/i.test(m)) return 'Confirmez d\'abord votre e-mail (lien reçu par mail)';
    if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet e-mail : connectez-vous';
    if (/at least 6/i.test(m)) return 'Le mot de passe doit contenir au moins 6 caractères';
    if (/rate limit/i.test(m)) return 'Trop de tentatives, réessayez dans quelques minutes';
    if (/email address .* is invalid/i.test(m)) return 'Adresse e-mail non acceptée, vérifiez-la';
    if (/error sending|sending .*email/i.test(m)) return 'L\'e-mail de confirmation n\'a pas pu être envoyé, réessayez plus tard';
    if (/failed to fetch|network/i.test(m)) return 'Pas de connexion au serveur. Vérifiez Internet et réessayez';
    return m || 'Erreur de connexion';
  }

  function renderAuth(mode) {
    mode = mode || 'login';
    document.body.classList.add('auth-mode');
    const signup = mode === 'signup';
    $('#view').innerHTML =
      '<div class="auth"><div class="auth-brand"><span class="brand-mark" aria-hidden="true"></span><span>Sika</span></div>' +
      '<p class="muted" style="text-align:center;margin:0 0 20px">Votre boutique en ligne, vos commandes et vos factures au même endroit</p>' +
      '<form id="af" class="card card-pad"><h2>' + (signup ? 'Créer un compte' : 'Connexion') + '</h2>' +
        '<div class="field" style="margin-bottom:12px"><label for="a-email">E-mail</label><input type="email" id="a-email" autocomplete="email" required></div>' +
        '<div class="field" style="margin-bottom:16px"><label for="a-pass">Mot de passe</label><input type="password" id="a-pass" autocomplete="' + (signup ? 'new-password' : 'current-password') + '" minlength="6" required></div>' +
        '<button class="btn btn-primary" style="width:100%">' + (signup ? 'Créer mon compte' : 'Se connecter') + '</button>' +
        '<p class="auth-msg small" id="a-msg"></p>' +
        '<div class="auth-links">' + (signup
          ? '<button type="button" class="link" data-m="login">J\'ai déjà un compte</button>'
          : '<button type="button" class="link" data-m="signup">Créer un compte</button><button type="button" class="link" id="forgot">Mot de passe oublié ?</button>') + '</div>' +
      '</form></div>';
    const form = $('#af');
    const msg = (t, ok) => { const el = $('#a-msg'); el.textContent = t; el.className = 'auth-msg small' + (ok ? ' ok' : ''); };
    $$('[data-m]', form).forEach((b) => b.onclick = () => renderAuth(b.dataset.m));
    const forgot = $('#forgot', form);
    if (forgot) forgot.onclick = async () => {
      const email = $('#a-email').value.trim();
      if (!email) { msg('Saisissez votre e-mail puis cliquez à nouveau'); $('#a-email').focus(); return; }
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
      msg(error ? authError(error) : 'Un lien de réinitialisation vous a été envoyé par e-mail', !error);
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = $('#a-email').value.trim(), password = $('#a-pass').value;
      const btn = $('button.btn-primary', form);
      btn.disabled = true; msg('Patientez…', true);
      if (signup) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
        btn.disabled = false;
        if (error) return msg(authError(error));
        if (data.session) return enter(data.session.user);
        msg('Compte créé ! Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.', true);
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        btn.disabled = false;
        if (error) return msg(authError(error));
        enter(data.user);
      }
    };
  }

  function newPasswordModal() {
    openModal('<form id="np"><div class="modal-head"><h3>Nouveau mot de passe</h3></div><div class="modal-content"><div class="field"><label for="np-pass">Choisissez un nouveau mot de passe</label><input type="password" id="np-pass" minlength="6" autocomplete="new-password" required></div></div>' +
      '<div class="modal-foot"><button class="btn btn-primary">Enregistrer</button></div></form>');
    $('#np').onsubmit = async (e) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: $('#np-pass').value });
      if (error) return toast(authError(error));
      closeModal(); toast('Mot de passe modifié');
    };
  }

  async function enter(u) {
    if (user && user.id === u.id) return;
    user = u;
    storeKey = STORE_KEY + ':' + u.id;
    document.body.classList.remove('auth-mode');
    $('#view').innerHTML = '<div class="empty">Chargement de vos données…</div>';
    const { data, error } = await sb.from('sika_data').select('data, updated_at').eq('user_id', u.id).maybeSingle();
    if (error) {
      state = load(storeKey);
      setSync('error');
      toast('Connexion au serveur impossible : données de cet appareil');
    } else if (data) {
      state = normalize(data.data);
      lastSynced = data.updated_at;
      try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { /* cache facultatif */ }
      setSync('ok');
    } else {
      // Premier accès : on reprend les données déjà saisies sur cet appareil
      state = hasLocal(storeKey) ? load(storeKey) : load(STORE_KEY);
      save();
    }
    router();
    loadShopData().then(() => { if (['', '#', '#/'].includes(location.hash)) router(); });
  }

  async function logout() {
    if (pending) await pushCloud();
    await sb.auth.signOut();
  }

  // Revenir sur l'onglet : récupère les modifications faites depuis un autre appareil
  document.addEventListener('visibilitychange', async () => {
    if (!CLOUD || !user || document.visibilityState !== 'visible' || pending || pushing) return;
    if (/\/(modifier|nouveau)/.test(location.hash) || modal.open) return;
    const { data, error } = await sb.from('sika_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
    if (error || !data || data.updated_at <= lastSynced || pending) return;
    state = normalize(data.data);
    lastSynced = data.updated_at;
    try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { /* cache facultatif */ }
    router();
  });

  // ---------- Démarrage ----------
  window.addEventListener('hashchange', () => { closeModal(); router(); });

  async function boot() {
    setSync();
    if (!CLOUD) { router(); return; }
    try {
      await loadScript(SUPABASE_JS);
    } catch (e) {
      $('#view').innerHTML = '<div class="empty"><div class="big">Connexion impossible</div>Vérifiez votre connexion Internet puis rechargez la page.</div>';
      return;
    }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setTimeout(newPasswordModal, 300);
      if (event === 'SIGNED_IN' && session && !user) enter(session.user);
      if (event === 'SIGNED_OUT') {
        user = null; storeKey = STORE_KEY; state = defaultState();
        Object.assign(shopData, { loaded: false, shop: null, products: [], orders: [] });
        updateOrderBadge();
        setSync(); renderAuth();
      }
    });
    const { data } = await sb.auth.getSession();
    if (data.session) enter(data.session.user); else if (!user) renderAuth();
  }
  boot();
})();
