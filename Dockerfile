# syntax=docker/dockerfile:1

# Production image: serves the pre-built static site only.
#
# The web bundle (public/dist/app.js) and assets are built on the host via
# `deno task build-web` and committed, so this image has no build step — it
# just ships the static files. The only runtime dependency is the Deno
# interpreter, used by the tiny static file server (public/serve.ts).
#
#   docker build -t netrunner .
#   docker run --rm -p 8000:8000 netrunner

FROM denoland/deno:distroless-2.9.8

WORKDIR /app/public

# Ship only the assembled static site. No source, no node_modules, no cache.
# --chown=65532:65532 matches the nonroot user in the base image.
COPY public/ /app/public/

USER 65532:65532

ENV PORT=8000 HOST=0.0.0.0
EXPOSE 8000

# Entrypoint is `tini -- deno run`; CMD carries the deno args.
# Scoped permissions: read only /app/public, allow PORT/HOST env, allow
# binding the listen socket. No network access is needed at runtime.
CMD ["run", "--allow-read=/app/public", "--allow-env=PORT,HOST", "--allow-net", "serve.ts"]