const AWS_IOT_ENDPOINT = "axojaxudoqhck-ats.iot.ap-south-1.amazonaws.com";
const API_URL = "https://ia5xnyll1h.execute-api.ap-south-1.amazonaws.com/data";
const CONTROL_API_URL = "https://gbptps9jj4.execute-api.ap-south-1.amazonaws.com/esp32-control";

const deviceState = document.querySelector("#deviceState");
const lastUpdated = document.querySelector("#lastUpdated");
const requestState = document.querySelector("#requestState");
const messageOutput = document.querySelector("#messageOutput");
const refreshButton = document.querySelector("#refreshButton");
const dataRequestForm = document.querySelector("#dataRequestForm");
const deviceId = document.querySelector("#deviceId");
const startDate = document.querySelector("#startDate");
const endDate = document.querySelector("#endDate");
const onlineState = document.querySelector("#onlineState");
const connectionDot = document.querySelector("#connectionDot");
const nitrogenValue = document.querySelector("#nitrogenValue");
const phosphorusValue = document.querySelector("#phosphorusValue");
const potassiumValue = document.querySelector("#potassiumValue");
const menuButtons = document.querySelectorAll("[data-view]");
const viewSections = document.querySelectorAll(".view-section");
const motorOnButton = document.querySelector("#motorOnButton");
const motorOffButton = document.querySelector("#motorOffButton");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app still works online if service worker registration is blocked.
    });
  });
}

function showMessage(title, data) {
  const time = new Date().toLocaleString();
  messageOutput.textContent = `[${time}] ${title}\n\n${JSON.stringify(data, null, 2)}`;
}

function setBusy(isBusy, text = "Ready") {
  requestState.textContent = text;
  refreshButton.disabled = isBusy;
  document.querySelectorAll("button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function setConnectionState(state, text) {
  connectionDot.classList.remove("checking", "online", "offline");
  connectionDot.classList.add(state);
  onlineState.textContent = text;
}

async function readStoredData() {
  const requestBody = {
    device_id: deviceId.value.trim(),
    startdate: startDate.value.trim(),
    enddate: endDate.value.trim(),
  };

  if (!requestBody.device_id || !requestBody.startdate || !requestBody.enddate) {
    showMessage("Missing request value", {
      help: "Please enter device_id, startdate, and enddate.",
      expectedBody: {
        device_id: "esp32_01",
        startdate: "18/6/2026",
        enddate: "18/6/2026",
      },
    });
    return;
  }

  setBusy(true, "Reading NPK data...");
  setConnectionState("checking", "Checking...");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await parseResponse(response);
    const npk = extractNpkValues(data);
    updateNpkCards(npk);
    deviceState.textContent = requestBody.device_id;
    setConnectionState(response.ok ? "online" : "offline", response.ok ? "Online" : "API Error");
    lastUpdated.textContent = `Last updated: ${new Date().toLocaleString()}`;
    showMessage(response.ok ? "NPK data response" : "API error response", {
      request: requestBody,
      response: data,
    });
  } catch (error) {
    deviceState.textContent = "Connection Failed";
    setConnectionState("offline", "Offline");
    lastUpdated.textContent = "Check API URL, CORS, and request body.";
    showMessage("NPK request error", { request: requestBody, message: error.message, apiUrl: API_URL });
  } finally {
    setBusy(false);
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      status: response.status,
      ok: response.ok,
      body: text || "(empty response)",
    };
  }
}

function extractNpkValues(data) {
  const normalizedData = normalizePayload(data);
  const records = Array.isArray(normalizedData)
    ? normalizedData
    : Array.isArray(normalizedData?.items)
      ? normalizedData.items
      : Array.isArray(normalizedData?.data)
        ? normalizedData.data
        : Array.isArray(normalizedData?.body)
          ? normalizedData.body
          : [normalizePayload(normalizedData?.body) || normalizedData];

  const latest = normalizePayload(records.filter(Boolean).at(-1)) || {};
  return {
    nitrogen: pickValue(latest, ["nitrogen", "Nitrogen", "N", "n", "N_value", "nitrogen_value"]),
    phosphorus: pickValue(latest, ["phosphorus", "Phosphorus", "P", "p", "P_value", "phosphorus_value"]),
    potassium: pickValue(latest, ["potassium", "Potassium", "K", "k", "K_value", "potassium_value"]),
  };
}

function normalizePayload(data) {
  if (typeof data !== "string") {
    return data;
  }

  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function pickValue(source, keys) {
  const normalizedSource = normalizePayload(source) || {};
  for (const key of keys) {
    if (
      normalizedSource[key] !== undefined &&
      normalizedSource[key] !== null &&
      normalizedSource[key] !== ""
    ) {
      return normalizedSource[key];
    }
  }
  return "--";
}

function updateNpkCards(npk) {
  nitrogenValue.textContent = npk.nitrogen;
  phosphorusValue.textContent = npk.phosphorus;
  potassiumValue.textContent = npk.potassium;
}

function switchView(viewId) {
  menuButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });

  viewSections.forEach((section) => {
    section.classList.toggle("active", section.id === viewId);
  });
}

function showPendingCommand(command) {
  showMessage(`${command} command`, {
    status: "UI ready",
    nextStep: "Connect this button to your AWS command API endpoint.",
    expectedFlow: "Mobile app -> API Gateway -> AWS IoT topic -> ESP32 motor",
    command,
  });
}

async function sendControlCommand(state) {
  const requestBody = {
    led: state,
  };
  const commandName = state === 1 ? "LED_ON" : "LED_OFF";

  setBusy(true, `Sending ${commandName}...`);

  try {
    const response = await fetch(CONTROL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await parseResponse(response);
    showMessage(response.ok ? `${commandName} sent` : `${commandName} failed`, {
      request: requestBody,
      response: data,
    });
  } catch (error) {
    showMessage(`${commandName} error`, {
      request: requestBody,
      message: error.message,
      apiUrl: CONTROL_API_URL,
    });
  } finally {
    setBusy(false);
  }
}

refreshButton.addEventListener("click", readStoredData);

dataRequestForm.addEventListener("submit", (event) => {
  event.preventDefault();
  readStoredData();
});

menuButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

motorOnButton.addEventListener("click", () => sendControlCommand(1));
motorOffButton.addEventListener("click", () => sendControlCommand(0));

readStoredData();
