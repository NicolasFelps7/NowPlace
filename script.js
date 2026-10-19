/* NowPlace SA2 — arquivo JavaScript único.
   Câmera, geolocalização, API, Storage e interface em um só arquivo. */

// ===== Configuração =====
// A API indicada pela professora é tentada primeiro. A segunda URL é compatível
// com JSONPlaceholder e serve como alternativa caso a primeira esteja indisponível.
const CONFIG = {
  API_BASE_URL: "https://api.jsonplaceholder.dev",
  API_FALLBACK_URL: "https://jsonplaceholder.typicode.com",
  ENDPOINTS: {
    health: "/posts/1",
    posts: "/posts",
  },
  GEOCODER_BASE_URL: "https://nominatim.openstreetmap.org/reverse",
  REQUEST_TIMEOUT_MS: 6500,
  PHOTO_MAX_WIDTH: 480,
  PHOTO_QUALITY: 0.5,
  FEED_WINDOW_HOURS: 24,
};


// ===== Storage local =====
// Storage do navegador: identificação e regra local de 24 horas (RN05).
// A API é a fonte remota de confirmação; o horário confirmado também é salvo aqui.

const KEY_USER = "nowplace:user";
const WINDOW_MS = CONFIG.FEED_WINDOW_HOURS * 60 * 60 * 1000;
const KEY_Nows = "nowplace:nows";
const MAX_LOCAL_Nows = 16;

function userKey(name) {
  return String(name || "").trim().toLocaleLowerCase("pt-BR");
}
function lastPostKey(name) {
  return `nowplace:lastPostAt:${encodeURIComponent(userKey(name))}`;
}

function getUser() {
  try {
    const user = JSON.parse(localStorage.getItem(KEY_USER));
    return user && typeof user.name === "string" ? user : null;
  } catch {
    return null;
  }
}

function saveUser(name) {
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const user = { name: cleanName };
  localStorage.setItem(KEY_USER, JSON.stringify(user));
  return user;
}

function clearUser() {
  // Mantemos o registro de publicação separado da sessão, por usuário.
  localStorage.removeItem(KEY_USER);
}

function setLastPostAt(name, dateLike = new Date()) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (!name || Number.isNaN(date.getTime())) return;
  localStorage.setItem(lastPostKey(name), date.toISOString());
}

function markPublishedNow(name, createdAt = new Date()) {
  setLastPostAt(name, createdAt);
}

function syncLastPostAt(name, createdAt) {
  setLastPostAt(name, createdAt);
}

function clearLastPostAt(name) {
  if (name) localStorage.removeItem(lastPostKey(name));
}

function getLastPostAt(name) {
  if (!name) return null;
  const raw = localStorage.getItem(lastPostKey(name));
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function feedAccessRemainingMs(name) {
  const last = getLastPostAt(name);
  if (!last) return 0;
  const elapsed = Date.now() - last.getTime();
  if (elapsed < 0 || elapsed >= WINDOW_MS) return 0;
  return Math.max(0, last.getTime() + WINDOW_MS - Date.now());
}

function canAccessFeed(name) {
  return feedAccessRemainingMs(name) > 0;
}


// A API de demonstração pode responder a POST sem persistir a publicação.
// Guardamos as capturas no Storage local para permitir consultar o histórico
// deste navegador, sem inventar publicações de outras pessoas.
function getLocalNows() {
  try {
    const records = JSON.parse(localStorage.getItem(KEY_Nows) || "[]");
    if (!Array.isArray(records)) return [];
    return records.filter((item) => item && item.userName && item.photoEnvironment && item.photoSelfie
      && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
  } catch {
    return [];
  }
}

function saveNow(now) {
  if (!now || !now.userName || !now.photoEnvironment || !now.photoSelfie) {
    throw new Error("Não foi possível guardar as fotos desta publicação.");
  }
  const createdAt = now.createdAt instanceof Date ? now.createdAt.toISOString() : new Date(now.createdAt).toISOString();
  const record = { ...now, createdAt, savedAt: new Date().toISOString() };
  const existing = getLocalNows().filter((item) => item.createdAt !== createdAt || item.userName !== record.userName);
  let next = [...existing, record].slice(-MAX_LOCAL_Nows);
  while (next.length) {
    try {
      localStorage.setItem(KEY_Nows, JSON.stringify(next));
      return record;
    } catch (error) {
      next = next.slice(Math.max(1, Math.ceil(next.length / 4)));
      if (next.length === 0) {
        throw new Error("O armazenamento do navegador está cheio. Apague dados antigos do site e tente novamente.");
      }
    }
  }
  throw new Error("Não foi possível guardar esta publicação no navegador.");
}


// Fachada simples para o restante do aplicativo.
const Storage = {
  getUser, saveUser, clearUser, markPublishedNow, feedAccessRemainingMs,
  canAccessFeed, saveNow, getLocalNows,
};


// ===== Câmera e Canvas =====
// MediaDevices + Canvas para a captura sequencial das duas imagens (RN02).

let currentStream = null;

async function startCamera(videoElement, facing = "environment") {
  stopCamera(videoElement);
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("A câmera exige um navegador compatível e uma origem segura (HTTPS ou localhost). ");
  }
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    videoElement.srcObject = currentStream;
    await videoElement.play();
  } catch (error) {
    stopCamera(videoElement);
    throw new Error(describeCameraError(error));
  }
}

