let currentSection = 'dashboard';
let editingKisiId = null;
let activeHayvanIdForHissedar = null;
let editingHayvanId = null;
let kisilerSearchTerm = '';
let dashboardHissedarIds = null;
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function money(v) {
  const n = Number(v || 0);
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function normTR(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

async function fetchJSON(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'İstek başarısız');
  }
  return data;
}

function showSection(key) {
  currentSection = key;
  const map = {
    dashboard: '#section-dashboard',
    kisiler: '#section-kisiler',
    hayvanlar: '#section-hayvanlar',
    kesim: '#section-kesim'
  };

  Object.values(map).forEach(id => qs(id).classList.add('hidden'));
  qs(map[key]).classList.remove('hidden');

  if (key === 'dashboard') loadDashboard();
  if (key === 'kisiler') loadKisiler();
  if (key === 'hayvanlar') loadHayvanlar();
  if (key === 'kesim') loadKesimPaneli();
}

function openModal(id) { qs(id).classList.remove('hidden'); }
function closeModal(id) { qs(id).classList.add('hidden'); }

function kategoriLabel(cinsiyet, kg) {
  if (!cinsiyet || !kg) return '';
  const cinsiyetText = cinsiyet === 'erkek' ? 'Erkek' : 'Dişi';
  return `${cinsiyetText} ${kg} kg`;
}

function bindModals() {
  qsa('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal('#modal-kisi');
      closeModal('#modal-hayvan');
      closeModal('#modal-hissedar');
      closeModal('#modal-odeme');
    });
  });

  qs('#btn-kisi-modal').addEventListener('click', () => {
    editingKisiId = null;
    qs('#kisi-modal-title').textContent = 'Yeni Kişi';
    qs('#btn-kisi-sil').classList.add('hidden');
    qs('#kisi-ad').value = '';
    qs('#kisi-telefon').value = '';
    qs('#kisi-kategori-cinsiyet').value = '';
    qs('#kisi-kategori-kg').value = '';
    qs('#kisi-kategori-fiyat').value = '';
    qs('#kisi-pesinat').value = 0;
    qs('#kisi-vekalet').value = '0';
    openModal('#modal-kisi');
  });

  qs('#btn-hayvan-modal').addEventListener('click', () => {
    editingHayvanId = null;
    qs('#hayvan-modal-title').textContent = 'Yeni Hayvan';
    qs('#hayvan-kupe').value = '';
    qs('#hayvan-grup').value = 'Küçükbaş';
    qs('#hayvan-hisse').value = 7;
    openModal('#modal-hayvan');
  });

  qs('#btn-kisi-kaydet').addEventListener('click', saveKisi);
  qs('#btn-kisi-sil').addEventListener('click', deleteKisi);
  qs('#btn-hayvan-kaydet').addEventListener('click', saveHayvan);

  qs('.modal-close-odeme').addEventListener('click', () => closeModal('#modal-odeme'));
  qs('#btn-odeme-ekle').addEventListener('click', addOdeme);

  qs('#hissedar-ara').addEventListener('input', () => {
    renderKisiSearch(qs('#hissedar-ara').value);
  });

  const kisilerAra = qs('#kisiler-ara');
  if (kisilerAra) {
    kisilerAra.addEventListener('input', async () => {
      kisilerSearchTerm = kisilerAra.value || '';
      await loadKisiler();
    });
  }

  qs('#btn-kesimi-onayla').addEventListener('click', async () => {
    const hayvanId = qs('#btn-kesimi-onayla').dataset.hayvanId;
    if (!hayvanId) return;
    await fetchJSON(`/api/hayvanlar/${hayvanId}/kesim`, { method: 'POST' });
    await loadKesimPaneli();
    await loadDashboard();
    await loadHayvanlar();
  });

  const btnToplam = qs('#btn-dash-toplam-hissedar');
  const btnKesilen = qs('#btn-dash-kesilen-hissedar');
  const btnOdeme = qs('#btn-dash-odeme-tamam');
  const btnBorclu = qs('#btn-dash-borclu');
  if (btnToplam) btnToplam.addEventListener('click', async () => renderDashboardKisiList('toplam_hissedar', 'Toplam Hissedar'));
  if (btnKesilen) btnKesilen.addEventListener('click', async () => renderDashboardKisiList('kesilen_hissedar', 'Kurbanı Kesilen Hissedar'));
  if (btnOdeme) btnOdeme.addEventListener('click', async () => renderDashboardKisiList('odemesi_tamamlanan', 'Ödemesi Tamamlanan'));
  if (btnBorclu) btnBorclu.addEventListener('click', async () => renderDashboardKisiList('borclu', 'Borçlu Hissedar'));
}

