/**
 * migrate.ts — Split "Мир 2225.md" into structured markdown files with YAML frontmatter.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts [path-to-source]
 *   Default source: ../awaterra/Мир 2225.md (relative to project root)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FileSpec {
  path: string;            // e.g. "concepts/awaband.md"
  id: string;
  title: string;
  type: "concept" | "scene" | "meta";
  domain: string;
  status: "complete" | "draft" | "stub";
  tags: string[];
  related?: string[];
  illustratedBy?: string[];
  illustrates?: string[];
  characters?: string[];
  /** How to extract content: header pattern(s) or line ranges */
  extract: ExtractRule;
  /** Extra body to prepend/append (for meta files assembled from multiple sources) */
  extraBody?: string;
}

type ExtractRule =
  | { kind: "lines"; from: number; to: number }
  | { kind: "headers"; patterns: string[]; includeSubsections?: boolean }
  | { kind: "headerRange"; from: string; to: string }
  | { kind: "custom"; fn: (lines: string[], sections: Section[]) => string }
  | { kind: "stub" }
  | { kind: "literal"; body: string };

interface Section {
  level: number;       // 1 for #, 2 for ##, 3 for ###
  title: string;       // raw title text
  lineStart: number;   // 0-based
  lineEnd: number;     // exclusive, 0-based
  raw: string;         // full text of section (including header)
  body: string;        // text without the header line
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname ?? ".", "..");

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function buildFrontmatter(spec: FileSpec): string {
  const lines: string[] = ["---"];
  lines.push(`id: ${spec.id}`);
  lines.push(`title: "${spec.title}"`);
  lines.push(`type: ${spec.type}`);
  lines.push(`domain: ${spec.domain}`);
  lines.push(`status: ${spec.status}`);
  lines.push("tags:");
  for (const t of spec.tags) lines.push(`  - ${t}`);
  if (spec.related?.length) {
    lines.push("related:");
    for (const r of spec.related) lines.push(`  - ${r}`);
  }
  if (spec.illustratedBy?.length) {
    lines.push("illustratedBy:");
    for (const r of spec.illustratedBy) lines.push(`  - ${r}`);
  }
  if (spec.illustrates?.length) {
    lines.push("illustrates:");
    for (const r of spec.illustrates) lines.push(`  - ${r}`);
  }
  if (spec.characters?.length) {
    lines.push("characters:");
    for (const r of spec.characters) lines.push(`  - ${r}`);
  }
  lines.push(`updated: 2026-03-09`);
  lines.push("---");
  return lines.join("\n");
}

/** Parse source into sections by headers */
function parseSections(lines: string[]): Section[] {
  const sections: Section[] = [];
  let current: { level: number; title: string; lineStart: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)/);
    if (match) {
      if (current) {
        const raw = lines.slice(current.lineStart, i).join("\n");
        const bodyLines = lines.slice(current.lineStart + 1, i);
        sections.push({
          level: current.level,
          title: current.title,
          lineStart: current.lineStart,
          lineEnd: i,
          raw,
          body: bodyLines.join("\n").trim(),
        });
      }
      current = {
        level: match[1].length,
        title: match[2].replace(/\*\*/g, "").replace(/\\\!/g, "!").trim(),
        lineStart: i,
      };
    }
  }
  // last section
  if (current) {
    const raw = lines.slice(current.lineStart).join("\n");
    const bodyLines = lines.slice(current.lineStart + 1);
    sections.push({
      level: current.level,
      title: current.title,
      lineStart: current.lineStart,
      lineEnd: lines.length,
      raw,
      body: bodyLines.join("\n").trim(),
    });
  }
  return sections;
}

/** Find sections whose title matches any of the patterns */
function findSections(sections: Section[], patterns: string[]): Section[] {
  return sections.filter((s) =>
    patterns.some((p) => s.title.toLowerCase().includes(p.toLowerCase()))
  );
}

/** Extract lines (1-indexed, inclusive) */
function extractLines(lines: string[], from1: number, to1: number): string {
  return lines.slice(from1 - 1, to1).join("\n").trim();
}

