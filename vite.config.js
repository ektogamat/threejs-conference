import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const inspectorExtensionsDir = resolve(
  rootDir,
  "node_modules/three/examples/jsm/inspector/extensions",
);

const MIME_TYPES = {
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
};

function serveInspectorExtensions() {
  const urlPrefix = "/node_modules/.vite/extensions/";

  return (req, res, next) => {
    if (!req.url?.startsWith(urlPrefix)) {
      next();
      return;
    }

    const relativePath = req.url.slice(urlPrefix.length).split("?")[0];
    const filePath = resolve(inspectorExtensionsDir, relativePath);

    if (
      !filePath.startsWith(inspectorExtensionsDir) ||
      !existsSync(filePath)
    ) {
      next();
      return;
    }

    const ext = extname(filePath);
    res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
    res.end(readFileSync(filePath));
  };
}

export default defineConfig({
  server: {
    host: true,
    open: true,
  },
  plugins: [
    basicSsl(),
    {
      name: "three-inspector-extensions",
      configureServer(server) {
        server.middlewares.use(serveInspectorExtensions());
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveInspectorExtensions());
      },
    },
  ],
});
