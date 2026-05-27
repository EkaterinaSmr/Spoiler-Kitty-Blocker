#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import sqlite3
import struct
import sys
import traceback

HOST_VERSION = "1.4.2"
DB_ENV = "SPOILER_KITTY_DB"

CURRENT_PATH = pathlib.Path(__file__).parent.resolve()

DEFAULTS = {
    "enabled": True,
    "mode": "cats",
    "replaceImages": True,
    "wholeWord": False,
    "caseSensitive": False,
    "maxReplacements": 250,
    "replacementLabel": "Спойлер спрятан котиком",
    "keywords": [],
}

CATEGORIES = [
    ("series", "Сериалы", 3),
    ("names", "Имена", 2),
    ("events", "События", 5),
    ("custom", "Свои слова", 3),
]

DEFAULT_KEYWORDS = [
    ("Игра престолов", "series"),
    ("Game of Thrones", "series"),
    ("Дом Дракона", "series"),
    ("House of the Dragon", "series"),
    ("Джон Сноу", "names"),
    ("Jon Snow", "names"),
    ("Дейенерис", "names"),
    ("Daenerys", "names"),
    ("Таргариен", "names"),
    ("Targaryen", "names"),
    ("Ланнистер", "names"),
    ("Lannister", "names"),
    ("Старк", "names"),
    ("Stark", "names"),
    ("Серсея", "names"),
    ("Cersei", "names"),
    ("Джоффри", "names"),
    ("Joffrey", "names"),
    ("Эддард", "names"),
    ("Eddard", "names"),
    ("Нед Старк", "names"),
    ("Ned Stark", "names"),
    ("Вестерос", "series"),
    ("Вестероса", "series"),
    ("Вестеросу", "series"),
    ("Роберт Баратеон", "names"),
    ("Роберта Баратеона", "names"),
    ("Эддарда", "names"),
    ("Старка", "names"),
    ("Старками", "names"),
    ("Ланнистеры", "names"),
    ("Ланнистерами", "names"),
    ("Серсеи", "names"),
    ("Пять Королей", "events"),
    ("Ночной Дозор", "series"),
    ("Дозор", "series"),
    ("Красная свадьба", "events"),
    ("Red Wedding", "events"),
    ("Ночной король", "names"),
    ("Night King", "names"),
    ("White Walkers", "series"),
    ("Белые ходоки", "series"),
    ("Hodor", "names"),
    ("Валар Моргулис", "events"),
    ("Valar Morghulis", "events"),
    ("зима близко", "events"),
    ("winter is coming", "events"),
]


def main():
    try:
        while True:
            message = read_message()
            if message is None:
                return 0
            try:
                answer = handle(message)
            except Exception as error:
                answer = {
                    "ok": False,
                    "error": str(error),
                    "traceback": traceback.format_exc(limit=4),
                }
            write_message(answer)
    except BrokenPipeError:
        return 0


def read_message():
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise RuntimeError("Bad message header")
    size = struct.unpack("<I", header)[0]
    if size > 1024 * 1024:
        raise RuntimeError("Message is too large")
    data = sys.stdin.buffer.read(size)
    if len(data) != size:
        raise RuntimeError("Bad message body")
    return json.loads(data.decode("utf-8"))


def write_message(data):
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def handle(message):
    command = str(message.get("command") or "status")
    with open_db() as db:
        prepare_db(db, message.get("defaults") or DEFAULTS)

        if command == "status":
            return status(db)
        if command == "get_config":
            return get_config(db, message.get("defaults") or DEFAULTS)
        if command == "save_config":
            return save_config(db, message.get("config") or {})
        if command == "add_keyword":
            return add_keyword(db, message.get("keyword") or "")
        if command == "record_scan":
            return record_scan(db, message)
        if command == "stats":
            return {"ok": True, "dbPath": str(db_path()), "counts": count_rows(db)}

    return {"ok": False, "error": "Неизвестная команда."}


