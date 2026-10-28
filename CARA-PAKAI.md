# Web Interaktif: Teknologi Jaringan Kabel dan Nirkabel (SMK Kelas XI)

Web ini dibuat dari slide "Media Mengajar Teknologi Jaringan Kabel dan Nirkabel untuk SMK/MAK Kelas XI" (Bab 1–6). Isinya:

- Materi Bab 1–6 dengan simulasi di hampir setiap subbab: lima elemen komunikasi data, lab sinyal digital/analog/modulasi, hierarki sentral telepon, jalur JARLOKAT, spektrum ADSL, bongkar kabel koaksial, efek pilinan kabel, pembaca kode STP, OSI dan enkapsulasi, FDMA/TDMA/CDMA (termasuk hitungan kode CDMA), mode ad hoc/infrastructure, AMC, pola pancar antena, simulasi konfigurasi wireless router, mode bridge/station/repeater, kekuatan sinyal vs jarak, kekuatan password Wi-Fi, perjalanan suara VoIP, isi paket VoIP, jitter buffer, softswitch, IVR PBX, sistem hunting, penguji pattern dialplan, animasi pesan SIP, pemantulan total di serat optik, WDM, window panjang gelombang, multimode vs singlemode, dan jalur FTTH.
- **Lab kabel RJ45**: susun warna T568A/T568B di dua ujung, crimp, uji dengan LAN tester virtual. Mendeteksi kabel belum lengkap, urutan terbalik, dan split pair.
- **Simulator VoIP Asterisk** (simulasi pembelajaran, bukan server sungguhan): edit `sip.conf`, `extensions.conf`, `voicemail.conf`, daftarkan 3 softphone, lakukan panggilan. Keluarannya log CLI bergaya Asterisk, diagram pesan SIP, dan petunjuk perbaikan berbahasa Indonesia. Ada 5 contoh konfigurasi (dasar, voicemail, trunk, IVR, permit/deny) dan perintah CLI seperti `sip show peers`.
- **Kalkulator jaringan**: subnet IPv4, bandwidth dan MOS VoIP, link budget FTTH, sudut kritis serat optik.
- Peta 20 pertemuan dengan tujuan, kegiatan, bukti kerja, kriteria keberhasilan, dan tindak lanjut.
- Asesmen dalam tab: kuis 36 soal (18 soal sumatif dari slide + 18 soal tambahan), studi kasus troubleshooting, perbaiki konfigurasi Asterisk (dicek otomatis), contoh soal sumatif semester 1 dan 2, serta rubrik praktik (crimping, Wi-Fi, VoIP, FTTH).

## Link website

- Website untuk siswa: https://nothinsphere.github.io/modul-tjkn/
- Repositori GitHub: https://github.com/nothinsphere/modul-tjkn

Untuk memperbarui website setelah mengubah file, jalankan di folder ini: `git add -A`, `git commit -m "pesan perubahan"`, lalu `git push`. Bisa juga dengan **Add file → Upload files** di halaman repositori. Website ikut berubah sekitar 1 menit kemudian.

## Cara membuka

- Untuk siswa (HP): bagikan link website di atas. Membuka file `index.html` langsung dari pengelola file di HP Android sering gagal.
- Di laptop/PC: klik dua kali `index.html`, atau buka link website.

Setiap kali mengubah file di folder `assets`, naikkan juga angka versinya: `?v=…` di bagian bawah dan atas `index.html` serta `CACHE` di baris atas `sw.js`. Tanpa itu, HP siswa bisa tetap memakai salinan lama yang tersimpan untuk mode offline.

## Memakai tanpa internet

| Situasi | Hasil |
|---|---|
| Halaman sudah terbuka, lalu internet putus | Semua fitur tetap jalan: materi, lab, simulator, kalkulator, kuis. |
| Membuka ulang link website tanpa internet | Bisa, asalkan web pernah dibuka sekali dengan internet di browser yang sama (bukan mode penyamaran). |
| Membuka `index.html` dari folder laptop | Tidak butuh internet; font berganti ke font bawaan. |
| Tautan bertanda ↗ | Selalu butuh internet. |

## Catatan isi

- Beberapa soal sumatif di slide dirapikan agar akurat. Soal DSL di Bab 1 menyebut "JARLOKAF tidak murni"; di web ditulis ulang karena DSL berjalan di kabel tembaga. Pilihan "f.conf" di Bab 5 ditulis "features.conf". Soal bertanda `slide` di kuis berasal dari slide.
- Kunci jawaban soal slide tidak tercantum di file PPT, jadi ditentukan dari materi. Periksa kembali sebelum dipakai untuk penilaian.
- Beberapa data di slide diperbaiki: tahun demonstrasi Tyndall ditulis 1854 (dengan catatan "sebagian buku menulis 1852"), redaman multimode memakai batas TIA-568, kolom tabel hunting "Tujuan" menjadi "PBX", dan bagian `[globals]` dialplan ditulis dengan benar.
- Materi VoIP memakai `sip.conf` (chan_sip) sesuai slide. Modul ini dihapus sejak Asterisk 21; padanan `pjsip.conf` ada di halaman Glosarium & cheat sheet.
- Rumusan CP di halaman Identitas adalah ringkasan pengembang; cocokkan dengan dokumen CP yang berlaku di sekolah.
- Kemajuan, jawaban kuis, dan konfigurasi simulator tersimpan di browser masing-masing siswa, tidak dikirim ke mana pun.

## Mengubah isi

- Teks materi, identitas, persiapan: `index.html`
- Peta pertemuan, soal kuis, studi kasus, soal perbaiki konfigurasi, rubrik, glosarium, contoh konfigurasi simulator: `assets/app.js`
- Perilaku simulator Asterisk: `assets/asterisk.js`
