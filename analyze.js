/* QR Protect analysis engine. Reads the text inside a QR code and says what it does.
   Runs in the browser (window.QRAnalyze) and in Node for tests (module.exports). */
(function (root) {
  'use strict';

  // ---------- reference lists ----------

  // Official sites for brands scammers copy in the Philippines.
  // keywords: words that point at the brand when they show up in someone else's address.
  const BRANDS = [
    { name: 'GCash', domains: ['gcash.com'], keywords: ['gcash', 'gcsh', 'gkash', 'gcashh'] },
    { name: 'Maya', domains: ['maya.ph', 'paymaya.com', 'mayabank.ph'], keywords: ['paymaya', 'mayabank', 'maya'] },
    { name: 'BDO', domains: ['bdo.com.ph'], keywords: ['bdo'] },
    { name: 'BPI', domains: ['bpi.com.ph'], keywords: ['bpi'] },
    { name: 'Metrobank', domains: ['metrobank.com.ph'], keywords: ['metrobank', 'metrobnk'] },
    { name: 'UnionBank', domains: ['unionbankph.com'], keywords: ['unionbank'] },
    { name: 'LANDBANK', domains: ['landbank.com'], keywords: ['landbank'] },
    { name: 'PNB', domains: ['pnb.com.ph'], keywords: ['pnb'] },
    { name: 'RCBC', domains: ['rcbc.com'], keywords: ['rcbc'] },
    { name: 'Security Bank', domains: ['securitybank.com'], keywords: ['securitybank'] },
    { name: 'China Bank', domains: ['chinabank.ph'], keywords: ['chinabank'] },
    { name: 'EastWest', domains: ['eastwestbanker.com'], keywords: ['eastwest'] },
    { name: 'GoTyme', domains: ['gotyme.com.ph'], keywords: ['gotyme'] },
    { name: 'SeaBank', domains: ['seabank.ph'], keywords: ['seabank'] },
    { name: 'Shopee', domains: ['shopee.ph'], keywords: ['shopee'] },
    { name: 'Lazada', domains: ['lazada.com.ph'], keywords: ['lazada'] },
    { name: 'Meralco', domains: ['meralco.com.ph'], keywords: ['meralco'] },
    { name: 'PLDT', domains: ['pldthome.com', 'pldt.com'], keywords: ['pldt'] },
    { name: 'SSS', domains: ['sss.gov.ph'], keywords: ['sss'] },
    { name: 'PhilHealth', domains: ['philhealth.gov.ph'], keywords: ['philhealth'] },
    { name: 'Pag-IBIG', domains: ['pagibigfund.gov.ph'], keywords: ['pagibig'] },
    { name: 'eGovPH', domains: ['gov.ph'], keywords: ['egov', 'egovph'], ownSite: 'Government sites end in .gov.ph.' }
  ];

  // Payment companies whose checkout pages carry other brands' logos legitimately.
  const GATEWAYS = {
    'paymongo.com': 'PayMongo', 'pm.link': 'PayMongo',
    'xendit.co': 'Xendit', 'dragonpay.ph': 'Dragonpay'
  };

  const SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'ow.ly', 'cutt.ly', 'rb.gy', 's.id',
    'shorturl.at', 'tiny.cc', 'rebrand.ly', 'qrco.de', 'buff.ly', 't.ly', 'v.gd', 'lnkd.in',
    'surl.li', 'bit.do', 'u.to', 'clck.ru', 'qrs.ly', 'tinu.be', 'shorturl.asia', 'urlz.fr', 'tny.im'
  ]);

  // Platforms where anyone can make a free site under a sub-name.
  const FREE_HOSTS = new Set([
    'github.io', 'netlify.app', 'vercel.app', 'web.app', 'firebaseapp.com', 'pages.dev', 'workers.dev',
    'glitch.me', 'weebly.com', 'wixsite.com', 'blogspot.com', 'webflow.io', 'framer.website', 'framer.app',
    'carrd.co', 'ngrok-free.app', 'ngrok.io', 'ngrok.app', 'trycloudflare.com', 'onrender.com',
    'herokuapp.com', 'replit.app', 'repl.co', '000webhostapp.com', 'wordpress.com', 'square.site',
    'godaddysites.com', 'mystrikingly.com', 'site123.me', 'jimdosite.com'
  ]);

  const TWO_LEVEL_SUFFIXES = new Set([
    'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph', 'mil.ph', 'ngo.ph',
    'co.th', 'in.th', 'or.th', 'go.th', 'ac.th', 'co.uk', 'org.uk', 'com.au', 'co.jp', 'com.sg',
    'com.my', 'co.id', 'com.br', 'co.in', 'com.cn', 'com.hk', 'com.tw', 'co.nz', 'co.za', 'com.vn'
  ]);

  const RISKY_TLDS = new Set([
    'top', 'xyz', 'click', 'icu', 'live', 'vip', 'cc', 'buzz', 'rest', 'cfd', 'sbs', 'cyou', 'monster',
    'bond', 'lol', 'quest', 'tk', 'ml', 'ga', 'cf', 'gq', 'zip', 'mov', 'country', 'work', 'support',
    'loan', 'win', 'mom', 'skin', 'hair'
  ]);

  const APP_FILES = new Set(['apk', 'apks', 'xapk', 'apkm', 'aab']);
  const PROGRAM_FILES = new Set(['exe', 'msi', 'bat', 'cmd', 'scr', 'com', 'ps1', 'vbs', 'jar', 'dmg', 'pkg', 'ipa', 'mobileconfig', 'deb']);
  const OTHER_FILES = new Set(['zip', 'rar', '7z', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'xlsm', 'docm', 'html', 'htm', 'svg', 'iso', 'img']);

  const SENSITIVE_WORDS = [
    'login', 'log-in', 'signin', 'sign-in', 'verify', 'verification', 'validate', 'otp', 'mpin',
    'unlock', 'suspend', 'reactivate', 'claim', 'reward', 'prize', 'refund', 'ayuda', 'kyc', 'update-account'
  ];

  const REDIRECT_PARAMS = new Set([
    'url', 'u', 'redirect', 'redirect_uri', 'redirect_url', 'next', 'target', 'dest', 'destination',
    'goto', 'link', 'r', 'to', 'continue', 'return', 'returnurl', 'return_url', 'out'
  ]);

  // Bank and e-wallet codes found inside QR Ph payment codes (first 8 letters of the BIC).
  const PH_INSTITUTIONS = {
    GXCHPHM2: 'GCash', PAPHPHM1: 'Maya', BNORPHMM: 'BDO', BOPIPHMM: 'BPI', MBTCPHMM: 'Metrobank',
    UBPHPHMM: 'UnionBank', TLBPPHMM: 'LANDBANK', PNBMPHMM: 'PNB', RCBCPHMM: 'RCBC',
    SETCPHMM: 'Security Bank', CHBKPHMM: 'China Bank', EWBCPHMM: 'EastWest', DBPHPHMM: 'DBP'
  };

  const CURRENCIES = { '608': 'PHP', '764': 'THB', '840': 'USD', '702': 'SGD', '458': 'MYR', '360': 'IDR', '704': 'VND' };
  const CURRENCY_SIGNS = { '608': '₱', '764': '฿', '840': '$' };

  const APP_SCHEMES = {
    gcash: 'GCash', paymaya: 'Maya', maya: 'Maya', bdo: 'BDO', bpi: 'BPI', whatsapp: 'WhatsApp',
    viber: 'Viber', 'fb-messenger': 'Messenger', fb: 'Facebook', line: 'LINE', tg: 'Telegram',
    instagram: 'Instagram', tiktok: 'TikTok', shopee: 'Shopee', lazada: 'Lazada', spotify: 'Spotify'
  };
  const WALLET_SCHEMES = new Set(['gcash', 'paymaya', 'maya', 'bdo', 'bpi']);

  const LEVEL_RANK = { good: 0, info: 1, caution: 2, danger: 3 };

  // ---------- small helpers ----------

  function finding(level, text) { return { level: level, text: text }; }

  function worst(findings) {
    let w = 'none';
    for (const f of findings) {
      if (f.level === 'danger') return 'danger';
      if (f.level === 'caution') w = 'caution';
    }
    return w;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    let prev = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  // Undo the usual letter swaps scammers use: 0 for o, 1 for l, rn for m.
  function unswap(s) {
    return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/1/g, 'l')
      .replace(/3/g, 'e').replace(/5/g, 's').replace(/4/g, 'a');
  }

  function punyDecode(input) {
    const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
    function adapt(delta, numPoints, first) {
      delta = first ? Math.floor(delta / damp) : delta >> 1;
      delta += Math.floor(delta / numPoints);
      let k = 0;
      while (delta > ((base - tMin) * tMax) >> 1) { delta = Math.floor(delta / (base - tMin)); k += base; }
      return k + Math.floor((base - tMin + 1) * delta / (delta + skew));
    }
    const output = [];
    let n = 128, bias = 72, i = 0;
    let basic = input.lastIndexOf('-');
    if (basic < 0) basic = 0;
    for (let j = 0; j < basic; j++) output.push(input.charCodeAt(j));
    for (let index = basic > 0 ? basic + 1 : 0; index < input.length;) {
      const oldi = i;
      let w = 1;
      for (let k = base; ; k += base) {
        if (index >= input.length) throw new Error('bad punycode');
        const c = input.charCodeAt(index++);
        const digit = c >= 48 && c <= 57 ? c - 22 : c >= 65 && c <= 90 ? c - 65 : c >= 97 && c <= 122 ? c - 97 : base;
        if (digit >= base) throw new Error('bad punycode');
        i += digit * w;
        const t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
        if (digit < t) break;
        w *= base - t;
      }
      const len = output.length + 1;
      bias = adapt(i - oldi, len, oldi === 0);
      n += Math.floor(i / len);
      i %= len;
      output.splice(i++, 0, n);
    }
    return String.fromCodePoint.apply(null, output);
  }

  function decodeHost(host) {
    return host.split('.').map(function (label) {
      if (label.indexOf('xn--') === 0) {
        try { return punyDecode(label.slice(4)); } catch (e) { return label; }
      }
      return label;
    }).join('.');
  }

  function isIp(host) {
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.indexOf(':') >= 0 || /^\[.*\]$/.test(host) || /^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host);
  }

  // Returns the part of the host someone has to buy or sign up for, e.g. "secure-pay.xyz" from "gcash.com.secure-pay.xyz".
  function registrable(host) {
    const parts = host.split('.');
    if (parts.length <= 2) return { reg: host, platform: null };
    const last2 = parts.slice(-2).join('.');
    if (FREE_HOSTS.has(last2)) return { reg: parts.slice(-3).join('.'), platform: last2 };
    if (TWO_LEVEL_SUFFIXES.has(last2)) return { reg: parts.slice(-3).join('.'), platform: null };
    return { reg: last2, platform: null };
  }

  function onDomain(host, domain) { return host === domain || host.endsWith('.' + domain); }

  function tokens(s) { return s.toLowerCase().split(/[.\-_]+/).filter(Boolean); }

  // ---------- links ----------

  function analyzeLink(raw, url) {
    const findings = [];
    const scheme = url.protocol.replace(':', '').toLowerCase();
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const decodedHost = decodeHost(host);
    const regInfo = isIp(host) ? { reg: host, platform: null } : registrable(host);
    const reg = regInfo.reg;
    const sub = host.length > reg.length ? host.slice(0, host.length - reg.length - 1) : '';
    const regLabel = reg.split('.')[0];
    let brandOwner = null;

    if (scheme === 'http') {
      findings.push(finding('caution', 'The link uses http without encryption, so anything typed on the page can be read on the way.'));
    }

    if (url.username) {
      findings.push(finding('danger', 'The site is ' + host + '. The text before the @ sign is there to make it look like ' + decodeURIComponent(url.username) + '.'));
    }

    if (isIp(host)) {
      findings.push(finding('danger', 'The link goes to a bare number address instead of a website name.'));
    }

    if (host.split('.').some(function (l) { return l.indexOf('xn--') === 0; })) {
      findings.push(finding('danger', 'The name uses letters from another alphabet that look like normal ones. It reads as ' + decodedHost + '.'));
    }

    if (url.port && url.port !== '80' && url.port !== '443') {
      findings.push(finding('caution', 'The link uses an unusual port number (' + url.port + ').'));
    }

    // Brand checks.
    if (!isIp(host)) {
      for (const b of BRANDS) {
        if (b.domains.some(function (d) { return onDomain(host, d); })) {
          if (b.name === 'eGovPH') { brandOwner = 'the Philippine government'; }
          else brandOwner = b.name;
          break;
        }
      }

      if (brandOwner) {
        findings.push(finding('good', 'The site belongs to ' + brandOwner + '.'));
      } else {
        const hostTokens = tokens(host);
        const regTokens = tokens(regLabel);
        let flagged = false;
        for (const b of BRANDS) {
          const hit = b.keywords.find(function (k) {
            if (k.length >= 5) return host.indexOf(k) >= 0;
            return hostTokens.indexOf(k) >= 0;
          });
          if (!hit) continue;
          const inReg = hit.length >= 5 ? regLabel.indexOf(hit) >= 0 : regTokens.indexOf(hit) >= 0;
          if (inReg) {
            findings.push(finding('danger', 'Uses the ' + b.name + ' name on a site ' + b.name + " doesn't own. " + (b.ownSite || b.name + "'s own site is " + b.domains[0] + '.')));
          } else {
            findings.push(finding('danger', 'The real site is ' + reg + '. Anyone can put "' + sub + '" in front of their own site name to make it look like ' + b.name + '.'));
          }
          flagged = true;
          break;
        }

        if (!flagged) {
          const label = unswap(regLabel.replace(/[^a-z0-9]/g, ''));
          for (const b of BRANDS) {
            for (const d of b.domains) {
              const base = d.split('.')[0];
              if (base.length < 5 || regLabel === base) continue;
              const limit = base.length >= 8 ? 2 : 1;
              if (levenshtein(label, base) <= limit) {
                findings.push(finding('danger', reg + ' is spelled to look like ' + d + '.'));
                flagged = true;
                break;
              }
            }
            if (flagged) break;
          }
        }

        const govTokens = tokens(host).filter(function (t) { return t === 'gov' || t === 'gob' || t === 'govph'; });
        const isGov = /\.gov$/.test(host) || /\.gov\.[a-z]{2}$/.test(host) || /\.go\.th$/.test(host);
        if (govTokens.length && !isGov) {
          findings.push(finding('danger', 'Uses "gov" in the name without being a .gov.ph government site.'));
        }
      }

      if (SHORTENERS.has(reg) || SHORTENERS.has(host)) {
        findings.push(finding('caution', reg + ' is a short-link service that hides the real site until the link opens.'));
      }

      if (regInfo.platform) {
        findings.push(finding('caution', 'Hosted on ' + regInfo.platform + ', where anyone can make a site for free.'));
      }
      if (host === 'sites.google.com') {
        findings.push(finding('caution', 'Hosted on Google Sites, where anyone can make a site for free.'));
      }

      if ((host === 'docs.google.com' && url.pathname.indexOf('/forms') === 0) || host === 'forms.gle') {
        findings.push(finding('caution', 'Anyone can make a Google Form. Never type an MPIN, OTP or password into one.'));
      }

      if (GATEWAYS[reg]) {
        findings.push(finding('info', reg + ' belongs to ' + GATEWAYS[reg] + ', a payment company stores use for checkout. Check the store name on the page before paying.'));
      }

      const tld = host.split('.').pop();
      if (RISKY_TLDS.has(tld) && !brandOwner) {
        findings.push(finding('caution', 'The address ends in .' + tld + ', a cheap ending used by many scam sites.'));
      }
    }

    // Login codes for other apps, sent as links.
    if (onDomain(host, 'discord.com') && url.pathname.indexOf('/ra/') === 0) {
      findings.push(finding('danger', 'The code is a Discord login. Scanning it inside Discord logs someone else into your account.'));
    }

    // Files.
    const lastSeg = decodeURIComponent(url.pathname.split('/').pop() || '').toLowerCase();
    const extMatch = lastSeg.match(/\.([a-z0-9]{1,12})$/);
    const ext = extMatch ? extMatch[1] : '';
    let blockOpen = false;
    if (APP_FILES.has(ext)) {
      findings.push(finding('danger', 'Downloads an Android app file (.' + ext + '). Banks and e-wallets never send apps this way, so install apps from the Play Store only.'));
      blockOpen = true;
    } else if (PROGRAM_FILES.has(ext)) {
      findings.push(finding('danger', 'Downloads a program file (.' + ext + ').'));
      blockOpen = true;
    } else if (OTHER_FILES.has(ext)) {
      findings.push(finding('caution', 'Downloads a file (.' + ext + ').'));
    }

    // Words in the address.
    if (!brandOwner) {
      const pathAndQuery = (url.pathname + ' ' + url.search).toLowerCase();
      const word = SENSITIVE_WORDS.find(function (w) { return pathAndQuery.indexOf(w) >= 0; });
      if (word) {
        findings.push(finding('caution', 'The address mentions "' + word + '". Log in or verify only inside your bank or wallet app.'));
      }
    }

    // Another address hidden inside this one.
    for (const pair of url.searchParams) {
      if (!REDIRECT_PARAMS.has(pair[0].toLowerCase())) continue;
      const v = pair[1];
      if (/^https?:\/\//i.test(v) || /^\/\//.test(v)) {
        let innerHost = v;
        try { innerHost = new URL(v.indexOf('//') === 0 ? 'https:' + v : v).hostname; } catch (e) { /* keep raw */ }
        if (innerHost && innerHost !== host) {
          findings.push(finding('caution', 'Carries another address inside it and may forward you to ' + innerHost + '.'));
          break;
        }
      }
    }

    findings.sort(function (a, b) { return LEVEL_RANK[b.level] - LEVEL_RANK[a.level]; });
    const level = worst(findings);
    let verdict, title;
    if (level === 'danger') { verdict = 'danger'; title = blockOpen ? "Don't download this" : "Don't open this"; }
    else if (level === 'caution') { verdict = 'caution'; title = 'Check before opening'; }
    else if (brandOwner) { verdict = 'clear'; title = 'Official site'; }
    else { verdict = 'clear'; title = 'No warning signs'; }

    const actions = [];
    if (!blockOpen) {
      actions.push({
        type: 'open', value: url.href,
        label: verdict === 'danger' ? 'Open anyway' : 'Open link',
        confirm: verdict === 'danger' ? 'This link showed danger signs. Open it in your browser anyway?' : null
      });
    }
    actions.push({ type: 'copy', value: url.href, label: 'Copy link' });

    return {
      kind: 'link', label: scheme === 'http' || scheme === 'https' ? 'Link' : 'Link (' + scheme + ')',
      verdict: verdict, title: title, findings: findings,
      site: { sub: sub, reg: reg, decoded: decodedHost !== host ? decodedHost : null },
      details: [{ label: 'Full address', value: url.href, mono: true }],
      actions: actions, browserNote: !blockOpen
    };
  }

  // ---------- QR Ph and other EMV payment codes ----------

  function parseTlv(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      if (i + 4 > s.length) return null;
      const id = s.substr(i, 2);
      const len = parseInt(s.substr(i + 2, 2), 10);
      if (!/^\d{2}$/.test(id) || isNaN(len) || !/^\d{2}$/.test(s.substr(i + 2, 2))) return null;
      const value = s.substr(i + 4, len);
      if (value.length !== len) return null;
      out.push({ id: id, value: value });
      i += 4 + len;
    }
    return out;
  }

  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function formatThaiProxy(v) {
    if (/^0066\d{9}$/.test(v)) {
      const local = '0' + v.slice(4);
      return local.slice(0, 3) + '-' + local.slice(3, 6) + '-' + local.slice(6);
    }
    return v;
  }

  function analyzePayment(raw) {
    const tlv = parseTlv(raw);
    if (!tlv) return null;
    const get = function (id) { const t = tlv.find(function (x) { return x.id === id; }); return t ? t.value : ''; };
    const findings = [];
    const details = [];

    // Checksum.
    const crcField = get('63');
    let crcOk = false;
    if (crcField && raw.length >= 8 && raw.slice(-8, -4) === '6304') {
      crcOk = crc16(raw.slice(0, -4)) === crcField.toUpperCase();
    }
    if (!crcOk) {
      findings.push(finding('danger', "The code's checksum is wrong, which means it was edited or made badly. Don't pay with it."));
    }

    // Who receives the money.
    let network = '', institution = '', accounts = [];
    for (let id = 26; id <= 51; id++) {
      const v = get(String(id));
      if (!v) continue;
      const subs = parseTlv(v) || [];
      const guid = (subs.find(function (s) { return s.id === '00'; }) || {}).value || '';
      const g = guid.toLowerCase();
      if (/^a000000677010111|^a000000677010112/.test(g)) network = 'PromptPay';
      else if (g.indexOf('p2pqrpay') >= 0) network = 'QR Ph transfer';
      else if (g.indexOf('ppmi') >= 0 || g.indexOf('p2m') >= 0 || g.indexOf('qrph') >= 0) network = 'QR Ph';
      else if (!network && guid) network = guid;
      for (const s of subs) {
        if (s.id === '00') continue;
        const bic = s.value.toUpperCase();
        if (/^[A-Z]{4}PH[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) {
          institution = PH_INSTITUTIONS[bic.slice(0, 8)] || bic;
        } else if (/^[0-9+]{6,}$/.test(s.value)) {
          accounts.push(network === 'PromptPay' ? formatThaiProxy(s.value) : s.value);
        }
      }
    }

    const name = get('59').trim();
    const city = get('60').trim();
    const amount = get('54');
    const currency = get('53');
    const country = get('58');
    const poi = get('01');

    details.push({ label: 'Pays', value: name && name.toUpperCase() !== 'N/A' ? name : 'No name in the code', big: true });
    if (institution) details.push({ label: 'Through', value: institution });
    if (network) details.push({ label: 'Network', value: network });
    if (accounts.length) details.push({ label: 'Account or number', value: accounts.join(', '), mono: true });
    if (city) details.push({ label: 'City', value: city });
    if (amount) {
      const sign = CURRENCY_SIGNS[currency] || ((CURRENCIES[currency] || currency) + ' ');
      details.push({ label: 'Amount', value: sign + amount, big: true });
    }
    if (poi === '12') details.push({ label: 'Kind', value: 'One-time code for a single payment' });
    else if (poi === '11') details.push({ label: 'Kind', value: 'Reusable code' });
    const add = parseTlv(get('62')) || [];
    const ref = add.find(function (s) { return s.id === '05' || s.id === '01'; });
    if (ref) details.push({ label: 'Reference', value: ref.value, mono: true });
    if (country && country !== 'PH') details.push({ label: 'Country', value: country });

    const hasName = name && name.toUpperCase() !== 'N/A';
    if (!hasName && network === 'PromptPay') {
      findings.push(finding('info', 'PromptPay codes carry the phone or ID number without the name. Your bank app shows the name before you confirm, so check it there.'));
    } else if (!hasName) {
      findings.push(finding('caution', 'The code has no receiver name. Ask the store to confirm the account before paying.'));
    }
    if (crcOk && hasName) {
      findings.push(finding('info', 'If the name matches the store or person you are paying, scan the code again inside your wallet or bank app to pay.'));
    }

    findings.sort(function (a, b) { return LEVEL_RANK[b.level] - LEVEL_RANK[a.level]; });
    const level = worst(findings);
    return {
      kind: 'payment', label: network === 'PromptPay' ? 'Payment code (PromptPay)' : 'Payment code (QR Ph)',
      verdict: level === 'danger' ? 'danger' : 'pay',
      title: level === 'danger' ? "Don't pay with this code" : 'Check the name before paying',
      findings: findings, details: details,
      actions: [{ type: 'copy', value: (hasName ? name : '') + (accounts.length ? ' ' + accounts.join(', ') : ''), label: 'Copy receiver' }]
    };
  }

  // ---------- other kinds of codes ----------

  function splitFields(body) {
    // Splits "S:name;T:WPA;P:pa\;ss;;" respecting backslash escapes.
    const out = {};
    let key = '', val = '', inKey = true, esc = false;
    for (const ch of body) {
      if (esc) { (inKey ? (key += ch) : (val += ch)); esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (inKey && ch === ':') { inKey = false; continue; }
      if (ch === ';') { if (key) out[key.toUpperCase()] = val; key = ''; val = ''; inKey = true; continue; }
      if (inKey) key += ch; else val += ch;
    }
    if (key) out[key.toUpperCase()] = val;
    return out;
  }

  function analyzeWifi(raw) {
    const f = splitFields(raw.slice(5));
    const ssid = f.S || '';
    const type = (f.T || 'nopass').toUpperCase();
    const findings = [];
    const details = [{ label: 'Network', value: ssid || '(no name)', big: true }];
    if (type === 'NOPASS' || type === '') {
      details.push({ label: 'Security', value: 'None' });
      findings.push(finding('caution', 'The network has no password, and anyone nearby can see what you send on it.'));
    } else {
      details.push({ label: 'Security', value: type === 'WPA' ? 'WPA/WPA2' : type });
      if (type === 'WEP') findings.push(finding('caution', 'The network uses WEP, an old lock that is easy to break.'));
      if (f.P) details.push({ label: 'Password', value: f.P, mono: true });
    }
    if (/^true$/i.test(f.H || '')) details.push({ label: 'Hidden', value: 'Yes' });
    findings.push(finding('info', 'Join it from the Wi-Fi settings on your phone.'));
    const actions = [];
    if (f.P) actions.push({ type: 'copy', value: f.P, label: 'Copy password' });
    actions.push({ type: 'copy', value: ssid, label: 'Copy network name' });
    return {
      kind: 'wifi', label: 'Wi-Fi', verdict: worst(findings) === 'caution' ? 'caution' : 'clear',
      title: worst(findings) === 'caution' ? 'Open Wi-Fi network' : 'Wi-Fi network',
      findings: findings, details: details, actions: actions
    };
  }

  function smsResult(number, body) {
    const findings = [];
    const clean = number.replace(/[\s-]/g, '');
    if (/^\d{3,6}$/.test(clean)) {
      findings.push(finding('caution', clean + ' is a short code. Texts to short codes can be charged to your load or sign you up for a subscription.'));
    }
    const details = [{ label: 'To', value: number || '(no number)', big: true, mono: true }];
    if (body) details.push({ label: 'Message', value: body });
    const smsUrl = 'sms:' + encodeURIComponent(clean) + (body ? '?body=' + encodeURIComponent(body) : '');
    return {
      kind: 'sms', label: 'Text message', verdict: worst(findings) === 'caution' ? 'caution' : 'clear',
      title: worst(findings) === 'caution' ? 'Check before texting' : 'Text message',
      findings: findings, details: details,
      actions: [{ type: 'open', value: smsUrl, label: 'Open in Messages' }, { type: 'copy', value: clean, label: 'Copy number' }]
    };
  }

  function analyzeTel(number) {
    const n = decodeURIComponent(number).trim();
    if (/[*#]/.test(n)) {
      return {
        kind: 'call', label: 'Dial code', verdict: 'danger', title: "Don't dial this",
        findings: [finding('danger', n + ' is a dial code. Codes like this can change phone settings, such as forwarding your calls to another number.')],
        details: [{ label: 'Code', value: n, big: true, mono: true }],
        actions: [{ type: 'copy', value: n, label: 'Copy code' }]
      };
    }
    return {
      kind: 'call', label: 'Phone number', verdict: 'clear', title: 'Phone number', findings: [],
      details: [{ label: 'Number', value: n, big: true, mono: true }],
      actions: [{ type: 'open', value: 'tel:' + n.replace(/\s/g, ''), label: 'Call' }, { type: 'copy', value: n, label: 'Copy number' }]
    };
  }

  function analyzeMailto(url) {
    const to = decodeURIComponent(url.pathname || '');
    const subject = url.searchParams.get('subject') || '';
    const body = url.searchParams.get('body') || '';
    const details = [{ label: 'To', value: to || '(no address)', big: true }];
    if (subject) details.push({ label: 'Subject', value: subject });
    if (body) details.push({ label: 'Message', value: body });
    return {
      kind: 'email', label: 'Email', verdict: 'clear', title: 'Email', findings: [], details: details,
      actions: [{ type: 'open', value: url.href, label: 'Write email' }, { type: 'copy', value: to, label: 'Copy address' }]
    };
  }

  function unfoldVcard(raw) { return raw.replace(/\r?\n[ \t]/g, ''); }

  function analyzeContact(raw) {
    const details = [];
    let urls = [];
    let name = '', phones = [], emails = [], org = '';
    if (/^MECARD:/i.test(raw)) {
      const f = splitFields(raw.slice(7));
      name = (f.N || '').replace(/,/g, ' ');
      if (f.TEL) phones.push(f.TEL);
      if (f.EMAIL) emails.push(f.EMAIL);
      if (f.URL) urls.push(f.URL);
      org = f.ORG || '';
    } else {
      for (const line of unfoldVcard(raw).split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z\-]+)(;[^:]*)?:(.*)$/);
        if (!m) continue;
        const key = m[1].toUpperCase(), val = m[3].trim();
        if (key === 'FN') name = val;
        else if (key === 'N' && !name) name = val.split(';').filter(Boolean).reverse().join(' ');
        else if (key === 'TEL') phones.push(val);
        else if (key === 'EMAIL') emails.push(val);
        else if (key === 'URL') urls.push(val);
        else if (key === 'ORG') org = val.replace(/;/g, ' ');
      }
    }
    details.push({ label: 'Name', value: name || '(no name)', big: true });
    if (org) details.push({ label: 'Company', value: org });
    if (phones.length) details.push({ label: 'Phone', value: phones.join(', '), mono: true });
    if (emails.length) details.push({ label: 'Email', value: emails.join(', ') });
    let findings = [];
    if (urls.length) {
      details.push({ label: 'Website', value: urls.join(', '), mono: true });
      const sub = analyze(urls[0]);
      if (sub && sub.kind === 'link') findings = findings.concat(sub.findings.filter(function (f) { return f.level === 'danger' || f.level === 'caution'; }));
    }
    const level = worst(findings);
    return {
      kind: 'contact', label: 'Contact card', verdict: level === 'none' ? 'clear' : level,
      title: level === 'danger' ? "Don't trust this contact's link" : 'Contact card',
      findings: findings, details: details,
      actions: [{ type: 'contact', value: raw, label: 'Save contact' }, { type: 'copy', value: [name].concat(phones, emails).join('\n'), label: 'Copy details' }]
    };
  }

  function analyzeGeo(raw) {
    const m = raw.slice(4).match(/^(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/);
    if (!m) return null;
    const q = (raw.match(/[?&]q=([^&]+)/) || [])[1];
    const label = q ? decodeURIComponent(q.replace(/\+/g, ' ')) : m[1] + ', ' + m[3];
    return {
      kind: 'location', label: 'Map location', verdict: 'clear', title: 'Map location', findings: [],
      details: [{ label: 'Place', value: label, big: true }, { label: 'Coordinates', value: m[1] + ', ' + m[3], mono: true }],
      actions: [{ type: 'open', value: 'https://www.google.com/maps?q=' + m[1] + ',' + m[3], label: 'Open in Maps' }]
    };
  }

  function analyzeCrypto(raw, scheme) {
    const rest = raw.slice(scheme.length + 1);
    const address = rest.split('?')[0].replace(/^\/\//, '');
    const params = new URLSearchParams(rest.split('?')[1] || '');
    const details = [{ label: 'Wallet address', value: address, mono: true }];
    if (params.get('amount')) details.push({ label: 'Amount', value: params.get('amount') + ' ' + scheme.toUpperCase(), big: true });
    return {
      kind: 'crypto', label: 'Crypto payment', verdict: 'caution', title: 'Check before sending',
      findings: [finding('caution', 'Crypto payments cannot be reversed once sent. Only pay an address you got from someone you know.')],
      details: details, actions: [{ type: 'copy', value: address, label: 'Copy address' }]
    };
  }

  function analyzeOtpAuth(url) {
    const label = decodeURIComponent(url.pathname.replace(/^\/+[a-z]+\//i, '').replace(/^\//, ''));
    const issuer = url.searchParams.get('issuer') || label.split(':')[0] || 'an account';
    return {
      kind: 'otp', label: 'Authenticator setup', verdict: 'caution', title: 'Check before adding',
      findings: [finding('caution', 'Adds a login code for ' + issuer + ' to an authenticator app. Scan this only on a site where you are setting up your own account.')],
      details: [{ label: 'Account', value: label || issuer, big: true }],
      actions: []
    };
  }

  function loginCode(app) {
    return {
      kind: 'login', label: app + ' login code', verdict: 'danger', title: "Don't scan this in " + app,
      findings: [finding('danger', 'The code is a ' + app + ' login. Scanning it inside ' + app + " logs someone else's device into your account.")],
      details: [], actions: []
    };
  }

  function analyzeIntent(raw) {
    const pkg = (raw.match(/;package=([^;]+)/) || [])[1] || '';
    const fallback = (raw.match(/;S\.browser_fallback_url=([^;]+)/) || [])[1];
    const findings = [finding('caution', pkg ? 'Opens the Android app ' + pkg + ' directly.' : 'Opens an Android app directly.')];
    const details = [];
    if (pkg) details.push({ label: 'App', value: pkg, mono: true, big: true });
    if (fallback) {
      const fb = decodeURIComponent(fallback);
      details.push({ label: 'Backup address', value: fb, mono: true });
      const sub = analyze(fb);
      if (sub && sub.kind === 'link') {
        findings.push(finding('info', 'If the app is not installed it opens ' + (sub.site ? sub.site.reg : fb) + ' instead.'));
        sub.findings.forEach(function (f) { if (f.level === 'danger') findings.push(f); });
      }
    }
    const level = worst(findings);
    return {
      kind: 'app', label: 'App link', verdict: level, title: level === 'danger' ? "Don't open this" : 'Opens an app',
      findings: findings, details: details, actions: [{ type: 'copy', value: raw, label: 'Copy link' }]
    };
  }

  function analyzeAppScheme(url, scheme) {
    const app = APP_SCHEMES[scheme];
    const findings = [];
    if (WALLET_SCHEMES.has(scheme)) {
      findings.push(finding('caution', 'Opens ' + app + ' straight to a screen. Check the name and amount in ' + app + ' before you confirm anything.'));
    } else if (app) {
      findings.push(finding('caution', 'Opens ' + app + '.'));
    } else {
      findings.push(finding('caution', 'Opens whichever app handles "' + scheme + ':" links on your phone.'));
    }
    return {
      kind: 'app', label: 'App link', verdict: 'caution', title: app ? 'Opens ' + app : 'Opens an app',
      findings: findings, details: [{ label: 'Address', value: url.href, mono: true }],
      actions: [{ type: 'open', value: url.href, label: app ? 'Open ' + app : 'Open app' }, { type: 'copy', value: url.href, label: 'Copy link' }]
    };
  }

  function analyzeEvent(raw) {
    const get = function (k) { const m = unfoldVcard(raw).match(new RegExp('^' + k + '[^:\\n]*:(.*)$', 'mi')); return m ? m[1].trim() : ''; };
    const fmt = function (v) {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2}))?/);
      return m ? m[1] + '-' + m[2] + '-' + m[3] + (m[4] ? ' ' + m[5] + ':' + m[6] : '') : v;
    };
    const details = [{ label: 'Event', value: get('SUMMARY') || '(no title)', big: true }];
    if (get('DTSTART')) details.push({ label: 'Starts', value: fmt(get('DTSTART')) });
    if (get('LOCATION')) details.push({ label: 'Place', value: get('LOCATION') });
    return { kind: 'event', label: 'Calendar event', verdict: 'clear', title: 'Calendar event', findings: [], details: details, actions: [] };
  }

  function analyzeText(raw) {
    const details = [{ label: 'Text', value: raw }];
    let findings = [];
    const actions = [{ type: 'copy', value: raw, label: 'Copy text' }];
    const m = raw.match(/https?:\/\/[^\s"'<>]+|www\.[^\s"'<>]+/i);
    let site = null;
    if (m) {
      const link = /^www\./i.test(m[0]) ? 'https://' + m[0] : m[0];
      const sub = analyze(link);
      if (sub && sub.kind === 'link') {
        findings = sub.findings;
        site = sub.site;
        details.push({ label: 'Link inside', value: link, mono: true });
        sub.actions.forEach(function (a) { if (a.type === 'open') actions.unshift(a); });
      }
    }
    const level = worst(findings);
    return {
      kind: 'text', label: 'Text', verdict: level === 'none' ? 'clear' : level,
      title: level === 'danger' ? "Don't open the link in this text" : level === 'caution' ? 'Check the link before opening' : 'Plain text',
      findings: findings, details: details, actions: actions, site: site, browserNote: !!site
    };
  }

  // ---------- entry point ----------

  function analyze(input) {
    const raw = String(input || '').replace(/^﻿/, '');
    const text = raw.trim();
    if (!text) return null;
    let result = null;

    if (/^000201/.test(text)) result = analyzePayment(text);
    if (!result && /^WIFI:/i.test(text)) result = analyzeWifi(text);
    if (!result && /^SMSTO:/i.test(text)) {
      const rest = text.slice(6);
      const i = rest.indexOf(':');
      result = smsResult(i >= 0 ? rest.slice(0, i) : rest, i >= 0 ? rest.slice(i + 1) : '');
    }
    if (!result && /^(BEGIN:VCARD|MECARD:)/i.test(text)) result = analyzeContact(text);
    if (!result && /^BEGIN:(VEVENT|VCALENDAR)/i.test(text)) result = analyzeEvent(text);
    if (!result && /^geo:/i.test(text)) result = analyzeGeo(text);
    if (!result && /^\d@[A-Za-z0-9+/=]{10,},/.test(text)) result = loginCode('WhatsApp');
    if (!result && /^tg:\/\/login\?token=/i.test(text)) result = loginCode('Telegram');
    if (!result && /^intent:/i.test(text)) result = analyzeIntent(text);
    if (!result && /^(bitcoin|ethereum|litecoin|dogecoin|bitcoincash|tron|solana|usdt):/i.test(text)) {
      result = analyzeCrypto(text, text.split(':')[0].toLowerCase());
    }

    if (!result && /^[a-z][a-z0-9+.\-]*:/i.test(text)) {
      const scheme = text.split(':')[0].toLowerCase();
      if (['javascript', 'data', 'file', 'blob', 'vbscript', 'content', 'about'].indexOf(scheme) >= 0) {
        result = {
          kind: 'blocked', label: 'Code', verdict: 'danger', title: "Don't open this",
          findings: [finding('danger', 'This runs code or opens a file on your phone instead of going to a website.')],
          details: [], actions: [{ type: 'copy', value: text, label: 'Copy text' }]
        };
      } else if (scheme === 'tel') {
        result = analyzeTel(text.slice(4));
      } else if (scheme === 'sms' || scheme === 'smsto' || scheme === 'mms') {
        const rest = text.slice(scheme.length + 1).replace(/^\/\//, '');
        const num = rest.split('?')[0];
        const body = new URLSearchParams(rest.split('?')[1] || '').get('body') || '';
        result = smsResult(decodeURIComponent(num), body);
      } else {
        let url = null;
        try { url = new URL(text); } catch (e) { url = null; }
        if (url) {
          if (scheme === 'http' || scheme === 'https') result = analyzeLink(text, url);
          else if (scheme === 'mailto') result = analyzeMailto(url);
          else if (scheme === 'otpauth') result = analyzeOtpAuth(url);
          else if (scheme === 'market') {
            const id = url.searchParams.get('id') || '';
            result = {
              kind: 'app', label: 'Play Store link', verdict: 'clear', title: 'Play Store app page', findings: [],
              details: [{ label: 'App', value: id, mono: true, big: true }],
              actions: [{ type: 'open', value: 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(id), label: 'Open in Play Store' }]
            };
          } else result = analyzeAppScheme(url, scheme);
        }
      }
    }

    // A bare domain like "gcash-promo.com/claim".
    if (!result && /^(www\.)?[a-z0-9\-]+(\.[a-z0-9\-]+)+(\/\S*)?$/i.test(text) && !/\s/.test(text)) {
      try { result = analyzeLink('https://' + text, new URL('https://' + text)); } catch (e) { /* fall through */ }
    }

    if (!result) result = analyzeText(text);
    result.raw = raw;
    return result;
  }

  const api = { analyze: analyze, crc16: crc16, parseTlv: parseTlv, punyDecode: punyDecode, registrable: registrable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QRAnalyze = api;
})(typeof self !== 'undefined' ? self : this);
