#!/bin/sh
set -e

# Runtime config injection: bake all VITE_* env vars into /env.js so one image
# can serve any tenant (no per-tenant rebuild needed).
ENV_JS="${ENV_JS_PATH:-/app/dist/env.js}"

{
  printf 'window.__ENV__ = window.__ENV__ || {};\n'
  env | grep '^VITE_' | while IFS= read -r line; do
    key=${line%%=*}
    val=${line#*=}
    esc=$(printf '%s' "$val" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf 'window.__ENV__["%s"] = "%s";\n' "$key" "$esc"
  done
} > "$ENV_JS"

exec serve -s /app/dist -l 5173
