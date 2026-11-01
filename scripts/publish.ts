/**
 * publish.ts — build, ship, and deploy the latest release to the server.
 *
 * Runs from any working directory: the repo root is derived from this file's
 * own location (import.meta.url), the same contract as
 * scripts/export-docker-images.ts. It does the whole thing:
 *   1. (re)build the web bundle
 *   2. export the docker image tarball for the target arch
 *   3. docker load it there (tags netrunner:<arch>) — on the publish host the
 *      checkout (/home/matty/code/denorunner) is the same directory as this
 *      repo's release/, so the tarball is already in place and needs no scp
 *      (publish-host topology; see HOST/REMOTE_DIR below)
 *   4. restart the systemd unit that runs the container
 *   5. remove the superseded image so disk usage stays flat
 *   6. poll the health endpoint until it returns 200
 *
 * The deployed arch is whatever the systemd unit loads (`netrunner-<arch>.tar`
 * in systemd/netrunner.service) — publish defaults to it and refuses an
 * explicit `--arch` that disagrees, since the unit would keep running the old
 * image. Before overwriting the tarball, the previous one is kept as
 * `netrunner-<arch>.tar.prev` for rollback (see README "Rollback").
 *
 * The SSH key lives in `secrets/orange` (gitignored via `secrets/`) — it
 * stays on disk, is never installed, and is only referenced here.
 *
 *   deno run --allow-read --allow-write --allow-run --allow-net scripts/publish.ts [--dry-run]
 */

const args = Deno.args;
let ARCH: string | null = null; // null → fall back to the arch the unit loads
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--arch" && args[i + 1]) ARCH = args[++i] as string;
  else if (args[i] === "--dry-run") dryRun = true;
  else if (args[i] === "--help" || args[i] === "-h") {
    console.log(
      "usage: deno task publish [--dry-run]\n" +
        "  deploys the arch the systemd unit loads; --arch <other> is refused.",
    );
    Deno.exit(0);
  }
}

// Repo root, derived from this file's own URL so publish works from any
// working directory (the same contract as scripts/export-docker-images.ts).
const ROOT = new URL("../", import.meta.url).pathname;

// Publish-host topology — specific to this repo's publish setup, not general.
// HOST is the SSH target; REMOTE_DIR is the host-side directory that mirrors
// this repo's release/ (the host mounts the checkout at
// /home/matty/code/denorunner), which is why the tarball needs no scp.
const HOST = "matty@192.168.0.2";
const SSH_KEY = `${ROOT}secrets/orange`; // gitignored; passed via -i, never installed
const REMOTE_DIR = "/home/matty/code/denorunner/release";

/**
 * Step 1/6 argv (spawned via Deno.execPath()). Declared once so the real step
 * and the dry-run plan cannot drift apart.
 */
const BUILD_WEB_ARGS = [
  "run",
  "--allow-read",
  "--allow-write",
  "--allow-net",
  "--allow-run",
  `${ROOT}scripts/build-web.ts`,
];

/**
 * Step 2/6 argv (spawned via Deno.execPath()). Declared once so the real step
 * and the dry-run plan cannot drift apart.
 */
const EXPORT_IMAGES_ARGS = [
  "run",
  "--allow-read",
  "--allow-write",
  "--allow-run",
  "--allow-env",
  `${ROOT}scripts/export-docker-images.ts`,
];

/**
 * The arch the systemd unit actually deploys: read it out of ExecStartPre's
 * `docker load -i .../netrunner-<arch>.tar` so publish cannot drift from the
 * unit (the unit hardcodes one arch; publishing the other deploys nothing).
 */
function unitArch(): string {
  let unit: string;
  try {
    unit = Deno.readTextFileSync(`${ROOT}systemd/netrunner.service`);
  } catch {
    console.error(
      `error: cannot read ${ROOT}systemd/netrunner.service — publish must run from a checkout of this repo`,
    );
    Deno.exit(1);
  }
  const m = unit.match(/netrunner-([a-z0-9]+)\.tar/);
  if (!m) {
    console.error(
      "error: no netrunner-<arch>.tar reference found in systemd/netrunner.service",
    );
    Deno.exit(1);
  }
  return m[1]!;
}

const DEPLOY_ARCH = unitArch();
if (ARCH === null) ARCH = DEPLOY_ARCH;
if (ARCH !== DEPLOY_ARCH) {
  console.error(
    `\nerror: --arch ${ARCH} would deploy nothing. systemd/netrunner.service loads ` +
      `netrunner-${DEPLOY_ARCH}.tar, so a netrunner:${ARCH} image is loaded but the ` +
      `unit keeps restarting the old netrunner:${DEPLOY_ARCH} container.\n` +
      `  Update the unit to netrunner-${ARCH}.tar first, or drop the flag — publish ` +
      `defaults to the unit's arch (${DEPLOY_ARCH}).`,
  );
  Deno.exit(1);
}
const REMOTE_TARBALL = `${REMOTE_DIR}/netrunner-${ARCH}.tar`;
const LOCAL_TARBALL = `${ROOT}release/netrunner-${ARCH}.tar`;

