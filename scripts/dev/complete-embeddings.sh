#!/bin/bash

# Complete all remaining embedding jobs
# Usage: bash scripts/dev/complete-embeddings.sh

set -e

echo "============================================================"
echo "Complete All Remaining Embedding Jobs"
echo "============================================================"
echo ""

# Check initial status
echo "Initial status:"
docker exec -i techtrend-postgres psql -U postgres -d techtrend_dev <<EOF
SELECT status, COUNT(*) FROM embedding_jobs GROUP BY status ORDER BY status;
EOF

echo ""
echo "Starting worker executions..."
echo ""

# Run worker until no more PENDING jobs
run=1
while true; do
  echo "=== Execution $run ==="

  # Check remaining jobs
  pending=$(docker exec -i techtrend-postgres psql -U postgres -d techtrend_dev -t -c "SELECT COUNT(*) FROM embedding_jobs WHERE status = 'PENDING';")
  pending=$(echo "$pending" | tr -d ' ')

  if [ "$pending" -eq 0 ]; then
    echo "No more PENDING jobs. Done!"
    break
  fi

  echo "Remaining PENDING jobs: $pending"

  # Run worker
  npm run worker:embedding 2>&1 | tail -5

  echo ""
  run=$((run + 1))

  # Safety limit
  if [ $run -gt 20 ]; then
    echo "⚠️  Safety limit reached (20 executions). Stopping."
    break
  fi

  sleep 2
done

echo ""
echo "============================================================"
echo "Final Status"
echo "============================================================"

# Final status
docker exec -i techtrend-postgres psql -U postgres -d techtrend_dev <<EOF
SELECT status, COUNT(*) FROM embedding_jobs GROUP BY status ORDER BY status;
EOF

echo ""

# Coverage
docker exec -i techtrend-postgres psql -U postgres -d techtrend_dev <<EOF
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN EXISTS (
    SELECT 1 FROM "ArticleEmbedding" ae
    WHERE ae."articleId" = a.id
    AND ae."embeddingKey" = 'summary'
  ) THEN 1 END) as with_emb,
  ROUND(100.0 * COUNT(CASE WHEN EXISTS (
    SELECT 1 FROM "ArticleEmbedding" ae
    WHERE ae."articleId" = a.id
    AND ae."embeddingKey" = 'summary'
  ) THEN 1 END) / COUNT(*), 2) as pct
FROM "Article" a
WHERE a.summary IS NOT NULL;
EOF

echo ""
echo "============================================================"
echo "Complete!"
echo "============================================================"
