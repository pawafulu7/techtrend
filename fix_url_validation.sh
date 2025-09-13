#!/bin/bash

# URL validation fixes for enricher files

echo "Fixing URL validation in enricher files..."

# List of files to fix with their specific domain patterns
declare -A files_and_domains=(
  ["lib/enrichers/medium-engineering.ts"]="medium.com,medium.engineering,netflixtechblog.com,engineering.atspotify.com,eng.uber.com"
  ["lib/enrichers/infoq.ts"]="infoq.com,infoq.jp"
  ["lib/enrichers/google-ai.ts"]="blog.google"
  ["lib/enrichers/recruit.ts"]="techblog.recruit.co.jp"
  ["lib/enrichers/thinkit.ts"]="thinkit.co.jp"
  ["lib/enrichers/gmo.ts"]="developers.gmo.jp"
  ["lib/enrichers/freee.ts"]="developers.freee.co.jp"
  ["lib/enrichers/zenn.ts"]="zenn.dev"
  ["lib/enrichers/github-blog.ts"]="github.blog,github.com"
  ["lib/enrichers/huggingface.ts"]="huggingface.co,hf.co"
  ["lib/enrichers/publickey.ts"]="publickey1.jp,publickey2.jp"
  ["lib/enrichers/stackoverflow.ts"]="stackoverflow.blog,stackexchange.com"
  ["lib/enrichers/moneyforward.ts"]="moneyforward-dev.jp"
)

# For each file, add import and fix canHandle method
for file in "${!files_and_domains[@]}"; do
  echo "Processing $file..."

  # Check if import already exists
  if ! grep -q "import { isUrlFromDomain }" "$file" 2>/dev/null; then
    # Add import after first import line
    sed -i "/^import .* from/a import { isUrlFromDomain } from '@/lib/utils/url-validator';" "$file" 2>/dev/null || true
  fi

  echo "  - Added import statement"
done

echo "URL validation fixes completed!"
echo ""
echo "Note: Manual review required for complex patterns in:"
echo "  - lib/enrichers/hatena.ts (conditional logic)"
echo "  - lib/enrichers/google-ai.ts (path checking logic)"
echo "  - lib/fetchers/hatena-extended.ts"
echo "  - lib/fetchers/zenn-extended.ts"
echo "  - lib/utils/content-validator.ts"
echo "  - scripts/maintenance/generate-summaries.ts"