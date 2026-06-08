/* QR Scanner — plain JS, decodes via jsQR (global `jsQR`), renders structured results. */
(function () {
  "use strict";

  // --- Elements ---
  const video = document.getElementById("video");
  const image = document.getElementById("image");
  const placeholder = document.getElementById("placeholder");
  const placeholderText = document.getElementById("placeholder-text");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const btnCamera = document.getElementById("btn-camera");
  const btnCameraLabel = document.getElementById("btn-camera-label");
  const btnUpload = document.getElementById("btn-upload");
  const fileInput = document.getElementById("file-input");

  const result = document.getElementById("result");
  const resultBadge = document.getElementById("result-badge");
  const resultTitle = document.getElementById("result-title");
  const fields = document.getElementById("fields");
  const rawText = document.getElementById("raw-text");
  const btnCopy = document.getElementById("btn-copy");
  const btnOpen = document.getElementById("btn-open");
  const btnClear = document.getElementById("btn-clear");

  const statusEl = document.getElementById("status");

  // --- State ---
  let stream = null;
  let rafId = null;
  let lastDecoded = "";

  // ---------- Helpers ----------
  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " status--" + kind : "");
  }

  function showPlaceholder(text) {
    placeholderText.textContent = text || "Camera preview will appear here";
    placeholder.hidden = false;
    video.hidden = true;
    image.hidden = true;
  }

  // ---------- Structured parsing ----------
  // Returns { type, title, link, rows: [{label, value, link?}] }
  function parseData(raw) {
    const text = raw.trim();

    if (/^https?:\/\//i.test(text)) {
      return { type: "URL", title: "Website link", link: text,
        rows: [{ label: "Link", value: text, link: text }] };
    }
    if (/^mailto:/i.test(text)) {
      const addr = text.replace(/^mailto:/i, "");
      return { type: "EMAIL", title: "Email address",
        rows: [{ label: "Email", value: addr, link: "mailto:" + addr }] };
    }
    if (/^tel:/i.test(text)) {
      const num = text.replace(/^tel:/i, "");
      return { type: "PHONE", title: "Phone number",
        rows: [{ label: "Phone", value: num, link: "tel:" + num }] };
    }
    if (/^smsto:/i.test(text) || /^sms:/i.test(text)) {
      const body = text.replace(/^smsto:/i, "").replace(/^sms:/i, "");
      const parts = body.split(":");
      const rows = [{ label: "Number", value: parts[0] || "" }];
      if (parts[1]) rows.push({ label: "Message", value: parts.slice(1).join(":") });
      return { type: "SMS", title: "Text message", rows: rows };
    }
    if (/^geo:/i.test(text)) {
      const coords = text.replace(/^geo:/i, "");
      return { type: "LOCATION", title: "Location",
        rows: [{ label: "Coordinates", value: coords,
          link: "https://maps.google.com/?q=" + encodeURIComponent(coords) }] };
    }
    if (/^WIFI:/i.test(text)) return parseWifi(text);
    if (/^BEGIN:VCARD/i.test(text)) return parseVCard(text);
    if (/^MECARD:/i.test(text)) return parseMecard(text);

    // Generic text: split into segments on pipes / newlines / tabs.
    const segments = text
      .split(/[\n\r|\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length > 1) {
      return {
        type: "TEXT",
        title: segments.length + " fields detected",
        rows: segments.map((seg, i) => ({ label: detectLabel(seg, i), value: seg })),
      };
    }
    return { type: "TEXT", title: "Plain text", rows: [{ label: "Text", value: text }] };
  }

  function detectLabel(seg, i) {
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(seg)) return "Date";
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(seg)) return "Date";
    if (/^https?:\/\//i.test(seg)) return "Link";
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(seg)) return "Email";
    if (/^[+()\d][\d\s()+-]{6,}$/.test(seg)) return "Phone";
    if (/^[A-Z0-9][A-Z0-9/-]*\d[A-Z0-9/-]*$/i.test(seg) && seg.length <= 16) return "Reference / No.";
    return "Field " + (i + 1);
  }

  function parseWifi(text) {
    const get = (k) => {
      const m = text.match(new RegExp(k + ":((?:[^;\\\\]|\\\\.)*);", "i"));
      return m ? m[1].replace(/\\(.)/g, "$1") : "";
    };
    const rows = [];
    const ssid = get("S");
    const type = get("T");
    const pass = get("P");
    if (ssid) rows.push({ label: "Network (SSID)", value: ssid });
    if (type) rows.push({ label: "Security", value: type });
    if (pass) rows.push({ label: "Password", value: pass });
    return { type: "WIFI", title: "Wi-Fi network", rows: rows.length ? rows : [{ label: "Data", value: text }] };
  }

  function parseVCard(text) {
    const lines = text.split(/\r?\n/);
    const map = { FN: "Name", N: "Name", TEL: "Phone", EMAIL: "Email", ORG: "Organization", TITLE: "Title", ADR: "Address", URL: "Website" };
    const rows = [];
    lines.forEach((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return;
      const keyRaw = line.slice(0, idx).split(";")[0].toUpperCase();
      const val = line.slice(idx + 1).replace(/;+/g, " ").trim();
      if (map[keyRaw] && val) rows.push({ label: map[keyRaw], value: val });
    });
    return { type: "CONTACT", title: "Contact card", rows: rows.length ? rows : [{ label: "Data", value: text }] };
  }

  function parseMecard(text) {
    const body = text.replace(/^MECARD:/i, "");
    const map = { N: "Name", TEL: "Phone", EMAIL: "Email", ADR: "Address", URL: "Website", ORG: "Organization" };
    const rows = [];
    body.split(";").forEach((part) => {
      const idx = part.indexOf(":");
      if (idx === -1) return;
      const key = part.slice(0, idx).toUpperCase();
      const val = part.slice(idx + 1).trim();
      if (map[key] && val) rows.push({ label: map[key], value: val });
    });
    return { type: "CONTACT", title: "Contact card", rows: rows.length ? rows : [{ label: "Data", value: text }] };
  }

  // ---------- Render ----------
  function showResult(text) {
    lastDecoded = text;
    const parsed = parseData(text);

    resultBadge.textContent = parsed.type;
    resultTitle.textContent = parsed.title;
    rawText.textContent = text;

    fields.textContent = "";
    parsed.rows.forEach((row) => {
      const wrap = document.createElement("div");
      wrap.className = "field";

      const label = document.createElement("span");
      label.className = "field__label";
      label.textContent = row.label;

      const value = document.createElement("div");
      value.className = "field__value";
      value.setAttribute("dir", "auto"); // handle RTL (e.g. Urdu) correctly
      if (row.link) {
        const a = document.createElement("a");
        a.href = row.link;
        a.textContent = row.value;
        a.target = "_blank";
        a.rel = "noopener";
        value.appendChild(a);
      } else {
        value.textContent = row.value;
      }

      wrap.appendChild(label);
      wrap.appendChild(value);
      fields.appendChild(wrap);
    });

    if (parsed.link) {
      btnOpen.href = parsed.link;
      btnOpen.hidden = false;
    } else {
      btnOpen.hidden = true;
    }

    result.hidden = false;
    setStatus("QR code decoded.", "ok");
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearResult() {
    result.hidden = true;
    fields.textContent = "";
    rawText.textContent = "";
    btnOpen.hidden = true;
    lastDecoded = "";
    setStatus("");
  }

  /** Run jsQR over current canvas pixels. Returns decoded string or null. */
  function decodeCanvas() {
    const { width, height } = canvas;
    if (!width || !height) return null;
    const imageData = ctx.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
    return code && code.data ? code.data : null;
  }

  // ---------- Camera ----------
  async function startCamera() {
    clearResult();
    image.hidden = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera is not supported in this browser.", "error");
      return;
    }
    if (!window.isSecureContext) {
      setStatus("Camera needs HTTPS or http://localhost. Use “Upload image” instead.", "error");
      return;
    }

    setStatus("Requesting camera…");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
    } catch (err) {
      if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
        setStatus("Camera permission denied. Allow access and try again.", "error");
      } else if (err && err.name === "NotFoundError") {
        setStatus("No camera found on this device.", "error");
      } else {
        setStatus("Could not start the camera: " + (err && err.message ? err.message : err), "error");
      }
      return;
    }

    video.srcObject = stream;
    await video.play();

    placeholder.hidden = true;
    image.hidden = true;
    video.hidden = false;
    btnCameraLabel.textContent = "Stop";
    btnCamera.dataset.active = "1";
    setStatus("Scanning… hold a QR code in view.");
    scanLoop();
  }

  function scanLoop() {
    if (!stream) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = decodeCanvas();
      if (data) {
        stopCamera();
        showResult(data);
        return;
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  function stopCamera(keepStatus) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.srcObject = null;
    btnCameraLabel.textContent = "Start camera";
    delete btnCamera.dataset.active;
    if (!result.hidden) {
      placeholder.hidden = true;
    } else if (image.hidden) {
      showPlaceholder("Camera preview will appear here");
    }
    if (!keepStatus && result.hidden) setStatus("");
  }

  // ---------- Upload ----------
  function handleFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setStatus("Please choose an image file.", "error");
      return;
    }
    stopCamera(true);
    clearResult();
    setStatus("Reading image…");

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      const MAX = 1600;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const scale = Math.min(1, MAX / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Show the chosen image in the preview area.
      image.src = url;
      image.hidden = false;
      video.hidden = true;
      placeholder.hidden = true;

      const data = decodeCanvas();
      if (data) {
        showResult(data);
      } else {
        setStatus("No QR code found in that image. Try a clearer or closer photo.", "error");
      }
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setStatus("Could not load that image.", "error");
    };
    img.src = url;
  }

  // ---------- Events ----------
  btnCamera.addEventListener("click", () => {
    if (btnCamera.dataset.active) stopCamera();
    else startCamera();
  });
  btnUpload.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    handleFile(e.target.files && e.target.files[0]);
    fileInput.value = "";
  });

  btnCopy.addEventListener("click", async () => {
    if (!lastDecoded) return;
    try {
      await navigator.clipboard.writeText(lastDecoded);
      setStatus("Copied to clipboard.", "ok");
    } catch (_) {
      const ta = document.createElement("textarea");
      ta.value = lastDecoded;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setStatus("Copied to clipboard.", "ok");
      } catch (e2) {
        setStatus("Could not copy automatically — select the text and copy it.", "error");
      }
      document.body.removeChild(ta);
    }
  });

  btnClear.addEventListener("click", () => {
    clearResult();
    showPlaceholder("Camera preview will appear here");
  });

  window.addEventListener("pagehide", () => stopCamera(true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(true); });
})();
