const { contextBridge, ipcRenderer } = require('electron');

// Nama 'rexelApi' sengaja berbeda dari variabel di app.js (kalau sama, app.js gagal jalan)
contextBridge.exposeInMainWorld('rexelApi', {
  ambilCred: () => ipcRenderer.invoke('cred:ambil'),
  simpanCred: c => ipcRenderer.invoke('cred:simpan', c),
  hapusCred: () => ipcRenderer.invoke('cred:hapus'),
  muatData: () => ipcRenderer.invoke('data:muat'),
  simpanData: d => ipcRenderer.invoke('data:simpan', d),
  muatAkun: () => ipcRenderer.invoke('akun:muat'),
  simpanAkun: a => ipcRenderer.invoke('akun:simpan', a)
});
