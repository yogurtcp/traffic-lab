import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
const root = fileURLToPath(new URL("./", import.meta.url));
const port = Number(process.env.PORT || 4180);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const path = resolve(root, "." + pathname);
    if (
      (path !== resolve(root) &&
        !path.startsWith(root.endsWith(sep) ? root : root + sep)) ||
      pathname.split("/").some((p) => p.startsWith("."))
    ) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const info = await stat(path);
    const file = info.isDirectory() ? resolve(path, "index.html") : path;
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`Loop Lab: http://localhost:${port}`),
);
