const DEFAULTS = {
  enabled: true,
  mode: "cats",
  replaceImages: true,
  keywords: [],
};

const enabled = document.querySelector("#enabled");
const mode = document.querySelector("#mode");
const replaceImages = document.querySelector("#replaceImages");
const statusText = document.querySelector("#statusText");
const statsText = document.querySelector("#statsText");
const dbText = document.querySelector("#dbText");
const addForm = document.querySelector("#addForm");
const newKeyword = document.querySelector("#newKeyword");
const rescan = document.querySelector("#rescan");
const openOptions = document.querySelector("#openOptions");

let cfg = {};

start();

async function start() {
  cfg = await loadConfig();
  draw();
  showStats();
  showDbStatus();

  enabled.onchange = async () => {
    await save({ enabled: enabled.checked });
    await sendToTab(enabled.checked ? "SKB_RESCAN" : "SKB_RESTORE");
    showStats();
  };

  mode.onchange = async () => {
    await save({ mode: mode.value });
    await sendToTab("SKB_RESCAN");
    showStats();
  };

  replaceImages.onchange = async () => {
    await save({ replaceImages: replaceImages.checked });
    await sendToTab("SKB_RESCAN");
    showStats();
  };

  addForm.onsubmit = async (event) => {
    event.preventDefault();

    const word = newKeyword.value.trim().replace(/\s+/g, " ");
    if (word.length < 2) return;

    const result = await sendToBackground({
      type: "SKB_DB_ADD_KEYWORD",
      keyword: word,
    });
    if (result && result.ok) {
      cfg = result.config || (await loadConfig());
    } else {
      const old = cfg.keywords || [];
      const same = old.some(
        (item) => item.toLowerCase() === word.toLowerCase(),
      );
      if (!same) await save({ keywords: old.concat(word) });
    }

    await sendToTab("SKB_RESCAN");
    newKeyword.value = "";
    draw();
    showStats();
    showDbStatus();
  };

  rescan.onclick = async () => {
    await sendToTab("SKB_RESCAN");
    showStats();
  };

  openOptions.onclick = () => chrome.runtime.openOptionsPage();
}

async function loadConfig() {
  const response = await sendToBackground({ type: "SKB_DB_GET_CONFIG" });
  if (response && response.ok && response.config) return response.config;
  return chrome.storage.sync.get(DEFAULTS);
}

async function save(part) {
  cfg = Object.assign({}, cfg, part);
  const response = await sendToBackground({
    type: "SKB_DB_SAVE_CONFIG",
    config: cfg,
  });
  if (response && response.ok && response.config) cfg = response.config;
  else await chrome.storage.sync.set(part);
  draw();
  showDbStatus();
}

function draw() {
  enabled.checked = !!cfg.enabled;
  replaceImages.checked = cfg.replaceImages !== false;
  mode.value = ["cats", "inline-cats", "blur", "hide", "mark"].includes(
    cfg.mode,
  )
    ? cfg.mode
    : "cats";
  statusText.textContent = cfg.enabled ? "Включено" : "Выключено";
}

async function showStats() {
  const stats = await sendToTab("SKB_GET_STATS");

  if (!stats) {
    statsText.textContent = "Расширение недоступно на этой странице.";
    return;
  }

  const imageText = stats.images ? ", картинок: " + stats.images : "";
  statsText.textContent =
    "v" +
    stats.version +
    ": " +
    stats.replacements +
    " замен(ы)" +
    imageText +
    ". В словаре: " +
    stats.keywords +
    ".";
}

async function showDbStatus() {
  if (!dbText) return;
  const status = await sendToBackground({ type: "SKB_DB_STATUS" });
  if (status && status.available) {
    const count =
      status.counts && Number.isFinite(status.counts.keywords)
        ? ", слов: " + status.counts.keywords
        : "";
    dbText.textContent = "SQLite подключена" + count + ".";
  } else {
    dbText.textContent = "SQLite не подключена: используется chrome.storage.";
  }
}

async function sendToTab(type) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return null;

  try {
    return await chrome.tabs.sendMessage(tabs[0].id, { type });
  } catch (e) {
    return null;
  }
}

async function sendToBackground(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (e) {
    return null;
  }
}
