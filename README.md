# Spoiler Kitty Blocker

Проект для Chrome. Расширение скрывает слова, фразы и картинки по словарю. Данные можно хранить в SQLite через небольшой Python-скрипт.

## Состав проекта

manifest.json
src/                  код расширения
assets/               иконки и картинки котиков
backend/              Python + SQLite
test/sample_page.html страница для проверки
tools/build_zip.py    сборка архива

## Как запустить расширение

1. Распаковать архив.
2. Открыть "chrome://extensions".
3. Включить режим разработчика.
4. Нажать "Load unpacked".
5. Выбрать папку "2. Исполняемый файл".

ID расширения должен быть таким:

aghapakfihlebgbgickelomomopjnhbl


## Как подключить SQLite

В cmd перейти в папку "2. Исполняемый файл" и выполнить:

   bash
python backend/install_native_host.py


Для другого браузера:

   bash
python backend/install_native_host.py --browser edge
python backend/install_native_host.py --browser brave
python backend/install_native_host.py --browser chromium

После установки перезагрузить расширение в `chrome://extensions`.

## Где лежит база

По умолчанию находится в папке со всеми файлами курсовой:

10. БД.db


Другой путь можно указать так:

   bash
python backend/install_native_host.py --db /path/to/spoiler_kitty.sqlite3


## Таблицы SQLite

Схема лежит в "backend/schema.sql".

В базе есть несколько связанных таблиц:

- "settings" — настройки расширения;
- "categories" — категории слов;
- "keywords" — слова и фразы для блокировки;
- "pages" — страницы, где запускалась проверка;
- "scans" — отдельные проверки страниц;
- "matches" — найденные совпадения;
- "active_keywords" — view с активным словарём.

Это обычная учебная схема: есть справочник, основные данные, история проверок и связи через внешние ключи.

## Проверка базы

Выполнять из-под директории "2. Исполняемый файл".

   bash
sqlite3 ../"10. БД.db" ".tables"
sqlite3 ../"10. БД.db" < backend/query_examples.sql


## Удаление подключения SQLite

   bash
python backend/uninstall_native_host.py


## Сборка архива

   bash
python tools/build_zip.py


Готовый файл появится в папке "dist".
