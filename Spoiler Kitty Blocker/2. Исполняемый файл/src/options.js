const DEFAULT_KEYWORDS = [
  "Игра престолов",
  "Game of Thrones",
  "Дом Дракона",
  "House of the Dragon",
  "Джон Сноу",
  "Jon Snow",
  "Дейенерис",
  "Daenerys",
  "Таргариен",
  "Targaryen",
  "Ланнистер",
  "Lannister",
  "Старк",
  "Stark",
  "Серсея",
  "Cersei",
  "Джоффри",
  "Joffrey",
  "Эддард",
  "Eddard",
  "Нед Старк",
  "Ned Stark",
  "Вестерос",
  "Вестероса",
  "Вестеросу",
  "Роберт Баратеон",
  "Роберта Баратеона",
  "Эддарда",
  "Старка",
  "Старками",
  "Ланнистеры",
  "Ланнистерами",
  "Серсеи",
  "Пять Королей",
  "Ночной Дозор",
  "Дозор",
  "Красная свадьба",
  "Red Wedding",
  "Ночной король",
  "Night King",
  "White Walkers",
  "Белые ходоки",
  "Hodor",
  "Валар Моргулис",
  "Valar Morghulis",
  "зима близко",
  "winter is coming",
];

const DEFAULTS = {
  enabled: true,
  mode: "cats",
  replaceImages: true,
  wholeWord: false,
  caseSensitive: false,
  maxReplacements: 250,
  replacementLabel: "Спойлер спрятан котиком",
  keywords: DEFAULT_KEYWORDS,
};

const form = {
  enabled: document.querySelector("#enabled"),
  mode: document.querySelector("#mode"),
  replaceImages: document.querySelector("#replaceImages"),
  wholeWord: document.querySelector("#wholeWord"),
  caseSensitive: document.querySelector("#caseSensitive"),
  maxReplacements: document.querySelector("#maxReplacements"),
  replacementLabel: document.querySelector("#replacementLabel"),
  keywords: document.querySelector("#keywords"),
};

const saveButton = document.querySelector("#save");
const resetButton = document.querySelector("#reset");
const saveStatus = document.querySelector("#saveStatus");
const dbStatus = document.querySelector("#dbStatus");
const dbPath = document.querySelector("#dbPath");
const dbStats = document.querySelector("#dbStats");
const loadFromDbButton = document.querySelector("#loadFromDb");
const saveToDbButton = document.querySelector("#saveToDb");

let timer = null;
let lastConfigSource = "storage";

start();

async function start() {
  const loaded = await loadConfig();
  lastConfigSource = loaded.source;
  fill(loaded.config);
  await refreshDbPanel();

  saveButton.onclick = () => save("Сохранено.");
  resetButton.onclick = () => {
    form.keywords.value = DEFAULT_KEYWORDS.join("\n");
    save("Словарь по умолчанию сохранён.");
  };

  if (loadFromDbButton) {
    loadFromDbButton.onclick = async () => {
      const loadedAgain = await loadConfig(true);
      fill(loadedAgain.config);
      status(
        loadedAgain.source === "sqlite"
          ? "Загружено из SQLite."
          : "SQLite недоступна, загружено из chrome.storage.",
      );
      await refreshDbPanel();
    };
  }

  if (saveToDbButton) {
    saveToDbButton.onclick = () =>
      save("Сохранено. Если SQLite подключена, данные записаны в базу.");
  }

  for (const input of Object.values(form)) {
    input.oninput = () => status("Есть изменения.");
  }
}

async function loadConfig(forceNative) {
  if (forceNative) {
    const response = await sendToBackground({ type: "SKB_DB_GET_CONFIG" });
    if (response && response.ok && response.config)
      return { source: response.source || "sqlite", config: response.config };
  }

  const response = await sendToBackground({ type: "SKB_DB_GET_CONFIG" });
  if (response && response.ok && response.config)
    return { source: response.source || "sqlite", config: response.config };
  return { source: "storage", config: await chrome.storage.sync.get(DEFAULTS) };
}

