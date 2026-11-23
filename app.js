'use strict';

/* ---------- utilitas ---------- */
const bersih = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = s => bersih(s).toLowerCase();
const $ = s => document.querySelector(s);
const rp = n => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
const hari = t => new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hariIni = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

const bulanIni = () => {
  const [y, m] = hariIni().split('-');
  return [`${y}-${m}-01`, `${y}-${m}-${String(new Date(+y, +m, 0).getDate()).padStart(2, '0')}`];
};

let toastTimer;
function toast(teks) {
  const t = $('#toast');
  t.textContent = teks; t.classList.add('tampil');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('tampil'), 3000);
}
function konfirmasi(teks, oke = 'Hapus') {
  return new Promise(res => {
    const d = $('#dlg');
    $('#dlgTeks').textContent = teks; $('#dlgOk').textContent = oke; d.returnValue = '';
    d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}
function unduh(isi, nama, tipe) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([isi], { type: tipe }));
  a.download = nama; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =====================================================================
   PENYIMPANAN KE FILE (aplikasi desktop)
   Tiap ada perubahan data, seluruh data juga ditulis ke
   Dokumen\Rexel Game\data-rexel.json, jadi tidak bergantung pada penyimpanan
   internal Chromium. Dibuka di browser biasa: hanya localStorage.
   ===================================================================== */
let sinkronAktif = false, dataFile = null;
const sinkron = () => { if (sinkronAktif) simpanKeFile(); };
function isiBackup() {
  const isi = { aplikasi: 'rexel-game', versi: 1, tanggal: new Date().toISOString(), data: {} };
  modul.forEach(m => isi.data[m.cfg.id] = m.ambil());
  return isi;
}
function setStatus(teks, galat) {
  const el = $('#statusSimpan'); el.textContent = teks; el.classList.toggle('galat', !!galat);
}
async function simpanKeFile() {
  if (!window.rexelApi || !window.rexelApi.simpanData) {
    return setStatus('Mode browser: data hanya tersimpan di browser ini. Pakai aplikasi desktop, atau klik Backup data secara berkala.');
  }
  try {
    const h = await window.rexelApi.simpanData(isiBackup());
    if (h && h.ok) setStatus(`Tersimpan otomatis ke file: ${h.lokasi} · ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`);
    else setStatus(`GAGAL menyimpan ke file (${h && h.galat ? h.galat : 'sebab tidak diketahui'}). Data masih ada di aplikasi, segera klik Backup data.`, true);
  } catch (e) { setStatus(`GAGAL menyimpan ke file (${e.message}). Segera klik Backup data.`, true); }
}

/* =====================================================================
   AKUN & LOGIN (Admin / Karyawan)
   - Password disimpan sebagai hash PBKDF2-SHA256 + salt, tidak pernah polos.
   - Password bawaan bisa diganti lewat menu Pengaturan.
   - Aplikasi desktop: password yang diganti disimpan di Dokumen\Rexel Game\akun-rexel.json.
     Hapus file itu untuk mengembalikan semua password ke bawaan.
   - Simpan password: aplikasi desktop memakai enkripsi Windows (safeStorage),
     browser biasa memakai localStorage (tidak terenkripsi).
   ===================================================================== */
const SES = 'rexel_sesi', LS_CRED = 'rexel_cred', LS_AKUN = 'akun_rexel', ITER = 100000;
const jembatan = window.rexelApi; // dari preload.js, undefined bila dibuka di browser
const PERAN = { admin: 'Admin', karyawan: 'Karyawan' };
const AKUN = new Map([
  ['rexelgame', { nama: 'Admin', peran: 'admin', iter: 100000, salt: '89ee0c4370d83241cf12ac592e699033', hash: 'e899cee6a9cf81c92fd48720a86f091bf373987de68e04eddb69ddd16ecd4548' }],
  ['azmirexel', { nama: 'Azmi', peran: 'karyawan', iter: 100000, salt: '19d9d7b82f4ec1af9701ea0f91e23312', hash: 'c16bcc69183e2c6760a6217b9d311d9190c01491eceea6e94da703b2dfb61fff' }],
  ['revanrexel', { nama: 'Revan', peran: 'karyawan', iter: 100000, salt: 'a9ed663de394be5f149152f0a2a158f7', hash: '213cc6c462983125ec78b74962ee41612378de3ba61f0a0915108c7daa50c938' }]
]);
let overrideAkun = {}, pengguna = null, gagal = 0, terkunciSampai = 0, kredTersimpan = null, sandiTersimpan = false;
const adalahAdmin = () => !!pengguna && pengguna.peran === 'admin';

const keHex = buf => [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
const dariHex = h => Uint8Array.from(h.match(/../g) || [], x => parseInt(x, 16));
async function turunkan(pw, saltHex, iter) {
  const kunci = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return keHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: dariHex(saltHex), iterations: iter }, kunci, 256));
}
function akun(u) {
  const k = norm(u), b = AKUN.get(k);
  if (!b) return null;
  const o = overrideAkun[k] || b;
  return { user: k, nama: b.nama, peran: b.peran, salt: o.salt, iter: o.iter, hash: o.hash };
}
function rapikanAkun(o) {
  const hasil = {};
  if (!o || typeof o !== 'object') return hasil;
  for (const k of AKUN.keys()) {
    const x = o[k];
    if (x && /^[0-9a-f]+$/.test(x.salt || '') && /^[0-9a-f]+$/.test(x.hash || '') && Number.isInteger(x.iter) && x.iter >= 1000) hasil[k] = { salt: x.salt, iter: x.iter, hash: x.hash };
  }
  return hasil;
}
async function muatAkun() {
  try {
    if (jembatan && jembatan.muatAkun) { const h = await jembatan.muatAkun(); return rapikanAkun(h && h.ada && h.isi && h.isi.akun); }
    return rapikanAkun(JSON.parse(localStorage.getItem(LS_AKUN) || '{}'));
  } catch { return {}; }
}
async function simpanAkunKeDisk() {
  const isi = { aplikasi: 'rexel-game-akun', versi: 1, akun: overrideAkun };
  if (jembatan && jembatan.simpanAkun) { const h = await jembatan.simpanAkun(isi); return !!(h && h.ok); }
  localStorage.setItem(LS_AKUN, JSON.stringify(overrideAkun)); return true;
}
async function aturPassword(user, baru) {
  const k = norm(user), lama = overrideAkun[k], salt = keHex(crypto.getRandomValues(new Uint8Array(16)));
  overrideAkun[k] = { salt, iter: ITER, hash: await turunkan(baru, salt, ITER) };
  let ok = false;
  try { ok = await simpanAkunKeDisk(); } catch { ok = false; }
  if (!ok) { if (lama) overrideAkun[k] = lama; else delete overrideAkun[k]; throw new Error('Gagal menyimpan password ke file. Password tidak berubah.'); }
  const c = await cred.ambil();
  if (c && norm(c.u) === k) await cred.simpan(k, baru); // perbarui password tersimpan
}

