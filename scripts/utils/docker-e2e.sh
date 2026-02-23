#!/bin/bash
# scripts/utils/docker-e2e.sh
# Usage: npm run docker:e2e:quick -- <spec-file>
# Note: docker:e2e:spec はコンテナ起動込み。quickはコンテナ起動済みを前提とする。
set -euo pipefail
if [ -z "${1:-}" ]; then
  echo "Usage: npm run docker:e2e:quick -- <spec-file>" >&2
  echo "Note: Requires test containers to be running (npm run docker:e2e:up)" >&2
  exit 2
fi
export E2E_FILE="$1"
npm run docker:e2e:file
