#!/bin/sh
# Generate config.json at startup so the browser fetches the right URLs.
# Defaults to localhost ports if env vars not set.

set -e

cat > /usr/share/nginx/html/config.json <<EOF
{
  "acqUrl":         "${ACQ_URL:-http://localhost:3100}",
  "acqApiUrl":      "${ACQ_API_URL:-http://localhost:54421}",
  "leadintelUrl":   "${LEADINTEL_URL:-http://localhost:3101}",
  "leadintelApiUrl":"${LEADINTEL_API_URL:-http://localhost:54422}"
}
EOF

echo "[launcher] config.json:"
cat /usr/share/nginx/html/config.json

exec nginx -g 'daemon off;'