const cred = {
  async ambil() {
    try {
      if (jembatan) { const c = await jembatan.ambilCred(); if (c) return c; }
      const r = localStorage.getItem(LS_CRED);
      return r ? JSON.parse(atob(r)) : null;
    } catch { return null; }
  },
  async simpan(u, p) {
    try {
      if (jembatan && await jembatan.simpanCred({ u, p })) return;
      localStorage.setItem(LS_CRED, btoa(JSON.stringify({ u, p })));
    } catch { /* abaikan */ }
  },
  async hapus() {
    try { if (jembatan) await jembatan.hapusCred(); localStorage.removeItem(LS_CRED); } catch { /* abaikan */ }
  }
};

function galat(teks) { $('#lErr').textContent = teks; }
const peranDipilih = () => document.querySelector('input[name="peran"]:checked').value;
function resetLihat() { $('#lPass').type = 'password'; $('#lLihat').textContent = 'Tampilkan'; $('#lLihat').setAttribute('aria-pressed', 'false'); }
function isiLoginDariTersimpan() {
  const a = kredTersimpan && akun(kredTersimpan.u);
  if (a && a.peran === peranDipilih()) {
    $('#lUser').value = a.user; $('#lPass').value = kredTersimpan.p; $('#lIngat').checked = true; sandiTersimpan = true;
  } else {
    $('#lUser').value = ''; $('#lPass').value = ''; $('#lIngat').checked = false; sandiTersimpan = false;
  }
  $('#lLihat').disabled = sandiTersimpan; resetLihat(); // password tersimpan tidak bisa diintip
  $('#lPeringatan').classList.toggle('hidden', peranDipilih() !== 'admin');
}
async function siapkanLogin() {
  kredTersimpan = await cred.ambil();
  const a = kredTersimpan && akun(kredTersimpan.u);
  document.querySelector(`input[name="peran"][value="${a ? a.peran : 'karyawan'}"]`).checked = true;
  isiLoginDariTersimpan(); galat('');
  $('#login').classList.remove('hidden'); $('#app').classList.add('hidden');
  (sandiTersimpan ? $('#lMasuk') : $('#lUser')).focus();
}
document.querySelectorAll('input[name="peran"]').forEach(r => r.onchange = () => { isiLoginDariTersimpan(); galat(''); });
$('#lPass').oninput = () => { if (sandiTersimpan) { sandiTersimpan = false; $('#lLihat').disabled = false; } };

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const sisa = Math.ceil((terkunciSampai - Date.now()) / 1000);
  if (sisa > 0) return galat(`Terlalu banyak percobaan salah. Coba lagi ${sisa} detik lagi.`);
  const a = akun($('#lUser').value), p = $('#lPass').value, pilih = peranDipilih();
  let ok = false;
  try { ok = !!a && await turunkan(p, a.salt, a.iter) === a.hash; }
  catch { return galat('Browser ini tidak bisa memverifikasi password. Buka lewat aplikasi desktop atau localhost.'); }
  if (!ok) {
    if (++gagal >= 5) { gagal = 0; terkunciSampai = Date.now() + 30000; return galat('Terlalu banyak percobaan salah. Tunggu 30 detik.'); }
    $('#lPass').select(); return galat('Username atau password salah. Periksa huruf besar/kecil pada password.');
  }
  if (a.peran !== pilih) return galat(`Akun ini terdaftar sebagai ${PERAN[a.peran]}. Pilih “${PERAN[a.peran]}” pada Login sebagai.`);
  gagal = 0;
  if ($('#lIngat').checked) await cred.simpan(a.user, p); else await cred.hapus();
  pengguna = a; sessionStorage.setItem(SES, a.user);
  bukaApp();
};
$('#lLihat').onclick = e => {
  const tampil = $('#lPass').type === 'password';
  $('#lPass').type = tampil ? 'text' : 'password';
  e.target.textContent = tampil ? 'Sembunyikan' : 'Tampilkan';
  e.target.setAttribute('aria-pressed', tampil);
};
$('#bKeluar').onclick = () => { pengguna = null; sessionStorage.removeItem(SES); siapkanLogin(); };

/* =====================================================================
   MODUL DATA (dipakai bersama oleh Kasir Barang dan Isi Game & Service)
   ===================================================================== */
const MODUL = [
  {
    id: 'kasir', judul: 'Kasir Barang', key: 'kasir_rexel',
    formJudul: 'Input penjualan', label: 'Nama Barang', ph: 'Ketik / pilih barang',
    ket: ['Transfer', 'Tunai', 'QRIS'], berkas: 'penjualan-rexel', kosong: 'Belum ada transaksi.',
    saran: () => [] // diisi dari data stok saat aplikasi dibuka
  },
  {
    id: 'game', judul: 'Isi Game & Service', key: 'dataIsiGameRexel',
    formJudul: 'Input isi game & service', label: 'Isi Game dan Service', ph: 'Contoh: Isi game GTA V PS4 / Service stik PS4',
    ket: ['Cash', 'Transfer', 'QRIS'], berkas: 'data-isi-game-rexel', kosong: 'Belum ada data.',
    saran: () => []
  }
];

// Terima format lama (tanggal/item) maupun format baru (tgl/nama)
const rapikan = (arr, awalId = 0) => (Array.isArray(arr) ? arr : []).map((d, i) => ({
  id: +d.id || Date.now() + awalId + i,
  tgl: String(d.tgl || d.tanggal || ''),
  nama: String(d.nama ?? d.item ?? ''),
  harga: +d.harga || 0,
  qty: +d.qty || 1,
  ket: String(d.ket || '')
})).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d.tgl) && d.nama);

