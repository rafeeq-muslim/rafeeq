# Security headers (security review #9). Included in every location because
# an add_header inside a location cancels the server-level ones.
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy no-referrer always;
add_header Permissions-Policy "geolocation=(self), camera=(), microphone=()" always;
add_header X-Frame-Options DENY always;
add_header Strict-Transport-Security "max-age=31536000" always;
# Media and covers come only from the approved sources' own file hosts.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://d1.islamhouse.com https://islamhouse.com; media-src 'self' blob: https://d1.islamhouse.com https://ih-download.islamenc.com https://d.quranenc.com; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
