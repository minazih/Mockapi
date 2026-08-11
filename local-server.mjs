// Local dev server — runs the exact same function Netlify will run.
//
//   node local-server.mjs        →  http://localhost:8888
//
// Netlify is not involved: this maps /api/v1/* onto the handler the same way
// netlify.toml does, and serves index.html for everything else. If it works
// here it works deployed.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import handler from "./netlify/functions/api.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8888;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/v1") || url.pathname.startsWith("/.netlify/functions/api")) {
    try {
      const out = await handler(new Request(`http://localhost:${PORT}${req.url}`, { method: req.method }));
      res.writeHead(out.status, Object.fromEntries(out.headers));
      res.end(await out.text());
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: true, message: String(e && e.stack || e) }, null, 2));
    }
    console.log(`${req.method} ${req.url}`);
    return;
  }

  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  try {
    const body = await readFile(join(ROOT, file));
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
}).listen(PORT, () => console.log(`Mock CRM API  →  http://localhost:${PORT}`));
