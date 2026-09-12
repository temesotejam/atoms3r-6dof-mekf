const $ = (id) => document.getElementById(id);

const connectButton = $("connectSerial");
const disconnectButton = $("disconnectSerial");
const clearButton = $("clearLog");
const downloadButton = $("downloadLog");
const autoScroll = $("autoScroll");
const terminal = $("terminal");
const serialStatus = $("serialStatus");
const lineCount = $("lineCount");

let port = null;
let reader = null;
let keepReading = false;
let receiveBuffer = "";
let csvHeader = null;
let logLines = ["# Serial monitor ready."];
const maxRenderedLines = 2500;

function setStatus(text, kind = "neutral") {
  serialStatus.textContent = text;
  serialStatus.className = `status ${kind}`;
}

function renderLog() {
  const view = logLines.slice(-maxRenderedLines);
  terminal.textContent = view.join("\n");
  lineCount.textContent = `${logLines.length} lines`;
  if (autoScroll.checked) terminal.scrollTop = terminal.scrollHeight;
}

function appendLine(line) {
  logLines.push(line);
  renderLog();
  parseLine(line);
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function setMetric(id, value, digits = 2) {
  const element = $(id);
  if (value === null) {
    element.textContent = "--";
  } else {
    element.textContent = value.toFixed(digits);
  }
}

function parseLine(line) {
  if (!line || line.startsWith("#")) return;

  if (line.startsWith("t_us,rate_hz,")) {
    csvHeader = line.split(",");
    return;
  }

  if (!csvHeader) return;
  const values = line.split(",");
  if (values.length !== csvHeader.length) return;

  const row = {};
  csvHeader.forEach((key, i) => { row[key] = values[i]; });

  const roll = finiteNumber(row.roll_deg);
  const pitch = finiteNumber(row.pitch_deg);
  const yaw = finiteNumber(row.yaw_deg);
  const rate = finiteNumber(row.rate_hz);
  const confidence = finiteNumber(row.acc_conf);
  const used = finiteNumber(row.acc_used);

  setMetric("rollValue", roll);
  setMetric("pitchValue", pitch);
  setMetric("yawValue", yaw);
  setMetric("rateValue", rate, 1);
  setMetric("confValue", confidence, 3);

  if (confidence !== null) {
    const clamped = Math.max(0, Math.min(1, confidence));
    $("confBar").style.width = `${clamped * 100}%`;
    $("confPercent").textContent = `${Math.round(clamped * 100)}%`;
  }

  if (used !== null) {
    const isUsed = used >= 0.5;
    $("usedValue").textContent = isUsed ? "USED" : "REJECT";
    $("usedValue").style.color = isUsed ? "#86efac" : "#fbbf24";
    $("usedLabel").textContent = isUsed ? "Accel update" : "Gyro only";
    $("rejectionMessage").textContent = isUsed
      ? "Accelを観測更新に使用中です。"
      : "AccelをReject中です。現在はGyro predictionを優先しています。";
  }
}

async function readLoop() {
  const decoder = new TextDecoderStream();
  const readableClosed = port.readable.pipeTo(decoder.writable).catch(() => {});
  reader = decoder.readable.getReader();

  try {
    while (keepReading) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      receiveBuffer += value;
      const lines = receiveBuffer.split(/\r?\n/);
      receiveBuffer = lines.pop() ?? "";
      lines.forEach(appendLine);
    }
  } catch (error) {
    appendLine(`# Serial read error: ${error.message}`);
  } finally {
    try { reader.releaseLock(); } catch (_) {}
    reader = null;
    await readableClosed;
  }
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    setStatus("Web Serial非対応", "bad");
    appendLine("# ERROR: Web Serial is not available. Use desktop Chrome or Edge over HTTPS.");
    return;
  }

  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    keepReading = true;
    receiveBuffer = "";
    csvHeader = null;
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    setStatus("115200 bps 接続中", "good");
    appendLine("# Serial connected at 115200 bps.");
    readLoop();
  } catch (error) {
    setStatus("接続失敗", "bad");
    appendLine(`# Serial connection error: ${error.message}`);
    if (port?.readable || port?.writable) {
      try { await port.close(); } catch (_) {}
    }
    port = null;
  }
}

async function disconnectSerial() {
  keepReading = false;
  try {
    if (reader) await reader.cancel();
  } catch (_) {}

  if (port) {
    try { await port.close(); } catch (error) {
      appendLine(`# Serial close warning: ${error.message}`);
    }
  }

  port = null;
  reader = null;
  connectButton.disabled = false;
  disconnectButton.disabled = true;
  setStatus("未接続", "neutral");
  appendLine("# Serial disconnected.");
}

function clearLog() {
  logLines = [];
  renderLog();
}

function downloadLog() {
  const blob = new Blob([logLines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `atoms3r-mekf-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

connectButton.addEventListener("click", connectSerial);
disconnectButton.addEventListener("click", disconnectSerial);
clearButton.addEventListener("click", clearLog);
downloadButton.addEventListener("click", downloadLog);
autoScroll.addEventListener("change", () => {
  if (autoScroll.checked) terminal.scrollTop = terminal.scrollHeight;
});

if (!("serial" in navigator)) {
  setStatus("Web Serial非対応", "bad");
  connectButton.disabled = true;
}

navigator.serial?.addEventListener("disconnect", async (event) => {
  if (port && event.target === port) await disconnectSerial();
});

renderLog();
