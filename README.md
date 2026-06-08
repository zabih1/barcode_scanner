# QR Scanner

A small web app that reads QR codes and shows the data encoded inside them — using
your **camera** in real time, or by **uploading an image** (photo/screenshot). Decoding
happens entirely in the browser; nothing is uploaded to any server.

Built with plain HTML/CSS/JS and the [jsQR](https://github.com/cozmo/jsQR) decoder
(vendored locally in `vendor/jsQR.js`, so the app works offline).

## Files

| File             | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `index.html`     | Page markup (Camera / Upload tabs, result panel)   |
| `style.css`      | Styling and the camera scan-frame overlay          |
| `app.js`         | Camera scanning, image decoding, copy, error UX    |
| `vendor/jsQR.js` | The QR decoding library                            |

## Run it locally

The **camera** only works in a *secure context* — that means `https://` or
`http://localhost`. Opening `index.html` directly from the file system (`file://`) will
let **Upload** work but **not** the camera. So run a tiny local web server:

**Python (already on most machines):**
```bash
python -m http.server 8000
```
Then open <http://localhost:8000>.

**Node (if you prefer):**
```bash
npx serve .
```

**VS Code:** install the “Live Server” extension and click *Go Live*.

### Test on your phone
Phones require **HTTPS** for the camera (localhost is exempt only on the same device).
The easiest way is to deploy (below) or use a tunneling tool such as `ngrok http 8000`,
then open the HTTPS URL on the phone.

## Deploy (free, HTTPS included)

This is a static site — drop the folder onto any static host:

- **Netlify / Vercel / Cloudflare Pages:** drag-and-drop the folder or connect a repo.
- **GitHub Pages:** push to a repo and enable Pages.

All of these serve over HTTPS, so the camera will work.

## How to use

1. **Camera tab** → *Start camera* → hold a QR code inside the frame. It decodes and
   stops automatically, showing the data with a **Copy** button.
2. **Upload image tab** → choose or drag a QR photo/screenshot → the decoded data appears.
3. If the data is a link, it’s shown as a clickable URL with an **Open link** button.

## Notes & limits

- **QR codes only** (not 1D barcodes like UPC/EAN). To add those later, swap in a
  multi-format library such as ZXing.
- Decoding works best with good lighting and a reasonably sharp, non-tiny code.
