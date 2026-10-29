#!/bin/sh
# Build the production images for both architectures into ./release/.
#
# The image is a single layer on top of `denoland/deno:distroless-2.9.8`
# containing the pre-built static site (public/) — equivalent to what
# `docker build` of Dockerfile would produce. `crane` (go-containerregistry)
# is used instead of a Docker daemon so the images can be produced on hosts
# where dockerd cannot mount(2)/unshare(2) (e.g. unprivileged containers).
#
# Requires: crane, GNU tar. Safe to run from any directory.
#
#   scripts/export-docker-images.sh

set -eu

cd "$(dirname "$0")/.."

BASE_IMAGE="denoland/deno:distroless-2.9.8"
IMAGE_NAME="netrunner"
RELEASE_DIR="./release"
WORK_DIR="${TMPDIR:-/tmp}/netrunner-image-build"

if ! command -v crane >/dev/null 2>&1; then
  echo "error: crane is required (https://github.com/google/go-containerregistry)" >&2
  exit 1
fi

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/layerroot/app" "$RELEASE_DIR"

# The layer is owned by the nonroot uid the image runs as (65532), matching
# `COPY --chown=65532:65532 public/ /app/public/` in the Dockerfile.
cp -a public "$WORK_DIR/layerroot/app/public"
chown -R 65532:65532 "$WORK_DIR/layerroot/app/public"

# Deterministic, sorted layer tar.
tar --sort=name \
    --owner=65532 --group=65532 --numeric-owner \
    --mtime=@0 --format=ustar \
    -C "$WORK_DIR/layerroot" \
    -cf "$WORK_DIR/layer.tar" app

for arch in arm64 amd64; do
  echo "==> building linux/$arch"

  crane mutate \
    --platform "linux/$arch" \
    --append "$WORK_DIR/layer.tar" \
    --workdir /app/public \
    --user 65532:65532 \
    --env PORT=8000 \
    --exposed-ports 8000/tcp \
    --cmd run \
    --cmd --allow-read=/app/public \
    --cmd --allow-env=PORT \
    --cmd --allow-net \
    --cmd serve.ts \
    -o "$WORK_DIR/$arch.tar" \
    "$BASE_IMAGE"

  # Retag as netrunner:<arch> so `docker load -i release/netrunner-<arch>.tar`
  # yields a usable tag. Unpack, edit manifest.json, and re-tar cleanly.
  rm -rf "$WORK_DIR/unpack"
  mkdir -p "$WORK_DIR/unpack"
  tar -xf "$WORK_DIR/$arch.tar" -C "$WORK_DIR/unpack"

  sed -i "s|\"RepoTags\":\[[^]]*\]|\"RepoTags\":[\"$IMAGE_NAME:$arch\"]|" \
    "$WORK_DIR/unpack/manifest.json"

  tar --sort=name --mtime=@0 --format=ustar \
      -C "$WORK_DIR/unpack" -cf "$RELEASE_DIR/$IMAGE_NAME-$arch.tar" .

  # Report what was built.
  cfg=$(grep -o '"Config":"sha256:[0-9a-f]*' "$WORK_DIR/unpack/manifest.json" | cut -d: -f3-)
  echo "    tag:      $IMAGE_NAME:$arch"
  echo "    config:   ${cfg:0:12}…"
  echo "    size:     $(du -h "$RELEASE_DIR/$IMAGE_NAME-$arch.tar" | cut -f1)"
  grep -o '"User":"[^"]*"'        "$WORK_DIR/unpack/sha256:$cfg" | sed 's/^/    user:     /'
  grep -o '"WorkingDir":"[^"]*"'  "$WORK_DIR/unpack/sha256:$cfg" | sed 's/^/    workdir:  /'
  grep -o '"ExposedPorts":{[^}]*}' "$WORK_DIR/unpack/sha256:$cfg" | sed 's/^/    ports:    /'
done

echo
echo "==> done"
ls -lh "$RELEASE_DIR"
