import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../", import.meta.url));
const site = join(project, "dist");
const run = (cmd, args, options = {}) =>
  execFileSync(cmd, args, { cwd: project, encoding: "utf8", ...options });
run("npm", ["test"], { stdio: "inherit" });
run("npm", ["run", "build"], { stdio: "inherit" });
const repository = JSON.parse(
  run("gh", ["repo", "view", "--json", "nameWithOwner"]),
).nameWithOwner;
const work = mkdtempSync(join(tmpdir(), "loop-pages-"));
try {
  const env = {
    ...process.env,
    GIT_DIR: join(project, ".git"),
    GIT_WORK_TREE: site,
    GIT_INDEX_FILE: join(work, "index"),
  };
  const git = (args) => run("git", args, { cwd: site, env });
  const parents = [];
  if (run("git", ["ls-remote", "--heads", "origin", "gh-pages"]).trim()) {
    run("git", ["fetch", "origin", "gh-pages"], { stdio: "inherit" });
    parents.push("-p", run("git", ["rev-parse", "FETCH_HEAD"]).trim());
  }
  git(["read-tree", "--empty"]);
  git(["add", "--all", "--force"]);
  const tree = git(["write-tree"]).trim();
  const revision = run("git", ["rev-parse", "--short", "HEAD"]).trim();
  const commit = git([
    "commit-tree",
    tree,
    ...parents,
    "-m",
    `Deploy Loop Lab ${revision}`,
  ]).trim();
  run("git", ["push", "origin", `${commit}:refs/heads/gh-pages`], {
    stdio: "inherit",
  });
  let exists = true;
  try {
    run("gh", ["api", `repos/${repository}/pages`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    if (e.stderr?.includes("404")) exists = false;
    else throw e;
  }
  run(
    "gh",
    [
      "api",
      "--method",
      exists ? "PUT" : "POST",
      `repos/${repository}/pages`,
      "--input",
      "-",
    ],
    {
      input: JSON.stringify({
        build_type: "legacy",
        source: { branch: "gh-pages", path: "/" },
      }),
    },
  );
  run("gh", ["api", "--method", "POST", `repos/${repository}/pages/builds`]);
  console.log(
    `Deployment submitted: https://${repository.split("/")[0]}.github.io/${repository.split("/")[1]}/`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
