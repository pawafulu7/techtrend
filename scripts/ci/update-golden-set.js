#!/usr/bin/env node

/**
 * Update the expectedOutput entries in lib/ai/testing/golden-set.json
 * with the actualOutput values captured in regression-report.json.
 *
 * Usage:
 *   node scripts/update-golden-set.js <exampleId> [<exampleId> ...]
 *
 * Example:
 *   node scripts/update-golden-set.js golden-abc golden-def
 */

const fs = require("fs");
const path = require("path");

const ids = process.argv.slice(2);

if (ids.length === 0) {
  console.error("Usage: node scripts/update-golden-set.js <exampleId> [<exampleId> ...]");
  process.exit(1);
}

const projectRoot = process.cwd();
const goldenPath = path.join(projectRoot, "lib/ai/testing/golden-set.json");
const regressionPath = path.join(projectRoot, "regression-report.json");

const readJson = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read or parse ${filePath}:`, error.message);
    process.exit(1);
  }
};

const goldenSet = readJson(goldenPath);
const regressionReport = readJson(regressionPath);

if (!Array.isArray(goldenSet.examples)) {
  console.error("golden-set.json is missing an examples array.");
  process.exit(1);
}

if (!Array.isArray(regressionReport.results)) {
  console.error("regression-report.json is missing a results array.");
  process.exit(1);
}

const examplesById = new Map(
  goldenSet.examples.map((example, index) => [example.id, { example, index }]),
);
const resultsById = new Map(
  regressionReport.results.map((result) => [result.exampleId, result]),
);

const updates = [];

for (const id of ids) {
  const entry = examplesById.get(id);
  if (!entry) {
    console.error(`No example found in golden-set.json for id: ${id}`);
    process.exit(1);
  }

  const result = resultsById.get(id);
  if (!result || typeof result.actualOutput !== "object") {
    console.error(`No actualOutput found in regression-report.json for id: ${id}`);
    process.exit(1);
  }

  const { example } = entry;
  example.expectedOutput = result.actualOutput;
  updates.push(id);
}

try {
  fs.writeFileSync(goldenPath, `${JSON.stringify(goldenSet, null, 2)}\n`, "utf8");
} catch (error) {
  console.error(`Failed to write ${goldenPath}:`, error.message);
  process.exit(1);
}

if (updates.length > 0) {
  console.log(`Updated expectedOutput for ${updates.length} example(s):`);
  updates.forEach((id) => console.log(`- ${id}`));
}
