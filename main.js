const { app, BrowserWindow, Menu, ipcMain, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

/* ---------- Password tersimpan (dienkripsi Windows) ---------- */
const berkasCred = () => path.join(app.getPath('userData'), 'cred.bin');

ipcMain.handle('cred:ambil', () => {
  try {
    if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(berkasCred())) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(berkasCred())));
  } catch { return null; }
});
ipcMain.handle('cred:simpan', (_e, c) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    fs.writeFileSync(berkasCred(), safeStorage.encryptString(JSON.stringify({ u: String(c.u), p: String(c.p) })));
    return true;
  } catch { return false; }
});
ipcMain.handle('cred:hapus', () => {
  try { fs.rmSync(berkasCred(), { force: true }); } catch { /* abaikan */ }
  return true;
});

/* ---------- Data aplikasi: satu file tetap di Dokumen\Rexel Game ----------
   npm start dan file .exe memakai file yang sama, jadi datanya tidak terpisah.
   Cadangan otomatis ada di folder "cadangan" (maks. 40 file, minimal selang 15 menit). */
const folderData = () => path.join(app.getPath('documents'), 'Rexel Game');
const folderCadangan = () => path.join(folderData(), 'cadangan');
const berkasData = () => path.join(folderData(), 'data-rexel.json');
const dua = n => String(n).padStart(2, '0');
const stempel = (d = new Date()) => `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}_${dua(d.getHours())}-${dua(d.getMinutes())}-${dua(d.getSeconds())}`;
const CADANGAN = /^data-rexel-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/;

ipcMain.handle('data:muat', () => {
  const f = berkasData();
  try {
    if (!fs.existsSync(f)) return { ada: false, lokasi: f };
    return { ada: true, lokasi: f, isi: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) {
    try { fs.copyFileSync(f, path.join(folderData(), `data-rexel.rusak-${stempel()}.json`)); } catch { /* abaikan */ }
    return { ada: false, lokasi: f, galat: String(e.message) };
  }
});

ipcMain.handle('data:simpan', (_e, isi) => {
  try {
    if (!isi || isi.aplikasi !== 'rexel-game' || typeof isi.data !== 'object') throw new Error('format data tidak valid');
    fs.mkdirSync(folderCadangan(), { recursive: true });
    if (fs.existsSync(berkasData())) { // simpan keadaan SEBELUM ditimpa, paling sering tiap 15 menit
      const daftar = fs.readdirSync(folderCadangan()).filter(n => CADANGAN.test(n)).sort();
      const terakhir = daftar.length ? fs.statSync(path.join(folderCadangan(), daftar[daftar.length - 1])).mtimeMs : 0;
      if (Date.now() - terakhir > 15 * 60 * 1000) {
        fs.copyFileSync(berkasData(), path.join(folderCadangan(), `data-rexel-${stempel()}.json`));
        daftar.push('x'); // jumlah bertambah satu
        fs.readdirSync(folderCadangan()).filter(n => CADANGAN.test(n)).sort()
          .slice(0, Math.max(0, daftar.length - 40)).forEach(n => { try { fs.unlinkSync(path.join(folderCadangan(), n)); } catch { /* abaikan */ } });
      }
    }
    const tmp = berkasData() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(isi, null, 1), 'utf8');
    fs.renameSync(tmp, berkasData());
    return { ok: true, lokasi: berkasData() };
  } catch (e) { return { ok: false, galat: String(e.message) }; }
});

/* ---------- Akun: password yang diganti disimpan di akun-rexel.json ---------- */
const berkasAkun = () => path.join(folderData(), 'akun-rexel.json');
const HEX = /^[0-9a-f]+$/;
const akunValid = isi => isi && isi.aplikasi === 'rexel-game-akun' && isi.akun && typeof isi.akun === 'object' &&
  Object.values(isi.akun).every(x => x && HEX.test(String(x.salt)) && HEX.test(String(x.hash)) && Number.isInteger(x.iter) && x.iter >= 1000);

ipcMain.handle('akun:muat', () => {
  try {
    if (!fs.existsSync(berkasAkun())) return { ada: false };
    const isi = JSON.parse(fs.readFileSync(berkasAkun(), 'utf8'));
    return akunValid(isi) ? { ada: true, isi } : { ada: false, galat: 'format akun tidak valid' };
  } catch (e) { return { ada: false, galat: String(e.message) }; }
});
ipcMain.handle('akun:simpan', (_e, isi) => {
  try {
    if (!akunValid(isi)) throw new Error('format akun tidak valid');
    fs.mkdirSync(folderData(), { recursive: true });
    const tmp = berkasAkun() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(isi, null, 1), 'utf8');
    fs.renameSync(tmp, berkasAkun());
    return { ok: true };
  } catch (e) { return { ok: false, galat: String(e.message) }; }
});

function buatJendela() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 700, minHeight: 500,
    title: 'Rexel Game', autoHideMenuBar: true,
    icon: path.join(__dirname, 'logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  buatJendela();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) buatJendela(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
