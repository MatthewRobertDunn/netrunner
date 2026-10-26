# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: bundle the engine + Vue app and assemble public/.
#
# `deno bundle` resolves npm:vue and the JSON data imports natively, so the
# only inputs are the source tree, the card data/images, and the SVG assets.
# ---------------------------------------------------------------------------

FROM denoland/deno:alpine-2.9.8 AS build

WORKDIR /app

# Cache dependencies first: deno.lock pins npm:vue, and this layer is
# invalidated only when source or data changes — never by asset edits.
COPY deno.json deno.lock ./
COPY data/cards.json data/starter-decks.json data/
COPY src/ src/

RUN --mount=type=cache,target=/deno-cache \
    DENO_DIR=/deno-cache deno bundle --platform=browser \
      -o /tmp/deps.js src/web/entry.ts

# Full build: bundle + copy card images and NSG SVG symbols into public/.
COPY public/ public/
COPY data/images data/images/
COPY assets/ assets/
COPY scripts/build-web.ts scripts/build-web.ts

RUN --mount=type=cache,target=/deno-cache \
    DENO_DIR=/deno-cache deno run \
      --allow-read --allow-write --allow-net --allow-run \
      scripts/build-web.ts

# ---------------------------------------------------------------------------
# Runtime stage: distroless Deno with only the assembled static site —
# no shell, no package manager, runs as nonroot. `serve.ts` has zero
# dependencies beyond the Deno runtime, so no cache is needed here.
#
# The image entrypoint is `/tini -- /bin/deno`, so CMD carries deno args.
# ---------------------------------------------------------------------------

FROM denoland/deno:distroless-2.9.8

WORKDIR /app/public
COPY --from=build --chown=65532:65532 /app/public/ /app/public/

USER 65532:65532

ENV PORT=8000 HOST=0.0.0.0
EXPOSE 8000

CMD ["run", "--allow-read=/app/public", "--allow-env=PORT,HOST", "--allow-net", "serve.ts"]
