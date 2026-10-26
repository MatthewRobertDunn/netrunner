/** Tiny static file server for the web UI: deno run -A public/serve.ts */
const port = 8000;

const BASE = new URL("../", import.meta.url).pathname;
const PUBLIC = BASE + "public/";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};

function resolve(path: string): string | null {
  const clean = decodeURIComponent(path.replace(/^\/+/, ""));
  const file = clean === "" ? "index.html" : clean;
  // Reject traversal.
  if (file.includes("..") || file.startsWith("/")) return null;
  return PUBLIC + file;
}

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);
  const fsPath = resolve(url.pathname);
  if (!fsPath) return new Response("Forbidden", { status: 403 });
  try {
    const body = await Deno.readFile(fsPath);
    const ext = fsPath.slice(fsPath.lastIndexOf("."));
    const headers = new Headers();
    if (TYPES[ext]) headers.set("content-type", TYPES[ext]);
    return new Response(body, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
});

console.log(`serving public/ on http://localhost:${port}`);