// ------------------------
// Dashboard
// ------------------------
async function loadDashboard() {
  const d = await fetchJSON('/api/dashboard');
  qs('#dash-toplam').textContent = d.toplam_hayvan;
  qs('#dash-kesilen').textContent = d.kesilen;
  qs('#dash-kalan').textContent = d.kalan;

  dashboardHissedarIds = d.hissedar_istatistik?.ids || null;
  if (d.hissedar_istatistik) {
    qs('#dash-toplam-hissedar').textContent = d.hissedar_istatistik.toplam_hissedar;
    qs('#dash-kesilen-hissedar').textContent = d.hissedar_istatistik.kesilen_hissedar;
    qs('#dash-odeme-tamam').textContent = d.hissedar_istatistik.odemesi_tamamlanan;
    qs('#dash-borclu').textContent = d.hissedar_istatistik.borclu;
  }

  await renderDashboardKisiList('toplam_hissedar', 'Toplam Hissedar');
}

async function renderDashboardKisiList(key, title) {
  const tbody = qs('#dash-kisi-list');
  const head = qs('#dash-kisi-list-title');
  if (!tbody || !head) return;

  head.textContent = title;
  tbody.innerHTML = '';

  const ids = dashboardHissedarIds?.[key] || [];
  if (!ids.length) {
    tbody.innerHTML = '<tr><td class="px-3 py-2 text-slate-500" colspan="5">Kayıt yok</td></tr>';
    return;
  }

  const kisiler = await fetchJSON('/api/kisiler');
  const idSet = new Set(ids.map(x => Number(x)));
  const list = kisiler.filter(k => idSet.has(Number(k.kisi_id)));

  list.forEach(k => {
    const toplamOdenenGenel = Number(k.pesinat || 0) + Number(k.toplam_odenen || 0);
    const kalan = k.kalan_borc;
    const katText = kategoriLabel(k.kategori_cinsiyet, k.kategori_kg);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-3 py-2 font-medium">${k.ad_soyad}</td>
      <td class="px-3 py-2">${k.telefon || ''}</td>
      <td class="px-3 py-2">${katText ? `<span class="inline-flex px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700">${katText}</span>` : ''}</td>
      <td class="px-3 py-2 text-right">${money(toplamOdenenGenel)}</td>
      <td class="px-3 py-2 text-right">${k.hisse_sayisi > 0 ? money(kalan) : '<span class="text-slate-500">-</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ------------------------
// Kisiler
// ------------------------
async function loadKisiler() {
  const kisiler = await fetchJSON('/api/kisiler');
  const tbody = qs('#kisiler-tbody');
  tbody.innerHTML = '';

  const t = normTR(kisilerSearchTerm);
  const filtered = !t
    ? kisiler
    : kisiler.filter(k => {
        const ad = normTR(k.ad_soyad);
        const tel = normTR(k.telefon);
        return ad.includes(t) || tel.includes(t);
      });

  filtered.forEach(k => {
    const vekalet = Number(k.vekalet_durumu || 0);
    const badge = vekalet === 1
      ? '<span class="inline-flex px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700">Alındı</span>'
      : '<span class="inline-flex px-2 py-1 text-xs rounded bg-rose-100 text-rose-700">Alınmadı</span>';

    const toplamOdenenGenel = Number(k.toplam_odenen_genel || 0);
    const katFiyat = Number(k.kategori_fiyat || 0);
    const borcText = katFiyat > 0
      ? money(k.kalan_borc)
      : '<span class="text-slate-500">Kategori seçilmedi</span>';

    const katText = kategoriLabel(k.kategori_cinsiyet, k.kategori_kg);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="px-4 py-3 font-medium">${k.ad_soyad}</td>
      <td class="px-4 py-3">${k.telefon || ''}</td>
      <td class="px-4 py-3">${katText ? `<span class="inline-flex px-2 py-1 text-xs rounded bg-indigo-100 text-indigo-700">${katText}</span>` : '<span class="text-slate-400">-</span>'}</td>
      <td class="px-4 py-3 text-right">${katFiyat > 0 ? money(katFiyat) : '<span class="text-slate-400">-</span>'}</td>
      <td class="px-4 py-3 text-right">${money(k.pesinat)}</td>
      <td class="px-4 py-3 text-right">${money(toplamOdenenGenel)}</td>
      <td class="px-4 py-3 text-right">${borcText}</td>
      <td class="px-4 py-3">${badge}</td>
      <td class="px-4 py-3 text-right space-x-1">
        <button class="px-3 py-1 rounded border hover:bg-slate-50" data-edit="${k.kisi_id}">Düzenle</button>
        <button class="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700" data-odeme="${k.kisi_id}">Ödeme</button>
      </td>
    `;

    tr.querySelector('[data-edit]').addEventListener('click', () => openEditKisi(k));
    tr.querySelector('[data-odeme]').addEventListener('click', () => openOdemeModal(k));
    tbody.appendChild(tr);
  });
}

function openEditKisi(k) {
  editingKisiId = k.kisi_id;
  qs('#kisi-modal-title').textContent = 'Kişi Düzenle';
  qs('#btn-kisi-sil').classList.remove('hidden');
  qs('#kisi-ad').value = k.ad_soyad || '';
  qs('#kisi-telefon').value = k.telefon || '';
  qs('#kisi-pesinat').value = Number(k.pesinat || 0);
  qs('#kisi-vekalet').value = String(Number(k.vekalet_durumu || 0));

  qs('#kisi-kategori-cinsiyet').value = k.kategori_cinsiyet || '';
  qs('#kisi-kategori-kg').value = k.kategori_kg || '';
  qs('#kisi-kategori-fiyat').value = Number(k.kategori_fiyat || 0) || '';

  openModal('#modal-kisi');
}

async function saveKisi() {
  const payload = {
    ad_soyad: qs('#kisi-ad').value,
    telefon: qs('#kisi-telefon').value,
    pesinat: Number(qs('#kisi-pesinat').value || 0),
    toplam_odenen: 0,
    vekalet_durumu: Number(qs('#kisi-vekalet').value || 0),
    kategori_cinsiyet: qs('#kisi-kategori-cinsiyet').value || null,
    kategori_kg: qs('#kisi-kategori-kg').value ? Number(qs('#kisi-kategori-kg').value) : null,
    kategori_fiyat: qs('#kisi-kategori-fiyat').value ? Number(qs('#kisi-kategori-fiyat').value) : null,
  };

  if (editingKisiId) {
    await fetchJSON(`/api/kisiler/${editingKisiId}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await fetchJSON('/api/kisiler', { method: 'POST', body: JSON.stringify(payload) });
  }

  closeModal('#modal-kisi');
  kisiCache = await fetchJSON('/api/kisiler');
  await loadKisiler();
  await loadDashboard();
}

async function deleteKisi() {
  if (!editingKisiId) return;
  await fetchJSON(`/api/kisiler/${editingKisiId}`, { method: 'DELETE' });
  closeModal('#modal-kisi');
  editingKisiId = null;
  kisiCache = await fetchJSON('/api/kisiler');
  await loadKisiler();
  await loadDashboard();
  await loadHayvanlar();
}

// ------------------------
// Hayvanlar
// ------------------------
async function loadHayvanlar() {
  const hayvanlar = await fetchJSON('/api/hayvanlar');
  const tbody = qs('#hayvanlar-tbody');
  tbody.innerHTML = '';

  hayvanlar.forEach(h => {
    const tr = document.createElement('tr');
    tr.className = 'cursor-pointer hover:bg-slate-50';
    tr.innerHTML = `
      <td class="px-4 py-3">${h.kesim_sirasi ?? ''}</td>
      <td class="px-4 py-3 text-right">
        <div class="inline-flex gap-2">
          <button class="btn-sira-yukari px-2 py-1 rounded border hover:bg-slate-50" title="Yukarı">↑</button>
          <button class="btn-sira-asagi px-2 py-1 rounded border hover:bg-slate-50" title="Aşağı">↓</button>
        </div>
      </td>
      <td class="px-4 py-3 font-medium">${h.kupe_no}</td>
      <td class="px-4 py-3">${h.grup || ''}</td>
      <td class="px-4 py-3 text-right">${h.hisse_adedi}</td>
      <td class="px-4 py-3 text-right">${h.dolu_hisse}/${h.bos_hisse}</td>
      <td class="px-4 py-3 text-right">
        <button class="btn-hissedar px-3 py-1 rounded border hover:bg-slate-50">Hissedarlar</button>
      </td>
    `;

    tr.addEventListener('click', () => openEditHayvan(h));

    const btnHissedar = tr.querySelector('.btn-hissedar');
    btnHissedar.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await openHissedarModal(h.hayvan_id, h.kupe_no);
    });

    const btnUp = tr.querySelector('.btn-sira-yukari');
    const btnDown = tr.querySelector('.btn-sira-asagi');

    btnUp.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = Number(h.kesim_sirasi || 1);
      const next = Math.max(cur - 1, 1);
      if (next === cur) return;
      await fetchJSON(`/api/hayvanlar/${h.hayvan_id}/sira`, { method: 'PUT', body: JSON.stringify({ kesim_sirasi: next }) });
      await loadHayvanlar();
      await loadDashboard();
    });

    btnDown.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cur = Number(h.kesim_sirasi || 1);
      const next = cur + 1;
      await fetchJSON(`/api/hayvanlar/${h.hayvan_id}/sira`, { method: 'PUT', body: JSON.stringify({ kesim_sirasi: next }) });
      await loadHayvanlar();
      await loadDashboard();
    });

    tbody.appendChild(tr);
  });
}

