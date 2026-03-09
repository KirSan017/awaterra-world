#!/bin/sh
set -e

DATA_DIR="/app/data"
mkdir -p "$DATA_DIR"

# Seed content on first boot (volume empty)
if [ ! -f "$DATA_DIR/.initialized" ]; then
  echo "First boot — seeding content from image..."
  cp -r /tmp/seed/concepts "$DATA_DIR/"
  cp -r /tmp/seed/scenes "$DATA_DIR/"
  cp -r /tmp/seed/meta "$DATA_DIR/"
  touch "$DATA_DIR/.initialized"
  echo "Content seeded."
fi

# Always update scripts and dashboard from image (code, not data)
cp -r /tmp/seed/scripts /app/
cp -r /tmp/seed/dashboard /app/

# Rebuild index from current content
echo "Building index..."
CONTENT_DIR="$DATA_DIR" npx tsx scripts/build-index.ts
echo "Index built."

# Start dashboard
echo "Starting Awaterra World dashboard..."
exec npx tsx dashboard/server.ts
