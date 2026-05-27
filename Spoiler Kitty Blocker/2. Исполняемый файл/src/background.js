const HOST_NAME = "spoiler_kitty_blocker_db";

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

chrome.runtime.onInstalled.addListener(() => {
  loadConfig().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  routeMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: getErrorText(error) }));

  return true;
});

async function routeMessage(message) {
  if (message.type === "SKB_DB_STATUS") return getDatabaseStatus();
  if (message.type === "SKB_DB_GET_CONFIG") return loadConfig();
  if (message.type === "SKB_DB_SAVE_CONFIG")
    return saveConfig(message.config || {});
  if (message.type === "SKB_DB_ADD_KEYWORD")
    return addKeyword(message.keyword || "");
  if (message.type === "SKB_DB_RECORD_SCAN") return saveScan(message);
  if (message.type === "SKB_DB_STATS") return sendToHost("stats", {});
  return { ok: false, error: "Неизвестное сообщение." };
}

async function getDatabaseStatus() {
  try {
    const result = await sendToHost("status", {});
    return Object.assign({ ok: true, available: true }, result);
  } catch (error) {
    return { ok: false, available: false, error: getErrorText(error) };
  }
}

async function loadConfig() {
  try {
    const result = await sendToHost("get_config", { defaults: DEFAULTS });
    if (!result || !result.ok || !result.config)
      throw new Error("База не ответила.");

    const config = fixConfig(result.config);
    await storageSet(config);
    return {
      ok: true,
      source: "sqlite",
      config,
      dbPath: result.dbPath,
      counts: result.counts || {},
    };
  } catch (error) {
    const config = fixConfig(await storageGet(DEFAULTS));
    return { ok: true, source: "storage", config, error: getErrorText(error) };
  }
}

async function saveConfig(configPatch) {
  const current = fixConfig(await storageGet(DEFAULTS));
  const config = fixConfig(Object.assign({}, current, configPatch));

  await storageSet(config);

  try {
    const result = await sendToHost("save_config", { config });
    return Object.assign({ ok: true, source: "sqlite", config }, result || {});
  } catch (error) {
    return { ok: true, source: "storage", config, error: getErrorText(error) };
  }
}

async function addKeyword(keyword) {
  const word = String(keyword || "")
    .trim()
    .replace(/\s+/g, " ");
  if (word.length < 2) return { ok: false, error: "Слово слишком короткое." };

  const config = fixConfig(await storageGet(DEFAULTS));
  const exists = config.keywords.some(
    (item) => item.toLowerCase() === word.toLowerCase(),
  );
  if (!exists) config.keywords.push(word);

  await storageSet({ keywords: config.keywords });

  try {
    const result = await sendToHost("add_keyword", { keyword: word });
    return Object.assign(
      { ok: true, source: "sqlite", keyword: word, config },
      result || {},
    );
  } catch (error) {
    return {
      ok: true,
      source: "storage",
      keyword: word,
      config,
      error: getErrorText(error),
    };
  }
}

async function saveScan(message) {
  try {
    return await sendToHost("record_scan", {
      url: String(message.url || "").slice(0, 4096),
      pageTitle: String(message.pageTitle || "").slice(0, 512),
      stats: message.stats || {},
      matches: Array.isArray(message.matches)
        ? message.matches.slice(0, 80)
        : [],
    });
  } catch (error) {
    return { ok: false, available: false, error: getErrorText(error) };
  }
}

function sendToHost(command, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      Object.assign({ command }, data || {}),
      (response) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response);
      },
    );
  });
}

function storageGet(defaults) {
  return new Promise((resolve) => chrome.storage.sync.get(defaults, resolve));
}

function storageSet(value) {
  return new Promise((resolve) => chrome.storage.sync.set(value, resolve));
}

function fixConfig(value) {
  const config = Object.assign({}, DEFAULTS, value || {});

  config.keywords = cleanKeywords(
    [].concat(config.keywords || [], DEFAULT_KEYWORDS),
  );
  config.mode = ["cats", "inline-cats", "blur", "hide", "mark"].includes(
    config.mode,
  )
    ? config.mode
    : "cats";
  config.maxReplacements = Math.min(
    5000,
    Math.max(1, Number(config.maxReplacements) || 250),
  );
  config.replacementLabel = String(
    config.replacementLabel || DEFAULTS.replacementLabel,
  ).slice(0, 80);
  config.enabled = !!config.enabled;
  config.wholeWord = !!config.wholeWord;
  config.caseSensitive = !!config.caseSensitive;
  config.replaceImages =
    config.replaceImages === undefined ? true : !!config.replaceImages;

  return config;
}

function cleanKeywords(list) {
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

  return result.slice(0, 1000);
}

function getErrorText(error) {
  if (!error) return "База недоступна.";
  return String(error.message || error).replace(/^Error:\s*/, "");
}
