/**
 * export-docker-images.ts — build the production images for both architectures
 * into ./release/.
 *
 * The image is a single layer on top of `denoland/deno:distroless-2.9.8`
 * containing the pre-built static site (public/) — equivalent to what
 * `docker build` of Dockerfile would produce. `crane` (go-containerregistry)
 * is used instead of a Docker daemon so the images can be produced on hosts
 * where dockerd cannot mount(2)/unshare(2) (e.g. unprivileged containers).
 *
 * Deno (not sh) so the script is portable to any host that runs `deno`;
 * `crane` and GNU `tar` are still required. Safe to run from any directory.
 *
 *   deno run --allow-read --allow-write --allow-run --allow-env scripts/export-docker-images.ts
 */

const ROOT = new URL("../", import.meta.url).pathname;
const BASE_IMAGE = "denoland/deno:distroless-2.9.8";
const IMAGE_NAME = "netrunner";
const RELEASE_DIR = `${ROOT}release`;
const WORK_DIR = `${Deno.env.get("TMPDIR") ?? "/tmp"}/netrunner-image-build`;

function run(name: string, args: string[], opts: { cwd?: string } = {}): void {
  const r = new Deno.Command(name, {
    args,
    cwd: opts.cwd ?? ROOT,
    stdout: "inherit",
    stderr: "inherit",
  }).outputSync();
  if (!r.success) {
    console.error(`\nerror: ${name} ${args[0] ?? ""} failed (exit ${r.code})`);
    Deno.exit(1);
  }
}

function warnRun(name: string, args: string[]): void {
  const r = new Deno.Command(name, { args, cwd: ROOT }).outputSync();
  if (!r.success) {
    console.error(`  (warning: ${name} ${args[0] ?? ""} failed — continuing)`);
  }
}

function capture(name: string, args: string[]): string {
  const r = new Deno.Command(name, { args, cwd: ROOT }).outputSync();
  if (!r.success) {
    console.error(`\nerror: ${name} ${args[0] ?? ""} failed (exit ${r.code})`);
    Deno.exit(1);
  }
  return new TextDecoder().decode(r.stdout).trim();
}

// Requires: crane, GNU tar.
try {
  capture("crane", ["version"]);
} catch {
  console.error("error: crane is required (https://github.com/google/go-containerregistry)");
  Deno.exit(1);
}

await Deno.remove(WORK_DIR, { recursive: true }).catch(() => {});
await Deno.mkdir(`${WORK_DIR}/layerroot/app`, { recursive: true });
await Deno.mkdir(RELEASE_DIR, { recursive: true });

// The layer is owned by the nonroot uid the image runs as (65532), matching
// `COPY --chown=65532:65532 public/ /app/public/` in the Dockerfile.
run("cp", ["-a", "public", `${WORK_DIR}/layerroot/app/public`]);
// Best-effort: the layer tar below forces 65532:65532 anyway, so a failed
// chown (e.g. unprivileged sandbox) changes nothing about the artifact.
warnRun("chown", ["-R", "65532:65532", `${WORK_DIR}/layerroot/app/public`]);

// Deterministic, sorted layer tar.
run("tar", [
  "--sort=name",
  "--owner=65532",
  "--group=65532",
  "--numeric-owner",
  "--mtime=@0",
  "--format=ustar",
  "-C",
  `${WORK_DIR}/layerroot`,
  "-cf",
  `${WORK_DIR}/layer.tar`,
  "app",
]);

for (const arch of ["arm64", "amd64"]) {
  console.log(`==> building linux/${arch}`);

  run("crane", [
    "mutate",
    "--platform",
    `linux/${arch}`,
    "--append",
    `${WORK_DIR}/layer.tar`,
    "--workdir",
    "/app/public",
    "--user",
    "65532:65532",
    "--env",
    "PORT=8000",
    "--exposed-ports",
    "8000/tcp",
    "--cmd",
    "run",
    "--cmd",
    "--allow-read=/app/public",
    "--cmd",
    "--allow-env=PORT,AUTO_PORT",
    "--cmd",
    "--allow-net",
    "--cmd",
    "serve.ts",
    "-o",
    `${WORK_DIR}/${arch}.tar`,
    BASE_IMAGE,
  ]);

  // Retag as netrunner:<arch> so `docker load -i release/netrunner-<arch>.tar`
  // yields a usable tag: unpack, set RepoTags in manifest.json, re-tar cleanly.
  await Deno.remove(`${WORK_DIR}/unpack`, { recursive: true }).catch(() => {});
  await Deno.mkdir(`${WORK_DIR}/unpack`, { recursive: true });
  run("tar", ["-xf", `${WORK_DIR}/${arch}.tar`, "-C", `${WORK_DIR}/unpack`]);

  const manifestPath = `${WORK_DIR}/unpack/manifest.json`;
  const manifest = JSON.parse(await Deno.readTextFile(manifestPath));
  manifest[0].RepoTags = [`${IMAGE_NAME}:${arch}`];
  await Deno.writeTextFile(manifestPath, JSON.stringify(manifest));

  run("tar", [
    "--sort=name",
    "--mtime=@0",
    "--format=ustar",
    "-C",
    `${WORK_DIR}/unpack`,
    "-cf",
    `${RELEASE_DIR}/${IMAGE_NAME}-${arch}.tar`,
    ".",
  ]);

  // Report what was built.
  const cfg = (manifest[0].Config as string).replace(/^sha256:/, "");
  const config = JSON.parse(
    await Deno.readTextFile(`${WORK_DIR}/unpack/sha256:${cfg}`),
  );
  const stat = await Deno.stat(`${RELEASE_DIR}/${IMAGE_NAME}-${arch}.tar`);
  console.log(`    tag:      ${IMAGE_NAME}:${arch}`);
  console.log(`    config:   ${cfg.slice(0, 12)}…`);
  console.log(`    size:     ${(stat.size / 1024 / 1024).toFixed(1)}M`);
  console.log(`    user:     ${config.config.User}`);
  console.log(`    workdir:  ${config.config.WorkingDir}`);
  console.log(`    ports:    ${JSON.stringify(config.config.ExposedPorts)}`);
}

console.log("\n==> done");
for await (const entry of Deno.readDir(RELEASE_DIR)) {
  const stat = await Deno.stat(`${RELEASE_DIR}/${entry.name}`);
  console.log(`    ${(stat.size / 1024 / 1024).toFixed(1)}M  ${entry.name}`);
}
