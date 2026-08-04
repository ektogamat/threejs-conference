import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const devThreeDir = resolve(rootDir, "../three.js");
const threeBuildDir = resolve(devThreeDir, "build");
const threeExamplesDir = resolve(devThreeDir, "examples");
const threeFilesDir = resolve(devThreeDir, "files");

const MIME_TYPES = {
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const externalizePlugin = {
  name: "externalize-three-assets",
  resolveId(id) {
    if (
      id.startsWith("/build/") ||
      id.startsWith("/examples/") ||
      id.startsWith("/files/") ||
      id.startsWith("https://") ||
      id.startsWith("http://")
    ) {
      return { id, external: true };
    }
  },
};

function serveTourDependencies() {
  return (req, res, next) => {
    const url = req.url.split("?")[0];

    // 1. Map /build/ requests to ../three.js/build/
    if (url.startsWith("/build/")) {
      const fileName = url.slice("/build/".length);
      const filePath = resolve(threeBuildDir, fileName);
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
        res.end(readFileSync(filePath));
        return;
      }
    }

    // 2. Map /examples/ requests (jsm, textures, models, etc.) to ../three.js/examples/
    if (url.startsWith("/examples/")) {
      const relativePath = url.slice("/examples/".length);
      const filePath = resolve(threeExamplesDir, relativePath);
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
        res.end(readFileSync(filePath));
        return;
      }
    }

    // 3. Map /files/ requests (favicon, etc.) to ../three.js/files/
    if (url.startsWith("/files/")) {
      const relativePath = url.slice("/files/".length);
      const filePath = resolve(threeFilesDir, relativePath);
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
        res.end(readFileSync(filePath));
        return;
      }
    }

    // 4. Intercept /js/imports/scripts/ to serve raw files (bypassing Vite compilation)
    if (url.startsWith("/js/imports/scripts/")) {
      const relativePath = url.slice("/js/imports/scripts/".length);
      const filePath = resolve(rootDir, "tour/js/imports/scripts", relativePath);
      if (existsSync(filePath)) {
        const ext = extname(filePath);
        res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
        res.end(readFileSync(filePath));
        return;
      }
    }

    next();
  };
}

export default defineConfig({
  root: "tour",
  server: {
    host: true,
    open: true,
  },
  resolve: {
    alias: {
      "three/webgpu": "/build/three.webgpu.js",
      "three/tsl": "/build/three.tsl.js",
      "three/addons/": "/examples/jsm/",
      "three": "/build/three.webgpu.js",
      "tsl-textures": "https://cdn.jsdelivr.net/gh/boytchev/tsl-textures/dist/tsl-textures.js",
      "marked": "https://cdn.jsdelivr.net/npm/marked@12.0.1/lib/marked.esm.js",
      "acorn": "https://cdn.jsdelivr.net/npm/acorn@8.11.3/dist/acorn.mjs",
      "eslint-linter-browserify": "https://cdn.jsdelivr.net/npm/eslint-linter-browserify@8.57.0/linter.mjs",
      "mermaid": "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs",
    },
  },
  optimizeDeps: {
    exclude: [
      "three",
      "three/webgpu",
      "three/tsl",
      "three/addons/",
      "tsl-textures",
      "marked",
      "acorn",
      "eslint-linter-browserify",
      "mermaid",
    ],
    esbuildOptions: {
      plugins: [
        {
          name: "esbuild-externalize-three-assets",
          setup(build) {
            build.onResolve({ filter: /^\/(build|examples|files)\// }, (args) => {
              return { path: args.path, external: true };
            });
            build.onResolve({ filter: /^https?:\/\// }, (args) => {
              return { path: args.path, external: true };
            });
          },
        },
      ],
    },
  },
  plugins: [
    basicSsl(),
    externalizePlugin,
    {
      name: "serve-tour-dependencies",
      configureServer(server) {
        server.middlewares.use(serveTourDependencies());
      },
      configurePreviewServer(server) {
        server.middlewares.use(serveTourDependencies());
      },
    },
  ],
});
