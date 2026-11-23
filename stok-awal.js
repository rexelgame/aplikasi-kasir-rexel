// Data awal stok dari file Excel "DATA STOK BARANG NOVEMBER" (stok awal 1 Nov 2026 + stok masuk dari Excel lama).
// Hanya dipakai sekali saat aplikasi pertama kali dibuka; setelah itu data stok disimpan di aplikasi.
const STOK_AWAL = {
 "mulai": "2026-11-01",
 "barang": [
  {
   "nama": "Stik Ps2 Hitam",
   "awal": 21
  },
  {
   "nama": "Stik Ps2 Warna Ori",
   "awal": 29,
   "alias": [
    "stik ps2 warna"
   ]
  },
  {
   "nama": "Stik Ps3 Warna",
   "awal": 7
  },
  {
   "nama": "Stik Ps3 Hitam",
   "awal": 17
  },
  {
   "nama": "Stik Ps3 Motif",
   "awal": 14
  },
  {
   "nama": "Stik Ps4 Motif",
   "awal": 5
  },
  {
   "nama": "Stik Ps4 Warna",
   "awal": 0
  },
  {
   "nama": "Stik Ps4 Hitam",
   "awal": 5
  },
  {
   "nama": "Hdmi Ori",
   "awal": 3
  },
  {
   "nama": "Hdmi",
   "awal": 15
  },
  {
   "nama": "Casan Ps3 NYK",
   "awal": 18
  },
  {
   "nama": "Kabel Av",
   "awal": 22
  },
  {
   "nama": "Kabel Ac/Power",
   "awal": 42
  },
  {
   "nama": "Memory Card 8Mb",
   "awal": 3
  },
  {
   "nama": "Memory Card 16Mb",
   "awal": 6
  },
  {
   "nama": "Converter to Hdmi",
   "awal": 4
  },
  {
   "nama": "Converter Stik Ps2",
   "awal": 4
  },
  {
   "nama": "Ps 3 Slim S.20 CFW 500gb",
   "awal": 3
  },
  {
   "nama": "Ps4 Slim Hen 12.02 1Tb",
   "awal": 1
  },
  {
   "nama": "Ps4 Pro Hen 12.02 1Tb",
   "awal": 0
  },
  {
   "nama": "Stik Pc Komputer",
   "awal": 5
  },
  {
   "nama": "CASAN PS4",
   "awal": 9
  }
 ],
 "masuk": [
  {
   "tgl": "2026-11-08",
   "nama": "Stik Ps3 Warna",
   "qty": 10,
   "cat": "Dari data Excel lama"
  },
  {
   "tgl": "2026-11-08",
   "nama": "Stik Ps3 Hitam",
   "qty": 20,
   "cat": "Dari data Excel lama"
  },
  {
   "tgl": "2026-11-08",
   "nama": "Stik Ps3 Motif",
   "qty": 10,
   "cat": "Dari data Excel lama"
  },
  {
   "tgl": "2026-11-08",
   "nama": "Stik Ps4 Warna",
   "qty": 5,
   "cat": "Dari data Excel lama"
  },
  {
   "tgl": "2026-11-08",
   "nama": "Hdmi",
   "qty": 20,
   "cat": "Dari data Excel lama"
  },
  {
   "tgl": "2026-11-08",
   "nama": "Casan Ps3 NYK",
   "qty": 30,
   "cat": "Dari data Excel lama"
  },
  {
   "tgl": "2026-11-08",
   "nama": "Memory Card 8Mb",
   "qty": 5,
   "cat": "Dari data Excel lama"
  },
  {
   "tgl": "2026-11-08",
   "nama": "Ps 3 Slim S.20 CFW 500gb",
   "qty": 3,
   "cat": "Dari data Excel lama"
  }
 ]
};
