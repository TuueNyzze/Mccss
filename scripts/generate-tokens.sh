#!/usr/bin/env bash
set -euo pipefail

# Generate demo tokens:
# - ADMIN_API_TOKEN (random)
# - JWTs for roles 'admin' and 'user' signed with JWT_SECRET (env or default)

JWT_SECRET=${JWT_SECRET:-dev-secret}

ADMIN_API_TOKEN=$(head -c 24 /dev/urandom | base64 | tr -d '=+/')

echo "ADMIN_API_TOKEN=$ADMIN_API_TOKEN"
echo
echo "JWT_SECRET=$JWT_SECRET"
echo
echo "Generating JWTs (signed with JWT_SECRET)"
if command -v node >/dev/null 2>&1; then
  ADMIN_JWT=$(node scripts/generate-jwt.js admin "$JWT_SECRET"  | tr -d '\n')
  USER_JWT=$(node scripts/generate-jwt.js user  "$JWT_SECRET"  | tr -d '\n')
  echo "ADMIN_JWT=$ADMIN_JWT"
  echo
  echo "USER_JWT=$USER_JWT"
else
  echo "node not found — cannot generate JWTs. Install Node.js to generate tokens."
  exit 2
fi

echo
DEMO_ENV_FILE="demo/.env.demo"
mkdir -p demo
cat > "$DEMO_ENV_FILE" <<EOF
ADMIN_API_TOKEN=$ADMIN_API_TOKEN
JWT_SECRET=$JWT_SECRET
EOF

echo "Wrote demo env file: $DEMO_ENV_FILE"
echo
echo "To use these tokens locally (docker-compose demo):"
echo "  # loads ADMIN_API_TOKEN and JWT_SECRET from $DEMO_ENV_FILE"
echo "  ./demo/run-demo.sh"
echo
echo "To call protected API endpoints (example):"
echo "  curl -H \"Authorization: Bearer $ADMIN_JWT\" http://localhost:3000/api/v1/tasks"
