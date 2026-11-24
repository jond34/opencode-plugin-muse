import { describe, expect, test } from "bun:test";
import { summarizeJunit } from "../scripts/junit-summary.js";

/**
 * B1: the snapshot must count skipped and failed cases, not just the declared
 * total. These are inline fixtures because the real artifacts expire.
 */

const clean = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" assertions="8" failures="0" skipped="0">
  <testsuite name="one" file="test\\one.test.ts" tests="2" assertions="5" failures="0" skipped="0"/>
  <testsuite name="two" file="test/two.test.ts" tests="1" assertions="3" failures="0" skipped="0"/>
</testsuites>`;

const skipped = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="4" assertions="9" failures="0" skipped="1">
  <testsuite name="one" file="test/one.test.ts" tests="4" assertions="9" failures="0" skipped="1">
    <testsuite name="nested" file="test/one.test.ts" tests="4" assertions="9" failures="0" skipped="1"/>
  </testsuite>
</testsuites>`;

const failed = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="2" assertions="4" failures="1" skipped="0">
  <testsuite name="one" file="test/one.test.ts" tests="2" assertions="4" failures="1" skipped="0"/>
</testsuites>`;

describe("JUnit summary", () => {
  test("counts a clean file and normalizes Windows paths", () => {
    const frame = summarizeJunit(clean);
    expect(frame.tests).toBe(3);
    expect(frame.assertions).toBe(8);
    expect(frame.failures).toBe(0);
    expect(frame.skipped).toBe(0);
    expect(frame.suites.map((suite) => suite.file)).toEqual([
      "test/one.test.ts",
      "test/two.test.ts",
    ]);
  });

  test("counts a skip, and counts the file once despite nested suites", () => {
    const frame = summarizeJunit(skipped);
    expect(frame.tests).toBe(4);
    expect(frame.skipped).toBe(1);
    expect(frame.suites).toHaveLength(1);
  });

  test("counts a failure", () => {
    const frame = summarizeJunit(failed);
    expect(frame.failures).toBe(1);
  });

  test("a frame with no root attributes is zeros, not NaN", () => {
    const frame = summarizeJunit("<testsuites><testsuite file=\"test/a.test.ts\"/></testsuites>");
    expect(frame.tests).toBe(0);
    expect(frame.failures).toBe(0);
    expect(frame.skipped).toBe(0);
  });
});
