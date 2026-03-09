import { Router, Request, Response } from "express";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function findFile(id: string): string | null {
  const dirs = ["concepts", "scenes", "meta"];
  for (const dir of dirs) {
    const filePath = path.join(ROOT, dir, `${id}.md`);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

function rebuildIndex(): void {
  execSync("npx tsx scripts/build-index.ts", {
    cwd: ROOT,
    stdio: "pipe",
  });
}

function readIndex(): unknown {
  const raw = readFileSync(path.join(ROOT, "index.json"), "utf-8");
  return JSON.parse(raw);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const apiRouter = Router();

// GET /api/index
apiRouter.get("/index", (_req: Request, res: Response) => {
  try {
    const index = readIndex();
    res.json(index);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tags
apiRouter.get("/tags", (_req: Request, res: Response) => {
  try {
    const index = readIndex() as any;
    res.json(index.tags ?? {});
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/:id
apiRouter.get("/files/:id", (req: Request, res: Response) => {
  try {
    const filePath = findFile(req.params.id);
    if (!filePath) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const raw = readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    res.json({ frontmatter: data, body: content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/files/:id
apiRouter.put("/files/:id", (req: Request, res: Response) => {
  try {
    const filePath = findFile(req.params.id);
    if (!filePath) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const { frontmatter, body } = req.body;
    frontmatter.updated = today();
    const content = matter.stringify(body, frontmatter);
    writeFileSync(filePath, content, "utf-8");
    rebuildIndex();
    const index = readIndex();
    res.json(index);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files
apiRouter.post("/files", (req: Request, res: Response) => {
  try {
    const { id, title, type, domain, status, tags, body } = req.body;
    const dirMap: Record<string, string> = {
      concept: "concepts",
      scene: "scenes",
      meta: "meta",
    };
    const dir = dirMap[type];
    if (!dir) {
      res.status(400).json({ error: `Unknown type: ${type}` });
      return;
    }
    const filePath = path.join(ROOT, dir, `${id}.md`);
    if (existsSync(filePath)) {
      res.status(409).json({ error: "File already exists" });
      return;
    }
    const frontmatter = { id, title, type, domain, status, tags, updated: today() };
    const content = matter.stringify(body, frontmatter);
    writeFileSync(filePath, content, "utf-8");
    rebuildIndex();
    const index = readIndex();
    res.status(201).json(index);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/files/:id
apiRouter.delete("/files/:id", (req: Request, res: Response) => {
  try {
    const filePath = findFile(req.params.id);
    if (!filePath) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    unlinkSync(filePath);
    rebuildIndex();
    const index = readIndex();
    res.json(index);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
