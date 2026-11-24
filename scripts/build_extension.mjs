import { copyFile, mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const source = new URL("../extension/", import.meta.url);
const output = new URL("../dist/extension/", import.meta.url);
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile(new URL("manifest.json", source), "utf8"));
for (const path of ["manifest.json", "index.html", "background.js", "content.js", ...Object.values(manifest.icons)]) {
  await copyFile(new URL(path, source), new URL(path, output));
}
await build({ entryPoints: ["extension/composer.js"], outfile: "dist/extension/composer.js",
  bundle: true, format: "esm", target: "chrome116", minify: true });
execFileSync("tailwindcss", ["-i", "extension/style.css", "-o", "dist/extension/style.css", "--minify"], { stdio: "inherit" });
