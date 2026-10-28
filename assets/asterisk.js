/* Mesin simulator Asterisk untuk pembelajaran: membaca sip.conf, extensions.conf, voicemail.conf,
 * lalu mensimulasikan REGISTER, INVITE, dan dialplan. Pesan log meniru format CLI Asterisk (chan_sip),
 * sedangkan petunjuk perbaikan ditulis dalam bahasa Indonesia. Bukan server sungguhan. */
(function () {
  'use strict';

  const SERVER_IP = '192.168.1.5';
  const CODECS = ['ulaw', 'alaw', 'gsm', 'g729', 'g722', 'g726', 'ilbc', 'speex', 'opus'];
  const DEFAULT_CODECS = ['ulaw', 'alaw', 'gsm'];
  // codec yang bisa diterjemahkan Asterisk tanpa lisensi tambahan
  const TRANSCODE = ['ulaw', 'alaw', 'gsm', 'g722', 'g726', 'ilbc', 'speex', 'opus'];
  const SOUNDS = ['hello-world', 'demo-congrats', 'demo-thanks', 'vm-goodbye', 'goodbye', 'beep', 'tt-monkeys', 'tt-weasels',
    'welcome', 'please-try-again', 'invalid', 'pbx-invalid', 'silence/1', 'conf-onlyperson', 'vm-intro', 'agent-pass',
    'custom/menu-ptx', 'custom/ivr-ptx', 'queue-thankyou', 'privacy-unident', 'ss-noservice', 'all-circuits-busy-now', 'vm-nobodyavail'];
  const APPS = ['Answer', 'Dial', 'Hangup', 'Playback', 'Background', 'WaitExten', 'Wait', 'Echo', 'VoiceMail', 'VoiceMailMain',
    'Goto', 'GotoIf', 'Set', 'NoOp', 'Verbose', 'Busy', 'Congestion', 'Ringing', 'Progress', 'SayDigits', 'SayNumber', 'ConfBridge', 'MeetMe', 'Read'];
  // ada di Asterisk sungguhan, tetapi belum didukung simulator
  const REAL_APPS = ['Queue', 'Macro', 'Gosub', 'Return', 'System', 'AGI', 'MixMonitor', 'Monitor', 'Record', 'Page', 'ChanSpy',
    'Directory', 'Authenticate', 'DISA', 'SendDTMF', 'Transfer', 'ExecIf', 'While', 'EndWhile', 'MusicOnHold', 'StartMusicOnHold', 'SIPAddHeader'];
  const PEER_KEYS = ['type', 'host', 'secret', 'context', 'callerid', 'allow', 'disallow', 'permit', 'deny', 'nat', 'qualify',
    'defaultuser', 'username', 'fromuser', 'fromdomain', 'insecure', 'dtmfmode', 'canreinvite', 'directmedia', 'mailbox', 'port',
    'transport', 'call-limit', 'language', 'accountcode', 'description', 'subscribecontext', 'trustrpid', 'sendrpid', 'encryption', 'md5secret', 'outboundproxy', 'remotesecret', 'busylevel'];
  const GEN_KEYS = ['context', 'allowguest', 'bindport', 'bindaddr', 'udpbindaddr', 'srvlookup', 'disallow', 'allow', 'language',
    'alwaysauthreject', 'nat', 'transport', 'externip', 'externaddr', 'localnet', 'register', 'useragent', 'dtmfmode', 'directmedia', 'canreinvite', 'qualify', 'tcpenable', 'videosupport', 'rtptimeout', 'defaultexpiry', 'maxexpiry', 'allowoverlap', 'realm'];
  const EXT_GENERAL = ['static', 'writeprotect', 'autofallthrough', 'clearglobalvars', 'extenpatternmatchnew', 'userscontext', 'priorityjumping'];

  /* ------------------------------ util ------------------------------ */
  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function suggest(word, list) {
    let best = null, bd = 3;
    list.forEach(w => { const v = lev(word, w); if (v < bd) { bd = v; best = w; } });
    return best;
  }
  const pid = () => 10000 + Math.floor(Math.random() * 9000);
  function stripComment(line) {
    let out = '';
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '\\' && line[i + 1] === ';') { out += ';'; i++; continue; }
      if (line[i] === ';') break;
      out += line[i];
    }
    return out.trim();
  }
  function ip2int(ip) {
    const p = String(ip).trim().split('.');
    if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || +x > 255)) return null;
    return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3];
  }
  function parseNet(s) {
    const [a, m] = String(s).split('/');
    const ip = ip2int(a);
    if (ip === null) return null;
    let mask;
    if (m === undefined) mask = 0xffffffff;
    else if (/^\d{1,2}$/.test(m)) mask = +m === 0 ? 0 : (0xffffffff << (32 - +m)) >>> 0;
    else { mask = ip2int(m); if (mask === null) return null; }
    return { ip, mask };
  }
  function aclAllows(acl, ip) {
    const v = ip2int(ip);
    let ok = true;
    acl.forEach(r => { if (v !== null && ((v & r.net.mask) >>> 0) === ((r.net.ip & r.net.mask) >>> 0)) ok = r.permit; });
    return ok;
  }
  function splitArgs(s) {
    const out = []; let cur = '', depth = 0, q = false;
    for (const ch of s) {
      if (ch === '"') q = !q;
      if (!q && (ch === '(' || ch === '[' || ch === '{')) depth++;
      if (!q && (ch === ')' || ch === ']' || ch === '}')) depth--;
      if (ch === ',' && depth === 0 && !q) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  const hex8 = n => n.toString(16).padStart(8, '0');

  /* ------------------------------ pattern ------------------------------ */
  function tokenizePattern(p) {
    const toks = [];
    for (let i = 1; i < p.length; i++) {
      const c = p[i], u = c.toUpperCase();
      if (u === 'X') toks.push({ t: 'set', set: '0123456789', label: 'X', card: 10 });
      else if (u === 'Z') toks.push({ t: 'set', set: '123456789', label: 'Z', card: 9 });
      else if (u === 'N') toks.push({ t: 'set', set: '23456789', label: 'N', card: 8 });
      else if (c === '.') toks.push({ t: 'dot', label: '.', card: 11 });
      else if (c === '!') toks.push({ t: 'bang', label: '!', card: 12 });
      else if (c === '[') {
        const end = p.indexOf(']', i);
        if (end < 0) return null;
        const body = p.slice(i + 1, end);
        let set = '';
        for (let k = 0; k < body.length; k++) {
          if (body[k + 1] === '-' && body[k + 2] !== undefined) {
            const a = body.charCodeAt(k), b = body.charCodeAt(k + 2);
            for (let x = Math.min(a, b); x <= Math.max(a, b); x++) set += String.fromCharCode(x);
            k += 2;
          } else set += body[k];
        }
        toks.push({ t: 'set', set, label: '[' + body + ']', card: Math.max(1, set.length) });
        i = end;
      } else if (c === '-') { /* pemisah visual, diabaikan Asterisk */ }
      else toks.push({ t: 'lit', ch: c, label: c, card: 1 });
    }
    return toks;
  }
  // Mencocokkan nomor dengan pattern, sekaligus mencatat langkah per karakter untuk ditampilkan.
  function matchPattern(pat, num) {
    if (!pat.startsWith('_')) {
      const ok = pat === num;
      return { ok, literal: true, steps: [], reason: ok ? 'Nomor sama persis dengan extension literal.' : 'Extension literal harus sama persis.' };
    }
    const toks = tokenizePattern(pat);
    if (!toks) return { ok: false, steps: [], reason: 'Kurung siku [ tidak ditutup.' };
    const steps = [];
    let i = 0;
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'dot' || t.t === 'bang') {
        const rest = num.slice(i);
        if (k < toks.length - 1) {
          const re = new RegExp('^' + toks.slice(k).map(tokRe).join('') + '$', 'i');
          const ok = re.test(rest);
          steps.push({ tok: t.label, ch: rest, ok });
          return { ok, steps, reason: ok ? 'Cocok.' : 'Sisa nomor tidak cocok dengan bagian akhir pattern.' };
        }
        if (t.t === 'dot' && rest.length === 0) { steps.push({ tok: '.', ch: '', ok: false }); return { ok: false, steps, reason: 'Titik (.) butuh minimal satu karakter lagi.' }; }
        steps.push({ tok: t.label, ch: rest || '∅', ok: true });
        return { ok: true, steps, reason: 'Cocok. ' + (t.t === 'dot' ? 'Titik menerima sisa nomor (satu karakter atau lebih).' : 'Tanda seru menerima sisa nomor (boleh kosong).') };
      }
      const ch = num[i];
      if (ch === undefined) { steps.push({ tok: t.label, ch: '', ok: false }); return { ok: false, steps, reason: 'Nomor terlalu pendek untuk pattern ini.' }; }
      const ok = t.t === 'lit' ? ch.toLowerCase() === t.ch.toLowerCase() : t.set.includes(ch);
      steps.push({ tok: t.label, ch, ok });
      if (!ok) return { ok: false, steps, reason: `Karakter ke-${i + 1} ("${ch}") tidak termasuk ${t.t === 'lit' ? '"' + t.ch + '"' : t.label}.` };
      i++;
    }
    if (i < num.length) { steps.push({ tok: '', ch: num.slice(i), ok: false }); return { ok: false, steps, reason: 'Nomor lebih panjang daripada pattern. Tambahkan . di akhir pattern bila panjangnya bebas.' }; }
    return { ok: true, steps, reason: 'Cocok.' };
  }
  function tokRe(t) {
    if (t.t === 'lit') return t.ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (t.t === 'set') return '[' + t.set.replace(/[\]\\^-]/g, '\\$&') + ']';
    if (t.t === 'dot') return '.+';
    return '.*';
  }
  const patKey = p => p.startsWith('_') ? (tokenizePattern(p) || []).map(t => t.card) : [0];
  function cmpKey(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] === undefined ? 13 : a[i], y = b[i] === undefined ? 13 : b[i];
      if (x !== y) return x - y;
    }
    return 0;
  }

  /* ------------------------------ parser ------------------------------ */
  function parseSip(text) {
    const diags = [], peers = {}, order = [], templates = {};
    const general = { opts: {}, codecRules: [], line: 0 };
    let cur = null, curName = null;
    text.split(/\r?\n/).forEach((raw, idx) => {
      const ln = idx + 1, line = stripComment(raw);
      if (!line) return;
      const sec = line.match(/^\[([^\]]*)\]\s*(?:\(([^)]*)\))?\s*$/);
      if (sec) {
        curName = sec[1].trim();
        const tpl = (sec[2] || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!curName) { diags.push({ file: 'sip.conf', line: ln, sev: 'error', msg: 'Nama bagian [ ] kosong', hint: 'Tulis nama akun di dalam kurung siku, misalnya [101].' }); cur = null; return; }
        if (curName.toLowerCase() === 'general') { cur = general; general.line = ln; return; }
        const isTpl = tpl.includes('!');
        cur = { name: curName, line: ln, opts: {}, optLine: {}, codecRules: [], acl: [], template: isTpl };
        tpl.filter(t => t !== '!').forEach(t => {
          const base = templates[t];
          if (!base) { diags.push({ file: 'sip.conf', line: ln, sev: 'warning', msg: `Template '${t}' tidak ditemukan`, hint: 'Template harus ditulis lebih dulu dengan tanda (!), misalnya [akun](!).' }); return; }
          Object.assign(cur.opts, base.opts); Object.assign(cur.optLine, base.optLine);
          cur.codecRules.push(...base.codecRules); cur.acl.push(...base.acl);
        });
        if (isTpl) templates[curName] = cur;
        else {
          if (peers[curName]) diags.push({ file: 'sip.conf', line: ln, sev: 'warning', msg: `Akun [${curName}] ditulis dua kali`, hint: 'Nama akun harus unik. Bagian kedua menimpa yang pertama.' });
          else order.push(curName);
          peers[curName] = cur;
        }
        return;
      }
      const kv = line.match(/^([A-Za-z0-9_-]+)\s*=>?\s*(.*)$/);
      if (!kv) { diags.push({ file: 'sip.conf', line: ln, sev: 'error', msg: `Baris tidak dikenali: '${line}'`, hint: 'Format baris pengaturan adalah nama=nilai, misalnya secret=rahasia101.' }); return; }
      if (!cur) { diags.push({ file: 'sip.conf', line: ln, sev: 'warning', msg: 'Pengaturan di luar bagian mana pun', hint: 'Tulis [general] atau [nama-akun] di atas baris ini.' }); return; }
      const key = kv[1].toLowerCase(), val = kv[2].trim();
      if (key === 'allow' || key === 'disallow') {
        val.split(/[,&]/).map(s => s.trim().toLowerCase()).filter(Boolean).forEach(c => {
          if (c !== 'all' && !CODECS.includes(c)) {
            const s = suggest(c, CODECS);
            diags.push({ file: 'sip.conf', line: ln, sev: 'warning', msg: `Cannot ${key} unknown format '${c}'`, hint: `Nama codec tidak dikenal.${s ? ` Mungkin maksudnya "${s}"?` : ''} Contoh yang benar: ulaw, alaw, gsm, g729.` });
          } else cur.codecRules.push({ allow: key === 'allow', codec: c });
        });
        return;
      }
      if (key === 'permit' || key === 'deny') {
        if (cur === general) { diags.push({ file: 'sip.conf', line: ln, sev: 'notice', msg: `${key} di [general] diabaikan simulator`, hint: 'Pasang permit/deny pada masing-masing akun.' }); return; }
        const net = parseNet(val);
        if (!net) { diags.push({ file: 'sip.conf', line: ln, sev: 'error', msg: `Invalid ACL '${val}'`, hint: 'Format: alamat/mask, misalnya permit=192.168.1.0/255.255.255.0 atau 192.168.1.0/24.' }); return; }
        cur.acl.push({ permit: key === 'permit', net, text: val });
        return;
      }
      const list = cur === general ? GEN_KEYS : PEER_KEYS;
      if (!list.includes(key)) {
        const s = suggest(key, list);
        diags.push({ file: 'sip.conf', line: ln, sev: 'warning', msg: `Unknown option '${key}' ${cur === general ? 'in [general]' : `for peer '${cur.name}'`}`, hint: s ? `Mungkin maksudnya "${s}"?` : 'Opsi ini tidak dikenal dan akan diabaikan.' });
      }
      cur.opts[key] = val;
      if (cur.optLine) cur.optLine[key] = ln;
    });
    const genCodecs = applyCodecs(DEFAULT_CODECS.slice(), general.codecRules);
    const genCtx = general.opts.context || 'default';
    order.forEach(name => {
      const p = peers[name];
      p.type = (p.opts.type || '').toLowerCase();
      p.host = (p.opts.host || '').toLowerCase();
      p.secret = p.opts.secret || '';
      p.context = p.opts.context || genCtx;
      p.codecs = applyCodecs(genCodecs.slice(), p.codecRules);
      const cid = (p.opts.callerid || '').match(/^\s*"?([^"<]*)"?\s*(?:<([^>]*)>)?/);
      p.cidName = cid && cid[1].trim() ? cid[1].trim() : name;
      p.cidNum = cid && cid[2] ? cid[2].trim() : name;
      if (!p.type) diags.push({ file: 'sip.conf', line: p.line, sev: 'error', msg: `Peer '${name}' has no type`, hint: 'Tambahkan type=friend untuk softphone (bisa memanggil dan dipanggil), atau type=peer untuk trunk.' });
      else if (!['friend', 'peer', 'user'].includes(p.type)) diags.push({ file: 'sip.conf', line: p.optLine.type, sev: 'error', msg: `Unknown type '${p.type}' for peer '${name}'`, hint: 'Nilai type yang benar: friend, peer, atau user.' });
      if (!p.host && p.type !== 'user') diags.push({ file: 'sip.conf', line: p.line, sev: 'warning', msg: `Peer '${name}' has no host`, hint: 'Untuk softphone yang mendaftar sendiri, tulis host=dynamic. Untuk trunk, tulis alamat server penyedia.' });
      if (p.host === 'dynamic' && !p.secret && !p.opts.md5secret) diags.push({ file: 'sip.conf', line: p.line, sev: 'warning', msg: `Peer '${name}' tanpa secret`, hint: 'Tanpa password, siapa pun di jaringan bisa memakai akun ini. Tambahkan secret=...' });
      if (!p.codecs.length) diags.push({ file: 'sip.conf', line: p.line, sev: 'warning', msg: `Peer '${name}' tidak punya codec yang diizinkan`, hint: 'Setelah disallow=all, tambahkan minimal satu allow=..., misalnya allow=ulaw.' });
      if (!p.opts.context && !general.opts.context) diags.push({ file: 'sip.conf', line: p.line, sev: 'notice', msg: `Peer '${name}' memakai context 'default'`, hint: 'Tulis context=... agar panggilan dari akun ini masuk ke context dialplan yang benar.' });
    });
    return { general, genCtx, peers, order, diags, allowguest: /^(yes|true|1)$/i.test(general.opts.allowguest || '') };
  }
  function applyCodecs(list, rules) {
    rules.forEach(r => {
      if (r.codec === 'all') { if (r.allow) CODECS.forEach(c => { if (!list.includes(c)) list.push(c); }); else list.length = 0; }
      else if (r.allow) { if (!list.includes(r.codec)) list.push(r.codec); }
      else { const i = list.indexOf(r.codec); if (i >= 0) list.splice(i, 1); }
    });
    return list;
  }

  function parseExt(text) {
    const diags = [], contexts = {}, ctxOrder = [], general = { static: 'yes', writeprotect: 'no', autofallthrough: 'yes' }, globals = {};
    let sec = null, ctx = null, lastExt = null, lastPrio = 0;
    const lines = text.split(/\r?\n/);
    lines.forEach((raw, idx) => {
      const ln = idx + 1, line = stripComment(raw);
      if (!line) return;
      const m = line.match(/^\[([^\]]*)\]\s*(\(!?\))?\s*$/);
      if (m) {
        sec = m[1].trim(); lastExt = null; lastPrio = 0;
        const low = sec.toLowerCase();
        if (low === 'general' || low === 'globals') { ctx = null; return; }
        if (!sec) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: 'Nama context kosong', hint: 'Tulis nama context di dalam kurung siku, misalnya [internal].' }); ctx = null; return; }
        if (contexts[sec]) ctx = contexts[sec];
        else { ctx = contexts[sec] = { name: sec, line: ln, exts: {}, extOrder: [], includes: [] }; ctxOrder.push(sec); }
        return;
      }
      if (sec === null) { diags.push({ file: 'extensions.conf', line: ln, sev: 'warning', msg: 'Baris di luar context', hint: 'Tulis nama context (misalnya [internal]) sebelum baris ini.' }); return; }
      const low = sec.toLowerCase();
      if (low === 'general') {
        const kv = line.match(/^([A-Za-z_]+)\s*=\s*(.*)$/);
        if (!kv) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: `Baris tidak dikenali di [general]: '${line}'`, hint: 'Format: opsi=nilai, misalnya autofallthrough=yes.' }); return; }
        const k = kv[1].toLowerCase();
        if (!EXT_GENERAL.includes(k)) { const s = suggest(k, EXT_GENERAL); diags.push({ file: 'extensions.conf', line: ln, sev: 'warning', msg: `Unknown option '${k}' in [general]`, hint: s ? `Mungkin maksudnya "${s}"?` : 'Opsi yang umum: static, writeprotect, autofallthrough.' }); }
        general[k] = kv[2].trim().toLowerCase();
        return;
      }
      if (low === 'globals') {
        const kv = line.match(/^([A-Za-z0-9_]+)\s*=>?\s*(.*)$/);
        if (!kv) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: `Baris tidak dikenali di [globals]: '${line}'`, hint: 'Format: NAMA=nilai, misalnya OPERATOR=SIP/101.' }); return; }
        globals[kv[1]] = kv[2].trim();
        return;
      }
      if (!ctx) return;
      const inc = line.match(/^include\s*=>?\s*(\S+)\s*$/i);
      if (inc) { ctx.includes.push({ name: inc[1], line: ln }); return; }
      if (/^(ignorepat|switch|lswitch|eswitch)\s*=>?/i.test(line)) { diags.push({ file: 'extensions.conf', line: ln, sev: 'notice', msg: 'Baris ' + line.split(/\s|=/)[0] + ' diabaikan simulator', hint: 'Fitur ini ada di Asterisk tetapi tidak dipakai dalam materi.' }); return; }
      const em = line.match(/^(exten|same)\s*=>?\s*(.*)$/i);
      if (!em) {
        const kw = line.split(/[\s=]/)[0];
        const s = suggest(kw, ['exten', 'same', 'include']);
        diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: `Baris tidak dikenali: '${line}'`, hint: s ? `Mungkin maksudnya "${s} =>"?` : 'Baris dialplan diawali exten =>, same =>, atau include =>.' });
        return;
      }
      const isSame = em[1].toLowerCase() === 'same';
      const parts = splitArgs(em[2]);
      let ext, prioRaw, appRaw;
      if (isSame) {
        if (!lastExt) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: "Can't use 'same' unless an extension is specified", hint: 'same => hanya boleh dipakai setelah baris exten => di context yang sama.' }); return; }
        ext = lastExt; prioRaw = (parts[0] || '').trim(); appRaw = parts.slice(1).join(',').trim();
      } else {
        ext = (parts[0] || '').trim(); prioRaw = (parts[1] || '').trim(); appRaw = parts.slice(2).join(',').trim();
        if (!ext) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: 'Nomor extension kosong', hint: 'Format: exten => nomor,prioritas,Aplikasi(argumen).' }); return; }
        if (ext.includes('/')) ext = ext.split('/')[0];
        if (ext !== lastExt) lastPrio = 0;
        lastExt = ext;
      }
      const pm = prioRaw.match(/^(\d+|n|hint|s)(?:\(([^)]*)\))?$/i) || prioRaw.match(/^(n)\+(\d+)$/i);
      if (!pm) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: `Invalid priority/label '${prioRaw}' at line ${ln}`, hint: 'Prioritas berupa angka (1, 2, 3...), n (berikutnya), atau n(label). Periksa juga jumlah koma.' }); return; }
      if (pm[1].toLowerCase() === 'hint') return;
      let prio;
      if (/^\d+$/.test(pm[1])) prio = +pm[1];
      else {
        if (lastPrio === 0) { diags.push({ file: 'extensions.conf', line: ln, sev: 'warning', msg: `Can't use 'next' priority on the first entry at line ${ln}!`, hint: 'Baris pertama setiap extension harus prioritas 1, misalnya exten => 101,1,Answer().' }); return; }
        prio = lastPrio + 1;
      }
      const label = pm[2] || null;
      if (!appRaw) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: `No application specified for extension '${ext}' priority ${prio}`, hint: 'Setelah prioritas, tulis aplikasi yang dijalankan, misalnya Answer() atau Dial(SIP/101,20).' }); return; }
      const am = appRaw.match(/^([A-Za-z][A-Za-z0-9_]*)\s*(?:\(([\s\S]*)\)?)?$/);
      if (!am) { diags.push({ file: 'extensions.conf', line: ln, sev: 'error', msg: `Aplikasi tidak bisa dibaca: '${appRaw}'`, hint: 'Format aplikasi: Nama(argumen), misalnya Playback(hello-world).' }); return; }
      const app = am[1];
      let args = '';
      if (appRaw.includes('(')) {
        const open = appRaw.indexOf('(');
        if (!appRaw.trim().endsWith(')')) diags.push({ file: 'extensions.conf', line: ln, sev: 'warning', msg: `Kurung tutup ')' tidak ada pada ${app}`, hint: 'Lengkapi kurung, misalnya Dial(SIP/102,20).' });
        args = appRaw.slice(open + 1).replace(/\)\s*$/, '');
      }
      const appName = APPS.find(a => a.toLowerCase() === app.toLowerCase()) || REAL_APPS.find(a => a.toLowerCase() === app.toLowerCase()) || app;
      if (!APPS.includes(appName) && !REAL_APPS.includes(appName)) {
        const s = suggest(app, APPS);
        diags.push({ file: 'extensions.conf', line: ln, sev: 'warning', msg: `Aplikasi '${app}' tidak dikenal`, hint: `${s ? `Mungkin maksudnya "${s}"? ` : ''}Asterisk baru melaporkannya saat panggilan sampai di baris ini ("No application '${app}' for extension"), lalu memutus panggilan.` });
      } else if (REAL_APPS.includes(appName)) diags.push({ file: 'extensions.conf', line: ln, sev: 'notice', msg: `${appName}() belum didukung simulator`, hint: 'Aplikasi ini ada di Asterisk sungguhan. Di simulator, baris ini dilewati.' });
      if (!ctx.exts[ext]) { ctx.exts[ext] = { name: ext, prios: {}, labels: {}, line: ln }; ctx.extOrder.push(ext); }
      const E = ctx.exts[ext];
      if (E.prios[prio]) { diags.push({ file: 'extensions.conf', line: ln, sev: 'warning', msg: `Unable to register extension '${ext}' priority ${prio} in '${ctx.name}', already in use`, hint: `Prioritas ${prio} untuk extension ${ext} sudah dipakai di baris ${E.prios[prio].line}. Ganti angkanya atau gunakan n.` }); return; }
      E.prios[prio] = { prio, app: appName, args, line: ln, label };
      if (label) {
        if (E.labels[label]) diags.push({ file: 'extensions.conf', line: ln, sev: 'warning', msg: `Label '${label}' dipakai dua kali pada extension ${ext}`, hint: 'Nama label dalam satu extension harus unik.' });
        E.labels[label] = prio;
      }
      lastPrio = prio;
    });
    ctxOrder.forEach(c => {
      const C = contexts[c];
      C.extOrder.forEach(e => {
        const E = C.exts[e];
        if (!E.prios[1]) diags.push({ file: 'extensions.conf', line: E.line, sev: 'warning', msg: `Extension '${e}' di context '${c}' tidak punya prioritas 1`, hint: 'Asterisk selalu mulai dari prioritas 1, jadi extension ini tidak akan pernah berjalan.' });
        if (e.startsWith('_') && !tokenizePattern(e)) diags.push({ file: 'extensions.conf', line: E.line, sev: 'error', msg: `Pattern '${e}' tidak valid`, hint: 'Periksa kurung siku [ ] pada pattern.' });
        if (!e.startsWith('_') && /^[XZN][0-9XZN.]*$/i.test(e) && /[XZN]/i.test(e) && e.length > 1) diags.push({ file: 'extensions.conf', line: E.line, sev: 'warning', msg: `Extension '${e}' ditulis tanpa garis bawah`, hint: `Tanpa _ di depan, '${e}' dianggap nomor literal, bukan pattern. Tulis _${e}.` });
      });
      C.includes.forEach(inc => { if (!contexts[inc.name]) diags.push({ file: 'extensions.conf', line: inc.line, sev: 'warning', msg: `Context '${inc.name}' tidak ditemukan untuk include`, hint: 'Periksa ejaan nama context.' }); });
    });
    return { general, globals, contexts, ctxOrder, diags };
  }

  function parseVm(text) {
    const diags = [], boxes = {};
    let sec = null;
    text.split(/\r?\n/).forEach((raw, idx) => {
      const ln = idx + 1, line = stripComment(raw);
      if (!line) return;
      const m = line.match(/^\[([^\]]+)\]$/);
      if (m) { sec = m[1].trim(); return; }
      if (!sec) { diags.push({ file: 'voicemail.conf', line: ln, sev: 'warning', msg: 'Baris di luar context', hint: 'Tulis [default] di atas daftar kotak suara.' }); return; }
      if (['general', 'zonemessages'].includes(sec.toLowerCase())) return;
      const b = line.match(/^(\S+)\s*=>\s*([^,]*)(?:,([^,]*))?(?:,(.*))?$/);
      if (!b) { diags.push({ file: 'voicemail.conf', line: ln, sev: 'error', msg: `Baris tidak dikenali: '${line}'`, hint: 'Format: nomor => PIN,Nama, misalnya 101 => 1234,Andi.' }); return; }
      boxes[b[1] + '@' + sec] = { box: b[1], ctx: sec, pin: b[2].trim(), name: (b[3] || '').trim(), line: ln };
    });
    return { boxes, diags };
  }

  /* ------------------------------ server ------------------------------ */
  function load(files) {
    const sip = parseSip(files.sip || ''), ext = parseExt(files.ext || ''), vm = parseVm(files.vm || '');
    const diags = [...sip.diags, ...ext.diags, ...vm.diags];
    sip.order.forEach(n => {
      const p = sip.peers[n];
      if (p.type && p.type !== 'peer' && !ext.contexts[p.context]) {
        const s = suggest(p.context, ext.ctxOrder);
        diags.push({ file: 'sip.conf', line: p.optLine.context || p.line, sev: 'warning', msg: `Context '${p.context}' untuk akun ${n} tidak ada di extensions.conf`, hint: `Semua panggilan dari ${n} akan ditolak 404 Not Found.${s ? ` Mungkin maksudnya "${s}"?` : ''}` });
      }
    });
    return { sip, ext, vm, diags, vmCount: {}, chanSeq: 0, regs: {} };
  }

  // Satu jalankan (register atau panggilan) menghasilkan daftar kejadian untuk animasi.
  function Run(server, cols) {
    this.s = server; this.ev = []; this.cols = cols; this.pid = pid();
  }
  Run.prototype.sip = function (from, to, label, cls, note) { this.ev.push({ t: 'sip', from, to, label, cls: cls || 'req', note: note || '' }); };
  Run.prototype.rtp = function (a, b, label) { this.ev.push({ t: 'rtp', from: a, to: b, label }); };
  Run.prototype.cli = function (text, lvl) {
    const pre = lvl === 'warning' ? `WARNING[${this.pid}]: ` : lvl === 'notice' ? `NOTICE[${this.pid}]: ` : lvl === 'error' ? `ERROR[${this.pid}]: ` : '';
    this.ev.push({ t: 'cli', text: pre + text, lvl: lvl || 'verbose' });
  };
  Run.prototype.note = function (text, cls) { this.ev.push({ t: 'note', text, cls: cls || '' }); };

  function register(server, dev) {
    const R = new Run(server, { A: dev.label, S: 'Asterisk ' + SERVER_IP });
    const uri = `'"${dev.user}" <sip:${dev.user}@${dev.server}>'`;
    R.sip('A', 'S', 'REGISTER', 'req', `sip:${dev.server} · user ${dev.user}`);
    if (String(dev.server).trim() !== SERVER_IP) {
      R.sip('A', 'S', 'REGISTER (ulang)', 'lost', 'tidak ada jawaban');
      R.note(`Tidak ada server SIP di ${dev.server}. Softphone menampilkan "Request Timeout (408)". Periksa isian server/domain: alamat Asterisk adalah ${SERVER_IP}.`, 'bad');
      delete server.regs[dev.user];
      return { ok: false, code: 408, text: 'Request Timeout', events: R.ev, cols: R.cols };
    }
    R.sip('S', 'A', '401 Unauthorized', 'prov', 'minta autentikasi (nonce)');
    R.sip('A', 'S', 'REGISTER + Authorization', 'req', 'username & password di-hash');
    const p = server.sip.peers[dev.user];
    const fail = (why, hint) => {
      R.cli(`chan_sip.c: Registration from ${uri} failed for '${dev.ip}:5060' - ${why}`, 'notice');
      R.sip('S', 'A', '403 Forbidden', 'err');
      R.note(hint, 'bad');
      delete server.regs[dev.user];
      return { ok: false, code: 403, text: 'Forbidden', events: R.ev, cols: R.cols };
    };
    if (!p || p.template) return fail('No matching peer found', `Akun [${dev.user}] tidak ada di sip.conf. Periksa username di softphone atau tambahkan akunnya, lalu Muat ulang.`);
    if (!p.type || p.type === 'user') return fail('Peer is not supposed to register', `Akun ${dev.user} harus type=friend agar bisa mendaftar dan dipanggil.`);
    if (p.host !== 'dynamic') return fail('Peer is not supposed to register', `Akun ${dev.user} tidak memakai host=dynamic, jadi Asterisk tidak menerima REGISTER darinya. Untuk softphone, tulis host=dynamic.`);
    if (!aclAllows(p.acl, dev.ip)) return fail('Device does not match ACL', `IP softphone ${dev.ip} ditolak aturan permit/deny akun ${dev.user}. Sesuaikan permit=..., atau pakai perangkat dari jaringan yang diizinkan.`);
    if ((p.secret || '') !== (dev.secret || '')) return fail('Wrong password', `Password di softphone tidak sama dengan secret akun ${dev.user} di sip.conf (huruf besar/kecil dibedakan).`);
    R.sip('S', 'A', '200 OK', 'ok', 'terdaftar, expires 3600');
    R.cli(`    -- Registered SIP '${dev.user}' at ${dev.ip}:5060`);
    R.note(`Akun ${dev.user} terdaftar. Asterisk sekarang tahu ${dev.user} bisa dihubungi di ${dev.ip}.`, 'ok');
    server.regs[dev.user] = { ip: dev.ip, dev };
    return { ok: true, code: 200, text: 'OK', events: R.ev, cols: R.cols };
  }

  function newChan(server, name) { server.chanSeq++; return `SIP/${name}-${hex8(server.chanSeq)}`; }

  function findExt(ext, ctxName, num, seen) {
    seen = seen || {};
    const C = ext.contexts[ctxName];
    if (!C || seen[ctxName]) return null;
    seen[ctxName] = 1;
    if (C.exts[num] && !num.startsWith('_')) return { ctx: ctxName, E: C.exts[num] };
    const cands = C.extOrder.filter(e => e.startsWith('_') && matchPattern(e, num).ok);
    if (cands.length) {
      cands.sort((a, b) => cmpKey(patKey(a), patKey(b)));
      return { ctx: ctxName, E: C.exts[cands[0]] };
    }
    for (const inc of C.includes) { const r = findExt(ext, inc.name, num, seen); if (r) return r; }
    return null;
  }

  function subst(str, ch, server) {
    let s = String(str), guard = 0;
    const getVar = (name) => {
      const fm = name.match(/^([A-Z_]+)\((.*)\)$/i);
      if (fm) {
        const fn = fm[1].toUpperCase(), arg = fm[2].toLowerCase();
        if (fn === 'CALLERID') return arg === 'name' ? ch.cidName : arg === 'all' ? `"${ch.cidName}" <${ch.cidNum}>` : ch.cidNum;
        if (fn === 'LEN') return String(fm[2].length);
        return '';
      }
      const up = name.toUpperCase();
      if (up === 'EXTEN') return ch.exten;
      if (up === 'CONTEXT') return ch.context;
      if (up === 'PRIORITY') return String(ch.prio);
      if (up === 'CHANNEL') return ch.name;
      if (up === 'UNIQUEID') return ch.uid;
      if (up === 'EPOCH') return String(Math.floor(Date.now() / 1000));
      if (ch.vars[name] !== undefined) return ch.vars[name];
      if (server.ext.globals[name] !== undefined) return server.ext.globals[name];
      return '';
    };
    while (guard++ < 20) {
      const m = s.match(/\$\{([^${}]*)\}/);
      if (!m) break;
      let inner = m[1], val;
      const sub = inner.match(/^([^:]+):(-?\d+)(?::(-?\d+))?$/);
      if (sub && !/\(/.test(sub[1])) {
        const v = getVar(sub[1]);
        let off = +sub[2]; if (off < 0) off = Math.max(0, v.length + off);
        val = sub[3] !== undefined ? v.substr(off, +sub[3]) : v.slice(off);
      } else val = getVar(inner);
      s = s.slice(0, m.index) + val + s.slice(m.index + m[0].length);
    }
    guard = 0;
    while (guard++ < 10) {
      const m = s.match(/\$\[([^\[\]]*)\]/);
      if (!m) break;
      s = s.slice(0, m.index) + evalExpr(m[1]) + s.slice(m.index + m[0].length);
    }
    return s;
  }
  // Ekspresi $[...] sederhana: perbandingan, aritmatika, & | !
  function evalExpr(src) {
    const toks = [];
    const re = /\s*("(?:[^"]*)"|<=|>=|!=|=~|[=<>+\-*/%&|!()]|[^\s=<>+\-*/%&|!()"]+)/g;
    let m;
    while ((m = re.exec(src))) toks.push(m[1]);
    let i = 0;
    const val = t => t === undefined ? '' : t.startsWith('"') ? t.slice(1, -1) : t;
    const num = v => /^-?\d+(\.\d+)?$/.test(v) ? +v : null;
    function prim() { const t = toks[i++]; if (t === '(') { const v = or(); i++; return v; } if (t === '!') { const v = prim(); return (v === '' || v === '0') ? '1' : '0'; } return val(t); }
    function mul() { let a = prim(); while (['*', '/', '%'].includes(toks[i])) { const op = toks[i++], b = prim(); const x = num(a), y = num(b); a = String(x === null || y === null ? 0 : op === '*' ? x * y : op === '/' ? (y ? Math.trunc(x / y) : 0) : x % y); } return a; }
    function add() { let a = mul(); while (['+', '-'].includes(toks[i])) { const op = toks[i++], b = mul(); const x = num(a) || 0, y = num(b) || 0; a = String(op === '+' ? x + y : x - y); } return a; }
    function cmp() {
      let a = add();
      while (['=', '!=', '<', '>', '<=', '>='].includes(toks[i])) {
        const op = toks[i++], b = add(); const x = num(a), y = num(b);
        const c = x !== null && y !== null ? (x < y ? -1 : x > y ? 1 : 0) : (a < b ? -1 : a > b ? 1 : 0);
        a = ({ '=': c === 0, '!=': c !== 0, '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0 }[op]) ? '1' : '0';
      }
      return a;
    }
    function and() { let a = cmp(); while (toks[i] === '&') { i++; const b = cmp(); a = (a !== '' && a !== '0' && b !== '' && b !== '0') ? a : '0'; } return a; }
    function or() { let a = and(); while (toks[i] === '|') { i++; const b = and(); a = (a !== '' && a !== '0') ? a : b; } return a; }
    try { return or(); } catch (e) { return ''; }
  }

  const truthy = v => { v = String(v).trim(); return v !== '' && v !== '0'; };
  const sipCause = { 16: '603 Declined', 17: '486 Busy Here', 19: '480 Temporarily Unavailable', 20: '480 Temporarily Unavailable', 34: '503 Service Unavailable', 1: '404 Not Found', 58: '488 Not Acceptable Here' };

  // Menjalankan panggilan dari perangkat `dev` ke nomor `num`.
  // opts.answer: 'answer' | 'busy' | 'noanswer' (perilaku telepon tujuan); opts.dtmf: digit yang ditekan saat menu.
  function call(server, dev, num, opts) {
    opts = opts || {};
    const R = new Run(server, { A: dev.label, S: 'Asterisk', B: null });
    num = String(num).trim();
    const reg = server.regs[dev.user];
    const out = (status, extra) => Object.assign({ status, events: R.ev, cols: R.cols }, extra || {});
    if (!reg) {
      R.note(`${dev.label} belum terdaftar ke server. Tekan Daftar pada softphone terlebih dahulu.`, 'bad');
      return out('notreg', { code: 0, text: 'Belum terdaftar' });
    }
    if (!num) { R.note('Nomor tujuan masih kosong.', 'bad'); return out('empty', { code: 0, text: 'Nomor kosong' }); }
    const p = server.sip.peers[dev.user];
    R.sip('A', 'S', `INVITE sip:${num}@${SERVER_IP}`, 'req', 'SDP: ' + dev.codecs.join(', '));
    R.sip('S', 'A', '407 Proxy Authentication Required', 'prov', 'minta autentikasi');
    R.sip('A', 'S', 'ACK', 'req');
    R.sip('A', 'S', 'INVITE + Proxy-Authorization', 'req');
    if (!p) {
      R.sip('S', 'A', '403 Forbidden', 'err');
      R.note(`Akun ${dev.user} sudah tidak ada di sip.conf (mungkin dihapus lalu dimuat ulang).`, 'bad');
      return out('fail', { code: 403, text: 'Forbidden' });
    }
    if (!aclAllows(p.acl, dev.ip)) {
      R.cli(`chan_sip.c: Failed to authenticate device "${p.cidName}" <sip:${dev.user}@${SERVER_IP}> for INVITE, code = -1`, 'notice');
      R.sip('S', 'A', '403 Forbidden', 'err');
      R.note(`IP ${dev.ip} ditolak aturan permit/deny akun ${dev.user}.`, 'bad');
      return out('fail', { code: 403, text: 'Forbidden' });
    }
    const common = dev.codecs.filter(c => p.codecs.includes(c));
    if (!common.length) {
      R.sip('S', 'A', '100 Trying', 'prov');
      R.cli('chan_sip.c: No compatible codecs, not accepting this offer!', 'notice');
      R.sip('S', 'A', '488 Not Acceptable Here', 'err', 'codec tidak cocok');
      R.sip('A', 'S', 'ACK', 'req');
      R.note(`Codec softphone (${dev.codecs.join(', ')}) tidak ada yang diizinkan akun ${dev.user} (${p.codecs.join(', ') || 'kosong'}). Samakan pengaturan allow= di sip.conf dengan codec softphone.`, 'bad');
      return out('fail', { code: 488, text: 'Not Acceptable Here', reason: 'codec' });
    }
    const codec = common[0];
    const ctxName = p.context;
    const found = findExt(server.ext, ctxName, num);
    if (!found) {
      R.cli(`chan_sip.c: Call from '${dev.user}' (${dev.ip}:5060) to extension '${num}' rejected because extension not found in context '${ctxName}'.`, 'notice');
      R.sip('S', 'A', '404 Not Found', 'err');
      R.sip('A', 'S', 'ACK', 'req');
      R.note(server.ext.contexts[ctxName]
        ? `Nomor ${num} tidak ada di context [${ctxName}] (tempat akun ${dev.user} memanggil). Tambahkan extension atau pattern yang cocok, lalu Muat ulang.`
        : `Context [${ctxName}] milik akun ${dev.user} tidak ada di extensions.conf. Samakan nama context di sip.conf dan extensions.conf.`, 'bad');
      return out('fail', { code: 404, text: 'Not Found', reason: 'noext' });
    }
    R.sip('S', 'A', '100 Trying', 'prov');
    R.cli(`  == Using SIP RTP CoS mark 5`);
    const ch = { name: newChan(server, dev.user), uid: String(Date.now()).slice(-10) + '.' + server.chanSeq, exten: num, context: found.ctx, prio: 1,
      vars: {}, cidName: p.cidName, cidNum: p.cidNum, answered: false, codec, bridged: null, cause: 16, dtmf: String(opts.dtmf || '').replace(/[^0-9*#]/g, ''), log: {} };
    const res = { vm: null, played: [], dialstatus: '', answeredBy: null, echo: false, conf: null };
    const answer = () => {
      if (ch.answered) return;
      ch.answered = true;
      R.sip('S', 'A', '200 OK', 'ok', 'SDP: ' + codec);
      R.sip('A', 'S', 'ACK', 'req');
      R.rtp('A', 'S', `RTP ${codec} (suara)`);
    };
    const hangupCaller = () => {
      if (ch.answered) { R.sip('A', 'S', 'BYE', 'req', 'penelepon menutup'); R.sip('S', 'A', '200 OK', 'ok'); }
      else { const c = sipCause[ch.cause] || '603 Declined'; R.sip('S', 'A', c, 'err'); R.sip('A', 'S', 'ACK', 'req'); }
    };

    let steps = 0, cur = { ctx: found.ctx, E: found.E, prio: 1 }, ended = false, endHow = '';
    const spawnExit = () => R.cli(`  == Spawn extension (${cur.ctx}, ${ch.exten}, ${cur.prio}) exited non-zero on '${ch.name}'`);
    const gotoTarget = (spec) => {
      const parts = splitArgs(spec).map(x => x.trim()).filter(x => x !== '');
      let c = cur.ctx, e = ch.exten, pr;
      if (parts.length === 1) pr = parts[0];
      else if (parts.length === 2) { e = parts[0]; pr = parts[1]; }
      else { c = parts[0]; e = parts[1]; pr = parts[2]; }
      const f = (e === ch.exten && c === cur.ctx) ? { ctx: cur.ctx, E: cur.E } : findExt(server.ext, c, e);
      if (!f) { R.cli(`pbx.c: Cannot find extension context '${c}'`, 'warning'); return null; }
      let pn = /^\d+$/.test(pr) ? +pr : f.E.labels[pr];
      if (!pn) { R.cli(`pbx.c: Priority '${pr}' must be a number > 0, or valid label`, 'warning'); R.note(`Label atau prioritas "${pr}" tidak ditemukan di extension ${f.E.name}. Periksa ejaan label n(...).`, 'bad'); return null; }
      return { ctx: f.ctx, E: f.E, prio: pn, exten: e };
    };
    const jump = (t) => { cur = { ctx: t.ctx, E: t.E, prio: t.prio }; ch.context = t.ctx; if (t.exten) ch.exten = t.exten; };
    const handleDigits = (timeoutSec) => {
      if (ch.dtmf) {
        const d = ch.dtmf[0]; ch.dtmf = ch.dtmf.slice(1);
        R.note(`Penelepon menekan ${d}.`);
        const f = findExt(server.ext, cur.ctx, d);
        if (f) { jump({ ctx: f.ctx, E: f.E, prio: 1, exten: d }); return 'jump'; }
        const inv = server.ext.contexts[cur.ctx] && server.ext.contexts[cur.ctx].exts.i;
        R.cli(`    -- Invalid extension '${d}' in context '${cur.ctx}' on ${ch.name}`);
        if (inv) { jump({ ctx: cur.ctx, E: inv, prio: 1, exten: 'i' }); return 'jump'; }
        R.note(`Digit ${d} tidak punya extension di context [${cur.ctx}] dan tidak ada extension i (invalid).`, 'bad');
        return 'hangup';
      }
      if (timeoutSec === null) return 'next';
      R.cli(`    -- Timeout on ${ch.name}, continuing...`);
      const t = server.ext.contexts[cur.ctx] && server.ext.contexts[cur.ctx].exts.t;
      if (timeoutSec !== null && t) { jump({ ctx: cur.ctx, E: t, prio: 1, exten: 't' }); return 'jump'; }
      if (timeoutSec !== null) { R.note('Tidak ada digit yang ditekan dan tidak ada extension t (timeout), panggilan diputus.'); return 'hangup'; }
      return 'next';
    };

    while (!ended && steps++ < 120) {
      const P = cur.E.prios[cur.prio];
      ch.prio = cur.prio;
      if (!P) {
        if (server.ext.general.autofallthrough !== 'no') {
          R.cli(`  == Auto fallthrough, channel '${ch.name}' status is '${res.dialstatus || 'UNKNOWN'}'`);
          if (cur.prio === 1) R.note(`Extension ${cur.E.name} tidak punya prioritas 1.`, 'bad');
        } else R.note('autofallthrough=no: Asterisk menunggu tanpa batas sampai penelepon menutup.');
        ended = true; endHow = 'fall'; break;
      }
      const args = subst(P.args, ch, server);
      R.cli(`    -- Executing [${ch.exten}@${cur.ctx}:${cur.prio}] ${P.app}("${ch.name}", "${args}") in new stack`);
      const A = P.app;
      const a = splitArgs(args).map(x => x.trim());
      let next = 'next';
      if (!APPS.includes(A)) {
        if (REAL_APPS.includes(A)) { R.note(`${A}() dilewati (belum didukung simulator).`); }
        else {
          R.cli(`pbx.c: No application '${A}' for extension (${cur.ctx}, ${ch.exten}, ${cur.prio})`, 'warning');
          R.note(`Aplikasi "${A}" tidak ada di Asterisk${suggest(A, APPS) ? ` (maksudnya ${suggest(A, APPS)}?)` : ''}. Panggilan langsung diputus.`, 'bad');
          ch.cause = 16; spawnExit(); ended = true; endHow = 'badapp'; break;
        }
      } else if (A === 'NoOp' || A === 'Verbose') {
        if (A === 'Verbose') R.cli(`    ${a.length > 1 ? a.slice(1).join(',') : a[0]}`);
      } else if (A === 'Answer') answer();
      else if (A === 'Ringing') R.sip('S', 'A', '180 Ringing', 'prov');
      else if (A === 'Progress') R.sip('S', 'A', '183 Session Progress', 'prov');
      else if (A === 'Wait') R.note(`Menunggu ${a[0] || 0} detik.`);
      else if (A === 'Set') {
        const eq = args.indexOf('=');
        if (eq < 0) R.cli('pbx.c: Set requires an \'=\' to be a valid assignment.', 'warning');
        else {
          const k = args.slice(0, eq).trim().replace(/^_+/, ''), v = args.slice(eq + 1).trim();
          if (/^CALLERID\(name\)$/i.test(k)) ch.cidName = v;
          else if (/^CALLERID\(num\)$/i.test(k)) ch.cidNum = v;
          else ch.vars[k] = v;
        }
      } else if (A === 'Playback' || A === 'Background') {
        const noans = /noanswer/.test(a[1] || '');
        if (!noans) answer();
        (a[0] || '').split('&').filter(Boolean).forEach(f => {
          if (SOUNDS.includes(f) || /^digits\//.test(f) || /^custom\//.test(f)) { R.cli(`    -- <${ch.name}> Playing '${f}.gsm' (language 'en')`); res.played.push(f); }
          else { R.cli(`file.c: File ${f} does not exist in any format`, 'warning'); R.cli(`file.c: Unable to open ${f} (format (${codec})): No such file or directory`, 'warning'); R.note(`File suara "${f}" tidak ada. Contoh file bawaan: hello-world, demo-congrats, vm-goodbye, beep.`, 'bad'); }
        });
        if (A === 'Background') { const r = handleDigits(null); if (r === 'jump') continue; if (r === 'hangup') { ended = true; endHow = 'hangup'; break; } }
      } else if (A === 'WaitExten') {
        const r = handleDigits(a[0] ? +a[0] : 10);
        if (r === 'jump') continue;
        if (r === 'hangup') { ended = true; endHow = 'hangup'; break; }
      } else if (A === 'Read') {
        const v = a[0] || 'DIGIT', max = +(a[2] || 1) || 1;
        answer();
        ch.vars[v] = ch.dtmf.slice(0, max); ch.dtmf = ch.dtmf.slice(max);
        R.cli(`    -- User entered '${ch.vars[v]}'`);
      } else if (A === 'SayDigits' || A === 'SayNumber') {
        answer();
        String(a[0] || '').split('').filter(c => /[0-9]/.test(c)).forEach(d => R.cli(`    -- <${ch.name}> Playing 'digits/${d}.gsm' (language 'en')`));
      } else if (A === 'Echo') {
        answer(); res.echo = true;
        R.note('Echo test: suara penelepon dipantulkan kembali. Berguna untuk menguji mikrofon, speaker, dan delay jaringan.', 'ok');
        hangupCaller(); spawnExit(); ended = true; endHow = 'echo'; break;
      } else if (A === 'ConfBridge' || A === 'MeetMe') {
        answer(); res.conf = a[0] || '1';
        R.cli(`    -- <${ch.name}> Playing 'conf-onlyperson.gsm' (language 'en')`);
        R.note(`Penelepon masuk ruang konferensi ${res.conf} dan menunggu peserta lain.`, 'ok');
        hangupCaller(); spawnExit(); ended = true; endHow = 'conf'; break;
      } else if (A === 'Busy') {
        ch.cause = 17; R.sip('S', 'A', '486 Busy Here', 'err'); R.sip('A', 'S', 'ACK', 'req'); ended = true; endHow = 'busy'; res.sentFinal = true; break;
      } else if (A === 'Congestion') {
        ch.cause = 34; R.sip('S', 'A', '503 Service Unavailable', 'err'); R.sip('A', 'S', 'ACK', 'req'); ended = true; endHow = 'congestion'; res.sentFinal = true; break;
      } else if (A === 'Hangup') {
        if (a[0] && /^\d+$/.test(a[0])) ch.cause = +a[0];
        spawnExit(); ended = true; endHow = 'hangup'; break;
      } else if (A === 'Goto') {
        const t = gotoTarget(args);
        if (!t) { spawnExit(); ended = true; endHow = 'badgoto'; break; }
        R.cli(`    -- Goto (${t.ctx},${t.exten || ch.exten},${t.prio})`);
        jump(t); continue;
      } else if (A === 'GotoIf') {
        const q = args.indexOf('?');
        if (q < 0) { R.cli('pbx.c: Ignoring, since there is no question mark', 'warning'); }
        else {
          const cond = args.slice(0, q), rest = args.slice(q + 1);
          const colon = rest.indexOf(':');
          const yes = colon >= 0 ? rest.slice(0, colon) : rest, no = colon >= 0 ? rest.slice(colon + 1) : '';
          const pick = truthy(cond) ? yes : no;
          R.note(`Kondisi "${cond.trim()}" bernilai ${truthy(cond) ? 'benar' : 'salah'}${pick ? `, lompat ke ${pick}` : ', lanjut ke prioritas berikutnya'}.`);
          if (pick.trim()) {
            const t = gotoTarget(pick.trim());
            if (!t) { spawnExit(); ended = true; endHow = 'badgoto'; break; }
            R.cli(`    -- Goto (${t.ctx},${t.exten || ch.exten},${t.prio})`);
            jump(t); continue;
          }
        }
      } else if (A === 'VoiceMail' || A === 'VoiceMailMain') {
        let spec = a[0] || '';
        if (A === 'VoiceMailMain') spec = spec.replace(/^s/, '');
        const [box, vctx] = spec.split('@');
        const key = (box || '') + '@' + (vctx || 'default');
        const B = server.vm.boxes[key];
        if (!B) {
          R.cli(`app_voicemail.c: No entry in voicemail config file for '${box || '(kosong)'}'`, 'warning');
          R.note(`Kotak suara ${key} tidak ada di voicemail.conf. Tambahkan baris "${box || '101'} => 1234,Nama" di bawah [${vctx || 'default'}].`, 'bad');
          ch.vars.VMSTATUS = 'FAILED';
        } else {
          answer();
          if (A === 'VoiceMail') {
            const greet = /b/.test(a[1] || '') ? 'vm-busy' : 'vm-unavail';
            R.cli(`    -- <${ch.name}> Playing '${greet}.gsm' (language 'en')`);
            R.cli(`    -- <${ch.name}> Playing 'beep.gsm' (language 'en')`);
            R.cli(`    -- Recording the message`);
            server.vmCount[key] = (server.vmCount[key] || 0) + 1;
            res.vm = { box: key, greet: greet === 'vm-busy' ? 'busy' : 'unavail' };
            R.note(`Penelepon meninggalkan pesan di kotak suara ${key} (sapaan "${greet === 'vm-busy' ? 'sedang sibuk' : 'tidak dapat dihubungi'}"). Total pesan baru: ${server.vmCount[key]}.`, 'ok');
            ch.vars.VMSTATUS = 'SUCCESS';
            hangupCaller(); spawnExit(); ended = true; endHow = 'vm'; break;
          } else {
            R.cli(`    -- <${ch.name}> Playing 'vm-login.gsm' (language 'en')`);
            R.note(`Penelepon memasukkan PIN ${B.pin.replace(/./g, '•')} dan mendengar ${server.vmCount[key] || 0} pesan baru di kotak ${key}.`, 'ok');
            res.vmMain = key;
            hangupCaller(); spawnExit(); ended = true; endHow = 'vmmain'; break;
          }
        }
      } else if (A === 'Dial') {
        const r = doDial(server, R, ch, a, opts, res, answer);
        if (r === 'bridged') { spawnExit(); ended = true; endHow = 'bridged'; break; }
      }
      if (next === 'next') cur.prio++;
    }
    if (steps >= 120) { R.note('Dialplan berputar terus (lebih dari 120 langkah). Periksa Goto yang saling menunjuk.', 'bad'); }
    if (endHow && !['bridged', 'echo', 'conf', 'vm', 'vmmain', 'busy', 'congestion'].includes(endHow)) hangupCaller();
    // extension h dijalankan setelah panggilan berakhir
    const hctx = server.ext.contexts[found.ctx];
    if (hctx && hctx.exts.h && hctx.exts.h.prios[1]) {
      let pr = 1, n = 0;
      while (hctx.exts.h.prios[pr] && n++ < 20) { const P = hctx.exts.h.prios[pr]; R.cli(`    -- Executing [h@${found.ctx}:${pr}] ${P.app}("${ch.name}", "${subst(P.args, ch, server)}") in new stack`); if (P.app === 'Hangup') break; pr++; }
    }
    const status = res.answeredBy ? 'connected' : res.vm ? 'voicemail' : (res.vmMain || res.echo || res.conf || ch.answered) ? 'served' : 'ended';
    const finalCode = res.answeredBy || ch.answered ? 200 : parseInt(sipCause[ch.cause] || '603', 10);
    return out(status, { code: finalCode, text: res.answeredBy || ch.answered ? 'OK' : (sipCause[ch.cause] || '603 Declined').replace(/^\d+ /, ''),
      dialstatus: res.dialstatus, answeredBy: res.answeredBy, vm: res.vm, codec, channel: ch.name, played: res.played, echo: res.echo, conf: res.conf, endHow });
  }

  function doDial(server, R, ch, a, opts, res, answerCaller) {
    const targets = (a[0] || '').split('&').map(s => s.trim()).filter(Boolean);
    const timeout = a[1] ? +a[1] : 0;
    if (!targets.length) { R.cli('app_dial.c: Dial requires an argument (technology/resource)', 'warning'); res.dialstatus = 'CHANUNAVAIL'; ch.vars.DIALSTATUS = 'CHANUNAVAIL'; return 'fail'; }
    const ok = [];
    targets.forEach(t => {
      const m = t.match(/^(SIP|PJSIP|IAX2|DAHDI|Local)\/([^/]+)(?:\/(.*))?$/i);
      if (!m) { R.cli(`app_dial.c: Dial argument takes format (technology/resource)`, 'warning'); R.note(`Target "${t}" salah format. Contoh: SIP/102 atau SIP/trunk-pstn/${'${EXTEN:1}'}.`, 'bad'); return; }
      const tech = m[1].toUpperCase(), name = m[2], numOut = m[3];
      if (tech !== 'SIP') {
        R.cli(`app_dial.c: Unable to create channel of type '${m[1]}' (cause 66 - Channel not implemented)`, 'warning');
        R.note(tech === 'PJSIP' ? 'Simulator ini memakai chan_sip, jadi tulis SIP/... (PJSIP/... dipakai di Asterisk 21 ke atas dengan pjsip.conf).' : `Teknologi ${m[1]} tidak tersedia di simulator.`, 'bad');
        return;
      }
      const p = server.sip.peers[name];
      if (!p || p.template) {
        R.cli(`chan_sip.c: Unable to find peer '${name}'`, 'notice');
        R.cli(`app_dial.c: Unable to create channel of type 'SIP' (cause 3 - No route to destination)`, 'warning');
        R.note(`Akun SIP "${name}" tidak ada di sip.conf.${suggest(name, server.sip.order) ? ` Mungkin maksudnya ${suggest(name, server.sip.order)}?` : ''}`, 'bad');
        return;
      }
      if (p.host === 'dynamic') {
        const rg = server.regs[name];
        if (!rg) {
          R.cli(`app_dial.c: Unable to create channel of type 'SIP' (cause 20 - Subscriber absent)`, 'warning');
          R.note(`Akun ${name} belum terdaftar (softphone-nya mati atau belum login), jadi tidak bisa dihubungi.`, 'bad');
          return;
        }
        const dcodecs = rg.dev.codecs.filter(c => p.codecs.includes(c));
        if (!dcodecs.length) { R.cli(`chan_sip.c: No compatible codecs for peer '${name}'`, 'notice'); R.note(`Codec softphone ${name} tidak cocok dengan allow= akunnya.`, 'bad'); return; }
        const bc = dcodecs.includes(ch.codec) ? ch.codec : dcodecs[0];
        if (bc !== ch.codec && !(TRANSCODE.includes(bc) && TRANSCODE.includes(ch.codec))) {
          R.cli(`channel.c: No path to translate from ${ch.name} to SIP/${name}`, 'warning');
          R.note(`Codec ${ch.codec} dan ${bc} tidak bisa diterjemahkan (g729 butuh lisensi). Samakan codec kedua akun.`, 'bad');
          return;
        }
        ok.push({ name, label: rg.dev.label + ' (' + name + ')', codec: bc, trunk: false, peer: p, dev: rg.dev });
      } else if (p.host) {
        if (!numOut && p.type === 'peer') R.note(`Dial ke trunk ${name} tanpa nomor tujuan. Biasanya ditulis SIP/${name}/\${EXTEN}.`, 'bad');
        ok.push({ name, label: 'Penyedia SIP ' + p.host, codec: p.codecs.includes(ch.codec) ? ch.codec : p.codecs[0], trunk: true, numOut: numOut || '', peer: p });
      } else {
        R.cli(`app_dial.c: Unable to create channel of type 'SIP' (cause 3 - No route to destination)`, 'warning');
        R.note(`Akun ${name} tidak punya host, jadi Asterisk tidak tahu ke mana harus menghubungi.`, 'bad');
      }
    });
    if (!ok.length) {
      R.cli(`  == Everyone is busy/congested at this time (${targets.length}:0/0/${targets.length})`);
      res.dialstatus = ch.vars.DIALSTATUS = 'CHANUNAVAIL'; ch.cause = 20;
      return 'fail';
    }
    R.cols.B = ok.length === 1 ? ok[0].label : ok.map(o => o.name).join(' & ');
    ok.forEach(o => {
      const chB = newChan(server, o.name);
      o.chan = chB;
      R.sip('S', 'B', `INVITE sip:${o.trunk ? (o.numOut || '?') + '@' + o.peer.host : o.name + '@' + o.dev.ip}`, 'req', 'SDP: ' + o.codec);
      R.cli(`    -- Called SIP/${o.name}${o.trunk && o.numOut ? '/' + o.numOut : ''}`);
      R.sip('B', 'S', '100 Trying', 'prov');
    });
    const beh = opts.answer || 'answer';
    if (beh === 'busy') {
      ok.forEach(o => { R.sip('B', 'S', '486 Busy Here', 'err'); R.sip('S', 'B', 'ACK', 'req'); R.cli(`    -- ${o.chan} is busy`); });
      R.cli(`  == Everyone is busy/congested at this time (${ok.length}:${ok.length}/0/0)`);
      res.dialstatus = ch.vars.DIALSTATUS = 'BUSY'; ch.cause = 17;
      R.note('Penerima menolak panggilan (sibuk). DIALSTATUS = BUSY, dialplan lanjut ke prioritas berikutnya.');
      return 'fail';
    }
    ok.forEach(o => { R.sip('B', 'S', '180 Ringing', 'prov'); R.cli(`    -- ${o.chan} is ringing`); });
    if (!ch.answered) R.sip('S', 'A', '180 Ringing', 'prov', 'nada dering');
    if (beh === 'noanswer') {
      if (!timeout) {
        R.note('Dial tanpa batas waktu: telepon berdering terus sampai penelepon menyerah dan menutup (CANCEL).');
        R.sip('A', 'S', 'CANCEL', 'req', 'penelepon menyerah');
        R.sip('S', 'A', '200 OK', 'ok');
        ok.forEach(() => { R.sip('S', 'B', 'CANCEL', 'req'); R.sip('B', 'S', '200 OK', 'ok'); R.sip('B', 'S', '487 Request Terminated', 'err'); R.sip('S', 'B', 'ACK', 'req'); });
        R.sip('S', 'A', '487 Request Terminated', 'err'); R.sip('A', 'S', 'ACK', 'req');
        res.dialstatus = ch.vars.DIALSTATUS = 'CANCEL';
        res.sentFinal = true;
        return 'bridged';
      }
      R.cli(`    -- Nobody picked up in ${timeout * 1000} ms`);
      ok.forEach(() => { R.sip('S', 'B', 'CANCEL', 'req', `${timeout} detik habis`); R.sip('B', 'S', '200 OK', 'ok'); R.sip('B', 'S', '487 Request Terminated', 'err'); R.sip('S', 'B', 'ACK', 'req'); });
      res.dialstatus = ch.vars.DIALSTATUS = 'NOANSWER'; ch.cause = 19;
      R.note(`Tidak diangkat dalam ${timeout} detik. DIALSTATUS = NOANSWER, dialplan lanjut ke prioritas berikutnya.`);
      return 'fail';
    }
    const w = ok[0];
    R.sip('B', 'S', '200 OK', 'ok', 'SDP: ' + w.codec);
    R.sip('S', 'B', 'ACK', 'req');
    R.cli(`    -- ${w.chan} answered ${ch.name}`);
    ok.slice(1).forEach(() => { R.sip('S', 'B', 'CANCEL', 'req', 'sudah diangkat perangkat lain'); });
    if (!ch.answered) { R.sip('S', 'A', '200 OK', 'ok', 'SDP: ' + ch.codec); R.sip('A', 'S', 'ACK', 'req'); ch.answered = true; }
    R.cli(`    -- Channel ${w.chan} joined 'simple_bridge' basic-bridge <${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 6)}>`);
    R.cli(`    -- Channel ${ch.name} joined 'simple_bridge' basic-bridge`);
    R.rtp('A', 'B', w.codec === ch.codec ? `RTP ${ch.codec} (percakapan)` : `RTP ${ch.codec} ⇄ ${w.codec} (transcoding)`);
    if (w.codec !== ch.codec) R.note(`Codec berbeda (${ch.codec} dan ${w.codec}): Asterisk menerjemahkan suara di tengah (transcoding), sehingga beban server bertambah.`);
    R.sip('A', 'S', 'BYE', 'req', 'penelepon menutup');
    R.sip('S', 'A', '200 OK', 'ok');
    R.sip('S', 'B', 'BYE', 'req');
    R.sip('B', 'S', '200 OK', 'ok');
    R.cli(`    -- Channel ${w.chan} left 'simple_bridge' basic-bridge`);
    res.dialstatus = ch.vars.DIALSTATUS = 'ANSWER';
    res.answeredBy = w.trunk ? 'trunk:' + w.name : w.name;
    R.note(w.trunk ? `Panggilan keluar lewat trunk ${w.name} ke nomor ${w.numOut} tersambung (simulasi jaringan PSTN).` : `Tersambung dengan ${w.label}.`, 'ok');
    return 'bridged';
  }

  /* ------------------------------ CLI ------------------------------ */
  function cli(server, cmd) {
    const c = cmd.trim().replace(/\s+/g, ' ');
    const lc = c.toLowerCase();
    const pad = (s, n) => String(s).padEnd(n);
    if (!c) return '';
    if (lc === 'help' || lc === '?') return [
      'Perintah yang tersedia di simulator:',
      '  sip show peers          daftar akun SIP dan statusnya',
      '  sip show peer <nama>    rincian satu akun',
      '  dialplan show [context] isi dialplan',
      '  voicemail show users    daftar kotak suara',
      '  core show channels      panggilan yang sedang aktif',
      '  sip reload / dialplan reload / core reload'].join('\n');
    if (lc === 'sip show peers') {
      const rows = server.sip.order.filter(n => !server.sip.peers[n].template).map(n => {
        const p = server.sip.peers[n], rg = server.regs[n];
        const host = rg ? rg.ip : p.host === 'dynamic' ? '(Unspecified)' : (p.host || '(Unspecified)');
        return pad(n + (rg ? '/' + n : ''), 26) + pad(host, 18) + pad(p.host === 'dynamic' ? 'D' : '', 4) + pad(p.acl.length ? 'A' : '', 4) + pad(rg ? 5060 : 0, 7) + (p.host === 'dynamic' ? (rg ? 'OK (Unmonitored)' : 'UNKNOWN') : 'Unmonitored');
      });
      const on = rows.filter((_, i) => server.regs[server.sip.order[i]]).length;
      return [pad('Name/username', 26) + pad('Host', 18) + pad('Dyn', 4) + pad('ACL', 4) + pad('Port', 7) + 'Status', ...rows,
        `${rows.length} sip peers [Monitored: 0 online, 0 offline Unmonitored: ${Object.keys(server.regs).length} online, ${rows.length - Object.keys(server.regs).length} offline]`].join('\n');
    }
    let m = lc.match(/^sip show peer (\S+)$/);
    if (m) {
      const name = c.split(' ')[3], p = server.sip.peers[name];
      if (!p) return `Peer ${name} not found.`;
      const rg = server.regs[name];
      return [`  * Name       : ${name}`, `  Secret       : ${p.secret ? '<Set>' : '<Not set>'}`, `  Context      : ${p.context}`, `  Callerid     : "${p.cidName}" <${p.cidNum}>`,
        `  Type         : ${p.type || '(tidak diisi)'}`, `  Dynamic      : ${p.host === 'dynamic' ? 'Yes' : 'No'}`, `  ACL          : ${p.acl.length ? 'Yes (' + p.acl.map(r => (r.permit ? 'permit ' : 'deny ') + r.text).join(', ') + ')' : 'No'}`,
        `  Addr->IP     : ${rg ? rg.ip + ':5060' : '(null)'}`, `  Codecs       : (${p.codecs.join('|') || 'nothing'})`, `  Status       : ${rg ? 'OK' : p.host === 'dynamic' ? 'UNKNOWN' : 'Unmonitored'}`].join('\n');
    }
    m = c.match(/^dialplan show(?: (\S+))?$/i);
    if (m) {
      const want = m[1] ? m[1].replace(/^@/, '') : null;
      const list = want ? [want] : server.ext.ctxOrder;
      let out = [], ne = 0, np = 0, nc = 0;
      for (const cn of list) {
        const C = server.ext.contexts[cn];
        if (!C) { out.push(`There is no existence of '${cn}' context`); continue; }
        nc++;
        out.push(`[ Context '${cn}' created by 'pbx_config' ]`);
        C.extOrder.forEach(e => {
          const E = C.exts[e]; ne++;
          Object.keys(E.prios).map(Number).sort((x, y) => x - y).forEach((pr, i) => {
            np++;
            const P = E.prios[pr];
            const left = i === 0 ? pad(`  '${e}' =>`, 20) : pad('', 20);
            out.push(left + pad(`${pr}.${P.label ? ' (' + P.label + ')' : ''} ${P.app}(${P.args})`, 44) + `[extensions.conf:${P.line}]`);
          });
        });
        C.includes.forEach(inc => out.push(pad('  Include =>', 20) + pad(`'${inc.name}'`, 44) + '[pbx_config]'));
        out.push('');
      }
      out.push(`-= ${ne} extensions (${np} priorities) in ${nc} context${nc === 1 ? '' : 's'}. =-`);
      return out.join('\n');
    }
    if (lc === 'voicemail show users') {
      const rows = Object.values(server.vm.boxes).map(b => pad(b.ctx, 11) + pad(b.box, 8) + pad(b.name || '-', 20) + (server.vmCount[b.box + '@' + b.ctx] || 0));
      return [pad('Context', 11) + pad('Mbox', 8) + pad('User', 20) + 'NewMsg', ...rows, `${rows.length} voicemail users configured.`].join('\n');
    }
    if (lc === 'core show channels') return 'Channel              Location             State   Application(Data)\n0 active channels\n0 active calls\n(Simulator menjalankan satu panggilan sekaligus; lihat Diagram SIP untuk panggilan terakhir.)';
    if (lc === 'sip reload' || lc === 'dialplan reload' || lc === 'core reload' || lc === 'reload' || lc === 'module reload') return '__RELOAD__';
    if (lc === 'core show version') return 'Asterisk (simulator pembelajaran) built for web, mengikuti perilaku chan_sip';
    if (/^(pjsip )/.test(lc)) return 'No such command \'' + c + '\' (simulator ini memakai chan_sip; coba sip show peers)';
    const s = suggest(lc, ['sip show peers', 'dialplan show', 'core show channels', 'sip reload', 'dialplan reload', 'voicemail show users', 'help']);
    return `No such command '${c}' (type 'core show help ${c.split(' ')[0]}' for other possible commands)` + (s ? `\nMungkin maksudnya: ${s}` : '\nKetik help untuk daftar perintah.');
  }

  window.AST = { SERVER_IP, CODECS, load, register, call, cli, matchPattern, tokenizePattern, parseSip, parseExt, parseVm, subst, evalExpr };
})();
