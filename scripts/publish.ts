/**
 * publish.ts — build, ship, and deploy the latest release to the server.
 *
 * Runs from the repo root and does the whole thing:
 *   1. (re)build the web bundle
 *   2. export the docker image tarball for the target arch
 *   3. docker load it there (tags netrunner:<arch>) — /workspace is mapped to
 *      /home/matty/code/denorunner on the host, so the tarball is already in
 *      place and needs no scp.
 *   4. restart the systemd unit that runs the container
 *
 * The SSH key is read from the checked-in `orange` file (gitignored) — it
 * stays in the repo, is never installed, and is only referenced here.
 *
 *   deno run --allow-read --allow-write --allow-run --allow-net scripts/publish.ts [--arch arm64|amd64]
 */

const args = Deno.args;
let ARCH = "arm64";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--arch" && args[i + 1]) ARCH = args[++i] as string;
}
const HOST = "matty@192.168.0.2";
const SSH_KEY = "./orange"; // gitignored; passed via -i, never installed
const TARBALL = `./release/netrunner-${ARCH}.tar`;
const REMOTE_DIR = "/home/matty/code/denorunner/release";
const REMOTE_TARBALL = `${REMOTE_DIR}/netrunner-${ARCH}.tar`;

function cmd(name: string, args: string[]): Deno.Command {
  return new Deno.Command(name, {
    args,
    stdout: "inherit",
    stderr: "inherit",
  });
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

console.log(`==> publishing netrunner:${ARCH} to ${HOST}`);

// 1. Rebuild the web bundle so the shipped assets are current.
console.log("==> 1/5 rebuild web bundle");
run(
  cmd(Deno.execPath(), [
    "run",
    "--allow-read",
    "--allow-write",
    "--allow-net",
    "--allow-run",
    "scripts/build-web.ts",
  ]),
  "build-web",
);

// 2. Export the docker image tarball.
console.log(`==> 2/5 export docker images`);
run(cmd("sh", ["scripts/export-docker-images.sh"]), "export-docker-images");

// 3. Load the image into the server's Docker. /workspace is mapped to
//    /home/matty/code/denorunner on the host, so the tarball is already in
//    place — no scp needed. Remember the old image id first so the
//    now-untagged (dangling) previous version can be deleted after the
//    restart instead of accumulating on the host.
console.log("==> 3/4 docker load on server");
const oldImageId = sshCapture(["docker", "images", "-q", `netrunner:${ARCH}`]).split("\n")[0] ?? "";
run(sshCmd(["docker", "load", "-i", REMOTE_TARBALL]), "docker load");

// 4. Restart the systemd unit.
console.log("==> 4/4 restart systemd unit");
run(sshCmd(["systemctl", "--user", "restart", "netrunner.service"]), "systemctl restart");

// Remove the superseded image so disk usage stays flat across publishes.
// The unit uses --rm containers, so after the restart nothing references it.
const newImageId = sshCapture(["docker", "images", "-q", `netrunner:${ARCH}`]).split("\n")[0] ?? "";
if (oldImageId && newImageId && oldImageId !== newImageId) {
  const r = sshCmd(["docker", "rmi", oldImageId]).outputSync();
  if (r.success) console.log("  ok: removed old image " + oldImageId.slice(0, 12));
  else console.log(`  (old image ${oldImageId.slice(0, 12)} still in use — skipped)`);
}

// Sanity check — the container may take a moment to come up after the
// restart, so poll for up to ~15s.
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
  console.log(`\n✓ published and running at http://192.168.0.2:8000/ (HTTP ${code})`);
} else {
  console.error(`\n✗ published but health check returned HTTP ${code}`);
  Deno.exit(1);
}
