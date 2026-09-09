const form = document.querySelector("#checkinForm");
const result = document.querySelector("#checkinResult");
const checkinKey = document.querySelector("#checkinKey");
const qrCode = document.querySelector("#qrCode");
const startCameraButton = document.querySelector("#startCamera");
const stopCameraButton = document.querySelector("#stopCamera");
const keepCameraActive = document.querySelector("#keepCameraActive");
const cameraStatus = document.querySelector("#cameraStatus");
const qrReader = document.querySelector("#qrReader");
const validatedCount = document.querySelector("#validatedCount");
const API_BASE_URL = (window.INSOMNIO_API_BASE_URL || "").replace(/\/$/, "");
let qrScanner;
let isCameraActive = false;
let isValidating = false;
let lastScannedCode = "";
let lastScanAt = 0;
let scanFrameLocked = false;
let nativeStream;
let nativeVideo;
let nativeDetector;
let nativeScanRunning = false;

async function refreshValidationCount() {
  if (!checkinKey.value.trim()) return;
  try {
    const response = await fetch(`${API_BASE_URL}/api/checkin/stats`, {
      headers: { "x-checkin-key": checkinKey.value },
    });
    const data = await response.json();
    if (response.ok) validatedCount.textContent = data.validated;
  } catch {
    validatedCount.textContent = "--";
  }
}

async function validateTicket(code) {
  if (isValidating) return;
  isValidating = true;
  result.textContent = "Validando...";
  result.className = "checkin-result";
  try {
    const response = await fetch(`${API_BASE_URL}/api/checkin/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-checkin-key": checkinKey.value },
      body: JSON.stringify({ code }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    result.classList.add(data.status === "approved" ? "success" : "warning");
    result.textContent = data.status === "approved"
      ? `Entrada válida: ${data.ticket.holderName} (${data.ticket.type}). Ingreso registrado.`
      : `Esta entrada ya fue utilizada por ${data.ticket.holderName}.`;
    await refreshValidationCount();
  } catch (error) {
    result.classList.add("error-state");
    result.textContent = error.message || "No fue posible validar la entrada.";
  } finally {
    isValidating = false;
  }
}

async function stopCamera() {
  if (qrScanner && isCameraActive) {
    await qrScanner.stop().catch(() => {});
  }
  qrScanner = undefined;
  if (nativeStream) nativeStream.getTracks().forEach((track) => track.stop());
  nativeStream = undefined;
  nativeScanRunning = false;
  nativeDetector = undefined;
  if (nativeVideo) nativeVideo.remove();
  nativeVideo = undefined;
  isCameraActive = false;
  qrReader.hidden = true;
  stopCameraButton.hidden = true;
  startCameraButton.disabled = false;
  cameraStatus.textContent = "Camara cerrada.";
}

async function handleDetectedCode(decodedText) {
  const now = Date.now();
  if (isValidating || scanFrameLocked || (decodedText === lastScannedCode && now - lastScanAt < 5000)) return;
  scanFrameLocked = true;
  lastScannedCode = decodedText;
  lastScanAt = now;
  qrCode.value = decodedText;
  cameraStatus.textContent = "QR detectado. Validando entrada...";
  if (!keepCameraActive.checked) await stopCamera();
  await validateTicket(decodedText);
  scanFrameLocked = false;
  if (isCameraActive) cameraStatus.textContent = "Listo. Apunta al siguiente codigo QR.";
}

async function scanNativeVideo() {
  if (!nativeScanRunning || !nativeDetector || !nativeVideo) return;
  try {
    if (nativeVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const codes = await nativeDetector.detect(nativeVideo);
      if (codes.length) await handleDetectedCode(codes[0].rawValue);
    }
  } catch {
    // A single unreadable video frame should not stop the camera session.
  }
  if (nativeScanRunning) requestAnimationFrame(scanNativeVideo);
}

async function startNativeScanner() {
  if (!("BarcodeDetector" in window)) return false;
  const formats = typeof BarcodeDetector.getSupportedFormats === "function"
    ? await BarcodeDetector.getSupportedFormats().catch(() => [])
    : [];
  if (formats.length && !formats.includes("qr_code")) return false;
  nativeDetector = new BarcodeDetector({ formats: ["qr_code"] });
  nativeStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  nativeVideo = document.createElement("video");
  nativeVideo.setAttribute("playsinline", "");
  nativeVideo.muted = true;
  nativeVideo.srcObject = nativeStream;
  qrReader.replaceChildren(nativeVideo);
  await nativeVideo.play();
  nativeScanRunning = true;
  isCameraActive = true;
  requestAnimationFrame(scanNativeVideo);
  return true;
}

async function startCamera() {
  if (!checkinKey.value.trim()) {
    result.className = "checkin-result error-state";
    result.textContent = "Ingresa la clave de validacion antes de abrir la camara.";
    checkinKey.focus();
    return;
  }
  if (!window.Html5Qrcode) {
    cameraStatus.textContent = "No fue posible cargar el lector QR. Revisa tu conexion e intenta nuevamente.";
    return;
  }

  qrReader.hidden = false;
  startCameraButton.disabled = true;
  cameraStatus.textContent = "Solicitando acceso a la camara...";
  try {
    let nativeStarted = false;
    try {
      nativeStarted = await startNativeScanner();
    } catch {
      await stopCamera();
      qrReader.hidden = false;
    }
    if (!nativeStarted) {
      qrScanner = new Html5Qrcode("qrReader", { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE] });
      await qrScanner.start(
        { facingMode: "environment" },
        { fps: 18, qrbox: (width) => ({ width: Math.min(320, width * 0.8), height: Math.min(320, width * 0.8) }), aspectRatio: 1, disableFlip: false },
        handleDetectedCode,
        () => {},
      );
      isCameraActive = true;
    }
    stopCameraButton.hidden = false;
    cameraStatus.textContent = "Apunta la camara al codigo QR. La validacion es automatica.";
  } catch (error) {
    await stopCamera();
    qrReader.hidden = true;
    startCameraButton.disabled = false;
    cameraStatus.textContent = "No pudimos abrir la camara. Revisa el permiso del navegador e intenta nuevamente.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!qrCode.value.trim()) return;
  await validateTicket(qrCode.value);
});

startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", () => { stopCamera(); });
checkinKey.addEventListener("change", refreshValidationCount);
window.addEventListener("pagehide", () => { if (isCameraActive) stopCamera(); });