def open_db():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def db_path():
    value = os.environ.get(DB_ENV)
    if value:
        return pathlib.Path(value).expanduser().resolve()
    return CURRENT_PATH.parent.parent / "10. БД.db"


def prepare_db(db, defaults):
    schema = pathlib.Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
    db.executescript(schema)

    for name, title, severity in CATEGORIES:
        db.execute(
            """
            INSERT INTO categories(name, title, severity)
            VALUES (?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET title = excluded.title, severity = excluded.severity
            """,
            (name, title, severity),
        )

    if db.execute("SELECT COUNT(*) AS n FROM keywords").fetchone()["n"] == 0:
        for phrase, category in DEFAULT_KEYWORDS:
            insert_keyword(db, phrase, category)

    if get_setting(db, "enabled") is None:
        save_settings(db, normalize_config(defaults))

    set_setting(db, "hostVersion", HOST_VERSION)
    db.commit()


def get_config(db, defaults):
    config = normalize_config(defaults)
    for name in [
        "enabled",
        "mode",
        "replaceImages",
        "wholeWord",
        "caseSensitive",
        "maxReplacements",
        "replacementLabel",
    ]:
        value = get_setting(db, name)
        if value is not None:
            config[name] = value

    rows = db.execute("""
        SELECT phrase
        FROM keywords
        WHERE active = 1
        ORDER BY length(phrase) DESC, phrase COLLATE NOCASE
        """).fetchall()
    config["keywords"] = clean_keywords([row["phrase"] for row in rows])

    return {
        "ok": True,
        "config": normalize_config(config),
        "dbPath": str(db_path()),
        "counts": count_rows(db),
    }


def save_config(db, config):
    config = normalize_config(config)
    save_settings(db, config)
    db.execute("UPDATE keywords SET active = 0, updated_at = CURRENT_TIMESTAMP")

    for phrase in config["keywords"]:
        insert_keyword(db, phrase, "custom")

    db.commit()
    return get_config(db, config)


def add_keyword(db, phrase):
    text = clean_phrase(phrase)
    if len(text) < 2:
        return {"ok": False, "error": "Слово слишком короткое."}

    insert_keyword(db, text, "custom")
    db.commit()
    config = get_config(db, DEFAULTS)["config"]
    return {
        "ok": True,
        "keyword": text,
        "config": config,
        "counts": count_rows(db),
        "dbPath": str(db_path()),
    }