/** Clean body: remove duplicate top-level headers that repeat the section title, trim, remove trailing --- */
function cleanBody(text: string): string {
  let result = text
    .replace(/^#{1,3}\s*\*{0,2}WIKI\*{0,2}\s*$/gm, "")
    .replace(/^#{1,3}\s*$/gm, "")
    .replace(/^---\s*$/gm, "")
    .trim();

  // Remove leading duplicate header (e.g. "# AWABAND Браслет\n\nAWABAND Браслет")
  const headerMatch = result.match(/^#{1,3}\s+(.+)\n+/);
  if (headerMatch) {
    const afterHeader = result.slice(headerMatch[0].length);
    const titleClean = headerMatch[1].replace(/\*\*/g, "").trim();
    // Check if next non-empty line is just the title repeated
    const firstLine = afterHeader.split("\n")[0].replace(/\*\*/g, "").trim();
    if (firstLine === titleClean || firstLine.startsWith(titleClean)) {
      result = headerMatch[0] + afterHeader.split("\n").slice(1).join("\n").trimStart();
    }
  }

  // Remove standalone repeated title lines (plain text, no #)
  result = result.replace(/^[A-ZА-ЯЁ][A-ZА-ЯЁ\s]+$/gm, (match) => {
    // Only remove if it looks like a duplicate header (ALL CAPS short line)
    return match.trim().length < 60 ? "" : match;
  });

  return result.replace(/\n{3,}/g, "\n\n").trim();
}

/** Get content for a section range by header patterns */
function extractByHeaders(
  sections: Section[],
  patterns: string[],
  includeSubsections: boolean = true
): string {
  const found = findSections(sections, patterns);
  if (found.length === 0) return "";

  if (!includeSubsections) {
    return found.map((s) => s.raw).join("\n\n");
  }

  // Include the first match and all following sections until next section at same or higher level
  const first = found[0];
  const idx = sections.indexOf(first);
  const parts: string[] = [first.raw];
  for (let i = idx + 1; i < sections.length; i++) {
    if (sections[i].level <= first.level) break;
    parts.push(sections[i].raw);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// File specifications
// ---------------------------------------------------------------------------

function buildSpecs(): FileSpec[] {
  const specs: FileSpec[] = [];

  // ── SCENES ──────────────────────────────────────────────────────────────

  specs.push({
    path: "scenes/sunday-square.md",
    id: "sunday-square",
    title: "Воскресенье на площади",
    type: "scene",
    domain: "daily-life",
    status: "complete",
    tags: ["повседневность", "площадь", "наблюдение", "заземление"],
    illustrates: ["awaband", "neuro-companion", "seven-parameters"],
    extract: { kind: "lines", from: 1, to: 40 },
  });

  specs.push({
    path: "scenes/lina-sunday-morning.md",
    id: "lina-sunday-morning",
    title: "Лина. Воскресное утро",
    type: "scene",
    domain: "daily-life",
    status: "complete",
    tags: ["повседневность", "кафе", "спутник", "лина"],
    illustrates: ["awaband", "neuro-companion", "cafe-menu"],
    characters: ["Лина"],
    extract: { kind: "lines", from: 43, to: 98 },
  });

  specs.push({
    path: "scenes/guy-checks-companion.md",
    id: "guy-checks-companion",
    title: "Парень проверяет спутника",
    type: "scene",
    domain: "daily-life",
    status: "complete",
    tags: ["повседневность", "спутник", "браслет"],
    illustrates: ["awaband", "neuro-companion"],
    extract: { kind: "lines", from: 100, to: 108 },
  });

  specs.push({
    path: "scenes/woman-comes-home.md",
    id: "woman-comes-home",
    title: "Женщина приходит домой",
    type: "scene",
    domain: "daily-life",
    status: "complete",
    tags: ["повседневность", "квартира", "умный дом", "кот"],
    illustrates: ["apartment", "kitchen", "fridge", "awaband"],
    extract: { kind: "lines", from: 354, to: 404 },
  });

  specs.push({
    path: "scenes/evening-concert.md",
    id: "evening-concert",
    title: "Вечерний концерт и танцы",
    type: "scene",
    domain: "daily-life",
    status: "complete",
    tags: ["вечер", "музыка", "танцы", "браслет", "светлячки"],
    illustrates: ["music-and-dance", "awaband"],
    extract: { kind: "lines", from: 464, to: 480 },
  });

  specs.push({
    path: "scenes/bar-evening.md",
    id: "bar-evening",
    title: "Вечер в баре",
    type: "scene",
    domain: "daily-life",
    status: "complete",
    tags: ["бар", "вечер", "напитки", "люди"],
    illustrates: ["bar", "bar-drinks", "awaband"],
    extract: { kind: "lines", from: 482, to: 496 },
  });

  // ── CONCEPTS ────────────────────────────────────────────────────────────

  specs.push({
    path: "concepts/awaband.md",
    id: "awaband",
    title: "AWABAND — браслет",
    type: "concept",
    domain: "technology",
    status: "complete",
    tags: ["браслет", "поле", "свечение", "динь", "светимость"],
    related: ["neuro-companion", "seven-parameters"],
    illustratedBy: ["sunday-square", "lina-sunday-morning", "guy-checks-companion"],
    extract: { kind: "lines", from: 113, to: 162 },
  });

  specs.push({
    path: "concepts/who-doesnt-wear.md",
    id: "who-doesnt-wear",
    title: "Кто не носит браслет",
    type: "concept",
    domain: "society",
    status: "complete",
    tags: ["браслет", "отказ", "общество", "приватность"],
    related: ["awaband"],
    extract: { kind: "lines", from: 163, to: 188 },
  });

  specs.push({
    path: "concepts/neuro-companion.md",
    id: "neuro-companion",
    title: "Нейро-спутник",
    type: "concept",
    domain: "technology",
    status: "complete",
    tags: ["спутник", "инсайдер", "сфера", "зеркало", "поле"],
    related: ["awaband", "companion-privacy", "seven-parameters"],
    illustratedBy: ["lina-sunday-morning", "guy-checks-companion", "sunday-square"],
    extract: { kind: "lines", from: 189, to: 268 },
  });

  specs.push({
    path: "concepts/companion-privacy.md",
    id: "companion-privacy",
    title: "Приватность спутника",
    type: "concept",
    domain: "society",
    status: "complete",
    tags: ["спутник", "приватность", "открытость", "этикет", "доверие"],
    related: ["neuro-companion", "awaband"],
    extract: { kind: "lines", from: 273, to: 316 },
  });

  specs.push({
    path: "concepts/robots.md",
    id: "robots",
    title: "Роботы в 2225 году",
    type: "concept",
    domain: "technology",
    status: "complete",
    tags: ["роботы", "утилитарность", "невидимость", "клинеры", "дроны"],
    related: ["apartment", "awaband"],
    extract: { kind: "lines", from: 331, to: 352 },
  });

  specs.push({
    path: "concepts/apartment.md",
    id: "apartment",
    title: "Квартира",
    type: "concept",
    domain: "daily-life",
    status: "complete",
    tags: ["квартира", "умный дом", "биополимер", "мембрана", "капсула тишины"],
    related: ["awaband", "kitchen", "fridge", "robots"],
    illustratedBy: ["woman-comes-home"],
    extract: { kind: "lines", from: 354, to: 368 },
  });

  specs.push({
    path: "concepts/kitchen.md",
    id: "kitchen",
    title: "Кухня",
    type: "concept",
    domain: "daily-life",
    status: "complete",
    tags: ["кухня", "волновая панель", "диспергатор", "водяной блок"],
    related: ["apartment", "fridge", "awaband"],
    illustratedBy: ["woman-comes-home"],
    extract: { kind: "lines", from: 370, to: 385 },
  });

  specs.push({
    path: "concepts/fridge.md",
    id: "fridge",
    title: "Холодильник",
    type: "concept",
    domain: "daily-life",
    status: "complete",
    tags: ["холодильник", "мембрана", "молекулярный резонанс", "капсулы", "хранение"],
    related: ["apartment", "kitchen"],
    illustratedBy: ["woman-comes-home"],
    extract: { kind: "lines", from: 386, to: 404 },
  });

  specs.push({
    path: "concepts/cafe-menu.md",
    id: "cafe-menu",
    title: "Меню в кафе",
    type: "concept",
    domain: "daily-life",
    status: "complete",
    tags: ["кафе", "меню", "еда", "напитки", "параметры"],
    related: ["awaband", "neuro-companion", "seven-parameters"],
    illustratedBy: ["lina-sunday-morning"],
    extract: { kind: "lines", from: 406, to: 422 },
  });

  specs.push({
    path: "concepts/transport.md",
    id: "transport",
    title: "Транспорт",
    type: "concept",
    domain: "technology",
    status: "complete",
    tags: ["транспорт", "антиграв", "платформа", "резонанс"],
    related: ["awaband"],
    extract: { kind: "lines", from: 424, to: 438 },
  });

  specs.push({
    path: "concepts/sport.md",
    id: "sport",
    title: "Спорт",
    type: "concept",
    domain: "society",
    status: "complete",
    tags: ["спорт", "площадка", "бег", "игра", "поле"],
    related: ["awaband"],
    extract: { kind: "lines", from: 440, to: 463 },
  });

  specs.push({
    path: "concepts/music-and-dance.md",
    id: "music-and-dance",
    title: "Музыка и танцы",
    type: "concept",
    domain: "culture",
    status: "complete",
    tags: ["музыка", "танцы", "инструменты", "вечер", "концерт"],
    related: ["awaband"],
    illustratedBy: ["evening-concert"],
    extract: { kind: "lines", from: 464, to: 480 },
  });

  specs.push({
    path: "concepts/bar.md",
    id: "bar",
    title: "Бар",
    type: "concept",
    domain: "daily-life",
    status: "complete",
    tags: ["бар", "бармен", "напитки", "вечер"],
    related: ["bar-drinks", "forbidden-substances"],
    illustratedBy: ["bar-evening"],
    extract: {
      kind: "custom",
      fn: (lines) => {
        const barIntro = extractLines(lines, 482, 496);
        const bartender = extractLines(lines, 570, 582);
        return barIntro + "\n\n## Бармен\n\n" + bartender;
      },
    },
  });

  specs.push({
    path: "concepts/bar-drinks.md",
    id: "bar-drinks",
    title: "Бар. Меню напитков",
    type: "concept",
    domain: "daily-life",
    status: "complete",
    tags: ["бар", "напитки", "амбра", "дымка", "солар", "линза", "тишина", "мост"],
    related: ["bar", "forbidden-substances"],
    extract: { kind: "lines", from: 498, to: 568 },
  });

  specs.push({
    path: "concepts/forbidden-substances.md",
    id: "forbidden-substances",
    title: "Запрещённые вещества",
    type: "concept",
    domain: "substances",
    status: "complete",
    tags: ["запрещёнка", "вспышка", "стена", "зеркало", "петля", "поле", "повреждение"],
    related: ["awaband", "neuro-companion", "seven-parameters", "bar"],
    extract: { kind: "lines", from: 584, to: 735 },
  });

  specs.push({
    path: "concepts/nature-as-tool.md",
    id: "nature-as-tool",
    title: "Природа как инструмент",
    type: "concept",
    domain: "nature",
    status: "complete",
    tags: ["природа", "земля", "вода", "огонь", "сад", "акустика", "небо"],
    related: ["seven-parameters", "studios-overview"],
    extract: { kind: "lines", from: 736, to: 771 },
  });

  specs.push({
    path: "concepts/studios-overview.md",
    id: "studios-overview",
    title: "Студии балансировки — обзор",
    type: "concept",
    domain: "culture",
    status: "complete",
    tags: ["студии", "балансировка", "параметры", "город"],
    related: [
      "seven-parameters",
      "studio-terrapod",
      "studio-aquaflow",
      "studio-solarchargepod",
      "studio-heartopen",
      "studio-remaining",
    ],
    extract: { kind: "lines", from: 772, to: 784 },
  });

  specs.push({
    path: "concepts/studio-terrapod.md",
    id: "studio-terrapod",
    title: "Студия TerraPod — Стабильность",
    type: "concept",
    domain: "culture",
    status: "complete",
    tags: ["студия", "стабильность", "красный", "terrapod", "заземление"],
    related: ["seven-parameters", "studios-overview"],
    extract: { kind: "lines", from: 786, to: 799 },
  });

  specs.push({
    path: "concepts/studio-aquaflow.md",
    id: "studio-aquaflow",
    title: "Студия AquaFlow — Поток",
    type: "concept",
    domain: "culture",
    status: "complete",
    tags: ["студия", "поток", "оранжевый", "aquaflow", "вода"],
    related: ["seven-parameters", "studios-overview"],
    extract: { kind: "lines", from: 802, to: 815 },
  });

  specs.push({
    path: "concepts/studio-solarchargepod.md",
    id: "studio-solarchargepod",
    title: "Студия SolarCharge — Энергия",
    type: "concept",
    domain: "culture",
    status: "complete",
    tags: ["студия", "энергия", "жёлтый", "solarchargepod", "свет"],
    related: ["seven-parameters", "studios-overview"],
    extract: { kind: "lines", from: 818, to: 831 },
  });

  specs.push({
    path: "concepts/studio-heartopen.md",
    id: "studio-heartopen",
    title: "Студия HeartOpen — Резонанс",
    type: "concept",
    domain: "culture",
    status: "complete",
    tags: ["студия", "резонанс", "зелёный", "heartopen", "сердце"],
    related: ["seven-parameters", "studios-overview"],
    extract: { kind: "lines", from: 834, to: 849 },
  });

  specs.push({
    path: "concepts/studio-remaining.md",
    id: "studio-remaining",
    title: "Студии SoundBirth, SilencePod, UnityDome",
    type: "concept",
    domain: "culture",
    status: "complete",
    tags: ["студия", "вибрация", "ясность", "целостность", "голубой", "индиго", "фиолетовый"],
    related: ["seven-parameters", "studios-overview"],
    extract: { kind: "lines", from: 852, to: 907 },
  });

  // ── META ─────────────────────────────────────────────────────────────────

  specs.push({
    path: "meta/seven-parameters.md",
    id: "seven-parameters",
    title: "Семь параметров биополя",
    type: "meta",
    domain: "technology",
    status: "complete",
    tags: ["параметры", "поле", "частоты", "цвета"],
    related: [
      "awaband",
      "neuro-companion",
      "studios-overview",
      "studio-terrapod",
      "studio-aquaflow",
      "studio-solarchargepod",
      "studio-heartopen",
      "studio-remaining",
    ],
    extract: {
      kind: "literal",
      body: `# Семь параметров биополя

В мире 2225 года состояние человека описывается через семь параметров биополя. Каждый параметр связан с определённым цветом, частотой, областью тела и студией балансировки.

## Параметры

| # | Параметр | Цвет | Частота | Область тела | Студия |
|---|----------|------|---------|-------------|--------|
| 1 | Стабильность | Красный | 396 Hz | Надпочечники | TerraPod |
| 2 | Поток | Оранжевый | 417 Hz | Крестец | AquaFlow |
| 3 | Энергия | Жёлтый | 528 Hz | Солнечное сплетение | SolarCharge |
| 4 | Резонанс | Зелёный | 639 Hz | Тимус / сердце | HeartOpen |
| 5 | Вибрация | Голубой | 741 Hz | Горло | SoundBirth |
| 6 | Ясность | Индиго | 852 Hz | Эпифиз / лоб | SilencePod |
| 7 | Целостность | Фиолетовый | 963 Hz | Темя | UnityDome |

## Светимость

Общий тон свечения браслета AWABAND — это смешение всех семи параметров в один живой оттенок. Называется **Светимость**. Когда все параметры в балансе, свечение ровное, зеленовато-золотистое. При дисбалансе цвет сдвигается, тускнеет или начинает пульсировать неравномерно.

## Проекция семёрки

Человек касается браслета двумя пальцами — перед запястьем появляется маленькая проекция: семь тонких полосок, каждая своего цвета и длины. Текущее состояние на сейчас. Большинство смотрят секунды три и убирают.

## Частоты

Частоты параметров основаны на сольфеджио:
- 396 Hz — освобождение от страха, заземление
- 417 Hz — трансформация, движение
- 528 Hz — восстановление, «частота любви»
- 639 Hz — связь, гармония отношений
- 741 Hz — самовыражение, пробуждение интуиции
- 852 Hz — возвращение к духовному порядку
- 963 Hz — связь с высшим, единство`,
    },
  });

  specs.push({
    path: "meta/ecology-of-consciousness.md",
    id: "ecology-of-consciousness",
    title: "Экология сознания",
    type: "meta",
    domain: "society",
    status: "draft",
    tags: ["экология сознания", "наука", "поле"],
    related: ["seven-parameters", "awaband", "neuro-companion"],
    extract: {
      kind: "literal",
      body: `# Экология сознания

**Экология сознания** — фундаментальная наука мира 2225 года. Она изучает взаимосвязь между внутренним состоянием человека и его биополем, а также взаимодействие полей между людьми и со средой.

## Основные принципы

- Каждый человек обладает измеримым биополем, описываемым семью параметрами.
- Поле не статично — оно реагирует на состояние тела, эмоции, мысли, окружение.
- Поля людей взаимодействуют: повреждённое поле ощущается окружающими как дискомфорт, гармоничное — как тепло.
- Городская среда, архитектура, природные зоны и студии балансировки проектируются с учётом влияния на поле.

## Технологии на основе экологии сознания

- **AWABAND** — браслет, считывающий семь параметров биополя в реальном времени.
- **Нейро-спутник** — визуальное отражение внутреннего состояния, вызываемое из браслета.
- **Студии балансировки** — пространства для точечной коррекции параметров.
- **Умный дом** — адаптация освещения, температуры, воды под текущее состояние жителя.
- **Flow Cluster** — рабочие пространства с контролем входа по состоянию поля.

## Открытые вопросы

> Этот раздел требует дополнительной проработки: история возникновения науки, ключевые открытия, институты, образование в области экологии сознания.`,
    },
  });

  specs.push({
    path: "meta/glossary.md",
    id: "glossary",
    title: "Глоссарий",
    type: "meta",
    domain: "technology",
    status: "complete",
    tags: ["глоссарий", "термины"],
    related: ["seven-parameters", "awaband", "neuro-companion"],
    extract: {
      kind: "literal",
      body: `# Глоссарий мира 2225

## Технологии и устройства

- **AWABAND** — браслет из биополимера, считывающий семь параметров биополя. Носится на запястье, не имеет экрана и кнопок. Информация передаётся через свечение внутри материала.
- **Нейро-спутник (инсайдер)** — визуальная проекция внутреннего состояния человека. Вызывается из браслета жестом. У каждого уникальная форма: медуза, пламя, кристалл, пух и т.д.
- **Светимость** — общий тон свечения браслета, смешение всех семи параметров в один цвет.
- **Динь** — лёгкая тактильная вибрация браслета при встрече с другим человеком. Мгновенное считывание общего тона чужого поля.
- **Вокализатор** — устройство на шее животного, переводящее звуки в человеческую речь.

## Пространства

- **Flow Cluster** — рабочее пространство с контролем входа по состоянию поля. При нарушенной Стабильности двери не открываются.
- **BioSoil Garden** — городская зона с живой почвой для экстренного заземления. Земля обогащена минералами, встроенные системы генерируют 396 Hz.

## Студии балансировки

- **TerraPod** — студия Стабильности (красный, 396 Hz, надпочечники)
- **AquaFlow Chamber** — студия Потока (оранжевый, 417 Hz, крестец)
- **SolarCharge Pod** — студия Энергии (жёлтый, 528 Hz, солнечное сплетение)
- **HeartOpen Chamber** — студия Резонанса (зелёный, 639 Hz, тимус)
- **SoundBirth Chamber** — студия Вибрации (голубой, 741 Hz, горло)
- **SilencePod** — студия Ясности (индиго, 852 Hz, эпифиз)
- **UnityDome** — студия Целостности (фиолетовый, 963 Hz, темя)

## Экстренные устройства

- **GroundPulse** — портативный прибор размером с гальку для экстренного заземления (30 секунд к стопам)
- **FlowPulse** — точечное воздействие на крестец при эмоциональном ступоре
- **FirePulse** — точка солнечного сплетения, когда силы кончились
- **EmergencyHug Pod** — капсула, имитирующая объятие (давление, тепло, сердцебиение)
- **VoicePulse** — вибрация на горло, когда слова застряли
- **ClarityPulse** — стимуляция точки между бровями, когда в голове каша
- **GroundToSky** — быстрая интеграция всех семи центров сверху вниз

## Напитки (бар)

- **Амбра** — тёплый, янтарный, расслабляющий. Самый популярный, аналог пива.
- **Дымка** — прозрачный, сизоватый. Усиливает ощущение близости.
- **Корень** — тёмный, горький. Глубокое заземление. «Жидкий TerraPod».
- **Солар** — золотистый, пузырящийся. Энергетик, разгоняет движение.
- **Искра** — глоток ярко-оранжевого. Мгновенная эйфория на 30 секунд.
- **Бит** — мутновато-красный. Меняет восприятие ритма и музыки.
- **Линза** — прозрачный. Обостряет восприятие на 2 часа.
- **Тишина** — тёмно-фиолетовый. Приглушает внешний мир, расширяет внутреннее пространство.
- **Мост** — пьётся вдвоём из одного стакана. Даёт чувствовать состояние друг друга.
- **Ферма** — натуральный ферментированный напиток, аналог вина.
- **Чёрный** — горячий, тёмный. Аналог кофе, но не кофеин.

## Запрещённые вещества

- **Вспышка** — выброс по всем семи параметрам, затем обвал. Снижает базовый уровень.
- **Стена** — блокирует поле на 4-6 часов. Невидимость для браслетов.
- **Зеркало** — растворяет границу «я — не я». Чужие эмоции как свои.
- **Петля** — замыкает поле на себя. Абсолютная самодостаточность, затем пустота. Повреждает Резонанс.

## Семь параметров

- **Стабильность** — красный, 396 Hz, надпочечники, «фундамент»
- **Поток** — оранжевый, 417 Hz, крестец, движение эмоций
- **Энергия** — жёлтый, 528 Hz, солнечное сплетение, внутренний огонь
- **Резонанс** — зелёный, 639 Hz, тимус/сердце, связь с другими
- **Вибрация** — голубой, 741 Hz, горло, самовыражение
- **Ясность** — индиго, 852 Hz, эпифиз/лоб, восприятие
- **Целостность** — фиолетовый, 963 Hz, темя, единство с целым`,
    },
  });

  // ── STUBS ────────────────────────────────────────────────────────────────

  const stubs: Array<{ id: string; title: string; domain: string }> = [
    { id: "clothing", title: "Одежда", domain: "daily-life" },
    { id: "education", title: "Образование", domain: "society" },
    { id: "medicine", title: "Медицина", domain: "technology" },
    { id: "economy", title: "Экономика", domain: "society" },
    { id: "work-and-professions", title: "Работа и профессии", domain: "society" },
    { id: "family", title: "Семья", domain: "society" },
    { id: "children-and-growing-up", title: "Дети и взросление", domain: "society" },
    { id: "communication", title: "Средства связи", domain: "technology" },
    { id: "art", title: "Искусство", domain: "culture" },
    { id: "death-and-aging", title: "Старение и смерть", domain: "society" },
    { id: "governance", title: "Управление обществом", domain: "society" },
    { id: "history-how-we-got-here", title: "Как мы пришли к этому", domain: "society" },
  ];

  for (const s of stubs) {
    specs.push({
      path: `concepts/${s.id}.md`,
      id: s.id,
      title: s.title,
      type: "concept",
      domain: s.domain,
      status: "stub",
      tags: [s.title.toLowerCase()],
      related: [],
      extract: { kind: "stub" },
    });
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const sourceArg = process.argv[2];
  const sourcePath = sourceArg
    ? resolve(sourceArg)
    : resolve(ROOT, "..", "awaterra", "Мир 2225.md");

  console.log(`Reading source: ${sourcePath}`);
  if (!existsSync(sourcePath)) {
    console.error(`Source file not found: ${sourcePath}`);
    process.exit(1);
  }

  const raw = readFileSync(sourcePath, "utf-8");
  const lines = raw.split("\n");
  const sections = parseSections(lines);

  console.log(`Parsed ${lines.length} lines, ${sections.length} sections`);

  const specs = buildSpecs();
  let created = 0;

  for (const spec of specs) {
    const outPath = join(ROOT, spec.path);
    ensureDir(outPath);

    let body: string;
    const rule = spec.extract;

    switch (rule.kind) {
      case "lines":
        body = cleanBody(extractLines(lines, rule.from, rule.to));
        break;
      case "headers":
        body = cleanBody(extractByHeaders(sections, rule.patterns, rule.includeSubsections));
        break;
      case "custom":
        body = cleanBody(rule.fn(lines, sections));
        break;
      case "literal":
        body = rule.body;
        break;
      case "stub":
        body = `> Эта тема ещё не описана.`;
        break;
      default:
        body = "";
    }

    const frontmatter = buildFrontmatter(spec);
    const content = frontmatter + "\n\n" + body + "\n";

    writeFileSync(outPath, content, "utf-8");
    created++;
    const statusIcon = spec.status === "stub" ? "[stub]" : spec.status === "draft" ? "[draft]" : "[ok]";
    console.log(`  ${statusIcon} ${spec.path}`);
  }

  console.log(`\nDone! Created ${created} files.`);
}

main();
