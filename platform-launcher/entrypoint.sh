#!/bin/sh
# Generate config.json at startup so the browser fetches the right URLs + anon
# keys (anon keys are public publishable keys, safe to ship to the browser).
# Defaults target the local Docker stack.

set -e

ACQ_ANON_DEFAULT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNTY0MjY0LCJleHAiOjIwOTU5MjQyNjR9.2JNzR8MSPlGfatGmfUp1tQ1bLiDEQBK9mhLmsbHmR88"
LI_ANON_DEFAULT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNTY0MjY0LCJleHAiOjIwOTU5MjQyNjR9.2JNzR8MSPlGfatGmfUp1tQ1bLiDEQBK9mhLmsbHmR88"

cat > /usr/share/nginx/html/config.json <<EOF
{
  "acqUrl":          "${ACQ_URL:-http://localhost:3100}",
  "acqApiUrl":       "${ACQ_API_URL:-http://localhost:54421}",
  "acqAnonKey":      "${ACQ_ANON_KEY:-$ACQ_ANON_DEFAULT}",
  "leadintelUrl":    "${LEADINTEL_URL:-http://localhost:3101}",
  "leadintelApiUrl": "${LEADINTEL_API_URL:-http://localhost:54422}",
  "leadintelAnonKey":"${LEADINTEL_ANON_KEY:-$LI_ANON_DEFAULT}",
  "platformAuthUrl": "${PLATFORM_AUTH_URL:-http://localhost:9998}"
}
EOF

echo "[launcher] config.json written."

exec nginx -g 'daemon off;'
