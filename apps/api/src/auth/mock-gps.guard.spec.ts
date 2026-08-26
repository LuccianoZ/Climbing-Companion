import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { MockGpsGuard } from './mock-gps.guard';

// BL-009 / Architecture.md AR-16: MockGpsGuard is the X-Test-Mock-GPS
// bypass, the GPS-mock equivalent of MockAuthGuard (mock-auth.guard.spec.ts
// covers the same shape for auth). It is a global guard, so like
// MockAuthGuard it must never *block* a request on its own when the header
// is simply absent -- its job is to get out of the way and let a real
// latitude/longitude in the request body (or nothing, for routes that
// don't need location) stand.
describe('MockGpsGuard', () => {
  let guard: MockGpsGuard;

  const contextFor = (
    request: Record<string, unknown> & { headers: Record<string, string> },
  ): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    guard = new MockGpsGuard();
  });

  it('passes through untouched when the header is absent', () => {
    const request = { headers: {} };

    const result = guard.canActivate(contextFor(request));

    expect(result).toBe(true);
    expect(request).not.toHaveProperty('mockGps');
  });

  it('attaches the parsed location and passes when the header carries "<lat>,<lng>"', () => {
    const request: { headers: Record<string, string>; mockGps?: unknown } = {
      headers: { 'x-test-mock-gps': '42.8864,-78.8784' },
    };

    const result = guard.canActivate(contextFor(request));

    expect(result).toBe(true);
    expect(request.mockGps).toEqual({ latitude: 42.8864, longitude: -78.8784 });
  });

  it('tolerates surrounding whitespace around the comma-separated pair', () => {
    const request: { headers: Record<string, string>; mockGps?: unknown } = {
      headers: { 'x-test-mock-gps': ' 42.8864 , -78.8784 ' },
    };

    guard.canActivate(contextFor(request));

    expect(request.mockGps).toEqual({ latitude: 42.8864, longitude: -78.8784 });
  });

  it('rejects a malformed header value', () => {
    const request = { headers: { 'x-test-mock-gps': 'not-a-coordinate' } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      BadRequestException,
    );
  });

  it('rejects a header with only one coordinate', () => {
    const request = { headers: { 'x-test-mock-gps': '42.8864' } };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      BadRequestException,
    );
  });
});
