// Unit tests of the JavaScript state module, driven by tests/state-cases.json.
// Run with: node tests/unit/state-test.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const casesPath = fileURLToPath(new URL('../state-cases.json', import.meta.url));
const modulePath = fileURLToPath(new URL('../../_extensions/veil/veil-state.js', import.meta.url));

const context = { window: {} };
vm.createContext(context);
vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
const State = context.window.VeilState;
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));

const sameList = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);

function runCase(testCase) {
  const failures = [];
  const [resolved, warnings] = State.initial(testCase.groups);
  const initialText = State.format(resolved);
  if (initialText !== testCase.initial.text) {
    failures.push(`initial: expected "${testCase.initial.text}", got "${initialText}"`);
  }
  if (warnings.length !== testCase.initial.warnings) {
    failures.push(`initial: expected ${testCase.initial.warnings} warnings, got ${warnings.length}`);
  }
  for (const item of testCase.apply) {
    const [result, unknown] = State.apply(resolved, item.input);
    const text = State.format(result);
    if (text !== item.text) {
      failures.push(`apply("${item.input}"): expected "${item.text}", got "${text}"`);
    }
    if (!sameList(unknown, item.unknown)) {
      failures.push(`apply("${item.input}"): unknown tokens ${JSON.stringify(unknown)}, expected ${JSON.stringify(item.unknown)}`);
    }
  }
  for (const item of testCase.visible) {
    const got = State.visible(resolved, item.names);
    if (got !== item.expected) {
      failures.push(`visible([${item.names}]): expected ${item.expected}, got ${got}`);
    }
  }
  for (const item of testCase.previous ?? []) {
    const got = State.previousLevel(resolved, item.level);
    if (got !== item.expected) {
      failures.push(`previousLevel(${item.level}): expected ${item.expected}, got ${got}`);
    }
  }
  for (const item of testCase.step) {
    const [start] = State.apply(resolved, item.from);
    const text = State.format(State.step(start, item.direction));
    if (text !== item.text) {
      failures.push(`step(${item.from}, ${item.direction}): expected "${item.text}", got "${text}"`);
    }
  }
  return failures;
}

console.log('TAP version 13');
console.log(`1..${cases.length}`);
let failed = 0;
cases.forEach((testCase, index) => {
  let failures;
  try {
    failures = runCase(testCase);
  } catch (error) {
    failures = [String(error)];
  }
  if (failures.length === 0) {
    console.log(`ok ${index + 1} - ${testCase.name}`);
  } else {
    failed += 1;
    console.log(`not ok ${index + 1} - ${testCase.name}`);
    failures.forEach((message) => console.log(`  # ${message}`));
  }
});
process.exit(failed === 0 ? 0 : 1);
