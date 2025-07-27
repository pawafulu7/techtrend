#!/bin/bash

# 一時的な修正スクリプトを old-scripts/ に移動
mkdir -p old-scripts

# 修正済みのスクリプトを移動
mv fix-*.js old-scripts/ 2>/dev/null
mv check-*.js old-scripts/ 2>/dev/null
mv regenerate-*.js old-scripts/ 2>/dev/null
mv generate-new-summaries.js old-scripts/ 2>/dev/null
mv fetch-additional-articles.js old-scripts/ 2>/dev/null
mv test-improved-summary.js old-scripts/ 2>/dev/null

echo "✅ 一時スクリプトを old-scripts/ に移動しました"