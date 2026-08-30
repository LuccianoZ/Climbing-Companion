'use client';

import { useEffect, useRef, useState } from 'react';
import { CragIcon, GymIcon, SearchIcon } from '@/components/shell/icons';
import { searchMap } from '@/lib/api';
import type { MapSearchResult } from '@/lib/types';

// BL-022. Every result on this list came out of our own routes/crags/gyms
// tables (Foundation §9/§18 rules out an external geocoder for the MVP).
// There is no provider fallback, no "search the web instead" branch, and no
// third-party client imported anywhere in this file -- the absence is the
// requirement.

const DEBOUNCE_MS = 250;
const MIN_TERM_LENGTH = 2;

const KIND_LABELS: Record<MapSearchResult['kind'], string> = {
  ROUTE: 'Route',
  CRAG: 'Crag',
  GYM: 'Gym',
};

export function SearchBar({
  onSelect,
  autoFocus = false,
}: {
  onSelect: (result: MapSearchResult) => void;
  autoFocus?: boolean;
}) {
  const [term, setTerm] = useState('');
  // Results are stamped with the term they answer. Deriving "is this list
  // still relevant?" at render time is what lets the effect below avoid a
  // synchronous setState in its body (React 19's
  // react-hooks/set-state-in-effect) while still never showing a list that
  // belongs to a term the climber has already typed past.
  const [results, setResults] = useState<{
    term: string;
    items: MapSearchResult[];
    failed: boolean;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = term.trim();

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM_LENGTH) {
      return;
    }

    // Debounced, and every superseded request is aborted rather than left
    // to resolve out of order -- typing "wa" then "wall" must not end up
    // showing the "wa" results because they landed second.
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchMap(trimmed, controller.signal)
        .then((found) =>
          setResults({ term: trimmed, items: found, failed: false }),
        )
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          setResults({ term: trimmed, items: [], failed: true });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Only ever show a list that answers the term currently in the box, and
  // only until the climber picks something from it.
  const visible =
    results !== null &&
    results.term === trimmed &&
    trimmed.length >= MIN_TERM_LENGTH &&
    !dismissed;

  return (
    <div className="pointer-events-auto">
      <label className="flex items-center gap-2 rounded-[12px] border-[1.5px] border-line bg-surface px-3 py-2.5 shadow-[2px_2px_0_var(--color-line)]">
        <SearchIcon className="h-4 w-4 shrink-0 text-ink-soft" />
        <span className="sr-only">Search routes, crags and gyms</span>
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoFocus={autoFocus}
          data-testid="map-search-input"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setDismissed(false);
          }}
          placeholder="Search routes, crags, gyms"
          className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
        />
      </label>

      {visible ? (
        <ul
          data-testid="search-results"
          className="mt-2 max-h-64 overflow-y-auto rounded-[12px] border-[1.5px] border-line bg-surface"
        >
          {results.items.length === 0 ? (
            <li
              data-testid="search-empty"
              className="px-3 py-3 text-[12px] text-ink-faint"
            >
              {results.failed
                ? 'Search is unavailable right now.'
                : `Nothing in our database matches “${trimmed}”.`}
            </li>
          ) : (
            results.items.map((result) => (
              <li key={`${result.kind}-${result.id}`} className="border-b border-line-soft last:border-b-0">
                <button
                  type="button"
                  data-testid="search-result"
                  data-result-kind={result.kind}
                  data-result-name={result.name}
                  onClick={() => {
                    onSelect(result);
                    // Collapse the list once a destination is chosen; the
                    // term stays so the climber can retype from it.
                    setDismissed(true);
                    inputRef.current?.blur();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <span className="text-ink-soft">
                    {result.kind === 'GYM' ? (
                      <GymIcon className="h-4 w-4" />
                    ) : (
                      <CragIcon className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-ink">
                      {result.name}
                    </span>
                    <span className="label-caps block text-[8.5px] text-ink-faint">
                      {KIND_LABELS[result.kind]}
                      {result.status === 'UNVERIFIED' ? ' · Unverified' : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
