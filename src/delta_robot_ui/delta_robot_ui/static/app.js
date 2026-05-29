const state = {
  snapshot: null,
  waypoints: [],
  presets: [],
  lastCheck: null,
  lastSequenceMessage: "",
};

const elements = {
  wsStatus: document.getElementById("wsStatus"),
  jointStatus: document.getElementById("jointStatus"),
  ikStatus: document.getElementById("ikStatus"),
  actionStatus: document.getElementById("actionStatus"),
  stateAge: document.getElementById("stateAge"),
  stateX: document.getElementById("stateX"),
  stateY: document.getElementById("stateY"),
  stateZ: document.getElementById("stateZ"),
  angleA: document.getElementById("angleA"),
  angleB: document.getElementById("angleB"),
  angleC: document.getElementById("angleC"),
  targetX: document.getElementById("targetX"),
  targetY: document.getElementById("targetY"),
  targetZ: document.getElementById("targetZ"),
  stepSize: document.getElementById("stepSize"),
  targetResult: document.getElementById("targetResult"),
  checkTarget: document.getElementById("checkTarget"),
  moveTarget: document.getElementById("moveTarget"),
  addTarget: document.getElementById("addTarget"),
  addCurrent: document.getElementById("addCurrent"),
  waypointBody: document.getElementById("waypointBody"),
  presetSelect: document.getElementById("presetSelect"),
  loadPreset: document.getElementById("loadPreset"),
  runSequence: document.getElementById("runSequence"),
  stopSequence: document.getElementById("stopSequence"),
  exportCsv: document.getElementById("exportCsv"),
  importCsv: document.getElementById("importCsv"),
  sequenceStatus: document.getElementById("sequenceStatus"),
  feedbackState: document.getElementById("feedbackState"),
  activityLog: document.getElementById("activityLog"),
};

function numberValue(element, fallback = 0) {
  const value = Number.parseFloat(element.value);
  return Number.isFinite(value) ? value : fallback;
}

function targetFromInputs() {
  return {
    x: numberValue(elements.targetX),
    y: numberValue(elements.targetY),
    z: numberValue(elements.targetZ, -100),
  };
}

function setTargetInputs(target) {
  elements.targetX.value = round(target.x);
  elements.targetY.value = round(target.y);
  elements.targetZ.value = round(target.z);
  state.lastCheck = null;
  elements.moveTarget.disabled = true;
  elements.targetResult.textContent = "Unchecked";
  elements.targetResult.className = "muted";
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function formatMm(value) {
  return Number.isFinite(value) ? `${round(value)} mm` : "--";
}

function formatDeg(value) {
  return Number.isFinite(value) ? `${round(value)} deg` : "--";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || response.statusText);
  }
  return payload;
}

function setPill(element, label, ready) {
  element.textContent = label;
  element.className = `pill ${ready ? "ok" : "bad"}`;
}

function renderSnapshot(snapshot) {
  state.snapshot = snapshot;
  state.presets = snapshot.presets || [];
  renderPresets();

  const robotState = snapshot.state || {};
  const health = snapshot.health || {};
  const position = robotState.position_mm || {};
  elements.stateX.textContent = formatMm(position.x);
  elements.stateY.textContent = formatMm(position.y);
  elements.stateZ.textContent = formatMm(position.z);
  elements.stateAge.textContent = robotState.age_sec == null ? "No data" : `${round(robotState.age_sec)} s old`;

  const angles = robotState.motor_angles_deg || [];
  elements.angleA.textContent = formatDeg(angles[0]);
  elements.angleB.textContent = formatDeg(angles[1]);
  elements.angleC.textContent = formatDeg(angles[2]);

  setPill(elements.jointStatus, "Joint states", Boolean(health.joint_states));
  setPill(elements.ikStatus, "IK", Boolean(health.ikin_service));
  setPill(elements.actionStatus, "Trajectory", Boolean(health.trajectory_action));

  const sequence = snapshot.sequence || {};
  elements.sequenceStatus.textContent = sequence.message || "Ready";
  const feedback = sequence.feedback;
  elements.feedbackState.textContent = feedback
    ? `Feedback ${formatMm(feedback.x)}, ${formatMm(feedback.y)}, ${formatMm(feedback.z)}`
    : sequence.phase || "Idle";
  elements.runSequence.disabled = Boolean(sequence.running) || state.waypoints.length === 0;
  elements.moveTarget.disabled = Boolean(sequence.running) || !canMove();

  if (sequence.message && sequence.message !== state.lastSequenceMessage) {
    log(sequence.message);
    state.lastSequenceMessage = sequence.message;
  }
}

