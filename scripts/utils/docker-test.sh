#!/bin/bash
# scripts/utils/docker-test.sh
# Usage: npm run docker:test:quick -- <test-file> [test-name-pattern]
# Note: docker:test:spec はコンテナ起動込み。quickはコンテナ起動済みを前提とする。
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: npm run docker:test:quick -- <test-file> [test-name-pattern]" >&2
  echo "  e.g. npm run docker:test:quick -- __tests__/lib/services/feed-collector.test.ts" >&2
  echo "" >&2
  echo "Note: Requires test containers to be running (npm run docker:test:up)" >&2
  exit 2
fi

export TEST_FILE="$1"
if [ -n "${2:-}" ]; then
  export TEST_NAME_PATTERN="$2"
else
  unset TEST_NAME_PATTERN
fi
npm run docker:test:file
