# Web Interaktif: Teknologi Jaringan Kabel dan Nirkabel (SMK Kelas XI)

Web ini dibuat dari slide "Media Mengajar Teknologi Jaringan Kabel dan Nirkabel untuk SMK/MAK Kelas XI" (Bab 1–6). Isinya:

- Materi Bab 1–6 dengan simulasi di hampir setiap subbab: lima elemen komunikasi data, lab sinyal digital/analog/modulasi, hierarki sentral telepon, jalur JARLOKAT, spektrum ADSL, bongkar kabel koaksial, efek pilinan kabel, pembaca kode STP, OSI dan enkapsulasi, FDMA/TDMA/CDMA (termasuk hitungan kode CDMA), mode ad hoc/infrastructure, AMC, pola pancar antena, simulasi konfigurasi wireless router, mode bridge/station/repeater, kekuatan sinyal vs jarak, kekuatan password Wi-Fi, perjalanan suara VoIP, isi paket VoIP, jitter buffer, softswitch, IVR PBX, sistem hunting, penguji pattern dialplan, animasi pesan SIP, pemantulan total di serat optik, WDM, window panjang gelombang, multimode vs singlemode, dan jalur FTTH.
- **Lab kabel RJ45**: susun warna T568A/T568B di dua ujung, crimp, uji dengan LAN tester virtual. Mendeteksi kabel belum lengkap, urutan terbalik, dan split pair.
- **Simulator VoIP Asterisk** (simulasi pembelajaran, bukan server sungguhan). Jalur utama: Asterisk 21+ dengan PJSIP (`pjsip.conf`, kanal `PJSIP/101`, `pjsip show endpoints`). Jalur lama chan_sip (`sip.conf`) tersedia sebagai mode terpisah untuk server Asterisk 20 ke bawah. Edit `pjsip.conf`, `extensions.conf`, `voicemail.conf`, daftarkan 3 softphone, lakukan panggilan. Keluarannya log CLI bergaya Asterisk, diagram pesan SIP, dan petunjuk perbaikan berbahasa Indonesia. Ada 5 contoh konfigurasi (dasar, voicemail, trunk, IVR, permit/deny).
- **Kalkulator jaringan**: subnet IPv4 (termasuk /31 point-to-point, /32, dan alamat khusus seperti link-local, loopback, multicast, CGNAT, dokumentasi), bandwidth dan MOS VoIP, link budget FTTH, sudut kritis serat optik.
- **LKPD praktik serat optik** (Bab 6.8): pembersihan & inspeksi konektor, penyambungan, pengukuran OPM & light source, analisis gangguan. Tabel hasil dihitung otomatis, ada K3, kriteria keberhasilan, dan tombol contoh data bila alat terbatas.
- Peta 20 pertemuan dengan JP yang bisa diatur guru (bawaan 4 JP × 45 menit), pembagian waktu, langkah bernomor, tujuan, kegiatan, bukti kerja, kriteria keberhasilan, dan tindak lanjut.
- Asesmen dalam tab: kuis 36 soal (18 soal sumatif dari slide + 18 soal tambahan), 7 studi kasus troubleshooting, perbaiki konfigurasi Asterisk PJSIP (dicek otomatis), contoh soal sumatif semester 1 dan 2, serta rubrik praktik (crimping, Wi-Fi, VoIP PJSIP, serat optik, FTTH).
- **Kumpulkan hasil**: rekap otomatis semua hasil siswa (pertemuan, kuis, studi kasus, perbaiki konfigurasi, lab RJ45, simulasi router, simulator VoIP, LKPD). Siswa mengisi nama, lalu mengunduh laporan `.html` (bisa dicetak/PDF), menyalin ringkasan teks, atau mengunduh file konfigurasi VoIP-nya.

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