def record_scan(db, message):
    url = str(message.get("url") or "")[:4096]
    title = str(message.get("pageTitle") or "")[:512]
    stats = message.get("stats") or {}
    matches = clean_keywords(message.get("matches") or [])

    page_id = save_page(db, url, title)
    cursor = db.execute(
        """
        INSERT INTO scans(page_id, replacements_count, blocks_count, inline_count, images_count)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            page_id,
            to_int(stats.get("replacements"), 0),
            to_int(stats.get("blocks"), 0),
            to_int(stats.get("inline"), 0),
            to_int(stats.get("images"), 0),
        ),
    )
    scan_id = cursor.lastrowid

    for text in matches[:80]:
        db.execute(
            """
            INSERT INTO matches(scan_id, keyword_id, matched_text, normalized_match, place)
            VALUES (?, ?, ?, ?, 'content')
            """,
            (scan_id, find_keyword_id(db, text), text, normalize(text)),
        )

    db.commit()
    return {
        "ok": True,
        "scanId": scan_id,
        "matches": len(matches),
        "counts": count_rows(db),
    }


def save_page(db, url, title):
    key = url or "about:blank-" + short_hash(title)
    db.execute(
        """
        INSERT INTO pages(url, title)
        VALUES (?, ?)
        ON CONFLICT(url) DO UPDATE SET title = excluded.title, last_seen_at = CURRENT_TIMESTAMP
        """,
        (key, title),
    )
    return db.execute("SELECT id FROM pages WHERE url = ?", (key,)).fetchone()["id"]


def insert_keyword(db, phrase, category_name):
    text = clean_phrase(phrase)
    if len(text) < 2:
        return None

    category_id = get_category_id(db, category_name)
    db.execute(
        """
        INSERT INTO keywords(phrase, normalized_phrase, language, kind, category_id, active)
        VALUES (?, ?, ?, ?, ?, 1)
        ON CONFLICT(normalized_phrase) DO UPDATE SET
          phrase = excluded.phrase,
          language = excluded.language,
          kind = excluded.kind,
          category_id = COALESCE(excluded.category_id, keywords.category_id),
          active = 1,
          updated_at = CURRENT_TIMESTAMP
        """,
        (text, normalize(text), language(text), kind(text), category_id),
    )
    row = db.execute(
        "SELECT id FROM keywords WHERE normalized_phrase = ?", (normalize(text),)
    ).fetchone()
    return row["id"] if row else None


def get_category_id(db, name):
    row = db.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
    return row["id"] if row else None


def find_keyword_id(db, phrase):
    row = db.execute(
        "SELECT id FROM keywords WHERE normalized_phrase = ?", (normalize(phrase),)
    ).fetchone()
    return row["id"] if row else None


def save_settings(db, config):
    for name in [
        "enabled",
        "mode",
        "replaceImages",
        "wholeWord",
        "caseSensitive",
        "maxReplacements",
        "replacementLabel",
    ]:
        set_setting(db, name, config[name])


def set_setting(db, name, value):
    db.execute(
        """
        INSERT INTO settings(name, value)
        VALUES (?, ?)
        ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        """,
        (name, json.dumps(value, ensure_ascii=False)),
    )


def get_setting(db, name):
    row = db.execute("SELECT value FROM settings WHERE name = ?", (name,)).fetchone()
    if not row:
        return None
    try:
        return json.loads(row["value"])
    except json.JSONDecodeError:
        return row["value"]


def status(db):
    return {
        "ok": True,
        "available": True,
        "hostVersion": HOST_VERSION,
        "dbPath": str(db_path()),
        "counts": count_rows(db),
    }


def count_rows(db):
    result = {}
    for name in ["categories", "keywords", "pages", "scans", "matches"]:
        result[name] = db.execute(f"SELECT COUNT(*) AS n FROM {name}").fetchone()["n"]
    return result


def normalize_config(config):
    data = dict(DEFAULTS)
    data.update(config or {})

    if data.get("mode") not in ["cats", "inline-cats", "blur", "hide", "mark"]:
        data["mode"] = "cats"

    return {
        "enabled": bool(data.get("enabled", True)),
        "mode": data["mode"],
        "replaceImages": bool(data.get("replaceImages", True)),
        "wholeWord": bool(data.get("wholeWord", False)),
        "caseSensitive": bool(data.get("caseSensitive", False)),
        "maxReplacements": min(5000, max(1, to_int(data.get("maxReplacements"), 250))),
        "replacementLabel": str(
            data.get("replacementLabel") or DEFAULTS["replacementLabel"]
        )[:80],
        "keywords": clean_keywords(data.get("keywords") or []),
    }


def clean_keywords(items):
    result = []
    used = set()
    for item in items:
        text = clean_phrase(item)
        key = normalize(text)
        if len(text) > 1 and key not in used:
            used.add(key)
            result.append(text)
    return result[:1000]


def clean_phrase(value):
    return " ".join(str(value or "").strip().split())


def normalize(value):
    return clean_phrase(value).casefold()


def language(text):
    if any("а" <= ch.lower() <= "я" or ch.lower() == "ё" for ch in text):
        return "ru"
    if any("a" <= ch.lower() <= "z" for ch in text):
        return "en"
    return "mixed"


def kind(text):
    if " " in text:
        return "phrase"
    if text[:1].isupper():
        return "name"
    return "word"


def short_hash(text):
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()[:12]


def to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


if __name__ == "__main__":
    raise SystemExit(main())
