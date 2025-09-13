#!/bin/bash

# Batch fix remaining enricher files

files=(
  "lib/enrichers/recruit.ts:techblog.recruit.co.jp"
  "lib/enrichers/thinkit.ts:thinkit.co.jp"
  "lib/enrichers/gmo.ts:developers.gmo.jp"
  "lib/enrichers/freee.ts:developers.freee.co.jp"
  "lib/enrichers/zenn.ts:zenn.dev"
  "lib/enrichers/github-blog.ts:github.blog,github.com"
  "lib/enrichers/huggingface.ts:huggingface.co,hf.co"
  "lib/enrichers/publickey.ts:publickey1.jp,publickey2.jp"
  "lib/enrichers/stackoverflow.ts:stackoverflow.blog,stackexchange.com"
  "lib/enrichers/moneyforward.ts:moneyforward-dev.jp"
)

for entry in "${files[@]}"; do
  IFS=':' read -r file domains <<< "$entry"
  echo "Processing $file with domains: $domains"
done