- Beberapa soal sumatif di slide dirapikan agar akurat. Soal DSL di Bab 1 menyebut "JARLOKAF tidak murni"; di web ditulis ulang karena DSL berjalan di kabel tembaga. Soal konflik IP di Bab 3 tidak lagi menjawab "DHCP server tidak aktif", melainkan pemeriksaan IP ganda termasuk IP statis di dalam pool DHCP. Soal ACL di Bab 5 memakai `pjsip.conf` (jawaban slide `sip.conf` hanya berlaku untuk server lama). Pilihan "f.conf" ditulis "features.conf". Soal bertanda `slide` di kuis berasal dari slide.
- Kunci jawaban soal slide tidak tercantum di file PPT, jadi ditentukan dari materi. Periksa kembali sebelum dipakai untuk penilaian.
- Beberapa data di slide diperbaiki: tahun demonstrasi Tyndall ditulis 1854 (dengan catatan "sebagian buku menulis 1852"), redaman multimode memakai batas TIA-568, kolom tabel hunting "Tujuan" menjadi "PBX", dan bagian `[globals]` dialplan ditulis dengan benar.
- Slide memakai `sip.conf` (chan_sip). Modul ini usang sejak Asterisk 17 dan dihapus di Asterisk 21, jadi praktik utama di web memakai PJSIP. Langkah versi lama dipisahkan di Bab 5.4 dan mode simulator "Asterisk ≤ 20 · chan_sip"; tabel padanan ada di Glosarium & cheat sheet.
- ASCII dijelaskan sebagai kode standar 7 bit yang disimpan dalam 1 byte (8 bit). Materi kualitas VoIP membedakan RTT hasil ping dengan delay satu arah (batas ITU-T G.114).
- Rujukan CP: Keputusan Kepala BSKAP Nomor 046/H/KR/2025 (menggantikan 032/H/KR/2024). Perubahan CP tahun 2026 hanya menyangkut Pendidikan Agama dan Budi Pekerti. Rumusan CP di halaman Identitas adalah ringkasan pengembang yang dirinci menjadi 5 elemen dan dicocokkan dengan TP, kegiatan, dan asesmen; cocokkan dengan naskah CP resmi yang berlaku di sekolah.
- Kemajuan, jawaban kuis, dan konfigurasi simulator tersimpan di browser masing-masing siswa, tidak dikirim ke mana pun.

## Aturan penilaian otomatis

Satu hasil penilaian dipakai bersama oleh simulator, halaman Kumpulkan hasil, ringkasan teks, dan laporan `.html`, jadi statusnya selalu sama.

- **Simulasi router**: temuan dibagi tiga. *Penghalang koneksi* (misalnya IP router di dalam pool DHCP, DHCP mati, NAT mati, pool di luar jaringan LAN) selalu membuat uji **Gagal**. *Kesalahan keamanan* (Wi-Fi terbuka, WEP) membuat hasil "Terhubung, perlu perbaikan". *Peringatan* (password lemah, kanal tumpang tindih) tidak menggagalkan uji. Hasil lama tersimpan sebelum aturan ini ditandai "Perlu diuji ulang".
- **Simulator VoIP**: setiap **Muat ulang** menerapkan seluruh file, termasuk transport. Bila tidak ada transport UDP 5060 yang aktif (protocol salah, bind kosong/salah, port bentrok), registrasi dan panggilan gagal 408, dan softphone yang sudah terdaftar dikeluarkan. Di Asterisk sungguhan perubahan transport biasanya baru berlaku setelah restart.
- **Kalkulator**: isian kosong tidak dianggap nol, nilai negatif untuk panjang, redaman, rugi, dan margin ditolak, jumlah konektor/sambungan harus bilangan bulat ≥ 0. Daya dalam dBm boleh negatif. Selama ada isian merah, kesimpulan layak/tidak layak tidak ditampilkan.
- **LKPD**: satu baris baru dinilai bila datanya lengkap. Isian yang kurang disebutkan namanya. Rugi negatif selalu diminta dicek ulang (bisa salah ketik, salah referensi OPM, atau efek "gainer" pada OTDR satu arah). LKPD 2 menandai apakah status berasal dari *hasil ukur* atau *estimasi splicer*; bila keduanya diisi, hasil ukur yang dipakai. Kartu LKPD di Kumpulkan hasil hanya menghitung baris yang sudah dinilai.

## Mengubah isi

- Teks materi, identitas, persiapan: `index.html`
- Peta pertemuan (termasuk langkah dan pembagian waktu), soal kuis, studi kasus, soal perbaiki konfigurasi, rubrik, glosarium, contoh konfigurasi simulator, contoh data LKPD: `assets/app.js`
- Perilaku simulator Asterisk: `assets/asterisk.js`
