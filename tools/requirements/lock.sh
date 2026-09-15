#!/usr/bin/env sh
# Regenerate the hash-locked conversion requirements used by Dockerfile.web.
#
# Both locks target CPython 3.12 on x86_64 manylinux_2_28 (the digest-pinned
# python:3.12-slim image, Debian glibc 2.41, and Render's linux/amd64 build
# hosts), wheels only, with every transitive distribution pinned and hashed so
# the disposable conversion stages install with `pip --require-hashes`.
set -eu
cd "$(dirname "$0")"
uv pip compile --generate-hashes --emit-index-url --only-binary :all: \
  --python-version 3.12 --python-platform x86_64-manylinux_2_28 \
  --index-url https://pypi.org/simple \
  --extra-index-url https://download.pytorch.org/whl/cpu \
  --index-strategy unsafe-best-match --no-header \
  minimind-browser.in -o minimind-browser.txt
uv pip compile --generate-hashes --emit-index-url --only-binary :all: \
  --python-version 3.12 --python-platform x86_64-manylinux_2_28 \
  --index-url https://pypi.org/simple --no-header \
  malecns.in -o malecns.txt