function openEditHayvan(h) {
  editingHayvanId = h.hayvan_id;
  qs('#hayvan-modal-title').textContent = 'Hayvan Düzenle';
  qs('#hayvan-kupe').value = h.kupe_no || '';
  qs('#hayvan-grup').value = h.grup || 'Küçükbaş';
  qs('#hayvan-hisse').value = Number(h.hisse_adedi || 7);
  openModal('#modal-hayvan');
}

async function saveHayvan() {
  const payload = {
    kupe_no: qs('#hayvan-kupe').value,
    grup: qs('#hayvan-grup').value,
    hisse_adedi: Number(qs('#hayvan-hisse').value || 7),
  };

  if (editingHayvanId) {
    await fetchJSON(`/api/hayvanlar/${editingHayvanId}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await fetchJSON('/api/hayvanlar', { method: 'POST', body: JSON.stringify(payload) });
  }

  closeModal('#modal-hayvan');
  editingHayvanId = null;
  await loadHayvanlar();
  await loadDashboard();
}

// ------------------------
// Hissedar Modal
// ------------------------
let kisiCache = [];
let currentHissedarData = null;

async function openHissedarModal(hayvanId, kupeNo) {
  activeHayvanIdForHissedar = hayvanId;
  qs('#hissedar-title').textContent = `Hissedarlar - ${kupeNo}`;
  qs('#hissedar-ara').value = '';
  qs('#hissedar-ara-sonuc').innerHTML = '';

  currentHissedarData = await fetchJSON(`/api/hayvanlar/${hayvanId}/hissedarlar`);
  kisiCache = await fetchJSON('/api/kisiler');

  renderHissedarList();
  renderKisiSearch('');
  openModal('#modal-hissedar');
}

function renderHissedarList() {
  const box = qs('#hissedar-list');
  box.innerHTML = '';

  const hs = (currentHissedarData?.hissedarlar || []);
  if (hs.length === 0) {
    box.innerHTML = '<div class="text-sm text-slate-500">Henüz hissedar yok</div>';
    return;
  }

  hs.forEach(h => {
    const vek = Number(h.vekalet_durumu || 0);
    const badge = vek === 1
      ? '<span class="inline-flex px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700">Vekalet Alındı</span>'
      : '<span class="inline-flex px-2 py-1 text-xs rounded bg-rose-100 text-rose-700">Vekalet Eksik</span>';

    const toplamOdenenGenel = Number(h.pesinat || 0) + Number(h.toplam_odenen || 0);

    const el = document.createElement('div');
    el.className = 'border rounded p-3 flex items-start justify-between gap-3';
    el.innerHTML = `
      <div>
        <div class="font-semibold">${h.ad_soyad}</div>
        <div class="text-sm text-slate-600">Toplam ödenen: <span class="font-semibold">${money(toplamOdenenGenel)}</span></div>
        <div class="text-sm text-slate-600">Kalan borç: <span class="font-semibold">${money(h.kalan_borc)}</span></div>
        <div class="mt-1">${badge}</div>
      </div>
      <button class="px-3 py-1 rounded border hover:bg-slate-50" data-del="${h.atama_id}">Sil</button>
    `;

    el.querySelector('[data-del]').addEventListener('click', async () => {
      await fetchJSON(`/api/atama/${h.atama_id}`, { method: 'DELETE' });
      currentHissedarData = await fetchJSON(`/api/hayvanlar/${activeHayvanIdForHissedar}/hissedarlar`);
      await loadHayvanlar();
      renderHissedarList();
    });

    box.appendChild(el);
  });
}

function renderKisiSearch(term) {
  const out = qs('#hissedar-ara-sonuc');
  out.innerHTML = '';

  const t = normTR(term);
  const hs = (currentHissedarData?.hissedarlar || []);
  const assignedIds = new Set(hs.map(x => Number(x.kisi_id)));

  const list = kisiCache
    .filter(k => !assignedIds.has(Number(k.kisi_id)))
    .filter(k => !t || normTR(k.ad_soyad).includes(t))
    .slice(0, 20);

  if (list.length === 0) {
    out.innerHTML = '<div class="text-sm text-slate-500">Kayıt bulunamadı</div>';
    return;
  }

  list.forEach(k => {
    const katText = kategoriLabel(k.kategori_cinsiyet, k.kategori_kg);
    const el = document.createElement('div');
    el.className = 'border rounded p-3 flex items-center justify-between gap-3';
    el.innerHTML = `
      <div>
        <div class="font-semibold">${k.ad_soyad}</div>
        <div class="text-xs text-slate-500">${k.telefon || ''} ${katText ? `· ${katText}` : ''}</div>
      </div>
      <button class="px-3 py-1 rounded bg-slate-900 text-white hover:bg-slate-800">Ekle</button>
    `;

    el.querySelector('button').addEventListener('click', async () => {
      await fetchJSON('/api/atama', { method: 'POST', body: JSON.stringify({ hayvan_id: activeHayvanIdForHissedar, kisi_id: k.kisi_id }) });
      currentHissedarData = await fetchJSON(`/api/hayvanlar/${activeHayvanIdForHissedar}/hissedarlar`);
      await loadHayvanlar();
      renderHissedarList();
      renderKisiSearch(qs('#hissedar-ara').value);
    });

    out.appendChild(el);
  });
}

// ------------------------
// Kesim Paneli
// ------------------------
async function loadKesimPaneli() {
  const d = await fetchJSON('/api/dashboard');
  const siradaki = d.siradaki_hayvan;

  const kutu = qs('#kesim-kutu');
  const btn = qs('#btn-kesimi-onayla');
  const uyari = qs('#kesim-uyari');
  const list = qs('#kesim-hissedarlar');

  list.innerHTML = '';

  if (!siradaki) {
    qs('#kesim-kupe').textContent = '-';
    qs('#kesim-grup').textContent = '-';
    uyari.textContent = 'Sırada hayvan yok.';
    kutu.className = 'border rounded-lg p-6 bg-white border-slate-200';
    btn.disabled = true;
    btn.dataset.hayvanId = '';
    return;
  }

  qs('#kesim-kupe').textContent = siradaki.kupe_no;
  qs('#kesim-grup').textContent = siradaki.grup || '-';
  btn.dataset.hayvanId = siradaki.hayvan_id;

  const hissedarData = await fetchJSON(`/api/hayvanlar/${siradaki.hayvan_id}/hissedarlar`);
  const kontrol = await fetchJSON(`/api/hayvanlar/${siradaki.hayvan_id}/kesim_kontrol`);

  (hissedarData.hissedarlar || []).forEach(h => {
    const vek = Number(h.vekalet_durumu || 0);
    const vekText = vek === 1 ? 'Vekalet Alındı' : 'Vekalet Eksik';
    const vekClass = vek === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';

    const toplamOdenenGenel = Number(h.pesinat || 0) + Number(h.toplam_odenen || 0);

    const el = document.createElement('div');
    el.className = 'border rounded-lg p-4 bg-white';
    el.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-lg font-bold">${h.ad_soyad}</div>
          <div class="text-sm text-slate-600">Telefon: <span class="font-semibold">${h.telefon || '-'}</span></div>
        </div>
        <span class="inline-flex px-2 py-1 text-xs rounded ${vekClass}">${vekText}</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
        <div class="bg-slate-50 border rounded p-2">
          <div class="text-slate-500">Peşinat</div>
          <div class="font-semibold">${money(h.pesinat)}</div>
        </div>
        <div class="bg-slate-50 border rounded p-2">
          <div class="text-slate-500">Toplam Ödenen</div>
          <div class="font-semibold">${money(toplamOdenenGenel)}</div>
        </div>
        <div class="bg-slate-50 border rounded p-2">
          <div class="text-slate-500">Kalan Borç</div>
          <div class="font-semibold">${money(h.kalan_borc)}</div>
        </div>
      </div>
    `;
    list.appendChild(el);
  });

  if (!kontrol.kesime_uygun) {
    kutu.className = 'border rounded-lg p-6 bg-rose-50 border-rose-200';
    uyari.textContent = 'Vekalet eksik! Kesime izin verilemez.';
    btn.disabled = true;
  } else {
    kutu.className = 'border rounded-lg p-6 bg-emerald-50 border-emerald-200';
    uyari.textContent = 'Tüm vekaletler tamam. Kesim onaylanabilir.';
    btn.disabled = false;
  }
}

