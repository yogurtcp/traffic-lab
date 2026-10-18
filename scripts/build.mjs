import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const project = new URL("../", import.meta.url),
  output = new URL("dist/", project);
const hash = createHash("sha256");
for (const file of (await readdir(new URL("src/", project))).sort()) {
  hash.update(file);
  hash.update(await readFile(new URL("src/" + file, project)));
}
const folder = `src-${hash.digest("hex").slice(0, 12)}`;
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(
  new URL("index.html", output),
  (await readFile(new URL("index.html", project), "utf8")).replaceAll(
    "./src/",
    `./${folder}/`,
  ),
);
await cp(new URL("src/", project), new URL(folder + "/", output), {
  recursive: true,
});
await cp(new URL("favicon.svg", project), new URL("favicon.svg", output));
await writeFile(new URL(".nojekyll", output), "");
console.log(`Built dist/ with versioned modules: ${folder}`);
