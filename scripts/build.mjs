import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const project = new URL("../", import.meta.url),
  output = new URL("dist/", project);
const modules = (await readdir(new URL("src/", project))).sort();
const hash = createHash("sha256");
for (const file of modules) {
  hash.update(file);
  hash.update(await readFile(new URL("src/" + file, project)));
}
const sourceHash = hash.digest("hex");
const folder = `src-${sourceHash.slice(0, 12)}`;
const staticFiles = [
  "favicon.svg",
  "manifest.webmanifest",
  ...(await readdir(new URL("icons/", project)))
    .sort()
    .map((file) => "icons/" + file),
];
const shell = await readFile(new URL("index.html", project), "utf8");
const worker = await readFile(new URL("sw.js", project), "utf8");
const release = createHash("sha256")
  .update(sourceHash)
  .update(shell)
  .update(worker);
for (const file of staticFiles) {
  release.update(file);
  release.update(await readFile(new URL(file, project)));
}
const version = release.digest("hex").slice(0, 16);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(
  new URL("index.html", output),
  shell
    .replaceAll("./src/", `./${folder}/`)
    .replace(
      'name="app-version" content="development"',
      `name="app-version" content="${version}"`,
    ),
);
await cp(new URL("src/", project), new URL(folder + "/", output), {
  recursive: true,
});
for (const file of staticFiles) {
  await mkdir(new URL(file.slice(0, file.lastIndexOf("/") + 1), output), {
    recursive: true,
  });
  await cp(new URL(file, project), new URL(file, output));
}
const assets = [
  "./",
  "./index.html",
  ...staticFiles.map((file) => "./" + file),
  ...modules.map((file) => `./${folder}/${file}`),
];
const precache = /const ASSETS\s*=\s*\/\*PRECACHE\*\/\s*\[[\s\S]*?\];/;
if (!precache.test(worker)) throw new Error("Missing worker precache template");
await writeFile(
  new URL("sw.js", output),
  worker
    .replace('const VERSION = "development";', `const VERSION = "${version}";`)
    .replace(precache, `const ASSETS = ${JSON.stringify(assets)};`),
);
await writeFile(
  new URL("version.json", output),
  JSON.stringify({ version }) + "\n",
);
await writeFile(new URL(".nojekyll", output), "");
console.log(`Built dist/ release ${version} with versioned modules: ${folder}`);