function stopCamera(videoElement) {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
  if (videoElement) videoElement.srcObject = null;
}

function captureFrame(videoElement, canvasElement) {
  const width = videoElement.videoWidth;
  const height = videoElement.videoHeight;
  if (!width || !height) throw new Error("A câmera ainda está inicializando. Aguarde um instante e tente novamente.");
  const scale = Math.min(1, CONFIG.PHOTO_MAX_WIDTH / width);
  canvasElement.width = Math.round(width * scale);
  canvasElement.height = Math.round(height * scale);
  const context = canvasElement.getContext("2d", { alpha: false });
  if (!context) throw new Error("Não foi possível preparar a captura da imagem.");
  context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
  return canvasElement.toDataURL("image/jpeg", CONFIG.PHOTO_QUALITY);
}

function describeCameraError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permissão da câmera negada. Libere o acesso à câmera nas configurações do navegador.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Nenhuma câmera compatível foi encontrada neste dispositivo.";
    case "NotReadableError":
      return "A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.";
    default:
      return `Não foi possível abrir a câmera${error?.message ? `: ${error.message}` : "."}`;
  }
}


// ===== Geolocalização =====
// Geolocation API. As coordenadas sempre são capturadas do dispositivo (RN03).
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador não oferece suporte à localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      (error) => reject(new Error(describeGeoError(error))),
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 },
    );
  });
}

function describeGeoError(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "A permissão de localização foi negada. Libere a localização nas permissões do navegador.";
    case error.POSITION_UNAVAILABLE:
      return "O dispositivo não conseguiu determinar a localização. Verifique o GPS ou a conexão.";
    case error.TIMEOUT:
      return "O tempo para obter a localização esgotou. Tente novamente em um local com melhor sinal.";
    default:
      return "Não foi possível obter a localização do dispositivo.";
  }
}


// ===== API e publicações =====
// API JSONPlaceholder: tenta o endereço indicado pela professora e, se falhar
// a conexão, usa a API compatível usada no projeto de referência do colega.

let activeBaseUrl = null;
const normalizeBase = (url) => String(url || "").replace(/\/+$/, "");

function baseCandidates() {
  return [...new Set([activeBaseUrl, CONFIG.API_BASE_URL, CONFIG.API_FALLBACK_URL]
    .map(normalizeBase).filter(Boolean))];
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try { return await response.json(); } catch { return null; }
  }
  try { return await response.text(); } catch { return null; }
}

async function request(path, options = {}) {
  const candidates = baseCandidates();
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const baseUrl = candidates[index];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error("A API demorou para responder.")
        : new Error("Falha de conexão com " + new URL(baseUrl).hostname + ".");
      clearTimeout(timer);
      continue;
    }
    clearTimeout(timer);

    const payload = await parseResponse(response);
    if (!response.ok) {
      const detail = typeof payload === "object" && payload
        ? payload.message || payload.error || payload.status
        : payload;
      const error = new Error(detail
        ? `A API respondeu com erro ${response.status}: ${String(detail).slice(0, 140)}`
        : `A API respondeu com erro ${response.status}.`);
      // Só tenta a alternativa em erros de servidor; erros de validação devem ser exibidos.
      if (response.status >= 500 && index < candidates.length - 1) {
        lastError = error;
        continue;
      }
      throw error;
    }

    activeBaseUrl = baseUrl;
    return payload;
  }

  const error = new Error("Não foi possível conectar à API. Confira sua internet e tente novamente.");
  if (lastError) error.cause = lastError;
  throw error;
}

