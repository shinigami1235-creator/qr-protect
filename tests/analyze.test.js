// Run with: node tests/analyze.test.js
const { analyze, crc16 } = require('../analyze.js');

function tlv(id, v) { return id + String(v.length).padStart(2, '0') + v; }
function emv(fields) {
  const body = fields.join('') + '6304';
  return body + crc16(body);
}

const qrph = emv([
  tlv('00', '01'), tlv('01', '11'),
  tlv('27', tlv('00', 'com.p2pqrpay') + tlv('01', 'GXCHPHM2XXX') + tlv('03', '09171234567')),
  tlv('52', '6016'), tlv('53', '608'), tlv('58', 'PH'),
  tlv('59', 'JUAN DELA CRUZ'), tlv('60', 'Quezon City')
]);
const qrphBroken = qrph.slice(0, -1) + (qrph.slice(-1) === 'A' ? 'B' : 'A');
const promptpay = emv([
  tlv('00', '01'), tlv('01', '12'),
  tlv('29', tlv('00', 'A000000677010111') + tlv('01', '0066812345678')),
  tlv('53', '764'), tlv('54', '150.00'), tlv('58', 'TH')
]);

const cases = [
  ['https://payments.gcash.com/pay', 'clear', 'official GCash'],
  ['https://gcash-payments.com/pay', 'danger', 'brand name in someone else\'s domain'],
  ['https://gcsh.payment.com/login', 'danger', 'brand in subdomain'],
  ['https://gcash.com.secure-pay.xyz/verify', 'danger', 'gcash.com prefix trick'],
  ['https://gca5h.com', 'danger', 'digit swap lookalike'],
  ['https://metrobamk.com.ph', 'danger', 'one-letter lookalike'],
  ['https://www.bdo.com.ph/personal', 'clear', 'official BDO'],
  ['https://bdo-online-ph.top/otp', 'danger', 'BDO token on risky TLD'],
  ['https://egov-ph-verify.com/national-id', 'danger', 'eGov impersonation'],
  ['https://philsys.gov.ph', 'clear', 'real .gov.ph'],
  ['https://example.com/apps/update.apk', 'danger', 'APK download'],
  ['https://bit.ly/3abcde', 'caution', 'short link'],
  ['https://my-shop.github.io/menu', 'caution', 'free hosting'],
  ['https://forms.gle/abc', 'caution', 'Google Form'],
  ['http://192.168.0.1/login', 'danger', 'bare IP'],
  ['https://xn--gcsh-zqa.com', 'danger', 'punycode'],
  ['https://gcash.com@evil.example/', 'clear-or-danger', 'userinfo trick'],
  ['https://jollibee.com.ph/menu', 'clear', 'normal restaurant site'],
  ['https://pm.link/shop/abc', 'clear', 'PayMongo checkout'],
  ['https://example.com/r?url=https%3A%2F%2Fevil.top%2Fx', 'caution', 'redirect param'],
  ['WIFI:S:Cafe Guest;T:WPA;P:kape\\;123;;', 'clear', 'Wi-Fi with escaped password'],
  ['WIFI:S:FreeWifi;T:nopass;;', 'caution', 'open Wi-Fi'],
  ['tel:*21*09171234567%23', 'danger', 'call forwarding USSD'],
  ['tel:+639171234567', 'clear', 'phone number'],
  ['SMSTO:2366:REG GAME', 'caution', 'premium short code'],
  ['mailto:hi@example.com?subject=Hello', 'clear', 'email'],
  ['BEGIN:VCARD\nVERSION:3.0\nFN:Maria Santos\nTEL:+639171112222\nURL:https://gcash-promo.top\nEND:VCARD', 'danger', 'vCard with bad link'],
  ['geo:14.5547,121.0244?q=Makati', 'clear', 'map location'],
  ['bitcoin:bc1qxyz?amount=0.01', 'caution', 'crypto'],
  ['otpauth://totp/Example:me@x.com?secret=ABC&issuer=Example', 'caution', 'authenticator'],
  ['2@AbCdEfGhIjKlMnOp,xyz,abc,1', 'danger', 'WhatsApp login'],
  ['tg://login?token=abc', 'danger', 'Telegram login'],
  ['https://discord.com/ra/abcdef', 'danger', 'Discord login'],
  ['javascript:alert(1)', 'danger', 'javascript scheme'],
  ['intent://scan/#Intent;scheme=x;package=com.evil.app;S.browser_fallback_url=https%3A%2F%2Fgcash-verify.com;end', 'danger', 'intent with bad fallback'],
  ['gcash://pay?amount=500', 'caution', 'GCash deep link'],
  ['Claim your prize at www.gcash-rewards.click/claim now!', 'danger', 'text with bad link'],
  ['Hello there', 'clear', 'plain text'],
  ['gcash-promo.com/claim', 'danger', 'bare domain'],
  [qrph, 'pay', 'valid QR Ph'],
  [qrphBroken, 'danger', 'QR Ph bad checksum'],
  [promptpay, 'pay', 'PromptPay']
];

let fail = 0;
for (const [input, expect, note] of cases) {
  const r = analyze(input);
  const ok = expect === 'clear-or-danger' ? r.verdict === 'danger' : r.verdict === expect;
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + note.padEnd(32) + ' -> ' + r.verdict + ' | ' + r.title);
  for (const f of r.findings) console.log('      [' + f.level + '] ' + f.text);
  if (r.kind === 'payment') for (const d of r.details) console.log('      ' + d.label + ': ' + d.value);
}
console.log(fail ? fail + ' failed' : 'all passed');
process.exit(fail ? 1 : 0);
