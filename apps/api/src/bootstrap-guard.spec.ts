import { assertNotMisconfiguredForProduction } from './bootstrap-guard';

// BL-005 / Architecture.md AR-13 (Foundation §19.3.2/§19.3.4): "if
// NODE_ENV==='production' and the bypass flag is true, crash on startup --
// no warning, no degraded mode." Extracted as a plain function (rather than
// inlined in main.ts, which vitest.config.ts excludes from coverage) so
// this is directly testable per §19.5's "must be directly invocable"
// convention, without spawning a real child process per CI run.
//
// Spies are created fresh (as `const`) inside each test rather than a
// shared outer-scope `let` -- letting TypeScript infer their type directly
// from `vi.spyOn(...)` avoids the loose/`any`-typed variable ESLint's
// `no-unsafe-*` rules correctly flag when the type is instead spelled out
// as `ReturnType<typeof vi.spyOn>`.
describe('assertNotMisconfiguredForProduction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits non-zero and logs a fatal error when production and the bypass flag are both set', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    assertNotMisconfiguredForProduction({
      NODE_ENV: 'production',
      ENABLE_TEST_BYPASS_HEADERS: 'true',
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('FATAL'));
  });

  it('does nothing under correctly-configured production (bypass flag unset)', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    assertNotMisconfiguredForProduction({ NODE_ENV: 'production' });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does nothing under test config with the bypass flag enabled', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    assertNotMisconfiguredForProduction({
      NODE_ENV: 'test',
      ENABLE_TEST_BYPASS_HEADERS: 'true',
    });

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('does nothing under production if the flag is set to something other than the literal string "true"', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    assertNotMisconfiguredForProduction({
      NODE_ENV: 'production',
      ENABLE_TEST_BYPASS_HEADERS: 'TRUE',
    });

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
