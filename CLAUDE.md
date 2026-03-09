# Awaterra World

Структурированная база знаний мира Awaterra 2225. Markdown-файлы с YAML frontmatter + веб-дашборд.

## Commands

npm run dashboard     # Launch dashboard on :3000
npm run dev           # Dashboard with hot reload
npm run build-index   # Rebuild index.json from all .md files
npm run migrate       # Migrate content from source file

## Architecture

concepts/          — factual articles about the world (technology, daily life, etc.)
scenes/            — narrative scenes illustrating concepts
meta/              — foundational definitions (7 parameters, glossary)
scripts/           — build-index.ts, migrate.ts
dashboard/         — Express server + vanilla JS UI
  server.ts        — Express app, serves API + static
  api.ts           — CRUD endpoints for .md files
  public/          — HTML/CSS/JS frontend
index.json         — auto-generated graph (DO NOT edit manually)

## File Format

Every .md file has YAML frontmatter with required fields:
- id, title, type (concept|scene|meta), domain, status (complete|draft|stub), tags, updated
- Optional: related, illustratedBy, illustrates, characters

## Key Rules

- index.json is auto-generated — never edit manually, run build-index
- All content in Russian
- Frontmatter tags are lowercase Russian words
- IDs are lowercase latin with hyphens (e.g. awaband, neuro-companion)
