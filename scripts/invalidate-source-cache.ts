#!/usr/bin/env npx tsx

import { sourceCache } from '../lib/cache/source-cache';

async function main() {
  console.log('Invalidating source cache...');
  await sourceCache.invalidate();
  console.log('Source cache invalidated successfully');
  process.exit(0);
}

main().catch(error => {
  console.error('Error invalidating cache:', error);
  process.exit(1);
});