#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
[ -d node_modules/ws ] || npm ci --omit=dev --omit=optional || exit 1
exec node server/start.mjs
