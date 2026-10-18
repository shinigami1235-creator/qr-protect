# Builds QR images and a fake camera feed for the browser test.
import sys, qrcode
from PIL import Image
sys.path.insert(0, '.')
out = 'tests/fixtures/'
def save(text, name, box=10):
    q = qrcode.QRCode(box_size=box, border=4); q.add_data(text); q.make(fit=True)
    q.make_image(fill_color='black', back_color='white').convert('RGB').save(out + name)
save('https://gcash-payments.com/pay?ref=88812', 'fake-gcash.png')
save('https://payments.gcash.com/pay', 'real-gcash.png')
save(open('tests/fixtures/qrph.txt').read().strip(), 'qrph.png')
# screenshot-like picture: two codes side by side on a grey background
a = Image.open(out + 'real-gcash.png'); b = Image.open(out + 'fake-gcash.png')
canvas = Image.new('RGB', (a.width + b.width + 120, max(a.height, b.height) + 300), (200, 205, 210))
canvas.paste(a, (40, 150)); canvas.paste(b, (a.width + 80, 150)); canvas.save(out + 'two-codes.jpg', quality=90)
# fake camera feed: 640x480 Y4M with the fake GCash code in the middle
img = Image.new('RGB', (640, 480), (90, 90, 90))
code = Image.open(out + 'fake-gcash.png').resize((360, 360), Image.NEAREST)
img.paste(code, (140, 60))
y, u, v = img.convert('YCbCr').split()
u = u.resize((320, 240)); v = v.resize((320, 240))
with open(out + 'camera.y4m', 'wb') as f:
    f.write(b'YUV4MPEG2 W640 H480 F15:1 Ip A1:1 C420jpeg\n')
    for _ in range(30):
        f.write(b'FRAME\n'); f.write(y.tobytes()); f.write(u.tobytes()); f.write(v.tobytes())
print('ok')