function renderPresets() {
  const selected = elements.presetSelect.value;
  elements.presetSelect.innerHTML = "";
  for (const preset of state.presets) {
    const option = document.createElement("option");
    option.value = preset.name;
    option.textContent = preset.name;
    elements.presetSelect.append(option);
  }
  if ([...elements.presetSelect.options].some((option) => option.value === selected)) {
    elements.presetSelect.value = selected;
  }
}

function canMove() {
  const health = state.snapshot?.health || {};
  return Boolean(state.lastCheck?.reachable && health.ikin_service && health.trajectory_action);
}

function renderWaypoints() {
  elements.waypointBody.innerHTML = "";
  state.waypoints.forEach((waypoint, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input data-field="name" value="${escapeAttribute(waypoint.name)}"></td>
      <td><input data-field="x" type="number" step="1" value="${round(waypoint.target.x)}"></td>
      <td><input data-field="y" type="number" step="1" value="${round(waypoint.target.y)}"></td>
      <td><input data-field="z" type="number" step="1" value="${round(waypoint.target.z)}"></td>
      <td><input data-field="dwell_seconds" type="number" step="0.1" min="0" value="${round(waypoint.dwell_seconds)}"></td>
      <td><div class="row-actions">
        <button data-action="up" title="Move up">↑</button>
        <button data-action="down" title="Move down">↓</button>
        <button data-action="delete" title="Delete">×</button>
      </div></td>
    `;
    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => updateWaypoint(index, input.dataset.field, input.value));
    });
    row.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => handleRowAction(index, button.dataset.action));
    });
    elements.waypointBody.append(row);
  });
  elements.runSequence.disabled = state.waypoints.length === 0 || Boolean(state.snapshot?.sequence?.running);
}

function updateWaypoint(index, field, value) {
  const waypoint = state.waypoints[index];
  if (!waypoint) return;
  if (field === "name") waypoint.name = value.trim() || `Waypoint ${index + 1}`;
  if (["x", "y", "z"].includes(field)) waypoint.target[field] = Number.parseFloat(value) || 0;
  if (field === "dwell_seconds") waypoint.dwell_seconds = Math.max(0, Number.parseFloat(value) || 0);
}

function handleRowAction(index, action) {
  if (action === "delete") state.waypoints.splice(index, 1);
  if (action === "up" && index > 0) {
    [state.waypoints[index - 1], state.waypoints[index]] = [state.waypoints[index], state.waypoints[index - 1]];
  }
  if (action === "down" && index < state.waypoints.length - 1) {
    [state.waypoints[index + 1], state.waypoints[index]] = [state.waypoints[index], state.waypoints[index + 1]];
  }
  renderWaypoints();
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function addWaypoint(name, target, dwell = 0) {
  state.waypoints.push({ name, target: { ...target }, dwell_seconds: dwell });
  renderWaypoints();
}

async function checkTarget() {
  try {
    const result = await api("/api/target/check", {
      method: "POST",
      body: JSON.stringify({ target: targetFromInputs() }),
    });
    state.lastCheck = result;
    elements.targetResult.textContent = result.reachable
      ? `OK ${result.motor_angles_deg.map(formatDeg).join(" / ")}`
      : result.message;
    elements.targetResult.className = result.reachable ? "muted ok-text" : "muted bad-text";
    elements.moveTarget.disabled = !canMove();
    log(result.message);
  } catch (error) {
    state.lastCheck = null;
    elements.moveTarget.disabled = true;
    elements.targetResult.textContent = error.message;
    elements.targetResult.className = "muted bad-text";
    log(error.message);
  }
}

async function moveTarget() {
  try {
    const result = await api("/api/move", {
      method: "POST",
      body: JSON.stringify({ target: targetFromInputs() }),
    });
    log(result.message);
  } catch (error) {
    log(error.message);
  }
}

async function runSequence() {
  try {
    const result = await api("/api/sequence", {
      method: "POST",
      body: JSON.stringify({ waypoints: state.waypoints }),
    });
    log(result.message);
  } catch (error) {
    log(error.message);
  }
}

async function stopSequence() {
  try {
    const result = await api("/api/sequence/stop", { method: "POST", body: "{}" });
    log(result.message);
  } catch (error) {
    log(error.message);
  }
}

function loadSelectedPreset() {
  const preset = state.presets.find((item) => item.name === elements.presetSelect.value);
  if (!preset) return;
  state.waypoints = preset.waypoints.map((waypoint) => ({
    name: waypoint.name,
    target: { ...waypoint.target },
    dwell_seconds: waypoint.dwell_seconds,
  }));
  renderWaypoints();
  log(`Loaded ${preset.name}`);
}

function exportCsv() {
  const rows = [["name", "x", "y", "z", "dwell_seconds"]];
  for (const waypoint of state.waypoints) {
    rows.push([
      waypoint.name,
      waypoint.target.x,
      waypoint.target.y,
      waypoint.target.z,
      waypoint.dwell_seconds,
    ]);
  }
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  link.download = "delta-waypoints.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function importCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result || ""));
    state.waypoints = rows.slice(1).filter((row) => row.length >= 4).map((row, index) => ({
      name: row[0] || `Waypoint ${index + 1}`,
      target: {
        x: Number.parseFloat(row[1]) || 0,
        y: Number.parseFloat(row[2]) || 0,
        z: Number.parseFloat(row[3]) || -100,
      },
      dwell_seconds: Math.max(0, Number.parseFloat(row[4]) || 0),
    }));
    renderWaypoints();
    log(`Imported ${state.waypoints.length} waypoints`);
  };
  reader.readAsText(file);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()} ${message}`;
  elements.activityLog.prepend(item);
  while (elements.activityLog.children.length > 30) {
    elements.activityLog.lastChild.remove();
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
  socket.addEventListener("open", () => {
    elements.wsStatus.textContent = "Connected";
    elements.wsStatus.className = "pill ok";
    log("Dashboard connected");
  });
  socket.addEventListener("message", (event) => renderSnapshot(JSON.parse(event.data)));
  socket.addEventListener("close", () => {
    elements.wsStatus.textContent = "Reconnecting";
    elements.wsStatus.className = "pill warn";
    setTimeout(connectWebSocket, 1000);
  });
}

document.querySelectorAll("[data-jog]").forEach((button) => {
  button.addEventListener("click", () => {
    const [axis, sign] = button.dataset.jog.split(":");
    const target = targetFromInputs();
    target[axis] += Number(sign) * Math.max(1, numberValue(elements.stepSize, 5));
    setTargetInputs(target);
  });
});

[elements.targetX, elements.targetY, elements.targetZ].forEach((input) => {
  input.addEventListener("input", () => {
    state.lastCheck = null;
    elements.moveTarget.disabled = true;
    elements.targetResult.textContent = "Unchecked";
  });
});

elements.checkTarget.addEventListener("click", checkTarget);
elements.moveTarget.addEventListener("click", moveTarget);
elements.addTarget.addEventListener("click", () => addWaypoint("Typed target", targetFromInputs(), 0));
elements.addCurrent.addEventListener("click", () => {
  const position = state.snapshot?.state?.position_mm;
  if (!position) {
    log("No current position available");
    return;
  }
  addWaypoint("Current pose", position, 0);
});
elements.loadPreset.addEventListener("click", loadSelectedPreset);
elements.runSequence.addEventListener("click", runSequence);
elements.stopSequence.addEventListener("click", stopSequence);
elements.exportCsv.addEventListener("click", exportCsv);
elements.importCsv.addEventListener("change", () => {
  const file = elements.importCsv.files[0];
  if (file) importCsv(file);
  elements.importCsv.value = "";
});

connectWebSocket();
renderWaypoints();