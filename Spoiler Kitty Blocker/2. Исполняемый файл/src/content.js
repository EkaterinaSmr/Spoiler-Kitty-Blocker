(() => {
  const VERSION = "1.4.2";

  const DEFAULTS = {
    enabled: true,
    mode: "cats",
    wholeWord: false,
    caseSensitive: false,
    maxReplacements: 250,
    replacementLabel: "Спойлер спрятан котиком",
    replaceImages: true,
    keywords: [
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
    ],
  };

  const CATS = 6;
  const BLOCKS =
    "p, li, dd, dt, td, th, caption, figcaption, blockquote, h1, h2, h3, h4, h5, h6, summary";
  const BAD_PARENTS =
    "script, style, noscript, textarea, input, select, button, code, pre, svg, canvas, iframe, object, embed, video, audio";
  const SITE_MAIN =
    'main, article, #content, .mw-body, .mw-parser-output, .content, [role="main"]';
  const SITE_TRASH =
    "header, nav, footer, aside, .navbox, .metadata, .toc, #toc, .sidebar";

  let cfg = {};
  let rx = null;
  let timer = null;
  let reportTimer = null;
  let oldTitle = document.title;
  let working = false;

  start();

  async function start() {
    cfg = await load();
    rx = makeRegex();
    scan(document.body);
    watchPage();
    watchButtons();
    watchMessages();
    watchOptions();
  }

  function load() {
    return loadFromNative()
      .catch(() => chrome.storage.sync.get(DEFAULTS))
      .then(fixConfig);
  }

  async function loadFromNative() {
    const response = await chrome.runtime.sendMessage({
      type: "SKB_DB_GET_CONFIG",
    });
    if (response && response.ok && response.config) return response.config;
    return chrome.storage.sync.get(DEFAULTS);
  }

  function fixConfig(value) {
    value.keywords = clean([].concat(value.keywords || [], DEFAULTS.keywords));
    value.mode = ["cats", "inline-cats", "blur", "hide", "mark"].includes(
      value.mode,
    )
      ? value.mode
      : "cats";
    value.maxReplacements = Math.min(
      5000,
      Math.max(1, Number(value.maxReplacements) || 250),
    );
    value.replacementLabel = String(
      value.replacementLabel || DEFAULTS.replacementLabel,
    ).slice(0, 80);
    value.enabled = !!value.enabled;
    value.wholeWord = !!value.wholeWord;
    value.caseSensitive = !!value.caseSensitive;
    value.replaceImages =
      value.replaceImages === undefined ? true : !!value.replaceImages;
    return value;
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

    return result.slice(0, 300);
  }

  function makeRegex() {
    const words = clean(cfg.keywords)
      .sort((a, b) => b.length - a.length)
      .map(escapeText);
    if (words.length === 0) return null;

    let text = "(" + words.join("|") + ")";
    if (cfg.wholeWord)
      text = "(^|[^\\p{L}\\p{N}_])" + text + "(?=$|[^\\p{L}\\p{N}_])";

    return new RegExp(text, cfg.caseSensitive ? "gu" : "giu");
  }

  function escapeText(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function scan(root) {
    if (!root || !cfg.enabled || !rx || working) return;

    const before = countHidden();

    if (cfg.mode === "cats") {
      hideBlocks(root);
    } else {
      hideWords(root);
    }

    if (cfg.replaceImages) hideImages(root);
    hideTitle();

    if (countHidden() > before) reportScan();
  }

  function hideTitle() {
    if (hasSpoiler(document.title)) {
      document.title = "🐾 Спойлер спрятан";
    }
  }

  function hideBlocks(root) {
    const items = getElements(root, BLOCKS);

    for (const el of items) {
      if (countHidden() >= cfg.maxReplacements) return;
      if (!canChange(el)) continue;

      const text = (el.innerText || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length < 2 || text.length > 2500 || !hasSpoiler(text)) continue;

      const matched = firstMatch(text);
      el.dataset.skbHtml = el.innerHTML;
      el.dataset.skbMatch = matched;
      el.classList.add("skb-blocked");
      el.setAttribute("aria-label", cfg.replacementLabel);
      el.replaceChildren(makeCard(matched, el.tagName));
    }
  }

  function makeCard(seed, tag) {
    const card = document.createElement("span");
    const img = document.createElement("img");
    const box = document.createElement("span");
    const title = document.createElement("strong");
    const hint = document.createElement("small");
    const btn = document.createElement("button");

    card.className = "skb-card";
    img.src = cat(seed);
    img.alt = "Фрагмент скрыт";
    box.className = "skb-card-text";
    title.textContent = "Фрагмент скрыт";
    hint.textContent = hintText(tag);
    btn.type = "button";
    btn.className = "skb-show";
    btn.textContent = "Показать";

    box.append(title, hint);
    card.append(img, box, btn);
    return card;
  }

  function hintText(tag) {
    if (tag === "LI") return "Пункт списка скрыт.";
    if (tag === "TD" || tag === "TH") return "Ячейка таблицы скрыта.";
    if (/H\d/.test(tag)) return "Заголовок скрыт.";
    return "Совпадение найдено в словаре.";
  }

  function hideWords(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (
        node.parentElement &&
        canChange(node.parentElement) &&
        hasSpoiler(node.nodeValue)
      ) {
        nodes.push(node);
      }
    }

    for (const node of nodes) {
      if (countHidden() >= cfg.maxReplacements) return;
      replaceTextNode(node);
    }
  }

  function replaceTextNode(node) {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    let pos = 0;
    let changed = false;

    rx.lastIndex = 0;
    for (const match of text.matchAll(rx)) {
      const word = match[1] || match[0];
      const start = match.index + match[0].indexOf(word);

      if (start > pos) frag.append(text.slice(pos, start));
      frag.append(makeSmallReplacement(word));

      pos = start + word.length;
      changed = true;
    }

    if (!changed) return;
    frag.append(text.slice(pos));
    node.replaceWith(frag);
  }

  function makeSmallReplacement(text) {
    const span = document.createElement("span");
    span.className = "skb-replacement skb-" + cfg.mode;
    span.dataset.skbText = text;

    if (cfg.mode === "inline-cats") {
      const img = document.createElement("img");
      const label = document.createElement("span");
      img.src = cat(text);
      img.alt = cfg.replacementLabel;
      label.textContent = "спойлер";
      span.append(img, label);
    } else if (cfg.mode === "hide") {
      span.textContent = "спойлер";
    } else if (cfg.mode === "mark") {
      span.textContent = "⚠ " + text;
    } else {
      span.textContent = text;
    }

    return span;
  }

  function hideImages(root) {
    const images = getElements(root, "img");

    for (const img of images) {
      if (countHidden() >= cfg.maxReplacements) return;
      if (!isGoodImage(img) || !imageLooksBad(img)) continue;
      replaceImage(img);
    }
  }

  function imageLooksBad(img) {
    const directText = imageText(img);
    const pageText = document.title + " " + decode(location.href);

    if (hasSpoiler(directText) && imageSize(img, 32, 32, 1200)) return true;
    if (
      hasSpoiler(pageText) &&
      isContentImage(img) &&
      imageSize(img, 70, 50, 5000)
    )
      return true;

    if (!img.complete && (hasSpoiler(directText) || hasSpoiler(pageText))) {
      img.addEventListener("load", () => scan(img), { once: true });
    }

    return false;
  }

  function imageText(img) {
    const figure = img.closest("figure, .thumb, .infobox, table");
    const link = img.closest("a");
    const list = [
      img.alt,
      img.title,
      img.getAttribute("aria-label"),
      decode(img.src),
      link ? link.title : "",
      figure ? figure.textContent : "",
      img.parentElement ? img.parentElement.textContent : "",
    ];

    return list.join(" ").replace(/\s+/g, " ").slice(0, 3000);
  }

  function replaceImage(img) {
    const picture = img.closest("picture");
    const box = document.createElement("span");
    const btn = document.createElement("button");
    const visual = picture || img;

    img.dataset.skbSrc = img.getAttribute("src") || "";
    img.dataset.skbSrcset = img.getAttribute("srcset") || "";
    img.dataset.skbSizes = img.getAttribute("sizes") || "";
    img.dataset.skbAlt = img.getAttribute("alt") || "";
    img.dataset.skbTitle = img.getAttribute("title") || "";

    if (picture) {
      for (const source of picture.querySelectorAll("source")) {
        source.dataset.skbSrcset = source.getAttribute("srcset") || "";
        source.removeAttribute("srcset");
      }
    }

    img.removeAttribute("srcset");
    img.removeAttribute("sizes");
    img.src = cat(img.dataset.skbSrc || Math.random());
    img.alt = "Изображение скрыто";
    img.title = "Показать оригинал";
    img.classList.add("skb-image-kitty");

    box.className = "skb-image-box";
    box.title = "Показать оригинал";
    btn.type = "button";
    btn.className = "skb-image-show";
    btn.textContent = "Показать оригинал";

    visual.parentNode.insertBefore(box, visual);
    box.append(visual, btn);
  }

  function watchPage() {
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => scan(document.body), 250);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function watchButtons() {
    document.addEventListener(
      "click",
      (event) => {
        const imageButton = event.target.closest(".skb-image-show");
        const imageBox = event.target.closest(".skb-image-box");
        const blockButton = event.target.closest(".skb-show");

        if (imageButton || imageBox) {
          event.preventDefault();
          showImage((imageButton || imageBox).closest(".skb-image-box"), true);
          return;
        }

        if (blockButton) {
          event.preventDefault();
          showBlock(blockButton.closest(".skb-blocked"));
        }
      },
      true,
    );
  }

  function showBlock(block) {
    if (!block || !block.dataset.skbHtml) return;

    working = true;
    block.innerHTML = block.dataset.skbHtml;
    block.classList.remove("skb-blocked");
    block.dataset.skbOpen = "yes";
    delete block.dataset.skbHtml;
    delete block.dataset.skbMatch;
    block.removeAttribute("aria-label");
    working = false;
  }

  function showImage(box, remember) {
    if (!box) return;

    const img = box.querySelector("img.skb-image-kitty");
    if (!img) return;

    const visual = img.closest("picture") || img;

    working = true;
    restorePicture(img);
    img.src = img.dataset.skbSrc || "";
    setAttr(img, "srcset", img.dataset.skbSrcset);
    setAttr(img, "sizes", img.dataset.skbSizes);
    setAttr(img, "alt", img.dataset.skbAlt);
    setAttr(img, "title", img.dataset.skbTitle);
    img.classList.remove("skb-image-kitty");
    if (remember) img.dataset.skbOpen = "yes";
    else delete img.dataset.skbOpen;
    cleanData(img, ["skbSrc", "skbSrcset", "skbSizes", "skbAlt", "skbTitle"]);

    box.parentNode.insertBefore(visual, box);
    box.remove();
    working = false;
  }

  function restorePicture(img) {
    const picture = img.closest("picture");
    if (!picture) return;

    for (const source of picture.querySelectorAll("source")) {
      setAttr(source, "srcset", source.dataset.skbSrcset);
      delete source.dataset.skbSrcset;
    }
  }

  function restoreAll() {
    working = true;

    for (const el of document.querySelectorAll(".skb-blocked[data-skb-html]")) {
      el.innerHTML = el.dataset.skbHtml;
      el.classList.remove("skb-blocked");
      delete el.dataset.skbHtml;
      delete el.dataset.skbMatch;
    }

    for (const el of document.querySelectorAll(
      ".skb-replacement[data-skb-text]",
    )) {
      el.replaceWith(document.createTextNode(el.dataset.skbText));
    }

    const boxes = Array.from(document.querySelectorAll(".skb-image-box"));
    working = false;

    for (const box of boxes) showImage(box, false);

    if (document.title === "🐾 Спойлер спрятан") {
      document.title = oldTitle;
    }
  }

  function watchMessages() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.type) return;

      if (msg.type === "SKB_GET_STATS") {
        sendResponse(stats());
        return true;
      }

      if (msg.type === "SKB_RESTORE") {
        restoreAll();
        sendResponse({ ok: true });
        return true;
      }

      if (msg.type === "SKB_RESCAN") {
        rescan().then(sendResponse);
        return true;
      }
    });
  }

  function watchOptions() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" || area === "local") rescan();
    });
  }

  async function rescan() {
    cfg = await load();
    rx = makeRegex();
    restoreAll();
    if (cfg.enabled) scan(document.body);
    return Object.assign({ ok: true }, stats());
  }

  function reportScan() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => {
      const payload = {
        type: "SKB_DB_RECORD_SCAN",
        url: location.href,
        pageTitle: document.title,
        stats: stats(),
        matches: collectMatches(),
      };
      chrome.runtime.sendMessage(payload).catch(() => undefined);
    }, 1200);
  }

  function collectMatches() {
    const inline = Array.from(
      document.querySelectorAll(".skb-replacement[data-skb-text]"),
    ).map((el) => el.dataset.skbText);
    const blocks = Array.from(
      document.querySelectorAll(".skb-blocked[data-skb-match]"),
    ).map((el) => el.dataset.skbMatch);
    return clean(inline.concat(blocks)).slice(0, 80);
  }

  function stats() {
    return {
      version: VERSION,
      enabled: cfg.enabled,
      mode: cfg.mode,
      replacements: countHidden(),
      blocks: document.querySelectorAll(".skb-blocked").length,
      inline: document.querySelectorAll(".skb-replacement").length,
      images: document.querySelectorAll(".skb-image-kitty").length,
      keywords: cfg.keywords.length,
      replaceImages: cfg.replaceImages,
    };
  }

  function getElements(root, selector) {
    if (root.nodeType !== 1) return [];
    const list = Array.from(root.querySelectorAll(selector));
    if (root.matches(selector)) list.unshift(root);
    return list;
  }

  function canChange(el) {
    if (!el || el.closest(BAD_PARENTS)) return false;
    if (el.closest(".skb-card, .skb-replacement, .skb-image-box")) return false;
    if (el.dataset.skbHtml || el.dataset.skbOpen === "yes") return false;
    return true;
  }

  function isGoodImage(img) {
    if (!img || img.tagName !== "IMG") return false;
    if (img.classList.contains("skb-image-kitty")) return false;
    if (img.dataset.skbSrc || img.dataset.skbOpen === "yes") return false;
    if (img.closest(".skb-card, .skb-replacement, .skb-image-box"))
      return false;
    if (
      (img.src || "").startsWith("chrome-extension://") ||
      (img.src || "").startsWith("moz-extension://")
    )
      return false;
    return true;
  }

  function isContentImage(img) {
    if (!img.closest(SITE_MAIN) || img.closest(SITE_TRASH)) return false;
    const name = (img.className + " " + img.id).toLowerCase();
    return !/icon|emoji|sprite|avatar|button|logo|badge/.test(name);
  }

  function imageSize(img, minW, minH, minArea) {
    const rect = img.getBoundingClientRect();
    const w = Number(img.naturalWidth || img.width || rect.width || 0);
    const h = Number(img.naturalHeight || img.height || rect.height || 0);
    return w >= minW && h >= minH && w * h >= minArea;
  }

  function hasSpoiler(text) {
    if (!text || !rx) return false;
    rx.lastIndex = 0;
    return rx.test(text);
  }

  function firstMatch(text) {
    rx.lastIndex = 0;
    const m = rx.exec(text);
    return m ? m[1] || m[0] : text;
  }

  function cat(seed) {
    let n = 0;
    seed = String(seed || Math.random());

    for (let i = 0; i < seed.length; i++) {
      n += seed.charCodeAt(i);
    }

    return chrome.runtime.getURL(
      "assets/cats/cat-spoiler-" + ((n % CATS) + 1) + ".svg",
    );
  }

  function countHidden() {
    return document.querySelectorAll(
      ".skb-blocked, .skb-replacement, .skb-image-kitty",
    ).length;
  }

  function setAttr(el, name, value) {
    if (value) el.setAttribute(name, value);
    else el.removeAttribute(name);
  }

  function cleanData(el, names) {
    for (const name of names) delete el.dataset[name];
  }

  function decode(text) {
    try {
      return decodeURIComponent(String(text || ""));
    } catch (e) {
      return String(text || "");
    }
  }
})();
