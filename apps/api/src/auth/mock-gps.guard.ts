import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const MOCK_GPS_HEADER = 'x-test-mock-gps';

export interface MockGpsLocation {
  latitude: number;
  longitude: number;
}

export type RequestWithOptionalMockGps = Request & {
  mockGps?: MockGpsLocation;
};

// BL-009 / Architecture.md AR-16: the GPS-mock equivalent of MockAuthGuard
// (mock-auth.guard.ts, AR-13) -- the "spatial epic" AR-13 flagged as not
// existing yet. Mirrors its exact fail-closed shape: this class is only
// ever constructed, let alone registered as a guard, once
// TestBypassModule.register() has already confirmed both bypass conditions
// (NODE_ENV !== 'production' AND ENABLE_TEST_BYPASS_HEADERS === 'true') at
// bootstrap (§19.3.1/§19.3.3) -- never registered, never reachable, outside
// that exact configuration.
//
// Registered as a *global* guard alongside MockAuthGuard, so it runs on
// every request when the bypass is enabled. Its only job when the header
// is absent is to get out of the way: a real (non-test) request supplies
// the verifier's location as latitude/longitude fields in the request body
// instead (populated client-side from the browser's Geolocation API, per
// Foundation's demo-day note), and the calling controller/service resolves
// exactly one location regardless of which source provided it -- this
// guard is a test-only substitute for that same signal, not a separate
// code path in VerificationService.
@Injectable()
export class MockGpsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithOptionalMockGps>();
    const raw = (request.headers as Record<string, string> | undefined)?.[
      MOCK_GPS_HEADER
    ];

    if (!raw) {
      return true;
    }

    const parts = raw.split(',').map((p) => p.trim());
    const [latitude, longitude] = parts.map(Number);
    if (
      parts.length !== 2 ||
      Number.isNaN(latitude) ||
      Number.isNaN(longitude)
    ) {
      throw new BadRequestException(
        `X-Test-Mock-GPS: expected "<lat>,<lng>", got "${raw}"`,
      );
    }

    request.mockGps = { latitude, longitude };
    return true;
  }
}
