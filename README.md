# QR Protect

QR Protect scans a QR code and shows where it goes before anything opens. It is built for the QR scams going around the Philippines: fake GCash, Maya and bank pages, app downloads posing as government or bank apps, and stickers placed over a store's QR Ph code.

Live at https://shinigami1235-creator.github.io/qr-protect/

## What it checks

Links show the site name in large letters and are checked for:

- GCash, Maya, BDO, BPI, Metrobank, UnionBank, LANDBANK and the other big brands used on a site they don't own, including the `gcash.com.something.xyz` trick
- lookalike spellings such as `gca5h.com` and `metrobamk.com.ph`, and letters from other alphabets
- Android app downloads (.apk), which are blocked outright, and other program files
- short links, free hosting sites, Google Forms, bare number addresses, plain http, cheap scam endings like .top and .xyz
- words like login, verify, OTP and claim in the address
- another address hidden inside the link

QR Ph and PromptPay payment codes are decoded to show the receiver name, the bank or e-wallet, the account number and the amount, and a code with a wrong checksum is flagged as edited.

Wi-Fi, text message, phone, email, contact card, map, crypto and authenticator codes are shown in plain words. Dial codes like `*21*` call forwarding are blocked, texts to short codes are flagged, and WhatsApp, Telegram and Discord login codes get a warning.

Nothing opens without a tap, and a link with danger signs asks again before opening.

## Using it

Install it to the home screen from Chrome, then scan from the app in place of the camera app. Screenshots of a code can be shared to QR Protect from the gallery, Messenger or Viber, or picked with Scan a picture. A picture holding several codes lists each one, riskiest first.

No file uploaded.

## Limits

A PWA can't follow a short link to its final site or look a site up on Google Safe Browsing without a server, and once a link opens it opens in the regular browser. The Flutter version will add both, plus a sandboxed browser with no logins and no downloads.

## Files

- `analyze.js` reads the text in a code and returns the verdict, checks, details and actions
- `app.js` runs the camera, picture scanning, the result sheet and recent scans
- `sw.js` caches the app for offline use and receives shared pictures. Bump `VERSION` on every deploy
- `vendor/zxing` reads codes, `vendor/jsQR.js` is the fallback
- `tests/analyze.test.js` runs the checks against 42 sample codes: `node tests/analyze.test.js`
- `tests/browser_test.py` runs the app in a phone-sized Chromium with a fake camera
