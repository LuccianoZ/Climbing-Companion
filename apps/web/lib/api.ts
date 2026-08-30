import type {
  CragDetail,
  GymDetail,
  MapPin,
  MapSearchResult,
  PinDetail,
} from './types';

// next.config.ts rewrites /api/* to the NestJS app on :4000, so every
// request here is same-origin from the browser's point of view -- no CORS
// preflight, no NEXT_PUBLIC_API_URL to keep in sync across environments.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    signal,
    headers: { Accept: 'application/json' },
    // The map read surface is public (AR-19) but the same fetch helper will
    // be reused by Sprint 1's still-unbuilt authenticated screens, and the
    // session cookie is HTTP-only -- include it from the start rather than
    // discovering the omission later.
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ApiError(
      `${path} responded ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

// BL-019 / BL-020.
export function fetchMapPins(signal?: AbortSignal): Promise<MapPin[]> {
  return getJson<MapPin[]>('/api/map/pins', signal);
}

// BL-021. The panel's shape depends on what was clicked, so the pin's kind
// picks the endpoint; both responses carry a `kind` discriminator of their
// own so the component can narrow on the payload rather than remembering
// which request it made.
export function fetchPinDetail(
  kind: 'CRAG' | 'GYM',
  id: string,
  signal?: AbortSignal,
): Promise<PinDetail> {
  return kind === 'CRAG'
    ? getJson<CragDetail>(`/api/map/crags/${id}`, signal)
    : getJson<GymDetail>(`/api/map/gyms/${id}`, signal);
}

// BL-022. Our own database only -- Foundation §9/§18 rules out an external
// geocoder for the MVP, and there is deliberately no fallback provider
// here to reach for when this returns nothing.
export function searchMap(
  term: string,
  signal?: AbortSignal,
): Promise<MapSearchResult[]> {
  return getJson<MapSearchResult[]>(
    `/api/map/search?q=${encodeURIComponent(term)}`,
    signal,
  );
}
