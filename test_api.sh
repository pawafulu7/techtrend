#!/bin/bash

echo "Testing /api/trends/analysis endpoints..."
echo ""

# Test 1: Default parameters
echo "Test 1: Default parameters"
result=$(curl -s "http://localhost:3001/api/trends/analysis" | jq '.period.days')
if [ "$result" = "30" ]; then
  echo "✅ Default (30 days): PASS"
else
  echo "❌ Default (30 days): FAIL (got $result)"
fi

# Test 2: days=7
echo "Test 2: days=7"
result=$(curl -s "http://localhost:3001/api/trends/analysis?days=7" | jq '.period.days')
if [ "$result" = "7" ]; then
  echo "✅ days=7: PASS"
else
  echo "❌ days=7: FAIL (got $result)"
fi

# Test 3: days=14
echo "Test 3: days=14"
result=$(curl -s "http://localhost:3001/api/trends/analysis?days=14" | jq '.period.days')
if [ "$result" = "14" ]; then
  echo "✅ days=14: PASS"
else
  echo "❌ days=14: FAIL (got $result)"
fi

# Test 4: tag=JavaScript
echo "Test 4: tag=JavaScript"
result=$(curl -s "http://localhost:3001/api/trends/analysis?tag=JavaScript" | jq -r '.tag')
if [ "$result" = "JavaScript" ]; then
  echo "✅ tag=JavaScript: PASS"
else
  echo "❌ tag=JavaScript: FAIL (got $result)"
fi

# Test 5: Combined parameters
echo "Test 5: days=7&tag=TypeScript"
result_days=$(curl -s "http://localhost:3001/api/trends/analysis?days=7&tag=TypeScript" | jq '.period.days')
result_tag=$(curl -s "http://localhost:3001/api/trends/analysis?days=7&tag=TypeScript" | jq -r '.tag')
if [ "$result_days" = "7" ] && [ "$result_tag" = "TypeScript" ]; then
  echo "✅ Combined parameters: PASS"
else
  echo "❌ Combined parameters: FAIL (days=$result_days, tag=$result_tag)"
fi

echo ""
echo "All tests completed!"
