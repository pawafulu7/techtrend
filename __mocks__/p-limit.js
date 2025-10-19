/**
 * Mock for p-limit (ESM module)
 *
 * p-limit v4+ is pure ESM, which causes issues in Jest CommonJS environment.
 * This mock provides a minimal implementation for testing.
 */

const pLimit = (concurrency) => {
  return (fn) => fn();
};

module.exports = pLimit;
module.exports.default = pLimit;
