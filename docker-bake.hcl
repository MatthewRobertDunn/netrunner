# docker-bake.hcl — multi-arch build + export for the Netrunner web image.
#
# Requires Docker with buildx:
#   docker buildx create --use
#   docker buildx bake --push -t <registry>/netrunner:latest
#
# To export to local tarballs instead of pushing:
#   docker buildx bake --load netrunner-amd64 netrunner-arm64
#   docker buildx build --platform linux/amd64 --load -t netrunner:amd64 .
#   docker save netrunner:amd64 -o ./release/netrunner-amd64.tar
#   docker buildx build --platform linux/arm64 --load -t netrunner:arm64 .
#   docker save netrunner:arm64 -o ./release/netrunner-arm64.tar

variable "DOCKERFILE" {
  default = "Dockerfile"
}

variable "CONTEXT" {
  default = "."
}

target "netrunner-amd64" {
  context = CONTEXT
  dockerfile = DOCKERFILE
  platforms = ["linux/amd64"]
}

target "netrunner-arm64" {
  context = CONTEXT
  dockerfile = DOCKERFILE
  platforms = ["linux/arm64"]
}

group "default" {
  targets = ["netrunner-amd64", "netrunner-arm64"]
}