import { APP_GUARD } from '@nestjs/core';
import { TestBypassModule } from './test-bypass.module';
import { MockAuthGuard } from './mock-auth.guard';

// BL-005 / Architecture.md AR-13: Foundation §19.3.3 requires that in
// production the bypass guard is "never registered in the DI container --
// the code path must not exist," not merely disabled at runtime. Testing
// that structurally means asserting the *DynamicModule descriptor itself*
// carries no providers/imports under bad config -- there is nothing for
// Nest to ever construct, as opposed to a provider that exists but no-ops.
//
// register() reads process.env directly (resolved once at "bootstrap" --
// i.e. at module-graph-construction time, not per request), so these tests
// manipulate process.env directly rather than going through ConfigService.
describe('TestBypassModule.register', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('declares no providers or imports under production config, even with the bypass flag on', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_TEST_BYPASS_HEADERS = 'true';

    const dynamicModule = TestBypassModule.register();

    expect(dynamicModule.providers ?? []).toHaveLength(0);
    expect(dynamicModule.imports ?? []).toHaveLength(0);
  });

  it('declares no providers when the bypass flag is unset, even outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ENABLE_TEST_BYPASS_HEADERS;

    const dynamicModule = TestBypassModule.register();

    expect(dynamicModule.providers ?? []).toHaveLength(0);
  });

  it('declares no providers when the bypass flag is any value other than the literal string "true"', () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_TEST_BYPASS_HEADERS = 'yes';

    const dynamicModule = TestBypassModule.register();

    expect(dynamicModule.providers ?? []).toHaveLength(0);
  });

  it('registers MockAuthGuard as the global APP_GUARD when both bypass conditions hold', () => {
    process.env.NODE_ENV = 'test';
    process.env.ENABLE_TEST_BYPASS_HEADERS = 'true';

    const dynamicModule = TestBypassModule.register();

    expect(dynamicModule.providers).toContain(MockAuthGuard);
    const globalGuardProvider = dynamicModule.providers!.find(
      (p) => typeof p === 'object' && p !== null && 'provide' in p,
    ) as { provide: unknown; useExisting: unknown } | undefined;
    expect(globalGuardProvider?.provide).toBe(APP_GUARD);
    expect(globalGuardProvider?.useExisting).toBe(MockAuthGuard);
  });
});
