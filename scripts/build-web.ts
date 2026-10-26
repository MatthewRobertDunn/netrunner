/**
 * Build the browser bundle for the web UI.
 *
 * Bundles `src/web/entry.ts` (engine + Vue app) into a single self-contained
 * ES module with `deno bundle`, and copies the static assets (card images,
 * NSG SVG symbols) into `public/` so the app is fully offline.
 *
 *   deno run --allow-read --allow-write --allow-net --allow-run scripts/build-web.ts
 *
 * (`--allow-net` etc. are needed because the bundle step resolves `npm:vue`.)
 */

const entry = "src/web/entry.ts";
const outfile = "public/dist/app.js";

// 1. Bundle with Deno's own bundler (handles `with { type: "json" }` and
//    `npm:` specifiers natively).
const bundle = new Deno.Command("/usr/local/bin/deno", {
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
const NSG = "/tmp/opencode/assets/NSG-Visual-Assets/SVG";
const svgMap: [string, string][] = [
  // [source name, destination name]
  ["Game Symbols/NSG_CREDIT.svg", "credit.svg"],
  ["Game Symbols/NSG_CLICK_BLUE.svg", "click.svg"],
  ["Game Symbols/NSG_CLICK.svg", "click-outline.svg"],
  ["Game Symbols/NSG_TAG.svg", "tag.svg"],
  ["Game Symbols/NSG_ADVANCEMENT_COUNTER.svg", "advancement.svg"],
  ["Game Symbols/NSG_SUBROUTINE.svg", "subroutine.svg"],
  ["Game Symbols/NSG_Mu.svg", "mu.svg"],
  ["Game Symbols/NSG_LINK.svg", "link.svg"],
  ["Game Symbols/NSG_CORE_DAMAGE.svg", "core-damage.svg"],
  ["Game Symbols/NSG_REZ_COST.svg", "rez-cost.svg"],
  ["Game Symbols/NSG_TRASH_COST bw.svg", "trash-cost.svg"],
  ["Game Symbols/NSG_AGENDA.svg", "agenda.svg"],
  ["Game Symbols/NSG_HQ_Icon.svg", "hq.svg"],
  ["Game Symbols/NSG_RD_Icon.svg", "rd.svg"],
  ["Game Symbols/NSG_Archives_Icon.svg", "archives.svg"],
  ["Faction Glyphs/NSG_HB.svg", "faction-hb.svg"],
  ["Faction Glyphs/NSG_JINTEKI.svg", "faction-jinteki.svg"],
  ["Faction Glyphs/NSG_NBN.svg", "faction-nbn.svg"],
  ["Faction Glyphs/NSG_WEYLAND.svg", "faction-weyland.svg"],
  ["Faction Glyphs/NSG_CRIMINAL.svg", "faction-criminal.svg"],
  ["Faction Glyphs/NSG_ANARCH.svg", "faction-anarch.svg"],
  ["Faction Glyphs/NSG_SHAPER.svg", "faction-shaper.svg"],
  ["Set Symbols/System Gateway Set Symbol.svg", "set-sysgw.svg"],
];

let svgCount = 0;
await Deno.mkdir("./public/assets/svg", { recursive: true });
for (const [src, dst] of svgMap) {
  try {
    await Deno.copyFile(`${NSG}/${src}`, `./public/assets/svg/${dst}`);
    svgCount++;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      console.warn(`missing SVG asset: ${src}`);
    } else throw e;
  }
}
console.log(`copied ${svgCount} NSG SVG symbol(s) to public/assets/svg/`);
console.log(`done: ${outfile}`);
