/* Aplikasi utama: navigasi, widget materi, lab kabel RJ45, simulator VoIP, kalkulator, dan asesmen. */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tjkn:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tjkn:' + k, JSON.stringify(v)); } catch (e) { /* penyimpanan tidak tersedia */ } }
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const icon = id => `<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const fmt = (v, d) => Number(v).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Membuat grup tombol .seg yang bisa dipilih; onPick dipanggil dengan nilai data-* tombol.
  function segPick(el, key, onPick) {
    if (!el) return;
    el.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !el.contains(b)) return;
      $$('button', el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      onPick(b.dataset[key], b);
    });
  }
  const segVal = (el, key) => { const b = $('button.on', el); return b ? b.dataset[key] : null; };

  let toastTimer;
  function toast(msg) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2000);
  }
  function copyText(text) {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? 'Disalin' : 'Gagal menyalin, pilih teks secara manual');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('Disalin'), fallback);
    else fallback();
  }
  function saveFile(name, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Mengunduh ' + name);
  }

  /* ============================== Validasi isian angka ============================== */
  // Pesan kesalahan ditampilkan tepat di bawah isian (di dalam label .field).
  function fieldMsg(el, msg) {
    let s = el.nextElementSibling && el.nextElementSibling.classList.contains('ferr') ? el.nextElementSibling : null;
    if (!s) { s = document.createElement('small'); s.className = 'ferr'; if (el.id) s.id = el.id + '-err'; el.insertAdjacentElement('afterend', s); }
    s.textContent = msg; s.hidden = !msg;
    el.classList.toggle('bad', !!msg);
    if (msg) { el.setAttribute('aria-invalid', 'true'); if (s.id) el.setAttribute('aria-describedby', s.id); }
    else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
  }
  // Membaca satu isian angka menurut aturannya. Kosong berbeda dengan nol; nilai tak terhingga atau di luar
  // batas ditolak. rule: { min, max, gt (harus lebih besar dari), int, optional, minMsg, maxMsg, gtMsg }
  function numField(el, rule) {
    rule = rule || {};
    const raw = el.value.trim();
    let msg = '', v = null;
    if (el.validity && el.validity.badInput) msg = 'Bukan angka yang valid.';
    else if (raw === '') msg = rule.optional ? '' : 'Wajib diisi.';
    else {
      v = Number(raw.replace(',', '.'));
      if (!Number.isFinite(v)) msg = 'Bukan angka yang valid.';
      else if (rule.int && !Number.isInteger(v)) msg = 'Harus bilangan bulat.';
      else if (rule.gt !== undefined && !(v > rule.gt)) msg = rule.gtMsg || `Harus lebih besar dari ${fmt(rule.gt, 2)}.`;
      else if (rule.min !== undefined && v < rule.min) msg = rule.minMsg || `Tidak boleh kurang dari ${fmt(rule.min, 2)}.`;
      else if (rule.max !== undefined && v > rule.max) msg = rule.maxMsg || `Tidak boleh lebih dari ${fmt(rule.max, 2)}.`;
    }
    fieldMsg(el, msg);
    return { ok: !msg && !(raw === '' && !rule.optional), v: msg ? null : v, empty: raw === '' };
  }

  /* ============================== Tema ============================== */
  const rootEl = document.documentElement;
  function applyTheme(t) {
    if (t) rootEl.dataset.theme = t; else delete rootEl.dataset.theme;
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('#theme-btn use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  }
  applyTheme(store.get('theme', null));
  $('#theme-btn').addEventListener('click', () => {
    const cur = rootEl.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    store.set('theme', next);
    applyTheme(next);
  });

  /* ============================== Navigasi ============================== */
  const VIEWS = $$('.view').map(v => v.id.slice(2));
  const onShow = {}, onHide = {};
  let current = null;
  const sidebar = $('#sidebar'), scrim = $('#scrim');
  function openDrawer() { sidebar.classList.add('open'); scrim.hidden = false; $('#menu-btn').setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { sidebar.classList.remove('open'); scrim.hidden = true; $('#menu-btn').setAttribute('aria-expanded', 'false'); }
  $('#menu-btn').addEventListener('click', openDrawer);
  $('#tab-menu').addEventListener('click', openDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  function showTab(panel) {
    const view = panel.closest('.view');
    $$('.tab-panel', view).forEach(p => { p.hidden = p !== panel; });
    $$('[data-tab-for]', view).forEach(a => {
      const on = a.dataset.tabFor === panel.id;
      a.classList.toggle('on', on);
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) setTimeout(() => { a.parentNode.scrollLeft = a.offsetLeft - a.parentNode.offsetLeft - 24; }, 0);
    });
    store.set('tab:' + view.id, panel.id);
    panel.dispatchEvent(new CustomEvent('tabshow'));
  }
  function ensureTab(view) {
    const panels = $$('.tab-panel', view);
    if (!panels.length || panels.filter(p => !p.hidden).length === 1) return;
    const saved = store.get('tab:' + view.id, null);
    showTab(panels.find(p => p.id === saved) || panels[0]);
  }
  const TITLE = 'Jaringan Kabel & Nirkabel';
  function route() {
    let id = decodeURIComponent(location.hash.slice(1)) || 'beranda';
    let anchor = null;
    if (!VIEWS.includes(id)) {
      const el = document.getElementById(id);
      const v = el && el.closest('.view');
      if (v) { anchor = el; id = v.id.slice(2); } else id = 'beranda';
    }
    const viewChanged = current !== id;
    const panel = anchor && anchor.closest('.tab-panel');
    if (panel) showTab(panel);
    else ensureTab($('#v-' + id));
    if (viewChanged) {
      if (current && onHide[current]) onHide[current]();
      $$('.view').forEach(v => { v.hidden = v.id !== 'v-' + id; });
      current = id;
      const view = $('#v-' + id);
      $('#topbar-title').textContent = view.dataset.title;
      document.title = view.dataset.title === 'Beranda' ? TITLE : view.dataset.title + ' · ' + TITLE;
      $$('.nav-link').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
      if (/^bab\d$/.test(id)) { store.set('lastBab', id); $('.tabbar [data-tab="materi"]').setAttribute('href', '#' + id); }
      const tab = /^bab\d$|^info$|^persiapan$|^peta$|^beranda$/.test(id) ? 'materi' : id === 'referensi' || id === 'kalkulator' ? '' : id;
      $$('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
      if (onShow[id]) onShow[id]();
    }
    closeDrawer();
    if (panel && anchor === panel) {
      const head = $('.chap-head', $('#v-' + id));
      const y = head.getBoundingClientRect().bottom + window.scrollY - 60;
      if (viewChanged) window.scrollTo(0, 0);
      else if (window.scrollY > y) window.scrollTo(0, y);
    } else if (anchor) setTimeout(() => anchor.scrollIntoView({ block: 'start' }), 0);
    else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  $('.tabbar [data-tab="materi"]').setAttribute('href', '#' + store.get('lastBab', 'bab1'));
  function go(id) { if (location.hash === '#' + id) route(); else location.hash = id; }

  /* ============================== Kemajuan & peta pertemuan ============================== */
  const MEET = [
    { no: 1, bab: 1, tp: [1], pola: 'teori', alat: 'HP', topik: 'Komunikasi data, jenis sinyal, dan proses transmisi',
      tujuan: 'Menjelaskan lima elemen komunikasi data, membedakan sinyal digital dan analog, serta jenis transmisi data.',
      kegiatan: 'Asesmen diagnostik; widget lima elemen (coba putus media dan ganti protokol); Lab sinyal; animasi serial vs paralel.',
      langkah: ['Asesmen diagnostik singkat dan penyampaian tujuan.', 'Diskusi: apa yang terjadi saat kita mengirim chat? Bandingkan dengan widget lima elemen.', 'Berpasangan mencoba "Media putus" dan "Protokol berbeda", lalu menuliskan perbedaannya.', 'Mencari kode ASCII huruf awal nama, menuliskannya dalam 1 byte, lalu menggambar sinyal digitalnya.', 'Mencocokkan gambar dengan Lab sinyal; mengamati serial vs paralel.', 'Tiket keluar: Kuis Bab 1 no. 2 dan 4.'],
      bukti: 'Diagram komunikasi data saat mengirim chat dan gambar sinyal digital huruf awal nama.',
      kriteria: 'Kelima elemen berlabel tepat; kode ASCII 7 bit benar dan ditulis dalam 1 byte (8 bit dengan 0 di depan), digambar sebagai pulsa tinggi/rendah.',
      lanjut: 'Mencocokkan gambar dengan Lab sinyal bersama pasangan; mengerjakan Kuis Bab 1 no. 2 dan 4.' },
    { no: 2, bab: 1, tp: [2], pola: 'teori', alat: 'HP', topik: 'Jaringan telepon analog: hierarki, PSTN, JARLOKAT, xDSL',
      tujuan: 'Menelusuri jalur panggilan di hierarki sentral dan jalur kabel dari STO ke rumah, serta menjelaskan cara kerja xDSL.',
      kegiatan: 'Simulasi jalur panggilan; widget STO sampai pesawat telepon; spektrum ADSL dengan dan tanpa splitter; observasi tiang/kotak telepon.',
      langkah: ['Apersepsi: siapa yang masih memakai telepon rumah atau internet kabel telepon?', 'Menelusuri empat skenario di simulasi jalur panggilan dan mencatat sentral yang dilewati.', 'Mengetuk setiap perangkat di widget JARLOKAT dan membuat peta jalur kabel.', 'Membandingkan spektrum ADSL dengan dan tanpa splitter.', 'Tugas lapangan: memotret tiang/kotak telepon di sekitar rumah.', 'Tiket keluar: Kuis Bab 1 no. 3 dan 5.'],
      bukti: 'Peta jalur kabel telepon (MDF → RK → DP → KTB → roset) dan foto perangkat di lapangan dengan keterangan.',
      kriteria: 'Urutan perangkat dan ruas kabel benar; dapat menjelaskan mengapa suara dan ADSL tidak saling mengganggu.',
      lanjut: 'Mengulang widget jalur kabel sambil menyebut fungsi tiap perangkat; Kuis Bab 1 no. 3 dan 5.' },
    { no: 3, bab: 1, tp: [3], pola: 'praktik', alat: 'Lab RJ45, kabel UTP, RJ45, tang crimping, LAN tester', topik: 'Kabel koaksial, twisted pair, praktik crimping',
      tujuan: 'Membedakan kabel koaksial, UTP, dan STP, lalu membuat kabel straight dan crossover sesuai standar.',
      kegiatan: 'Widget bongkar koaksial dan pilinan; pembaca kode kabel; latihan Lab kabel RJ45 sampai lulus; praktik crimping fisik bergiliran.',
      langkah: ['Penjelasan K3: tang dan pisau pengupas, potongan kabel dibuang ke wadah.', 'Guru mendemonstrasikan pengupasan, penyusunan warna, pemotongan, dan crimping.', 'Siswa lulus latihan straight dan crossover di Lab kabel RJ45.', 'Membuat kabel straight T568B–T568B, lalu menguji dengan LAN tester.', 'Membuat kabel crossover T568A–T568B, lalu menguji.', 'Memperbaiki ujung yang gagal; mencatat pola lampu tester.', 'Merapikan alat dan refleksi.'],
      bukti: 'Kabel straight dan crossover yang lolos uji LAN tester.',
      kriteria: 'Semua lampu tester menyala sesuai pola (1-1…8-8 atau 1-3, 2-6, 3-1, 6-2); tidak ada split pair; jaket ikut terjepit.',
      lanjut: 'Latihan ulang di Lab kabel RJ45 sebelum mencoba lagi dengan konektor baru; pendampingan teman sebaya.' },
    { no: 4, bab: 2, tp: [4], pola: 'teori', alat: 'HP', topik: 'Elemen jaringan nirkabel, OSI/TCP-IP, multiple access',
      tujuan: 'Menjelaskan elemen jaringan nirkabel, memetakan lapisan OSI ke TCP/IP, dan membedakan FDMA, TDMA, CDMA.',
      kegiatan: 'Widget elemen jaringan; tabel OSI interaktif dan enkapsulasi; percobaan CDMA dua pengguna.',
      langkah: ['Apersepsi: perangkat apa saja yang dilewati saat HP membuka web lewat Wi-Fi?', 'Menjelaskan CPE, access network, dan core network dengan widget elemen.', 'Memetakan lapisan OSI ke TCP/IP dan menjalankan animasi enkapsulasi.', 'Membandingkan FDMA, TDMA, CDMA di widget berbagi spektrum.', 'Berpasangan mencoba empat kombinasi bit CDMA dan menuliskan hasil decode-nya.', 'Tiket keluar: Kuis Bab 2 no. 3 dan 4.'],
      bukti: 'Tabel lapisan OSI–TCP/IP dengan contoh protokol saat membuka web.',
      kriteria: 'Pemetaan lapisan benar; dapat menjelaskan mengapa CDMA tahan interferensi antarpengguna.',
      lanjut: 'Mengulang percobaan CDMA dengan kombinasi bit lain; Kuis Bab 2 no. 3 dan 4.' },
    { no: 5, bab: 2, tp: [4], pola: 'teori', alat: 'HP', topik: 'Tipe jaringan nirkabel, teknik komunikasi, topologi',
      tujuan: 'Mengklasifikasikan jaringan nirkabel berdasarkan jangkauan dan koneksi, serta menjelaskan teknik komunikasinya.',
      kegiatan: 'Latihan Tebak tipenya; widget mode koneksi; widget AMC.',
      langkah: ['Mengingat ulang materi pertemuan 4.', 'Menjelaskan WPAN, WLAN, WMAN, WWAN; mengerjakan latihan Tebak tipenya.', 'Membandingkan mode ad hoc, infrastructure, dan hybrid.', 'Menggeser SNR di widget AMC dan mencatat modulasi yang dipilih.', 'Mendata 5 perangkat nirkabel di rumah beserta tipe dan standarnya.', 'Refleksi dan tiket keluar.'],
      bukti: 'Daftar 5 perangkat nirkabel di rumah beserta tipe dan standarnya.',
      kriteria: 'Minimal 4 dari 5 klasifikasi tepat dengan alasan.',
      lanjut: 'Mengerjakan ulang Tebak tipenya; diskusi kelompok kecil.' },
    { no: 6, bab: 2, tp: [4], pola: 'teori', alat: 'HP', topik: 'Standar jaringan nirkabel, indoor dan outdoor',
      tujuan: 'Membandingkan standar IEEE 802.11, Bluetooth, ZigBee, NFC, dan WiMAX untuk kebutuhan tertentu.',
      kegiatan: 'Tabel standar; latihan Pilih standar yang tepat; studi kasus smart home.',
      langkah: ['Apersepsi: mengapa HP punya Wi-Fi, Bluetooth, dan NFC sekaligus?', 'Membaca tabel standar dan generasi IEEE 802.11.', 'Mengerjakan latihan Pilih standar yang tepat.', 'Berkelompok merancang smart home dan memilih standar setiap perangkat.', 'Presentasi singkat antarkelompok.', 'Tiket keluar: Kuis Bab 2 no. 1, 2, 5, 6.'],
      bukti: 'Perbandingan Bluetooth, ZigBee, dan NFC untuk satu kasus dengan alasan.',
      kriteria: 'Pilihan standar sesuai jangkauan, kecepatan, dan konsumsi daya kasusnya.',
      lanjut: 'Kuis Bab 2 no. 1, 2, 5, 6.' },
    { no: 7, bab: 3, tp: [5], pola: 'teori', alat: 'HP', topik: 'Pola pancar antena dan access point',
      tujuan: 'Memilih jenis antena sesuai area dan membaca topologi jaringan access point beserta alamat IP-nya.',
      kegiatan: 'Simulasi pola pancar dan cakupan; topologi AP dan perhitungan subnet 172.16.0.126/25.',
      langkah: ['Apersepsi: mengapa Wi-Fi sekolah kuat di satu ruang tetapi lemah di ruang lain?', 'Mencoba antena omni, sektoral, dan grid; mencatat jumlah titik tercakup.', 'Menentukan antena untuk kelas, lapangan, dan antargedung.', 'Membaca topologi AP dan menghitung subnet 172.16.0.126/25 di kalkulator.', 'Membandingkan AP tipe firmware dan sistem operasi.', 'Tiket keluar dan refleksi.'],
      bukti: 'Pilihan antena untuk kelas, lapangan, dan antargedung beserta alasan.',
      kriteria: 'Ketiga pilihan tepat (omni, sektoral, directional) dengan alasan jangkauan dan arah.',
      lanjut: 'Mengulang simulasi antena dengan memindahkan arah sampai semua klien tercakup.' },
    { no: 8, bab: 3, tp: [5], pola: 'praktik', alat: 'Simulasi router, AP/router lab', topik: 'Konfigurasi wireless router, bridge, station, repeater',
      tujuan: 'Mengonfigurasi WAN, WLAN, DHCP, dan NAT pada wireless router, serta memilih mode perangkat yang tepat.',
      kegiatan: 'Simulasi konfigurasi wireless router; widget mode perangkat; simulasi repeater; konfigurasi router fisik.',
      langkah: ['K3: memasang perangkat dengan adaptor yang sesuai; catat konfigurasi awal.', 'Menyelesaikan Simulasi konfigurasi wireless router tanpa pesan merah.', 'Reset router lab, masuk halaman admin, ganti password admin.', 'Mengatur WAN, SSID, WPA2/WPA3, IP LAN, dan pool DHCP (IP statis di luar pool).', 'Menghubungkan 2 klien, memeriksa IP yang didapat dan akses internet.', 'Mencoba mode repeater/bridge bila perangkat mendukung; tangkapan layar hasil.', 'Backup konfigurasi dan refleksi.'],
      bukti: 'Tangkapan layar simulasi tanpa peringatan merah dan konfigurasi router lab yang bisa dipakai 2 klien.',
      kriteria: 'Klien mendapat IP dari DHCP, bisa internet, keamanan WPA2/WPA3 dengan password ≥ 8 karakter.',
      lanjut: 'Membaca pesan pemeriksaan satu per satu dan memperbaikinya; pendampingan guru saat konfigurasi fisik.' },
    { no: 9, bab: 3, tp: [5], pola: 'praktik', alat: 'HP dengan Wi-Fi analyzer', topik: 'Keamanan Wi-Fi, perawatan, site survey',
      tujuan: 'Membandingkan metode keamanan Wi-Fi dan menyusun rekomendasi perawatan dari hasil site survey.',
      kegiatan: 'Tabel WEP–WPA3; pengukur kekuatan password; studi kasus Wi-Fi; site survey Wi-Fi sekolah.',
      langkah: ['Membandingkan WEP, WPA, WPA2, WPA3; menguji kekuatan password.', 'Menentukan 5 titik ukur di sekolah dan membagi tugas kelompok.', 'Site survey: mencatat SSID, kanal, dan dBm di setiap titik.', 'Mengolah data: kanal padat, titik lemah, penyebabnya.', 'Mengerjakan Studi kasus no. 1–4.', 'Menyusun rekomendasi perbaikan dan perawatan.'],
      bukti: 'Laporan site survey (kanal, dBm di 5 titik) dan rekomendasi perbaikan.',
      kriteria: 'Data lengkap; rekomendasi sesuai data (pindah kanal, tambah AP/repeater, ganti keamanan).',
      lanjut: 'Mengerjakan Studi kasus no. 3 dan 4; Kuis Bab 3.' },
    { no: 10, bab: 0, tp: [1, 2, 3, 4, 5], pola: 'asesmen', alat: 'Kertas, alat crimping, router lab', topik: 'Asesmen sumatif semester 1 (tertulis + praktik)',
      tujuan: 'Mengukur ketercapaian TP 1 sampai 5.',
      kegiatan: 'Tes tertulis (contoh di tab Sumatif) dan praktik crimping serta konfigurasi Wi-Fi.',
      langkah: ['Pengarahan tata tertib dan pembagian giliran praktik.', 'Tes tertulis.', 'Uji praktik bergiliran: crimping straight dan crossover.', 'Uji praktik: konfigurasi Wi-Fi dan pengujian 2 klien.', 'Penilaian dengan rubrik, umpan balik singkat.'],
      bukti: 'Lembar jawaban, kabel hasil praktik, konfigurasi router.',
      kriteria: 'Mencapai KKTP sekolah pada tes tertulis dan rubrik praktik.',
      lanjut: 'Remedial per TP memakai kuis dan simulasi terkait; pengayaan: desain Wi-Fi untuk satu lantai sekolah.' },
    { no: 11, bab: 4, tp: [6], pola: 'teori', alat: 'HP', topik: 'Layanan VoIP dan format paket',
      tujuan: 'Menjelaskan perjalanan suara di VoIP, keuntungan dan kekurangannya, serta isi header paket.',
      kegiatan: 'Animasi perjalanan suara; latihan keuntungan/kekurangan; widget isi paket VoIP.',
      langkah: ['Apersepsi: bandingkan telepon biasa dan panggilan lewat aplikasi chat.', 'Mengikuti animasi perjalanan suara tahap demi tahap.', 'Mengerjakan latihan keuntungan atau kekurangan.', 'Mengamati isi paket VoIP untuk beberapa codec.', 'Menghitung bandwidth 10 panggilan G.711 dan G.729.', 'Tiket keluar: Kuis Bab 4 no. 3.'],
      bukti: 'Perhitungan bandwidth 10 panggilan G.711 dan G.729.',
      kriteria: 'Bandwidth benar (±87,2 dan ±31,2 kbps per panggilan di Ethernet) dan dapat menjelaskan mengapa berbeda.',
      lanjut: 'Menghitung ulang langkah demi langkah dengan kalkulator; Kuis Bab 4 no. 3.' },
    { no: 12, bab: 4, tp: [6], pola: 'teori', alat: 'HP, laptop dengan ping', topik: 'Kualitas VoIP (latency, delay satu arah, RTT, jitter, packet loss) dan codec',
      tujuan: 'Menganalisis pengaruh delay, jitter, dan packet loss terhadap kualitas suara, membedakan RTT dengan delay satu arah, serta memilih codec.',
      kegiatan: 'Simulasi jitter buffer; mengukur RTT dengan ping; memperkirakan delay satu arah; kalkulator MOS.',
      langkah: ['Menjelaskan latency, delay, jitter, dan packet loss.', 'Mengubah satu nilai saja di simulasi jitter buffer lalu mencatat efeknya.', 'Menjalankan ping 20 kali ke server sekolah/internet dan mencatat RTT rata-rata serta variasinya.', 'Memperkirakan delay satu arah (RTT ÷ 2 bila simetris) lalu menambah delay codec dan jitter buffer.', 'Memasukkan delay satu arah ke kalkulator MOS dan menyimpulkan kelayakan.', 'Tiket keluar: Kuis Bab 4 no. 1 dan 5.'],
      bukti: 'Tabel RTT hasil ping, perkiraan delay satu arah, dan kesimpulan layak/tidak untuk VoIP.',
      kriteria: 'Tidak menyamakan RTT dengan delay satu arah; kesimpulan sesuai batas (delay satu arah ≤ 150 ms, jitter < 30 ms, loss < 1%).',
      lanjut: 'Mengulang perhitungan dengan contoh RTT dari guru; Kuis Bab 4 no. 1.' },
    { no: 13, bab: 4, tp: [6, 7], pola: 'praktik', alat: 'Simulator VoIP, PC/VM Asterisk', topik: 'Softswitch dan pengenalan Asterisk (PJSIP)',
      tujuan: 'Menjelaskan komponen dan cara kerja softswitch, lalu mengenal file konfigurasi Asterisk dengan PJSIP.',
      kegiatan: 'Topologi softswitch interaktif; mencoba contoh dasar di Simulator VoIP mode PJSIP; instalasi Asterisk di lab.',
      langkah: ['Menjelaskan komponen softswitch dan alur IP–IP serta IP–PSTN.', 'Membuka Simulator VoIP (mode Asterisk 21+ · PJSIP), membaca pjsip.conf contoh Dasar.', 'Mendaftarkan dua softphone dan melakukan panggilan; membaca diagram SIP.', 'Di lab: memasang Asterisk, mengecek versi dengan asterisk -V.', 'Menyalin pjsip.conf dan extensions.conf contoh ke server, lalu memuat ulang.', 'Memeriksa pjsip show endpoints; refleksi.'],
      bukti: 'Dua softphone terdaftar dan berhasil saling menelepon (simulator atau server lab).',
      kriteria: 'pjsip show endpoints/contacts menunjukkan kedua akun Avail; panggilan tersambung.',
      lanjut: 'Membaca catatan di Log CLI saat registrasi gagal dan memperbaikinya.' },
    { no: 14, bab: 5, tp: [7], pola: 'teori', alat: 'HP', topik: 'PBX, PABX, dan sistem hunting',
      tujuan: 'Menjelaskan PBX, PABX, arsitektur PBX, dan membedakan jenis sistem hunting.',
      kegiatan: 'Simulasi panggilan masuk ke PT X; simulasi hunting 4 saluran; merancang denah extension sekolah.',
      langkah: ['Apersepsi: bagaimana menelepon bagian tertentu di kantor besar?', 'Mencoba simulasi panggilan masuk ke PT X dengan IVR.', 'Membandingkan regular, circular, UCD, dan ANNC di simulasi hunting.', 'Berkelompok merancang denah extension sekolah.', 'Presentasi singkat dan umpan balik.', 'Tiket keluar.'],
      bukti: 'Denah extension sekolah dengan nomor dan context.',
      kriteria: 'Setiap ruangan punya extension unik; operator dan nomor darurat ditentukan.',
      lanjut: 'Mengulang simulasi hunting dan menjelaskan perbedaan regular dan circular.' },
    { no: 15, bab: 5, tp: [7], pola: 'praktik', alat: 'Simulator VoIP', topik: 'Dialplan dan extension Asterisk',
      tujuan: 'Menulis dialplan dengan context, extension literal dan pattern, voicemail, serta tes gema.',
      kegiatan: 'Penguji pattern; contoh dialplan dicoba di simulator; Perbaiki konfigurasi no. 1 dan 2.',
      langkah: ['Membahas struktur extensions.conf: [general], [globals], context.', 'Mencoba penguji pattern dengan _1XX, _NXX, dan _9X.', 'Menulis dialplan sendiri: pattern _1XX dengan Dial(PJSIP/${EXTEN},20), voicemail, dan 600 Echo.', 'Menguji di Simulator VoIP sampai daftar diagnostik bersih.', 'Mengerjakan Perbaiki konfigurasi no. 1 dan 2.', 'Mengunduh extensions.conf sebagai bukti kerja.'],
      bukti: 'File extensions.conf hasil sendiri (Unduh) dengan pattern _1XX, voicemail, dan 600 Echo.',
      kriteria: 'Semua panggilan uji berhasil; tidak ada peringatan di daftar diagnostik.',
      lanjut: 'Memulai dari contoh "Dasar" lalu mengubah satu bagian setiap kali.' },
    { no: 16, bab: 5, tp: [7], pola: 'praktik', alat: 'Simulator VoIP, server lab', topik: 'Protokol SIP dan H.323, uji panggilan di server',
      tujuan: 'Menjelaskan fungsi dan elemen SIP, membaca alur pesan SIP, dan menguji panggilan di server.',
      kegiatan: 'Animasi pesan SIP; membandingkan SIP dan H.323; Perbaiki konfigurasi no. 3 dan 4; uji di Asterisk lab.',
      langkah: ['Memutar animasi registrasi, panggilan diangkat, dan sibuk.', 'Membandingkan SIP dan H.323.', 'Mengerjakan Perbaiki konfigurasi no. 3 dan 4.', 'Di lab: membuat 3 endpoint di pjsip.conf, dialplan dengan voicemail.', 'Menguji panggilan antar-softphone; merekam pjsip show endpoints, pjsip show contacts, dan log.', 'Mengerjakan Studi kasus no. 5–7.'],
      bukti: 'Tangkapan layar pjsip show endpoints, pjsip show contacts, dan log panggilan berhasil.',
      kriteria: 'Dapat menjelaskan arti 401, 403, 404, 486, dan 488 dari log sendiri.',
      lanjut: 'Kuis Bab 5; Studi kasus no. 5–7.' },
    { no: 17, bab: 6, tp: [8], pola: 'teori', alat: 'HP', topik: 'Broadband, sejarah, struktur dan prinsip serat optik',
      tujuan: 'Menjelaskan elemen broadband, perkembangan serat optik, indeks bias, dan pemantulan total.',
      kegiatan: 'Timeline; simulasi pemantulan total; menghitung sudut kritis; widget WDM.',
      langkah: ['Apersepsi: mengapa internet rumah kini memakai serat optik?', 'Membaca timeline perkembangan serat optik.', 'Mengubah sudut dan indeks bias di simulasi pemantulan total.', 'Menghitung sudut kritis n₁ = 1,48 dan n₂ = 1,46 lalu mencocokkan dengan simulasi.', 'Menghitung net data rate WDM.', 'Tiket keluar: Kuis Bab 6 no. 4.'],
      bukti: 'Perhitungan sudut kritis n₁ = 1,48 dan n₂ = 1,46.',
      kriteria: 'Hasil ±80,6° dan dapat menjelaskan kapan cahaya keluar dari inti.',
      lanjut: 'Mengubah n₂ di simulasi dan mengamati sudut kritis; Kuis Bab 6 no. 4.' },
    { no: 18, bab: 6, tp: [8], pola: 'praktik', alat: 'Patch cord, fiber scope, cleaner, alkohol, splicer (bila ada)', topik: 'Kabel serat optik, pembersihan konektor, dan penyambungan (LKPD 1–2)',
      tujuan: 'Mengidentifikasi komponen dan jenis kabel, membersihkan dan menginspeksi konektor, serta menyambung serat.',
      kegiatan: 'Penampang kabel; kurva redaman; multimode vs singlemode; LKPD 1 pembersihan & inspeksi; LKPD 2 penyambungan.',
      langkah: ['K3 serat optik: kacamata, tidak menatap ujung konektor, wadah pecahan serat, alkohol jauh dari api.', 'Mengidentifikasi patch cord lab: jenis serat, konektor, UPC/APC.', 'LKPD 1: inspeksi, bersihkan, inspeksi ulang 4 konektor; isi tabel.', 'Guru mendemonstrasikan pengupasan, pembersihan, pemotongan, dan penyambungan.', 'LKPD 2: setiap pasangan membuat sambungan dan mencatat sudut potong serta rugi.', 'Membersihkan meja dan membuang pecahan serat; refleksi.'],
      bukti: 'Tabel LKPD 1 dan 2 (atau tabel contoh data bila alat terbatas).',
      kriteria: 'Semua konektor bersih pada inspeksi akhir; sudut potong ≤ 1°; rugi sambungan ≤ 0,1 dB (maksimum 0,3 dB).',
      lanjut: 'Bila alat terbatas, menganalisis contoh data LKPD; pendampingan saat memakai cleaver dan splicer.' },
    { no: 19, bab: 6, tp: [8], pola: 'praktik', alat: 'OPM, light source, patch cord, VFL, kalkulator', topik: 'Pengukuran redaman, analisis gangguan, FTTH dan link budget (LKPD 3–4)',
      tujuan: 'Mengukur redaman link dengan OPM dan light source, menganalisis gangguan, serta menghitung link budget FTTH.',
      kegiatan: 'LKPD 3 pengukuran; LKPD 4 analisis gangguan; widget jalur FTTH; kalkulator link budget.',
      langkah: ['K3: tidak menatap port light source dan VFL; matikan sumber saat mencabut.', 'LKPD 3: ambil referensi, ukur 4 link di 1.310 dan 1.550 nm, isi tabel.', 'Membandingkan redaman dengan batas dan menandai link yang gagal.', 'LKPD 4: menganalisis 4 kasus gangguan dari data.', 'Menelusuri jalur FTTH dan menghitung link budget untuk satu perumahan.', 'Presentasi singkat hasil analisis; refleksi.'],
      bukti: 'Tabel LKPD 3, jawaban LKPD 4, dan perhitungan link budget.',
      kriteria: 'Redaman dihitung benar di dua panjang gelombang; kesimpulan sesuai batas; penyebab gangguan tepat; daya terima di atas sensitivitas ONT + margin.',
      lanjut: 'Memakai tombol "Pakai contoh data" bila alat tidak cukup; contoh soal sumatif semester 2 no. 5.' },
    { no: 20, bab: 0, tp: [6, 7, 8], pola: 'asesmen', alat: 'Kertas, PC/VM Asterisk, softphone, alat ukur serat optik', topik: 'Asesmen sumatif semester 2 (tertulis + praktik)',
      tujuan: 'Mengukur ketercapaian TP 6 sampai 8.',
      kegiatan: 'Tes tertulis (contoh di tab Sumatif) dan praktik instalasi server VoIP (PJSIP) atau pengukuran serat optik.',
      langkah: ['Pengarahan dan pembagian giliran praktik.', 'Tes tertulis.', 'Uji praktik: konfigurasi pjsip.conf dan dialplan, lalu uji panggilan.', 'Uji praktik alternatif: pengukuran redaman dengan OPM dan analisis hasil.', 'Penilaian dengan rubrik, umpan balik singkat.'],
      bukti: 'Lembar jawaban, file konfigurasi, demonstrasi panggilan, tabel pengukuran.',
      kriteria: 'Mencapai KKTP sekolah pada tes tertulis dan rubrik praktik.',
      lanjut: 'Remedial per TP; pengayaan: menambahkan IVR dan trunk keluar.' }
  ];
  const BAB_NAME = { 0: 'Asesmen sumatif', 1: 'Bab 1 · Jaringan berbasis kabel', 2: 'Bab 2 · Jaringan nirkabel', 3: 'Bab 3 · Instalasi & perawatan nirkabel', 4: 'Bab 4 · Instalasi VoIP', 5: 'Bab 5 · SIP & Asterisk', 6: 'Bab 6 · Serat optik' };
  // Pembagian waktu per jenis pertemuan (proporsi dari total menit); total mengikuti JP yang dipilih guru.
  const POLA = {
    teori: [['Pendahuluan', .10, 'tb1'], ['Konsep & demonstrasi', .25, 'tb2'], ['Eksplorasi simulasi', .35, 'tb3'], ['Latihan & tiket keluar', .20, 'tb4'], ['Penutup & refleksi', .10, 'tb5']],
    praktik: [['Pendahuluan & K3', .10, 'tb1'], ['Demonstrasi', .15, 'tb2'], ['Praktik', .55, 'tb3'], ['Uji & bukti kerja', .10, 'tb4'], ['Penutup & beres-beres', .10, 'tb5']],
    asesmen: [['Pengarahan', .05, 'tb1'], ['Tes tertulis', .35, 'tb2'], ['Uji praktik', .50, 'tb3'], ['Umpan balik', .10, 'tb5']]
  };
  const jpCfg = () => { const c = store.get('jp', { per: 4, min: 45 }); return { per: clamp(+c.per || 4, 1, 12), min: [30, 35, 40, 45].includes(+c.min) ? +c.min : 45 }; };
  function split(pola, total) {
    const P = POLA[pola];
    const mins = P.map(([, f]) => Math.max(5, Math.round(total * f / 5) * 5));
    mins[mins.indexOf(Math.max(...mins))] += total - mins.reduce((a, b) => a + b, 0);
    return P.map(([nm, , cls], i) => [nm, mins[i], cls]);
  }
  function updateProgress() {
    const done = MEET.filter(m => store.get('meet' + m.no, false)).length;
    $('#prog-text').textContent = `${done}/${MEET.length}`;
    $('#prog-bar').style.width = (done / MEET.length * 100) + '%';
  }
  function renderMeetings() {
    const box = $('#meet-list');
    const { per, min } = jpCfg(), total = per * min;
    $('#jp-per').value = per; $('#jp-min').value = min;
    $('#jp-total').textContent = `${MEET.length} pertemuan × ${per} JP = ${MEET.length * per} JP`;
    $('#jp-note').textContent = `${per} × ${min} menit = ${total} menit per pertemuan (±${fmt(MEET.length * total / 60, 0)} jam seluruhnya). Pembagian waktu di setiap pertemuan ikut menyesuaikan.`;
    let html = '', lastBab = -1;
    MEET.forEach(m => {
      if (m.bab !== lastBab) {
        if (lastBab !== -1) html += '</div>';
        html += `<div class="meet-group"><h3>${m.bab ? `<span class="rbar b${m.bab}"></span><a href="#bab${m.bab}">${esc(BAB_NAME[m.bab])}</a>` : esc(BAB_NAME[0])}</h3>`;
        lastBab = m.bab;
      }
      const on = store.get('meet' + m.no, false);
      const tp = m.tp.length > 2 ? `TP ${m.tp[0]}-${m.tp[m.tp.length - 1]}` : 'TP ' + m.tp.join(', ');
      const seg = split(m.pola, total);
      html += `<div class="meet${on ? ' done' : ''}">
        <label class="meet-row"><input type="checkbox" data-meet="${m.no}"${on ? ' checked' : ''} aria-label="Pertemuan ${m.no} selesai"><span class="no">${m.no}</span><span class="t">${esc(m.topik)}</span></label>
        <div class="d"><span class="tag">${tp}</span><span class="tag mask">${per} JP · ${total} menit</span><span>${m.pola === 'praktik' ? 'Praktik' : m.pola === 'asesmen' ? 'Asesmen' : 'Teori + simulasi'}</span><span>Alat: ${esc(m.alat)}</span></div>
        <details class="meet-more"><summary>Rincian pertemuan</summary>
          <div class="timebar" aria-hidden="true">${seg.map(([nm, mn, cls]) => `<div class="${cls}" style="flex:${mn}" title="${esc(nm)}"><b>${mn}'</b></div>`).join("")}</div>
          <ul class="tlegend">${seg.map(([nm, mn, cls]) => `<li><i class="${cls}"></i><b>${mn} menit</b> ${esc(nm)}</li>`).join("")}</ul>
          <dl class="meet-dl">
          <dt>Tujuan</dt><dd>${esc(m.tujuan)}</dd>
          <dt>Kegiatan</dt><dd>${esc(m.kegiatan)}</dd>
          <dt>Langkah</dt><dd><ol class="list steps">${m.langkah.map(s => `<li>${esc(s)}</li>`).join('')}</ol></dd>
          <dt>Bukti kerja</dt><dd>${esc(m.bukti)}</dd>
          <dt>Kriteria keberhasilan</dt><dd>${esc(m.kriteria)}</dd>
          <dt>Tindak lanjut</dt><dd>${esc(m.lanjut)}</dd>
        </dl></details></div>`;
    });
    box.innerHTML = html + '</div>';
    $$('input[data-meet]', box).forEach(cb => cb.addEventListener('change', () => {
      store.set('meet' + cb.dataset.meet, cb.checked);
      cb.closest('.meet').classList.toggle('done', cb.checked);
      updateProgress();
    }));
  }
  ['#jp-per', '#jp-min'].forEach(s => $(s).addEventListener('change', () => {
    store.set('jp', { per: clamp(+$('#jp-per').value || 4, 1, 12), min: +$('#jp-min').value });
    const open = $$('#meet-list .meet-more').map(d => d.open);
    renderMeetings();
    $$('#meet-list .meet-more').forEach((d, i) => { d.open = open[i]; });
  }));
  renderMeetings();
  updateProgress();
  $$('input[data-save]').forEach(cb => {
    cb.checked = store.get('chk:' + cb.dataset.save, false);
    cb.addEventListener('change', () => store.set('chk:' + cb.dataset.save, cb.checked));
  });

  /* ============================== Pewarnaan konfigurasi Asterisk ============================== */
  function hlConf(line) {
    const sc = line.indexOf(';');
    let code = sc >= 0 ? line.slice(0, sc) : line;
    const com = sc >= 0 ? line.slice(sc) : '';
    let h;
    const sec = code.match(/^(\s*)(\[[^\]]*\])(.*)$/);
    if (sec) h = esc(sec[1]) + `<span class="cm-meta">${esc(sec[2])}</span>` + esc(sec[3]);
    else {
      const ex = code.match(/^(\s*)(exten|same|include)(\s*=>?\s*)(.*)$/i);
      if (ex) {
        let rest = esc(ex[4])
          .replace(/(\$\{[^}]*\}|\$\[[^\]]*\])/g, '<span class="cm-string">$1</span>')
          .replace(/(,)([A-Za-z][A-Za-z0-9_]*)(\()/g, '$1<span class="cm-builtin">$2</span>$3')
          .replace(/^([^,]*)/, '<span class="cm-number">$1</span>');
        h = esc(ex[1]) + `<span class="cm-keyword">${ex[2]}</span>` + `<span class="cm-operator">${esc(ex[3])}</span>` + rest;
      } else {
        const kv = code.match(/^(\s*)([A-Za-z0-9_-]+)(\s*=>?\s*)(.*)$/);
        h = kv ? esc(kv[1]) + `<span class="cm-type">${esc(kv[2])}</span><span class="cm-operator">${esc(kv[3])}</span>` + esc(kv[4]).replace(/(\$\{[^}]*\})/g, '<span class="cm-string">$1</span>') : esc(code);
      }
    }
    return h + (com ? `<span class="cm-comment">${esc(com)}</span>` : '');
  }
  function renderSnippet(el) {
    const code = el.dataset.code, file = el.dataset.file || 'kode';
    const lines = code.split('\n');
    const runnable = !el.dataset.norun && /extensions\.conf|sip\.conf/.test(file);
    el.innerHTML = `<div class="snippet-bar"><span class="fname">${icon('book')}${esc(file)}</span>
      <button class="btn btn-ghost small" type="button" data-act="copy">${icon('copy')}Salin</button>
      ${runnable ? `<button class="btn btn-primary small" type="button" data-act="try">${icon('call')}Coba di simulator</button>` : ''}</div>
      <pre>${lines.map((l, i) => `<span class="ln" data-n="${i + 1}">${hlConf(l) || ' '}</span>`).join('')}</pre>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      if (b.dataset.act === 'copy') copyText(code);
      else openInSim(/pjsip\.conf/.test(file) ? { mode: 'pjsip', acc: code } : /sip\.conf/.test(file) ? { mode: 'sip', acc: code } : { ext: code });
    });
  }
  $$('.snippet[data-code]').forEach(renderSnippet);

  /* ============================== Data bersama: warna kabel UTP ============================== */
  const WIRES = {
    PO: { name: 'Putih-oranye', c: '#e27a12', w: true }, O: { name: 'Oranye', c: '#e27a12' },
    PH: { name: 'Putih-hijau', c: '#2a8c45', w: true }, H: { name: 'Hijau', c: '#2a8c45' },
    PB: { name: 'Putih-biru', c: '#2160c4', w: true }, B: { name: 'Biru', c: '#2160c4' },
    PC: { name: 'Putih-coklat', c: '#7a4a2a', w: true }, C: { name: 'Coklat', c: '#7a4a2a' }
  };
  const T568 = { A: ['PH', 'H', 'PO', 'B', 'PB', 'O', 'PC', 'C'], B: ['PO', 'O', 'PH', 'B', 'PB', 'H', 'PC', 'C'] };
  const PAIR_OF = { PO: 'o', O: 'o', PH: 'h', H: 'h', PB: 'b', B: 'b', PC: 'c', C: 'c' };
  const wireStyle = k => WIRES[k].w ? `background:repeating-linear-gradient(135deg,#f4f4f0 0 5px,${WIRES[k].c} 5px 9px)` : `background:${WIRES[k].c}`;
  $$('.wire-strip').forEach(el => {
    el.innerHTML = T568[el.dataset.std].map((k, i) => `<span class="wchip" title="${WIRES[k].name}"><i style="${wireStyle(k)}"></i><b>${i + 1}</b><small>${WIRES[k].name.replace('Putih-', 'P-')}</small></span>`).join('');
  });

  /* ============================== Beranda: satu huruf, tiga media ============================== */
  (function hero() {
    const inp = $('#hero-char');
    const X0 = 14, W = 332;
    let bits = '01001000', raf = null, t0 = 0;
    function draw() {
      const ch = inp.value || ' ';
      const code = ch.charCodeAt(0);
      bits = (code > 127 ? 63 : code).toString(2).padStart(8, '0');
      $('#hero-bits').textContent = code > 127 ? 'bukan ASCII' : bits;
      const bw = W / 8;
      let d = `M${X0} ${bits[0] === '1' ? 30 : 58}`;
      [...bits].forEach((b, i) => {
        const y = b === '1' ? 30 : 58;
        d += ` L${X0 + i * bw} ${y} L${X0 + (i + 1) * bw} ${y}`;
      });
      $('#hero-cu').setAttribute('d', d);
      let a = '';
      for (let x = 0; x <= W; x += 1.5) {
        const i = Math.min(7, Math.floor(x / bw));
        const amp = bits[i] === '1' ? 15 : 4;
        a += (x ? ' L' : 'M') + (X0 + x).toFixed(1) + ' ' + (116 - amp * Math.sin(x / bw * Math.PI * 2 * 3)).toFixed(1);
      }
      $('#hero-air').setAttribute('d', a);
      $('#hero-fo').innerHTML = [...bits].map((b, i) => b === '1' ? `<rect class="m3-pulse" data-i="${i}" x="${X0 + i * bw + 3}" y="182" width="${bw - 6}" height="12" rx="6"/>` : '').join('');
    }
    function frame(ts) {
      if (!t0) t0 = ts;
      const p = ((ts - t0) / 4000) % 1;
      const x = X0 + p * W;
      const cur = $('#hero-cursor');
      cur.setAttribute('x1', x); cur.setAttribute('x2', x);
      const idx = Math.floor(p * 8);
      $$('#hero-fo .m3-pulse').forEach(r => r.classList.toggle('on', +r.dataset.i === idx));
      raf = requestAnimationFrame(frame);
    }
    inp.addEventListener('input', () => { draw(); });
    inp.addEventListener('focus', () => inp.select());
    draw();
    onShow.beranda = () => { if (!reduced && !raf) { t0 = 0; raf = requestAnimationFrame(frame); } };
    onHide.beranda = () => { cancelAnimationFrame(raf); raf = null; };
    if (reduced) $('#hero-cursor').style.display = 'none';
  })();

  /* ============================== Bab 1 ============================== */
  (function komdat() {
    const INFO = {
      sender: '<b>Pengirim (sender)</b>: perangkat yang membuat dan mengirim data, misalnya HP Andi yang mengirim chat.',
      receiver: '<b>Penerima (receiver)</b>: perangkat tujuan yang menerima dan menafsirkan data, misalnya HP Budi.',
      media: '<b>Media transmisi</b>: jalur fisik yang dilewati sinyal: kabel tembaga, serat optik, atau gelombang radio.',
      message: '<b>Pesan/data</b>: informasi yang dikirim: teks, suara, gambar, atau video, dalam bentuk bit.',
      protocol: '<b>Protokol</b>: aturan bersama tentang format, urutan, dan kecepatan data. Kedua perangkat harus memakai protokol yang sama.'
    };
    const info = $('#kd-info'), status = $('#kd-status'), msg = $('#kd-msg');
    $$('#w-komdat .kd-node').forEach(n => {
      const pick = () => { $$('#w-komdat .kd-node').forEach(x => x.classList.toggle('sel', x === n)); info.innerHTML = INFO[n.dataset.k]; };
      n.addEventListener('click', pick);
      n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    $('#kd-cut').addEventListener('change', e => $('#kd-wire').classList.toggle('cut', e.target.checked));
    let raf;
    $('#kd-send').addEventListener('click', () => {
      cancelAnimationFrame(raf);
      const cut = $('#kd-cut').checked, bad = $('#kd-proto').checked;
      const stop = cut ? 60 : 130, t0 = performance.now();
      $('#kd-msgtext').textContent = 'Halo!';
      status.textContent = 'Mengirim…';
      const step = ts => {
        const p = Math.min(1, (ts - t0) / (reduced ? 1 : 1200));
        msg.setAttribute('transform', `translate(${p * stop} 0)`);
        if (p < 1) { raf = requestAnimationFrame(step); return; }
        if (cut) { status.textContent = 'Gagal: media putus, data tidak sampai'; info.innerHTML = 'Tanpa media transmisi, sinyal tidak punya jalan. Inilah yang terjadi saat kabel putus atau Wi-Fi di luar jangkauan.'; }
        else if (bad) { $('#kd-msgtext').textContent = 'H@#l¿'; status.textContent = 'Data sampai, tetapi tidak bisa dibaca'; info.innerHTML = 'Bit-nya sampai, tetapi penerima memakai aturan (protokol) yang berbeda sehingga salah menafsirkan. Karena itu protokol disebut elemen yang menyatukan persepsi kedua pihak.'; }
        else { status.textContent = 'Terkirim dan terbaca'; info.innerHTML = 'Kelima elemen lengkap: pengirim, penerima, pesan, media, dan protokol yang sama.'; }
      };
      raf = requestAnimationFrame(step);
    });
  })();

  (function sinyal() {
    const plot = $('#sig-plot');
    let mode = 'dig', mod = 'ask';
    const NOTE = { ask: 'ASK: bit 1 dikirim dengan amplitudo besar, bit 0 dengan amplitudo kecil. Sederhana, tetapi mudah terganggu derau.', fsk: 'FSK: bit 1 memakai frekuensi tinggi, bit 0 frekuensi rendah. Dipakai modem lama dan Bluetooth.', psk: 'PSK: frekuensi dan amplitudo tetap, yang berubah fasenya (gelombang dibalik) setiap kali bit berganti nilai. Dipakai Wi-Fi.' };
    const bitsOf = t => [...t].map(c => c.charCodeAt(0).toString(2).padStart(8, '0').slice(-8));
    function axis() { return '<line class="sp-axis" x1="10" y1="60" x2="350" y2="60"/>'; }
    function draw() {
      let svg = axis();
      if (mode === 'dig') {
        const groups = bitsOf($('#sig-text').value || 'H');
        const txt = $('#sig-text').value || 'H';
        $('#sig-bits').innerHTML = groups.map((g, i) => txt.charCodeAt(i) > 127 ? `<span class="bitgrp"><b>${esc(txt[i])}</b>bukan ASCII standar</span>` : `<span class="bitgrp"><b>${esc(txt[i])}</b><i class="b0" title="bit tambahan agar genap 1 byte">${g[0]}</i>${g.slice(1)}</span>`).join(' ') + '<span class="small muted"> · ASCII standar 7 bit; bit pertama (abu-abu) adalah 0 tambahan agar genap 1 byte.</span>';
        const bits = groups.join(''), bw = 340 / bits.length;
        let d = `M10 ${bits[0] === '1' ? 25 : 95}`;
        [...bits].forEach((b, i) => { const y = b === '1' ? 25 : 95; d += ` L${10 + i * bw} ${y} L${10 + (i + 1) * bw} ${y}`; });
        svg += `<path class="sp-sig dig" d="${d}"/>`;
        if (bits.length <= 16) svg += [...bits].map((b, i) => `<text class="sp-lab" x="${10 + (i + .5) * bw}" y="14" text-anchor="middle">${b}</text>`).join('');
        svg += '<text class="sp-lab" x="352" y="28" text-anchor="end">1 = tegangan tinggi</text><text class="sp-lab" x="352" y="112" text-anchor="end">0 = rendah</text>';
      } else if (mode === 'ana') {
        const a = +$('#sig-amp').value / 100 * 48, f = +$('#sig-freq').value;
        let d = '';
        for (let x = 0; x <= 340; x += 1.5) d += (x ? ' L' : 'M') + (10 + x).toFixed(1) + ' ' + (60 - a * Math.sin(x / 340 * f * Math.PI * 2)).toFixed(1);
        svg += `<path class="sp-sig ana" d="${d}"/><text class="sp-lab" x="14" y="${60 - a - 4}">amplitudo</text><text class="sp-lab" x="352" y="112" text-anchor="end">${f} gelombang per satuan waktu</text>`;
      } else {
        const bits = bitsOf(($('#sig-text').value || 'H')[0])[0], bw = 340 / 8;
        let d = '';
        for (let x = 0; x <= 340; x += 1) {
          const i = Math.min(7, Math.floor(x / bw)), b = bits[i] === '1';
          let y;
          if (mod === 'ask') y = 60 - (b ? 40 : 10) * Math.sin(x / bw * Math.PI * 2 * 3);
          else if (mod === 'fsk') y = 60 - 36 * Math.sin(x / bw * Math.PI * 2 * (b ? 4 : 1.5));
          else y = 60 - 36 * Math.sin(x / bw * Math.PI * 2 * 3 + (b ? 0 : Math.PI));
          d += (x ? ' L' : 'M') + (10 + x) + ' ' + y.toFixed(1);
        }
        svg += `<path class="sp-sig ana" d="${d}"/>` + [...bits].map((b, i) => `<text class="sp-lab" x="${10 + (i + .5) * bw}" y="12" text-anchor="middle">${b}</text>`).join('');
        svg += [...Array(9)].map((_, i) => `<line class="sp-div" x1="${10 + i * bw}" y1="16" x2="${10 + i * bw}" y2="112"/>`).join('');
        $('#sig-modnote').textContent = NOTE[mod];
      }
      plot.innerHTML = svg;
    }
    segPick($('#sig-tabs'), 't', v => { mode = v; ['dig', 'ana', 'mod'].forEach(k => { $('#sig-' + k).hidden = k !== v; }); draw(); });
    segPick($('#sig-modtype'), 'm', v => { mod = v; draw(); });
    $('#sig-text').addEventListener('input', draw);
    ['amp', 'freq'].forEach(k => $('#sig-' + k).addEventListener('input', e => { $('#sig-' + k + '-o').textContent = k === 'amp' ? e.target.value + '%' : e.target.value + ' Hz'; draw(); }));
    draw();
  })();

  (function serpar() {
    const svg = $('#sp-svg'), bits = '01001000';
    const base = `<rect class="sp-box" x="4" y="14" width="44" height="150" rx="8"/><text class="sp-lab" x="26" y="92" text-anchor="middle" transform="rotate(-90 26 92)">Pengirim</text>
      <rect class="sp-box" x="312" y="14" width="44" height="150" rx="8"/><text class="sp-lab" x="334" y="92" text-anchor="middle" transform="rotate(-90 334 92)">Penerima</text>
      <text class="sp-lab" x="180" y="12" text-anchor="middle">Serial: 1 jalur</text><line class="sp-line" x1="48" y1="30" x2="312" y2="30"/>
      <text class="sp-lab" x="180" y="56" text-anchor="middle">Paralel: 8 jalur</text>` + [...bits].map((_, i) => `<line class="sp-line" x1="48" y1="${68 + i * 12}" x2="312" y2="${68 + i * 12}"/>`).join('');
    const bit = (x, y, b) => `<g class="sp-bit${b === '1' ? ' one' : ''}"><circle cx="${x}" cy="${y}" r="5.5"/><text x="${x}" y="${y + 3}" text-anchor="middle">${b}</text></g>`;
    svg.innerHTML = base;
    let raf;
    $('#sp-play').addEventListener('click', () => {
      cancelAnimationFrame(raf);
      const SLOT = reduced ? 1 : 450, t0 = performance.now();
      const step = ts => {
        const s = (ts - t0) / SLOT; // satuan slot
        let h = base;
        [...bits].forEach((b, i) => { const p = clamp((s - i) / 2, 0, 1); if (s >= i) h += bit(52 + p * 256, 30, b); });
        [...bits].forEach((b, i) => { const p = clamp(s / 2, 0, 1); h += bit(52 + p * 256, 68 + i * 12, b); });
        svg.innerHTML = h;
        $('#sp-note').textContent = s < 10 ? `Waktu: ${Math.min(10, s).toFixed(1)} slot. Paralel ${s >= 2 ? 'selesai di slot 2' : 'mengirim…'}, serial ${s >= 9 ? 'selesai di slot 9' : 'mengirim…'}.` : 'Paralel selesai di slot 2, serial di slot 9: paralel lebih cepat untuk jarak pendek, tetapi butuh 8 jalur dan bit-nya bisa tiba tidak serempak pada jarak jauh.';
        if (s < 10) raf = requestAnimationFrame(step);
        else $('#sp-note').textContent = 'Paralel selesai di slot 2, serial di slot 9: paralel lebih cepat untuk jarak pendek, tetapi butuh 8 jalur dan bit-nya bisa tiba tidak serempak pada jarak jauh.';
      };
      raf = requestAnimationFrame(step);
    });
  })();

  (function hirarki() {
    const N = {
      ige: [180, 22, 'IGE'], intl: [312, 22, 'Luar negeri'], pc: [180, 62, 'PC (tandem)'], sca: [80, 102, 'SC'], scb: [280, 102, 'SC'],
      tca: [80, 142, 'TC'], tcb: [280, 142, 'TC'], lea: [52, 182, 'LE/STO'], leb: [140, 182, 'LE/STO'], lec: [280, 182, 'LE/STO'],
      andi: [24, 218, 'Kamu'], teta: [80, 218, 'Tetangga'], kota: [140, 218, 'Kota lain'], pulau: [280, 218, 'Pulau lain']
    };
    const E = [['lea', 'tca'], ['leb', 'tca'], ['tca', 'sca'], ['sca', 'pc'], ['pc', 'scb'], ['scb', 'tcb'], ['tcb', 'lec'], ['pc', 'ige'], ['ige', 'intl'], ['andi', 'lea'], ['teta', 'lea'], ['kota', 'leb'], ['pulau', 'lec']];
    const R = {
      lokal: { p: ['andi', 'lea', 'teta'], n: 'Panggilan ke tetangga yang satu STO cukup disambungkan oleh sentral lokal (LE). Jalurnya paling pendek dan paling murah.' },
      kota: { p: ['andi', 'lea', 'tca', 'leb', 'kota'], n: 'Panggilan ke kota lain naik ke sentral trunk (TC) yang membawahi kedua STO, lalu turun ke STO tujuan.' },
      jauh: { p: ['andi', 'lea', 'tca', 'sca', 'pc', 'scb', 'tcb', 'lec', 'pulau'], n: 'Panggilan antarpulau naik sampai primary center (sentral tandem), lalu turun di sisi lain melalui SC, TC, dan STO tujuan.' },
      intl: { p: ['andi', 'lea', 'tca', 'sca', 'pc', 'ige', 'intl'], n: 'Panggilan internasional naik sampai international gateway exchange (IGE) yang terhubung ke jaringan negara lain.' }
    };
    function draw(r) {
      const path = R[r].p, onE = new Set();
      for (let i = 0; i < path.length - 1; i++) onE.add([path[i], path[i + 1]].sort().join('|'));
      let h = E.map(([a, b]) => `<line class="hr-edge${onE.has([a, b].sort().join('|')) ? ' on' : ''}" x1="${N[a][0]}" y1="${N[a][1]}" x2="${N[b][0]}" y2="${N[b][1]}"/>`).join('');
      h += Object.entries(N).map(([k, [x, y, t]]) => {
        const phone = ['andi', 'teta', 'kota', 'pulau', 'intl'].includes(k);
        const w = Math.max(46, t.length * 6 + 12);
        return `<g class="hr-node${path.includes(k) ? ' on' : ''}${phone ? ' ph' : ''}"><rect x="${x - w / 2}" y="${y - 10}" width="${w}" height="20" rx="${phone ? 10 : 4}"/><text x="${x}" y="${y + 4}" text-anchor="middle">${t}</text></g>`;
      }).join('');
      $('#hr-svg').innerHTML = h;
      $('#hr-note').textContent = R[r].n;
    }
    segPick($('#hr-tabs'), 'r', draw);
    draw('lokal');
  })();

  (function jarlokat() {
    const N = [['mdf', 26, 'MDF', 'STO'], ['rk', 96, 'RK', ''], ['dp', 166, 'DP', ''], ['ktb', 234, 'KTB', ''], ['roset', 290, 'Roset', ''], ['tel', 338, '☎', '']];
    const SEG = [['primer', 26, 96, 'kabel primer'], ['sekunder', 96, 166, 'kabel sekunder'], ['drop', 166, 234, 'kabel drop'], ['ikr', 234, 290, 'kabel rumah'], ['tel', 290, 338, '']];
    const INFO = {
      mdf: '<b>MDF (main distribution frame)</b>: rangka pembagi utama di STO. Di sinilah kabel dari perangkat sentral disambungkan ke kabel primer menuju pelanggan.',
      rk: '<b>RK (rumah kabel)</b>: kabinet di pinggir jalan, titik sambung kabel primer ke beberapa kabel sekunder. Pelanggan yang dekat STO bisa dicatu langsung dari MDF ke DP tanpa RK (catuan langsung).',
      dp: '<b>DP (distribution point)</b>: kotak pembagi di tiang atau dinding gedung, tempat kabel sekunder dibagi ke beberapa rumah.',
      ktb: '<b>KTB (kotak terminal batas)</b>: kotak kecil di dinding rumah, batas tanggung jawab penyedia dan pelanggan.',
      roset: '<b>Roset</b>: kotak sambung di dalam rumah (soket RJ11) tempat pesawat telepon dicolokkan.',
      tel: '<b>Pesawat telepon (CPE)</b>: perangkat pelanggan. Bisa juga modem ADSL yang memakai saluran yang sama.',
      primer: '<b>Kabel primer (feeder)</b>: kabel besar berisi ratusan pasang tembaga dari MDF ke RK, biasanya ditanam di saluran bawah tanah.',
      sekunder: '<b>Kabel sekunder (distribusi)</b>: dari RK ke DP, berisi puluhan pasang, ditanam atau digantung di tiang.',
      drop: '<b>Kabel drop (saluran penanggal)</b>: kabel 1 pasang dari DP ke rumah pelanggan.',
      ikr: '<b>Instalasi kabel rumah</b>: kabel di dalam rumah dari KTB ke roset.'
    };
    let h = SEG.map(([k, a, b, t]) => `<g class="jl-seg" data-k="${k}" tabindex="0" role="button" aria-label="${t || 'kabel telepon'}"><line class="jl-hit" x1="${a}" y1="62" x2="${b}" y2="62"/><line class="jl-line" x1="${a}" y1="62" x2="${b}" y2="62"/>${t ? `<text class="jl-lab" x="${(a + b) / 2}" y="${k === 'sekunder' || k === 'ikr' ? 100 : 92}" text-anchor="middle">${t}</text>` : ''}</g>`).join('');
    h += N.map(([k, x, t, s]) => `<g class="jl-node" data-k="${k}" tabindex="0" role="button" aria-label="${t}"><rect x="${x - 21}" y="46" width="42" height="32" rx="6"/><text x="${x}" y="66" text-anchor="middle">${t}</text>${s ? `<text class="jl-lab" x="${x}" y="38" text-anchor="middle">${s}</text>` : ''}</g>`).join('');
    h += '<text class="jl-lab" x="180" y="134" text-anchor="middle">Sentral → jalan → tiang → rumah</text>';
    const svg = $('#jl-svg');
    svg.innerHTML = h;
    $$('g[data-k]', svg).forEach(g => {
      const pick = () => { $$('g[data-k]', svg).forEach(x => x.classList.toggle('sel', x === g)); $('#jl-info').innerHTML = INFO[g.dataset.k]; };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  })();

  (function dsl() {
    const svg = $('#dsl-svg');
    // sumbu frekuensi logaritmik 100 Hz – 2 MHz
    const fx = f => 20 + (Math.log10(f) - 2) / (Math.log10(2e6) - 2) * 320;
    function draw() {
      const split = $('#dsl-split').checked;
      let h = `<line class="sp-axis" x1="20" y1="110" x2="345" y2="110"/>`;
      [[300, '300 Hz'], [4000, '4 kHz'], [25000, '25 kHz'], [138000, '138 kHz'], [1104000, '1,1 MHz']].forEach(([f, t], i) => { h += `<line class="sp-div" x1="${fx(f)}" y1="30" x2="${fx(f)}" y2="114"/><text class="sp-lab" x="${fx(f)}" y="${i % 2 ? 136 : 126}" text-anchor="middle">${t}</text>`; });
      h += `<rect class="dsl-b voice" x="${fx(300)}" y="60" width="${fx(3400) - fx(300)}" height="50" rx="3"/><text class="sp-lab" x="${(fx(300) + fx(3400)) / 2}" y="54" text-anchor="middle">Suara</text>`;
      h += `<rect class="dsl-b up" x="${fx(25000)}" y="70" width="${fx(138000) - fx(25000)}" height="40" rx="3"/><text class="sp-lab" x="${(fx(25000) + fx(138000)) / 2}" y="64" text-anchor="middle">Upstream</text>`;
      h += `<rect class="dsl-b down" x="${fx(138000)}" y="40" width="${fx(1104000) - fx(138000)}" height="70" rx="3"/><text class="sp-lab" x="${(fx(138000) + fx(1104000)) / 2}" y="34" text-anchor="middle">Downstream (unduh)</text>`;
      if (!split) { let d = ''; for (let x = fx(300); x <= fx(3400); x += 2) d += (d ? ' L' : 'M') + x + ' ' + (85 + (Math.random() - .5) * 40); h += `<path class="dsl-noise" d="${d}"/>`; }
      h += `<text class="sp-lab" x="345" y="148" text-anchor="end">frekuensi (skala log)</text>`;
      svg.innerHTML = h;
      $('#dsl-note').textContent = split
        ? 'Splitter/filter mengirim frekuensi rendah (suara) ke pesawat telepon dan frekuensi tinggi (data) ke modem. Keduanya berjalan bersamaan di kabel yang sama.'
        : 'Tanpa filter, sinyal data berfrekuensi tinggi ikut masuk ke pesawat telepon sehingga terdengar desis, dan saat telepon berdering atau diangkat koneksi internet bisa putus-nyambung.';
    }
    $('#dsl-split').addEventListener('change', draw);
    draw();
  })();

  // Penampang kabel berlapis (koaksial dan serat optik) memakai pola yang sama.
  function layerWidget(svgSel, tabsSel, infoSel, layers) {
    const svg = $(svgSel);
    let h = '';
    layers.forEach((L, i) => { h += `<rect class="ly ly${i}" data-i="${i}" x="${L.x}" y="${60 - L.h / 2}" width="${210 - L.x}" height="${L.h}" rx="${Math.min(6, L.h / 2)}" style="fill:${L.fill};${L.stroke ? `stroke:${L.stroke};stroke-dasharray:${L.dash || 'none'}` : ''}"/>`; });
    layers.forEach((L, i) => { h += `<text class="ly-num" x="${L.x + 8}" y="${60 - L.h / 2 + (i === layers.length - 1 ? -4 : 12)}">${i + 1}</text>`; });
    svg.innerHTML = h;
    $(tabsSel).innerHTML = layers.map((L, i) => `<button type="button" data-i="${i}"${i === 0 ? ' class="on"' : ''}>${i + 1}. ${L.name}</button>`).join('');
    const pick = i => {
      $$('.ly', svg).forEach(r => r.classList.toggle('dim', +r.dataset.i !== i));
      $(infoSel).innerHTML = `<b>${layers[i].name}</b>: ${layers[i].info}`;
    };
    segPick($(tabsSel), 'i', v => pick(+v));
    $$('.ly', svg).forEach(r => r.addEventListener('click', () => { const i = +r.dataset.i; $$('button', $(tabsSel)).forEach((b, k) => b.classList.toggle('on', k === i)); pick(i); }));
    pick(0);
  }
  layerWidget('#coax-svg', '#coax-tabs', '#coax-info', [
    { name: 'Outer jacket', x: 8, h: 64, fill: '#2b2f33', info: 'selubung plastik (PVC/PE) terluar yang melindungi kabel dari air, panas, dan gesekan.' },
    { name: 'Copper mesh', x: 70, h: 52, fill: '#c98a4a', stroke: '#8a5a2b', dash: '2 2', info: 'anyaman tembaga (metallic shield), sering ditambah foil, yang meredam gangguan elektromagnetik dan menjadi jalur ground.' },
    { name: 'Dielectric insulator', x: 112, h: 40, fill: '#e9eef0', info: 'isolator plastik/foam yang menjaga jarak inti dan pelindung tetap sama di sepanjang kabel, sehingga impedansinya stabil (50 atau 75 Ω).' },
    { name: 'Inner conductor', x: 160, h: 10, fill: '#d7863b', info: 'kawat tembaga di tengah (core), jalur utama sinyal.' }
  ]);

  (function twist() {
    const svg = $('#tw-svg');
    let mode = 'par';
    const bits = '1011001011010010';
    function sig(x) { const i = Math.floor(x / (340 / bits.length)); return bits[i] === '1' ? 1 : -1; }
    function noise(x) { return Math.sin(x * .09) * .7 + Math.sin(x * .23 + 1) * .4 + Math.sin(x * .51 + 2) * .25; }
    function wave(fn, y0, amp) { let d = ''; for (let x = 0; x <= 340; x += 2) d += (x ? ' L' : 'M') + (10 + x) + ' ' + (y0 - fn(x) * amp).toFixed(1); return d; }
    function draw() {
      const k = +$('#tw-noise').value / 100;
      const tw = mode === 'tw';
      const nA = x => noise(x) * k * (tw ? .8 : 1.0), nB = x => noise(x) * k * (tw ? .78 : .55);
      let h = '<text class="sp-lab" x="10" y="12">⚡ sumber gangguan (motor listrik)</text>';
      if (tw) {
        let a = '', b = '';
        for (let x = 0; x <= 340; x += 2) { a += (x ? ' L' : 'M') + (10 + x) + ' ' + (38 + Math.sin(x / 14) * 8).toFixed(1); b += (x ? ' L' : 'M') + (10 + x) + ' ' + (38 - Math.sin(x / 14) * 8).toFixed(1); }
        h += `<path class="tw-a" d="${a}"/><path class="tw-b" d="${b}"/>`;
      } else h += '<line class="tw-a" x1="10" y1="28" x2="350" y2="28"/><line class="tw-b" x1="10" y1="50" x2="350" y2="50"/>';
      h += '<text class="sp-lab" x="10" y="72">Kabel A (+sinyal + gangguan)</text>' + `<path class="sp-sig dig" d="${wave(x => sig(x) * .5 + nA(x), 92, 14)}"/>`;
      h += '<text class="sp-lab" x="10" y="118">Kabel B (−sinyal + gangguan)</text>' + `<path class="sp-sig b" d="${wave(x => -sig(x) * .5 + nB(x), 138, 14)}"/>`;
      h += '<text class="sp-lab" x="10" y="164">Di penerima: A − B</text>' + `<path class="sp-sig ana" d="${wave(x => (sig(x) * .5 + nA(x)) - (-sig(x) * .5 + nB(x)), 184, 9)}"/>`;
      svg.innerHTML = h;
    }
    segPick($('#tw-mode'), 'm', v => { mode = v; draw(); });
    $('#tw-noise').addEventListener('input', e => { $('#tw-noise-o').textContent = e.target.value + '%'; draw(); });
    draw();
  })();

  (function iso() {
    let X = 'U', Y = 'U';
    const D = {
      'U/U': 'UTP biasa tanpa pelindung. Murah dan lentur, cocok untuk rumah dan kantor dengan gangguan rendah.',
      'F/U': 'Seluruh kabel dibungkus foil. Menahan gangguan dari luar; dulu sering disebut FTP atau ScTP.',
      'S/U': 'Seluruh kabel dibungkus anyaman kawat. Kuat secara mekanis dan meredam gangguan frekuensi rendah.',
      'SF/U': 'Seluruh kabel dibungkus foil dan anyaman. Perlindungan luar ganda untuk area industri.',
      'U/F': 'Setiap pasang dibungkus foil tanpa pelindung luar. Mengurangi crosstalk antarpasang, umum pada Cat 6A.',
      'F/F': 'Foil di seluruh kabel dan di tiap pasang. Perlindungan tinggi untuk data center.',
      'S/F': 'Anyaman di seluruh kabel dan foil di tiap pasang (S/FTP). Dipakai pada Cat 7 dan Cat 8 di lingkungan bergangguan tinggi.',
      'SF/F': 'Foil dan anyaman di luar, ditambah foil di tiap pasang. Perlindungan paling lengkap.'
    };
    function draw() {
      const code = `${X}/${Y}TP`;
      $('#iso-code').textContent = code;
      $('#iso-desc').textContent = D[X + '/' + Y] + (X === 'U' && Y === 'U' ? '' : ' Pelindung harus disambungkan ke ground (konektor RJ45 berpelindung) agar efektif.');
      let h = '<circle cx="60" cy="60" r="54" class="iso-jacket"/>';
      if (X.includes('S')) h += '<circle cx="60" cy="60" r="48" class="iso-braid"/>';
      if (X.includes('F')) h += `<circle cx="60" cy="60" r="${X === 'SF' ? 44 : 48}" class="iso-foil"/>`;
      const cols = [['#e27a12'], ['#2a8c45'], ['#2160c4'], ['#7a4a2a']];
      [[40, 40], [80, 40], [40, 80], [80, 80]].forEach(([x, y], i) => {
        if (Y === 'F') h += `<circle cx="${x}" cy="${y}" r="15" class="iso-foil"/>`;
        h += `<circle cx="${x - 6}" cy="${y}" r="6" fill="${cols[i][0]}"/><circle cx="${x + 6}" cy="${y}" r="6" fill="#f4f4f0" stroke="${cols[i][0]}" stroke-width="2.4"/>`;
      });
      $('#iso-svg').innerHTML = h;
    }
    segPick($('#iso-x'), 'v', v => { X = v; draw(); });
    segPick($('#iso-y'), 'v', v => { Y = v; draw(); });
    draw();
  })();

  /* ============================== Latihan singkat di dalam materi ============================== */
  const QC = {
    jangkau: [
      { q: 'Headset nirkabel tersambung ke HP di saku.', o: ['WPAN', 'WLAN', 'WMAN', 'WWAN'], a: 0, e: 'Jangkauannya hanya di sekitar satu orang (Bluetooth), jadi WPAN.' },
      { q: 'Wi-Fi di perpustakaan sekolah.', o: ['WPAN', 'WLAN', 'WMAN', 'WWAN'], a: 1, e: 'Satu gedung atau ruangan memakai IEEE 802.11: WLAN.' },
      { q: 'Internet 4G di HP selama perjalanan antarkota.', o: ['WPAN', 'WLAN', 'WMAN', 'WWAN'], a: 3, e: 'Jaringan seluler mencakup antarkota hingga negara: WWAN.' },
      { q: 'Menghubungkan dua kampus berjarak 3 km di satu kota.', o: ['WPAN', 'WLAN', 'WMAN', 'WWAN'], a: 2, e: 'Koneksi antargedung dalam satu kota termasuk WMAN.' },
      { q: 'Smartwatch mengirim data detak jantung ke HP.', o: ['WPAN', 'WLAN', 'WMAN', 'WWAN'], a: 0, e: 'Perangkat pribadi berjarak dekat (Bluetooth Low Energy): WPAN.' }
    ],
    standar: [
      { q: 'Lampu dan sensor pintar di seluruh rumah. Baterai harus awet bertahun-tahun dan perangkat bisa saling meneruskan sinyal (mesh).', o: ['Wi-Fi 6', 'Bluetooth', 'ZigBee', 'NFC'], a: 2, e: 'ZigBee (IEEE 802.15.4) hemat daya dan mendukung topologi mesh untuk IoT.' },
      { q: 'Membayar di kasir dengan menempelkan HP.', o: ['WiMAX', 'NFC', 'ZigBee', 'Wi-Fi'], a: 1, e: 'NFC bekerja pada jarak beberapa sentimeter sehingga aman untuk transaksi.' },
      { q: 'Streaming video 4K ke smart TV di ruang keluarga.', o: ['IEEE 802.11ax (Wi-Fi 6)', 'ZigBee', 'NFC', 'Bluetooth'], a: 0, e: 'Butuh kecepatan tinggi dan stabil di dalam rumah: Wi-Fi modern.' },
      { q: 'Speaker portabel memutar musik dari HP.', o: ['WiMAX', 'NFC', 'Bluetooth', 'ZigBee'], a: 2, e: 'Bluetooth dirancang untuk menghubungkan perangkat mobile dalam jarak sekitar 10 m.' },
      { q: 'Akses broadband ke desa yang berjarak belasan km dari kota, tanpa menarik kabel.', o: ['NFC', 'WiMAX (IEEE 802.16)', 'ZigBee', 'Bluetooth'], a: 1, e: 'WiMAX dirancang untuk jangkauan metropolitan hingga puluhan km.' }
    ],
    voip: [
      { q: 'Tidak ada biaya roaming saat menelepon dari luar negeri.', o: ['Keuntungan', 'Kekurangan'], a: 0, e: 'Panggilan lewat internet tidak dikenai tarif roaming operator.' },
      { q: 'Suara putus-putus saat internet sedang lambat.', o: ['Keuntungan', 'Kekurangan'], a: 1, e: 'VoIP sangat bergantung pada kualitas koneksi internet.' },
      { q: 'Nomor extension tetap sama walaupun login dari HP atau laptop mana pun.', o: ['Keuntungan', 'Kekurangan'], a: 0, e: 'Fleksibel: nomor ikut akun, bukan kabel.' },
      { q: 'Butuh gateway agar bisa tersambung ke telepon analog biasa.', o: ['Keuntungan', 'Kekurangan'], a: 1, e: 'Integrasi dengan jaringan analog memerlukan perangkat tambahan.' },
      { q: 'Panggilan suara bisa digabung dengan video dan chat dalam satu aplikasi.', o: ['Keuntungan', 'Kekurangan'], a: 0, e: 'VoIP mudah diintegrasikan dengan layanan data lain.' },
      { q: 'Perangkat dari merek berbeda kadang tidak cocok satu sama lain.', o: ['Keuntungan', 'Kekurangan'], a: 1, e: 'Masalah interoperabilitas antarperangkat dan protokol.' }
    ]
  };
  $$('.qc[data-qc]').forEach(box => {
    const set = QC[box.dataset.qc];
    const ans = {};
    const draw = () => {
      const right = Object.entries(ans).filter(([i, k]) => set[i].a === k).length;
      box.innerHTML = set.map((q, i) => {
        const done = ans[i] !== undefined;
        return `<div class="qc-item${done ? ' done' : ''}" data-i="${i}"><p class="small"><b>${i + 1}.</b> ${esc(q.q)}</p><div class="qc-opts">${q.o.map((o, k) => `<button type="button" data-k="${k}" class="${done && k === q.a ? 'right' : done && k === ans[i] ? 'wrong' : ''}"${done ? ' disabled' : ''}>${esc(o)}</button>`).join('')}</div>${done ? `<p class="small q-expl">${ans[i] === q.a ? '<b>Tepat.</b> ' : '<b>Kurang tepat.</b> '}${esc(q.e)}</p>` : ''}</div>`;
      }).join('') + `<div class="btn-row"><span class="small muted">${Object.keys(ans).length ? `${right} dari ${Object.keys(ans).length} tepat` : 'Pilih jawaban untuk setiap situasi.'}</span>${Object.keys(ans).length ? '<button type="button" class="btn btn-ghost small" data-reset="1">Ulangi</button>' : ''}</div>`;
    };
    box.addEventListener('click', e => {
      if (e.target.closest('[data-reset]')) { Object.keys(ans).forEach(k => delete ans[k]); draw(); return; }
      const b = e.target.closest('button[data-k]');
      if (!b) return;
      ans[+b.closest('.qc-item').dataset.i] = +b.dataset.k;
      draw();
    });
    draw();
  });

  // Menghubungkan klik/Enter pada elemen SVG bertanda data-k dengan teks penjelasan.
  function tapInfo(svg, infoEl, INFO) {
    $$('[data-k]', svg).forEach(g => {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      const pick = () => { $$('[data-k]', svg).forEach(x => x.classList.toggle('sel', x === g)); infoEl.innerHTML = INFO[g.dataset.k]; };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
  }
  const box = (k, x, y, w, h, t, sub, cls) => `<g class="nd${cls ? ' ' + cls : ''}" data-k="${k}"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="8"/><text x="${x}" y="${y + (sub ? -1 : 4)}" text-anchor="middle">${t}</text>${sub ? `<text class="nd-sub" x="${x}" y="${y + 11}" text-anchor="middle">${sub}</text>` : ''}</g>`;
  const link = (x1, y1, x2, y2, cls) => `<line class="lk${cls ? ' ' + cls : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  const waves = (x, y, r) => `<path class="wv" d="M${x - r} ${y - r * .55} A${r} ${r} 0 0 1 ${x + r} ${y - r * .55}"/><path class="wv" d="M${x - r * .6} ${y - r * .35} A${r * .65} ${r * .65} 0 0 1 ${x + r * .6} ${y - r * .35}"/>`;

  /* ============================== Bab 2 ============================== */
  (function elemen() {
    const svg = $('#el-svg');
    svg.innerHTML = link(70, 60, 120, 60) + link(200, 60, 240, 60) + link(310, 60, 330, 60, 'dash') +
      box('cpe', 40, 60, 64, 44, 'CPE', 'HP, laptop') + waves(40, 34, 14) + box('an', 160, 60, 80, 44, 'Access network', 'AP, BTS') + box('cn', 274, 60, 72, 44, 'Core network', 'router, server') +
      `<text class="nd-sub" x="345" y="64" text-anchor="end">☁</text>` +
      box('mgmt', 120, 124, 200, 26, 'Network management') + box('svc', 260, 124, 160, 26, 'Network services');
    tapInfo(svg, $('#el-info'), {
      cpe: '<b>Customer premises equipment (CPE)</b>: perangkat di sisi pengguna, misalnya HP, laptop, modem, atau antena penerima di rumah.',
      an: '<b>Access network (AN)</b>: jaringan akses yang menghubungkan CPE ke inti jaringan, misalnya access point Wi-Fi, BTS seluler, atau antena pemancar.',
      cn: '<b>Core network (CN)</b>: jaringan inti berisi router, switch, server, dan jalur berkapasitas besar yang menghubungkan banyak access network ke internet.',
      mgmt: '<b>Network management</b>: elemen pendukung untuk memantau, mengonfigurasi, mengamankan, dan memperbaiki jaringan.',
      svc: '<b>Network services</b>: layanan yang berjalan di atas jaringan, seperti internet, suara, video, dan pesan.'
    });
  })();

  (function osi() {
    const L = [
      [7, 'Application', 'Layanan untuk aplikasi pengguna.', 'Data', 'HTTP, DNS, FTP, SMTP, SNMP, Telnet, SSH, SIP'],
      [6, 'Presentation', 'Format, enkripsi, dan kompresi data.', 'Data', 'JPEG, MP3, ASCII/UTF-8, enkripsi TLS'],
      [5, 'Session', 'Membuka, menjaga, dan menutup sesi komunikasi.', 'Data', 'NetBIOS, RPC'],
      [4, 'Transport', 'Memecah data menjadi segmen, nomor port, keandalan pengiriman.', 'Segment', 'TCP (andal), UDP (cepat, dipakai VoIP)'],
      [3, 'Network', 'Pengalamatan logis (IP) dan routing antarjaringan.', 'Packet', 'IP, ICMP, IGMP, ARP · perangkat: router'],
      [2, 'Data Link', 'Alamat fisik (MAC), framing, deteksi error, akses media.', 'Frame', 'Ethernet, IEEE 802.11 MAC, PPP, Frame Relay, ATM · perangkat: switch, access point'],
      [1, 'Physical', 'Mengubah bit menjadi sinyal listrik, cahaya, atau radio.', 'Bit', 'Kabel UTP, serat optik, IEEE 802.11 PHY · perangkat: hub, repeater, antena']
    ];
    const D = [['Application', 1, 3], ['Host-to-host', 4, 4], ['Internetwork', 5, 5], ['Network interface', 6, 7]];
    $('#osi-grid').innerHTML = L.map(([n, nm], i) => `<button type="button" class="osi-l" data-i="${i}" style="grid-row:${i + 1}"><b>${n}</b> ${nm}</button>`).join('') +
      D.map(([nm, a, b]) => `<div class="osi-d" style="grid-row:${a} / ${b + 1}">${nm}</div>`).join('') + '<div class="osi-h">OSI</div><div class="osi-h d">TCP/IP (DARPA)</div>';
    $('#osi-grid').addEventListener('click', e => {
      const b = e.target.closest('.osi-l'); if (!b) return;
      $$('.osi-l').forEach(x => x.classList.toggle('on', x === b));
      const [n, nm, f, pdu, pr] = L[+b.dataset.i];
      $('#osi-info').innerHTML = `<b>Lapisan ${n} · ${nm}</b>: ${f} Satuan data (PDU): <b>${pdu}</b>. Contoh: ${pr}.`;
    });
    const STEPS = [
      ['Data', [['data', 'Data aplikasi (misalnya isi pesan)']]],
      ['Segment', [['tcp', 'TCP/UDP'], ['data', 'Data']]],
      ['Packet', [['ip', 'IP'], ['tcp', 'TCP'], ['data', 'Data']]],
      ['Frame', [['mac', 'MAC/802.11'], ['ip', 'IP'], ['tcp', 'TCP'], ['data', 'Data'], ['fcs', 'FCS']]],
      ['Bit', [['bits', '0100100001100101011011000110110001101111…']]]
    ];
    let t;
    $('#osi-encap').addEventListener('click', () => {
      clearTimeout(t);
      const boxEl = $('#osi-encap-box');
      boxEl.hidden = false; boxEl.innerHTML = '';
      let i = 0;
      const step = () => {
        const [nm, parts] = STEPS[i];
        boxEl.insertAdjacentHTML('beforeend', `<div class="enc-row"><span class="enc-k">${nm}</span><div class="enc-parts">${parts.map(([c, txt]) => `<span class="enc ${c}">${txt}</span>`).join('')}</div></div>`);
        if (++i < STEPS.length) t = setTimeout(step, reduced ? 0 : 650);
      };
      step();
    });
  })();

  (function ma() {
    const svg = $('#ma-svg');
    const U = [['A', 'var(--band-1)'], ['B', 'var(--band-2)'], ['C', 'var(--band-3)']];
    const NOTE = {
      fdma: 'FDMA: pita frekuensi dibagi tiga. Setiap pengguna memakai pitanya sendiri terus-menerus. Contoh: telepon seluler analog 1G, siaran radio FM.',
      tdma: 'TDMA: semua memakai seluruh pita, tetapi bergiliran dalam slot waktu yang sangat singkat. Contoh: GSM (2G).',
      cdma: 'CDMA: semua memakai seluruh pita pada waktu yang sama. Sinyal dibedakan dengan kode unik, sehingga interferensi antarpengguna bisa dipisahkan. Contoh: 3G (WCDMA).'
    };
    function draw(m) {
      const x0 = 50, y0 = 14, cw = 48, rh = 40;
      let h = `<text class="sp-lab" x="12" y="${y0 + 60}" transform="rotate(-90 12 ${y0 + 60})" text-anchor="middle">frekuensi</text><text class="sp-lab" x="${x0 + 144}" y="166" text-anchor="middle">waktu →</text>`;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
        let fill, txt;
        if (m === 'fdma') { fill = U[r][1]; txt = U[r][0]; }
        else if (m === 'tdma') { fill = U[c % 3][1]; txt = U[c % 3][0]; }
        else { fill = 'url(#cdmaFill)'; txt = 'A+B+C'; }
        h += `<rect class="ma-cell" x="${x0 + c * cw}" y="${y0 + r * rh}" width="${cw - 3}" height="${rh - 3}" rx="4" style="fill:${fill}"/><text class="ma-t" x="${x0 + c * cw + cw / 2 - 1.5}" y="${y0 + r * rh + rh / 2 + 3}" text-anchor="middle">${txt}</text>`;
      }
      h = `<defs><linearGradient id="cdmaFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--band-1)"/><stop offset=".5" stop-color="var(--band-2)"/><stop offset="1" stop-color="var(--band-3)"/></linearGradient></defs>` + h;
      svg.innerHTML = h;
      $('#ma-note').textContent = NOTE[m];
      $('#ma-cdma').hidden = m !== 'cdma';
    }
    segPick($('#ma-tabs'), 'm', draw);
    draw('fdma');
    const CA = [1, 1, 1, 1], CB = [1, -1, 1, -1];
    function cdma() {
      const a = +segVal($('#cd-a'), 'v') ? 1 : -1, b = +segVal($('#cd-b'), 'v') ? 1 : -1;
      const sa = CA.map(c => c * a), sb = CB.map(c => c * b), air = sa.map((v, i) => v + sb[i]);
      const ra = air.map((v, i) => v * CA[i]), rb = air.map((v, i) => v * CB[i]);
      const sum = x => x.reduce((p, v) => p + v, 0);
      const f = v => (v > 0 ? '+' : '') + v;
      const row = (k, arr, extra) => `<tr><th>${k}</th>${arr.map(v => `<td>${f(v)}</td>`).join('')}<td>${extra || ''}</td></tr>`;
      $('#cd-table').innerHTML = `<thead><tr><th></th><th>c1</th><th>c2</th><th>c3</th><th>c4</th><th></th></tr></thead><tbody>` +
        row(`Andi kirim ${a > 0 ? 1 : 0} × kode`, sa) + row(`Budi kirim ${b > 0 ? 1 : 0} × kode`, sb) + row('Sinyal di udara', air, 'dijumlah') +
        row('× kode Andi', ra, `Σ/4 = ${f(sum(ra) / 4)} → <b>${sum(ra) > 0 ? 1 : 0}</b>`) + row('× kode Budi', rb, `Σ/4 = ${f(sum(rb) / 4)} → <b>${sum(rb) > 0 ? 1 : 0}</b>`) + '</tbody>';
    }
    segPick($('#cd-a'), 'v', cdma); segPick($('#cd-b'), 'v', cdma);
    cdma();
  })();

  const laptop = (k, x, y, t, sub) => box(k, x, y, 58, 30, t, sub, 'dev');
  const apNode = (k, x, y, t) => `<g class="nd ap" data-k="${k}"><circle cx="${x}" cy="${y}" r="17"/><text x="${x}" y="${y + 4}" text-anchor="middle">${t}</text></g>` + waves(x, y - 18, 12);

  (function mode() {
    const svg = $('#md-svg');
    const D = {
      adhoc: [laptop('a', 70, 50, 'Laptop A') + laptop('b', 290, 50, 'Laptop B') + laptop('c', 180, 140, 'Laptop C'), [[99, 50, 261, 50], [90, 65, 160, 125], [270, 65, 200, 125]],
        'Ad hoc (peer to peer): perangkat terhubung langsung tanpa access point, misalnya untuk berbagi file sementara. SSID, kanal, dan standar semua perangkat harus sama. Jumlah perangkat dan jangkauannya terbatas.'],
      infra: [box('net', 180, 22, 90, 26, 'Router/internet') + apNode('ap', 180, 84, 'AP') + laptop('a', 50, 140, 'Laptop') + laptop('b', 140, 150, 'HP') + laptop('c', 230, 150, 'PC') + laptop('d', 315, 140, 'Printer'),
        [[180, 35, 180, 67], [168, 96, 70, 126], [175, 100, 145, 135], [185, 100, 225, 135], [192, 96, 300, 126]],
        'Infrastructure (topologi star): semua perangkat terhubung ke access point yang mengatur lalu lintas dan menyambungkan ke jaringan kabel serta internet. Mode yang paling umum di rumah, sekolah, dan kantor.'],
      hybrid: [box('net', 180, 22, 90, 26, 'Router/internet') + apNode('ap1', 100, 84, 'AP 1') + apNode('ap2', 270, 84, 'AP 2') + laptop('a', 50, 145, 'Laptop') + laptop('b', 140, 150, 'HP') + laptop('c', 230, 150, 'HP') + laptop('d', 315, 145, 'Laptop'),
        [[160, 35, 110, 67], [200, 35, 260, 67], [92, 100, 60, 130], [108, 100, 135, 135], [262, 100, 235, 135], [278, 100, 310, 130], [169, 150, 201, 150, 'dash']],
        'Hybrid: gabungan infrastructure dan ad hoc. Beberapa AP melayani klien (star), sementara sebagian perangkat juga terhubung langsung satu sama lain (garis putus-putus). Cocok untuk jaringan skala besar.']
    };
    function draw(m) {
      const [nodes, links, note] = D[m];
      svg.innerHTML = links.map(l => link(l[0], l[1], l[2], l[3], l[4] || (m === 'adhoc' ? 'dash' : ''))).join('') + nodes;
      $('#md-note').textContent = note;
    }
    segPick($('#md-tabs'), 'm', draw);
    draw('adhoc');
  })();

  (function amc() {
    const M = [[0, 'BPSK', 1], [6, 'QPSK', 2], [12, '16-QAM', 4], [18, '64-QAM', 6], [24, '256-QAM', 8], [30, '1024-QAM', 10]];
    function draw() {
      const snr = +$('#amc-snr').value;
      $('#amc-snr-o').textContent = snr + ' dB';
      const m = M.filter(x => snr >= x[0]).pop();
      $('#amc-mod').textContent = m[1];
      $('#amc-desc').textContent = `${m[2]} bit per simbol, sekitar ${m[2]}× lebih cepat daripada BPSK. ${snr < 10 ? 'Sinyal lemah: pakai modulasi sederhana agar tidak salah baca.' : snr < 24 ? 'Sinyal sedang: modulasi menengah.' : 'Sinyal sangat bagus: titik-titik rapat masih bisa dibedakan.'}`;
      const pts = [];
      if (m[2] === 1) pts.push([-1, 0], [1, 0]);
      else { const n = Math.round(Math.sqrt(2 ** m[2])); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) pts.push([-1 + 2 * i / (n - 1), -1 + 2 * j / (n - 1)]); }
      const sig = 0.9 / Math.pow(10, snr / 20);
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - .5; };
      let h = '<line class="sp-axis" x1="60" y1="8" x2="60" y2="112"/><line class="sp-axis" x1="8" y1="60" x2="112" y2="60"/>';
      const sc = 48;
      pts.forEach(([x, y]) => {
        for (let k = 0; k < (pts.length > 64 ? 1 : 3); k++) h += `<circle class="cn-noise" cx="${(60 + (x + rnd() * sig * 3) * sc).toFixed(1)}" cy="${(60 - (y + rnd() * sig * 3) * sc).toFixed(1)}" r="1.4"/>`;
        h += `<circle class="cn-pt" cx="${60 + x * sc}" cy="${60 - y * sc}" r="${pts.length > 64 ? 1.2 : 2.6}"/>`;
      });
      $('#amc-svg').innerHTML = h;
    }
    $('#amc-snr').addEventListener('input', draw);
    draw();
  })();

  /* ============================== Bab 3 ============================== */
  (function antena() {
    const svg = $('#an-svg');
    const T = {
      omni: { g: 5, bw: 360, range: 82, use: 'Ruang kelas, rumah, kantor', note: 'Omni memancar merata ke segala arah. Klien yang dekat di arah mana pun tercakup, tetapi yang jauh tidak terjangkau.' },
      sector: { g: 15, bw: 90, range: 140, use: 'Lapangan, taman, stadion', note: 'Sektoral memusatkan pancaran pada sudut sekitar 90°. Arahkan ke area yang ingin dilayani; area di belakang antena hampir tidak mendapat sinyal.' },
      grid: { g: 24, bw: 12, range: 230, use: 'Point-to-point antargedung', note: 'Grid sangat terfokus: jangkauan paling jauh tetapi sempit. Cocok untuk menyambungkan dua titik yang saling terlihat, misalnya Gedung B.' }
    };
    const C = [[62, 52, 'Kelas 1'], [190, 58, 'Kelas 2'], [200, 168, 'Lapangan'], [48, 182, 'Kantin'], [130, 205, 'Parkir'], [160, 96, 'Lab'], [222, 28, 'Gedung B']];
    let type = 'omni';
    function r(theta, t, rot) {
      if (t.bw >= 360) return t.range;
      let d = Math.abs(((theta - rot + 540) % 360) - 180);
      const g = Math.exp(-Math.pow(d / (t.bw / 2), 2) * Math.LN2);
      return t.range * Math.max(t.bw > 30 ? 0.12 : 0.05, Math.sqrt(g));
    }
    function draw() {
      const t = T[type], rot = +$('#an-rot').value;
      $('#an-rot-o').textContent = rot + '°';
      $('#an-rot-row').hidden = type === 'omni';
      let poly = '';
      for (let a = 0; a < 360; a += 3) { const rr = r(a, t, rot); poly += `${(120 + rr * Math.cos(a * Math.PI / 180)).toFixed(1)},${(120 - rr * Math.sin(a * Math.PI / 180)).toFixed(1)} `; }
      let h = '<rect class="an-bg" x="0" y="0" width="240" height="240" rx="10"/>';
      for (let k = 1; k <= 3; k++) h += `<circle class="an-ring" cx="120" cy="120" r="${k * 50}"/>`;
      h += `<polygon class="an-cov" points="${poly}"/>`;
      let n = 0;
      C.forEach(([x, y, nm]) => {
        const dx = x - 120, dy = 120 - y, dist = Math.hypot(dx, dy), th = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const ok = dist <= r(th, t, rot);
        if (ok) n++;
        // Label titik di dekat tepi peta digeser ke dalam agar tidak terpotong.
        const lab = x > 200 ? `x="${x + 8}" text-anchor="end"` : x < 40 ? `x="${x - 8}" text-anchor="start"` : `x="${x}" text-anchor="middle"`;
        h += `<g class="an-cl${ok ? ' ok' : ''}"><circle cx="${x}" cy="${y}" r="6"/><text ${lab} y="${y - 9}">${nm}</text></g>`;
      });
      h += '<circle class="an-ap" cx="120" cy="120" r="7"/><text class="an-lab" x="120" y="138" text-anchor="middle">AP</text>';
      svg.innerHTML = h;
      $('#an-stats').innerHTML = `<div><b>${t.g} dBi</b><span>gain</span></div><div><b>${t.bw}°</b><span>lebar pancaran</span></div><div><b>${n}/${C.length}</b><span>titik tercakup</span></div><div><b class="small">${t.use}</b><span>cocok untuk</span></div>`;
      $('#an-note').textContent = t.note;
    }
    segPick($('#an-tabs'), 'a', v => { type = v; if (v === 'grid') $('#an-rot').value = 45; draw(); });
    $('#an-rot').addEventListener('input', draw);
    draw();
  })();

  (function topoAp() {
    const svg = $('#ap-svg');
    svg.innerHTML = link(60, 50, 150, 50) + link(210, 50, 270, 50) + link(270, 66, 240, 120, 'dash') + link(290, 66, 320, 120, 'dash') +
      box('inet', 40, 50, 64, 34, 'Internet', '☁') + box('rtr', 180, 50, 64, 40, 'Router', 'Cisco') + apNode('ap', 290, 50, 'AP') +
      laptop('c1', 230, 140, 'Laptop', '172.16.0.10') + laptop('c2', 322, 140, 'HP', '172.16.0.11') +
      `<text class="nd-sub" x="118" y="40" text-anchor="middle">fa1/0</text><text class="nd-sub" x="118" y="66" text-anchor="middle">10.11.0.125/25</text>` +
      `<text class="nd-sub" x="240" y="40" text-anchor="middle">fa0/0</text><text class="nd-sub" x="240" y="82" text-anchor="middle">172.16.0.126/25</text>`;
    tapInfo(svg, $('#ap-info'), {
      inet: '<b>Internet</b>: dijangkau lewat interface fa1/0 (10.11.0.125/25), alamat yang diberikan penyedia layanan.',
      rtr: '<b>Router Cisco</b>: punya dua interface di dua jaringan berbeda dan meneruskan (routing) paket di antara keduanya. fa0/0 = 172.16.0.126 sebagai gateway LAN, fa1/0 = 10.11.0.125/25 ke internet.',
      ap: '<b>Access point</b>: menjembatani klien nirkabel ke LAN kabel. AP sendiri bekerja di lapisan 2, jadi klien tetap berada di jaringan 172.16.0.0/25.',
      c1: '<b>Laptop</b>: IP 172.16.0.10/25, gateway 172.16.0.126. Masih satu jaringan dengan fa0/0 karena 172.16.0.0/25 mencakup .1 sampai .126.',
      c2: '<b>HP</b>: IP 172.16.0.11/25, gateway 172.16.0.126. Biasanya alamat ini dibagikan otomatis oleh DHCP.'
    });
  })();

  /* ============================== Alamat IP ============================== */
  function ipInt(s) {
    const p = String(s).trim().split('.');
    if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || +x > 255)) return null;
    return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3];
  }
  const ipStr = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const maskOf = pre => pre === 0 ? 0 : (0xffffffff << (32 - pre)) >>> 0;
  const isPrivate = n => (n >>> 24) === 10 || ((n >>> 20) === (172 << 4 | 1)) || ((n >>> 16) === (192 << 8 | 168));
  // Blok alamat khusus IPv4 (RFC 6890 dan turunannya); yang tidak termasuk dianggap publik.
  const IP_SPECIAL = [
    ['0.0.0.0', 8, 'warn', 'this network', 'Dipakai saat perangkat belum punya alamat (misalnya 0.0.0.0 saat meminta DHCP). Tidak diberikan ke host.', false],
    ['10.0.0.0', 8, 'ok', 'privat (RFC 1918)', 'Untuk LAN; tidak dirutekan di internet, butuh NAT untuk keluar.', true],
    ['100.64.0.0', 10, 'warn', 'shared address space / CGNAT (RFC 6598)', 'Dipakai ISP di antara pelanggan dan NAT operator. Jangan dipakai untuk LAN sendiri.', true],
    ['127.0.0.0', 8, 'warn', 'loopback', 'Menunjuk perangkat itu sendiri (localhost). Paket tidak pernah keluar ke jaringan.', true],
    ['169.254.0.0', 16, 'warn', 'link-local / APIPA (RFC 3927)', 'Diberikan otomatis oleh perangkat sendiri saat tidak mendapat jawaban DHCP. Hanya berlaku di satu segmen dan tidak dirutekan; biasanya tanda DHCP gagal.', true],
    ['172.16.0.0', 12, 'ok', 'privat (RFC 1918)', 'Untuk LAN (172.16.0.0–172.31.255.255); butuh NAT untuk ke internet.', true],
    ['192.0.0.0', 24, 'warn', 'IETF protocol assignments', 'Dicadangkan untuk keperluan protokol, bukan untuk host biasa.', true],
    ['192.0.2.0', 24, 'warn', 'dokumentasi TEST-NET-1 (RFC 5737)', 'Khusus contoh di buku dan dokumentasi; tidak dipakai di jaringan sungguhan.', true],
    ['192.88.99.0', 24, 'warn', 'relay 6to4 (usang)', 'Dahulu untuk transisi IPv6; sudah tidak dipakai.', true],
    ['192.168.0.0', 16, 'ok', 'privat (RFC 1918)', 'Untuk LAN rumah/kantor; butuh NAT untuk ke internet.', true],
    ['198.18.0.0', 15, 'warn', 'benchmarking (RFC 2544)', 'Untuk pengujian kinerja perangkat di lab.', true],
    ['198.51.100.0', 24, 'warn', 'dokumentasi TEST-NET-2 (RFC 5737)', 'Khusus contoh di buku dan dokumentasi.', true],
    ['203.0.113.0', 24, 'warn', 'dokumentasi TEST-NET-3 (RFC 5737)', 'Khusus contoh di buku dan dokumentasi.', true],
    ['224.0.0.0', 4, 'warn', 'multicast', 'Alamat tujuan untuk sekelompok penerima (misalnya streaming IPTV, protokol routing), bukan alamat satu host.', false],
    ['255.255.255.255', 32, 'warn', 'limited broadcast', 'Dikirim ke semua perangkat di segmen yang sama; tidak pernah diteruskan router.', false],
    ['240.0.0.0', 4, 'warn', 'cadangan (reserved)', 'Dicadangkan untuk masa depan; tidak dipakai host.', false]
  ];
  function ipKind(n) {
    for (const [base, pre, cls, label, note, unicast] of IP_SPECIAL) {
      const m = maskOf(pre);
      if (((n & m) >>> 0) === ((ipInt(base) & m) >>> 0)) return { cls, label, note, unicast, special: !label.startsWith('privat') };
    }
    return { cls: 'ok', label: 'publik', note: 'Dapat dirutekan di internet; diberikan oleh ISP atau registri alamat.', unicast: true, special: false };
  }

  // Ringkasan jumlah temuan simulasi router, dipakai di simulasi dan halaman Kumpulkan hasil
  const routerCountText = r => [r.penghalang ? `${r.penghalang} penghalang koneksi` : '', r.kesalahan ? `${r.kesalahan} kesalahan keamanan` : '', r.peringatan ? `${r.peringatan} peringatan` : ''].filter(Boolean).join(', ') || 'tanpa kesalahan atau peringatan';
  (function router() {
    const DEF = { wan: 'dhcp', ppp: '', nat: true, ssid: 'TJKT-XI', ch: '6', sec: 'wpa2', pass: 'tjkt2026', lan: '192.168.1.1', mask: '24', dhcp: true, d1: '192.168.1.100', d2: '192.168.1.200' };
    const F = { wan: '#rt-wan', ppp: '#rt-ppp', nat: '#rt-nat', ssid: '#rt-ssid', ch: '#rt-ch', sec: '#rt-sec', pass: '#rt-pass', lan: '#rt-lan', mask: '#rt-mask', dhcp: '#rt-dhcp', d1: '#rt-d1', d2: '#rt-d2' };
    const get = () => { const o = {}; Object.entries(F).forEach(([k, s]) => { const el = $(s); o[k] = el.type === 'checkbox' ? el.checked : el.value.trim(); }); return o; };
    const set = o => Object.entries(F).forEach(([k, s]) => { const el = $(s); if (el.type === 'checkbox') el.checked = o[k]; else el.value = o[k]; });
    set(store.get('router', DEF));
    const sync = () => { $('#rt-ppp-row').hidden = $('#rt-wan').value !== 'pppoe'; $('#rt-d1').disabled = $('#rt-d2').disabled = !$('#rt-dhcp').checked; };
    $('#rt-form').addEventListener('input', () => { sync(); store.set('router', get()); });
    $('#rt-form').addEventListener('change', () => { sync(); store.set('router', get()); });
    sync();
    $('#rt-reset').addEventListener('click', () => { set(DEF); sync(); store.set('router', DEF); $('#rt-out').innerHTML = ''; });
    // Tingkat pemeriksaan: 'ok', 'warn' (saran, tidak menggagalkan uji), 'err' (kesalahan konfigurasi yang tetap
    // memungkinkan klien terhubung, misalnya keamanan lemah), 'block' (menghalangi klien uji terhubung atau ke internet).
    // Klien uji adalah HP siswa yang memakai IP otomatis (DHCP). Hasil uji, pesan, dan rekap memakai satu sumber yang sama.
    function evaluate(c) {
      const out = [];
      const add = (lvl, t) => out.push([lvl, t]);
      const fail = { join: null, addr: null, gw: null, inet: null };
      const stop = (k, why) => { if (!fail[k]) fail[k] = why; };
      let clientIp = null;
      if (c.wan === 'pppoe' && !c.ppp) { add('block', 'WAN PPPoE butuh username dan password dari ISP. Tanpa itu router tidak mendapat internet.'); stop('inet', 'router belum mendapat internet dari ISP karena username PPPoE kosong'); }
      else add('ok', `WAN memakai ${c.wan === 'dhcp' ? 'DHCP dari ISP' : c.wan === 'pppoe' ? 'PPPoE' : 'IP statis'}.`);
      if (!c.ssid) { add('block', 'SSID masih kosong, jaringan tidak bisa ditemukan klien.'); stop('join', 'SSID kosong sehingga jaringan tidak ditemukan'); }
      else if (c.ssid.length > 32) { add('block', 'SSID maksimal 32 karakter.'); stop('join', 'SSID lebih dari 32 karakter ditolak router'); }
      else add('ok', `SSID "${c.ssid}".`);
      if (c.sec === 'open') add('err', 'Jaringan terbuka: siapa pun bisa bergabung dan lalu lintasnya tidak dienkripsi. Pakai WPA2-PSK atau WPA3.');
      else if (c.sec === 'wep') {
        add('err', 'WEP memakai RC4 dengan kunci statis dan bisa dibobol dalam hitungan menit. Ganti ke WPA2-PSK (AES) atau WPA3.');
        if (![5, 13].includes(c.pass.length)) { add('block', 'Kunci WEP harus tepat 5 atau 13 karakter.'); stop('join', 'kunci WEP tidak valid'); }
      } else {
        if (c.sec === 'wpa') add('warn', 'WPA/TKIP sudah usang. Pakai WPA2-PSK (AES) atau WPA3.');
        else add('ok', c.sec === 'wpa3' ? 'WPA3-SAE aktif. Perangkat lama yang belum mendukung WPA3 tidak bisa terhubung; bila perlu pakai mode transisi WPA2/WPA3.' : 'WPA2-PSK (AES) aktif.');
        if (c.pass.length < 8 || c.pass.length > 63) { add('block', `Password ${c.sec.toUpperCase()} harus 8–63 karakter (sekarang ${c.pass.length}). Router menolak menyimpan.`); stop('join', `password ${c.sec.toUpperCase()} ditolak router`); }
        else if (c.pass.length < 12 || /^\d+$/.test(c.pass) || /^[a-z]+$/i.test(c.pass)) add('warn', 'Password mudah ditebak. Gunakan minimal 12 karakter campuran huruf besar, kecil, angka, dan simbol.');
        else add('ok', 'Password cukup kuat.');
      }
      if (!['1', '6', '11'].includes(c.ch)) add('warn', `Kanal ${c.ch} tumpang tindih dengan kanal tetangga. Di 2,4 GHz pilih 1, 6, atau 11 sesuai hasil site survey.`);
      else add('ok', `Kanal ${c.ch} tidak tumpang tindih dengan kanal 1/6/11 lainnya.`);
      const lan = ipInt(c.lan), pre = +c.mask, m = maskOf(pre);
      if (lan === null) { add('block', `IP LAN "${c.lan}" tidak valid.`); stop('gw', `alamat router "${c.lan}" tidak valid sehingga gateway tidak ada`); }
      else {
        const net = (lan & m) >>> 0, bc = (net | (~m >>> 0)) >>> 0;
        if (lan === net || lan === bc) { add('block', `${c.lan} adalah alamat ${lan === net ? 'network' : 'broadcast'} dan tidak boleh dipakai router.`); stop('gw', `alamat router ${c.lan} adalah alamat ${lan === net ? 'network' : 'broadcast'}`); }
        else add(isPrivate(lan) ? 'ok' : 'warn', `LAN ${ipStr(net)}/${pre}, router di ${c.lan}${isPrivate(lan) ? '.' : `. Alamat ini termasuk ${ipKind(lan).label}, bukan alamat privat; LAN sebaiknya memakai 10.x, 172.16–31.x, atau 192.168.x.`}`);
        if (!c.dhcp) { add('block', 'DHCP server mati. Klien yang memakai IP otomatis, seperti HP siswa di uji ini, hanya mendapat alamat link-local 169.254.x.x. Aktifkan DHCP, atau isi IP manual di setiap klien.'); stop('addr', 'tidak ada DHCP server sehingga HP hanya mendapat alamat link-local 169.254.x.x'); }
        else {
          const a = ipInt(c.d1), b = ipInt(c.d2);
          if (a === null || b === null) { add('block', 'Alamat awal/akhir pool DHCP tidak valid.'); stop('addr', 'pool DHCP tidak valid sehingga tidak ada alamat yang dibagikan'); }
          else if (((a & m) >>> 0) !== net || ((b & m) >>> 0) !== net) { add('block', `Pool DHCP ${c.d1}–${c.d2} berada di luar jaringan LAN ${ipStr(net)}/${pre}. Klien mendapat IP yang tidak bisa menjangkau gateway ${c.lan}.`); clientIp = c.d1; stop('gw', `mendapat ${c.d1} yang berada di luar jaringan ${ipStr(net)}/${pre}, sehingga gateway ${c.lan} tidak terjangkau`); }
          else if (a > b) { add('block', 'Alamat awal pool lebih besar daripada alamat akhir.'); stop('addr', 'pool DHCP terbalik sehingga tidak ada alamat yang dibagikan'); }
          else if (a === net || b === bc) { add('block', 'Pool DHCP tidak boleh memuat alamat network atau broadcast.'); stop('addr', 'pool DHCP memuat alamat network/broadcast sehingga router menolaknya'); }
          else if (lan >= a && lan <= b) {
            clientIp = c.d1;
            add('block', `IP router ${c.lan} berada di dalam pool DHCP ${c.d1}–${c.d2}, sehingga alamat router bisa dibagikan ke klien dan terjadi konflik IP. Geser pool, misalnya mulai dari .100.`);
            stop('gw', a === lan ? `mendapat ${c.d1}, alamat yang sama dengan router (gateway). Terjadi konflik IP sehingga gateway tidak bisa dijangkau`
              : `pool DHCP memuat alamat router ${c.lan}, sehingga klien bisa mendapat alamat yang sama dengan gateway (konflik IP). Router menolak konfigurasi ini`);
          } else { add('ok', `DHCP membagikan ${b - a + 1} alamat (${c.d1}–${c.d2}).`); clientIp = c.d1; }
        }
      }
      if (!c.nat) { add('block', 'NAT mati: klien ber-IP privat tidak bisa keluar ke internet karena alamat privat tidak dirutekan di internet.'); stop('inet', 'NAT mati sehingga alamat privat tidak bisa keluar ke internet'); }
      const ssid = c.ssid || '(tanpa nama)';
      let klien;
      if (fail.join) klien = `HP siswa gagal terhubung ke "${ssid}": ${fail.join}.`;
      else if (fail.addr) klien = `HP siswa terhubung ke Wi-Fi "${ssid}", tetapi ${fail.addr}. Internet tidak jalan.`;
      else if (fail.gw) klien = `HP siswa terhubung ke Wi-Fi "${ssid}", tetapi ${fail.gw}. Internet tidak jalan.`;
      else if (fail.inet) klien = `HP siswa terhubung, mendapat IP ${clientIp}/${pre} dengan gateway ${c.lan}, tetapi tidak bisa membuka internet: ${fail.inet}.`;
      else klien = `HP siswa terhubung ke "${ssid}", mendapat IP ${clientIp}/${pre}, gateway dan DNS ${c.lan}, dan bisa membuka internet.`;
      const n = lvl => out.filter(o => o[0] === lvl).length;
      const penghalang = n('block'), kesalahan = n('err'), peringatan = n('warn');
      const hasil = penghalang ? 'err' : kesalahan ? 'warn' : 'ok';
      const label = penghalang ? 'Gagal' : kesalahan ? 'Terhubung, perlu perbaikan' : 'Berhasil';
      return { out, hasil, label, klien, penghalang, kesalahan, peringatan };
    }
    $('#rt-apply').addEventListener('click', () => {
      const c = get(), r = evaluate(c);
      store.set('router-last', { v: 2, waktu: new Date().toLocaleString('id-ID'), hasil: r.hasil, label: r.label, klien: r.klien, penghalang: r.penghalang, kesalahan: r.kesalahan, peringatan: r.peringatan,
        ssid: c.ssid, keamanan: c.sec, kanal: c.ch, lan: c.lan + '/' + c.mask, dhcp: c.dhcp ? c.d1 + '–' + c.d2 : 'mati' });
      const icon2 = { ok: '✓', warn: '!', err: '✕', block: '✕' };
      $('#rt-out').innerHTML = `<div class="check-head ${r.hasil}"><b>Uji klien: ${esc(r.label)}.</b> ${esc(r.klien)}</div>` +
        r.out.map(([l, t]) => `<div class="check ${l === 'block' ? 'err block' : l}"><span class="ci">${icon2[l]}</span><span>${l === 'block' ? '<b>Menghalangi koneksi:</b> ' : l === 'err' ? '<b>Perlu diperbaiki:</b> ' : ''}${esc(t)}</span></div>`).join('') +
        `<p class="small muted">${esc(routerCountText(r))}. Peringatan tidak menggagalkan uji; penghalang koneksi selalu menggagalkan uji.</p>`;
    });
  })();

  (function apmode() {
    const svg = $('#am-svg');
    const D = {
      bridge: [box('inet', 46, 40, 70, 30, 'Internet') + box('sw', 180, 40, 96, 34, 'Switch', 'port 1 · port 2') + laptop('pc', 300, 40, 'PC1') + link(81, 40, 132, 40) + link(228, 40, 271, 40) +
        '<text class="nd-sub" x="106" y="32" text-anchor="middle">10.10.10.1/27</text><text class="nd-sub" x="250" y="32" text-anchor="middle">10.10.10.2/27</text><text class="nd-sub" x="180" y="96" text-anchor="middle">port 2 dijadikan bridge: PC1 satu jaringan dengan internet</text>',
        'Model bridge pada switch: port 1 terhubung ke internet dengan IP 10.10.10.1/27, port 2 diatur sebagai bridge sehingga PC1 (10.10.10.2/27) berada di jaringan yang sama dan langsung terhubung ke internet. Bridge menyatukan dua segmen menjadi satu jaringan.'],
      station: [apNode('ap', 60, 60, 'AP') + `<text class="nd-sub" x="60" y="98" text-anchor="middle">memancarkan SSID</text>` + box('st', 290, 60, 90, 36, 'AP mode', 'station') + link(78, 60, 244, 60, 'air') + laptop('pc', 290, 140, 'PC/switch') + link(290, 78, 290, 125) + `<text class="nd-sub" x="160" y="52" text-anchor="middle">hanya menerima, tidak memancarkan SSID</text>`,
        'Wireless station (client): perangkat tidak memancarkan SSID, hanya menerima sinyal dari AP lain lalu meneruskannya ke perangkat berkabel di belakangnya. Umum untuk koneksi jarak jauh point-to-point atau point-to-multipoint.'],
      wbridge: [apNode('ap', 60, 60, 'AP') + box('wb', 220, 60, 96, 36, 'Wireless bridge', '192.168.11.1') + link(78, 60, 172, 60, 'air') + laptop('pc', 220, 140, 'PC tanpa', 'kartu wireless') + link(220, 78, 220, 125) +
        '<text class="nd-sub" x="320" y="64" text-anchor="middle">diatur lewat</text><text class="nd-sub" x="320" y="76" text-anchor="middle">browser</text>',
        'Wireless bridge: solusi untuk PC yang tidak punya kartu wireless (PCI card). PC dihubungkan dengan kabel UTP ke perangkat bridge, lalu bridge terhubung ke AP lewat Wi-Fi. Konfigurasi dilakukan lewat browser ke alamat IP bawaan perangkat (lihat label atau manual).'],
      repeater: [apNode('ap', 40, 70, 'AP') + apNode('rp', 180, 70, 'Rep') + laptop('hp', 315, 70, 'HP') + link(58, 70, 162, 70, 'air') + link(198, 70, 286, 70, 'air') + `<text class="nd-sub" x="110" y="104" text-anchor="middle">sinyal diterima…</text><text class="nd-sub" x="245" y="104" text-anchor="middle">…lalu dipancarkan ulang</text>`,
        'Repeater menerima sinyal AP lalu memancarkannya ulang dengan SSID yang sama atau berbeda, sehingga jangkauan bertambah. Repeater dengan satu radio harus bergantian menerima dan mengirim, jadi kecepatan maksimumnya kira-kira setengah.']
    };
    function draw(m) { svg.innerHTML = D[m][0]; $('#am-note').textContent = D[m][1]; }
    segPick($('#am-tabs'), 'm', draw);
    draw('bridge');
  })();

  // Perkiraan RSSI Wi-Fi 2,4 GHz di dalam ruang: 20 dBm + 2 dBi + 2 dBi − (40,2 + 30·log10 d) − 5 dB/dinding
  const rssiAt = (d, walls) => 24 - (40.2 + 30 * Math.log10(Math.max(1, d))) - walls * 5;
  const rateAt = r => r >= -65 ? 72 : r >= -70 ? 58 : r >= -75 ? 39 : r >= -80 ? 19 : r >= -86 ? 6.5 : 0;
  const rssiLabel = r => r >= -67 ? ['ok', 'Bagus'] : r >= -70 ? ['ok', 'Cukup'] : r >= -80 ? ['warn', 'Lemah'] : r >= -90 ? ['err', 'Sangat lemah'] : ['err', 'Putus'];
  (function repeater() {
    const svg = $('#rp-svg');
    const X = d => 30 + d / 60 * 320, Y = r => 12 + (-30 - r) / 65 * 118;
    function draw() {
      const d = +$('#rp-d').value, w = +$('#rp-w').value, on = $('#rp-on').checked;
      $('#rp-d-o').textContent = d + ' m'; $('#rp-w-o').textContent = w;
      const wallsAt = x => w * Math.min(1, x / Math.max(d, 1));
      let h = '';
      [-30, -50, -67, -80, -90].forEach(r => { h += `<line class="sp-div" x1="30" y1="${Y(r)}" x2="350" y2="${Y(r)}"/><text class="sp-lab" x="26" y="${Y(r) + 3}" text-anchor="end">${r}</text>`; });
      [0, 20, 40, 60].forEach(m => { h += `<text class="sp-lab" x="${X(m)}" y="146" text-anchor="${m === 60 ? 'end' : 'middle'}">${m} m</text>`; });
      let p = '';
      for (let x = 1; x <= 60; x += 1) p += (x > 1 ? ' L' : 'M') + X(x).toFixed(1) + ' ' + Y(Math.max(-95, rssiAt(x, wallsAt(x)))).toFixed(1);
      h += `<path class="rp-c" d="${p}"/>`;
      const wB = wallsAt(20);
      if (on) {
        let q = '';
        for (let x = 21; x <= 60; x += 1) q += (x > 21 ? ' L' : 'M') + X(x).toFixed(1) + ' ' + Y(Math.max(-95, rssiAt(x - 20, Math.max(0, wallsAt(x) - wB)))).toFixed(1);
        h += `<path class="rp-c rep" d="${q}"/><circle class="rp-dot" cx="${X(20)}" cy="${Y(rssiAt(20, wB))}" r="4"/><text class="sp-lab" x="${X(20)}" y="${Y(rssiAt(20, wB)) - 8}" text-anchor="middle">repeater</text>`;
      }
      h += `<line class="rp-cl" x1="${X(d)}" y1="14" x2="${X(d)}" y2="132"/><text class="sp-lab" x="${X(d)}" y="11" text-anchor="middle">klien</text>`;
      svg.innerHTML = h;
      const direct = rssiAt(d, w);
      const viaRep = on && d > 20 ? rssiAt(d - 20, Math.max(0, w - wB)) : null;
      const useRep = viaRep !== null && viaRep > direct;
      const best = useRep ? viaRep : direct;
      const rate = rateAt(best) / (useRep ? 2 : 1);
      const [cls, lab] = rssiLabel(best);
      $('#rp-stats').innerHTML = `<div><b>${direct.toFixed(0)} dBm</b><span>langsung dari AP</span></div>${on ? `<div><b>${viaRep === null ? '–' : viaRep.toFixed(0) + ' dBm'}</b><span>lewat repeater</span></div>` : ''}<div><b class="tag ${cls}">${lab}</b><span>kualitas</span></div><div><b>${rate ? '±' + fmt(rate, rate < 10 ? 1 : 0) + ' Mbps' : 'putus'}</b><span>perkiraan kecepatan${useRep ? ' (½ karena repeater)' : ''}</span></div>`;
    }
    ['rp-d', 'rp-w', 'rp-on'].forEach(id => $('#' + id).addEventListener('input', draw));
    draw();
  })();

  (function pass() {
    const COMMON = ['password', '12345678', '123456789', '1234567890', 'qwerty', 'qwertyui', 'admin', 'admin123', 'iloveyou', 'sekolah', 'bismillah', 'indonesia', 'smk12345', 'wifigratis', 'internet'];
    const human = s => s < 1 ? 'kurang dari 1 detik' : s < 3600 ? `${Math.round(s / 60) || 1} menit` : s < 86400 ? `${Math.round(s / 3600)} jam` : s < 31536000 ? `${Math.round(s / 86400)} hari` : s < 31536000 * 1e6 ? `${fmt(s / 31536000, 0)} tahun` : 'lebih dari sejuta tahun';
    function calc() {
      const p = $('#pw-in').value;
      let set = 0;
      if (/[a-z]/.test(p)) set += 26; if (/[A-Z]/.test(p)) set += 26; if (/\d/.test(p)) set += 10; if (/[^A-Za-z0-9]/.test(p)) set += 33;
      let bits = p.length * Math.log2(Math.max(set, 1));
      const common = COMMON.some(c => p.toLowerCase().includes(c)) || /^(.)\1+$/.test(p);
      if (common) bits = Math.min(bits, 12);
      const secs = Math.pow(2, bits) / 2 / 1e6;
      const lvl = p.length < 8 ? ['err', 'Ditolak'] : common || secs < 86400 ? ['err', 'Lemah'] : secs < 31536000 ? ['warn', 'Sedang'] : secs < 31536000 * 1000 ? ['ok', 'Kuat'] : ['ok', 'Sangat kuat'];
      const bar = $('#pw-bar');
      bar.style.width = Math.min(100, bits / 80 * 100) + '%';
      bar.style.background = `var(--${lvl[0] === 'err' ? 'err' : lvl[0] === 'warn' ? 'warn' : 'ok'})`;
      $('#pw-out').innerHTML = `<span class="tag ${lvl[0]}">${lvl[1]}</span> ${p.length} karakter dari ${set} jenis simbol (±${Math.round(bits)} bit). ` +
        (p.length < 8 ? 'WPA2/WPA3 menolak password kurang dari 8 karakter.' : common ? 'Mengandung kata/pola yang umum dipakai, sehingga dicoba paling awal oleh penyerang.' : `Perkiraan waktu mencoba semua kombinasi dengan 1 juta tebakan per detik: ${human(secs)}.`);
    }
    $('#pw-in').addEventListener('input', calc);
    calc();
  })();

  /* ============================== Bab 4 ============================== */
  const CODEC = [
    { id: 'g711', name: 'G.711 (ulaw/alaw)', kbps: 64, frame: 10, fb: 80, ie: 0, bpl: 25.1 },
    { id: 'g729', name: 'G.729', kbps: 8, frame: 10, fb: 10, ie: 11, bpl: 19 },
    { id: 'g7231', name: 'G.723.1 (5,3 kbps)', kbps: 5.3, frame: 30, fb: 20, ie: 15, bpl: 16.1 },
    { id: 'g726', name: 'G.726 (32 kbps)', kbps: 32, frame: 10, fb: 40, ie: 7, bpl: 20 },
    { id: 'g728', name: 'G.728', kbps: 16, frame: 10, fb: 20, ie: 7, bpl: 17 },
    { id: 'gsm', name: 'GSM (13 kbps)', kbps: 13.2, frame: 20, fb: 33, ie: 20, bpl: 10 },
    { id: 'ilbc', name: 'iLBC (15,2 kbps)', kbps: 15.2, frame: 20, fb: 38, ie: 11, bpl: 32 },
    { id: 'speex', name: 'Speex (15 kbps)', kbps: 15, frame: 20, fb: 38, ie: 11, bpl: 25 },
    { id: 'opus', name: 'Opus (24 kbps, suara)', kbps: 24, frame: 20, fb: 60, ie: 0, bpl: 30 }
  ];
  function voipBw(c, ptime, l2) {
    const pt = Math.max(c.frame, Math.ceil(ptime / c.frame) * c.frame);
    const pay = Math.round(pt / c.frame * c.fb), pkt = pay + 12 + 8 + 20 + l2, pps = 1000 / pt;
    return { pt, pay, pkt, pps, kbps: pkt * 8 * pps / 1000, over: (pkt - pay) / pkt * 100 };
  }
  // E-model ITU-T G.107 yang disederhanakan
  function emodel(c, delay, jitter, loss) {
    const d = delay + jitter * 2 + 10;
    const id = 0.024 * d + (d > 177.3 ? 0.11 * (d - 177.3) : 0);
    const ie = c.ie + (95 - c.ie) * loss / (loss + c.bpl);
    const R = 93.2 - id - ie;
    const mos = R <= 0 ? 1 : R >= 100 ? 4.5 : 1 + 0.035 * R + R * (R - 60) * (100 - R) * 7e-6;
    const lab = R >= 90 ? ['ok', 'Sangat baik'] : R >= 80 ? ['ok', 'Baik'] : R >= 70 ? ['warn', 'Cukup, sebagian pengguna kurang puas'] : R >= 60 ? ['err', 'Buruk'] : ['err', 'Sangat buruk'];
    return { R, mos, lab };
  }
  const codecOpts = sel => { $(sel).innerHTML = CODEC.map(c => `<option value="${c.id}">${c.name}</option>`).join(''); };

  (function voipflow() {
    const S = [
      ['Mikrofon', 'Suara (getaran udara) diubah mikrofon menjadi sinyal listrik analog.'],
      ['ADC', 'Analog-to-digital converter mencuplik sinyal 8.000 kali per detik dan mengubahnya menjadi angka (bit).'],
      ['Codec', 'Codec memampatkan data suara. G.711 tanpa kompresi (64 kbps), G.729 hanya 8 kbps.'],
      ['Paket', 'Setiap 20 ms suara dibungkus menjadi satu paket: header RTP, UDP, IP, lalu header jaringan.'],
      ['Jaringan IP', 'Paket berjalan lewat router bersama data lain. Di sini bisa terjadi delay, jitter, dan packet loss.'],
      ['Jitter buffer', 'Penerima menampung paket sebentar dan mengurutkannya (pakai nomor urut RTP) agar diputar dengan jeda yang rata.'],
      ['Decode + DAC', 'Codec membuka kembali data, lalu DAC mengubah angka menjadi sinyal listrik analog.'],
      ['Speaker', 'Speaker mengubah sinyal listrik menjadi suara yang didengar lawan bicara.']
    ];
    $('#vf-steps').innerHTML = S.map(([t], i) => `<button type="button" class="vf" data-i="${i}"><b>${i + 1}</b>${t}</button>`).join('<span class="vf-arr" aria-hidden="true">→</span>');
    let cur = -1, tm;
    const show = i => { cur = i; $$('#vf-steps .vf').forEach((b, k) => { b.classList.toggle('on', k === i); b.classList.toggle('past', k < i); }); $('#vf-info').innerHTML = `<b>${i + 1}. ${S[i][0]}</b>: ${S[i][1]}`; };
    $('#vf-steps').addEventListener('click', e => { const b = e.target.closest('.vf'); if (b) { clearTimeout(tm); show(+b.dataset.i); } });
    $('#vf-next').addEventListener('click', () => { clearTimeout(tm); show((cur + 1) % S.length); });
    $('#vf-play').addEventListener('click', () => { clearTimeout(tm); let i = 0; const step = () => { show(i); if (++i < S.length) tm = setTimeout(step, 1600); }; step(); });
    show(0);
  })();

  (function header() {
    codecOpts('#hd-codec');
    function draw() {
      const c = CODEC.find(x => x.id === $('#hd-codec').value), r = voipBw(c, +$('#hd-ptime').value, 18);
      const parts = [['eth', 'Ethernet', 18], ['ip', 'IP', 20], ['udp', 'UDP', 8], ['rtp', 'RTP', 12], ['pay', 'Payload', r.pay]];
      $('#hd-pkt').innerHTML = parts.map(([k, t, b]) => `<span class="pk ${k}" style="flex:${Math.max(b, 6)}"><b>${t}</b>${b} B</span>`).join('');
      $('#hd-stats').innerHTML = `<div><b>${r.pt} ms</b><span>suara per paket${r.pt !== +$('#hd-ptime').value ? ' (kelipatan bingkai codec)' : ''}</span></div><div><b>${r.pkt} B</b><span>ukuran paket</span></div><div><b>${fmt(r.pps, r.pps % 1 ? 1 : 0)}</b><span>paket per detik</span></div><div><b>${fmt(r.over, 0)}%</b><span>porsi header</span></div><div><b>${fmt(r.kbps, 1)} kbps</b><span>per arah</span></div>`;
    }
    $('#hd-codec').addEventListener('change', draw); $('#hd-ptime').addEventListener('change', draw);
    draw();
  })();

  (function jitter() {
    const svg = $('#jt-svg');
    let seed = 11;
    const N = 12, BASE = 40, X = t => 20 + t / 480 * 330;
    function rnd(s) { let x = Math.sin(s) * 10000; return x - Math.floor(x); }
    function draw() {
      const J = +$('#jt-j').value, B = +$('#jt-b').value, L = +$('#jt-l').value;
      $('#jt-j-o').textContent = J + ' ms'; $('#jt-b-o').textContent = B + ' ms'; $('#jt-l-o').textContent = L + '%';
      let h = '<text class="sp-lab" x="20" y="16">Dikirim (tiap 20 ms)</text><text class="sp-lab" x="20" y="62">Tiba di penerima</text><text class="sp-lab" x="20" y="108">Diputar</text>';
      let late = 0, lost = 0;
      for (let i = 0; i < N; i++) {
        const send = i * 20, arr = send + BASE + rnd(seed * 31 + i) * J, play = send + BASE + B;
        const isLost = rnd(seed * 97 + i * 7) < L / 100;
        const isLate = !isLost && arr > play;
        if (isLost) lost++; else if (isLate) late++;
        h += `<rect class="jt-s" x="${X(send)}" y="22" width="${X(20) - X(0) - 2}" height="14" rx="2"/>`;
        if (isLost) h += `<text class="jt-x" x="${X(send + BASE) + 4}" y="80">✕</text>`;
        else h += `<rect class="jt-a${isLate ? ' late' : ''}" x="${X(arr)}" y="68" width="${X(20) - X(0) - 2}" height="14" rx="2"/>`;
        h += `<rect class="jt-p${isLost || isLate ? ' gap' : ''}" x="${X(play)}" y="114" width="${X(20) - X(0) - 2}" height="14" rx="2"/>`;
      }
      [0, 100, 200, 300, 400].forEach(t => { h += `<text class="sp-lab" x="${X(t)}" y="146" text-anchor="middle">${t} ms</text>`; });
      svg.innerHTML = h;
      const eff = (late + lost) / N * 100;
      const delay = BASE + B + 25;
      const q = emodel(CODEC[0], delay, 0, eff);
      $('#jt-stats').innerHTML = `<div><b>${late}</b><span>paket telat dibuang</span></div><div><b>${lost}</b><span>hilang di jaringan</span></div><div><b>${delay} ms</b><span>delay mulut ke telinga</span></div><div><b class="tag ${q.lab[0]}">MOS ${q.mos.toFixed(1)}</b><span>${q.lab[1]}</span></div>`;
    }
    ['jt-j', 'jt-b', 'jt-l'].forEach(id => $('#' + id).addEventListener('input', draw));
    $('#jt-new').addEventListener('click', () => { seed++; draw(); });
    draw();
  })();

  (function softswitch() {
    const svg = $('#ss-svg');
    const P = { as: [90, 24], ms: [270, 24], mgc: [180, 84], ipa: [40, 128], ipb: [40, 182], mg: [190, 166], sg: [300, 110], pstn: [318, 176] };
    const L = [['mgc', 'as', 'c'], ['mgc', 'ms', 'c'], ['mgc', 'mg', 'c'], ['mgc', 'sg', 'c'], ['mgc', 'ipa', 'c'], ['mgc', 'ipb', 'c'], ['sg', 'pstn', 'c'], ['mg', 'pstn', 'm'], ['ipa', 'mg', 'm'], ['ipa', 'ipb', 'm']];
    const F = {
      ip: { sig: ['mgc-ipa', 'mgc-ipb'], med: ['ipa-ipb'], n: 'IP ke IP: telepon A mengirim pensinyalan (SIP) ke softswitch, softswitch memanggil telepon B. Setelah tersambung, suara (RTP) mengalir langsung antar telepon.' },
      pstn: { sig: ['mgc-ipa', 'mgc-sg', 'sg-pstn', 'mgc-mg'], med: ['ipa-mg', 'mg-pstn'], n: 'IP ke PSTN: softswitch meneruskan pensinyalan lewat signaling gateway ke jaringan PSTN dan memerintahkan media gateway. Suara dari telepon IP di-depacketizing oleh MG menjadi sinyal sirkuit PSTN, dan sebaliknya.' }
    };
    function draw(f) {
      const fl = F[f] || { sig: [], med: [] };
      let h = L.map(([a, b, t]) => { const k = a + '-' + b; const cls = fl.sig.includes(k) ? ' sig' : fl.med.includes(k) ? ' med' : ''; return `<line class="lk${t === 'c' ? ' dash' : ''}${cls}" x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}"/>`; }).join('');
      h += box('as', ...P.as, 92, 26, 'Application server') + box('ms', ...P.ms, 80, 26, 'Media server') + box('mgc', ...P.mgc, 116, 32, 'MGC (softswitch)', '', 'hl') +
        laptop('ipa', ...P.ipa, 'Telepon IP A') + laptop('ipb', ...P.ipb, 'Telepon IP B') + box('mg', ...P.mg, 92, 28, 'Media gateway') + box('sg', ...P.sg, 92, 28, 'Signaling gateway') + box('pstn', ...P.pstn, 70, 28, 'PSTN ☎');
      svg.innerHTML = h;
      tapInfo(svg, $('#ss-info'), INFO);
      if (f) $('#ss-info').innerHTML = fl.n;
    }
    const INFO = {
      mgc: '<b>Media gateway controller (MGC)</b> atau call agent: otak softswitch yang memproses pensinyalan, menentukan rute panggilan, dan mengendalikan media gateway.',
      mg: '<b>Media gateway (MG)</b>: mengubah suara antara jaringan sirkuit (PSTN) dan paket RTP di jaringan IP (packetizing/depacketizing).',
      sg: '<b>Signaling gateway (SG)</b>: menerjemahkan pensinyalan PSTN (SS7) menjadi pensinyalan berbasis IP untuk MGC.',
      as: '<b>Application server</b>: menjalankan layanan tambahan seperti voicemail, call forwarding, dan konferensi.',
      ms: '<b>Media server</b>: memutar pengumuman dan nada, menjalankan IVR, merekam, serta mencampur suara konferensi.',
      ipa: '<b>Telepon IP / softphone</b>: perangkat pengguna yang memakai SIP untuk pensinyalan dan RTP untuk suara.',
      ipb: '<b>Telepon IP / softphone</b> di sisi penerima.',
      pstn: '<b>Telepon PSTN</b>: telepon rumah biasa di jaringan sirkuit.'
    };
    segPick($('#ss-flow'), 'f', draw);
    draw(null);
  })();

  /* ============================== Bab 5 ============================== */
  function keypad(el, onKey) {
    el.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k => `<button type="button" data-k="${k}">${k}</button>`).join('');
    el.addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b && !b.disabled) onKey(b.dataset.k); });
  }
  (function pbx() {
    const svg = $('#pbx-svg'), msg = $('#pbx-msg');
    const EXT = { 1: ['HRD', '220'], 2: ['Keuangan', '230'], 3: ['Marketing', '240'], 0: ['Operator', '200'] };
    let state = 'idle', pick = null;
    function draw() {
      let h = box('caller', 40, 75, 66, 36, 'Penelepon', 'Jakarta') + link(73, 75, 130, 75, state !== 'idle' ? 'med' : '') + `<text class="nd-sub" x="102" y="66" text-anchor="middle">trunk</text>` +
        box('pbx', 165, 75, 70, 44, 'PBX', 'PT X', state === 'ivr' ? 'hl' : '');
      const keys = Object.keys(EXT);
      keys.forEach((k, i) => {
        const y = 20 + i * 36, [nm, ext] = EXT[k];
        h += link(200, 75, 262, y, pick === k ? 'med' : 'dash') + box('e' + k, 300, y, 76, 28, `${nm} ${ext}`, '', pick === k ? 'hl' : '');
      });
      svg.innerHTML = h;
      $$('#pbx-keys button').forEach(b => { b.disabled = state !== 'ivr'; });
    }
    keypad($('#pbx-keys'), k => {
      if (state !== 'ivr') return;
      if (EXT[k]) { pick = k; state = 'ring'; msg.innerHTML = `Penelepon menekan <b>${k}</b>. PBX menyambungkan ke extension <b>${EXT[k][1]}</b> (${EXT[k][0]}). Telepon di meja ${EXT[k][0]} berdering… dan diangkat. Penelepon luar tidak perlu tahu nomor extension.`; }
      else msg.innerHTML = `Tombol ${k} tidak ada di menu. IVR: "Pilihan tidak tersedia. Tekan 1 untuk HRD, 2 Keuangan, 3 Marketing, atau 0 operator."`;
      draw();
    });
    $('#pbx-call').addEventListener('click', () => { state = 'ivr'; pick = null; msg.innerHTML = 'Panggilan masuk lewat trunk dan dijawab IVR: <i>"Selamat datang di PT X. Tekan 1 untuk HRD, 2 Keuangan, 3 Marketing, atau 0 untuk operator."</i> Tekan tombol pada keypad.'; draw(); });
    $('#pbx-reset').addEventListener('click', () => { state = 'idle'; pick = null; msg.textContent = 'Penelepon dari Jakarta menghubungi nomor kantor PT X.'; draw(); });
    draw();
  })();

  (function hunting() {
    let mode = 'regular', clock = 1, lastUsed = -1;
    const lines = [0, 1, 2, 3].map(i => ({ busy: false, idleSince: 0, calls: 0 }));
    function draw(note) {
      $('#hu-lines').innerHTML = lines.map((l, i) => `<button type="button" class="line${l.busy ? ' busy' : ''}" data-i="${i}" aria-label="Saluran ${i + 1} ${l.busy ? 'sibuk' : 'kosong'}"><b>Saluran ${i + 1}</b><span>${l.busy ? 'sibuk ☎' : 'kosong'}</span><small>${l.calls} panggilan</small></button>`).join('');
      if (note) $('#hu-note').innerHTML = note;
    }
    $('#hu-lines').addEventListener('click', e => {
      const b = e.target.closest('.line'); if (!b) return;
      const l = lines[+b.dataset.i];
      if (l.busy) { l.busy = false; l.idleSince = clock++; draw(`Saluran ${+b.dataset.i + 1} selesai menelepon dan kembali kosong.`); }
    });
    $('#hu-call').addEventListener('click', () => {
      const idle = lines.map((l, i) => i).filter(i => !lines[i].busy);
      let pick = -1, why = '';
      if (!idle.length) {
        draw(mode === 'annc' ? 'Semua saluran sibuk. <b>ANNC hunting</b> memutar pengumuman: <i>"Semua operator sedang melayani, mohon tunggu sebentar."</i>' : 'Semua saluran sibuk: penelepon mendengar nada sibuk. (Pada ANNC hunting, penelepon mendengar pengumuman.)');
        return;
      }
      if (mode === 'regular' || mode === 'annc') { pick = idle[0]; why = 'selalu mulai mencari dari saluran 1, jadi saluran awal paling sering dipakai'; }
      else if (mode === 'circular') { for (let k = 1; k <= 4; k++) { const i = (lastUsed + k) % 4; if (!lines[i].busy) { pick = i; break; } } why = `melanjutkan dari saluran setelah yang terakhir dipakai (saluran ${lastUsed + 1 || '–'})`; }
      else { pick = idle.reduce((a, b) => lines[b].idleSince < lines[a].idleSince ? b : a, idle[0]); why = 'memilih saluran kosong yang paling lama menganggur, sehingga beban terbagi rata'; }
      lines[pick].busy = true; lines[pick].calls++; lastUsed = pick;
      draw(`Panggilan masuk ke <b>saluran ${pick + 1}</b>: ${mode === 'ucd' ? 'UCD' : mode === 'annc' ? 'ANNC (seperti regular)' : mode} ${why}.`);
    });
    $('#hu-reset').addEventListener('click', () => { lines.forEach(l => { l.busy = false; l.idleSince = 0; l.calls = 0; }); clock = 1; lastUsed = -1; draw('Semua saluran kosong.'); });
    segPick($('#hu-tabs'), 'h', v => { mode = v; draw({ regular: 'Regular: selalu mencari dari saluran pertama.', circular: 'Circular: melanjutkan dari saluran setelah yang terakhir dipakai.', ucd: 'UCD: membagi rata ke saluran yang paling lama menganggur.', annc: 'ANNC: seperti regular, tetapi memutar pengumuman bila semua sibuk.' }[v]); });
    draw('Tekan Panggilan masuk beberapa kali, lalu tutup salah satu saluran dan bandingkan tiap jenis hunting.');
  })();

  (function pattern() {
    function run() {
      const p = $('#pt-pat').value.trim(), n = $('#pt-num').value.trim();
      const r = AST.matchPattern(p, n);
      $('#pt-row').innerHTML = r.literal ? '' : r.steps.map(s => `<span class="pt ${s.ok ? 'ok' : 'bad'}"><b>${esc(s.tok || '∅')}</b><i>${esc(s.ch || '·')}</i></span>`).join('');
      $('#pt-out').innerHTML = `<span class="tag ${r.ok ? 'ok' : 'err'}">${r.ok ? 'Cocok' : 'Tidak cocok'}</span> ${esc(r.reason)}${p && !p.startsWith('_') ? ' Pattern harus diawali garis bawah (_).' : ''}`;
    }
    ['pt-pat', 'pt-num'].forEach(id => $('#' + id).addEventListener('input', run));
    run();
  })();

  /* ============================== Diagram pesan SIP (dipakai materi dan simulator) ============================== */
  function ladderRow(ev, n) {
    if (ev.t === 'note') return `<div class="lnote ${ev.cls || ''}">${esc(ev.text)}</div>`;
    const I = { A: 0, S: 1, B: 2 };
    const a = I[ev.from], b = I[ev.to], lo = Math.min(a, b), hi = Math.max(a, b);
    const dir = ev.t === 'rtp' ? 'both' : a < b ? 'r' : 'l';
    return `<div class="lrow n${n}"><div class="arrow ${dir} ${ev.t === 'rtp' ? 'rtp' : ev.cls || 'req'}" style="grid-column:${lo + 1} / ${hi + 2};--span:${hi - lo + 1}"><span class="lab" title="${esc(ev.label)}">${esc(ev.label)}</span>${ev.note ? `<small>${esc(ev.note)}</small>` : ''}</div></div>`;
  }
  function ladderHead(cols) {
    const keys = cols.B ? ['A', 'S', 'B'] : ['A', 'S'];
    return `<div class="lhead n${keys.length}">${keys.map(k => `<span>${esc(cols[k])}</span>`).join('')}</div>`;
  }

  (function ladderDemo() {
    const C3 = { A: 'Softphone 101', S: 'Asterisk', B: 'Softphone 102' }, C2 = { A: 'Softphone 101', S: 'Asterisk (registrar)' };
    const S = {
      reg: [C2, [
        ['A', 'S', 'REGISTER', 'req', 'Softphone memberi tahu: "aku 101, sekarang ada di IP 192.168.1.11".'],
        ['S', 'A', '401 Unauthorized', 'prov', 'Asterisk minta bukti identitas dan mengirim angka acak (nonce).'],
        ['A', 'S', 'REGISTER + Authorization', 'req', 'Softphone mengirim ulang dengan hash dari username, password, dan nonce. Password tidak dikirim mentah.'],
        ['S', 'A', '200 OK', 'ok', 'Cocok dengan secret di sip.conf. Lokasi 101 dicatat, sekarang 101 bisa dipanggil.']]],
      call: [C3, [
        ['A', 'S', 'INVITE', 'req', '101 mengajak 102 bicara. Di dalamnya ada SDP: daftar codec dan port RTP milik 101.'],
        ['S', 'A', '100 Trying', 'prov', 'Asterisk: "permintaan diterima, sedang diproses" (dialplan dijalankan).'],
        ['S', 'B', 'INVITE', 'req', 'Dial(SIP/102): Asterisk mengajak 102.'],
        ['B', 'S', '180 Ringing', 'prov', 'Telepon 102 berdering.'],
        ['S', 'A', '180 Ringing', 'prov', '101 mendengar nada dering.'],
        ['B', 'S', '200 OK', 'ok', '102 mengangkat telepon (beserta SDP-nya).'],
        ['S', 'A', '200 OK', 'ok', 'Asterisk meneruskan bahwa panggilan diangkat.'],
        ['A', 'S', 'ACK', 'req', '101 mengonfirmasi. Sesi terbentuk (three-way handshake INVITE–200 OK–ACK).'],
        ['A', 'B', 'RTP (suara)', 'rtp', 'Suara mengalir lewat RTP/UDP. SIP tidak membawa suara, hanya mengatur sesi.'],
        ['A', 'S', 'BYE', 'req', '101 menutup telepon.'],
        ['S', 'B', 'BYE', 'req', 'Asterisk memberi tahu 102.'],
        ['B', 'S', '200 OK', 'ok', '102 mengonfirmasi.'],
        ['S', 'A', '200 OK', 'ok', 'Sesi selesai.']]],
      busy: [C3, [
        ['A', 'S', 'INVITE', 'req', '101 menelepon 102.'],
        ['S', 'A', '100 Trying', 'prov', 'Asterisk memproses.'],
        ['S', 'B', 'INVITE', 'req', 'Asterisk menghubungi 102.'],
        ['B', 'S', '486 Busy Here', 'err', '102 sedang menelepon orang lain atau menolak panggilan.'],
        ['S', 'B', 'ACK', 'req', 'Respons akhir 4xx juga dikonfirmasi dengan ACK.'],
        ['S', 'A', '486 Busy Here', 'err', 'Jika dialplan tidak punya langkah lain (misalnya voicemail), status sibuk diteruskan ke 101.'],
        ['A', 'S', 'ACK', 'req', 'Selesai. DIALSTATUS di Asterisk bernilai BUSY.']]]
    };
    let sc = 'reg', i = -1, tm;
    function draw() {
      const [cols, steps] = S[sc];
      const n = cols.B ? 3 : 2;
      $('#ld-box').innerHTML = ladderHead(cols) + steps.map((s, k) => ladderRow({ t: s[3] === 'rtp' ? 'rtp' : 'sip', from: s[0], to: s[1], label: s[2], cls: s[3] }, n).replace('class="lrow', `class="lrow${k > i ? ' pending' : k === i ? ' now' : ''}`)).join('');
      $('#ld-info').innerHTML = i < 0 ? 'Tekan Putar atau Langkah.' : `<b>${i + 1}. ${esc(steps[i][2])}</b>: ${esc(steps[i][4])}`;
    }
    const next = () => { const st = S[sc][1]; if (i < st.length - 1) { i++; draw(); return true; } return false; };
    segPick($('#ld-tabs'), 's', v => { clearTimeout(tm); sc = v; i = -1; draw(); });
    $('#ld-next').addEventListener('click', () => { clearTimeout(tm); if (!next()) { i = -1; draw(); } });
    $('#ld-play').addEventListener('click', () => { clearTimeout(tm); i = -1; draw(); const step = () => { if (next()) tm = setTimeout(step, reduced ? 0 : 1300); }; step(); });
    draw();
  })();

  (function h323() {
    const B = (x, y, w, h, t, cls) => `<g class="stk ${cls || ''}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/><text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle">${t}</text></g>`;
    $('#h323-svg').innerHTML =
      B(6, 6, 80, 30, 'Audio G.7xx', 'a') + B(90, 6, 80, 30, 'Video H.26x', 'a') + B(174, 6, 60, 30, 'H.225 RAS', 'c') + B(238, 6, 56, 30, 'Q.931', 'c') + B(298, 6, 56, 30, 'H.245', 'c') +
      B(6, 42, 116, 30, 'RTP', 'r') + B(126, 42, 44, 30, 'RTCP', 'r') +
      B(6, 78, 228, 30, 'UDP', 't') + B(238, 78, 116, 30, 'TCP', 't') +
      B(6, 114, 348, 30, 'IP', 'n') +
      '<text class="sp-lab" x="180" y="162" text-anchor="middle">media (kiri) · pendaftaran, pensinyalan panggilan, dan kontrol (kanan)</text>';
  })();

  /* ============================== Bab 6 ============================== */
  (function snell() {
    const svg = $('#sn-svg');
    function draw() {
      const a = +$('#sn-a').value, n1 = +$('#sn-n1').value / 1000, n2 = +$('#sn-n2').value / 1000;
      $('#sn-a-o').textContent = a + '°';
      $('#sn-n1-o').textContent = n1.toFixed(3).replace('.', ',');
      $('#sn-n2-o').textContent = n2.toFixed(3).replace('.', ',');
      const ok = n2 < n1, tc = ok ? Math.asin(n2 / n1) * 180 / Math.PI : 90;
      const tir = ok && a > tc;
      const top = 50, bot = 120;
      let h = `<rect class="sn-clad" x="0" y="14" width="360" height="${top - 14}"/><rect class="sn-core" x="0" y="${top}" width="360" height="${bot - top}"/><rect class="sn-clad" x="0" y="${bot}" width="360" height="${156 - bot}"/>` +
        `<text class="sp-lab" x="354" y="28" text-anchor="end">cladding n₂</text><text class="sp-lab" x="354" y="${top + 14}" text-anchor="end">inti n₁</text>`;
      // berkas mulai di tengah inti, sudut terhadap garis normal batas inti–cladding = a
      const slope = Math.tan((90 - a) * Math.PI / 180);
      let x = 0, y = (top + bot) / 2, dirUp = true, path = `M${x} ${y}`, hits = 0, out = '';
      while (x < 360 && hits < 40) {
        const ty = dirUp ? top : bot, dx = Math.abs(y - ty) / Math.max(slope, 1e-3);
        if (x + dx > 360) { path += ` L360 ${(y + (dirUp ? -1 : 1) * (360 - x) * slope).toFixed(1)}`; break; }
        x += dx; y = ty; path += ` L${x.toFixed(1)} ${y}`; hits++;
        if (!tir) {
          const st = n1 / n2 * Math.sin(a * Math.PI / 180);
          if (ok && st < 1) {
            const tt = Math.asin(st), s2 = Math.tan(Math.PI / 2 - tt);
            const ex = x + 40 / Math.max(s2, 0.01), ey = dirUp ? y - 40 : y + 40;
            out = `<path class="sn-out" d="M${x.toFixed(1)} ${y} L${Math.min(ex, 360).toFixed(1)} ${ey}"/><circle class="sn-hit" cx="${x}" cy="${y}" r="4"/>`;
          }
          const rx = x + 60 / Math.max(slope, 0.01);
          out += `<path class="sn-weak" d="M${x.toFixed(1)} ${y} L${Math.min(rx, 360).toFixed(1)} ${dirUp ? y + 60 : y - 60}"/>`;
          break;
        }
        dirUp = !dirUp;
      }
      h += `<path class="sn-ray${tir ? '' : ' leak'}" d="${path}"/>` + out;
      if (hits) h += `<line class="sn-norm" x1="${(Math.abs((top + bot) / 2 - top) / Math.max(slope, 1e-3)).toFixed(1)}" y1="${top - 22}" x2="${(Math.abs((top + bot) / 2 - top) / Math.max(slope, 1e-3)).toFixed(1)}" y2="${top + 22}"/>`;
      svg.innerHTML = h;
      const na = ok ? Math.sqrt(n1 * n1 - n2 * n2) : 0;
      $('#sn-stats').innerHTML = ok
        ? `<div><b>${tc.toFixed(1).replace('.', ',')}°</b><span>sudut kritis θc</span></div><div><b>${na.toFixed(3).replace('.', ',')}</b><span>numerical aperture</span></div><div><b>${(3 / n1).toFixed(2).replace('.', ',')} × 10⁸ m/s</b><span>kecepatan cahaya di inti</span></div><div><b class="tag ${tir ? 'ok' : 'err'}">${tir ? 'Pemantulan total' : 'Cahaya bocor'}</b><span>${tir ? `${a}° > θc: cahaya terpandu` : `${a}° ≤ θc: sebagian keluar ke cladding`}</span></div>`
        : '<div><b class="tag err">Tidak mungkin</b><span>n₂ harus lebih kecil dari n₁ agar terjadi pemantulan total</span></div>';
    }
    ['sn-a', 'sn-n1', 'sn-n2'].forEach(id => $('#' + id).addEventListener('input', draw));
    draw();
  })();

  (function wdm() {
    const L = [['#d33', 'λ1 1530 nm'], ['#e9a21b', 'λ2 1540 nm'], ['#2a9d4a', 'λ3 1550 nm'], ['#3a6fd8', 'λ4 1560 nm']];
    let h = L.map(([c, t], i) => `<line class="wd-in" x1="10" y1="${18 + i * 26}" x2="88" y2="${18 + i * 26}" style="stroke:${c}"/><text class="sp-lab" x="12" y="${13 + i * 26}">${t}</text>` +
      `<line class="wd-in" x1="272" y1="${18 + i * 26}" x2="350" y2="${18 + i * 26}" style="stroke:${c}"/>`).join('');
    h += '<path class="wd-mux" d="M88 6 L118 40 L118 80 L88 114 Z"/><text class="sp-lab" x="103" y="64" text-anchor="middle" transform="rotate(-90 103 60)">MUX</text>';
    h += '<path class="wd-mux" d="M272 6 L242 40 L242 80 L272 114 Z"/><text class="sp-lab" x="257" y="64" text-anchor="middle" transform="rotate(-90 257 60)">DEMUX</text>';
    h += '<rect class="wd-fiber" x="118" y="52" width="124" height="16" rx="8"/>' + L.map(([c], i) => `<line class="wd-flow" x1="120" y1="60" x2="240" y2="60" style="stroke:${c};animation-delay:${-i * .25}s"/>`).join('');
    h += '<text class="sp-lab" x="180" y="88" text-anchor="middle">satu serat</text>';
    $('#wdm-svg').innerHTML = h;
    function calc() {
      const a = numField($('#wdm-n'), { min: 1, max: 200, int: true, minMsg: 'Minimal 1 kanal.' }), b = numField($('#wdm-g'), { gt: 0, max: 1600, gtMsg: 'Kecepatan per kanal harus lebih dari 0.' }), c = numField($('#wdm-o'), { min: 0, max: 99, maxMsg: 'Overhead harus di bawah 100%.' });
      if (!a.ok || !b.ok || !c.ok) { $('#wdm-out').innerHTML = '<span class="tag err">Belum bisa dihitung</span> Perbaiki isian yang ditandai merah.'; return; }
      const n = a.v, g = b.v, o = c.v;
      const net = n * g * (1 - o / 100);
      $('#wdm-out').innerHTML = `Kecepatan bersih = ${n} kanal × ${fmt(g, 1)} Gbps × (1 − ${fmt(o, 1)}%) = <b>${fmt(net, 1)} Gbps</b>${net >= 1000 ? ` (±${fmt(net / 1000, 2)} Tbps)` : ''}.`;
    }
    ['wdm-n', 'wdm-g', 'wdm-o'].forEach(id => $('#' + id).addEventListener('input', calc));
    calc();
  })();

  layerWidget('#fc-svg', '#fc-tabs', '#fc-info', [
    { name: 'Outer jacket', x: 8, h: 64, fill: '#e8c547', info: 'pelindung terluar dari PVC, LSZH, atau PE. Warnanya menunjukkan jenis serat: kuning untuk singlemode, oranye untuk multimode OM1/OM2, aqua untuk OM3/OM4.' },
    { name: 'Strength member', x: 60, h: 52, fill: '#f3e2b3', stroke: '#c9a75a', dash: '3 2', info: 'serat aramid (Kevlar) atau batang FRP yang menahan gaya tarik saat kabel dipasang, sehingga serat kaca tidak ikut tertarik dan patah.' },
    { name: 'Coating', x: 108, h: 34, fill: '#cfd8dc', info: 'lapisan plastik/akrilat yang lentur dan langsung membungkus cladding, melindunginya dari kelembapan dan goresan.' },
    { name: 'Cladding', x: 148, h: 22, fill: '#bfe6f0', info: 'kaca berdiameter 125 µm dengan indeks bias sedikit lebih rendah daripada inti, sehingga cahaya dipantulkan kembali ke inti.' },
    { name: 'Core', x: 184, h: 7, fill: '#ffffff', stroke: '#08697a', info: 'inti kaca tempat cahaya merambat: 8–10 µm pada singlemode, 50 atau 62,5 µm pada multimode.' }
  ]);

  (function windows() {
    const svg = $('#wn-svg');
    const X = l => 30 + (l - 700) / 1000 * 320, Y = a => 140 - Math.min(a, 2.6) / 2.6 * 120;
    const att = l => { const u = l / 1000; return 0.8 / Math.pow(u, 4) + 0.04 + 0.02 * Math.exp((l - 1550) / 60) + 0.22 * Math.exp(-Math.pow((l - 1383) / 16, 2)); };
    const W = {
      780: ['780 nm', 'dipakai sistem lama, serat plastik, dan laser CD. Redamannya tinggi sehingga hanya untuk jarak sangat pendek.'],
      850: ['850 nm · first window', 'untuk serat multimode dengan sumber LED/VCSEL yang murah. Redaman besar (±2–3 dB/km), cocok untuk LAN dan data center.'],
      1310: ['1.310 nm · second window', 'dispersi kromatik hampir nol pada serat singlemode standar dan redaman rendah (±0,35 dB/km). Dipakai upstream GPON dan link menengah.'],
      1490: ['1.490 nm', 'panjang gelombang downstream GPON (dari OLT ke rumah).'],
      1550: ['1.550 nm · third window', 'redaman terendah (±0,2 dB/km) dan bisa diperkuat penguat optik EDFA. Untuk jarak jauh, DWDM, dan siaran video FTTH.'],
      1625: ['1.625 nm', 'dipakai untuk pemantauan jaringan aktif dengan OTDR dan perluasan kanal DWDM (L-band).']
    };
    let h = '<line class="sp-axis" x1="30" y1="140" x2="350" y2="140"/><line class="sp-axis" x1="30" y1="16" x2="30" y2="140"/>';
    [0, 1, 2].forEach(a => { h += `<text class="sp-lab" x="26" y="${Y(a) + 3}" text-anchor="end">${a}</text><line class="sp-div" x1="30" y1="${Y(a)}" x2="350" y2="${Y(a)}"/>`; });
    let p = ''; for (let l = 700; l <= 1700; l += 5) p += (l > 700 ? ' L' : 'M') + X(l).toFixed(1) + ' ' + Y(att(l)).toFixed(1);
    h += `<path class="wn-c" d="${p}"/><text class="sp-lab" x="34" y="12">dB/km</text><text class="sp-lab" x="350" y="166" text-anchor="end">panjang gelombang (nm)</text>`;
    Object.keys(W).forEach(l => { const x = X(+l); h += `<g class="wn-m" data-k="${l}"><line x1="${x}" y1="${Y(att(+l))}" x2="${x}" y2="140"/><circle cx="${x}" cy="${Y(att(+l))}" r="5"/><text class="sp-lab" x="${x}" y="153" text-anchor="middle">${l}</text></g>`; });
    svg.innerHTML = h;
    const INFO = {}; Object.entries(W).forEach(([k, [t, d]]) => { INFO[k] = `<b>${t}</b>: ${d} Redaman di kurva: ±${att(+k).toFixed(2).replace('.', ',')} dB/km.`; });
    tapInfo(svg, $('#wn-info'), INFO);
  })();

  (function fomode() {
    const svg = $('#fm-svg');
    let m = 'mm';
    const gauss = (cx, base, w, hgt) => { let d = ''; for (let x = -3 * w; x <= 3 * w; x += w / 6) d += (d ? ' L' : 'M') + (cx + x).toFixed(1) + ' ' + (base - hgt * Math.exp(-x * x / (2 * w * w))).toFixed(1); return d; };
    function zig(top, bot, ang, x0, x1) {
      const slope = Math.tan(ang * Math.PI / 180);
      let x = x0, y = (top + bot) / 2, up = true, d = `M${x} ${y}`;
      if (ang === 0) return `M${x0} ${y} L${x1} ${y}`;
      while (x < x1) { const ty = up ? top : bot, dx = Math.abs(y - ty) / slope; if (x + dx > x1) { d += ` L${x1} ${(y + (up ? -1 : 1) * (x1 - x) * slope).toFixed(1)}`; break; } x += dx; y = ty; d += ` L${x.toFixed(1)} ${y}`; up = !up; }
      return d;
    }
    function draw() {
      const L = +$('#fm-len').value;
      $('#fm-len-o').textContent = L + ' km';
      const mm = m === 'mm';
      const top = mm ? 46 : 74, bot = mm ? 106 : 86;
      let h = `<rect class="sn-clad" x="40" y="30" width="250" height="92" rx="4"/><rect class="sn-core" x="40" y="${top}" width="250" height="${bot - top}"/>`;
      if (mm) [[0, 'r0'], [12, 'r1'], [24, 'r2']].forEach(([a, c]) => { h += `<path class="fm-ray ${c}" d="${zig(top, bot, a, 40, 290)}"/>`; });
      else h += `<path class="fm-ray r0" d="M40 80 L290 80"/>`;
      h += `<path class="fm-pulse" d="${gauss(20, 140, 4, 34)}"/><text class="sp-lab" x="20" y="154" text-anchor="middle">masuk</text>`;
      const spread = mm ? L * 50 : L * 0.002; // ns
      const w = mm ? Math.min(24, 4 + L * 1.1) : 4.1, hgt = 34 * 4 / w;
      h += `<path class="fm-pulse out" d="${gauss(320, 140, w, hgt)}"/><text class="sp-lab" x="320" y="154" text-anchor="middle">keluar</text>`;
      h += `<text class="sp-lab" x="165" y="22" text-anchor="middle">${mm ? 'inti 50–62,5 µm: banyak jalur (mode) cahaya' : 'inti 8–10 µm: hanya satu mode'}</text>`;
      svg.innerHTML = h;
      $('#fm-note').innerHTML = mm
        ? `Berkas yang lurus tiba lebih dulu daripada berkas yang memantul-mantul, sehingga pulsa cahaya <b>melebar</b> (dispersi modal). Pada multimode step-index pelebarannya sekitar 50 ns/km: setelah ${L} km ±${fmt(spread, 0)} ns, sehingga kecepatan maksimum hanya sekitar ${fmt(1000 / (2 * spread), spread > 500 ? 2 : 1)} Mbps. Multimode graded-index modern jauh lebih baik, tetapi tetap terbatas ratusan meter untuk 10 Gbps.`
        : `Hanya satu mode yang merambat, jadi tidak ada dispersi modal. Pelebaran pulsa sangat kecil (orde pikodetik per km), sehingga singlemode bisa membawa puluhan Gbps sejauh puluhan km.`;
    }
    segPick($('#fm-tabs'), 'm', v => { m = v; draw(); });
    $('#fm-len').addEventListener('input', draw);
    draw();
  })();

  (function ftth() {
    const svg = $('#ft-svg');
    const N = [['olt', 34, 'OLT', 'STO'], ['odc', 124, 'ODC', 'splitter 1:4'], ['odp', 214, 'ODP', 'splitter 1:8'], ['ont', 300, 'ONT', 'rumah']];
    let h = link(58, 70, 100, 70, 'fo') + link(148, 70, 190, 70, 'fo') + link(238, 70, 276, 70, 'fo') + link(324, 70, 346, 70) +
      '<text class="nd-sub" x="79" y="60" text-anchor="middle">feeder</text><text class="nd-sub" x="169" y="60" text-anchor="middle">distribusi</text><text class="nd-sub" x="257" y="60" text-anchor="middle">drop</text>' +
      N.map(([k, x, t, s]) => box(k, x, 70, 48, 38, t, s)).join('') + '<text class="nd-sub" x="350" y="74" text-anchor="end">📶</text>' +
      '<text class="sp-lab" x="180" y="118" text-anchor="middle">↓ downstream 1.490 nm (dan video 1.550 nm)   ↑ upstream 1.310 nm</text><text class="sp-lab" x="180" y="136" text-anchor="middle">satu OLT port → 1:4 × 1:8 = hingga 32 rumah</text>';
    svg.innerHTML = h;
    tapInfo(svg, $('#ft-info'), {
      olt: '<b>OLT (optical line terminal)</b>: perangkat aktif di STO yang mengirim dan menerima sinyal ke banyak pelanggan. Satu port PON melayani puluhan rumah.',
      odc: '<b>ODC (optical distribution cabinet)</b>: kabinet pasif di pinggir jalan berisi splitter tahap pertama (misalnya 1:4) dan sambungan kabel feeder ke kabel distribusi.',
      odp: '<b>ODP (optical distribution point)</b>: kotak pasif di tiang atau dinding dengan splitter tahap kedua (misalnya 1:8), titik pembagi kabel drop ke rumah.',
      ont: '<b>ONT (optical network terminal)</b>: perangkat aktif di rumah pelanggan yang mengubah cahaya menjadi sinyal listrik Ethernet/Wi-Fi. Sering digabung dengan wireless router.'
    });
  })();

  /* ============================== Bab 6: LKPD praktik serat optik ============================== */
  const numv = v => { const x = parseFloat(String(v).replace(',', '.')); return isNaN(x) ? null : x; };
  const LK_OPT = {
    jenis: ['SC/UPC', 'SC/APC', 'LC/UPC', 'LC/APC'],
    sebelum: ['', 'Bersih', 'Debu', 'Minyak/sidik jari', 'Goresan'],
    metode: ['', 'Kering', 'Basah-kering', 'Tidak perlu'],
    sesudah: ['', 'Bersih', 'Masih kotor', 'Goresan di inti']
  };
  const LK_DEF = () => ({
    l1: [0, 1, 2, 3].map(i => ({ kode: 'K' + (i + 1), jenis: ['SC/UPC', 'SC/APC', 'LC/UPC', 'LC/UPC'][i], sebelum: '', metode: '', sesudah: '' })),
    l2: [0, 1, 2, 3].map(i => ({ kode: 'S' + (i + 1), a1: '', a2: '', est: '', ukur: '' })),
    l3: { ref1310: '', ref1550: '', att1310: '0.4', att1550: '0.3', rows: ['Patch cord A', 'Kabel gulung', 'Link lab B', 'Link lab C'].map(n => ({ nama: n, km: '', kon: '', spl: '', rx1310: '', rx1550: '' })) },
    l4: ['', '', '', '']
  });
  const LK_SAMPLE = {
    l1: [['SC/UPC', 'Debu', 'Kering', 'Bersih'], ['SC/APC', 'Minyak/sidik jari', 'Basah-kering', 'Bersih'], ['LC/UPC', 'Debu', 'Kering', 'Masih kotor'], ['LC/UPC', 'Goresan', 'Basah-kering', 'Goresan di inti']],
    l2: [['0.3', '0.4', '0.02', '0.03'], ['0.5', '1.4', '', ''], ['0.6', '0.7', '0.12', '0.15'], ['0.4', '0.9', '0.35', '0.38']],
    l3: { ref1310: '-5.0', ref1550: '-5.2', rows: [['0.003', '2', '0', '-5.4', '-5.6'], ['2', '2', '1', '-7.3', '-7.1'], ['1', '2', '2', '-10.6', '-13.4'], ['0.5', '4', '0', '-9.6', '-9.7']] }
  };
  const LK_CASES = [
    { t: 'ONT tidak menyala (LOS merah)', d: 'Lampu LOS di ONT pelanggan merah. OPM di port ODP (1.490 nm): −19 dBm. OPM di ujung kabel drop di dalam rumah: tidak ada daya (LO). VFL dari ODP: cahaya merah terlihat bocor di dekat tiang ke-2.',
      b: 'Kabel drop putus atau patah di dekat tiang ke-2: daya di ODP normal, di rumah hilang, dan VFL menunjukkan titik bocor. Ganti atau sambung ulang kabel drop pada titik itu, lalu ukur daya di ONT (harus di atas sensitivitas ONT + margin) dan pastikan lampu LOS padam.' },
    { t: 'Internet sering putus di malam hari', d: 'Daya terima ONT −27,6 dBm (sensitivitas −27 dBm). Pengukuran link: redaman 1.310 nm = 18,1 dB, redaman 1.550 nm = 21,4 dB. Kabel drop di dalam rumah dijepit klip rapat di sudut kusen pintu.',
      b: 'Tekukan terlalu tajam (macrobend): rugi di 1.550 nm jauh lebih besar daripada di 1.310 nm, dan daya ONT berada di bawah batas. Rapikan jalur kabel dengan radius tekuk sesuai spesifikasi kabel, lepas klip yang menjepit, lalu ukur ulang sampai daya ONT di atas −27 dBm dengan margin.' },
    { t: 'Daya turun setelah patch cord dicolok ulang', d: 'Teknisi mencabut dan memasang lagi patch cord di ODP tanpa membersihkan. Daya ONT turun dari −21 dBm menjadi −24,5 dBm. Inspeksi menunjukkan bintik hitam di inti konektor.',
      b: 'Konektor kotor. Bersihkan dan inspeksi konektor beserta adaptornya (LKPD 1), lalu ukur ulang. SOP: selalu inspeksi → bersihkan → inspeksi sebelum mencolok konektor.' },
    { t: 'Rugi besar di satu sambungan ODC', d: 'Patch cord berkonektor hijau disambungkan ke adaptor/patch cord berkonektor biru di ODC. Rugi pada titik itu terukur ±4 dB.',
      b: 'Jenis konektor tercampur: hijau = APC (ujung miring 8°), biru = UPC (ujung rata). Sambungan APC–UPC menyisakan celah udara sehingga rugi dan pantulan besar, bahkan bisa merusak ujung konektor. Ganti dengan pasangan yang sejenis, bersihkan, lalu ukur ulang.' }
  ];
  const lk = Object.assign(LK_DEF(), store.get('lkpd', {}));
  const lkSave = () => store.set('lkpd', lk);
  // Penilaian LKPD: setiap baris dinilai hanya bila datanya lengkap dan masuk akal.
  // Hasil: { cls, label, final (penilaian akhir), bad: { kolom: alasan } untuk menandai isian }.
  const LK_NAMA = { sebelum: 'kondisi sebelum', metode: 'metode', sesudah: 'kondisi sesudah', a1: 'sudut kiri', a2: 'sudut kanan', est: 'estimasi splicer', ukur: 'hasil ukur', rugi: 'hasil ukur atau estimasi splicer',
    km: 'panjang', kon: 'pasang konektor', spl: 'sambungan', rx1310: 'P terima 1.310', rx1550: 'P terima 1.550', ref1310: 'P ref 1.310', ref1550: 'P ref 1.550', att1310: 'redaman kabel 1.310', att1550: 'redaman kabel 1.550' };
  // Membaca angka isian LKPD (boleh memakai koma). empty = belum diisi; err = bukan angka atau di luar aturan.
  function lkVal(raw, rule) {
    const s = String(raw === undefined || raw === null ? '' : raw).trim();
    if (s === '') return { empty: true, v: null, err: '' };
    const v = Number(s.replace(',', '.'));
    if (!Number.isFinite(v)) return { v: null, err: 'bukan angka' };
    rule = rule || {};
    if (rule.int && !Number.isInteger(v)) return { v, err: 'harus bilangan bulat' };
    if (rule.min !== undefined && v < rule.min) return { v, err: rule.minMsg || 'tidak boleh negatif' };
    if (rule.max !== undefined && v > rule.max) return { v, err: rule.maxMsg || 'di luar kisaran wajar' };
    return { v, err: '' };
  }
  const lkNone = { cls: '', label: '–', final: false, bad: {} };
  const lkIncomplete = (miss, bad) => ({ cls: 'warn', label: `Data belum lengkap: isi ${miss.map(k => LK_NAMA[k]).join(', ')}`, final: false, bad: Object.assign(Object.fromEntries(miss.map(k => [k, 'belum diisi'])), bad || {}) });
  const lkCheckInput = bad => ({ cls: 'warn', label: `Periksa isian: ${Object.entries(bad).map(([k, m]) => `${LK_NAMA[k]} ${m}`).join('; ')}`, final: false, bad });
  function lk1Status(r) {
    const keys = ['sebelum', 'metode', 'sesudah'], miss = keys.filter(k => !r[k]);
    if (miss.length === keys.length) return lkNone;
    if (miss.length) return lkIncomplete(miss);
    if (r.sebelum !== 'Bersih' && r.metode === 'Tidak perlu' && r.sesudah === 'Bersih') return { cls: 'warn', label: 'Periksa data: konektor yang kotor tidak bisa menjadi bersih tanpa dibersihkan', final: false, bad: { metode: 'tidak sesuai' } };
    if (r.sebelum === 'Goresan' && r.sesudah === 'Bersih') return { cls: 'warn', label: 'Periksa data: goresan tidak hilang dengan pembersihan; inspeksi ulang', final: false, bad: { sesudah: 'tidak sesuai' } };
    return r.sesudah === 'Bersih' ? { cls: 'ok', label: 'Lulus', final: true, bad: {} } : r.sesudah === 'Goresan di inti' ? { cls: 'err', label: 'Ganti/poles', final: true, bad: {} } : { cls: 'warn', label: 'Ulangi bersihkan', final: true, bad: {} };
  }
  function lk2Status(r) {
    if (['a1', 'a2', 'est', 'ukur'].every(k => String(r[k] || '').trim() === '')) return lkNone;
    const ANG = { min: 0, max: 45, minMsg: 'tidak mungkin negatif', maxMsg: 'di luar kisaran wajar (0–45°)' };
    const a1 = lkVal(r.a1, ANG), a2 = lkVal(r.a2, ANG), est = lkVal(r.est), uk = lkVal(r.ukur);
    // Nilai rugi negatif tidak dinilai otomatis: bisa salah ketik, salah referensi, atau "gainer" pada OTDR satu arah.
    // Selalu ditandai, juga saat baris punya masalah lain.
    const neg = {};
    if (!uk.empty && uk.v < 0) neg.ukur = 'negatif';
    if (!est.empty && est.v < 0) neg.est = 'negatif';
    const negNote = Object.keys(neg).length ? '; rugi negatif juga perlu dicek' : '';
    const bad = {};
    [['a1', a1], ['a2', a2], ['est', est], ['ukur', uk]].forEach(([k, x]) => { if (x.err) bad[k] = x.err; });
    if (Object.keys(bad).length) return lkCheckInput(Object.assign(bad, neg));
    const miss = [];
    if (a1.empty) miss.push('a1');
    if (a2.empty) miss.push('a2');
    if (!miss.length && Math.max(a1.v, a2.v) > 1) return { cls: 'warn', label: 'Potong ulang (sudut > 1°)' + negNote, final: true, bad: neg };
    if (est.empty && uk.empty) miss.push('rugi');
    if (miss.length) {
      const c = lkIncomplete(miss, neg);
      if (c.bad.rugi) { delete c.bad.rugi; c.bad.est = 'belum diisi; cukup isi ini atau hasil ukur'; c.bad.ukur = 'belum diisi; cukup isi ini atau estimasi splicer'; }
      c.label += negNote;
      return c;
    }
    if (negNote) return { cls: 'warn', label: 'Periksa pengukuran: rugi sambungan negatif. Cek nilai yang diketik dan referensi OPM; pada OTDR satu arah ukur dari dua arah lalu rata-ratakan.', final: false, bad: neg };
    const basis = uk.empty ? 'estimasi splicer' : 'hasil ukur', u = uk.empty ? est.v : uk.v;
    const base = u <= 0.1 ? ['ok', 'Baik'] : u <= 0.3 ? ['warn', 'Diterima (≤ 0,3 dB)'] : ['err', 'Ulangi sambungan'];
    return { cls: base[0], label: `${base[1]} · ${basis}`, final: true, bad: {}, basis };
  }
  // Isian bersama LKPD 3 (referensi dan redaman kabel) diperiksa sekali untuk semua baris.
  function lk3Shared() {
    const L = lk.l3, NN = { min: 0, minMsg: 'tidak boleh negatif' }, DBM = { min: -60, max: 20, minMsg: 'di luar kisaran wajar', maxMsg: 'di luar kisaran wajar' };
    const S = { ref1310: lkVal(L.ref1310, DBM), ref1550: lkVal(L.ref1550, DBM), att1310: lkVal(L.att1310, NN), att1550: lkVal(L.att1550, NN) };
    const bad = {};
    Object.entries(S).forEach(([k, x]) => { if (x.err) bad[k] = x.err; else if (x.empty) bad[k] = 'belum diisi'; });
    return { S, bad };
  }
  function lk3Calc(r, shared) {
    const sh = shared || lk3Shared(), S = sh.S;
    const NN = { min: 0, minMsg: 'tidak boleh negatif' }, CNT = { min: 0, int: true, minMsg: 'tidak boleh negatif' }, DBM = { min: -60, max: 20, minMsg: 'di luar kisaran wajar', maxMsg: 'di luar kisaran wajar' };
    const F = { km: lkVal(r.km, NN), kon: lkVal(r.kon, CNT), spl: lkVal(r.spl, CNT), rx1310: lkVal(r.rx1310, DBM), rx1550: lkVal(r.rx1550, DBM) };
    const res = (o) => Object.assign({ l1: null, l2: null, b1: null, b2: null, an: '' }, o);
    if (Object.values(F).every(x => x.empty)) return res({ st: ['', '–'], final: false, bad: {} });
    const bad = {};
    Object.entries(F).forEach(([k, x]) => { if (x.err) bad[k] = x.err; });
    if (Object.keys(bad).length) { const c = lkCheckInput(bad); return res({ st: [c.cls, c.label], final: false, bad }); }
    const miss = Object.keys(F).filter(k => F[k].empty);
    const shMiss = Object.keys(sh.bad);
    if (miss.length || shMiss.length) {
      const c = lkIncomplete(miss.concat(shMiss.filter(k => sh.bad[k] === 'belum diisi')), {});
      const shErr = shMiss.filter(k => sh.bad[k] !== 'belum diisi');
      const label = shErr.length ? `Periksa isian referensi: ${shErr.map(k => `${LK_NAMA[k]} ${sh.bad[k]}`).join('; ')}` : c.label;
      return res({ st: ['warn', label], final: false, bad: Object.fromEntries(miss.map(k => [k, 'belum diisi'])) });
    }
    const l1 = S.ref1310.v - F.rx1310.v, l2 = S.ref1550.v - F.rx1550.v;
    const conn = F.kon.v * 0.75 + F.spl.v * 0.3, b1 = F.km.v * S.att1310.v + conn, b2 = F.km.v * S.att1550.v + conn;
    if (l1 < 0 || l2 < 0) {
      const nb = {}; if (l1 < 0) nb.rx1310 = 'lebih besar dari referensi'; if (l2 < 0) nb.rx1550 = 'lebih besar dari referensi';
      return res({ l1, l2, b1, b2, st: ['warn', 'Periksa pengukuran: daya terima lebih besar dari referensi. Ambil ulang referensi atau periksa nilai yang diketik.'], final: false, bad: nb });
    }
    const ok = l1 <= b1 + 1e-9 && l2 <= b2 + 1e-9;
    let an = 'Redaman sesuai batas.';
    if (!ok) an = l2 - l1 > 0.5 ? 'Rugi 1.550 nm jauh lebih besar dari 1.310 nm: curiga tekukan (macrobend). Periksa radius tekuk di sepanjang jalur.'
      : 'Rugi tinggi di kedua panjang gelombang: curiga konektor kotor/rusak, adaptor longgar, atau sambungan buruk. Bersihkan, ukur ulang, lalu cari titiknya dengan VFL/OTDR.';
    return res({ l1, l2, b1, b2, st: ok ? ['ok', 'Lulus'] : ['err', 'Gagal'], an, final: true, bad: {} });
  }
  const lkF2 = v => v === null || v === undefined ? '–' : fmt(v, 2);
  const lkSel = (l, i, k, opts, v) => `<select data-l="${l}" data-i="${i}" data-k="${k}" aria-label="${k}">${opts.map(o => `<option${o === v ? ' selected' : ''} value="${esc(o)}">${o ? esc(o) : '–'}</option>`).join('')}</select>`;
  const lkInp = (l, i, k, v, ph) => `<input type="text" inputmode="decimal" data-l="${l}" data-i="${i}" data-k="${k}" value="${esc(v)}" placeholder="${ph || ''}" aria-label="${k}">`;
  function lkRender() {
    $('#lk1').innerHTML = '<thead><tr><th>Konektor</th><th>Jenis</th><th>Sebelum</th><th>Metode</th><th>Sesudah</th><th>Hasil</th></tr></thead><tbody>' +
      lk.l1.map((r, i) => `<tr><td>${r.kode}</td><td>${lkSel('l1', i, 'jenis', LK_OPT.jenis, r.jenis)}</td><td>${lkSel('l1', i, 'sebelum', LK_OPT.sebelum, r.sebelum)}</td><td>${lkSel('l1', i, 'metode', LK_OPT.metode, r.metode)}</td><td>${lkSel('l1', i, 'sesudah', LK_OPT.sesudah, r.sesudah)}</td><td id="lk1-s${i}"></td></tr>`).join('') + '</tbody>';
    $('#lk2').innerHTML = '<thead><tr><th>Sambungan</th><th>Sudut kiri (°)</th><th>Sudut kanan (°)</th><th>Estimasi splicer (dB)</th><th>Hasil ukur (dB)</th><th>Status</th></tr></thead><tbody>' +
      lk.l2.map((r, i) => `<tr><td>${r.kode}</td><td>${lkInp('l2', i, 'a1', r.a1, '0,5')}</td><td>${lkInp('l2', i, 'a2', r.a2)}</td><td>${lkInp('l2', i, 'est', r.est, '0,02')}</td><td>${lkInp('l2', i, 'ukur', r.ukur)}</td><td id="lk2-s${i}"></td></tr>`).join('') + '</tbody>';
    const L = lk.l3;
    $('#lk3-ref').innerHTML = `<div class="hdr-ctl"><label class="field">P<sub>ref</sub> 1.310 nm (dBm)${lkInp('l3', -1, 'ref1310', L.ref1310, '-5,0')}</label><label class="field">P<sub>ref</sub> 1.550 nm (dBm)${lkInp('l3', -1, 'ref1550', L.ref1550, '-5,2')}</label><label class="field">Redaman kabel 1.310 (dB/km)${lkInp('l3', -1, 'att1310', L.att1310)}</label><label class="field">Redaman kabel 1.550 (dB/km)${lkInp('l3', -1, 'att1550', L.att1550)}</label></div><p class="small muted">Nilai bawaan 0,4 dan 0,3 dB/km adalah nilai khas kabel singlemode; TIA-568.3-D membolehkan hingga 0,5 dB/km untuk kabel luar ruang. Pasangan konektor 0,75 dB dan sambungan 0,3 dB adalah batas maksimum TIA-568.</p>`;
    $('#lk3').innerHTML = '<thead><tr><th>Link</th><th>Panjang (km)</th><th>Pasang konektor</th><th>Sambungan</th><th>P terima 1.310</th><th>P terima 1.550</th><th>Redaman 1.310 / batas</th><th>Redaman 1.550 / batas</th><th>Status</th><th>Analisis</th></tr></thead><tbody>' +
      L.rows.map((r, i) => `<tr><td><input type="text" data-l="l3" data-i="${i}" data-k="nama" value="${esc(r.nama)}" aria-label="nama link" class="lk-name"></td><td>${lkInp('l3', i, 'km', r.km, '1')}</td><td>${lkInp('l3', i, 'kon', r.kon, '2')}</td><td>${lkInp('l3', i, 'spl', r.spl, '0')}</td><td>${lkInp('l3', i, 'rx1310', r.rx1310, '-6,1')}</td><td>${lkInp('l3', i, 'rx1550', r.rx1550, '-6,0')}</td><td id="lk3-a${i}"></td><td id="lk3-b${i}"></td><td id="lk3-s${i}"></td><td id="lk3-n${i}" class="small"></td></tr>`).join('') + '</tbody>';
    $('#lk4').innerHTML = LK_CASES.map((c, i) => `<div class="card lk-case"><h3>${i + 1}. ${esc(c.t)}</h3><p class="small">${esc(c.d)}</p><label class="field">Analisis kamu<textarea data-l="l4" data-i="${i}" rows="3" placeholder="Penyebab, lokasi, langkah perbaikan, cara membuktikan">${esc(lk.l4[i] || '')}</textarea></label><details class="reveal"><summary>Pembahasan</summary><div><p>${esc(c.b)}</p></div></details></div>`).join('');
    lkUpdate();
  }
  function lkUpdate() {
    const tagc = (cls, t) => `<span class="tag ${cls}">${esc(t)}</span>`;
    // Menandai isian yang kosong atau tidak masuk akal sesuai hasil penilaian barisnya.
    const mark = (l, i, bad) => $$(`#s-6-8 [data-l="${l}"][data-i="${i}"]`).forEach(el => {
      const m = bad[el.dataset.k];
      el.classList.toggle('bad', !!m);
      if (m) { el.title = `${LK_NAMA[el.dataset.k] || el.dataset.k}: ${m}`; el.setAttribute('aria-invalid', 'true'); } else { el.removeAttribute('title'); el.removeAttribute('aria-invalid'); }
    });
    lk.l1.forEach((r, i) => { const s = lk1Status(r); $('#lk1-s' + i).innerHTML = tagc(s.cls, s.label); mark('l1', i, s.bad); });
    lk.l2.forEach((r, i) => { const s = lk2Status(r); $('#lk2-s' + i).innerHTML = tagc(s.cls, s.label); mark('l2', i, s.bad); });
    const sh = lk3Shared();
    const anyRow = lk.l3.rows.some(r => ['km', 'kon', 'spl', 'rx1310', 'rx1550'].some(k => String(r[k] || '').trim() !== ''));
    mark('l3', -1, anyRow ? sh.bad : Object.fromEntries(Object.entries(sh.bad).filter(([, m]) => m !== 'belum diisi')));
    lk.l3.rows.forEach((r, i) => {
      const c = lk3Calc(r, sh);
      $('#lk3-a' + i).textContent = `${lkF2(c.l1)} / ${lkF2(c.b1)} dB`;
      $('#lk3-b' + i).textContent = `${lkF2(c.l2)} / ${lkF2(c.b2)} dB`;
      $('#lk3-s' + i).innerHTML = tagc(c.st[0], c.st[1]);
      $('#lk3-n' + i).textContent = c.an;
      mark('l3', i, c.bad);
    });
  }
  $('#s-6-8').addEventListener('input', e => {
    const t = e.target.closest('[data-l]'); if (!t) return;
    const l = t.dataset.l, i = +t.dataset.i, k = t.dataset.k;
    if (l === 'l4') lk.l4[i] = t.value;
    else if (l === 'l3' && i < 0) lk.l3[k] = t.value;
    else if (l === 'l3') lk.l3.rows[i][k] = t.value;
    else lk[l][i][k] = t.value;
    lkSave(); lkUpdate();
  });
  $('#lk-sample').addEventListener('click', () => {
    const has = JSON.stringify(lk) !== JSON.stringify(Object.assign(LK_DEF(), { l4: lk.l4 }));
    if (has && !confirm('Isi tabel LKPD 1–3 akan diganti contoh data. Lanjutkan?')) return;
    LK_SAMPLE.l1.forEach(([j, s, m, a], i) => Object.assign(lk.l1[i], { jenis: j, sebelum: s, metode: m, sesudah: a }));
    LK_SAMPLE.l2.forEach(([a1, a2, est, ukur], i) => Object.assign(lk.l2[i], { a1, a2, est, ukur }));
    Object.assign(lk.l3, { ref1310: LK_SAMPLE.l3.ref1310, ref1550: LK_SAMPLE.l3.ref1550 });
    LK_SAMPLE.l3.rows.forEach(([km, kon, spl, rx1310, rx1550], i) => Object.assign(lk.l3.rows[i], { km, kon, spl, rx1310, rx1550 }));
    lk.sample = true;
    lkSave(); lkRender();
    toast('Contoh data dimuat. Analisis kolom Status dan Analisis.');
  });
  $('#lk-clear').addEventListener('click', () => {
    if (!confirm('Kosongkan semua isian LKPD?')) return;
    Object.assign(lk, LK_DEF()); delete lk.sample;
    lkSave(); lkRender();
  });
  lkRender();

  /* ============================== Lab kabel RJ45 ============================== */
  (function lab() {
    const KEYS = Object.keys(WIRES);
    const st = store.get('lab', { target: 'straight', A: Array(8).fill(null), B: Array(8).fill(null) });
    let active = 'A', testing = false;
    const stats = store.get('lab-stats', { tries: 0, pass: 0, straight: false, cross: false });
    const GOAL = { straight: 'Target: T568B di kedua ujung (PC ke switch).', cross: 'Target: T568A di satu ujung, T568B di ujung lain (PC ke PC).', free: 'Bebas: susun apa saja, tester akan memberi tahu jenis kabelnya.' };
    const save = () => store.set('lab', st);
    $$('#lab-target button').forEach(b => b.classList.toggle('on', b.dataset.t === st.target));
    function plug(end) {
      const w = st[end];
      let h = '<rect class="rj-jacket" x="62" y="112" width="76" height="34" rx="6"/><path class="rj-body" d="M24 14 H176 V108 H24 Z"/>';
      w.forEach((k, i) => {
        const x = 32 + i * 17.6;
        h += `<rect class="rj-pin" x="${x + 2}" y="18" width="10" height="10" rx="1.5"/>`;
        if (k) h += `<path class="rj-wire" d="M${x + 7} 104 L${x + 7} 32" style="stroke:${WIRES[k].c}"/>${WIRES[k].w ? `<path class="rj-wire-w" d="M${x + 7} 104 L${x + 7} 32"/>` : ''}<path d="M${x + 7} 104 Q${x + 7} 116 ${80 + i * 5.6} 118" class="rj-tail" style="stroke:${WIRES[k].c}"/>`;
        h += `<rect class="rj-slot${k ? ' full' : ''}" data-slot="${i}" x="${x}" y="30" width="14" height="76" rx="3" tabindex="0" role="button" aria-label="Pin ${i + 1}: ${k ? WIRES[k].name + ', ketuk untuk mencabut' : 'kosong'}"/>`;
        h += `<text class="rj-num" x="${x + 7}" y="12" text-anchor="middle">${i + 1}</text>`;
      });
      $('#lab-plug' + end).innerHTML = h;
      const std = T568.A.every((k, i) => w[i] === k) ? 'T568A' : T568.B.every((k, i) => w[i] === k) ? 'T568B' : w.every(x => x) ? 'urutan lain' : `${w.filter(x => x).length}/8 kabel`;
      $('#lab-std' + end).textContent = std;
    }
    function pool() {
      const used = st[active].filter(Boolean);
      $('#lab-pool').innerHTML = KEYS.map(k => `<button type="button" class="wire-btn" data-k="${k}"${used.includes(k) ? ' disabled' : ''}><i style="${wireStyle(k)}"></i>${WIRES[k].name}</button>`).join('');
    }
    function drawAll() { plug('A'); plug('B'); pool(); $('#lab-goal').textContent = GOAL[st.target]; $$('.rj-card').forEach(c => { c.classList.toggle('on', c.dataset.end === active); c.setAttribute('aria-pressed', c.dataset.end === active ? 'true' : 'false'); }); drawStats(); }
    function drawStats() { $('#lab-stats').innerHTML = `<div><b>${stats.tries}</b><span>percobaan</span></div><div><b>${stats.pass}</b><span>lulus</span></div><div><b>${stats.straight ? '✓' : '–'}</b><span>straight</span></div><div><b>${stats.cross ? '✓' : '–'}</b><span>crossover</span></div>`; }
    function tester(map, step) {
      let h = '<rect class="ts-unit" x="6" y="10" width="146" height="128" rx="12"/><rect class="ts-unit" x="168" y="10" width="146" height="128" rx="12"/><text class="ts-lab" x="79" y="30" text-anchor="middle">MASTER</text><text class="ts-lab" x="241" y="30" text-anchor="middle">REMOTE</text>';
      for (let i = 0; i < 9; i++) {

        const x1 = 22 + i * 14.5, x2 = 184 + i * 14.5;
        const onM = step === i, onR = step >= 0 && step < 8 && map && map[step] === i;
        h += `<circle class="ts-led${onM ? ' on' : ''}" cx="${x1}" cy="70" r="5.5"/><text class="ts-n" x="${x1}" y="92" text-anchor="middle">${i < 8 ? i + 1 : 'G'}</text>`;
        h += `<circle class="ts-led${onR ? ' on' : ''}" cx="${x2}" cy="70" r="5.5"/><text class="ts-n" x="${x2}" y="92" text-anchor="middle">${i < 8 ? i + 1 : 'G'}</text>`;

      }
      h += '<text class="ts-lab small" x="160" y="128" text-anchor="middle">lampu menyala berurutan 1 → 8</text>';
      $('#lab-tester').innerHTML = h;
    }
    tester(null, -1);
    $('#lab-pool').addEventListener('click', e => {
      const b = e.target.closest('.wire-btn'); if (!b || testing) return;
      const w = st[active], i = w.indexOf(null);
      if (i < 0) { toast(`Ujung ${active} sudah penuh. Ketuk kabel di konektor untuk mencabut.`); return; }
      w[i] = b.dataset.k; save(); drawAll();
      if (!w.includes(null) && active === 'A' && st.B.includes(null)) { active = 'B'; drawAll(); toast('Ujung A lengkap. Lanjut ujung B.'); }
    });
    ['A', 'B'].forEach(end => {
      const card = $(`.rj-card[data-end="${end}"]`);
      card.addEventListener('click', e => {
        const slot = e.target.closest('[data-slot]');
        if (slot && active === end && !testing) { st[end][+slot.dataset.slot] = null; save(); }
        active = end; drawAll();
      });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const slot = e.target.closest('[data-slot]'); if (slot) { st[end][+slot.dataset.slot] = null; save(); } active = end; drawAll(); } });
    });
    $('#lab-clear').addEventListener('click', () => { st[active] = Array(8).fill(null); save(); drawAll(); });
    $('#lab-fillA').addEventListener('click', () => { st[active] = T568.A.slice(); save(); drawAll(); });
    $('#lab-fillB').addEventListener('click', () => { st[active] = T568.B.slice(); save(); drawAll(); });
    segPick($('#lab-target'), 't', v => { st.target = v; save(); drawAll(); $('#lab-out').innerHTML = ''; $('#lab-verdict').textContent = ''; });

    const PIN_PAIRS = [[0, 1], [2, 5], [3, 4], [6, 7]];
    const stdOf = w => T568.A.every((k, i) => w[i] === k) ? 'A' : T568.B.every((k, i) => w[i] === k) ? 'B' : T568.A.every((k, i) => w[7 - i] === k) ? 'revA' : T568.B.every((k, i) => w[7 - i] === k) ? 'revB' : null;
    const splitPairs = w => PIN_PAIRS.filter(([a, b]) => !w[a] || !w[b] || PAIR_OF[w[a]] !== PAIR_OF[w[b]]);
    $('#lab-test').addEventListener('click', () => {
      if (testing) return;
      const A = st.A, B = st.B;
      if (A.includes(null) || B.includes(null)) { $('#lab-verdict').textContent = 'Konektor belum lengkap'; $('#lab-verdict').className = 'verdict bad'; $('#lab-out').innerHTML = `<div class="check err"><span class="ci">✕</span><span>Isi semua 8 pin di ujung A dan B dulu. Kabel yang tidak masuk sampai ujung konektor tidak akan tersambung.</span></div>`; return; }
      const map = A.map(k => B.indexOf(k));
      testing = true;
      let s = 0;
      const out = () => {
        testing = false;
        tester(map, -1);
        const sA = stdOf(A), sB = stdOf(B), spA = splitPairs(A), spB = splitPairs(B);
        const ident = map.every((j, i) => j === i);
        const cross = [2, 5, 0, 3, 4, 1, 6, 7].every((j, i) => map[i] === j);
        const msgs = [];
        const add = (l, t) => msgs.push(`<div class="check ${l}"><span class="ci">${l === 'ok' ? '✓' : l === 'warn' ? '!' : '✕'}</span><span>${t}</span></div>`);
        add(ident || cross ? 'ok' : 'warn', `Pola lampu: ${map.map((j, i) => `${i + 1}→${j + 1}`).join(', ')}.`);
        [['A', sA, spA], ['B', sB, spB]].forEach(([e, s2, sp]) => {
          if (s2 === 'A' || s2 === 'B') add('ok', `Ujung ${e} sesuai T568${s2}.`);
          else if (s2 === 'revA' || s2 === 'revB') add('err', `Ujung ${e}: urutan T568${s2.slice(3)} tetapi terbalik (pin 1 ↔ 8). Kemungkinan konektor dilihat dari sisi yang salah: pegang dengan pengunci di bawah dan lubang kabel menghadap kamu.`);
          else add('err', `Ujung ${e} tidak sesuai T568A maupun T568B.`);
          if (sp.length && s2 !== 'revA' && s2 !== 'revB') add('warn', `Ujung ${e}: split pair pada pin ${sp.map(([a, b]) => `${a + 1}-${b + 1}`).join(', ')}. Dua kabel di pin tersebut bukan pasangan pilinan yang sama, sehingga crosstalk tinggi walaupun lampu tester menyala.`);
        });
        let pass = false, kind;
        if ((sA === 'A' || sA === 'B') && sA === sB) kind = `straight-through (T568${sA}–T568${sB})`;
        else if ((sA === 'A' && sB === 'B') || (sA === 'B' && sB === 'A')) kind = 'crossover (T568A–T568B)';
        else if (ident) kind = 'straight dengan urutan tidak standar';
        else if (cross) kind = 'crossover dengan urutan tidak standar';
        else kind = 'tidak sesuai standar (pola lampu acak)';
        if (st.target === 'straight') {
          pass = (sA === 'A' || sA === 'B') && sA === sB;
          if (pass && sA === 'A') add('ok', 'Straight T568A–T568A juga benar, tetapi di Indonesia yang paling umum dipakai adalah T568B.');
        } else if (st.target === 'cross') pass = (sA === 'A' && sB === 'B') || (sA === 'B' && sB === 'A');
        else pass = !!(sA && sB && !sA.startsWith('rev') && !sB.startsWith('rev'));
        add(pass ? 'ok' : 'err', `Hasil: kabel ${kind}.${st.target === 'free' ? '' : pass ? ' Sesuai target.' : ` Belum sesuai target ${st.target === 'straight' ? 'straight-through' : 'crossover'}.`}`);
        if (pass && cross) add('ok', 'Crossover ini menukar pasangan kirim (1-2) dan terima (3-6), cukup untuk 10/100 Mbps. Untuk gigabit, perangkat modern memakai Auto MDI-X.');
        stats.tries++;
        if (pass) { stats.pass++; if (st.target === 'straight' || (st.target === 'free' && sA === sB)) stats.straight = true; if (st.target === 'cross' || (st.target === 'free' && sA !== sB)) stats.cross = true; }
        store.set('lab-stats', stats); drawStats();
        $('#lab-verdict').textContent = pass ? 'Lulus uji' : 'Belum lulus';
        $('#lab-verdict').className = 'verdict ' + (pass ? 'ok' : 'bad');
        $('#lab-out').innerHTML = msgs.join('');
      };
      if (reduced) { out(); return; }
      const tick = () => { tester(map, s); if (++s <= 8) setTimeout(tick, 330); else out(); };
      $('#lab-out').innerHTML = ''; $('#lab-verdict').textContent = 'Menguji…'; $('#lab-verdict').className = 'verdict';
      tick();
    });
    drawAll();
  })();

  /* ============================== Simulator VoIP ============================== */
  // Jalur utama: Asterisk 21+ dengan PJSIP (pjsip.conf). Jalur lama: chan_sip (sip.conf) untuk server Asterisk 20 ke bawah.
  const USERS = [['101', 'Andi'], ['102', 'Budi'], ['103', 'Lab TKJ']];
  // Membuat pjsip.conf 3 akun; o berisi pengubahan per akun untuk contoh dan soal perbaikan.
  function pjAcc(o) {
    o = o || {};
    let s = `; Akun SIP untuk softphone (Asterisk 21 ke atas, modul PJSIP).
; Alamat server Asterisk: 192.168.1.5
; Setiap akun terdiri atas 3 section bernama sama:
;   type=endpoint (aturan panggilan), type=auth (password), type=aor (alamat softphone)

[transport-udp]
type=transport
protocol=udp
bind=0.0.0.0:5060          ; dengarkan port SIP 5060 di semua alamat
`;
    USERS.forEach(([n, nm], i) => {
      const x = o[n] || {}, c = i === 0;
      s += `
; ---------- ${n}: ${nm} ----------
[${n}]
type=endpoint
context=${x.context || 'internal'}${c && !x.context ? '           ; panggilan dari akun ini masuk ke [internal]' : ''}
disallow=all
allow=${x.allow || 'ulaw,alaw,gsm'}
auth=${n}
aors=${n}
callerid="${nm}" <${n}>
${x.extra ? x.extra + '\n' : ''}
[${n}]
type=auth
auth_type=userpass
username=${n}
password=${x.password || 'rahasia' + n}

[${n}]
type=aor
${x.noMax ? '' : 'max_contacts=1' + (c ? '             ; boleh 1 softphone terdaftar' : '') + '\n'}`;
    });
    return s + (o.tail || '');
  }
  const SIP_BASE = `; Versi LAMA: chan_sip (Asterisk 20 ke bawah, modul usang dan dihapus di Asterisk 21).
; Alamat server Asterisk: 192.168.1.5
[general]
context=default        ; context untuk panggilan tanpa akun
allowguest=no          ; tolak panggilan dari pihak tak dikenal
bindport=5060
disallow=all
allow=ulaw
allow=alaw
allow=gsm

[101]
type=friend            ; bisa memanggil dan dipanggil
host=dynamic           ; IP mengikuti saat softphone mendaftar
secret=rahasia101
context=internal       ; panggilan dari akun ini masuk ke [internal]
callerid="Andi" <101>

[102]
type=friend
host=dynamic
secret=rahasia102
context=internal
callerid="Budi" <102>

[103]
type=friend
host=dynamic
secret=rahasia103
context=internal
callerid="Lab TKJ" <103>
`;
  const PJ_TRUNK = `
; ---------- trunk ke penyedia layanan SIP (simulasi) ----------
[trunk-pstn]
type=endpoint
context=dari-pstn
disallow=all
allow=ulaw,alaw
outbound_auth=trunk-pstn-auth
aors=trunk-pstn
from_user=02150001234

[trunk-pstn-auth]
type=auth
auth_type=userpass
username=02150001234
password=rahasiatrunk

[trunk-pstn]
type=aor
contact=sip:sip.provider.test   ; alamat server penyedia

[trunk-pstn]
type=identify
endpoint=trunk-pstn
match=sip.provider.test          ; panggilan masuk dari alamat ini = trunk
`;
  const SIP_TRUNK = `
; trunk ke penyedia layanan SIP (simulasi)
[trunk-pstn]
type=peer
host=sip.provider.test
fromuser=02150001234
secret=rahasiatrunk
insecure=invite
context=dari-pstn
disallow=all
allow=ulaw
allow=alaw
`;
  const EXT_HEAD = `[general]
static=yes
writeprotect=no
autofallthrough=yes

[globals]
OPERATOR=PJSIP/101
`;
  const VM_BASE = `[general]
format=wav49

[default]
101 => 1234,Andi
102 => 1234,Budi
103 => 1234,Lab TKJ
`;
  // Dialplan ditulis untuk PJSIP; versi chan_sip dibuat otomatis (PJSIP/n@trunk → SIP/trunk/n, PJSIP/ → SIP/).
  const toSipExt = s => s.replace(/PJSIP\/([^,)&@\s]+)@([A-Za-z0-9_-]+)/g, 'SIP/$2/$1').replace(/PJSIP\//g, 'SIP/');
  const EXAMPLES = [
    { id: 'dasar', name: 'Dasar: 3 extension, pengumuman, tes gema', pj: pjAcc(), sip: SIP_BASE, ext: EXT_HEAD + `
[internal]
exten => 101,1,Dial(PJSIP/101,20)
 same => n,Hangup()

exten => 102,1,Dial(PJSIP/102,20)
 same => n,Hangup()

exten => 103,1,Dial(PJSIP/103,20)
 same => n,Hangup()

; 500: tes pengumuman suara
exten => 500,1,Answer()
 same => n,Playback(hello-world)
 same => n,Hangup()

; 600: tes gema (echo test)
exten => 600,1,Answer()
 same => n,Echo()
`, tip: 'Daftarkan HP Andi dan HP Budi, lalu dari Andi panggil 102, 500, dan 600.' },
    { id: 'vm', name: 'Pattern _1XX + voicemail saat sibuk/tak diangkat', pj: pjAcc(), sip: SIP_BASE, ext: EXT_HEAD + `
[internal]
; satu baris pattern untuk semua extension 100-199
exten => _1XX,1,NoOp(Panggilan dari \${CALLERID(num)} ke \${EXTEN})
 same => n,Dial(PJSIP/\${EXTEN},20)
 same => n,GotoIf($["\${DIALSTATUS}" = "BUSY"]?sibuk)
 same => n,VoiceMail(\${EXTEN}@default,u)   ; tidak diangkat/tidak aktif
 same => n,Hangup()
 same => n(sibuk),VoiceMail(\${EXTEN}@default,b)
 same => n,Hangup()

; *97: cek kotak suara sendiri
exten => *97,1,VoiceMailMain(\${CALLERID(num)}@default)
 same => n,Hangup()

exten => 600,1,Answer()
 same => n,Echo()
`, tip: 'Panggil 102 tiga kali dengan pilihan penerima berbeda (angkat, sibuk, tidak diangkat), lalu bandingkan DIALSTATUS di log.' },
    { id: 'trunk', name: 'Trunk keluar: tekan 9 + nomor telepon', pj: pjAcc({ tail: PJ_TRUNK }), sip: SIP_BASE + SIP_TRUNK, ext: EXT_HEAD + `
[internal]
exten => _1XX,1,Dial(PJSIP/\${EXTEN},20)
 same => n,Hangup()

; 9 + nomor: keluar lewat trunk, angka 9 dibuang dengan \${EXTEN:1}
exten => _9X.,1,NoOp(Panggilan keluar ke \${EXTEN:1})
 same => n,Dial(PJSIP/\${EXTEN:1}@trunk-pstn,30)
 same => n,Congestion()

[dari-pstn]
; panggilan masuk dari luar diarahkan ke operator
exten => s,1,Dial(\${OPERATOR},30)
 same => n,Hangup()
`, tip: 'Dari HP Andi panggil 9081234567890. Perhatikan nomor yang dikirim ke trunk tanpa angka 9.' },
    { id: 'ivr', name: 'IVR PT X: tekan 1 HRD, 2 Keuangan, 0 operator', pj: pjAcc(), sip: SIP_BASE, ext: EXT_HEAD + `
[internal]
exten => _1XX,1,Dial(PJSIP/\${EXTEN},20)
 same => n,Hangup()

; 200: nomor utama kantor, dijawab mesin penjawab (IVR)
exten => 200,1,Goto(ivr-ptx,s,1)

[ivr-ptx]
exten => s,1,Answer()
 same => n,Background(custom/menu-ptx)  ; "Tekan 1 HRD, 2 Keuangan, 0 operator"
 same => n,WaitExten(5)

exten => 1,1,Dial(PJSIP/102,20)   ; HRD
 same => n,Hangup()
exten => 2,1,Dial(PJSIP/103,20)   ; Keuangan
 same => n,Hangup()
exten => 0,1,Dial(PJSIP/101,20)   ; Operator
 same => n,Hangup()

exten => i,1,Playback(pbx-invalid)  ; tombol tidak ada di menu
 same => n,Goto(s,2)
exten => t,1,Playback(vm-goodbye)   ; tidak menekan apa pun
 same => n,Hangup()
`, tip: 'Dari HP Andi panggil 200 dan isi "Digit saat menu" dengan 1, lalu coba 5 dan kosong.' },
    { id: 'acl', name: 'Keamanan: permit/deny alamat IP',
      pj: pjAcc({ 101: { extra: 'deny=0.0.0.0/0.0.0.0             ; tolak semua alamat…\npermit=192.168.1.0/255.255.255.0 ; …kecuali jaringan lab' }, 102: { extra: 'deny=0.0.0.0/0.0.0.0\npermit=192.168.2.0/24            ; hanya dari jaringan kantor' } }),
      sip: SIP_BASE.replace('callerid="Andi" <101>', 'callerid="Andi" <101>\ndeny=0.0.0.0/0.0.0.0             ; tolak semua alamat…\npermit=192.168.1.0/255.255.255.0 ; …kecuali jaringan lab').replace('callerid="Budi" <102>', 'callerid="Budi" <102>\ndeny=0.0.0.0/0.0.0.0\npermit=192.168.2.0/24            ; hanya dari jaringan kantor'),
      ext: EXT_HEAD + `
[internal]
exten => _1XX,1,Dial(PJSIP/\${EXTEN},20)
 same => n,Hangup()
`, tip: 'Daftarkan HP Andi dan HP Budi. Mengapa Budi ditolak? Perbaiki permit-nya atau ubah IP HP Budi.' }
  ];
  const exampleFiles = (x, mode) => ({ acc: mode === 'sip' ? x.sip : x.pj, ext: mode === 'sip' ? toSipExt(x.ext) : x.ext, vm: VM_BASE });
  const DEVS_DEF = [
    { label: 'HP Andi', user: '101', secret: 'rahasia101', server: '192.168.1.5', ip: '192.168.1.11', codecs: ['ulaw', 'alaw'] },
    { label: 'HP Budi', user: '102', secret: 'rahasia102', server: '192.168.1.5', ip: '192.168.1.12', codecs: ['ulaw', 'gsm'] },
    { label: 'PC Lab', user: '103', secret: 'rahasia103', server: '192.168.1.5', ip: '192.168.1.13', codecs: ['alaw', 'gsm'] }
  ];
  const vp = {
    mode: store.get('voip-mode', 'pjsip'),
    files: store.get('voip-files2', { pjsip: exampleFiles(EXAMPLES[0], 'pjsip'), sip: exampleFiles(EXAMPLES[0], 'sip') }),
    file: 'acc', server: null, devs: store.get('voip-devs', DEVS_DEF.map(d => Object.assign({}, d))), regState: {}, anim: null
  };
  if (!vp.files.pjsip || !vp.files.sip) vp.files = { pjsip: exampleFiles(EXAMPLES[0], 'pjsip'), sip: exampleFiles(EXAMPLES[0], 'sip') };
  const fileName = (f, mode) => f === 'acc' ? AST.MODES[mode || vp.mode].file : f === 'ext' ? 'extensions.conf' : 'voicemail.conf';
  const fileKey = name => name === 'extensions.conf' ? 'ext' : name === 'voicemail.conf' ? 'vm' : 'acc';
  const curFiles = () => vp.files[vp.mode];
  const saveFiles = () => store.set('voip-files2', vp.files);
  const ta = $('#vp-text'), gut = $('#vp-gutter');
  function cliAppend(text, cls) {
    const out = $('#vp-cli-out');
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = text + '\n';
    out.appendChild(span);
    out.scrollTop = out.scrollHeight;
  }
  function gutter() {
    const n = ta.value.split('\n').length;
    const bad = new Set((vp.server ? vp.server.diags : []).filter(d => d.file === fileName(vp.file) && d.sev !== 'notice').map(d => d.line));
    let s = '';
    for (let i = 1; i <= n; i++) s += bad.has(i) ? `<b>${i}</b>\n` : i + '\n';
    gut.innerHTML = s;
    gut.scrollTop = ta.scrollTop;
  }
  function fileTabs() {
    $$('#vp-files button').forEach(b => { b.classList.toggle('on', b.dataset.f === vp.file); if (b.dataset.f === 'acc') b.textContent = fileName('acc'); });
    $$('#vp-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === vp.mode));
    $('#vp-mode-note').innerHTML = vp.mode === 'pjsip'
      ? 'Jalur utama. Cocok untuk Asterisk 16 sampai 22+ karena PJSIP sudah bawaan; wajib untuk Asterisk 21 ke atas. Kanal di dialplan: <code>PJSIP/101</code>, cek akun: <code>pjsip show endpoints</code>.'
      : 'Hanya untuk server lama (Asterisk 20 ke bawah) yang masih memuat modul chan_sip. Kanal: <code>SIP/101</code>, cek akun: <code>sip show peers</code>.';
  }
  function showFile(f) {
    curFiles()[vp.file] = ta.value;
    vp.file = f;
    ta.value = curFiles()[f];
    fileTabs(); gutter();
  }
  ta.addEventListener('input', debounce(() => { curFiles()[vp.file] = ta.value; saveFiles(); gutter(); }, 250));
  ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText(' ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  });
  segPick($('#vp-files'), 'f', showFile);
  function setMode(m, quiet) {
    if (m === vp.mode && vp.server) return;
    curFiles()[vp.file] = ta.value; saveFiles();
    vp.mode = m; store.set('voip-mode', m);
    vp.server = null; vp.regState = {};
    ta.value = curFiles()[vp.file];
    reload(true);
    if (!quiet) { cliAppend(`; Beralih ke ${AST.MODES[m].ver}. Daftarkan ulang softphone.`, 'sys'); toast(`Mode ${AST.MODES[m].ver}`); }
  }
  segPick($('#vp-mode'), 'm', m => setMode(m));
  $('#vp-sym').innerHTML = ['=>', ',', '(', ')', '[', ']', '${', '}', '_', ';', '=', '/', '@', '.', '"'].map(s => `<button type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('');
  $('#vp-sym').addEventListener('mousedown', e => e.preventDefault());
  $('#vp-sym').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const s = ta.selectionStart; ta.setRangeText(b.dataset.s, s, ta.selectionEnd, 'end'); ta.focus(); ta.dispatchEvent(new Event('input'));
  });
  function renderDiags() {
    const box = $('#vp-diags'), D = vp.server.diags;
    if (!D.length) { box.innerHTML = '<div class="diag ok"><span class="msg"><b>OK</b> Konfigurasi terbaca tanpa peringatan.</span></div>'; return; }
    const order = { error: 0, warning: 1, notice: 2 };
    box.innerHTML = D.slice().sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file) || a.line - b.line)
      .map(d => `<button type="button" class="diag ${d.sev === 'error' ? 'error' : d.sev === 'warning' ? 'warning' : 'notice'}" data-file="${d.file}" data-line="${d.line || 1}"><span class="msg">${esc(d.file)}:${d.line || '?'}: <b>${d.sev}</b>: ${esc(d.msg)}</span><span class="hint">${esc(d.hint || '')}</span></button>`).join('');
  }
  $('#vp-diags').addEventListener('click', e => {
    const b = e.target.closest('.diag[data-file]'); if (!b) return;
    showFile(fileKey(b.dataset.file));
    const lines = ta.value.split('\n'), ln = +b.dataset.line;
    const start = lines.slice(0, ln - 1).join('\n').length + (ln > 1 ? 1 : 0);
    ta.focus(); ta.setSelectionRange(start, start + (lines[ln - 1] || '').length);
    ta.scrollTop = Math.max(0, (ln - 4) * parseFloat(getComputedStyle(ta).lineHeight));
    if (matchMedia('(max-width: 1099px)').matches) setPane('code');
  });
  function reload(quiet) {
    curFiles()[vp.file] = ta.value;
    saveFiles();
    const prev = vp.server;
    vp.server = AST.load(Object.assign({ mode: vp.mode }, curFiles()));
    const lost = [];
    if (prev && prev.mode === vp.mode) {
      vp.server.vmCount = prev.vmCount; vp.server.chanSeq = prev.chanSeq;
      // Konfigurasi baru diterapkan seluruhnya, lalu setiap softphone yang tadinya terdaftar diperiksa ulang.
      Object.values(prev.regs).forEach(r => {
        const res = AST.register(vp.server, r.dev);
        if (res.ok) return;
        const i = vp.devs.indexOf(r.dev);
        if (i >= 0) vp.regState[i] = `${res.code} ${res.text}`;
        const why = (res.events.filter(e => e.t === 'note' && e.cls === 'bad').pop() || {}).text || '';
        lost.push({ user: r.dev.user, code: res.code, text: res.text, why });
        logVoip({ jenis: 'daftar', dari: r.dev.user, ok: false, hasil: `registrasi gugur setelah Muat ulang · ${res.code} ${res.text}` });
      });
    }
    fileTabs(); renderDiags(); renderListen(); gutter(); renderPhones();
    if (lost.length) cliAppend(`; Setelah Muat ulang, registrasi ${lost.map(x => `${x.user} (${x.code} ${x.text})`).join(', ')} tidak berlaku lagi. ${lost[0].why}`, 'warn');
    if (!quiet) {
      const e = vp.server.diags.filter(d => d.sev === 'error').length, w = vp.server.diags.filter(d => d.sev === 'warning').length;
      cliAppend('CLI> core reload', 'in');
      cliAppend(vp.mode === 'pjsip'
        ? `    -- Reloading module 'res_pjsip.so' (Basic SIP resource)\n    -- Reloading module 'pbx_config.so' (Text Extension Configuration)\nDialplan reloaded.`
        : `    -- Reloading module 'chan_sip.so' (Session Initiation Protocol (SIP))\n    -- Reloading module 'pbx_config.so' (Text Extension Configuration)\nDialplan reloaded.`);
      toast(lost.length ? `Dimuat; ${lost.length} registrasi gugur` : e ? `Dimuat dengan ${e} error dan ${w} peringatan` : w ? `Dimuat dengan ${w} peringatan` : 'Konfigurasi dimuat');
    }
  }
  // Status transport yang menjawab softphone: sumber yang sama dengan pemeriksaan REGISTER dan INVITE.
  function renderListen() {
    const L = AST.sipListen(vp.server), el = $('#vp-listen');
    el.className = 'check ' + (L.ok ? 'ok' : 'err');
    el.innerHTML = L.ok ? `<span class="ci">✓</span><span>Transport aktif: <b>${esc(L.t.name)}</b> (UDP ${esc(L.t.ip)}:${L.t.port}). Softphone bisa mendaftar.</span>`
      : `<span class="ci">✕</span><span><b>Softphone tidak akan dijawab:</b> ${esc(L.why)} Registrasi dan panggilan gagal (408) sampai transport diperbaiki dan dimuat ulang.</span>`;
  }
  $('#vp-reload').addEventListener('click', () => reload(false));
  $('#vp-example').innerHTML = '<option value="">Contoh konfigurasi…</option>' + EXAMPLES.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
  $('#vp-example').addEventListener('change', e => {
    const x = EXAMPLES.find(y => y.id === e.target.value);
    e.target.value = '';
    if (!x) return;
    vp.files[vp.mode] = exampleFiles(x, vp.mode);
    ta.value = curFiles()[vp.file];
    reload(true);
    cliAppend(`; Contoh "${x.name}" dimuat (${fileName('acc')}). ${x.tip}`, 'sys');
    toast('Contoh dimuat. ' + x.tip);
  });
  $('#vp-save').addEventListener('click', () => { curFiles()[vp.file] = ta.value; saveFile(fileName(vp.file), ta.value); });
  $('#vp-open').addEventListener('click', () => $('#vp-file').click());
  $('#vp-file').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const nm = f.name.toLowerCase();
      const target = /extensions/.test(nm) ? 'ext' : /voicemail/.test(nm) ? 'vm' : /sip/.test(nm) ? 'acc' : vp.file;
      if (target === 'acc') { const m = /pjsip/.test(nm) ? 'pjsip' : 'sip'; if (m !== vp.mode) setMode(m, true); }
      curFiles()[target] = String(rd.result);
      if (target !== vp.file) showFile(target); else ta.value = curFiles()[target];
      reload(false);
      toast(`${f.name} dimuat ke ${fileName(target)}`);
    };
    rd.readAsText(f);
    e.target.value = '';
  });

  // Softphone
  function renderPhones() {
    if (!vp.server) return;
    $('#vp-phones').innerHTML = vp.devs.map((d, i) => {
      const reg = vp.server.regs[d.user] && vp.server.regs[d.user].dev === d;
      const stt = reg ? ['ok', 'Terdaftar'] : vp.regState[i] ? ['err', vp.regState[i]] : ['', 'Belum terdaftar'];
      return `<div class="phone" data-i="${i}"><div class="phone-head"><b>${esc(d.label)}</b><span class="mono small">${esc(d.user)}@${esc(d.server)}</span><span class="tag ${stt[0]}">${esc(stt[1])}</span>
        <button type="button" class="btn ${reg ? 'btn-ghost' : 'btn-primary'} small" data-act="${reg ? 'unreg' : 'reg'}">${reg ? 'Keluar' : 'Daftar'}</button></div>
        <details class="phone-more"><summary>Pengaturan akun di softphone</summary><div class="phone-grid">
          <label class="field">Username<input type="text" data-f="user" value="${esc(d.user)}" autocomplete="off"></label>
          <label class="field">Password<input type="text" data-f="secret" value="${esc(d.secret)}" autocomplete="off"></label>
          <label class="field">Server/domain<input type="text" data-f="server" value="${esc(d.server)}" autocomplete="off" inputmode="decimal"></label>
          <label class="field">IP perangkat<input type="text" data-f="ip" value="${esc(d.ip)}" autocomplete="off" inputmode="decimal"></label>
          <div class="field">Codec<div class="codec-row">${['ulaw', 'alaw', 'gsm', 'g729'].map(c => `<label><input type="checkbox" data-codec="${c}"${d.codecs.includes(c) ? ' checked' : ''}> ${c}</label>`).join('')}</div></div>
        </div></details></div>`;
    }).join('');
    const from = $('#vp-from'), cur = from.value;
    from.innerHTML = vp.devs.map((d, i) => `<option value="${i}">${esc(d.label)} (${esc(d.user)})</option>`).join('');
    if (cur) from.value = cur;
  }
  $('#vp-phones').addEventListener('change', e => {
    const card = e.target.closest('.phone'); if (!card) return;
    const d = vp.devs[+card.dataset.i];
    if (e.target.dataset.f) d[e.target.dataset.f] = e.target.value.trim();
    if (e.target.dataset.codec) d.codecs = $$('input[data-codec]', card).filter(x => x.checked).map(x => x.dataset.codec);
    Object.keys(vp.server.regs).forEach(u => { if (vp.server.regs[u].dev === d) delete vp.server.regs[u]; });
    delete vp.regState[+card.dataset.i];
    store.set('voip-devs', vp.devs);
    const open = $$('.phone-more', $('#vp-phones')).map(x => x.open);
    renderPhones();
    $$('.phone-more', $('#vp-phones')).forEach((x, k) => { x.open = open[k]; });
    toast('Pengaturan softphone berubah. Tekan Daftar lagi.');
  });
  $('#vp-phones').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = +b.closest('.phone').dataset.i, d = vp.devs[i];
    if (b.dataset.act === 'unreg') {
      delete vp.server.regs[d.user];
      cliAppend(vp.mode === 'pjsip' ? `    -- Removed contact 'sip:${d.user}@${d.ip}:5060' from AOR '${d.user}' due to request\n  == Endpoint ${d.user} is now Unreachable` : `    -- Unregistered SIP '${d.user}'`);
      renderPhones(); return;
    }
    const r = AST.register(vp.server, d);
    vp.regState[i] = r.ok ? null : `${r.code} ${r.text}`;
    logVoip({ jenis: 'daftar', dari: d.user, ok: r.ok, hasil: `${r.code} ${r.text}` });
    playEvents(r, () => { renderPhones(); setResult(r.ok ? 'ok' : 'err', r.ok ? `${esc(d.label)} terdaftar sebagai ${esc(d.user)}` : `Registrasi ${esc(d.label)} gagal: ${r.code} ${esc(r.text)}`); });
    renderPhones();
  });
  // Riwayat singkat untuk halaman Kumpulkan hasil
  function logVoip(x) {
    const log = store.get('voip-log', []);
    log.push(Object.assign({ waktu: new Date().toLocaleString('id-ID'), mode: vp.mode }, x));
    store.set('voip-log', log.slice(-30));
  }
  keypad($('#vp-pad'), k => { const n = $('#vp-num'); n.value += k; });
  $('#vp-pad').insertAdjacentHTML('beforeend', '<button type="button" class="bs" aria-label="Hapus satu digit">⌫</button>');
  $('#vp-pad .bs').addEventListener('click', () => { const n = $('#vp-num'); n.value = n.value.slice(0, -1); });
  function setResult(cls, html) { $('#vp-result').innerHTML = `<div class="check-head ${cls}">${html}</div>`; }
  function setOut(o) {
    $$('#vp-out-tabs button').forEach(b => b.classList.toggle('on', b.dataset.o === o));
    $('#vp-ladder').hidden = o !== 'ladder'; $('#vp-cli').hidden = o !== 'cli';
  }
  segPick($('#vp-out-tabs'), 'o', setOut);
  segPick($('#vp-speed'), 's', () => {});
  // Menampilkan kejadian: baris diagram SIP dan log CLI, satu per satu atau sekaligus.
  function playEvents(r, done) {
    clearTimeout(vp.anim);
    const lad = $('#vp-ladder'), n = r.cols.B ? 3 : 2;
    lad.innerHTML = ladderHead(r.cols);
    const evs = r.events.slice();
    const animate = segVal($('#vp-speed'), 's') === '1' && !reduced;
    const put = ev => {
      if (ev.t === 'cli') cliAppend(ev.text, ev.lvl === 'warning' || ev.lvl === 'error' ? 'bad' : ev.lvl === 'notice' ? 'warn' : '');
      else { lad.insertAdjacentHTML('beforeend', ladderRow(ev, n)); if (animate) lad.lastElementChild.scrollIntoView({ block: 'nearest' }); }
    };
    if (!animate) { evs.forEach(put); if (done) done(); return; }
    let i = 0;
    const step = () => {
      while (i < evs.length && evs[i].t === 'cli') put(evs[i++]);
      if (i < evs.length) put(evs[i++]);
      if (i < evs.length) vp.anim = setTimeout(step, 380); else if (done) done();
    };
    step();
  }
  $('#vp-call').addEventListener('click', () => {
    if (!vp.server) reload(true);
    const d = vp.devs[+$('#vp-from').value || 0];
    const num = $('#vp-num').value.trim();
    const dtmf = $('#vp-dtmf').value;
    cliAppend(`; ${d.label} (${d.user}) memanggil ${num || '(kosong)'}`, 'sys');
    const r = AST.call(vp.server, d, num, { answer: $('#vp-answer').value, dtmf });
    logVoip({ jenis: 'panggil', dari: d.user, ke: num, ok: ['connected', 'voicemail', 'served'].includes(r.status), hasil: `${r.status}${r.code ? ' · ' + r.code + ' ' + r.text : ''}${r.dialstatus ? ' · DIALSTATUS=' + r.dialstatus : ''}` });
    if (matchMedia('(max-width: 1099px)').matches) $('#vp-result').scrollIntoView({ block: 'nearest' });
    setResult('', 'Memproses panggilan…');
    playEvents(r, () => {
      const M = {
        connected: ['ok', `Tersambung dengan ${esc(r.cols.B || '')} · codec ${esc(r.codec)} · DIALSTATUS=${esc(r.dialstatus)}`],
        voicemail: ['ok', `Masuk voicemail ${esc(r.vm && r.vm.box)} · DIALSTATUS=${esc(r.dialstatus || '-')}`],
        served: ['ok', `Dilayani Asterisk (${r.echo ? 'tes gema' : r.conf ? 'konferensi ' + esc(r.conf) : r.played && r.played.length ? 'memutar ' + esc(r.played.join(', ')) : 'diangkat'})`],
        ended: ['warn', `Panggilan berakhir tanpa tersambung: ${r.code} ${esc(r.text)}${r.dialstatus ? ' · DIALSTATUS=' + esc(r.dialstatus) : ''}`],
        fail: ['err', `Gagal: ${r.code} ${esc(r.text)}`],
        notreg: ['warn', `${esc(d.label)} belum terdaftar. Tekan Daftar dulu.`],
        empty: ['warn', 'Isi nomor tujuan.']
      };
      const m = M[r.status] || ['', esc(r.status)];
      const bad = r.events.filter(e => e.t === 'note' && e.cls === 'bad').map(e => e.text);
      setResult(m[0], m[1] + (bad.length && r.status !== 'connected' && r.status !== 'notreg' ? `<span class="small">${esc(bad[bad.length - 1])}</span>` : ''));
      renderPhones();
    });
  });
  $('#vp-cli-form').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#vp-cli-in'), cmd = inp.value;
    inp.value = '';
    if (!cmd.trim()) return;
    cliAppend('CLI> ' + cmd, 'in');
    if (!vp.server) reload(true);
    const out = AST.cli(vp.server, cmd);
    if (out === '__RELOAD__') reload(false);
    else if (out) cliAppend(out);
  });
  $('#vp-cli-clear').addEventListener('click', () => { $('#vp-cli-out').textContent = ''; });
  function setPane(p) {
    $('#voip-grid').dataset.pane = p;
    $$('#voip-mtabs button').forEach(b => b.classList.toggle('on', b.dataset.pane === p));
  }
  segPick($('#voip-mtabs .seg'), 'pane', setPane);
  // Dipanggil tombol "Coba di simulator" (materi) dan "Buka di simulator" (soal perbaikan).
  // files: { mode?, acc?, ext?, vm? }; mode ditebak dari isi bila tidak disebut.
  function openInSim(files) {
    let mode = files.mode;
    if (!mode && files.ext) mode = /PJSIP\//.test(files.ext) ? 'pjsip' : /(^|[^J])SIP\//.test(files.ext) ? 'sip' : vp.mode;
    if (mode && mode !== vp.mode) { curFiles()[vp.file] = ta.value; vp.mode = mode; store.set('voip-mode', mode); vp.server = null; vp.regState = {}; }
    const F = curFiles();
    ['acc', 'ext', 'vm'].forEach(k => { if (files[k] !== undefined) F[k] = files[k]; });
    if (!F.acc.trim()) F.acc = vp.mode === 'sip' ? SIP_BASE : pjAcc();
    if (!F.vm.trim()) F.vm = VM_BASE;
    vp.file = files.ext !== undefined && files.acc === undefined ? 'ext' : 'acc';
    ta.value = F[vp.file];
    reload(true);
    let okn = 0;
    vp.devs.forEach((d, i) => { const r = AST.register(vp.server, d); vp.regState[i] = r.ok ? null : `${r.code} ${r.text}`; if (r.ok) { okn++; cliAppend(vp.mode === "pjsip" ? `  == Endpoint ${d.user} is now Reachable` : `    -- Registered SIP '${d.user}' at ${d.ip}:5060`); } });
    renderPhones();
    go('voip');
    setPane('code');
    toast(okn === vp.devs.length ? 'Konfigurasi dimuat dan softphone didaftarkan. Coba lakukan panggilan.' : `Konfigurasi dimuat; ${okn} dari ${vp.devs.length} softphone berhasil mendaftar. Lihat status di kartu softphone.`);
  }
  onShow.voip = () => { if (!vp.server) { ta.value = curFiles()[vp.file]; reload(true); cliAppend(`${AST.MODES[vp.mode].ver} (simulator) siap. Ketik help untuk daftar perintah.`, 'sys'); } };
  ta.value = curFiles()[vp.file];
  fileTabs();
  gutter();

  /* ============================== Kalkulator ============================== */
  (function subnet() {
    const inp = $('#ip-in');
    const EX = ['172.16.0.126/25', '10.11.0.125/25', '10.10.10.1/27', '192.168.1.1/24', '192.168.1.0/31', '169.254.1.10/16', '203.0.113.5/24'];
    $('#ip-ex').innerHTML = '<span class="small muted">Contoh:</span>' + EX.map(x => `<button type="button" class="btn btn-ghost small mono" data-ip="${x}">${x}</button>`).join('');
    $('#ip-ex').addEventListener('click', e => { const b = e.target.closest('[data-ip]'); if (b) { inp.value = b.dataset.ip; calc(); } });
    function calc() {
      const raw = inp.value.trim();
      const m = raw.match(/^(\S+?)\s*(?:\/\s*(\d{1,2})|\s+(\d+\.\d+\.\d+\.\d+))?$/);
      const out = $('#ip-out');
      if (!m) { out.innerHTML = '<tr><td>Tulis alamat seperti 192.168.1.10/24</td></tr>'; $('#ip-bits').innerHTML = ''; return; }
      const ip = ipInt(m[1]);
      let pre = m[2] !== undefined ? +m[2] : null;
      if (m[3]) { const mk = ipInt(m[3]); if (mk !== null) { const b = mk.toString(2).padStart(32, '0'); if (/^1*0*$/.test(b)) pre = b.indexOf('0') < 0 ? 32 : b.indexOf('0'); } }
      if (ip === null || pre === null || pre > 32) { out.innerHTML = `<tr><td>${ip === null ? 'Alamat IP tidak valid. Setiap angka harus 0–255.' : 'Tambahkan prefix (/24) atau subnet mask yang valid.'}</td></tr>`; $('#ip-bits').innerHTML = ''; return; }
      const mk = maskOf(pre), net = (ip & mk) >>> 0, bc = (net | (~mk >>> 0)) >>> 0;
      const a = ip >>> 24, cls = a < 128 ? 'A' : a < 192 ? 'B' : a < 224 ? 'C' : a < 240 ? 'D' : 'E';
      const kind = ipKind(ip);
      const tag = (c, t) => `<span class="tag ${c}">${t}</span>`;
      let role;
      if (!kind.unicast) role = tag('warn', 'bukan alamat host biasa');
      else if (pre === 32) role = tag('ok', 'satu host (/32)');
      else if (pre === 31) role = tag('ok', 'endpoint point-to-point (RFC 3021)');
      else role = ip === net ? tag('err', 'alamat network, tidak boleh dipakai host') : ip === bc ? tag('err', 'alamat broadcast, tidak boleh dipakai host') : tag('ok', 'alamat host yang valid');
      const rows = [['Alamat IP', `${ipStr(ip)} ${role}`], ['Subnet mask', `${ipStr(mk)} (/${pre})`], ['Wildcard', ipStr(~mk >>> 0)]];
      if (!kind.unicast) rows.push(['Network / host', 'Tidak berlaku: alamat ini bukan untuk satu host, jadi tidak dibagi menjadi network, host, dan broadcast.']);
      else if (pre <= 30) rows.push(['Network', ipStr(net)], ['Broadcast', ipStr(bc)], ['Host pertama', ipStr(net + 1)], ['Host terakhir', ipStr(bc - 1)], ['Jumlah host', `${fmt(Math.pow(2, 32 - pre) - 2)} (2^${32 - pre} − 2)`]);
      else if (pre === 31) rows.push(['Network / broadcast', 'Tidak ada. Pada /31 kedua alamat dipakai sebagai endpoint sambungan point-to-point dan tidak ada directed broadcast (RFC 3021).'], ['Endpoint 1', ipStr(net)], ['Endpoint 2', ipStr(bc)], ['Jumlah alamat terpakai', '2 (2^1, tidak dikurangi 2)']);
      else rows.push(['Cakupan', `Hanya ${ipStr(ip)}. Prefix /32 menunjuk satu host, misalnya untuk rute khusus atau alamat loopback router.`], ['Jumlah host', '1']);
      rows.push(['Jenis alamat', `${tag(kind.cls, kind.label)} ${esc(kind.note)}`], ['Kelas (historis)', `Kelas ${cls}${cls === 'D' ? ' (multicast)' : cls === 'E' ? ' (cadangan)' : ''}. Pembagian kelas sudah diganti CIDR; ditampilkan sebagai pengetahuan dasar.`]);
      out.innerHTML = '<tbody>' + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</tbody>';
      const bits = ip.toString(2).padStart(32, '0');
      $('#ip-bits').innerHTML = '<span class="small muted">Biner (bagian network disorot):</span><div class="mono">' + [0, 1, 2, 3].map(o => [...bits.slice(o * 8, o * 8 + 8)].map((b, i) => `<span class="${o * 8 + i < pre ? 'nb' : 'hb'}">${b}</span>`).join('')).join('.') + '</div>';
    }
    inp.addEventListener('input', calc);
    calc();
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-calc]');
      if (a) { inp.value = a.dataset.calc; calc(); setTimeout(() => showTab($('#k-ip')), 0); }
      const f = e.target.closest('[data-calc-tab]');
      if (f) setTimeout(() => showTab($('#k-' + f.dataset.calcTab)), 0);
    });
  })();

  (function kvoip() {
    codecOpts('#kv-codec');
    function calc() {
      const c = CODEC.find(x => x.id === $('#kv-codec').value), r = voipBw(c, +$('#kv-ptime').value, +$('#kv-l2').value);
      const nc = numField($('#kv-calls'), { min: 1, max: 10000, int: true, minMsg: 'Minimal 1 panggilan.' }), n = nc.v;
      $('#kv-bw').innerHTML = `<div><b>${r.pay} B</b><span>payload tiap ${r.pt} ms</span></div><div><b>${r.pkt} B</b><span>ukuran paket</span></div><div><b>${fmt(r.pps, r.pps % 1 ? 1 : 0)}/s</b><span>paket per detik</span></div><div><b>${fmt(r.kbps, 1)} kbps</b><span>per panggilan per arah</span></div>${nc.ok ? `<div><b>${r.kbps * n >= 1000 ? fmt(r.kbps * n / 1000, 2) + ' Mbps' : fmt(r.kbps * n, 1) + ' kbps'}</b><span>${n} panggilan (unggah = unduh)</span></div>` : '<div><b class="tag err">–</b><span>isi jumlah panggilan (bilangan bulat ≥ 1)</span></div>'}`;
      const d = +$('#kv-d').value, j = +$('#kv-j').value, l = +$('#kv-l').value;
      $('#kv-d-o').textContent = d + ' ms'; $('#kv-j-o').textContent = j + ' ms'; $('#kv-l-o').textContent = String(l).replace('.', ',') + '%';
      const q = emodel(c, d, j, l);
      $('#kv-mos').innerHTML = `<div class="mos-big"><b class="tnum">${q.mos.toFixed(2).replace('.', ',')}</b><span>MOS</span></div><div class="stack"><span class="tag ${q.lab[0]}">${q.lab[1]}</span><span class="small muted">R-factor ${q.R.toFixed(0)} · codec ${c.name}. ${d > 150 ? 'Delay melewati 150 ms. ' : ''}${j > 30 ? 'Jitter di atas 30 ms. ' : ''}${l > 1 ? 'Packet loss di atas 1%. ' : ''}</span><div class="meter"><i style="width:${(q.mos - 1) / 3.5 * 100}%;background:var(--${q.lab[0] === 'ok' ? 'ok' : q.lab[0] === 'warn' ? 'warn' : 'err'})"></i></div></div>`;
    }
    ['kv-codec', 'kv-ptime', 'kv-l2', 'kv-calls', 'kv-d', 'kv-j', 'kv-l'].forEach(id => $('#' + id).addEventListener('input', calc));
    calc();
  })();

  (function kfo() {
    const SPL = [['0', 'Tidak ada', 0], ['2', '1:2 (3,5 dB)', 3.5], ['4', '1:4 (7,2 dB)', 7.2], ['8', '1:8 (10,5 dB)', 10.5], ['16', '1:16 (13,8 dB)', 13.8], ['32', '1:32 (17,1 dB)', 17.1], ['64', '1:64 (20,5 dB)', 20.5]];
    ['#fo-s1', '#fo-s2'].forEach((s, k) => { $(s).innerHTML = SPL.map(([v, t]) => `<option value="${v}"${(k === 0 && v === '4') || (k === 1 && v === '8') ? ' selected' : ''}>${t}</option>`).join(''); });
    // Aturan per besaran: daya (dBm) boleh negatif; panjang, redaman, rugi, dan margin tidak boleh negatif;
    // jumlah konektor dan sambungan harus bilangan bulat ≥ 0.
    const RULES = {
      'fo-tx': { min: -20, max: 20, minMsg: 'Daya kirim OLT di luar kisaran wajar (−20 sampai +20 dBm).', maxMsg: 'Daya kirim OLT di luar kisaran wajar (−20 sampai +20 dBm).' },
      'fo-rx': { min: -50, max: 10, minMsg: 'Sensitivitas di luar kisaran wajar (−50 sampai +10 dBm).', maxMsg: 'Sensitivitas di luar kisaran wajar (−50 sampai +10 dBm).' },
      'fo-len': { min: 0, minMsg: 'Panjang kabel tidak boleh negatif.' },
      'fo-att': { min: 0, minMsg: 'Redaman kabel tidak boleh negatif.' },
      'fo-con': { min: 0, int: true, minMsg: 'Jumlah konektor tidak boleh negatif.' },
      'fo-conl': { min: 0, minMsg: 'Rugi konektor tidak boleh negatif.' },
      'fo-spl': { min: 0, int: true, minMsg: 'Jumlah sambungan tidak boleh negatif.' },
      'fo-spll': { min: 0, minMsg: 'Rugi sambungan tidak boleh negatif.' },
      'fo-mar': { min: 0, minMsg: 'Margin tidak boleh negatif.' }
    };
    function budget() {
      const V = {};
      let bad = 0;
      Object.entries(RULES).forEach(([id, r]) => { const x = numField($('#' + id), r); V[id] = x.v; if (!x.ok) bad++; });
      if (V['fo-tx'] !== null && V['fo-rx'] !== null && V['fo-rx'] >= V['fo-tx']) { fieldMsg($('#fo-rx'), 'Sensitivitas ONT harus lebih rendah (lebih negatif) daripada daya kirim OLT.'); bad++; }
      if (bad) {
        $('#fo-bar').innerHTML = ''; $('#fo-leg').innerHTML = '';
        $('#fo-out').innerHTML = `<div class="wide"><b class="tag err">Belum bisa dihitung</b><span>Perbaiki ${bad} isian yang ditandai merah. Kesimpulan layak/tidak layak ditahan sampai semua isian valid.</span></div>`;
        return;
      }
      const tx = V['fo-tx'], sens = V['fo-rx'], mar = V['fo-mar'];
      const cab = V['fo-len'] * V['fo-att'], con = V['fo-con'] * V['fo-conl'], spl = V['fo-spl'] * V['fo-spll'];
      const s1 = SPL.find(x => x[0] === $('#fo-s1').value), s2 = SPL.find(x => x[0] === $('#fo-s2').value);
      const sp = s1[2] + s2[2], total = cab + con + spl + sp, rx = tx - total, need = sens + mar, ok = rx >= need;
      const users = (+s1[0] || 1) * (+s2[0] || 1);
      const parts = [['cab', 'Kabel', cab], ['con', 'Konektor', con], ['spl', 'Splice', spl], ['sp', 'Splitter', sp], ['mar', 'Margin', mar]];
      // Label di dalam batang disembunyikan CSS bila segmennya terlalu sempit; legenda di bawahnya selalu memuat semua nilai.
      const shown = parts.filter(p => p[2] > 0);
      $('#fo-bar').innerHTML = shown.map(([k, t, v]) => `<span class="ls ${k}" style="flex:${v}" title="${t}: ${fmt(v, 2)} dB"><b>${t}</b><span>${fmt(v, 2)} dB</span></span>`).join('');
      $('#fo-leg').innerHTML = shown.map(([k, t, v]) => `<span><i class="sw ${k}"></i>${t} ${fmt(v, 2)} dB</span>`).join('');
      $('#fo-out').innerHTML = `<div><b>${fmt(total, 2)} dB</b><span>total redaman</span></div><div><b>${fmt(rx, 2)} dBm</b><span>daya diterima ONT</span></div><div><b>${fmt(need, 1)} dBm</b><span>batas (sensitivitas + margin)</span></div><div><b class="tag ${ok ? 'ok' : 'err'}">${ok ? 'Layak' : 'Tidak layak'}</b><span>${ok ? `sisa ${fmt(rx - need, 2)} dB` : `kurang ${fmt(need - rx, 2)} dB: kurangi splitter/jarak atau sambungan`}</span></div><div><b>${users}</b><span>rumah per port OLT</span></div>` +
        (V['fo-len'] > 20 ? '<div class="wide"><b class="tag warn">Catatan</b><span>Panjang di atas 20 km melebihi jangkauan umum GPON kelas B+, walaupun redamannya masih cukup.</span></div>' : '');
    }
    function critical() {
      const a = numField($('#fo-n1'), { min: 1, max: 3, minMsg: 'Indeks bias selalu ≥ 1.', maxMsg: 'Indeks bias kaca serat optik sekitar 1,4–1,5.' });
      const b = numField($('#fo-n2'), { min: 1, max: 3, minMsg: 'Indeks bias selalu ≥ 1.', maxMsg: 'Indeks bias kaca serat optik sekitar 1,4–1,5.' });
      if (a.ok && b.ok && !(a.v > b.v)) fieldMsg($('#fo-n2'), 'n₂ (cladding) harus lebih kecil daripada n₁ (inti).');
      if (!a.ok || !b.ok || !(a.v > b.v)) { $('#fo-crit').innerHTML = '<div class="wide"><b class="tag err">Belum bisa dihitung</b><span>Perbaiki isian yang ditandai merah.</span></div>'; return; }
      const n1 = a.v, n2 = b.v;
      const tc = Math.asin(n2 / n1) * 180 / Math.PI, na = Math.sqrt(n1 * n1 - n2 * n2), acc = Math.asin(Math.min(1, na)) * 180 / Math.PI;
      $('#fo-crit').innerHTML = `<div><b>${fmt(tc, 2)}°</b><span>sudut kritis θc = arcsin(n₂/n₁)</span></div><div><b>${fmt(na, 3)}</b><span>NA = √(n₁² − n₂²)</span></div><div><b>${fmt(acc, 1)}°</b><span>sudut penerimaan di udara</span></div><div><b>${fmt(3 / n1, 3)} × 10⁸ m/s</b><span>kecepatan cahaya di inti (c/n₁)</span></div>`;
    }
    $$('#k-fo input, #k-fo select').forEach(el => el.addEventListener('input', () => { if (/^fo-n[12]$/.test(el.id)) critical(); else budget(); }));
    budget(); critical();
  })();

  /* ============================== Asesmen: kuis ============================== */
  const QUIZ = [
    { b: 1, s: 1, q: 'Reno ingin memasang jaringan di area dengan risiko tinggi terhadap interferensi. Jenis kabel yang tepat adalah…', o: ['Koaksial RG-59', 'UTP Cat 6A', 'UTP Cat 5', 'STP Cat 6', 'UTP Cat 3'], a: 3, e: 'STP punya pelindung foil/anyaman yang meredam gangguan elektromagnetik. UTP, walaupun kategori tinggi, tidak punya pelindung.' },
    { b: 1, s: 1, q: 'Elemen komunikasi yang berperan menyatukan persepsi dan aturan yang dijalankan para pengguna komunikasi agar dapat saling terhubung adalah…', o: ['Protokol', 'Receiver', 'Sender', 'Media', 'Data'], a: 0, e: 'Protokol adalah aturan bersama tentang format, urutan, dan kecepatan data.' },
    { b: 1, s: 1, q: 'Layanan xDSL bisa memberi internet cepat walaupun memakai kabel tembaga telepon. Alasannya adalah…', o: ['Memakai perangkat tambahan (modem DSL dan DSLAM) yang mengirim data pada frekuensi di atas pita suara', 'Media transmisinya diganti serat optik', 'Tidak dipakai bersamaan dengan layanan telepon', 'Kecepatan transmisi datanya rendah', 'Memakai media nirkabel'], a: 0, e: 'Modem DSL dan DSLAM memanfaatkan frekuensi tinggi pada kabel yang sama dengan suara. (Soal di slide menyebut "JARLOKAF tidak murni"; di sini dirapikan karena DSL berjalan di kabel tembaga.)' },
    { b: 1, q: 'Sinyal berupa pulsa diskrit dengan dua kondisi logika, 0 dan 1, disebut…', o: ['Sinyal analog', 'Sinyal digital', 'Sinyal sinus', 'Sinyal broadband'], a: 1, e: 'Sinyal digital hanya punya dua kondisi: tegangan rendah (0) dan tinggi (1).' },
    { b: 1, q: 'Urutan perangkat jaringan akses tembaga dari sentral sampai rumah pelanggan yang benar adalah…', o: ['MDF → RK → DP → KTB → roset', 'RK → MDF → KTB → DP → roset', 'MDF → DP → RK → roset → KTB', 'DP → RK → MDF → KTB → roset'], a: 0, e: 'MDF di STO, rumah kabel di pinggir jalan, DP di tiang, KTB di dinding rumah, lalu roset di dalam rumah.' },
    { b: 1, q: 'Urutan warna T568B untuk pin 1 sampai 3 adalah…', o: ['Putih-hijau, hijau, putih-oranye', 'Putih-oranye, oranye, putih-hijau', 'Oranye, putih-oranye, hijau', 'Putih-biru, biru, putih-oranye'], a: 1, e: 'T568B: putih-oranye, oranye, putih-hijau, biru, putih-biru, hijau, putih-coklat, coklat.' },
    { b: 2, s: 1, q: 'Sebuah universitas ingin menghubungkan antargedung dengan kecepatan tinggi. Jaringan nirkabel yang tepat adalah…', o: ['Internet', 'WMAN', 'WWAN', 'WPAN', 'WLAN'], a: 1, e: 'WMAN dirancang untuk koneksi antarbangunan atau gedung dalam satu kota.' },
    { b: 2, s: 1, q: 'Alasan NFC dianggap lebih aman untuk transaksi digital dibandingkan Bluetooth adalah…', o: ['Hanya bekerja dalam jarak sangat dekat (beberapa sentimeter)', 'Dilengkapi chip pengaman', 'Menggunakan topologi mesh', 'Kecepatannya lebih tinggi', 'Mendukung MU-MIMO'], a: 0, e: 'Jarak kerja yang sangat pendek membuat penyadapan dari jauh sulit dan transaksi butuh kesengajaan.' },
    { b: 2, s: 1, q: 'Jika di suatu area terjadi interferensi frekuensi antarpengguna, teknik multiple access yang paling efektif adalah…', o: ['FDMA', 'TDMA', 'CDMA', 'AMPS', 'GPRS'], a: 2, e: 'CDMA memberi setiap pengguna kode unik, sehingga sinyal yang bercampur tetap bisa dipisahkan.' },
    { b: 2, q: 'Pada model TCP/IP (DARPA), protokol TCP dan UDP berada di lapisan…', o: ['Application', 'Host-to-host', 'Internetwork', 'Network interface'], a: 1, e: 'Host-to-host setara lapisan transport (4) pada OSI.' },
    { b: 2, q: 'Mode koneksi nirkabel tanpa access point, perangkat langsung terhubung satu sama lain, disebut…', o: ['Infrastructure', 'Ad hoc', 'Hybrid', 'Station'], a: 1, e: 'Ad hoc atau peer to peer: perangkat terhubung langsung.' },
    { b: 2, q: 'Standar IEEE 802.11ax dikenal dengan nama…', o: ['Wi-Fi 4', 'Wi-Fi 5', 'Wi-Fi 6', 'Wi-Fi 7'], a: 2, e: '802.11n = Wi-Fi 4, 802.11ac = Wi-Fi 5, 802.11ax = Wi-Fi 6/6E, 802.11be = Wi-Fi 7.' },
    { b: 3, s: 1, q: 'Pada keamanan wireless disarankan memakai WPA2-PSK dibandingkan WEP. Alasan yang tepat adalah…', o: ['Algoritma enkripsi yang digunakan', 'Jumlah user yang didukung', 'Fungsi utama access control', 'Panjang password minimal', 'Frekuensi yang digunakan'], a: 0, e: 'WPA2 memakai AES-CCMP, sedangkan WEP memakai RC4 dengan kunci statis yang mudah dibobol.' },
    { b: 3, s: 1, q: 'Fungsi utama bridge pada jaringan adalah…', o: ['Menyediakan IP address bagi pengguna', 'Mengubah sinyal analog menjadi digital', 'Menghubungkan segmen antarjaringan LAN', 'Menghubungkan jaringan kabel dan nirkabel', 'Mengirimkan paket melalui jalur tercepat'], a: 2, e: 'Bridge menyatukan dua segmen LAN menjadi satu jaringan. Wireless bridge melakukannya lewat radio.' },
    { b: 3, s: 1, q: 'Sebagai administrator, jika menemukan konflik IP address pada jaringan Wi-Fi, hal pertama yang harus diidentifikasi adalah…', o: ['Password jaringan terlalu panjang', 'Perangkat tidak mendukung 802.11ac', 'Frekuensi sinyal terlalu tinggi', 'Perangkat mana saja yang memakai alamat IP yang sama, termasuk IP statis yang berada di dalam rentang pool DHCP', 'SSID tidak di-broadcast'], a: 3, e: 'Konflik IP berarti dua perangkat memakai alamat yang sama. Cari perangkat yang bentrok (daftar klien DHCP, tabel ARP, atau ping alamat itu), lalu periksa apakah ada IP statis di dalam pool DHCP, seperti kasus printer di Studi kasus no. 4. (Soal di slide memakai jawaban "DHCP server tidak aktif"; dirapikan karena DHCP yang mati bukan satu-satunya dan bukan penyebab langsung konflik.)' },
    { b: 3, q: 'Antena yang paling tepat untuk menghubungkan dua gedung berjarak 1 km secara point-to-point adalah…', o: ['Omni-directional', 'Sektoral', 'Grid/parabola (directional)', 'Antena bawaan router'], a: 2, e: 'Antena directional memfokuskan pancaran ke satu arah sehingga jangkauannya paling jauh.' },
    { b: 3, q: 'Kanal Wi-Fi 2,4 GHz yang tidak saling tumpang tindih adalah…', o: ['1, 2, 3', '1, 6, 11', '2, 7, 12', '5, 10, 13'], a: 1, e: 'Lebar kanal 20 MHz dengan jarak antarkanal 5 MHz membuat 1, 6, dan 11 tidak saling tumpang tindih.' },
    { b: 3, q: 'Pada mode wireless station, perangkat…', o: ['Memancarkan SSID agar klien bisa terhubung', 'Hanya menerima sinyal dari AP lain dan tidak memancarkan SSID', 'Membagikan IP lewat DHCP ke klien nirkabel', 'Mengubah sinyal analog menjadi digital'], a: 1, e: 'Station bertindak sebagai klien, biasanya untuk link point-to-point jarak jauh.' },
    { b: 4, s: 1, q: 'Pada implementasi VoIP di daerah terpencil, faktor utama penyebab degradasi layanan selain bandwidth kecil adalah…', o: ['Jitter tinggi dan packet loss karena jaringan tidak stabil', 'Tidak adanya sistem routing', 'Ketiadaan perangkat lunak', 'Kurangnya tenaga TI lokal', 'Harga perangkat keras'], a: 0, e: 'Kualitas suara VoIP paling dipengaruhi delay, jitter, dan packet loss.' },
    { b: 4, s: 1, q: 'Pada sistem SIP, fungsi utama proxy server adalah…', o: ['Menerima, mengelola, dan meneruskan permintaan', 'Menyimpan pesan yang dikirim pelanggan', 'Memulai panggilan ke server lain', 'Menjaga kualitas transmisi data', 'Sebagai sumber daya'], a: 0, e: 'Proxy server meneruskan permintaan SIP (misalnya INVITE) menuju tujuan yang benar.' },
    { b: 4, s: 1, q: 'Alasan RTP tetap digunakan dalam pengiriman media VoIP, meskipun UDP sudah cukup cepat, adalah…', o: ['RTP menggantikan fungsi TCP', 'RTP mendukung enkripsi bawaan', 'RTP bisa digunakan tanpa header', 'RTP memiliki echo cancellation bawaan', 'RTP menambahkan timestamp dan sequence number untuk sinkronisasi dan pengurutan data audio'], a: 4, e: 'UDP tidak membawa nomor urut maupun waktu. RTP menambahkannya agar penerima bisa menyusun dan memutar suara dengan tepat.' },
    { b: 4, q: 'Bitrate codec G.711 adalah…', o: ['8 kbps', '16 kbps', '32 kbps', '64 kbps'], a: 3, e: 'G.711 tidak memampatkan: 8.000 sampel × 8 bit = 64 kbps.' },
    { b: 4, q: 'Batas delay satu arah yang disarankan ITU-T G.114 agar percakapan terasa nyaman adalah…', o: ['15 ms', '150 ms', '400 ms', '1.500 ms'], a: 1, e: 'Sampai 150 ms terasa alami; 150–400 ms masih bisa diterima; di atas 400 ms percakapan terganggu.' },
    { b: 4, q: 'Komponen softswitch yang mengubah suara dari jaringan PSTN menjadi paket RTP adalah…', o: ['Application server', 'Media gateway', 'Signaling gateway', 'Media server'], a: 1, e: 'Media gateway melakukan packetizing dan depacketizing antara jaringan sirkuit dan jaringan IP.' },
    { b: 5, s: 1, q: 'Seorang teknisi ingin memastikan server Asterisk 21 hanya menerima koneksi SIP dari IP tertentu. File konfigurasi yang relevan untuk dimodifikasi adalah…', o: ['extensions.conf', 'features.conf', 'pjsip.conf', 'rtp.conf', 'iax.conf'], a: 2, e: 'Opsi permit= dan deny= pada section type=endpoint (atau section type=acl) di pjsip.conf. Soal di slide menjawab sip.conf; itu benar untuk server lama chan_sip, tetapi file tersebut tidak dipakai lagi di Asterisk 21.' },
    { b: 5, s: 1, q: 'Fungsi protokol RTCP untuk memastikan komunikasi real-time adalah…', o: ['Mengatur keamanan jaringan', 'Mengatur proses autentikasi data', 'Memberikan IP address kepada pengguna', 'Mengirim data video dan audio', 'Memantau RTP serta menjaga kualitas dan sinkronisasi'], a: 4, e: 'RTCP melaporkan statistik (jitter, paket hilang) dan membantu sinkronisasi; yang membawa suara adalah RTP.' },
    { b: 5, s: 1, q: 'Softphone berhasil register ke Asterisk, tetapi gagal melakukan panggilan keluar. Kemungkinan besar masalahnya adalah…', o: ['Konfigurasi trunk outbound', 'Codec inbound tidak cocok', 'Password extension salah', 'rtp.conf kosong', 'Port SIP tertutup'], a: 0, e: 'Register berhasil berarti password dan port benar. Panggilan keluar butuh trunk dan aturan dialplan menuju trunk.' },
    { b: 5, q: 'Di pjsip.conf, softphone 102 selalu ditolak saat REGISTER walaupun password benar. Log: "AOR has been configured to not allow registrations". Yang perlu ditambahkan adalah…', o: ['max_contacts=1 pada section type=aor', 'context=internal pada section type=auth', 'host=dynamic pada section type=endpoint', 'allow=ulaw pada section type=transport'], a: 0, e: 'Nilai bawaan max_contacts adalah 0, artinya AOR menolak semua registrasi. host=dynamic adalah opsi chan_sip dan tidak dikenal di PJSIP.' },
    { b: 5, q: 'Pattern _1XX cocok dengan nomor…', o: ['1', '100', '1000', '210'], a: 1, e: '_1XX berarti tiga digit: angka 1 diikuti dua digit 0–9, yaitu 100 sampai 199.' },
    { b: 5, q: 'Respons SIP yang dikirim saat penerima sedang sibuk adalah…', o: ['180 Ringing', '200 OK', '404 Not Found', '486 Busy Here'], a: 3, e: '486 Busy Here. Di Asterisk, DIALSTATUS menjadi BUSY.' },
    { b: 6, s: 1, q: 'Lapisan kabel serat optik yang lentur, berbahan plastik, dan melindungi cladding dari kelembapan adalah…', o: ['Strength member', 'Outer jacket', 'Cladding', 'Coating', 'Core'], a: 3, e: 'Coating langsung membungkus cladding. Outer jacket melindungi seluruh kabel dari luar.' },
    { b: 6, s: 1, q: 'Pada kabel serat optik tipe plastic-clad silica (PCS), material yang digunakan untuk inti adalah…', o: ['Plastik silikon elastomer', 'Vitreous silica (kaca silika)', 'Serat karbon', 'Logam', 'Karet'], a: 1, e: 'PCS: inti kaca silika, cladding plastik/silikon.' },
    { b: 6, s: 1, q: 'Panjang gelombang first window yang umum digunakan untuk komunikasi data adalah…', o: ['850 nm', '780 nm', '1310 nm', '1550 nm', '1625 nm'], a: 0, e: 'First window 850 nm, second 1.310 nm, third 1.550 nm.' },
    { b: 6, q: 'Indeks bias inti 1,48 dan cladding 1,46. Sudut kritisnya mendekati…', o: ['45°', '60°', '80,6°', '89,9°'], a: 2, e: 'sin θc = 1,46 / 1,48 = 0,9865, sehingga θc ≈ 80,6°.' },
    { b: 6, q: 'Jenis serat yang paling cocok untuk jaringan FTTH sepanjang 10 km adalah…', o: ['Multimode 62,5 µm', 'Singlemode', 'Serat plastik (POF)', 'Kabel koaksial'], a: 1, e: 'Singlemode punya redaman dan dispersi sangat rendah untuk jarak jauh.' },
    { b: 6, q: 'Perangkat pasif di tiang yang membagi kabel drop ke rumah-rumah pelanggan FTTH adalah…', o: ['OLT', 'ONT', 'ODP', 'Router'], a: 2, e: 'ODP berisi splitter tahap kedua. OLT dan ONT adalah perangkat aktif.' }
  ];
  (function quiz() {
    const box = $('#quiz');
    let ans = store.get('quiz', {}), filter = 'all';
    $('#quiz-filter').innerHTML = '<button type="button" class="on" data-f="all">Semua</button>' + [1, 2, 3, 4, 5, 6].map(b => `<button type="button" data-f="${b}">Bab ${b}</button>`).join('');
    const draw = () => {
      box.innerHTML = QUIZ.map((q, i) => {
        if (filter !== 'all' && q.b !== +filter) return '';
        const chosen = ans[i], done = chosen !== undefined;
        return `<div class="q${done ? ' done' : ''}" data-q="${i}"><div class="q-head"><span class="n">${q.b}.${QUIZ.filter((x, k) => x.b === q.b && k <= i).length}</span><b>${esc(q.q)}</b>${q.s ? '<span class="tag">slide</span>' : ''}</div>
          <div class="q-opts" role="radiogroup">${q.o.map((o, k) => `<label class="${done && k === q.a ? 'right' : done && k === chosen ? 'wrong' : ''}"><input type="radio" name="q${i}" value="${k}"${chosen === k ? ' checked' : ''}${done ? ' disabled' : ''}><span>${String.fromCharCode(65 + k)}. ${esc(o)}</span></label>`).join('')}</div>
          ${done ? `<p class="q-expl">${chosen === q.a ? '<b>Benar.</b> ' : '<b>Kurang tepat.</b> '}${esc(q.e)}</p>` : ''}</div>`;
      }).join('');
      const n = Object.keys(ans).length, right = Object.entries(ans).filter(([i, k]) => QUIZ[i].a === k).length;
      $('#quiz-num').textContent = `${right}/${QUIZ.length}`;
      $('#quiz-msg').textContent = n === 0 ? 'Belum ada jawaban.' : n < QUIZ.length ? `${n} dari ${QUIZ.length} soal dijawab.` : right >= 30 ? 'Selesai. Hebat!' : right >= 22 ? 'Selesai. Ulangi bab yang masih salah.' : 'Selesai. Baca lagi materinya lalu ulangi kuis.';
    };
    segPick($('#quiz-filter'), 'f', v => { filter = v; draw(); });
    box.addEventListener('change', e => {
      const inp = e.target.closest('input[type=radio]'); if (!inp) return;
      ans[+inp.closest('.q').dataset.q] = +inp.value;
      store.set('quiz', ans);
      const y = window.scrollY; draw(); window.scrollTo(0, y);
    });
    $('#quiz-reset').addEventListener('click', () => { ans = {}; store.set('quiz', ans); draw(); });
    draw();
  })();

  /* ============================== Asesmen: studi kasus ============================== */
  const CASES = [
    { t: 'Kabel LAN baru tidak bisa dipakai', d: 'Rudi membuat kabel straight. Di LAN tester, lampu master 1–8 menyala bergantian, tetapi lampu remote 1 dan 2 tidak pernah menyala.', o: [
      ['Periksa ujung kabel pada pin 1 dan 2: kemungkinan kabel tidak masuk sampai ujung konektor atau pin tidak tertekan saat crimping.', 1, 'Tepat. Lampu yang tidak menyala berarti tidak ada sambungan (open) pada pin itu. Potong dan crimp ulang ujung yang bermasalah.'],
      ['Ganti switch karena port-nya rusak.', 0, 'Tester belum melibatkan switch. Masalahnya ada di kabel.'],
      ['Ubah alamat IP komputer.', 0, 'Alamat IP tidak berpengaruh pada uji kontinuitas kabel.'],
      ['Pakai kabel crossover.', 0, 'Pada crossover pun pin 1 dan 2 harus tersambung (ke 3 dan 6). Masalahnya sambungan putus.']] },
    { t: 'Lolos tester tetapi sering putus', d: 'Kabel 40 m lolos uji (1-1 sampai 8-8), tetapi kecepatannya hanya 10 Mbps dan sering putus. Urutan warna di kedua ujung: PO, O, PH, H, PB, B, PC, C.', o: [
      ['Susun ulang sesuai T568B. Pin 3 dan 6 harus satu pasang pilinan; urutan sekarang membuat split pair.', 1, 'Tepat. Urutan "berpasangan berurutan" lolos tester karena kedua ujung sama, tetapi pasangan kirim/terima (3-6) terpecah sehingga crosstalk tinggi.'],
      ['Kabel terlalu panjang, maksimal 30 m.', 0, 'Batas UTP Ethernet adalah 100 m, jadi 40 m masih aman.'],
      ['Ganti konektor RJ45 dengan RJ11.', 0, 'RJ11 adalah konektor telepon 4/6 pin, bukan untuk Ethernet.'],
      ['Matikan Auto MDI-X di switch.', 0, 'Auto MDI-X tidak berhubungan dengan split pair.']] },
    { t: 'Wi-Fi kelas lambat saat ramai', d: 'Sinyal Wi-Fi penuh di HP, tetapi lambat saat jam istirahat. Wi-Fi analyzer menunjukkan 9 jaringan lain di kanal 6, sama dengan AP sekolah (2,4 GHz).', o: [
      ['Pindahkan AP ke kanal yang lebih sepi (1 atau 11) atau aktifkan 5 GHz.', 1, 'Tepat. Sinyal kuat tetapi lambat biasanya karena kanal padat. Kanal sepi atau pita 5 GHz mengurangi interferensi.'],
      ['Ganti nama SSID.', 0, 'Nama SSID tidak memengaruhi interferensi.'],
      ['Ganti keamanan ke WEP agar lebih ringan.', 0, 'WEP tidak aman dan tidak menyelesaikan kepadatan kanal.'],
      ['Naikkan daya pancar ke maksimum.', 0, 'Sinyal sudah penuh. Daya lebih besar justru menambah interferensi ke jaringan lain.']] },
    { t: 'Pesan konflik IP di beberapa laptop', d: 'Beberapa laptop menampilkan "IP address conflict". Router memakai pool DHCP 192.168.1.2–192.168.1.254, sedangkan printer diberi IP statis 192.168.1.50.', o: [
      ['Keluarkan IP statis printer dari pool DHCP (misalnya pool mulai .100), atau buat reservasi DHCP untuk printer.', 1, 'Tepat. DHCP bisa membagikan .50 ke laptop karena masih di dalam pool, sehingga bentrok dengan printer.'],
      ['Ganti password Wi-Fi.', 0, 'Password tidak berhubungan dengan pembagian alamat IP.'],
      ['Matikan DHCP server.', 0, 'Tanpa DHCP, semua klien harus diisi manual dan konflik justru makin mungkin.'],
      ['Pindah ke kanal 11.', 0, 'Kanal radio tidak memengaruhi alamat IP.']] },
    { t: 'Softphone gagal register', d: 'Server Asterisk 21. Zoiper terus menampilkan "401 Unauthorized". Log: Request \'REGISTER\' from \'"102" <sip:102@192.168.1.5>\' failed for \'192.168.1.12:5060\' (callid: …) - Failed to authenticate.', o: [
      ['Samakan password di softphone dengan password= pada section type=auth milik 102 di pjsip.conf (periksa juga username=).', 1, 'Tepat. Endpoint 102 ditemukan, tetapi username atau password tidak cocok dengan section auth-nya (huruf besar/kecil dibedakan). Di server lama chan_sip, pesannya "Wrong password" dan yang dicocokkan adalah secret= di sip.conf.'],
      ['Ganti codec softphone.', 0, 'Codec baru dicek saat panggilan, bukan saat registrasi.'],
      ['Tambahkan extension 102 di extensions.conf.', 0, 'Registrasi diatur pjsip.conf. Dialplan baru dipakai saat menelepon.'],
      ['Ganti alamat server di softphone.', 0, 'Server sudah menjawab (ada log), jadi alamatnya benar.']] },
    { t: 'Panggilan ditolak 404', d: 'Dari 101 memanggil 102 dan mendapat "404 Not Found". Log: Call from \'101\' (UDP:192.168.1.11:5060) to extension \'102\' rejected because extension not found in context \'intenal\'.', o: [
      ['Perbaiki context=intenal menjadi context=internal pada section type=endpoint milik 101 di pjsip.conf.', 1, 'Tepat. Asterisk mencari 102 di context milik akun pemanggil. Salah ketik nama context membuat semua nomor tidak ditemukan.'],
      ['Daftarkan ulang softphone 102.', 0, 'Pesan 404 muncul sebelum Asterisk mencoba menghubungi 102.'],
      ['Ganti codec menjadi ulaw.', 0, 'Masalah codec memberi 488, bukan 404.'],
      ['Restart server Asterisk.', 0, 'Restart tidak memperbaiki salah ketik di konfigurasi.']] },
    { t: 'Konfigurasi lama dipindah ke server baru', d: 'Sekolah memindahkan sip.conf lama ke server Asterisk 21. Semua softphone tidak bisa mendaftar, dan module show like chan_sip menampilkan "0 modules loaded".', o: [
      ['Tulis ulang akun di pjsip.conf (endpoint, auth, aor) dan ubah dialplan dari SIP/101 menjadi PJSIP/101.', 1, 'Tepat. Asterisk 21 tidak punya chan_sip, jadi sip.conf tidak dibaca sama sekali. Gunakan tabel padanan di Glosarium & cheat sheet.'],
      ['Restart server sampai chan_sip muncul.', 0, 'Modul chan_sip sudah dihapus dari Asterisk 21, jadi tidak akan muncul walaupun di-restart.'],
      ['Ganti port SIP ke 5061.', 0, 'Port bukan masalahnya; tidak ada modul yang membaca sip.conf.'],
      ['Ganti semua password softphone.', 0, 'Password tidak berpengaruh bila akunnya sendiri tidak terbaca.']] }
  ];
  (function cases() {
    const box = $('#case-list');
    const ans = store.get('cases', {});
    const draw = () => {
      box.innerHTML = CASES.map((c, i) => {
        const pick = ans[i];
        return `<div class="q${pick !== undefined ? ' done' : ''}" data-c="${i}"><div class="q-head"><span class="n">${i + 1}</span><b>${esc(c.t)}</b></div><p class="small">${esc(c.d)}</p>
          <div class="q-opts">${c.o.map(([t, ok], k) => `<label class="${pick !== undefined && ok ? 'right' : pick === k && !ok ? 'wrong' : ''}"><input type="radio" name="c${i}" value="${k}"${pick === k ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</div>
          ${pick !== undefined ? `<p class="q-expl">${esc(c.o[pick][2])}</p>` : ''}</div>`;
      }).join('');
    };
    box.addEventListener('change', e => {
      const inp = e.target.closest('input'); if (!inp) return;
      ans[+inp.closest('.q').dataset.c] = +inp.value;
      store.set('cases', ans);
      const y = window.scrollY; draw(); window.scrollTo(0, y);
    });
    draw();
  })();

  /* ============================== Asesmen: perbaiki konfigurasi ============================== */
  // Soal memakai jalur utama Asterisk 21 (PJSIP).
  const EXT_DASAR = EXAMPLES[0].ext;
  const PJ_OK = pjAcc();
  const DEBUG = [
    { t: 'Salah ketik di dialplan', d: 'Panggilan 101 ke 102 langsung terputus, dan panggilan ke 103 tidak pernah berdering. Ada 2 kesalahan di extensions.conf.',
      files: { mode: 'pjsip', acc: PJ_OK, vm: VM_BASE, ext: EXT_HEAD + `
[internal]
exten => 101,1,Dial(PJSIP/101,20)
 same => n,Hangup()

exten => 102,1,Dail(PJSIP/102,20)
 same => n,Hangup()

exten => 103,1,Dial(PJSIP/130,20)
 same => n,Hangup()
` }, edit: ['ext'], tests: [{ from: 0, num: '102', answer: 'answer', want: 'connected', label: '101 memanggil 102 dan diangkat' }, { from: 0, num: '103', answer: 'answer', want: 'connected', label: '101 memanggil 103 dan diangkat' }] },
    { t: 'Context dan AOR', d: 'Softphone 102 ditolak saat mendaftar (403 Forbidden), dan semua panggilan dari 101 ditolak 404. Ada 2 kesalahan di pjsip.conf.',
      files: { mode: 'pjsip', acc: pjAcc({ 101: { context: 'intenal' }, 102: { noMax: true } }), vm: VM_BASE, ext: EXT_DASAR },
      edit: ['acc'], tests: [{ from: 0, num: '102', answer: 'answer', want: 'connected', label: '101 memanggil 102 dan diangkat' }, { from: 1, num: '101', answer: 'answer', want: 'connected', label: '102 memanggil 101 dan diangkat' }] },
    { t: 'Password dan codec', d: 'Softphone 102 ditolak saat mendaftar (401 Unauthorized), dan panggilan dari 101 ditolak 488 Not Acceptable Here. Softphone 101 memakai codec ulaw/alaw, 102 memakai ulaw/gsm, password di softphone 102 adalah rahasia102. Perbaiki pjsip.conf.',
      files: { mode: 'pjsip', acc: pjAcc({ 101: { allow: 'g729' }, 102: { password: 'rahasia120' } }), vm: VM_BASE, ext: EXT_DASAR },
      edit: ['acc'], tests: [{ from: 0, num: '102', answer: 'answer', want: 'connected', label: '101 memanggil 102 dan diangkat' }] },
    { t: 'Voicemail saat sibuk', d: 'Saat 102 sibuk, penelepon seharusnya masuk voicemail dengan sapaan "sedang sibuk", dan saat tidak diangkat masuk voicemail biasa. Ada 2 kesalahan: satu di extensions.conf, satu di voicemail.conf.',
      files: { mode: 'pjsip', acc: PJ_OK, vm: VM_BASE.replace('102 => 1234,Budi\n', ''), ext: EXT_HEAD + `
[internal]
exten => _1XX,1,Dial(PJSIP/\${EXTEN},20)
 same => n,GotoIf($["\${DIALSTATUS}" = "BUSY"]?sibuk)
 same => n,VoiceMail(\${EXTEN}@default,u)
 same => n,Hangup()
 same => n(sibk),VoiceMail(\${EXTEN}@default,b)
 same => n,Hangup()
` }, edit: ['ext', 'vm'], tests: [{ from: 0, num: '102', answer: 'busy', want: 'voicemail', greet: 'busy', label: '102 sibuk → voicemail sapaan sibuk' }, { from: 0, num: '102', answer: 'noanswer', want: 'voicemail', greet: 'unavail', label: '102 tidak mengangkat → voicemail biasa' }] }
  ];
  (function debugTasks() {
    const box = $('#debug-list');
    const solved = store.get('dbg2-solved', {});
    box.innerHTML = DEBUG.map((t, i) => {
      const saved = store.get('dbg2-' + i, null);
      return `<div class="q debug-q" data-i="${i}"><div class="q-head"><span class="n">${i + 1}</span><b>${esc(t.t)}</b>${solved[i] ? '<span class="tag ok">selesai</span>' : ''}</div><p class="small">${esc(t.d)}</p>
        <ul class="list small">${t.tests.map(x => `<li>Uji: ${esc(x.label)}</li>`).join('')}</ul>
        ${t.edit.map(f => `<label class="field mono">${fileName(f, 'pjsip')}<textarea class="cfg dbg" data-f="${f}" spellcheck="false" autocapitalize="off" rows="${Math.min(22, ((saved && saved[f]) || t.files[f]).split('\n').length + 1)}">${esc((saved && saved[f]) || t.files[f])}</textarea></label>`).join('')}
        <div class="btn-row"><button type="button" class="btn btn-primary small" data-act="check">Periksa</button><button type="button" class="btn btn-ghost small" data-act="reset">Kembalikan soal</button><button type="button" class="btn btn-ghost small" data-act="sim">${icon('call')}Buka di simulator</button></div>
        <div class="checks" data-out></div></div>`;
    }).join('');
    const filesOf = (card, t) => { const f = Object.assign({}, t.files); $$('textarea[data-f]', card).forEach(x => { f[x.dataset.f] = x.value; }); return f; };
    box.addEventListener('input', debounce(e => {
      const card = e.target.closest('.debug-q'); if (!card) return;
      const i = +card.dataset.i, o = {};
      $$('textarea[data-f]', card).forEach(x => { o[x.dataset.f] = x.value; });
      store.set('dbg2-' + i, o);
    }, 300));
    box.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const card = b.closest('.debug-q'), i = +card.dataset.i, t = DEBUG[i];
      if (b.dataset.act === 'reset') { $$('textarea[data-f]', card).forEach(x => { x.value = t.files[x.dataset.f]; }); store.set('dbg2-' + i, null); $('[data-out]', card).innerHTML = ''; return; }
      const files = filesOf(card, t);
      if (b.dataset.act === 'sim') { openInSim(files); return; }
      const srv = AST.load(files);
      const devs = DEVS_DEF.map(d => Object.assign({}, d));
      const msgs = [];
      const add = (l, s) => msgs.push(`<div class="check ${l}"><span class="ci">${l === 'ok' ? '✓' : l === 'warn' ? '!' : '✕'}</span><span>${s}</span></div>`);
      const errs = srv.diags.filter(d => d.sev === 'error' || d.sev === 'warning');
      devs.forEach(d => { const r = AST.register(srv, d); if (!r.ok) { const note = r.events.filter(x => x.t === 'note').pop(); add('err', `Registrasi ${esc(d.user)} gagal (${r.code} ${esc(r.text)}): ${esc(note ? note.text : '')}`); } });
      let pass = 0;
      t.tests.forEach(x => {
        const r = AST.call(srv, devs[x.from], x.num, { answer: x.answer });
        const ok = r.status === x.want && (!x.greet || (r.vm && r.vm.greet === x.greet));
        if (ok) pass++;
        const bad = r.events.filter(ev => ev.t === 'note' && ev.cls === 'bad').map(ev => ev.text).pop();
        add(ok ? 'ok' : 'err', `${esc(x.label)}: ${ok ? 'berhasil' : `belum (${r.code ? r.code + ' ' + esc(r.text) : esc(r.status)})${bad ? ' – ' + esc(bad) : ''}`}`);
      });
      const all = pass === t.tests.length && !msgs.some(m => m.includes('check err'));
      if (errs.length) add('warn', `Masih ada ${errs.length} pesan diagnostik: ${esc(errs[0].file)}:${errs[0].line} ${esc(errs[0].msg)}`);
      if (all) { solved[i] = true; store.set('dbg2-solved', solved); }
      $('[data-out]', card).innerHTML = `<div class="check-head ${all ? 'ok' : 'err'}">${all ? 'Lulus: semua uji berhasil.' : 'Belum lulus. Baca pesan di bawah, perbaiki, lalu periksa lagi.'}</div>` + msgs.join('');
    });
  })();

  /* ============================== Rubrik praktik ============================== */
  (function rubric() {
    const SETS = {
      crimp: { label: 'Crimping kabel UTP', aspects: [
        ['Persiapan & K3', 10, ['Alat lengkap, area rapi, potongan kabel dibuang ke tempatnya', 'Alat lengkap, area kurang rapi', 'Ada alat yang kurang, perlu bantuan', 'Tidak menyiapkan alat, mengabaikan K3']],
        ['Pengupasan & susunan warna', 25, ['Kupasan rapi tanpa melukai isolasi, urutan benar di kedua ujung', 'Urutan benar, kupasan kurang rapi', '1 kabel salah posisi lalu diperbaiki sendiri', 'Urutan salah atau isolasi terluka']],
        ['Pemotongan & pemasukan', 20, ['Panjang ±1,3 cm rata, semua kabel menyentuh ujung, jaket ikut masuk', 'Rata, jaket kurang masuk', 'Tidak rata, ada kabel yang tidak sampai ujung', 'Asal masuk']],
        ['Hasil crimping', 20, ['Semua pin tertekan rata, kabel tidak bisa ditarik lepas', 'Pin tertekan, sedikit longgar', 'Ada pin yang tidak tertekan', 'Konektor rusak/lepas']],
        ['Hasil uji LAN tester', 25, ['Straight dan crossover lolos pada percobaan pertama', 'Lolos setelah 1 kali perbaikan', 'Lolos setelah beberapa kali perbaikan', 'Tidak lolos']]] },
      wifi: { label: 'Konfigurasi Wi-Fi', aspects: [
        ['Perencanaan', 15, ['Site survey lengkap, kanal dan posisi AP dipilih dengan alasan', 'Site survey ada, alasan kurang lengkap', 'Kanal/posisi dipilih tanpa data', 'Tidak ada perencanaan']],
        ['WAN, LAN & DHCP', 25, ['Semua benar, pool DHCP tidak memuat IP router/statis', 'Benar dengan sedikit bantuan', 'Ada kesalahan yang membuat sebagian klien gagal', 'Klien tidak mendapat IP']],
        ['Keamanan', 25, ['WPA2/WPA3, password kuat ≥ 12 karakter, password admin diganti', 'WPA2, password cukup, admin belum diganti', 'WPA/password lemah', 'Open/WEP']],
        ['Pengujian klien', 20, ['Dua klien terhubung, dapat IP, bisa internet dan saling ping', 'Terhubung dan bisa internet', 'Terhubung tanpa internet', 'Tidak bisa terhubung']],
        ['Dokumentasi', 15, ['Tangkapan layar dan tabel konfigurasi lengkap', 'Sebagian besar lengkap', 'Kurang lengkap', 'Tidak ada']]] },
      voip: { label: 'Instalasi server VoIP (PJSIP)', note: 'Rubrik untuk jalur utama Asterisk 21+ dengan pjsip.conf. Bila sekolah memakai server lama chan_sip, ganti bukti di aspek 2 dan 5 menjadi sip.conf dan sip show peers.', aspects: [
        ['Instalasi & cek versi', 15, ['Terpasang, layanan berjalan, versi dicek (asterisk -V) dan modul PJSIP termuat', 'Terpasang dan berjalan, versi belum dicek', 'Terpasang dengan banyak bantuan', 'Tidak terpasang']],
        ['Akun di pjsip.conf', 20, ['Transport, endpoint, auth, dan aor benar untuk semua akun; pjsip show endpoints dan pjsip show contacts menunjukkan semua softphone Avail', 'Satu akun perlu diperbaiki', 'Beberapa akun salah (misalnya max_contacts atau auth terlewat)', 'Tidak ada akun yang berfungsi']],
        ['Dialplan', 25, ['Kanal PJSIP/..., pattern, voicemail, dan echo test benar dan rapi', 'Berfungsi, kurang rapi', 'Sebagian berfungsi', 'Tidak berfungsi']],
        ['Uji panggilan', 25, ['Antar-extension, voicemail, dan echo berhasil', 'Antar-extension berhasil, satu fitur gagal', 'Hanya sebagian panggilan berhasil', 'Tidak ada panggilan berhasil']],
        ['Troubleshooting', 15, ['Bisa menjelaskan arti log (401, 403, 404, 486, 488) dan memperbaikinya sendiri', 'Bisa menjelaskan sebagian', 'Butuh bantuan untuk membaca log', 'Tidak bisa']]] },
      fo: { label: 'Praktik serat optik (LKPD)', aspects: [
        ['K3', 15, ['Memakai kacamata, tidak menatap ujung konektor, potongan serat dibuang ke wadah, alkohol jauh dari api', 'Satu prosedur K3 terlewat lalu diperbaiki', 'Beberapa prosedur K3 terlewat', 'Mengabaikan K3']],
        ['Pembersihan & inspeksi konektor', 20, ['Semua konektor diinspeksi sebelum dan sesudah, dibersihkan dengan metode benar, hasil tercatat', 'Dibersihkan benar, inspeksi tidak lengkap', 'Dibersihkan tanpa inspeksi', 'Tidak dibersihkan']],
        ['Penyambungan serat', 20, ['Kupas, bersihkan, potong (sudut ≤ 1°), sambung, rugi ≤ 0,1 dB, pelindung terpasang', 'Rugi 0,1–0,3 dB', 'Rugi > 0,3 dB atau perlu diulang beberapa kali', 'Gagal menyambung']],
        ['Pengukuran OPM & light source', 25, ['Referensi diambil benar, semua link diukur di 1.310 dan 1.550 nm, dihitung dan dibandingkan dengan batas', 'Pengukuran benar, satu perhitungan keliru', 'Referensi tidak diambil atau beberapa data keliru', 'Tidak mengukur']],
        ['Analisis gangguan', 20, ['Menentukan penyebab dan lokasi gangguan dari data, dengan langkah perbaikan yang tepat', 'Penyebab tepat, langkah perbaikan kurang lengkap', 'Penyebab kurang tepat', 'Tidak menganalisis']]] },
      ftth: { label: 'Perancangan FTTH', aspects: [
        ['Topologi & perangkat', 20, ['OLT, ODC, ODP, ONT, dan kabel ditempatkan logis dan berlabel', 'Lengkap, sedikit kurang logis', 'Ada perangkat yang terlewat', 'Tidak jelas']],
        ['Perhitungan link budget', 30, ['Semua komponen rugi dihitung benar dan disimpulkan layak/tidak', 'Satu komponen terlewat', 'Beberapa kesalahan hitung', 'Tidak ada perhitungan']],
        ['Splitter & kapasitas', 20, ['Rasio splitter sesuai jumlah rumah dengan cadangan', 'Sesuai tanpa cadangan', 'Kurang sesuai', 'Tidak ditentukan']],
        ['K3 penanganan serat', 15, ['Paham bahaya laser dan pecahan serat, menyebut cara aman', 'Menyebut sebagian', 'Menyebut satu hal', 'Tidak tahu']],
        ['Presentasi', 15, ['Jelas, menjawab pertanyaan dengan tepat', 'Jelas, sebagian jawaban kurang tepat', 'Kurang jelas', 'Tidak presentasi']]] }
    };
    const LAB = ['4 · Sangat baik', '3 · Baik', '2 · Cukup', '1 · Kurang'];
    let mode = store.get('rubric-mode', 'crimp'), sel = {};
    if (!SETS[mode]) mode = 'crimp';
    $('#rub-name').value = store.get('rubric-name', '');
    $('#rub-name').addEventListener('input', debounce(() => store.set('rubric-name', $('#rub-name').value), 300));
    const calc = () => {
      const A = SETS[mode].aspects, filled = A.every((_, i) => sel[i]);
      const sum = A.reduce((p, [, w], i) => p + (sel[i] || 0) * w / 100, 0);
      $('#rub-total').textContent = filled ? (sum / 4 * 100).toFixed(1).replace(/\.0$/, '') : '–';
      $('#rub-detail').textContent = filled ? `jumlah (skor × bobot) = ${sum.toFixed(2)} → ${sum.toFixed(2)} / 4 × 100` : `Pilih skor untuk ${A.filter((_, i) => !sel[i]).length} aspek lagi.`;
    };
    const draw = () => {
      sel = store.get('rubric-' + mode, {});
      $$('#rub-mode button').forEach(b => { b.classList.toggle('on', b.dataset.m === mode); b.setAttribute('aria-selected', b.dataset.m === mode ? 'true' : 'false'); });
      $('#rubric').innerHTML = (SETS[mode].note ? `<p class="small callout">${esc(SETS[mode].note)}</p>` : '') + SETS[mode].aspects.map(([nm, w, ds], i) => `<fieldset class="rubric-row" style="border:0;margin:0;padding-inline:0"><legend class="head" style="display:flex;width:100%"><span style="color:var(--ink);font-family:var(--font-body)">${esc(nm)}</span><span style="margin-left:auto">bobot ${w}%</span></legend>
        <div class="rubric-opts">${ds.map((dsc, k) => `<label><input type="radio" name="rub${i}" value="${4 - k}"${sel[i] === 4 - k ? ' checked' : ''}><b>${LAB[k]}</b>${esc(dsc)}</label>`).join('')}</div></fieldset>`).join('');
      calc();
    };
    $('#rub-mode').innerHTML = Object.entries(SETS).map(([k, s]) => `<button type="button" role="tab" data-m="${k}">${esc(s.label)}</button>`).join('');
    $('#rub-mode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; mode = b.dataset.m; store.set('rubric-mode', mode); draw(); });
    $('#rubric').addEventListener('change', e => { const inp = e.target.closest('input'); if (!inp) return; sel[+inp.name.slice(3)] = +inp.value; store.set('rubric-' + mode, sel); calc(); });
    draw();
  })();

  /* ============================== Kumpulkan hasil belajar ============================== */
  // Merekap semua yang tersimpan di browser siswa menjadi laporan yang bisa diunduh atau disalin.
  (function kumpul() {
    const ID = ['nama', 'kelas', 'absen'];
    const idv = store.get('kp-id', {});
    // Identitas dibaca langsung dari isian agar tombol unduh tidak menunggu penyimpanan (debounce).
    const syncId = () => { ID.forEach(k => { idv[k] = $('#kp-' + k).value.trim(); }); store.set('kp-id', idv); };
    ID.forEach(k => { $('#kp-' + k).value = idv[k] || ''; $('#kp-' + k).addEventListener('input', debounce(syncId, 250)); });
    function data() {
      syncId();
      const ans = store.get('quiz', {}), cases = store.get('cases', {}), dbg = store.get('dbg2-solved', {});
      const perBab = [1, 2, 3, 4, 5, 6].map(b => { const idx = QUIZ.map((q, i) => i).filter(i => QUIZ[i].b === b); return { b, n: idx.length, dij: idx.filter(i => ans[i] !== undefined).length, benar: idx.filter(i => ans[i] === QUIZ[i].a).length }; });
      const chk = $$('input[data-save]').map(c => c.dataset.save);
      return {
        id: { nama: idv.nama || '', kelas: idv.kelas || '', absen: idv.absen || '' },
        meet: MEET.filter(m => store.get('meet' + m.no, false)).map(m => m.no),
        keg: { done: chk.filter(k => store.get('chk:' + k, false)).length, total: chk.length },
        quiz: { benar: perBab.reduce((p, x) => p + x.benar, 0), dij: Object.keys(ans).length, total: QUIZ.length, perBab },
        kasus: { dij: Object.keys(cases).length, tepat: Object.entries(cases).filter(([i, k]) => CASES[i] && CASES[i].o[k] && CASES[i].o[k][1]).length, total: CASES.length },
        dbg: { lulus: DEBUG.map((t, i) => i).filter(i => dbg[i]).map(i => i + 1), total: DEBUG.length },
        lab: store.get('lab-stats', { tries: 0, pass: 0, straight: false, cross: false }),
        router: (r => !r ? null : r.v === 2 ? r : { lama: true, waktu: r.waktu, label: 'Perlu diuji ulang', klien: 'Hasil ini tersimpan dari versi lama simulator. Buka Bab 3, lalu tekan Simpan & uji koneksi klien lagi.' })(store.get('router-last', null)),
        voip: store.get('voip-log', []).slice(-10),
        lk: {
          sample: !!lk.sample,
          l1: lk.l1.map(r => { const s = lk1Status(r); return Object.assign({}, r, { hasil: s.label, final: s.final }); }),
          l2: lk.l2.map(r => { const s = lk2Status(r); return Object.assign({}, r, { hasil: s.label, final: s.final }); }),
          l3: { ref1310: lk.l3.ref1310, ref1550: lk.l3.ref1550, rows: (sh => lk.l3.rows.map(r => { const c = lk3Calc(r, sh); return Object.assign({}, r, { l1310: c.l1, l1550: c.l2, b1310: c.b1, b1550: c.b2, hasil: c.st[1], analisis: c.an, final: c.final }); }))(lk3Shared()) },
          l4: LK_CASES.map((c, i) => ({ kasus: c.t, jawaban: lk.l4[i] || '' }))
        }
      };
    }
    const yes = b => b ? '✓' : '–';
    const filled = rows => rows.filter(r => r.final).length;
    function cards(d) {
      const c = (t, v, s) => `<div class="kp-card"><span>${t}</span><b>${v}</b><small>${s}</small></div>`;
      return c('Pertemuan', `${d.meet.length}/${MEET.length}`, d.meet.length ? 'no. ' + d.meet.join(', ') : 'belum dicentang') +
        c('Kuis', `${d.quiz.benar}/${d.quiz.total}`, `${d.quiz.dij} soal dijawab`) +
        c('Studi kasus', `${d.kasus.tepat}/${d.kasus.total}`, `${d.kasus.dij} dijawab`) +
        c('Perbaiki konfigurasi', `${d.dbg.lulus.length}/${d.dbg.total}`, d.dbg.lulus.length ? 'lulus no. ' + d.dbg.lulus.join(', ') : 'belum ada yang lulus') +
        c('Lab RJ45', `${d.lab.pass}/${d.lab.tries}`, `straight ${yes(d.lab.straight)} · crossover ${yes(d.lab.cross)}`) +
        c('Simulasi router', d.router ? d.router.label : '–', d.router ? (d.router.lama ? 'hasil versi lama, uji ulang' : routerCountText(d.router)) : 'belum dicoba') +
        c('Simulator VoIP', `${d.voip.filter(x => x.ok).length}/${d.voip.length}`, 'aktivitas terakhir berhasil') +
        c('LKPD serat optik', `${filled(d.lk.l1) + filled(d.lk.l2) + filled(d.lk.l3.rows)}/12`, `baris dinilai${d.lk.sample ? ' · contoh data' : ''} · LKPD 4: ${d.lk.l4.filter(x => x.jawaban.trim()).length}/4`);
    }
    const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v === null || v === undefined ? '–' : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const n2 = v => v === null || v === undefined ? '–' : fmt(v, 2);
    function detail(d) {
      let h = '';
      h += `<h3>Kuis per bab</h3>` + tbl(['Bab', 'Dijawab', 'Benar'], d.quiz.perBab.map(x => [x.b, `${x.dij}/${x.n}`, x.benar]));
      h += `<h3>Kegiatan siswa</h3><p>${d.keg.done} dari ${d.keg.total} kegiatan dan butir perawatan dicentang.</p>`;
      if (d.router) h += `<h3>Simulasi router (terakhir ${esc(d.router.waktu)})</h3><p><b>${esc(d.router.label)}.</b> ${esc(d.router.klien)}${d.router.lama ? "" : ` (${esc(routerCountText(d.router))}.) Konfigurasi: SSID ${esc(d.router.ssid)}, keamanan ${esc(d.router.keamanan)}, kanal ${esc(d.router.kanal)}, LAN ${esc(d.router.lan)}, DHCP ${esc(d.router.dhcp)}.`}</p>`;
      if (d.voip.length) h += `<h3>Simulator VoIP (10 aktivitas terakhir)</h3>` + tbl(['Waktu', 'Mode', 'Aktivitas', 'Hasil'], d.voip.map(x => [x.waktu, x.mode === 'sip' ? 'chan_sip' : 'PJSIP', x.jenis === 'daftar' ? `${x.dari} mendaftar` : `${x.dari} → ${x.ke}`, x.hasil]));
      h += `<h3>LKPD 1 · Pembersihan & inspeksi${d.lk.sample ? ' (contoh data)' : ''}</h3>` + tbl(['Konektor', 'Jenis', 'Sebelum', 'Metode', 'Sesudah', 'Hasil'], d.lk.l1.map(r => [r.kode, r.jenis, r.sebelum, r.metode, r.sesudah, r.hasil]));
      h += `<h3>LKPD 2 · Penyambungan</h3>` + tbl(['Sambungan', 'Sudut kiri', 'Sudut kanan', 'Estimasi (dB)', 'Ukur (dB)', 'Status'], d.lk.l2.map(r => [r.kode, r.a1, r.a2, r.est, r.ukur, r.hasil]));
      h += `<h3>LKPD 3 · Pengukuran OPM (P ref 1.310 = ${esc(d.lk.l3.ref1310 || '–')} dBm, 1.550 = ${esc(d.lk.l3.ref1550 || '–')} dBm)</h3>` + tbl(['Link', 'km', 'Konektor', 'Splice', 'Redaman 1.310 / batas', 'Redaman 1.550 / batas', 'Status', 'Analisis'], d.lk.l3.rows.map(r => [r.nama, r.km, r.kon, r.spl, `${n2(r.l1310)} / ${n2(r.b1310)}`, `${n2(r.l1550)} / ${n2(r.b1550)}`, r.hasil, r.analisis]));
      h += `<h3>LKPD 4 · Analisis gangguan</h3>` + d.lk.l4.map((x, i) => `<p><b>${i + 1}. ${esc(x.kasus)}</b><br>${esc(x.jawaban || '(belum dijawab)')}</p>`).join('');
      return h;
    }
    function text(d) {
      const nm = d.id.nama || '(nama belum diisi)';
      return [`HASIL BELAJAR · Teknologi Jaringan Kabel & Nirkabel`, `${nm} · ${d.id.kelas || '-'} · absen ${d.id.absen || '-'}`,
        `Pertemuan selesai: ${d.meet.length}/${MEET.length}`,
        `Kuis: ${d.quiz.benar}/${d.quiz.total} benar (${d.quiz.perBab.map(x => `Bab ${x.b} ${x.benar}/${x.n}`).join(', ')})`,
        `Studi kasus: ${d.kasus.tepat}/${d.kasus.total} tepat (${d.kasus.dij} dijawab)`,
        `Perbaiki konfigurasi: ${d.dbg.lulus.length}/${d.dbg.total} lulus${d.dbg.lulus.length ? ' (no. ' + d.dbg.lulus.join(', ') + ')' : ''}`,
        `Lab RJ45: ${d.lab.tries} percobaan, ${d.lab.pass} lulus, straight ${yes(d.lab.straight)}, crossover ${yes(d.lab.cross)}`,
        `Simulasi router: ${d.router ? d.router.label + ' · ' + d.router.klien : 'belum dicoba'}`,
        `Simulator VoIP: ${d.voip.filter(x => x.ok).length} dari ${d.voip.length} aktivitas terakhir berhasil`,
        `LKPD serat optik: ${filled(d.lk.l1)}/4 konektor, ${filled(d.lk.l2)}/4 sambungan, ${filled(d.lk.l3.rows)}/4 link diukur, ${d.lk.l4.filter(x => x.jawaban.trim()).length}/4 kasus dianalisis${d.lk.sample ? ' (contoh data)' : ''}`,
        `Dibuat: ${new Date().toLocaleString('id-ID')}`].join('\n');
    }
    function render() {
      const d = data();
      $('#kp-rekap').innerHTML = cards(d);
      $('#kp-detail').innerHTML = detail(d);
    }
    // Halaman selalu digambar ulang dari data yang sama dengan yang diunduh/disalin, juga bila tab lain mengubah hasil.
    window.addEventListener('storage', e => { if (e.key && e.key.startsWith('tjkn:') && location.hash === '#kumpul') render(); });
    $('#kp-copy').addEventListener('click', () => { render(); copyText(text(data())); });
    $('#kp-download').addEventListener('click', () => {
      render();
      const d = data();
      if (!d.id.nama) { toast('Isi nama dulu.'); $('#kp-nama').focus(); return; }
      const slug = d.id.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'siswa';
      const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Hasil belajar TJKN · ${esc(d.id.nama)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:24px auto;max-width:900px;padding:0 16px;color:#13212a}h1{font-size:1.5rem;margin:0}h2{margin-top:28px;font-size:1.2rem}h3{margin:20px 0 6px;font-size:1rem}table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0}th,td{border:1px solid #c9d3d8;padding:5px 8px;text-align:left;vertical-align:top}th{background:#eef3f5}.kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px}.kp-card{border:1px solid #c9d3d8;border-radius:8px;padding:8px 10px;display:grid}.kp-card b{font-size:1.3rem}.kp-card small,.kp-card span{color:#55656d}pre{white-space:pre-wrap;background:#f4f7f8;padding:10px;border-radius:6px;font-size:12px}@media print{body{margin:0}}</style></head><body>
<h1>Hasil belajar · Teknologi Jaringan Kabel dan Nirkabel</h1><p><b>${esc(d.id.nama)}</b> · ${esc(d.id.kelas || '-')} · absen ${esc(d.id.absen || '-')}<br>Dibuat ${esc(new Date().toLocaleString('id-ID'))} dari web media ajar TJKN kelas XI.</p>
<h2>Rekap</h2><div class="kp">${cards(d)}</div><h2>Rincian</h2>${detail(d)}
<h2>Konfigurasi VoIP terakhir (${esc(AST.MODES[vp.mode].ver)})</h2>${['acc', 'ext', 'vm'].map(k => `<h3>${esc(fileName(k))}</h3><pre>${esc(curFiles()[k])}</pre>`).join('')}</body></html>`;
      saveFile(`hasil-tjkn-${slug}.html`, html);
    });
    $('#kp-voip').addEventListener('click', () => {
      syncId();
      const nm = (idv.nama || 'siswa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'siswa';
      saveFile(`konfigurasi-voip-${nm}.txt`, ['acc', 'ext', 'vm'].map(k => `;;;;;;;;;; ${fileName(k)} ;;;;;;;;;;\n${curFiles()[k]}`).join('\n\n'));
    });
    onShow.kumpul = render;
  })();

  /* ============================== Referensi ============================== */
  const GLOSS = [
    ['Access point (AP)', 'Perangkat yang menghubungkan klien nirkabel ke jaringan kabel.', 3], ['ADSL', 'DSL asimetris: unduh lebih cepat dari unggah, memakai kabel telepon.', 1],
    ['AMC', 'Adaptive modulation and coding: modulasi berubah mengikuti kualitas sinyal.', 2], ['Asterisk', 'Perangkat lunak PBX/VoIP open source.', 4],
    ['AOR (address of record)', 'Section type=aor di pjsip.conf: tempat alamat softphone yang terdaftar disimpan; max_contacts=1 agar bisa REGISTER.', 5], ['Endpoint (PJSIP)', 'Section type=endpoint: aturan panggilan satu akun (context, codec, auth, aors).', 5],
    ['PJSIP', 'Modul SIP Asterisk berbasis pustaka PJSIP, memakai pjsip.conf; satu-satunya modul SIP di Asterisk 21 ke atas.', 5], ['chan_sip', 'Modul SIP lama Asterisk (sip.conf), usang sejak versi 17 dan dihapus di versi 21.', 5],
    ['RTT (round-trip time)', 'Waktu pergi-pulang paket, yang ditampilkan ping. Berbeda dengan delay satu arah.', 4], ['Link-local (APIPA)', 'Alamat 169.254.x.x yang diambil perangkat sendiri saat DHCP tidak menjawab; tidak dirutekan.', 3],
    ['OPM', 'Optical power meter: alat ukur daya cahaya (dBm) untuk menghitung redaman link serat optik.', 6], ['VFL', 'Visual fault locator: laser merah untuk mencari patahan atau tekukan serat dari cahaya yang bocor.', 6],
    ['Attenuation (redaman)', 'Pelemahan daya sinyal sepanjang media, satuan dB atau dB/km.', 6], ['Baseband', 'Satu sinyal memakai seluruh pita media (contoh: Ethernet).', 1],
    ['Bridge', 'Perangkat/mode yang menyatukan dua segmen LAN menjadi satu jaringan.', 3], ['Broadband', 'Pita dibagi banyak kanal frekuensi; juga berarti internet berkecepatan tinggi.', 1],
    ['CDMA', 'Code division multiple access: pengguna dibedakan dengan kode unik.', 2], ['Circuit-switched', 'Satu jalur khusus dipesan selama panggilan (PSTN).', 1],
    ['Cladding', 'Lapisan kaca di sekeliling inti serat optik dengan indeks bias lebih rendah.', 6], ['Codec', 'Pengubah dan pemampat suara/video menjadi data digital.', 4],
    ['Context', 'Blok dalam dialplan Asterisk yang berisi kumpulan extension.', 5], ['Core (inti)', 'Bagian tengah serat optik tempat cahaya merambat.', 6],
    ['CPE', 'Customer premises equipment: perangkat di sisi pelanggan.', 1], ['Crossover', 'Kabel UTP T568A di satu ujung dan T568B di ujung lain.', 1],
    ['DHCP', 'Layanan pembagi alamat IP otomatis ke klien.', 3], ['Dialplan', 'Aturan di extensions.conf yang menentukan nasib setiap nomor yang dihubungi.', 5],
    ['DIALSTATUS', 'Variabel Asterisk hasil Dial(): ANSWER, BUSY, NOANSWER, CHANUNAVAIL, CONGESTION.', 5], ['Dispersi', 'Pelebaran pulsa cahaya di serat optik.', 6],
    ['DSLAM', 'Perangkat di sentral yang menghimpun banyak saluran DSL.', 1], ['Extension', 'Nomor (atau pola nomor) di dalam context dialplan.', 5],
    ['FDMA', 'Frequency division multiple access: tiap pengguna mendapat pita frekuensi sendiri.', 2], ['FTTH', 'Fiber to the home: serat optik sampai rumah pelanggan.', 6],
    ['Gateway', 'Perangkat penghubung dua jaringan berbeda, misalnya IP ke PSTN.', 4], ['H.323', 'Suite protokol multimedia ITU-T, pendahulu SIP.', 5],
    ['Hunting', 'Pengelompokan beberapa saluran di bawah satu nomor utama.', 5], ['IVR', 'Interactive voice response: mesin penjawab "tekan 1 untuk…".', 5],
    ['JARLOKAT', 'Jaringan lokal akses tembaga dari STO ke pelanggan.', 1], ['Jitter', 'Variasi waktu kedatangan antarpaket.', 4],
    ['KTB', 'Kotak terminal batas: batas tanggung jawab penyedia dan pelanggan.', 1], ['Latency', 'Waktu tempuh data dari pengirim ke penerima.', 4],
    ['MDF', 'Main distribution frame: rangka pembagi utama di STO.', 1], ['MOS', 'Mean opinion score: nilai kualitas suara 1–5.', 4],
    ['Multimode', 'Serat optik berinti besar yang membawa banyak mode cahaya, untuk jarak pendek.', 6], ['NAT', 'Penerjemahan alamat IP privat ke alamat publik.', 3],
    ['NFC', 'Near field communication: komunikasi nirkabel jarak beberapa sentimeter.', 2], ['ODC / ODP', 'Kabinet dan kotak distribusi pasif FTTH berisi splitter.', 6],
    ['OLT', 'Optical line terminal: perangkat aktif FTTH di STO.', 6], ['ONT', 'Optical network terminal: perangkat FTTH di rumah pelanggan.', 6],
    ['OSI', 'Model 7 lapisan protokol jaringan.', 2], ['Packet loss', 'Paket yang hilang dan tidak sampai ke penerima.', 4],
    ['PABX', 'Private automatic branch exchange: PBX yang menyambung otomatis.', 5], ['PBX', 'Sentral telepon milik sendiri (kantor) dengan extension internal.', 5],
    ['PSTN', 'Jaringan telepon publik berbasis sirkuit.', 1], ['Repeater', 'Penerima dan pemancar ulang sinyal untuk memperluas jangkauan.', 3],
    ['RK', 'Rumah kabel: kabinet sambungan kabel primer dan sekunder.', 1], ['RTP / RTCP', 'Protokol pembawa media real-time dan pengontrol kualitasnya.', 4],
    ['SDP', 'Session description protocol: menjelaskan codec, IP, dan port media.', 4], ['SIP', 'Session initiation protocol: protokol pembentuk sesi VoIP.', 5],
    ['Singlemode', 'Serat optik berinti 8–10 µm dengan satu mode cahaya, untuk jarak jauh.', 6], ['Softswitch', 'Sistem penyambungan panggilan berbasis perangkat lunak.', 4],
    ['Split pair', 'Kabel UTP yang pasangannya terpecah: lolos tester tetapi crosstalk tinggi.', 1], ['SSID', 'Nama jaringan Wi-Fi.', 3],
    ['STP', 'Shielded twisted pair: kabel berpilin berpelindung.', 1], ['Straight-through', 'Kabel UTP dengan urutan warna sama di kedua ujung.', 1],
    ['TDMA', 'Time division multiple access: pengguna bergiliran dalam slot waktu.', 2], ['Trunk', 'Saluran bersama antarsentral atau dari PBX ke penyedia layanan.', 5],
    ['UTP', 'Unshielded twisted pair: kabel berpilin tanpa pelindung.', 1], ['VoIP', 'Voice over Internet Protocol: suara lewat jaringan IP.', 4],
    ['WDM', 'Wavelength division multiplexing: banyak panjang gelombang dalam satu serat.', 6], ['WEP / WPA2 / WPA3', 'Metode keamanan Wi-Fi dari yang terlemah ke yang terkuat.', 3],
    ['ZigBee', 'Standar IEEE 802.15.4 hemat daya untuk perangkat IoT.', 2]
  ];
  (function glossary() {
    const tb = $('#glo-table tbody');
    const draw = q => {
      const re = q ? new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig') : null;
      const hl = s => re ? esc(s).replace(re, '<mark>$1</mark>') : esc(s);
      const rows = GLOSS.filter(([a, b]) => !q || (a + ' ' + b).toLowerCase().includes(q.toLowerCase()));
      tb.innerHTML = rows.length ? rows.map(([a, b, c]) => `<tr><td><b>${hl(a)}</b></td><td>${hl(b)}</td><td><a href="#bab${c}">${c}</a></td></tr>`).join('') : '<tr><td colspan="3" class="muted">Istilah tidak ditemukan.</td></tr>';
    };
    $('#glo-search').addEventListener('input', e => draw(e.target.value.trim()));
    draw('');
    const CLI = [
      ['asterisk -V', 'Dari terminal Linux: menampilkan versi Asterisk.'],
      ['asterisk -rvvv', 'Masuk ke CLI Asterisk dari terminal Linux (v = tingkat detail log).'],
      ['pjsip show endpoints', 'Daftar endpoint, auth, AOR, dan kontak yang terdaftar.'], ['pjsip show contacts', 'Softphone yang sedang terdaftar beserta alamat IP-nya.'],
      ['pjsip show endpoint 101', 'Rincian satu endpoint: context, codec, auth, aors, ACL.'],
      ['module reload res_pjsip.so', 'Membaca ulang pjsip.conf (bisa juga pjsip reload).'],
      ['dialplan show internal', 'Menampilkan isi context [internal].'], ['dialplan reload', 'Membaca ulang extensions.conf.'],
      ['core show channels', 'Panggilan yang sedang berlangsung.'], ['voicemail show users', 'Daftar kotak suara dan jumlah pesan.'],
      ['module show like chan_sip', 'Cek modul lama: 0 modules loaded berarti server tidak punya chan_sip.'], ['core set verbose 3', 'Mengatur tingkat detail log di CLI.'],
      ['sip show peers', 'Server lama (chan_sip) saja: daftar akun di sip.conf. Muat ulang dengan sip reload.']
    ];
    $('#cheat-cli').innerHTML = CLI.map(([c, d]) => `<div class="cheat-row"><code>${esc(c)}</code><button type="button" class="btn btn-ghost small" data-copy="${esc(c)}">${icon('copy')}Salin</button><span class="d">${esc(d)}</span></div>`).join('');
    $('#cheat-cli').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copyText(b.dataset.copy); });
  })();

  /* ============================== Offline ============================== */
  const netbar = $('#netbar');
  const updateNet = () => { netbar.hidden = navigator.onLine; };
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  updateNet();
  $$('a[href^="http"]').forEach(a => { a.classList.add('ext'); if (!a.title) a.title = 'Membuka situs lain (butuh internet)'; });
  document.addEventListener('click', e => { if (e.target.closest('a.ext') && !navigator.onLine) toast('Tautan ini butuh internet. Materi, lab, simulator, dan kuis tetap bisa dipakai offline.'); });
  const offStatus = $('#offline-status');
  const setOff = (text, cls) => { if (offStatus) { offStatus.textContent = text; offStatus.className = 'tag ' + (cls || ''); } };
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then(() => caches.keys())
        .then(keys => setOff(keys.some(k => k.startsWith('modul-tjkn-')) ? 'Tersimpan: bisa dibuka ulang tanpa internet di browser ini' : 'Sedang menyimpan…', keys.length ? 'ok' : ''))
        .catch(() => setOff('Tidak bisa disimpan untuk offline di browser ini', 'warn'));
    });
  } else {
    setOff(location.protocol === 'file:' ? 'Dibuka dari file lokal: tidak perlu internet' : 'Penyimpanan offline tidak tersedia di sini', location.protocol === 'file:' ? 'ok' : 'warn');
  }

  route();
})();
