/**
 * Build the browser bundle for the web UI.
 *
 * Bundles `src/web/entry.ts` (engine + Vue app) into a single self-contained
 * ES module with `deno bundle`, and copies the static assets (card images,
 * NSG SVG symbols) into `public/` so the app is fully offline.
 *
 *   deno run --allow-read --allow-write --allow-net --allow-run scripts/build-web.ts
 *
 * (`--allow-net` etc. are needed because the bundle step resolves `vue` from the
 * import map in deno.json, i.e. the npm registry.)
 */

const entry = "src/web/entry.ts";
const outfile = "public/dist/app.js";

// 1. Bundle with Deno's own bundler (handles `with { type: "json" }` and the
//    `vue` import-map entry in deno.json natively).
const bundle = new Deno.Command(Deno.execPath(), {
  args: ["bundle", "--platform=browser", "-o", outfile, entry],
  stdout: "inherit",
  stderr: "inherit",
});
const bundleRes = bundle.outputSync();
if (!bundleRes.success) {
  console.error("deno bundle failed");
  Deno.exit(1);
}

// 2. Copy card images (data/images/<card-id>.webp) into public/images/.
async function copyFiles(srcDir: string, dstDir: string, ext: string): Promise<number> {
  let count = 0;
  try {
    await Deno.mkdir(dstDir, { recursive: true });
    for (const entry of Deno.readDirSync(srcDir)) {
      if (entry.isFile && entry.name.endsWith(ext)) {
        Deno.copyFileSync(`${srcDir}/${entry.name}`, `${dstDir}/${entry.name}`);
        count++;
      }
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  return count;
}

const images = await copyFiles("./data/images", "./public/images", ".webp");
console.log(`copied ${images} card image(s) to public/images/`);

// 3. Copy the NSG game-symbol and faction-glyph SVGs used by the UI.
//    The source SVGs live in the checked-in `assets/svg/` directory so the
//    build is fully self-contained (no host-only paths needed).
const SVG_DIR = "./assets/svg";
const svgDest = "./public/assets/svg";
let svgCount = 0;
try {
  await Deno.mkdir(svgDest, { recursive: true });
  for (const entry of Deno.readDirSync(SVG_DIR)) {
    if (entry.isFile && entry.name.endsWith(".svg")) {
      Deno.copyFileSync(`${SVG_DIR}/${entry.name}`, `${svgDest}/${entry.name}`);
      svgCount++;
    }
  }
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) throw e;
}
console.log(`copied ${svgCount} NSG SVG symbol(s) to ${svgDest}/`);
console.log(`done: ${outfile}`);
