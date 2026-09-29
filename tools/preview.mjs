// Local preview of the phone app with example data, no Cloudflare needed (Node 18+, no dependencies).
//   node tools/preview.mjs [path/to/budget.json]      then open http://localhost:8787
// Serves app/public and answers /api/budget with the JSON file (examples/demo-budget.json by default).
// Push sign-up is stubbed out. This skips the Cloudflare Access check, so only use it locally.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = join(root, "app", "public");
const data = process.argv[2] || join(root, "examples", "demo-budget.json");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml" };

createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try {
    if (path === "/api/budget") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(await readFile(data));
    }
    if (path.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
    const file = normalize(join(pub, path === "/" ? "index.html" : path));
    if (!file.startsWith(pub)) { res.writeHead(403); return res.end(); }
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404); res.end("Not found");
  }
}).listen(8787, "127.0.0.1", () => console.log("Budget Panel preview on http://localhost:8787 using " + data));
