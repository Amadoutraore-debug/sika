/* Sika — page publique d'une boutique : catalogue, panier, commande sans compte. */
(function () {
  'use strict';

  const CFG = window.SIKA_CONFIG || {};
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const params = new URLSearchParams(location.search);
  const slug = (params.get('b') || '').toLowerCase();
  const CART_KEY = 'sika.cart.' + slug;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const money = (v) => nf.format(Math.round(v || 0)).replace(/ | /g, ' ') + ' FCFA';
  const ICON = {
    wa: '<svg viewBox="0 0 24 24"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1l-.9 1.2c-.2.2-.3.2-.6.1a8 8 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.5 13.5 0 0 0 5.2 4.6c1.9.8 2.7.9 3.6.7a3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.3zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zM12 0a12 12 0 0 0-10.3 18l-1.7 6 6.2-1.6A12 12 0 1 0 12 0z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.4 1.2l-6.7-3.4a3 3 0 0 0 0-1.6l6.7-3.4A3 3 0 1 0 15 7a3 3 0 0 0 .1.8L8.4 11.2a3 3 0 1 0 0 3.6l6.7 3.4A3 3 0 1 0 18 16z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/></svg>'
  };

  let sb = null, shop = null, products = [], cart = loadCart(), query = '';

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* panier non mémorisé */ }
    drawCartBar();
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  function waPhone(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.length === 10) d = '225' + d;
    return d;
  }
  const productUrl = (id) => location.origin + location.pathname + '?b=' + encodeURIComponent(slug) + (id ? '&p=' + id : '');

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Lien copié'); }
    catch (e) { window.prompt('Copiez ce lien :', text); }
  }
  async function share(title, url) {
    if (navigator.share) { try { await navigator.share({ title, url }); return; } catch (e) { return; } }
    copy(url);
  }

  // ---------- Modale ----------
  const modal = $('#modal');
  function openModal(html) { $('#modal-body').innerHTML = html; if (!modal.open) modal.showModal(); }
  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
  modal.addEventListener('close', () => {
    if (params.get('p')) { params.delete('p'); history.replaceState(null, '', location.pathname + '?' + params.toString()); }
  });

  // ---------- Rendu ----------
  function fail(title, text) {
    document.title = title + ' — Sika';
    $('#shop').innerHTML = '<div class="shop-error"><div class="big">' + esc(title) + '</div>' + esc(text) + '</div>';
  }

  const available = (p) => p.stock == null || p.stock > 0;
  const inCart = (id) => (cart[id] || 0);
  const maxQty = (p) => (p.stock == null ? 1000 : p.stock);

  function img(p, cls) {
    return p.image_url ? '<img class="' + (cls || '') + '" src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '" loading="lazy">' : '';
  }

  function render() {
    document.title = shop.name + ' — Boutique';
    const initials = shop.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    $('#shop').innerHTML =
      '<header class="shop-hero">' +
        (shop.logo_url ? '<img class="shop-logo" src="' + esc(shop.logo_url) + '" alt="">' : '<div class="shop-logo">' + esc(initials) + '</div>') +
        '<div class="shop-hero-text"><h1>' + esc(shop.name) + '</h1>' +
          (shop.city ? '<div class="meta">' + esc(shop.city) + '</div>' : '') +
          (shop.description ? '<p class="desc">' + esc(shop.description) + '</p>' : '') +
          '<div class="hero-actions">' +
            (shop.phone ? '<a class="btn btn-gold" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(shop.phone) + '?text=' + encodeURIComponent('Bonjour ' + shop.name + ', je viens de votre boutique en ligne.') + '">' + ICON.wa + 'WhatsApp</a>' : '') +
            '<button class="btn" id="share-shop">' + ICON.share + 'Partager</button>' +
          '</div>' +
        '</div>' +
      '</header>' +
      (shop.delivery ? '<div class="shop-notice">' + esc(shop.delivery) + '</div>' : '') +
      (products.length > 6 ? '<div class="shop-tools"><input type="search" id="q" placeholder="Rechercher un produit…" value="' + esc(query) + '"></div>' : '') +
      '<div class="products" id="grid"></div>' +
      '<div class="shop-foot">Boutique propulsée par <a href="./">Sika</a> · créez la vôtre gratuitement</div>';

    $('#share-shop').onclick = () => share(shop.name, productUrl());
    const q = $('#q');
    if (q) q.oninput = (e) => { query = e.target.value; drawGrid(); };
    drawGrid();
    drawCartBar();
  }

  function drawGrid() {
    const grid = $('#grid');
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => !q || (p.name + ' ' + p.description).toLowerCase().includes(q));
    if (!products.length) { grid.outerHTML = '<div class="shop-error" id="grid"><div class="big">Aucun produit pour le moment</div>Revenez bientôt !</div>'; return; }
    if (!list.length) { grid.innerHTML = '<p class="muted">Aucun produit ne correspond à « ' + esc(query) + ' ».</p>'; return; }
    grid.innerHTML = list.map((p) => {
      const promo = p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
      return '<button class="p-card" data-id="' + p.id + '">' +
        '<div class="p-img">' + (p.image_url ? img(p) : '<div class="ph">' + esc(p.name[0] || '?') + '</div>') +
          (!available(p) ? '<span class="p-tag out">Épuisé</span>' : promo ? '<span class="p-tag">−' + promo + ' %</span>' : '') + '</div>' +
        '<div class="p-body"><div class="p-name">' + esc(p.name) + '</div>' +
          '<div class="p-price">' + money(p.price) + (promo ? '<span class="p-old">' + money(p.old_price) + '</span>' : '') + '</div>' +
        '</div></button>';
    }).join('');
    $$('.p-card', grid).forEach((c) => c.onclick = () => openProduct(c.dataset.id));
  }

  function openProduct(id) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    let qty = 1;
    const ok = available(p);
    openModal(
      '<div style="position:relative">' + (p.image_url ? '<img class="pd-img" src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '">' : '') +
      '<button class="btn icon-btn modal-x" data-close aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="pd-body"' + (p.image_url ? '' : ' style="padding-top:48px"') + '><h3>' + esc(p.name) + '</h3>' +
        '<div class="p-price">' + money(p.price) + (p.old_price && p.old_price > p.price ? '<span class="p-old">' + money(p.old_price) + '</span>' : '') + '</div>' +
        (p.stock != null && p.stock > 0 && p.stock <= 10 ? '<div class="small" style="color:var(--warn);margin-top:4px">Plus que ' + p.stock + ' en stock</div>' : '') +
        (p.description ? '<p class="pd-desc">' + esc(p.description) + '</p>' : '') +
        '<div class="pd-actions">' +
          (ok ? '<div class="qty"><button data-q="-1" aria-label="Moins">−</button><span id="pq">1</span><button data-q="1" aria-label="Plus">+</button></div>' +
                '<button class="btn btn-primary" id="add">Ajouter au panier</button>'
              : '<button class="btn" disabled style="flex:1">Produit épuisé</button>') +
          '<button class="btn icon-btn" id="pshare" aria-label="Partager ce produit">' + ICON.share + '</button>' +
        '</div>' +
      '</div>');
    $$('[data-q]', modal).forEach((b) => b.onclick = () => {
      qty = Math.max(1, Math.min(maxQty(p) - inCart(p.id), qty + Number(b.dataset.q)));
      $('#pq').textContent = qty;
    });
    const add = $('#add');
    if (add) add.onclick = () => {
      if (inCart(p.id) + qty > maxQty(p)) { toast('Stock insuffisant'); return; }
      cart[p.id] = inCart(p.id) + qty;
      saveCart(); closeModal(); toast('Ajouté au panier');
    };
    $('#pshare').onclick = () => share(p.name, productUrl(p.id));
  }

  function cartLines() {
    return Object.keys(cart).map((id) => ({ p: products.find((x) => x.id === id), qty: cart[id] })).filter((l) => l.p && l.qty > 0);
  }
  const cartTotal = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);

  function drawCartBar() {
    const bar = $('#cart-bar');
    const lines = cartLines();
    const count = lines.reduce((s, l) => s + l.qty, 0);
    if (!count) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = '<div class="info">' + count + ' article' + (count > 1 ? 's' : '') + '<b>' + money(cartTotal()) + '</b></div><button class="btn" id="checkout">Voir le panier</button>';
    $('#checkout').onclick = openCart;
  }

  function openCart() {
    const lines = cartLines();
    if (!lines.length) { closeModal(); return; }
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('sika.client') || '{}') || {}; } catch (e) { /* rien */ }
    openModal(
      '<div class="modal-head"><h3>Votre commande</h3><button class="btn btn-ghost icon-btn" data-close aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="modal-content">' +
        lines.map((l) => '<div class="cart-line">' + (l.p.image_url ? img(l.p) : '<div class="ph-sm"></div>') +
          '<div class="nm">' + esc(l.p.name) + '<div class="muted small">' + money(l.p.price) + '</div></div>' +
          '<div class="qty"><button data-id="' + l.p.id + '" data-d="-1" aria-label="Moins">−</button><span>' + l.qty + '</span><button data-id="' + l.p.id + '" data-d="1" aria-label="Plus">+</button></div></div>').join('') +
        '<div class="cart-total"><span>Total</span><span>' + money(cartTotal()) + '</span></div>' +
        '<form id="of" class="form-grid" style="margin-top:8px">' +
          '<div class="field full"><label for="o-name">Votre nom *</label><input type="text" id="o-name" autocomplete="name" required value="' + esc(saved.name) + '"></div>' +
          '<div class="field full"><label for="o-phone">Téléphone (WhatsApp) *</label><input type="tel" id="o-phone" autocomplete="tel" placeholder="07 00 00 00 00" required value="' + esc(saved.phone) + '"></div>' +
          '<div class="field full"><label for="o-address">Lieu de livraison</label><input type="text" id="o-address" placeholder="Ville, quartier, repère" value="' + esc(saved.address) + '"></div>' +
          '<div class="field full"><label for="o-note">Précision (facultatif)</label><textarea id="o-note" rows="2" placeholder="Taille, couleur, heure de livraison…"></textarea></div>' +
          '<div class="full"><button class="btn btn-primary" style="width:100%;padding:12px">Envoyer ma commande · ' + money(cartTotal()) + '</button>' +
          '<p class="muted small" style="margin:8px 0 0;text-align:center">Le vendeur vous contactera pour confirmer la livraison et le paiement.</p></div>' +
        '</form>' +
      '</div>');
    $$('[data-d]', modal).forEach((b) => b.onclick = () => {
      const p = products.find((x) => x.id === b.dataset.id);
      const next = inCart(p.id) + Number(b.dataset.d);
      if (next > maxQty(p)) { toast('Stock insuffisant'); return; }
      if (next <= 0) delete cart[p.id]; else cart[p.id] = next;
      saveCart(); openCart();
    });
    $('#of').onsubmit = submitOrder;
  }

  async function submitOrder(e) {
    e.preventDefault();
    const form = e.target;
    const btn = $('button.btn-primary', form);
    const data = {
      name: $('#o-name').value.trim(),
      phone: $('#o-phone').value.trim(),
      address: $('#o-address').value.trim(),
      note: $('#o-note').value.trim()
    };
    if (!data.name || data.phone.replace(/\D/g, '').length < 8) { toast('Indiquez votre nom et un numéro valide'); return; }
    const lines = cartLines();
    btn.disabled = true; btn.textContent = 'Envoi en cours…';
    const { data: res, error } = await sb.rpc('place_order', {
      p_slug: slug, p_name: data.name, p_phone: data.phone, p_address: data.address, p_note: data.note,
      p_items: lines.map((l) => ({ id: l.p.id, qty: l.qty }))
    });
    if (error) {
      btn.disabled = false; btn.textContent = 'Envoyer ma commande';
      toast(/stock|disponible|quantit/i.test(error.message) ? error.message : 'La commande n\'a pas pu être envoyée. Réessayez.');
      if (/stock|disponible/i.test(error.message)) loadProducts().then(() => { drawGrid(); openCart(); });
      return;
    }
    try { localStorage.setItem('sika.client', JSON.stringify({ name: data.name, phone: data.phone, address: data.address })); } catch (err) { /* rien */ }
    const recap = lines.map((l) => '• ' + l.qty + ' × ' + l.p.name + ' — ' + money(l.p.price * l.qty)).join('\n');
    cart = {}; saveCart();
    const msg = 'Bonjour ' + shop.name + ',\nJe viens de passer la commande n° ' + res.number + ' sur votre boutique :\n' + recap +
      '\nTotal : ' + money(res.total) + '\n\nNom : ' + data.name + (data.address ? '\nLivraison : ' + data.address : '') + (data.note ? '\nPrécision : ' + data.note : '');
    openModal('<div class="success"><div class="check">' + ICON.check + '</div><h3 style="margin:0 0 6px">Commande n° ' + res.number + ' envoyée !</h3>' +
      '<p class="muted" style="margin:0 0 16px">Total : <b>' + money(res.total) + '</b>. ' + esc(shop.name) + ' va vous contacter au ' + esc(data.phone) + '.</p>' +
      (shop.phone ? '<a class="btn btn-primary" style="width:100%" target="_blank" rel="noopener" href="https://wa.me/' + waPhone(shop.phone) + '?text=' + encodeURIComponent(msg) + '">' + ICON.wa + 'Prévenir le vendeur sur WhatsApp</a>' : '') +
      '<button class="btn" data-close style="width:100%;margin-top:8px">Continuer mes achats</button></div>');
    loadProducts().then(drawGrid);
  }

  // ---------- Chargement ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }

  async function loadProducts() {
    const { data, error } = await sb.from('products')
      .select('id, name, description, price, old_price, image_url, stock')
      .eq('shop_id', shop.id).eq('active', true).order('created_at', { ascending: false });
    if (!error) {
      products = data || [];
      Object.keys(cart).forEach((id) => { if (!products.some((p) => p.id === id)) delete cart[id]; });
    }
  }

  async function start() {
    if (!slug) return fail('Boutique introuvable', 'Le lien est incomplet. Demandez au vendeur de vous renvoyer le lien de sa boutique.');
    if (!CFG.supabaseUrl) return fail('Boutique indisponible', 'Ce site n\'est pas encore relié à sa base de données.');
    try { await loadScript(SUPABASE_JS); } catch (e) { return fail('Connexion impossible', 'Vérifiez votre connexion Internet puis rechargez la page.'); }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: false } });
    const { data, error } = await sb.from('shops').select('id, slug, name, description, phone, city, logo_url, delivery').eq('slug', slug).eq('active', true).maybeSingle();
    if (error) return fail('Connexion impossible', 'Vérifiez votre connexion Internet puis rechargez la page.');
    if (!data) return fail('Boutique introuvable', 'Cette boutique n\'existe pas ou est fermée pour le moment.');
    shop = data;
    await loadProducts();
    render();
    const pid = params.get('p');
    if (pid) openProduct(pid);
  }

  start();
})();
