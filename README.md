# Awaterra World

Структурированная база знаний мира Awaterra 2225 — научно-фантастической вселенной. Контент хранится в Markdown-файлах с YAML frontmatter, навигация через веб-дашборд.

## Установка

```bash
npm install
```

## Запуск дашборда

```bash
npm run dashboard    # http://localhost:3000
npm run dev          # с hot reload
```

## Добавление контента

1. Создайте `.md` файл в нужной папке (`concepts/`, `scenes/`, `meta/`)
2. Добавьте YAML frontmatter (см. схему ниже)
3. Запустите `npm run build-index` для обновления индекса

## Структура проекта

| Папка | Назначение |
|-------|-----------|
| `concepts/` | Фактические статьи о мире (технологии, быт, общество) |
| `scenes/` | Нарративные сцены, иллюстрирующие концепции |
| `meta/` | Базовые определения (7 параметров, глоссарий) |
| `scripts/` | Скрипты сборки и миграции |
| `dashboard/` | Express-сервер + веб-интерфейс |

## Frontmatter

| Поле | Тип | Обязательное | Описание |
|------|-----|:---:|----------|
| `id` | string | да | Уникальный идентификатор (латиница, дефисы) |
| `title` | string | да | Название на русском |
| `type` | enum | да | `concept`, `scene` или `meta` |
| `domain` | string | да | Тематическая область |
| `status` | enum | да | `complete`, `draft` или `stub` |
| `tags` | string[] | да | Теги (русские, строчные) |
| `updated` | date | да | Дата последнего обновления |
| `related` | string[] | нет | Связанные id |
| `illustratedBy` | string[] | нет | Сцены, иллюстрирующие концепт |
| `illustrates` | string[] | нет | Концепты, которые иллюстрирует сцена |
| `characters` | string[] | нет | Персонажи (для сцен) |

### Пример

```yaml
---
id: awaband
title: Авабанд
type: concept
domain: технологии
status: draft
tags: [авабанд, устройства, повседневность]
updated: 2026-03-09
related: [neuro-companion]
---
```