// ------------------------
// Odemeler
// ------------------------
let activeOdemeKisiId = null;
let activeOdemeKisi = null;

async function openOdemeModal(kisi) {
  activeOdemeKisiId = kisi.kisi_id;
  activeOdemeKisi = kisi;
  qs('#odeme-modal-title').textContent = `Ödemeler - ${kisi.ad_soyad}`;
  qs('#odeme-tutar').value = '';
  qs('#odeme-tarih').value = new Date().toISOString().split('T')[0];
  qs('#odeme-aciklama').value = '';
  await loadOdemeler();
  openModal('#modal-odeme');
}

async function loadOdemeler() {
  if (!activeOdemeKisiId) return;

  const odemeler = await fetchJSON(`/api/kisiler/${activeOdemeKisiId}/odemeler`);
  const kisi = activeOdemeKisi;

  const pesinat = Number(kisi.pesinat || 0);
  const kategori_fiyat = Number(kisi.kategori_fiyat || 0);
  const odemelerToplam = odemeler.reduce((sum, o) => sum + Number(o.tutar || 0), 0);
  const toplamOdenen = pesinat + odemelerToplam;
  const kalanBorc = kategori_fiyat > 0 ? kategori_fiyat - toplamOdenen : 0;

  const ozet = qs('#odeme-ozet');
  ozet.innerHTML = `
    <div class="flex justify-between"><span class="text-slate-600">Kategori Fiyat:</span><span class="font-semibold">${kategori_fiyat > 0 ? money(kategori_fiyat) : '-'}</span></div>
    <div class="flex justify-between"><span class="text-slate-600">Peşinat:</span><span class="font-semibold">${money(pesinat)}</span></div>
    <div class="flex justify-between"><span class="text-slate-600">Ödemeler Toplamı:</span><span class="font-semibold">${money(odemelerToplam)}</span></div>
    <div class="flex justify-between border-t pt-1"><span class="text-slate-600 font-semibold">Toplam Ödenen:</span><span class="font-bold text-emerald-700">${money(toplamOdenen)}</span></div>
    <div class="flex justify-between"><span class="text-slate-600 font-semibold">Kalan Borç:</span><span class="font-bold ${kalanBorc > 0 ? 'text-rose-600' : 'text-emerald-700'}">${kategori_fiyat > 0 ? money(kalanBorc) : '-'}</span></div>
  `;

  const list = qs('#odeme-list');
  if (odemeler.length === 0) {
    list.innerHTML = '<div class="text-sm text-slate-500">Henüz ödeme yapılmamış</div>';
    return;
  }

  list.innerHTML = '';
  odemeler.forEach(o => {
    const el = document.createElement('div');
    el.className = 'border rounded p-2 flex items-center justify-between';
    el.innerHTML = `
      <div>
        <span class="font-semibold text-emerald-700">${money(o.tutar)}</span>
        <span class="text-xs text-slate-500 ml-2">${o.tarih || ''}</span>
        ${o.aciklama ? `<span class="text-xs text-slate-400 ml-2">· ${o.aciklama}</span>` : ''}
      </div>
      <button class="px-2 py-1 text-xs rounded border text-rose-600 hover:bg-rose-50" data-del-odeme="${o.odeme_id}">Sil</button>
    `;
    el.querySelector('[data-del-odeme]').addEventListener('click', async () => {
      await fetchJSON(`/api/odemeler/${o.odeme_id}`, { method: 'DELETE' });
      kisiCache = await fetchJSON('/api/kisiler');
      activeOdemeKisi = kisiCache.find(k => k.kisi_id === activeOdemeKisiId) || activeOdemeKisi;
      await loadOdemeler();
      await loadKisiler();
      await loadDashboard();
    });
    list.appendChild(el);
  });
}

async function addOdeme() {
  if (!activeOdemeKisiId) return;
  const tutar = Number(qs('#odeme-tutar').value || 0);
  if (tutar <= 0) return;

  const payload = {
    tutar,
    tarih: qs('#odeme-tarih').value || null,
    aciklama: qs('#odeme-aciklama').value || null,
  };

  await fetchJSON(`/api/kisiler/${activeOdemeKisiId}/odemeler`, { method: 'POST', body: JSON.stringify(payload) });

  qs('#odeme-tutar').value = '';
  qs('#odeme-aciklama').value = '';

  kisiCache = await fetchJSON('/api/kisiler');
  activeOdemeKisi = kisiCache.find(k => k.kisi_id === activeOdemeKisiId) || activeOdemeKisi;
  await loadOdemeler();
  await loadKisiler();
  await loadDashboard();
}

// ------------------------
// Init
// ------------------------
function initNav() {
  qsa('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.target));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  bindModals();
  showSection('dashboard');
});

// Expose for debugging if needed
window.loadDashboard = loadDashboard;
window.loadKisiler = loadKisiler;
window.loadHayvanlar = loadHayvanlar;
window.loadKesimPaneli = loadKesimPaneli;
