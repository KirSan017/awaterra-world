import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Types ---

interface IndexNode {
  id: string;
  title: string;
  type: "concept" | "scene" | "meta";
  domain: string;
  status: "complete" | "draft" | "stub";
  tags: string[];
  wordCount: number;
}

interface IndexEdge {
  from: string;
  to: string;
  type: "related" | "illustratedBy" | "illustrates";
}

interface WorldIndex {
  nodes: IndexNode[];
  edges: IndexEdge[];
  tags: Record<string, string[]>;
  domains: Record<string, {
    total: number;
    complete: number;
    draft: number;
    stub: number;
  }>;
  stats: {
    totalFiles: number;
    totalWords: number;
    complete: number;
    draft: number;
    stub: number;
  };
  generatedAt: string;
}

// --- Config ---

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["concepts", "scenes", "meta"];
const OUTPUT = path.join(ROOT, "index.json");

// --- Helpers ---

function collectMdFiles(): string[] {
  const files: string[] = [];
  for (const dir of DIRS) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath)) {
      if (file.endsWith(".md")) {
        files.push(path.join(dirPath, file));
      }
    }
  }
  return files;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// --- Main ---

function buildIndex(): WorldIndex {
  const files = collectMdFiles();
  const nodes: IndexNode[] = [];
  const edges: IndexEdge[] = [];
  const tagsMap: Record<string, string[]> = {};
  const domainsMap: Record<string, { total: number; complete: number; draft: number; stub: number }> = {};

  // Parse all files into nodes
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);

    const node: IndexNode = {
      id: data.id,
      title: data.title,
      type: data.type,
      domain: data.domain ?? "unknown",
      status: data.status ?? "stub",
      tags: data.tags ?? [],
      wordCount: countWords(content),
    };

    nodes.push(node);
  }

  // Set of known IDs for edge validation
  const knownIds = new Set(nodes.map((n) => n.id));

  // Build edges
  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data } = matter(raw);
    const id: string = data.id;

    // related — bidirectional, but we add both directions
    const related: string[] = data.related ?? [];
    for (const targetId of related) {
      if (knownIds.has(targetId)) {
        edges.push({ from: id, to: targetId, type: "related" });
      } else {
        console.warn(`Warning: ${id} references unknown related "${targetId}"`);
      }
    }

    // illustratedBy — concept → scene
    const illustratedBy: string[] = data.illustratedBy ?? [];
    for (const targetId of illustratedBy) {
      if (knownIds.has(targetId)) {
        edges.push({ from: id, to: targetId, type: "illustratedBy" });
      } else {
        console.warn(`Warning: ${id} references unknown illustratedBy "${targetId}"`);
      }
    }

    // illustrates — scene → concept
    const illustrates: string[] = data.illustrates ?? [];
    for (const targetId of illustrates) {
      if (knownIds.has(targetId)) {
        edges.push({ from: id, to: targetId, type: "illustrates" });
      } else {
        console.warn(`Warning: ${id} references unknown illustrates "${targetId}"`);
      }
    }
  }

  // Build tags map
  for (const node of nodes) {
    for (const tag of node.tags) {
      if (!tagsMap[tag]) tagsMap[tag] = [];
      tagsMap[tag].push(node.id);
    }
  }

  // Build domains summary
  for (const node of nodes) {
    if (!domainsMap[node.domain]) {
      domainsMap[node.domain] = { total: 0, complete: 0, draft: 0, stub: 0 };
    }
    domainsMap[node.domain].total++;
    domainsMap[node.domain][node.status]++;
  }

  // Build stats
  const totalWords = nodes.reduce((sum, n) => sum + n.wordCount, 0);
  const stats = {
    totalFiles: nodes.length,
    totalWords,
    complete: nodes.filter((n) => n.status === "complete").length,
    draft: nodes.filter((n) => n.status === "draft").length,
    stub: nodes.filter((n) => n.status === "stub").length,
  };

  return {
    nodes,
    edges,
    tags: tagsMap,
    domains: domainsMap,
    stats,
    generatedAt: new Date().toISOString(),
  };
}

// --- Run ---

const index = buildIndex();

fs.writeFileSync(OUTPUT, JSON.stringify(index, null, 2), "utf-8");

// Log summary
const domainsList = Object.entries(index.domains)
  .map(([name, d]) => `${name} (${d.total})`)
  .join(", ");

console.log(`Built index: ${index.stats.totalFiles} files, ${index.stats.totalWords} words`);
console.log(`Domains: ${domainsList}`);
console.log(`Tags: ${Object.keys(index.tags).length} unique tags`);
console.log(`Edges: ${index.edges.length} connections`);
console.log(`Written to index.json`);
