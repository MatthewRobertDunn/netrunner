/** Tiny static file server for the web UI: deno run -A public/serve.ts */

// Binds on all interfaces (0.0.0.0) by default; set PORT to change the port.
// PORT=0 (or an occupied port with AUTO_PORT=1) lets the OS pick a free one —
// the first log line is always SERVING_PORT=<n>, which is what parallel
// agents parse to find their own server.
const requestedPort = Number(Deno.env.get("PORT") ?? "8000");
const autoPort = Deno.env.get("AUTO_PORT") === "1";

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

async function listen(port: number): Promise<void> {
  const server = Deno.serve(
    {
      port,
      onListen: ({ port: actual }) => {
        // First line, machine-readable: agents find their server by grepping this.
        console.log(`SERVING_PORT=${actual}`);
        console.log(`serving public/ on http://0.0.0.0:${actual}`);
      },
    },
    async (req) => {
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
    },
  );
  await server.finished;
}

if (requestedPort === 0) {
  await listen(0);
} else {
  try {
    await listen(requestedPort);
  } catch (e) {
    if (autoPort && e instanceof Deno.errors.AddrInUse) {
      await listen(0);
    } else {
      throw e;
    }
  }
}
