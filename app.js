/* QR Scanner — plain JS, decodes via jsQR (loaded globally as `jsQR`). */
(function () {
  "use strict";

  // --- Elements ---
  const tabCamera = document.getElementById("tab-camera");
  const tabUpload = document.getElementById("tab-upload");
  const panelCamera = document.getElementById("panel-camera");
  const panelUpload = document.getElementById("panel-upload");

  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const btnStart = document.getElementById("btn-start");
  const btnStop = document.getElementById("btn-stop");
  const cameraHint = document.getElementById("camera-hint");

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const preview = document.getElementById("preview");

  const result = document.getElementById("result");
  const resultContent = document.getElementById("result-content");
  const resultBadge = document.getElementById("result-badge");
  const btnCopy = document.getElementById("btn-copy");
  const btnOpen = document.getElementById("btn-open");
  const btnClear = document.getElementById("btn-clear");

  const statusEl = document.getElementById("status");

  // --- State ---
  let stream = null;
  let rafId = null;
  let lastDecoded = "";

  // --- Helpers ---
  function setStatus(msg, kind) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (kind ? " status--" + kind : "");
  }

  function isUrl(text) {
    try {
      const u = new URL(text.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch (_) {
      return false;
    }
  }

  function showResult(text) {
    lastDecoded = text;
    resultContent.textContent = "";

    if (isUrl(text)) {
      resultBadge.textContent = "URL";
      const a = document.createElement("a");
      a.href = text.trim();
      a.textContent = text;
      a.target = "_blank";
      a.rel = "noopener";
      resultContent.appendChild(a);
      btnOpen.href = text.trim();
      btnOpen.hidden = false;
    } else {
      resultBadge.textContent = "TEXT";
      resultContent.textContent = text;
      btnOpen.hidden = true;
    }

    result.hidden = false;
    setStatus("QR code decoded.", "ok");
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function clearResult() {
    result.hidden = true;
    resultContent.textContent = "";
    btnOpen.hidden = true;
    lastDecoded = "";
    setStatus("");
  }

  /** Run jsQR over the current canvas pixels. Returns decoded string or null. */
  function decodeCanvas() {
    const { width, height } = canvas;
    if (!width || !height) return null;
    const imageData = ctx.getImageData(0, 0, width, height);
    const code = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
    return code && code.data ? code.data : null;
  }

  // --- Camera flow ---
  async function startCamera() {
    clearResult();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera is not supported in this browser.", "error");
      return;
    }
    if (!window.isSecureContext) {
      setStatus("Camera needs HTTPS or http://localhost. Use the Upload tab instead.", "error");
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

    btnStart.disabled = true;
    btnStop.disabled = false;
    cameraHint.textContent = "Scanning… hold a QR code inside the frame.";
    setStatus("");
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

  function stopCamera() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    video.srcObject = null;
    btnStart.disabled = false;
    btnStop.disabled = true;
    cameraHint.textContent = "Press “Start camera” and point it at a QR code.";
  }

  // --- Upload flow ---
  function handleFile(file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      setStatus("Please choose an image file.", "error");
      return;
    }
    clearResult();
    setStatus("Reading image…");

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      // Cap very large images for performance while keeping aspect ratio.
      const MAX = 1600;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const scale = Math.min(1, MAX / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);

      preview.src = file && img.src;
      preview.hidden = false;

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

  // --- Tabs ---
  function activateTab(which) {
    const isCamera = which === "camera";
    tabCamera.classList.toggle("tab--active", isCamera);
    tabUpload.classList.toggle("tab--active", !isCamera);
    tabCamera.setAttribute("aria-selected", String(isCamera));
    tabUpload.setAttribute("aria-selected", String(!isCamera));
    panelCamera.classList.toggle("panel--active", isCamera);
    panelUpload.classList.toggle("panel--active", !isCamera);
    panelCamera.hidden = !isCamera;
    panelUpload.hidden = isCamera;
    if (isCamera) {
      // leaving upload: nothing to stop
    } else {
      stopCamera();
    }
    clearResult();
  }

  // --- Wire up events ---
  tabCamera.addEventListener("click", () => activateTab("camera"));
  tabUpload.addEventListener("click", () => activateTab("upload"));

  btnStart.addEventListener("click", startCamera);
  btnStop.addEventListener("click", () => {
    stopCamera();
    setStatus("");
  });

  fileInput.addEventListener("change", (e) => handleFile(e.target.files && e.target.files[0]));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dropzone--over");
    })
  );
  ["dragleave", "dragend", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dropzone--over");
    })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    handleFile(file);
  });

  btnCopy.addEventListener("click", async () => {
    if (!lastDecoded) return;
    try {
      await navigator.clipboard.writeText(lastDecoded);
      setStatus("Copied to clipboard.", "ok");
    } catch (_) {
      // Fallback for older / non-secure contexts.
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
    preview.hidden = true;
    preview.removeAttribute("src");
    fileInput.value = "";
  });

  // Clean up the camera if the page is hidden/closed.
  window.addEventListener("pagehide", stopCamera);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopCamera();
  });
})();
