// Foundation §19.3.2/§19.3.4 (BL-005, Architecture.md AR-13): resolved once
// at process startup, before any HTTP listener opens -- never per request.
// A leaked test-auth bypass in production is full account takeover, not a
// data-quality issue, so this crashes loudly (fatal log, non-zero exit)
// rather than degrading silently. Extracted as a plain function rather than
// inlined in main.ts (which vitest.config.ts excludes from coverage) so
// it's directly unit-testable, per §19.5's "must be directly invocable"
// convention applied to bootstrap-time checks as well as scheduled jobs.
export function assertNotMisconfiguredForProduction(env: {
  NODE_ENV?: string;
  ENABLE_TEST_BYPASS_HEADERS?: string;
}): void {
  if (
    env.NODE_ENV === 'production' &&
    env.ENABLE_TEST_BYPASS_HEADERS === 'true'
  ) {
    console.error(
      'FATAL: ENABLE_TEST_BYPASS_HEADERS=true is set alongside NODE_ENV=production. ' +
        'Refusing to start -- a leaked test-auth bypass in production is full account takeover.',
    );
    process.exit(1);
  }
}