/* ---------- Impor CSV ---------- */
const BULAN = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
function parseTgl(s) {
  s = String(s).trim();
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) { const i = BULAN.indexOf(m[2].toLowerCase()); if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}
const angka = v => +String(v ?? '').replace(/[^\d]/g, '') || 0;
function parseCsv(teks) {
  teks = teks.replace(/^\uFEFF/, '');
  const h1 = teks.split(/\r?\n/, 1)[0];
  const sep = (h1.match(/;/g) || []).length >= (h1.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (q) { if (c === '"') { if (teks[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && teks[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

function buatModul(cfg) {
  let data = [], editId = null;
  try { data = rapikan(JSON.parse(localStorage.getItem(cfg.key) || '[]')); } catch { data = []; }
  let onUbah = null;
  const simpan = () => { localStorage.setItem(cfg.key, JSON.stringify(data)); if (onUbah) onUbah(); sinkron(); };

  const root = document.createElement('div');
  root.className = 'modul hidden'; root.id = 'p-' + cfg.id;
  root.setAttribute('role', 'tabpanel'); root.setAttribute('aria-labelledby', 'tab-' + cfg.id);
  const opsi = cfg.ket.map(k => `<option>${k}</option>`).join('');
  root.innerHTML = `
  <section class="panel noprint">
    <h2 data-r="formJudul">${cfg.formJudul}</h2>
    <form class="form" data-r="form">
      <label>Hari / Tanggal<input type="date" name="tgl" required></label>
      <label class="lebar">${cfg.label}<input name="nama" list="dl-${cfg.id}" placeholder="${cfg.ph}" autocomplete="off" required>${cfg.infoStok ? '<small class="info" data-r="infoStok"></small>' : ''}</label>
      <datalist id="dl-${cfg.id}"></datalist>
      <label>Harga Jual (Rp)<input type="number" name="harga" min="0" required></label>
      <label>Qty<input type="number" name="qty" min="1" value="1" required></label>
      <label>Keterangan<select name="ket">${opsi}</select></label>
      <label>Jumlah<input name="jumlah" readonly value="Rp 0"></label>
      <div class="aksi">
        <button type="submit" data-r="simpan">Simpan</button>
        <button type="button" class="ghost hidden" data-r="batal">Batal edit</button>
      </div>
    </form>
  </section>
  <section class="cards" data-r="cards"></section>
  <section class="panel">
    <h2>Daftar Data <span class="rentang" data-r="rentang"></span></h2>
    <div class="toolbar noprint">
      <label>Cari<input name="cari" type="search" placeholder="Cari ${cfg.label.toLowerCase()}…"></label>
      <label>Dari tanggal<input type="date" name="dari"></label>
      <label>Sampai tanggal<input type="date" name="sampai"></label>
      <label>Keterangan<select name="fket"><option value="">Semua</option>${opsi}</select></label>
    </div>
    <div class="toolbar noprint">
      <button type="button" data-r="bHari">Hari ini</button>
      <button type="button" data-r="bBulan">Bulan ini</button>
      <button type="button" data-r="bSemua">Semua tanggal</button>
      <button type="button" data-r="csv">Ekspor CSV</button>
      <button type="button" data-r="impor" class="hanya-admin hidden">Impor CSV</button>
      <input type="file" data-r="fImpor" accept=".csv,text/csv" class="hidden">
      <button type="button" data-r="cetak">Cetak</button>
      <button type="button" data-r="hapusSemua" class="ghost danger hanya-admin hidden">Hapus semua</button>
    </div>
    <div class="scroll"><table>
      <thead><tr><th>No</th><th>Hari / Tanggal</th><th>${cfg.label}</th><th>Harga Jual</th><th>Qty</th><th>Keterangan</th><th>Jumlah</th><th class="noprint"></th></tr></thead>
      <tbody data-r="tbody"></tbody>
    </table></div>
    <div class="total" data-r="total"></div>
  </section>`;

  const r = n => root.querySelector(`[data-r="${n}"]`);
  const f = n => root.querySelector(`[name="${n}"]`);

  const hitung = () => f('jumlah').value = rp((+f('harga').value || 0) * (+f('qty').value || 0));
  const perbaruiInfo = () => { // sisa stok barang yang sedang diketik (hanya tab Kasir)
    const el = r('infoStok'); if (!el) return;
    const i = cfg.infoStok(f('nama').value, +f('qty').value || 0, editId ? data.find(x => x.id === editId) : null);
    el.textContent = i ? i.teks : ''; el.className = 'info ' + (i ? i.kelas : '');
  };
  const rentang = () => {
    let d1 = f('dari').value, d2 = f('sampai').value;
    if (d1 && d2 && d1 > d2) [d1, d2] = [d2, d1];
    return [d1, d2];
  };
  const saring = () => {
    const q = f('cari').value.toLowerCase(), k = f('fket').value, [d1, d2] = rentang();
    return data.filter(d => d.nama.toLowerCase().includes(q) && (!d1 || d.tgl >= d1) && (!d2 || d.tgl <= d2) && (!k || d.ket === k))
      .sort((a, b) => a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : b.id - a.id);
  };

  function render() {
    const list = saring(), [d1, d2] = rentang();
    r('rentang').textContent = (d1 || d2 ? `(${d1 ? hari(d1) : 'awal'} s/d ${d2 ? hari(d2) : 'akhir'})` : '(Semua tanggal)') + ` · menampilkan ${list.length} dari ${data.length} data`;
    const sum = fn => list.filter(fn).reduce((s, d) => s + d.harga * d.qty, 0);
    r('cards').innerHTML = [
      ['Total penjualan', rp(sum(() => true))], ['Jumlah transaksi', list.length],
      ['Total qty', list.reduce((s, d) => s + d.qty, 0)],
      ...cfg.ket.map(k => ['Via ' + k, rp(sum(d => d.ket === k))])
    ].map(c => `<div class="card"><span>${c[0]}</span><b>${c[1]}</b></div>`).join('');
    r('tbody').innerHTML = list.map((d, i) => `<tr><td>${i + 1}</td><td>${hari(d.tgl)}</td><td class="nama">${esc(d.nama)}</td>
      <td>${rp(d.harga)}</td><td>${d.qty}</td><td><span class="badge k-${esc(d.ket.toLowerCase())}">${esc(d.ket)}</span></td>
      <td><b>${rp(d.harga * d.qty)}</b></td>
      <td class="act noprint">${adalahAdmin() ? `<button type="button" data-act="ubah" data-id="${d.id}">Edit</button><button type="button" class="ghost danger" data-act="hapus" data-id="${d.id}">Hapus</button>` : '<small class="mut">Hanya admin</small>'}</td></tr>`).join('')
      || `<tr><td colspan="8" class="kosong">${cfg.kosong}</td></tr>`;
    r('total').innerHTML = `Total: <b>${rp(sum(() => true))}</b>`;
    perbaruiInfo();
    const nama = [...new Set([...cfg.saran(), ...data.map(d => d.nama)])].sort();
    root.querySelector('datalist').innerHTML = nama.map(n => `<option value="${esc(n)}">`).join('');
  }

  function reset() {
    editId = null; r('form').reset(); f('tgl').value = hariIni();
    r('formJudul').textContent = cfg.formJudul; r('simpan').textContent = 'Simpan'; r('batal').classList.add('hidden');
    hitung(); perbaruiInfo();
  }

  r('form').onsubmit = e => {
    e.preventDefault();
    const rec = { tgl: f('tgl').value, nama: f('nama').value.trim(), harga: +f('harga').value, qty: +f('qty').value, ket: f('ket').value };
    if (!rec.nama) return toast(cfg.label + ' wajib diisi.');
    if (editId) Object.assign(data.find(x => x.id === editId), rec); else data.push({ id: Date.now(), ...rec });
    simpan(); reset(); render();
    toast('Data tersimpan.');
  };
  r('batal').onclick = reset;
  f('harga').oninput = hitung;
  f('qty').oninput = () => { hitung(); perbaruiInfo(); };
  f('nama').oninput = perbaruiInfo;
  f('nama').onchange = () => { // isi otomatis harga dari transaksi terakhir dengan nama yang sama
    const p = [...data].reverse().find(d => d.nama.toLowerCase() === f('nama').value.trim().toLowerCase());
    if (p && !f('harga').value) { f('harga').value = p.harga; hitung(); }
    perbaruiInfo();
  };
  ['cari', 'dari', 'sampai', 'fket'].forEach(n => f(n).oninput = render);

  r('tbody').onclick = async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    if (!adalahAdmin()) return toast('Hanya admin yang bisa mengedit atau menghapus transaksi.');
    const id = +b.dataset.id, d = data.find(x => x.id === id); if (!d) return;
    if (b.dataset.act === 'ubah') {
      editId = id;
      f('tgl').value = d.tgl; f('nama').value = d.nama; f('harga').value = d.harga; f('qty').value = d.qty; f('ket').value = d.ket;
      r('formJudul').textContent = 'Edit data'; r('simpan').textContent = 'Simpan perubahan'; r('batal').classList.remove('hidden');
      hitung(); perbaruiInfo(); scrollTo(0, 0); f('nama').focus();
    } else if (await konfirmasi('Hapus data ini?')) {
      data = data.filter(x => x.id !== id); if (editId === id) reset(); simpan(); render();
    }
  };

  const setRentang = (a, b) => { f('dari').value = a; f('sampai').value = b; render(); };
  r('bHari').onclick = () => setRentang(hariIni(), hariIni());
  r('bBulan').onclick = () => {
    const [y, m] = hariIni().split('-'), akhir = new Date(+y, +m, 0).getDate();
    setRentang(`${y}-${m}-01`, `${y}-${m}-${String(akhir).padStart(2, '0')}`);
  };
  r('bSemua').onclick = () => setRentang('', '');
  r('cetak').onclick = () => print();
  r('hapusSemua').onclick = async () => {
    if (!adalahAdmin()) return;
    if (!data.length) return toast('Belum ada data.');
    if (await konfirmasi(`Hapus SEMUA data ${cfg.judul}? Tindakan ini tidak bisa dibatalkan.`, 'Hapus semua')) { data = []; simpan(); render(); }
  };
  function impor(teks) {
    const rows = parseCsv(teks);
    if (rows.length < 2) throw new Error('File CSV kosong.');
    const h = rows[0].map(x => x.trim().toLowerCase());
    const kol = {
      tgl: h.findIndex(x => /tanggal|hari/.test(x)), nama: h.findIndex(x => /nama|isi game|barang|service/.test(x)),
      harga: h.findIndex(x => /harga/.test(x)), qty: h.findIndex(x => x === 'qty'), ket: h.findIndex(x => /keterangan/.test(x))
    };
    if (Object.values(kol).some(i => i < 0)) throw new Error('Kolom CSV tidak dikenali. Pakai file hasil Ekspor CSV.');
    const normKet = v => {
      const s = String(v || '').trim().toLowerCase(), sin = s === 'cash' || s === 'tunai' ? ['cash', 'tunai'] : [s];
      return cfg.ket.find(k => sin.includes(k.toLowerCase())) || '';
    };
    const baru = []; let lewati = 0;
    for (const b of rows.slice(1)) {
      if (b.some(x => x.trim().toUpperCase() === 'TOTAL')) continue;
      const d = {
        tgl: parseTgl(b[kol.tgl]), nama: String(b[kol.nama] || '').trim().replace(/^'(?=[=+\-@])/, ''),
        harga: angka(b[kol.harga]), qty: angka(b[kol.qty]), ket: normKet(b[kol.ket])
      };
      if (!d.tgl || !d.nama || !d.qty || !d.ket) { lewati++; continue; }
      baru.push(d);
    }
    // Baris identik boleh ada lebih dari satu, tapi impor ulang file yang sama tidak menggandakan data
    const kunci = d => [d.tgl, d.nama.toLowerCase(), d.harga, d.qty, d.ket].join('|');
    const ada = {}; data.forEach(d => ada[kunci(d)] = (ada[kunci(d)] || 0) + 1);
    let tambah = 0, ganda = 0, id = Date.now();
    for (const d of baru) {
      const k = kunci(d);
      if (ada[k] > 0) { ada[k]--; ganda++; } else { data.push({ id: id++, ...d }); tambah++; }
    }
    simpan(); render();
    return { tambah, ganda, lewati };
  }
  r('impor').onclick = () => r('fImpor').click();
  r('fImpor').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const h = impor(await file.text());
      setRentang('', '');
      toast(`${h.tambah} data diimpor` + (h.ganda ? `, ${h.ganda} sudah ada` : '') + (h.lewati ? `, ${h.lewati} baris dilewati` : '') + '.');
    } catch (err) { toast(err.message || 'File CSV tidak bisa dibaca.'); }
  };
  r('csv').onclick = () => {
    const list = saring();
    if (!list.length) return toast('Tidak ada data untuk diekspor.');
    const q = v => typeof v === 'number' ? v : '"' + (/^[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"';
    const baris = [['No', 'Hari/Tanggal', cfg.label, 'Harga Jual', 'Qty', 'Keterangan', 'Jumlah']];
    list.forEach((d, i) => baris.push([i + 1, hari(d.tgl), d.nama, d.harga, d.qty, d.ket, d.harga * d.qty]));
    baris.push(['', '', '', '', '', 'TOTAL', list.reduce((s, d) => s + d.harga * d.qty, 0)]);
    unduh('\uFEFF' + baris.map(b => b.map(q).join(';')).join('\r\n'), `${cfg.berkas}-${hariIni()}.csv`, 'text/csv;charset=utf-8');
  };

  reset(); setRentang(...bulanIni());
  return {
    cfg, root,
    ambil: () => data,
    segarkan: render,
    terapkanPeran() { reset(); render(); }, // render ulang: tombol Edit/Hapus hanya untuk admin
    set onUbah(fn) { onUbah = fn; },
    gabung(arr) { // tambahkan data baru tanpa menimpa yang sudah ada
      const ada = new Set(data.map(d => d.id));
      const baru = rapikan(arr).filter(d => !ada.has(d.id));
      data.push(...baru); simpan(); render(); return baru.length;
    }
  };
}


/* =====================================================================
   STOK BARANG
   Stok akhir = stok awal + stok masuk (diinput manual) - barang keluar.
   Barang keluar dihitung OTOMATIS dari penjualan di tab Kasir Barang.
   ===================================================================== */
const LS_STOK = 'stok_rexel', BATAS_TIPIS = 3, TGL_OK = /^\d{4}-\d{2}-\d{2}$/;

function muatStok() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LS_STOK)); } catch { s = null; }
  if (!s || !Array.isArray(s.barang)) s = typeof STOK_AWAL !== 'undefined' ? JSON.parse(JSON.stringify(STOK_AWAL)) : {};
  const barang = [], ada = new Set();
  for (const b of Array.isArray(s.barang) ? s.barang : []) {
    const nama = bersih(b.nama), n = norm(nama);
    if (!nama || ada.has(n)) continue;
    ada.add(n);
    barang.push({ nama, awal: Math.trunc(+b.awal) || 0, alias: (Array.isArray(b.alias) ? b.alias : []).map(norm).filter(a => a && a !== n) });
  }
  const masuk = [];
  (Array.isArray(s.masuk) ? s.masuk : []).forEach((m, i) => {
    const b = barang.find(x => norm(x.nama) === norm(m.nama)), qty = Math.trunc(+m.qty) || 0;
    if (b && qty && TGL_OK.test(String(m.tgl))) masuk.push({ id: +m.id || Date.now() + i, tgl: String(m.tgl), nama: b.nama, qty, cat: String(m.cat || '') });
  });
  return { mulai: TGL_OK.test(String(s.mulai)) ? s.mulai : hariIni(), barang, masuk, abaikan: (Array.isArray(s.abaikan) ? s.abaikan : []).map(norm) };
}

function buatStok(ambilJual) {
  const cfg = { id: 'stok', judul: 'Stok Barang' };
  let st = muatStok(), takSaatIni = [];
  const simpan = () => { localStorage.setItem(LS_STOK, JSON.stringify(st)); sinkron(); };

  const buatPeta = () => {
    const m = new Map();
    st.barang.forEach(b => m.set(norm(b.nama), b));
    st.barang.forEach(b => b.alias.forEach(a => { if (!m.has(a)) m.set(a, b); }));
    return m;
  };
  const cari = (nama, peta = buatPeta()) => peta.get(norm(nama));

  // Hitung stok untuk rentang tanggal d1..d2 (kosong = dari awal / sampai terakhir)
  function hitung(d1, d2) {
    const dari = d1 && d1 > st.mulai ? d1 : st.mulai, peta = buatPeta();
    const baris = new Map(st.barang.map(b => [b, { b, awalP: b.awal, masuk: 0, keluar: 0 }]));
    const taruh = (b, tgl, qty, jenis) => {
      const x = baris.get(b);
      if (!x || tgl < st.mulai) return;
      if (tgl < dari) x.awalP += jenis === 'masuk' ? qty : -qty;
      else if (!d2 || tgl <= d2) x[jenis] += qty;
    };
    st.masuk.forEach(m => taruh(peta.get(norm(m.nama)), m.tgl, m.qty, 'masuk'));
    const tak = new Map();
    ambilJual().forEach(j => {
      const b = cari(j.nama, peta), n = norm(j.nama);
      if (b) taruh(b, j.tgl, j.qty, 'keluar');
      else if (j.tgl >= st.mulai && !st.abaikan.includes(n)) {
        const t = tak.get(n) || { n, nama: bersih(j.nama), qty: 0 };
        t.qty += j.qty; tak.set(n, t);
      }
    });
    return { rows: [...baris.values()].map(x => ({ ...x, akhir: x.awalP + x.masuk - x.keluar })), tak: [...tak.values()] };
  }

  const root = document.createElement('div');
  root.className = 'modul hidden'; root.id = 'p-stok';
  root.setAttribute('role', 'tabpanel'); root.setAttribute('aria-labelledby', 'tab-stok');
  root.innerHTML = `
  <section class="panel noprint">
    <h2>Input stok masuk</h2>
    <form class="form" data-r="formMasuk">
      <label>Hari / Tanggal<input type="date" name="mTgl" required></label>
      <label class="lebar">Nama Barang<select name="mNama" required></select></label>
      <label>Jumlah masuk<input type="number" name="mQty" step="1" required></label>
      <label class="lebar">Catatan (boleh kosong)<input name="mCat" placeholder="Contoh: beli dari supplier"></label>
      <div class="aksi"><button type="submit">Simpan stok masuk</button></div>
    </form>
    <p class="mut kecil">Barang keluar tidak perlu diinput: stok otomatis berkurang saat penjualan dicatat di tab Kasir Barang.
      Untuk koreksi (rusak, hilang, salah hitung), isi jumlah dengan angka minus.</p>
    <details class="tambah">
      <summary>Tambah barang baru</summary>
      <form class="form" data-r="formBarang">
        <label class="lebar">Nama barang<input name="bNama" autocomplete="off" required></label>
        <label>Jumlah stok saat ini<input type="number" name="bQty" min="0" step="1" value="0" required></label>
        <div class="aksi"><button type="submit">Tambah barang</button></div>
      </form>
    </details>
  </section>
  <section class="panel peringatan noprint hidden" data-r="tak"></section>
  <section class="cards" data-r="cards"></section>
  <section class="panel">
    <h2>Daftar Stok <span class="rentang" data-r="rentang"></span></h2>
    <div class="toolbar noprint">
      <label>Cari<input name="cari" type="search" placeholder="Cari nama barang…"></label>
      <label>Dari tanggal<input type="date" name="dari"></label>
      <label>Sampai tanggal<input type="date" name="sampai"></label>
    </div>
    <div class="toolbar noprint">
      <button type="button" data-r="bHari">Hari ini</button>
      <button type="button" data-r="bBulan">Bulan ini</button>
      <button type="button" data-r="bSemua">Semua tanggal</button>
      <button type="button" data-r="csv">Ekspor CSV</button>
      <button type="button" data-r="cetak">Cetak</button>
      <button type="button" data-r="bAbaikan" class="ghost hidden"></button>
    </div>
    <div class="scroll"><table class="tstok">
      <thead><tr><th>No</th><th>Nama Barang</th><th>Stok Awal</th><th>Masuk</th><th>Keluar</th><th>Stok Akhir</th><th>Status</th><th class="noprint"></th></tr></thead>
      <tbody data-r="tbody"></tbody>
    </table></div>
    <p class="mut kecil" data-r="catatan"></p>
  </section>
  <section class="panel noprint">
    <h2>Riwayat stok masuk</h2>
    <div class="scroll tinggi"><table class="triwayat">
      <thead><tr><th>Hari / Tanggal</th><th>Nama Barang</th><th>Jumlah</th><th>Catatan</th><th></th></tr></thead>
      <tbody data-r="tbMasuk"></tbody>
    </table></div>
  </section>`;

  const r = n => root.querySelector(`[data-r="${n}"]`);
  const f = n => root.querySelector(`[name="${n}"]`);
  const rentang = () => {
    let d1 = f('dari').value, d2 = f('sampai').value;
    if (d1 && d2 && d1 > d2) [d1, d2] = [d2, d1];
    return [d1, d2];
  };
  const status = a => a <= 0 ? ['Habis', 'habis'] : a <= BATAS_TIPIS ? ['Menipis', 'tipis'] : ['Aman', 'aman'];

  function render() {
    const [d1, d2] = rentang(), { rows, tak } = hitung(d1, d2);
    const q = f('cari').value.toLowerCase(), list = rows.filter(x => x.b.nama.toLowerCase().includes(q));
    r('rentang').textContent = d1 || d2 ? `(${d1 ? hari(d1) : 'awal'} s/d ${d2 ? hari(d2) : 'sekarang'})` : '(Semua tanggal)';
    const jum = k => list.reduce((s, x) => s + x[k], 0);
    r('cards').innerHTML = [
      ['Jenis barang', list.length], ['Total stok akhir', jum('akhir')],
      ['Stok menipis', list.filter(x => x.akhir > 0 && x.akhir <= BATAS_TIPIS).length], ['Stok habis', list.filter(x => x.akhir <= 0).length]
    ].map(c => `<div class="card"><span>${c[0]}</span><b>${c[1]}</b></div>`).join('');
    r('tbody').innerHTML = list.map((x, i) => {
      const [teks, kls] = status(x.akhir);
      return `<tr><td>${i + 1}</td><td class="nama">${esc(x.b.nama)}</td><td>${x.awalP}</td><td>${x.masuk}</td><td>${x.keluar}</td>
      <td><b>${x.akhir}</b></td><td><span class="badge s-${kls}">${teks}</span></td>
      <td class="act noprint"><button type="button" class="ghost danger" data-act="hapusB" data-nama="${esc(x.b.nama)}">Hapus</button></td></tr>`;
    }).join('') + (list.length ? `<tr class="jumlah"><td></td><td>Total</td><td>${jum('awalP')}</td><td>${jum('masuk')}</td><td>${jum('keluar')}</td><td>${jum('akhir')}</td><td></td><td class="noprint"></td></tr>` : '')
      || '<tr><td colspan="8" class="kosong">Belum ada barang. Tambahkan lewat “Tambah barang baru”.</td></tr>';
    r('catatan').textContent = `Stok dihitung sejak ${hari(st.mulai)}. Penjualan sebelum tanggal itu tidak mengurangi stok.`;

    const cur = f('mNama').value;
    f('mNama').innerHTML = '<option value="">Pilih barang…</option>' + st.barang.map(b => `<option>${esc(b.nama)}</option>`).join('');
    if (st.barang.some(b => b.nama === cur)) f('mNama').value = cur;

    r('tbMasuk').innerHTML = [...st.masuk].sort((a, b) => a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : b.id - a.id).map(m =>
      `<tr><td>${hari(m.tgl)}</td><td class="nama">${esc(m.nama)}</td><td><b>${m.qty > 0 ? '+' : ''}${m.qty}</b></td><td class="nama">${esc(m.cat)}</td>
      <td class="act"><button type="button" class="ghost danger" data-act="hapusM" data-id="${m.id}">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="kosong">Belum ada stok masuk.</td></tr>';

    takSaatIni = tak;
    const pan = r('tak');
    pan.classList.toggle('hidden', !tak.length);
    if (tak.length) {
      const opsi = st.barang.map(b => `<option>${esc(b.nama)}</option>`).join('');
      pan.innerHTML = `<h2>Penjualan belum terhubung ke stok</h2>
      <p class="mut kecil">Penjualan di bawah belum mengurangi stok karena namanya tidak sama dengan nama barang di stok.</p>` +
        tak.map((t, i) => `<div class="tak" data-i="${i}"><span><b>${esc(t.nama)}</b> · ${t.qty} terjual</span>
        <select aria-label="Hubungkan ${esc(t.nama)} ke barang"><option value="">Pilih barang di stok…</option>${opsi}</select>
        <button type="button" data-act="hubung">Hubungkan</button>
        <button type="button" class="ghost" data-act="baru">Jadikan barang baru</button>
        <button type="button" class="ghost" data-act="abaikan">Abaikan</button></div>`).join('');
    }
    const ab = r('bAbaikan');
    ab.classList.toggle('hidden', !st.abaikan.length);
    ab.textContent = `Tampilkan lagi nama yang diabaikan (${st.abaikan.length})`;
  }

  // ---- input
  r('formMasuk').onsubmit = e => {
    e.preventDefault();
    const nama = f('mNama').value, qty = Math.trunc(+f('mQty').value);
    if (!nama) return toast('Pilih barangnya dulu.');
    if (!qty) return toast('Jumlah tidak boleh 0.');
    st.masuk.push({ id: Date.now(), tgl: f('mTgl').value, nama, qty, cat: f('mCat').value.trim() });
    simpan(); r('formMasuk').reset(); f('mTgl').value = hariIni(); render();
    toast(`Stok ${nama} ${qty > 0 ? 'bertambah' : 'berkurang'} ${Math.abs(qty)}.`);
  };
  r('formBarang').onsubmit = e => {
    e.preventDefault();
    const nama = bersih(f('bNama').value), qty = Math.max(0, Math.trunc(+f('bQty').value) || 0);
    if (!nama) return;
    if (cari(nama)) return toast('Barang itu sudah ada di daftar stok.');
    st.barang.push({ nama, awal: 0, alias: [] });
    if (qty) st.masuk.push({ id: Date.now(), tgl: hariIni(), nama, qty, cat: 'Stok pertama' });
    simpan(); r('formBarang').reset(); render(); toast(`${nama} ditambahkan.`);
  };

  // ---- tabel
  r('tbody').onclick = async e => {
    const b = e.target.closest('button[data-act="hapusB"]'); if (!b) return;
    const nama = b.dataset.nama;
    if (await konfirmasi(`Hapus “${nama}” dari data stok? Riwayat stok masuk barang ini ikut terhapus. Data penjualan tidak berubah.`)) {
      st.barang = st.barang.filter(x => x.nama !== nama); st.masuk = st.masuk.filter(m => m.nama !== nama); simpan(); render();
    }
  };
  r('tbMasuk').onclick = async e => {
    const b = e.target.closest('button[data-act="hapusM"]'); if (!b) return;
    if (await konfirmasi('Hapus catatan stok masuk ini?')) { st.masuk = st.masuk.filter(m => m.id !== +b.dataset.id); simpan(); render(); }
  };
  r('tak').onclick = e => {
    const b = e.target.closest('button[data-act]'), baris = e.target.closest('[data-i]');
    if (!b || !baris) return;
    const t = takSaatIni[+baris.dataset.i]; if (!t) return;
    if (b.dataset.act === 'hubung') {
      const tujuan = st.barang.find(x => x.nama === baris.querySelector('select').value);
      if (!tujuan) return toast('Pilih barang di stok dulu.');
      tujuan.alias.push(t.n); toast(`“${t.nama}” dihubungkan ke ${tujuan.nama}.`);
    } else if (b.dataset.act === 'baru') {
      st.barang.push({ nama: t.nama, awal: 0, alias: [] }); toast(`${t.nama} ditambahkan dengan stok 0. Isi stok masuknya.`);
    } else { st.abaikan.push(t.n); toast(`“${t.nama}” diabaikan.`); }
    simpan(); render();
  };
  r('bAbaikan').onclick = () => { st.abaikan = []; simpan(); render(); };

  ['cari', 'dari', 'sampai'].forEach(n => f(n).oninput = render);
  const setRentang = (a, b) => { f('dari').value = a; f('sampai').value = b; render(); };
  r('bHari').onclick = () => setRentang(hariIni(), hariIni());
  r('bBulan').onclick = () => {
    const [y, m] = hariIni().split('-'), akhir = new Date(+y, +m, 0).getDate();
    setRentang(`${y}-${m}-01`, `${y}-${m}-${String(akhir).padStart(2, '0')}`);
  };
  r('bSemua').onclick = () => setRentang('', '');
  r('cetak').onclick = () => print();
  r('csv').onclick = () => {
    const [d1, d2] = rentang(), { rows } = hitung(d1, d2);
    const q = f('cari').value.toLowerCase(), list = rows.filter(x => x.b.nama.toLowerCase().includes(q));
    if (!list.length) return toast('Tidak ada data untuk diekspor.');
    const t = v => typeof v === 'number' ? v : '"' + (/^[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"';
    const baris = [['No', 'Nama Barang', 'Stok Awal', 'Masuk', 'Keluar', 'Stok Akhir', 'Status']];
    list.forEach((x, i) => baris.push([i + 1, x.b.nama, x.awalP, x.masuk, x.keluar, x.akhir, status(x.akhir)[0]]));
    unduh('\uFEFF' + baris.map(b => b.map(t).join(';')).join('\r\n'), `stok-barang-${hariIni()}.csv`, 'text/csv;charset=utf-8');
  };

  // ---- dipakai tab Kasir
  const infoStok = (nama, qty, edit) => {
    if (!bersih(nama)) return null;
    const peta = buatPeta(), b = cari(nama, peta);
    if (!b) return { teks: 'Barang ini belum ada di data stok, jadi stok tidak berkurang.', kelas: 'warn' };
    const kembali = edit && cari(edit.nama, peta) === b && edit.tgl >= st.mulai ? edit.qty : 0;
    const sisa = hitung('', '').rows.find(x => x.b === b).akhir + kembali, lebih = qty > sisa;
    return {
      teks: `Stok tersisa: ${sisa}` + (lebih ? ' — jumlah melebihi stok' : sisa <= 0 ? ' — stok habis' : ''),
      kelas: lebih || sisa <= 0 ? 'bad' : sisa <= BATAS_TIPIS ? 'warn' : 'ok'
    };
  };

  f('mTgl').value = hariIni(); setRentang(...(() => { const [y, m] = hariIni().split('-'); return [`${y}-${m}-01`, `${y}-${m}-${String(new Date(+y, +m, 0).getDate()).padStart(2, '0')}`]; })());
  return {
    cfg, root, render, segarkan: render, infoStok,
    namaBarang: () => st.barang.map(b => b.nama),
    ambil: () => st,
    gabung(obj) { // untuk Restore: tambahkan yang belum ada, tanpa menimpa
      if (!obj || !Array.isArray(obj.barang)) return 0;
      let n = 0;
      for (const b of obj.barang) {
        const nama = bersih(b.nama);
        if (!nama || cari(nama)) continue;
        st.barang.push({ nama, awal: Math.trunc(+b.awal) || 0, alias: (Array.isArray(b.alias) ? b.alias : []).map(norm) }); n++;
      }
      const kunci = m => [m.tgl, norm(m.nama), m.qty, m.cat].join('|'), ada = {};
      st.masuk.forEach(m => ada[kunci(m)] = (ada[kunci(m)] || 0) + 1);
      const peta = buatPeta(); let id = Date.now();
      for (const m of Array.isArray(obj.masuk) ? obj.masuk : []) {
        const b = cari(m.nama, peta), e = { tgl: String(m.tgl), nama: b ? b.nama : '', qty: Math.trunc(+m.qty) || 0, cat: String(m.cat || '') };
        if (!b || !TGL_OK.test(e.tgl) || !e.qty) continue;
        const k = kunci(e);
        if (ada[k] > 0) ada[k]--; else { st.masuk.push({ id: id++, ...e }); n++; }
      }
      (Array.isArray(obj.abaikan) ? obj.abaikan : []).forEach(a => { if (!st.abaikan.includes(norm(a))) st.abaikan.push(norm(a)); });
      simpan(); render(); return n;
    }
  };
}

/* =====================================================================
   KERANGKA: TAB, BACKUP, RESTORE
   ===================================================================== */
let modul = null;

function pilihTab(id) {
  modul.forEach(m => {
    const aktif = m.cfg.id === id, t = $('#tab-' + m.cfg.id);
    m.root.classList.toggle('hidden', !aktif);
    if (aktif && m.segarkan) m.segarkan();
    t.setAttribute('aria-selected', aktif); t.tabIndex = aktif ? 0 : -1;
  });
  localStorage.setItem('rexel_tab', id);
}

function siapkanApp() {
  let kasir;
  const stok = buatStok(() => kasir ? kasir.ambil() : []);
  MODUL[0].saran = stok.namaBarang; MODUL[0].infoStok = stok.infoStok;
  kasir = buatModul(MODUL[0]);
  kasir.onUbah = stok.render; stok.render();
  modul = [kasir, stok, buatModul(MODUL[1])];
  modul.forEach(m => {
    const t = document.createElement('button');
    t.type = 'button'; t.id = 'tab-' + m.cfg.id; t.textContent = m.cfg.judul;
    t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'p-' + m.cfg.id);
    t.onclick = () => pilihTab(m.cfg.id);
    $('#tabs').append(t); $('#main').append(m.root);
  });
  $('#tabs').onkeydown = e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ids = modul.map(m => m.cfg.id), i = ids.indexOf(document.activeElement.id.replace('tab-', ''));
    if (i < 0) return;
    const n = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    pilihTab(n); $('#tab-' + n).focus();
  };
  const awal = localStorage.getItem('rexel_tab');
  pilihTab(modul.some(m => m.cfg.id === awal) ? awal : modul[0].cfg.id);

  $('#bBackup').onclick = () => {
    unduh(JSON.stringify(isiBackup(), null, 2), `backup-rexel-${hariIni()}.json`, 'application/json');
    toast('Backup disimpan ke folder Download.');
  };
  $('#bRestore').onclick = () => $('#fRestore').click();
  $('#fRestore').onchange = async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const isi = JSON.parse(await file.text());
      if (!isi || isi.aplikasi !== 'rexel-game' || typeof isi.data !== 'object') throw 0;
      if (!adalahAdmin()) return toast('Restore data hanya bisa dilakukan admin.');
      const n = modul.reduce((s, m) => s + m.gabung(isi.data[m.cfg.id]), 0);
      toast(n ? `${n} data berhasil dipulihkan.` : 'Tidak ada data baru; semua sudah ada.');
    } catch { toast('File backup tidak valid.'); }
  };

  // Gabungkan data dari file (kalau ada) dengan yang ada di aplikasi, lalu aktifkan simpan otomatis ke file
  if (dataFile && dataFile.data) {
    try { modul.forEach(m => m.gabung(dataFile.data[m.cfg.id])); } catch { /* abaikan */ }
  }
  sinkronAktif = true; simpanKeFile();
}

function terapkanPeran() {
  const admin = adalahAdmin();
  $('#tbNama').textContent = `${pengguna.nama} (${pengguna.user})`;
  const p = $('#tbPeran'); p.textContent = PERAN[pengguna.peran]; p.className = 'peran ' + pengguna.peran;
  document.querySelectorAll('.hanya-admin').forEach(el => el.classList.toggle('hidden', !admin));
  modul.forEach(m => m.terapkanPeran && m.terapkanPeran());
}

function bukaApp() {
  if (!pengguna) return siapkanLogin();
  if (!modul) siapkanApp();
  terapkanPeran();
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
}

/* ---------- Pengaturan: ubah password ---------- */
const kolomSandi = ['pLama', 'pBaru', 'pUlang', 'rBaru'];
const tampilSandi = t => kolomSandi.forEach(i => $('#' + i).type = t ? 'text' : 'password');
function bukaPengaturan() {
  $('#setAkun').textContent = `Akun: ${pengguna.nama} (${pengguna.user}) · ${PERAN[pengguna.peran]}`;
  kolomSandi.forEach(i => $('#' + i).value = '');
  $('#pErr').textContent = ''; $('#rErr').textContent = ''; $('#pLihat').checked = false; tampilSandi(false);
  $('#rUser').innerHTML = [...AKUN.entries()].filter(([, v]) => v.peran === 'karyawan').map(([k, v]) => `<option value="${k}">${esc(v.nama)} (${k})</option>`).join('');
  $('#dlgSet').showModal();
}
const cekBaru = (baru, ulang, lama) => baru.length < 6 ? 'Password baru minimal 6 karakter.' : baru !== ulang ? 'Ulangi password baru dengan sama persis.' : baru === lama ? 'Password baru harus berbeda dari yang lama.' : '';
$('#bPengaturan').onclick = bukaPengaturan;
$('#setTutup').onclick = () => $('#dlgSet').close();
$('#pLihat').onchange = e => tampilSandi(e.target.checked);
$('#fPass').onsubmit = async e => {
  e.preventDefault();
  const lama = $('#pLama').value, baru = $('#pBaru').value, ulang = $('#pUlang').value, err = $('#pErr');
  err.textContent = '';
  try {
    const a = akun(pengguna.user);
    if (await turunkan(lama, a.salt, a.iter) !== a.hash) { err.textContent = 'Password lama salah.'; return; }
    const m = cekBaru(baru, ulang, lama);
    if (m) { err.textContent = m; return; }
    await aturPassword(a.user, baru); pengguna = akun(a.user);
    $('#dlgSet').close(); toast('Password berhasil diubah.');
  } catch (x) { err.textContent = x.message || 'Gagal mengubah password.'; }
};
$('#fReset').onsubmit = async e => {
  e.preventDefault();
  const k = $('#rUser').value, baru = $('#rBaru').value, err = $('#rErr');
  err.textContent = '';
  if (!adalahAdmin() || !AKUN.has(k) || AKUN.get(k).peran !== 'karyawan') return;
  if (baru.length < 6) { err.textContent = 'Password baru minimal 6 karakter.'; return; }
  try { await aturPassword(k, baru); $('#rBaru').value = ''; toast(`Password ${AKUN.get(k).nama} berhasil diubah.`); }
  catch (x) { err.textContent = x.message || 'Gagal mengubah password.'; }
};

$('#dlgOk').onclick = () => $('#dlg').close('ok');
$('#dlgBatal').onclick = () => $('#dlg').close('batal');

(async function mulai() {
  overrideAkun = await muatAkun();
  try {
    if (window.rexelApi && window.rexelApi.muatData) { const h = await window.rexelApi.muatData(); if (h && h.ada) dataFile = h.isi; }
  } catch { /* abaikan */ }
  const a = akun(sessionStorage.getItem(SES) || '');
  if (a) { pengguna = a; bukaApp(); } else siapkanLogin();
})();