async function checkApiHealth() {
  const data = await request(CONFIG.ENDPOINTS.health);
  const ok = Boolean(data && typeof data === "object" && data.id != null && data.userId != null);
  return {
    ok,
    configured: ok,
    baseUrl: activeBaseUrl || CONFIG.API_BASE_URL,
    message: ok ? "API conectada" : "Resposta inesperada da API",
  };
}

function stableUserId(username) {
  let hash = 0;
  for (const character of String(username || "").trim().toLocaleLowerCase("pt-BR")) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return (hash % 10) + 1;
}

async function lookupPlaceName(latitude, longitude) {
  const url = new URL(CONFIG.GEOCODER_BASE_URL);
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "18",
    addressdetails: "1",
  }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS * 2);
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "Accept-Language": "pt-BR" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("A consulta do endereço demorou demais. Tente novamente.");
    throw new Error("Não foi possível consultar o endereço. Confira sua conexão e tente novamente.");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`A consulta do endereço respondeu com erro ${response.status}.`);
  const place = await response.json();
  const address = place?.address || {};
  const city = address.city || address.town || address.village || address.municipality || address.county;
  const road = [address.road, address.house_number].filter(Boolean).join(", ");
  const readable = [road, address.neighbourhood || address.suburb || address.quarter, city, address.state].filter(Boolean);
  const label = [...new Set(readable)].join(" · ") || place?.display_name;
  if (!label) throw new Error("Não foi possível identificar o endereço deste local.");
  return label;
}

