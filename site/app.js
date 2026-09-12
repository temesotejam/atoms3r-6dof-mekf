const $ = (id) => document.getElementById(id);

const connectButton = $("connectSerial");
const disconnectButton = $("disconnectSerial");
const clearButton = $("clearLog");
const downloadButton = $("downloadLog");
const autoScroll = $("autoScroll");
const terminal = $("terminal");
const serialStatus = $("serialStatus");
const lineCount = $("lineCount");

const expectedColumns = [
  "t_us", "rate_hz", "roll_deg", "pitch_deg", "yaw_deg",
  "gx_dps", "gy_dps", "gz_dps", "bgx_dps", "bgy_dps", "bgz_dps",
  "acc_norm_g", "acc_mag_err_g", "acc_resid_deg", "acc_conf", "acc_used",
];

let port = null;
let reader = null;
let readTask = null;
let keepReading = false;
let receiveBuffer = "";
let csvHeader = expectedColumns.slice();
let logLines = ["# Serial monitor ready."];
const maxRenderedLines = 2500;

function setStatus(text, kind = "neutral") {
  serialStatus.textContent = text;
  serialStatus.className = `status ${kind}`;
}

function renderLog() {
  terminal.textContent = logLines.slice(-maxRenderedLines).join("\n");
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
  $(id).textContent = value === null ? "--" : value.toFixed(digits);
}

function parseLine(line) {
  if (!line || line.startsWith("#")) return;

  if (line.startsWith("t_us,rate_hz,")) {
    csvHeader = line.split(",");
    return;
  }

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

  if ([roll, pitch, yaw, rate, confidence, used].some((v) => v === null)) return;

  setMetric("rollValue", roll);
  setMetric("pitchValue", pitch);
  setMetric("yawValue", yaw);
  setMetric("rateValue", rate, 1);
  setMetric("confValue", confidence, 3);

  const clamped = Math.max(0, Math.min(1, confidence));
  $("confBar").style.width = `${clamped * 100}%`;
  $("confPercent").textContent = `${Math.round(clamped * 100)}%`;

  const isUsed = used >= 0.5;
  $("usedValue").textContent = isUsed ? "USED" : "REJECT";
  $("usedValue").style.color = isUsed ? "#86efac" : "#fbbf24";
  $("usedLabel").textContent = isUsed ? "Accel update" : "Gyro only";
  $("rejectionMessage").textContent = isUsed
    ? "Accelを観測更新に使用中です。"
    : "AccelをReject中です。現在はGyro predictionを優先しています。";
}

async function readLoop(activePort) {
  const decoder = new TextDecoderStream();
  const readableClosed = activePort.readable.pipeTo(decoder.writable).catch(() => {});
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
    if (keepReading) appendLine(`# Serial read error: ${error.message}`);
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
    const selectedPort = await navigator.serial.requestPort();
    await selectedPort.open({ baudRate: 115200 });
    port = selectedPort;
    keepReading = true;
    receiveBuffer = "";
    csvHeader = expectedColumns.slice();
    connectButton.disabled = true;
    disconnectButton.disabled = false;
    setStatus("115200 bps 接続中", "good");
    appendLine("# Serial connected at 115200 bps.");
    readTask = readLoop(selectedPort);
  } catch (error) {
    setStatus("接続失敗", "bad");
    appendLine(`# Serial connection error: ${error.message}`);
    port = null;
  }
}

async function disconnectSerial() {
  const activePort = port;
  if (!activePort) return;

  keepReading = false;
  try {
    if (reader) await reader.cancel();
  } catch (_) {}

  try {
    if (readTask) await readTask;
  } catch (_) {}
  readTask = null;

  try {
    await activePort.close();
  } catch (error) {
    appendLine(`# Serial close warning: ${error.message}`);
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
  const disconnectedPort = event.port ?? event.target;
  if (port && disconnectedPort === port) await disconnectSerial();
});

renderLog();
