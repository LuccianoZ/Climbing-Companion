import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth.module';
import { MockAuthGuard } from './mock-auth.guard';
import { MockGpsGuard } from './mock-gps.guard';

// BL-005 / Architecture.md AR-13 (Foundation §19.3.1/§19.3.3): "resolve the
// bypass flag once at bootstrap, not per request" and "in production the
// test guards are never registered in the DI container -- the code path
// must not exist." register() is called synchronously as part of
// AppModule's `imports` array (module-graph construction, not a per-request
// check), and it reads `process.env` directly rather than an injected
// ConfigService for the same reason: this decision has to be made *before*
// Nest's DI container exists to inject anything into.
//
// When the conditions don't hold, this returns a module with *no providers
// and no imports at all* -- neither guard is ever instantiated, never
// registered as APP_GUARD, never reachable by any request, in any
// environment other than NODE_ENV !== 'production' with
// ENABLE_TEST_BYPASS_HEADERS explicitly set to 'true'. If AppModule's
// import order ever changed such that this ran before ConfigModule.forRoot()
// populated process.env from .env.test, the failure mode is still safe: an
// unresolved env var reads as undefined, which fails the check and disables
// the bypass -- never the reverse.
//
// BL-009 / Architecture.md AR-16: MockGpsGuard (the GPS-mock equivalent of
// MockAuthGuard, for X-Test-Mock-GPS) is registered here alongside
// MockAuthGuard under the exact same gate -- APP_GUARD is a multi-provider
// token, so both run as global guards on every request without conflict.
@Module({})
export class TestBypassModule {
  static register(): DynamicModule {
    const bypassEnabled =
      process.env.NODE_ENV !== 'production' &&
      process.env.ENABLE_TEST_BYPASS_HEADERS === 'true';

    if (!bypassEnabled) {
      return { module: TestBypassModule };
    }

    return {
      module: TestBypassModule,
      imports: [AuthModule],
      providers: [
        MockAuthGuard,
        MockGpsGuard,
        { provide: APP_GUARD, useExisting: MockAuthGuard },
        { provide: APP_GUARD, useExisting: MockGpsGuard },
      ],
    };
  }
}