function parseNowPayload(post) {
  if (!post || typeof post.body !== "string") return null;
  try {
    const payload = JSON.parse(post.body);
    if (payload?.app !== "NowPlace" || payload?.version !== 1) return null;
    if (!payload.username || !payload.createdAt || !payload.photoEnvironment || !payload.photoSelfie) return null;
    if (!Number.isFinite(Number(payload.latitude)) || !Number.isFinite(Number(payload.longitude))) return null;
    return payload;
  } catch {
    return null;
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function normalizeNow(post, payload, latitude, longitude) {
  return {
    id: post.id,
    userName: payload.username,
    description: payload.description || "",
    photoEnvironment: payload.photoEnvironment,
    photoSelfie: payload.photoSelfie,
    latitude: Number(payload.latitude),
    longitude: Number(payload.longitude),
    placeName: payload.placeName || "Local não identificado",
    createdAt: new Date(payload.createdAt),
    distanceKm: haversineKm(latitude, longitude, Number(payload.latitude), Number(payload.longitude)),
  };
}

async function publishNow(now) {
  const username = String(now.username || "").trim();
  const latitude = Number(now.latitude);
  const longitude = Number(now.longitude);
  if (!username) throw new Error("Informe seu nome antes de publicar.");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("A localização do dispositivo não é válida.");
  if (!now.photoEnvironment || !now.photoSelfie) throw new Error("Capture as duas fotos antes de publicar.");
  const description = String(now.description || "").trim().slice(0, 500);
  if (!description) throw new Error("Escreva o que você está fazendo agora.");

  const placeName = String(now.placeName || "").trim() || await lookupPlaceName(latitude, longitude);
  const createdAt = new Date().toISOString();
  const payload = {
    app: "NowPlace",
    version: 1,
    username,
    description,
    latitude,
    longitude,
    placeName,
    createdAt,
    photoEnvironment: now.photoEnvironment,
    photoSelfie: now.photoSelfie,
  };

  // Mantém o formato oficial do recurso Posts: userId, title e body.
  // A API pública é utilizada quando responde. Como é uma API de demonstração,
  // salvamos a publicação real no navegador mesmo se a API estiver indisponível.
  let apiSynced = false;
  let apiWarning = "";
  try {
    const response = await request(CONFIG.ENDPOINTS.posts, {
      method: "POST",
      body: JSON.stringify({
        userId: stableUserId(username),
        title: `NowPlace | @${username} | ${description.slice(0, 90)}`,
        body: JSON.stringify(payload),
      }),
    });
    apiSynced = Boolean(response && response.id != null);
    if (!apiSynced) apiWarning = "A API não confirmou a publicação.";
  } catch (error) {
    apiWarning = error?.message || "A API não respondeu.";
  }

  return {
    message: apiSynced ? "Now enviado para a API." : "Now salvo neste navegador; a API não respondeu.",
    apiSynced,
    apiWarning,
    local: placeName,
    apiUrl: activeBaseUrl,
    post: {
      id: `now-${createdAt}`,
      userName: username,
      description,
      photoEnvironment: payload.photoEnvironment,
      photoSelfie: payload.photoSelfie,
      latitude,
      longitude,
      placeName,
      createdAt: new Date(createdAt),
      distanceKm: 0,
    },
  };
}

async function fetchNearbyNows(username, latitude, longitude, radiusKm) {
  const cutoff = Date.now() - CONFIG.FEED_WINDOW_HOURS * 60 * 60 * 1000;
  const currentUser = String(username || "").trim().toLocaleLowerCase("pt-BR");
  let remote = [];
  let remoteError = null;
  try {
    const response = await request(CONFIG.ENDPOINTS.posts);
    if (!Array.isArray(response)) throw new Error("A API retornou uma resposta inesperada.");
    remote = response
      .map((post) => ({ post, payload: parseNowPayload(post) }))
      .filter(({ payload }) => Boolean(payload))
      .map(({ post, payload }) => normalizeNow(post, payload, latitude, longitude));
  } catch (error) {
    remoteError = error;
  }

  // JSONPlaceholder é uma API de demonstração e algumas implementações não persistem POSTs.
  // Por isso, as fotos e os metadados também ficam no Storage deste navegador.
  const local = getLocalNows().map((now) => ({
    ...now,
    createdAt: now.createdAt instanceof Date ? now.createdAt : new Date(now.createdAt),
    distanceKm: haversineKm(latitude, longitude, Number(now.latitude), Number(now.longitude)),
  }));
  const unique = new Map();
  for (const now of [...remote, ...local]) {
    const key = `${String(now.userName).toLocaleLowerCase("pt-BR")}|${new Date(now.createdAt).getTime()}`;
    if (!unique.has(key)) unique.set(key, now);
  }
  const nows = [...unique.values()]
    .filter((now) => !Number.isNaN(new Date(now.createdAt).getTime()) && new Date(now.createdAt).getTime() >= cutoff)
    .filter((now) => {
      const isMine = String(now.userName).trim().toLocaleLowerCase("pt-BR") === currentUser;
      return isMine || (Number.isFinite(now.distanceKm) && now.distanceKm <= Number(radiusKm));
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (remoteError && !nows.length && !local.length) throw remoteError;
  return nows;
}


// ===== Interface =====
// Fluxo da interface NowPlace. Comunicação remota usa somente a API entregue para a SA2.

const $ = (id) => document.getElementById(id);
const state = {
  user: null,
  step: "idle", // idle | environment | selfie | review
  photos: { environment: null, selfie: null },
  location: { position: null, placeName: "", status: "idle" },
  locationRequest: 0,
  locationPromise: null,
  loadingFeed: false,
};

let toastTimer;
function toast(message, isError = false) {
  const element = $("toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 4600);
}

function setApiPresence(kind, label) {
  const presence = $("api-presence");
  presence.classList.remove("online", "offline");
  if (kind === "online") presence.classList.add("online");
  if (kind === "offline") presence.classList.add("offline");
  $("api-status-label").textContent = label;
}

async function refreshApiPresence() {
  try {
    const health = await checkApiHealth();
    if (health.configured) setApiPresence("online", "API conectada");
    else setApiPresence("offline", "API indisponível");
  } catch {
    setApiPresence("offline", "API indisponível");
  }
}

function showCapturePanel(which) {
  ["capture-intro", "capture-live", "capture-review", "publish-done"].forEach((id) => {
    $(id).hidden = id !== which;
  });
}

function showTab(name) {
  const isNew = name === "new";
  $("panel-new").hidden = !isNew;
  $("panel-feed").hidden = isNew;
  $("tab-new").classList.toggle("active", isNew);
  $("tab-feed").classList.toggle("active", !isNew);
  $("workspace-title").textContent = isNew ? "Novo Now" : "Por perto";
  if (!isNew) {
    stopCamera($("video"));
    openFeed();
  }
}

function timeAgo(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "tempo indisponível";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return "agora mesmo";
  if (seconds < 3600) return `há ${Math.max(1, Math.floor(seconds / 60))} min`;
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`;
  return `há ${Math.floor(seconds / 86400)} d`;
}

function formatRemaining(milliseconds) {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor((milliseconds % 3600000) / 60000);
  return `${hours}h ${String(minutes).padStart(2, "0")}min de acesso`;
}

// Login educacional por nome, conforme o escopo do MVP.
function enterApp(user) {
  state.user = user;
  $("user-name").textContent = `@${user.name}`;
  $("user-avatar").textContent = user.name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "N";
  $("user-chip").hidden = false;
  $("screen-login").hidden = true;
  $("screen-app").hidden = false;
  resetCapture();
  showTab("new");
  refreshUserStatus();
}

$("login-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("login-name").value.trim().replace(/\s+/g, " ");
  if (!name) return;
  enterApp(Storage.saveUser(name));
});

$("brand-home").addEventListener("click", (event) => {
  event.preventDefault();
  if (state.user) showTab("new");
});

$("btn-logout").addEventListener("click", () => {
  stopCamera($("video"));
  Storage.clearUser();
  state.user = null;
  state.step = "idle";
  state.photos = { environment: null, selfie: null };
  $("user-chip").hidden = true;
  $("screen-app").hidden = true;
  $("screen-login").hidden = false;
  $("login-name").value = "";
  $("feed-list").replaceChildren();
});

// A JSONPlaceholder.dev não oferece endpoint de status por usuário.
// Por isso, a regra das 24 horas é controlada pelo localStorage conforme RN05.
function refreshUserStatus() {
  if (!state.user) return;
  if (!$("panel-feed").hidden) openFeed();
}

// Captura ambiente e selfie em sequência, desligando a câmera entre as etapas.
function renderLocation() {
  const location = state.location;
  const status = $("location-status");
  const coordinates = $("location-coordinates");
  const button = $("btn-location");
  status.textContent = location.message || "A localização será detectada automaticamente.";
  status.classList.toggle("error", location.status === "error" || location.status === "coordinates-only");
  coordinates.textContent = location.position
    ? `Lat ${location.position.latitude.toFixed(5)} · Lng ${location.position.longitude.toFixed(5)}`
    : "Permita o acesso à localização no navegador.";
  button.disabled = location.status === "loading";
  button.textContent = location.status === "loading"
    ? "Buscando…"
    : location.status === "ready" ? "Atualizar" : "Tentar novamente";
}

async function detectLocation() {
  const requestId = ++state.locationRequest;
  state.location = { position: null, placeName: "", status: "loading", message: "Obtendo localização…" };
  renderLocation();

  const task = (async () => {
    try {
      const position = await getPosition();
      if (requestId !== state.locationRequest) return false;
      state.location = { position, placeName: "", status: "loading", message: "Consultando endereço…" };
      renderLocation();

      try {
        const placeName = await lookupPlaceName(position.latitude, position.longitude);
        if (requestId !== state.locationRequest) return false;
        state.location = { position, placeName, status: "ready", message: placeName };
        renderLocation();
        return true;
      } catch (error) {
        if (requestId !== state.locationRequest) return false;
        state.location = {
          position,
          placeName: "",
          status: "coordinates-only",
          message: "Coordenadas obtidas, mas o endereço não respondeu. Tente novamente.",
          geocodeError: error.message,
        };
        renderLocation();
        return false;
      }
    } catch (error) {
      if (requestId !== state.locationRequest) return false;
      state.location = { position: null, placeName: "", status: "error", message: error.message };
      renderLocation();
      return false;
    }
  })();
  state.locationPromise = task;
  try {
    return await task;
  } finally {
    if (requestId === state.locationRequest) state.locationPromise = null;
  }
}

function resetLocation() {
  state.locationRequest += 1;
  state.locationPromise = null;
  state.location = { position: null, placeName: "", status: "idle", message: "A localização será detectada automaticamente." };
  renderLocation();
}

function resetCapture() {
  stopCamera($("video"));
  state.step = "idle";
  state.photos = { environment: null, selfie: null };
  resetLocation();
  $("description").value = "";
  $("description-count").textContent = "0";
  showCapturePanel("capture-intro");
}

async function beginStep(step) {
  state.step = step;
  const isEnvironment = step === "environment";
  $("capture-step-count").textContent = isEnvironment ? "01" : "02";
  $("capture-step").textContent = isEnvironment ? "Foto do ambiente" : "Agora, a sua selfie";
  $("capture-help").textContent = isEnvironment ? "Enquadre o lugar onde você está." : "Agora mostre quem está vivendo esse momento.";
  $("camera-overlay-label").textContent = isEnvironment ? "AMBIENTE / 01" : "SELFIE / 02";
  $("camera-step-environment").classList.toggle("active", isEnvironment);
  $("camera-step-selfie").classList.toggle("active", !isEnvironment);
  $("btn-capture").innerHTML = isEnvironment ? 'Capturar foto <span aria-hidden="true">●</span>' : 'Capturar selfie <span aria-hidden="true">●</span>';
  showCapturePanel("capture-live");
  try {
    await startCamera($("video"), isEnvironment ? "environment" : "user");
  } catch (error) {
    toast(error.message, true);
    resetCapture();
  }
}

$("btn-start").addEventListener("click", () => beginStep("environment"));
$("btn-cancel").addEventListener("click", resetCapture);

$("btn-capture").addEventListener("click", async () => {
  try {
    const frame = captureFrame($("video"), $("canvas"));
    if (state.step === "environment") {
      state.photos.environment = frame;
      stopCamera($("video"));
      await beginStep("selfie");
    } else if (state.step === "selfie") {
      state.photos.selfie = frame;
      stopCamera($("video"));
      showReview();
    }
  } catch (error) {
    toast(error.message, true);
  }
});

function showReview() {
  state.step = "review";
  $("prev-environment").src = state.photos.environment;
  $("prev-selfie").src = state.photos.selfie;
  showCapturePanel("capture-review");
  // A localização aparece na revisão, para o usuário confirmar o local antes de publicar.
  detectLocation();
}

$("btn-location").addEventListener("click", () => detectLocation());

$("btn-retake").addEventListener("click", () => {
  state.photos = { environment: null, selfie: null };
  beginStep("environment");
});

$("description").addEventListener("input", (event) => {
  $("description-count").textContent = String(event.target.value.length);
});

// A posição é capturada do aparelho; o endereço é consultado com fetch antes do POST /posts na JSONPlaceholder.dev.
$("btn-publish").addEventListener("click", async () => {
  const button = $("btn-publish");
  const description = $("description").value.trim();
  if (!state.photos.environment || !state.photos.selfie) {
    toast("Capture o ambiente e a selfie antes de publicar.", true);
    return;
  }
  if (!description) {
    toast("Conte o que você está fazendo agora.", true);
    $("description").focus();
    return;
  }

  button.disabled = true;
  try {
    if (state.location.status === "loading" && state.locationPromise) {
      button.textContent = "Confirmando localização…";
      await state.locationPromise;
    }
    if (state.location.status !== "ready" || !state.location.position || !state.location.placeName) {
      button.textContent = "Obtendo localização…";
      const locationReady = await detectLocation();
      if (!locationReady || state.location.status !== "ready") {
        throw new Error("Não foi possível confirmar o endereço. Use 'Tentar novamente' na localização antes de publicar.");
      }
    }
    const { position, placeName } = state.location;
    button.textContent = "Publicando…";
    const result = await publishNow({
      username: state.user.name,
      description,
      latitude: position.latitude,
      longitude: position.longitude,
      placeName,
      photoEnvironment: state.photos.environment,
      photoSelfie: state.photos.selfie,
    });

    const publishedAt = result.post?.createdAt && !Number.isNaN(result.post.createdAt.getTime())
      ? result.post.createdAt
      : new Date();
    Storage.saveNow(result.post);
    Storage.markPublishedNow(state.user.name, publishedAt);
    $("publish-done-place").textContent = result.local || "Localização identificada pelas coordenadas";
    showCapturePanel("publish-done");
    state.step = "idle";
    state.photos = { environment: null, selfie: null };
    if (result.apiSynced) {
      setApiPresence("online", "API conectada");
      toast("Now publicado com sucesso!");
    } else {
      setApiPresence("offline", "API indisponível");
      toast("Now salvo neste navegador. A API não respondeu; a publicação continua visível neste dispositivo.", true);
    }
    refreshUserStatus();
  } catch (error) {
    toast(error.message, true);
    refreshApiPresence();
  } finally {
    button.disabled = false;
    button.textContent = "Publicar Now";
  }
});

$("btn-new-now").addEventListener("click", resetCapture);
$("btn-go-feed").addEventListener("click", () => showTab("feed"));
$("btn-locked-new").addEventListener("click", () => showTab("new"));
$("tab-new").addEventListener("click", () => showTab("new"));
$("tab-feed").addEventListener("click", () => showTab("feed"));

function setFeedStatus(message = "", isError = false) {
  const element = $("feed-status");
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function openFeed() {
  const allowed = state.user && Storage.canAccessFeed(state.user.name);
  $("feed-locked").hidden = Boolean(allowed);
  $("feed-unlocked").hidden = !allowed;
  if (!allowed) {
    $("feed-list").replaceChildren();
    setFeedStatus("");
    return;
  }
  $("feed-unlock-info").textContent = `Acesso local: ${formatRemaining(Storage.feedAccessRemainingMs(state.user.name))}.`;
  loadFeed();
}

$("radius").addEventListener("input", (event) => {
  $("radius-value").textContent = event.target.value;
});
$("radius-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.user || !Storage.canAccessFeed(state.user.name)) {
    openFeed();
    return;
  }
  loadFeed();
});

async function loadFeed() {
  if (state.loadingFeed || !state.user) return;
  if (!Storage.canAccessFeed(state.user.name)) {
    openFeed();
    return;
  }
  state.loadingFeed = true;
  const list = $("feed-list");
  list.replaceChildren();
  setFeedStatus("Buscando publicações próximas…");
  try {
    let position;
    try {
      position = await getPosition();
    } catch (geoError) {
      const cutoff = Date.now() - CONFIG.FEED_WINDOW_HOURS * 60 * 60 * 1000;
      const ownSaved = Storage.getLocalNows()
        .filter((now) => String(now.userName).trim().toLocaleLowerCase("pt-BR") === state.user.name.trim().toLocaleLowerCase("pt-BR"))
        .filter((now) => new Date(now.createdAt).getTime() >= cutoff)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (!ownSaved.length) throw geoError;
      position = { latitude: Number(ownSaved[0].latitude), longitude: Number(ownSaved[0].longitude) };
      setFeedStatus("GPS indisponível: mostrando suas publicações salvas neste dispositivo.");
    }
    const radius = Number($("radius").value);
    const nows = await fetchNearbyNows(state.user.name, position.latitude, position.longitude, radius);
    if (!nows.length) {
      setFeedStatus("");
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.innerHTML = '<div class="empty-icon" aria-hidden="true">⌖</div><strong>Nenhum Now encontrado por aqui.</strong><p>Não há publicações recentes nesse raio. Aumente a distância e tente de novo.</p>';
      list.appendChild(empty);
      return;
    }
    setFeedStatus(`${nows.length} ${nows.length === 1 ? "momento encontrado" : "momentos encontrados"} em até ${radius} km.`);
    nows.forEach((now) => list.appendChild(buildNowCard(now)));
  } catch (error) {
    // Falhas da API não apagam o registro local das 24 horas.
    setFeedStatus(error.message, true);
  } finally {
    state.loadingFeed = false;
  }
}

function buildNowCard(now) {
  const card = document.createElement("article");
  card.className = "now-card";
  const head = document.createElement("div");
  head.className = "now-head";
  const userWrap = document.createElement("div");
  userWrap.className = "now-user-wrap";
  const avatar = document.createElement("span");
  avatar.className = "now-avatar";
  avatar.textContent = (now.userName || "?").trim().charAt(0).toLocaleUpperCase("pt-BR");
  const user = document.createElement("span");
  user.className = "now-user";
  user.textContent = `@${now.userName}`;
  userWrap.append(avatar, user);
  const time = document.createElement("span");
  time.className = "now-time";
  time.textContent = timeAgo(now.createdAt);
  head.append(userWrap, time);

  const place = document.createElement("div");
  place.className = "now-place";
  const placeMark = document.createElement("span");
  placeMark.className = "place-mark";
  placeMark.textContent = "⌖";
  const placeText = document.createElement("span");
  placeText.textContent = now.placeName || "Local não identificado";
  place.append(placeMark, placeText);

  const stack = buildPhotoStack(now);
  if (Number.isFinite(now.distanceKm)) {
    const distance = document.createElement("span");
    distance.className = "distance-tag";
    distance.textContent = `${now.distanceKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km de você`;
    stack.appendChild(distance);
  }
  const description = document.createElement("div");
  description.className = "now-desc";
  description.textContent = now.description || "";
  card.append(head, place, stack, description);
  return card;
}

function buildPhotoStack(now) {
  const stack = document.createElement("div");
  stack.className = "photo-stack";
  const main = document.createElement("img");
  main.className = "photo main-photo";
  main.src = now.photoEnvironment;
  main.alt = "Foto principal do ambiente; arraste a miniatura para trocar";
  main.draggable = false;
  const thumb = document.createElement("img");
  thumb.className = "photo thumb-photo";
  thumb.src = now.photoSelfie;
  thumb.alt = "Selfie sobreposta; arraste para a imagem principal para trocar";
  thumb.draggable = true;
  thumb.setAttribute("aria-label", "Arraste esta foto para trocar a foto principal");
  const hint = document.createElement("span");
  hint.className = "hint";
  hint.textContent = "⤧ arraste para trocar";
  stack.append(main, thumb, hint);

  const swap = () => {
    const source = main.src;
    const alt = main.alt;
    main.src = thumb.src;
    main.alt = thumb.alt;
    thumb.src = source;
    thumb.alt = alt;
  };

  // Drag and Drop nativo (mouse/desktop).
  thumb.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", "swap-photo");
    event.dataTransfer.effectAllowed = "move";
    thumb.classList.add("dragging");
  });
  thumb.addEventListener("dragend", () => {
    thumb.classList.remove("dragging");
    stack.classList.remove("drag-over");
  });
  stack.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    stack.classList.add("drag-over");
  });
  stack.addEventListener("dragleave", (event) => {
    if (!stack.contains(event.relatedTarget)) stack.classList.remove("drag-over");
  });
  stack.addEventListener("drop", (event) => {
    event.preventDefault();
    stack.classList.remove("drag-over");
    if (event.dataTransfer.getData("text/plain") === "swap-photo") swap();
  });

  // Compatibilidade touch: arrastar a miniatura e soltá-la sobre o card alterna as fotos.
  let pointerStart = null;
  thumb.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    pointerStart = { x: event.clientX, y: event.clientY };
    thumb.setPointerCapture(event.pointerId);
    thumb.classList.add("dragging");
  });
  thumb.addEventListener("pointermove", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const endTouch = (event) => {
    if (!pointerStart) return;
    const rect = stack.getBoundingClientRect();
    const moved = Math.abs(event.clientX - pointerStart.x) + Math.abs(event.clientY - pointerStart.y) > 12;
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    pointerStart = null;
    thumb.style.transform = "";
    thumb.classList.remove("dragging");
    if (event.type === "pointerup" && moved && inside) swap();
  };
  thumb.addEventListener("pointerup", endTouch);
  thumb.addEventListener("pointercancel", endTouch);
  return stack;
}

// A câmera é encerrada se a aba sai de foco, é fechada ou a tela é desmontada.
window.addEventListener("pagehide", () => stopCamera($("video")));
document.addEventListener("visibilitychange", () => {
  if (document.hidden && ["environment", "selfie"].includes(state.step)) resetCapture();
});

refreshApiPresence();
const savedUser = Storage.getUser();
if (savedUser) enterApp(savedUser);