function fill(cfg) {
  form.enabled.checked = !!cfg.enabled;
  form.mode.value = ["cats", "inline-cats", "blur", "hide", "mark"].includes(
    cfg.mode,
  )
    ? cfg.mode
    : "cats";
  form.replaceImages.checked = cfg.replaceImages !== false;
  form.wholeWord.checked = !!cfg.wholeWord;
  form.caseSensitive.checked = !!cfg.caseSensitive;
  form.maxReplacements.value = cfg.maxReplacements || 250;
  form.replacementLabel.value =
    cfg.replacementLabel || DEFAULTS.replacementLabel;
  form.keywords.value = clean(
    [].concat(cfg.keywords || [], DEFAULT_KEYWORDS),
  ).join("\n");
}

async function save(text) {
  const cfg = readForm();
  const response = await sendToBackground({
    type: "SKB_DB_SAVE_CONFIG",
    config: cfg,
  });

  if (response && response.ok && response.config) {
    fill(response.config);
    lastConfigSource = response.source || lastConfigSource;
  } else {
    await chrome.storage.sync.set(cfg);
    fill(cfg);
    lastConfigSource = "storage";
  }

  await refreshDbPanel();
  status(text);
}

function readForm() {
  return {
    enabled: form.enabled.checked,
    mode: form.mode.value,
    replaceImages: form.replaceImages.checked,
    wholeWord: form.wholeWord.checked,
    caseSensitive: form.caseSensitive.checked,
    maxReplacements: Math.min(
      5000,
      Math.max(1, Number(form.maxReplacements.value) || 250),
    ),
    replacementLabel:
      form.replacementLabel.value.trim() || DEFAULTS.replacementLabel,
    keywords: clean(form.keywords.value.split("\n")),
  };
}

async function refreshDbPanel() {
  const statusResponse = await sendToBackground({ type: "SKB_DB_STATUS" });

  if (statusResponse && statusResponse.available) {
    dbStatus.textContent =
      lastConfigSource === "sqlite"
        ? "Подключена и используется."
        : "Подключена. Сейчас используется chrome.storage.";
    dbPath.textContent = statusResponse.dbPath || "Путь не получен.";
    dbStats.textContent = formatCounts(statusResponse.counts || {});
    toggleDbButtons(false);
  } else {
    dbStatus.textContent =
      "Не подключена. Установите backend/install_native_host.py, затем перезагрузите расширение.";
    dbPath.textContent = "—";
    dbStats.textContent = "—";
    toggleDbButtons(true);
  }
}

function toggleDbButtons(disabled) {
  if (loadFromDbButton) loadFromDbButton.disabled = disabled;
  if (saveToDbButton) saveToDbButton.disabled = disabled;
}

function formatCounts(counts) {
  const parts = [];
  if (Number.isFinite(counts.keywords)) parts.push("слов: " + counts.keywords);
  if (Number.isFinite(counts.categories))
    parts.push("категорий: " + counts.categories);
  if (Number.isFinite(counts.pages)) parts.push("страниц: " + counts.pages);
  if (Number.isFinite(counts.scans)) parts.push("проверок: " + counts.scans);
  if (Number.isFinite(counts.matches))
    parts.push("совпадений: " + counts.matches);
  return parts.length ? parts.join(", ") : "Пока нет статистики.";
}

function clean(list) {
  const result = [];
  const used = new Set();

  for (const item of list) {
    const text = String(item || "")
      .trim()
      .replace(/\s+/g, " ");
    const key = text.toLowerCase();

    if (text.length > 1 && !used.has(key)) {
      used.add(key);
      result.push(text);
    }
  }

  return result;
}

function status(text) {
  clearTimeout(timer);
  saveStatus.textContent = text;
  timer = setTimeout(() => (saveStatus.textContent = ""), 2500);
}

async function sendToBackground(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (e) {
    return null;
  }
}
