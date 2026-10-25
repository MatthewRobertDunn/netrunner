/**
 * Fetch card images from NetrunnerDB's card-images CDN.
 *
 * For every card in the starter-deck pool (data/cards.json), download the
 * `xlarge` WebP at
 *   https://card-images.netrunnerdb.com/v2/xlarge/<printing_id>.webp
 * into `data/images/<card_id>.webp`. The `latest_printing_id` is used, which
 * is the most recent printing of each card.
 *
 * Dev-only; needs network. Idempotent: existing files are skipped.
 *
 *   deno run --allow-net --allow-read --allow-write scripts/fetch-card-images.ts
 */

const OUT_DIR = "./data/images";

async function main() {
  const cards = JSON.parse(await Deno.readTextFile("./data/cards.json")).cards as Array<{
    id: string;
    latest_printing_id: string;
  }>;

  await Deno.mkdir(OUT_DIR, { recursive: true });

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const card of cards) {
    const dest = `${OUT_DIR}/${card.id}.webp`;
    try {
      const stat = await Deno.stat(dest);
      if (stat.size > 0) {
        skip++;
        continue;
      }
    } catch {
      // not present yet
    }

    const url = `https://card-images.netrunnerdb.com/v2/xlarge/${card.latest_printing_id}.webp`;
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      console.error(`FAIL ${card.id} (${card.latest_printing_id}): HTTP ${res.status}`);
      fail++;
      continue;
    }
    const bytes = await res.arrayBuffer();
    await Deno.writeFileSync(dest, new Uint8Array(bytes));
    console.log(`OK   ${card.id}  ${bytes.byteLength} bytes`);
    ok++;
  }

  console.log(`\ndone: ${ok} fetched, ${skip} already present, ${fail} failed`);
  if (fail > 0) Deno.exit(1);
}

main();
