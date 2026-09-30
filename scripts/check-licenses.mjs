#!/usr/bin/env node
/**
 * check-licenses.mjs — Validate dependency licenses against the HMS policy.
 *
 * Reads the policy from scripts/license-policy.json.
 * Scans the full dependency tree (production + dev, including transitive deps).
 * Differentiates production dependencies (must pass policy.allowed) from
 * dev-only dependencies (may also use policy.allowedDev).
 * Handles SPDX expressions like "MIT OR Apache-2.0" and "(MIT AND BSD-3-Clause)".
 * Fails on:
 *   - Any forbidden license
 *   - Any license needing approval (unless the package is in ignoredPackages)
 *   - Any license in allowedDev used in a production dependency
 *   - Any missing / unknown license
 *
 * Usage: node scripts/check-licenses.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const policyPath = resolve(__dirname, 'license-policy.json');

/** @type {{ allowed: string[], allowedDev?: string[], needsApproval: string[], forbidden: string[], ignoredPackages: string[] }} */
const policy = JSON.parse(readFileSync(policyPath, 'utf-8'));

const allowedSet = new Set(policy.allowed);
const allowedDevSet = new Set(policy.allowedDev || []);
const needsApprovalSet = new Set(policy.needsApproval);
const forbiddenSet = new Set(policy.forbidden);
const ignoredSet = new Set(policy.ignoredPackages);

/**
 * Extract individual SPDX identifiers from a license expression.
 * Handles "MIT", "MIT OR Apache-2.0", "(MIT AND BSD-3-Clause)", etc.
 * @param {string} expression
 * @returns {string[]}
 */
function parseSpdxExpression(expression) {
  return expression
    .replace(/[()]/g, '')
    .split(/\s+(?:OR|AND)\s+/i)
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Classify a license identifier for a package.
 * @param {string} id
 * @param {boolean} isProd
 * @returns {'allowed' | 'needs-approval' | 'forbidden' | 'dev-only-in-prod' | 'unknown'}
 */
function classifyLicense(id, isProd) {
  if (forbiddenSet.has(id)) return 'forbidden';
  if (needsApprovalSet.has(id)) return 'needs-approval';
  if (allowedSet.has(id)) return 'allowed';
  if (allowedDevSet.has(id)) {
    return isProd ? 'dev-only-in-prod' : 'allowed';
  }
  return 'unknown';
}

/**
 * Classify a full SPDX expression.
 * For OR expressions: if any identifier is allowed, the expression is allowed.
 * For AND expressions: all identifiers must be allowed.
 * @param {string} expression
 * @param {boolean} isProd
 * @returns {{ classification: 'allowed' | 'needs-approval' | 'forbidden' | 'dev-only-in-prod' | 'unknown', identifiers: string[] }}
 */
function classifyExpression(expression, isProd) {
  const identifiers = parseSpdxExpression(expression);
  const isOrExpression = /\bOR\b/i.test(expression);

  if (identifiers.length === 0) {
    return { classification: 'unknown', identifiers: [] };
  }

  const classifications = identifiers.map((id) => classifyLicense(id, isProd));

  if (isOrExpression) {
    if (classifications.includes('allowed'))
      return { classification: 'allowed', identifiers };
    if (classifications.includes('needs-approval'))
      return { classification: 'needs-approval', identifiers };
    if (classifications.includes('dev-only-in-prod'))
      return { classification: 'dev-only-in-prod', identifiers };
    if (classifications.includes('forbidden'))
      return { classification: 'forbidden', identifiers };
    return { classification: 'unknown', identifiers };
  }

  // AND or single: most restrictive classification wins
  if (classifications.includes('forbidden'))
    return { classification: 'forbidden', identifiers };
  if (classifications.includes('unknown'))
    return { classification: 'unknown', identifiers };
  if (classifications.includes('dev-only-in-prod'))
    return { classification: 'dev-only-in-prod', identifiers };
  if (classifications.includes('needs-approval'))
    return { classification: 'needs-approval', identifiers };
  return { classification: 'allowed', identifiers };
}

// ── Main ──

console.log(
  'Checking dependency licenses against policy (scanning full tree: prod + dev)...\n',
);

const repoRoot = resolve(__dirname, '..');

// 1. Identify production packages to ensure allowedDev licenses are never used in production
const prodPackageNames = new Set();
try {
  const prodRawOutput = execSync('pnpm licenses list --json --prod', {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    cwd: repoRoot,
  });
  const prodLicenseData = JSON.parse(prodRawOutput);
  for (const packages of Object.values(prodLicenseData)) {
    if (Array.isArray(packages)) {
      for (const pkg of packages) {
        if (pkg.name) prodPackageNames.add(pkg.name);
      }
    }
  }
} catch (error) {
  console.error('Failed to list production licenses:', error.message);
  process.exit(1);
}

// 2. Scan the full tree (both production and dev dependencies)
let rawOutput;
try {
  rawOutput = execSync('pnpm licenses list --json', {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    cwd: repoRoot,
  });
} catch (error) {
  if (error.stdout) {
    rawOutput = error.stdout;
  } else {
    console.error('Failed to run pnpm licenses list:', error.message);
    process.exit(1);
  }
}

/** @type {Record<string, { name: string, versions?: string[], paths?: string[] }[]>} */
let licenseData;
try {
  licenseData = JSON.parse(rawOutput);
} catch {
  console.error('Failed to parse pnpm licenses output.');
  console.error('Raw output (first 500 chars):', rawOutput.slice(0, 500));
  process.exit(1);
}

const problems = [];
let totalChecked = 0;

for (const [licenseExpression, packages] of Object.entries(licenseData)) {
  if (!Array.isArray(packages)) continue;

  for (const pkg of packages) {
    const pkgName = pkg.name ?? 'unknown';

    if (ignoredSet.has(pkgName)) continue;

    totalChecked++;

    const expression = licenseExpression || '';

    if (!expression || expression.toUpperCase() === 'UNKNOWN') {
      problems.push({
        package: pkgName,
        license: expression || '(missing)',
        issue: 'MISSING LICENSE — cannot verify compliance',
      });
      continue;
    }

    const isProd = prodPackageNames.has(pkgName);
    const { classification } = classifyExpression(expression, isProd);

    if (classification === 'forbidden') {
      problems.push({
        package: pkgName,
        license: expression,
        issue: 'FORBIDDEN LICENSE',
      });
    } else if (classification === 'needs-approval') {
      problems.push({
        package: pkgName,
        license: expression,
        issue: 'NEEDS OWNER APPROVAL',
      });
    } else if (classification === 'dev-only-in-prod') {
      problems.push({
        package: pkgName,
        license: expression,
        issue:
          'DEV-ONLY LICENSE IN PRODUCTION DEPENDENCY — not allowed in production',
      });
    } else if (classification === 'unknown') {
      problems.push({
        package: pkgName,
        license: expression,
        issue: 'UNKNOWN LICENSE — not in any policy list',
      });
    }
  }
}

console.log(`Checked ${totalChecked} packages.\n`);

if (problems.length > 0) {
  console.error('LICENSE CHECK FAILED:\n');
  for (const p of problems) {
    console.error(`  ✗ ${p.package} — ${p.license} — ${p.issue}`);
  }
  console.error(
    '\nFix: add the license to scripts/license-policy.json (allowed/allowedDev/needsApproval)',
  );
  console.error('or add the package to ignoredPackages if owner-approved.\n');
  process.exit(1);
} else {
  console.log('All dependency licenses are compliant. ✓\n');
}