function cmd(name: string, args: string[]): Deno.Command {
  return new Deno.Command(name, {
    args,
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
}

/** Render an argv the way the dry-run plan prints it (quote only args with whitespace). */
function argvLine(argv: string[]): string {
  return argv.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ");
}

function sshCmd(remoteArgs: string[]): Deno.Command {
  return cmd("ssh", [
    "-i",
    SSH_KEY,
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "BatchMode=yes",
    HOST,
    ...remoteArgs,
  ]);
}

function run(c: Deno.Command, label: string): void {
  const r = c.outputSync();
  if (!r.success) {
    console.error(`\nerror: ${label} failed (exit ${r.code})`);
    Deno.exit(1);
  }
  console.log(`  ok: ${label}`);
}

/** Run an ssh command and return its stdout (trimmed). */
function sshCapture(remoteArgs: string[]): string {
  const r = new Deno.Command("ssh", {
    args: [
      "-i",
      SSH_KEY,
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "BatchMode=yes",
      HOST,
      ...remoteArgs,
    ],
  }).outputSync();
  if (!r.success) {
    console.error(`\nerror: ssh ${remoteArgs[0]} failed (exit ${r.code})`);
    Deno.exit(1);
  }
  return new TextDecoder().decode(r.stdout).trim();
}

if (dryRun) {
  console.log("==> dry run — no step below is executed. Resolved plan:");
  console.log(`  arch:          ${ARCH} (deployed arch, from systemd/netrunner.service)`);
  console.log(`  host:          ${HOST} (ssh -i ${SSH_KEY})`);
  console.log(`  tarball:       ${REMOTE_TARBALL}`);
  console.log(
    `                 (on the host this is the same file as local ${LOCAL_TARBALL})`,
  );
  console.log(`  rollback copy: ${REMOTE_TARBALL}.prev (kept before overwrite)`);
  console.log(`  1/6 rebuild web bundle (${argvLine([Deno.execPath(), ...BUILD_WEB_ARGS])})`);
  console.log(
    `  2/6 export docker images (${
      argvLine([Deno.execPath(), ...EXPORT_IMAGES_ARGS])
    } → ${LOCAL_TARBALL})`,
  );
  console.log(`  3/6 docker load -i ${REMOTE_TARBALL} on ${HOST}`);
  console.log(`  4/6 systemctl --user restart netrunner.service on ${HOST}`);
  console.log(`  5/6 docker rmi <superseded image id> on ${HOST} (only if the id changed)`);
  console.log(`  6/6 health check http://127.0.0.1:8000/ on ${HOST}, poll ~15s for HTTP 200`);
  Deno.exit(0);
}

console.log(`==> publishing netrunner:${ARCH} to ${HOST}`);

// Keep the previous tarball for rollback before any step overwrites it.
// release/ is the same directory on disk as the host's release dir, so the
// .prev copy is loadable there too (see README "Rollback").
try {
  await Deno.rename(LOCAL_TARBALL, `${LOCAL_TARBALL}.prev`);
  console.log(`  ok: previous tarball kept as ${LOCAL_TARBALL}.prev`);
} catch {
  // No previous tarball (first publish) — nothing to keep.
}

// 1. Rebuild the web bundle so the shipped assets are current.
console.log("==> 1/6 rebuild web bundle");
run(cmd(Deno.execPath(), BUILD_WEB_ARGS), "build-web");

// 2. Export the docker image tarballs.
console.log("==> 2/6 export docker images");
run(cmd(Deno.execPath(), EXPORT_IMAGES_ARGS), "export-docker-images");

// 3. Load the image into the server's Docker. On the publish host the
//    checkout (/home/matty/code/denorunner, see REMOTE_DIR) mirrors this
//    repo's release/, so the tarball is already in place — no scp needed.
//    Remember the old image id first so the now-untagged (dangling) previous
//    version can be deleted after the restart instead of accumulating on the
//    host.
console.log("==> 3/6 docker load on server");
const oldImageId = sshCapture(["docker", "images", "-q", `netrunner:${ARCH}`]).split("\n")[0] ?? "";
run(sshCmd(["docker", "load", "-i", REMOTE_TARBALL]), "docker load");

// 4. Restart the systemd unit.
console.log("==> 4/6 restart systemd unit");
run(sshCmd(["systemctl", "--user", "restart", "netrunner.service"]), "systemctl restart");

// 5. Remove the superseded image so disk usage stays flat across publishes.
//    The unit uses --rm containers, so after the restart nothing references it.
console.log("==> 5/6 remove superseded image");
const newImageId = sshCapture(["docker", "images", "-q", `netrunner:${ARCH}`]).split("\n")[0] ?? "";
if (oldImageId && newImageId && oldImageId !== newImageId) {
  const r = sshCmd(["docker", "rmi", oldImageId]).outputSync();
  if (r.success) console.log("  ok: removed old image " + oldImageId.slice(0, 12));
  else console.log(`  (old image ${oldImageId.slice(0, 12)} still in use — skipped)`);
} else {
  console.log("  (image id unchanged — nothing to remove)");
}

// 6. Sanity check — the container may take a moment to come up after the
//    restart, so poll for up to ~15s.
console.log("==> 6/6 health check");
let code = "000";
for (let attempt = 0; attempt < 15; attempt++) {
  const check = new Deno.Command("ssh", {
    args: [
      "-i",
      SSH_KEY,
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "BatchMode=yes",
      HOST,
      "curl",
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "http://127.0.0.1:8000/",
    ],
  });
  const r = check.outputSync();
  code = new TextDecoder().decode(r.stdout).trim();
  if (code === "200") break;
  await new Promise((r) => setTimeout(r, 1000));
}
if (code === "200") {
  console.log(`\n✓ published and running at http://${HOST.split("@")[1]}:8000/ (HTTP ${code})`);
} else {
  console.error(`\n✗ published but health check returned HTTP ${code}`);
  Deno.exit(1);
}
