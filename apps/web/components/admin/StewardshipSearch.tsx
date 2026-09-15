'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { searchMap } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import type { MapSearchResult } from '@/lib/types';

// AR-51 BL-x07 (admin data stewardship): search a gym or climb by name, then
// open it to edit any field or take it off the map. Reuses the same
// name-search endpoint the map uses (/api/map/search, our own DB only) --
// crag results are dropped here since a crag is not independently editable
// (its state is its founding route's).
//
// Results load as the admin types, matching the map's SearchBar: same
// debounce, same abort-the-superseded-request rule, and the same trick of
// stamping each result set with the term it answers so relevance is derived
// at render time rather than set synchronously from the effect.
//
// That stamp is also a bug fix. Results used to be replaced only on submit,
// so typing a new term left the previous term's rows on screen -- searching
// "Central", then typing "Mag" without pressing Search, showed "Central Rock
// Buffalo" as though it matched "Mag". A list that cannot outlive its own
// term cannot do that.

const DEBOUNCE_MS = 250;
const MIN_TERM_LENGTH = 2;

export function StewardshipSearch() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<{
    term: string;
    items: MapSearchResult[];
    error: string | null;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const trimmed = term.trim();

  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM_LENGTH) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchMap(trimmed, controller.signal)
        .then((rows) => {
          setResults({
            term: trimmed,
            // A crag is not independently editable, so it is not an option
            // here even though the shared endpoint returns one.
            items: rows.filter((r) => r.kind === 'GYM' || r.kind === 'ROUTE'),
            error: null,
          });
          setSearching(false);
        })
        .catch((error: unknown) => {
          // An aborted request was superseded by a newer keystroke -- it is
          // not a failure, and its `finally` must not clear the spinner the
          // request that replaced it just set.
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          setResults({
            term: trimmed,
            items: [],
            error: messageFor('ADMIN_READ', error),
          });
          setSearching(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  // Submitting is now a no-op beyond dismissing the keyboard: the list is
  // already live. Kept so Enter does not reload the page.
  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  // Only ever render a list that answers the term currently in the box.
  const current = results !== null && results.term === trimmed ? results : null;
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_TERM_LENGTH;

  return (
    <div className="max-w-3xl space-y-4">
      <form onSubmit={onSearch} data-testid="stewardship-search" className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search a gym or climb by name…"
          data-testid="stewardship-search-input"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-control border border-line bg-surface px-3 py-2 text-small text-ink"
        />
        <span
          data-testid="stewardship-search-status"
          className="flex w-24 shrink-0 items-center justify-center text-caption text-ink-faint"
        >
          {searching ? 'Searching…' : null}
        </span>
      </form>

      {tooShort ? (
        <p className="text-caption text-ink-faint">
          Keep typing — at least {MIN_TERM_LENGTH} characters.
        </p>
      ) : null}

      {current?.error ? (
        <p
          data-testid="stewardship-search-error"
          className="rounded-control border border-clay-deep bg-clay-wash px-3 py-2 text-small text-clay-deep"
        >
          {current.error}
        </p>
      ) : null}

      {current && !current.error && current.items.length === 0 ? (
        <p
          data-testid="stewardship-search-empty"
          className="rounded-control border border-line bg-surface px-3 py-3 text-small text-ink-soft"
        >
          No gym or climb matches &ldquo;{trimmed}&rdquo;. Archived entities do
          not appear in search — open one by its id if you know it.
        </p>
      ) : null}

      {current && current.items.length > 0 ? (
        <ul data-testid="stewardship-results" className="space-y-2">
          {current.items.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                href={`/admin/stewardship/${row.kind.toLowerCase()}/${row.id}`}
                data-testid="stewardship-result"
                data-kind={row.kind}
                className="card flex items-center justify-between gap-3 p-3 hover:bg-paper"
              >
                <div className="min-w-0">
                  <p className="truncate text-small font-bold text-ink">
                    {row.name}
                  </p>
                  <p className="font-mono text-caption text-ink-faint">
                    {row.kind} · {row.latitude.toFixed(4)},{' '}
                    {row.longitude.toFixed(4)}
                  </p>
                </div>
                <span
                  className={[
                    'shrink-0 rounded-full border px-2 py-0.5 text-caption font-semibold italic',
                    row.status === 'VERIFIED'
                      ? 'border-moss-deep bg-moss-wash text-moss-deep'
                      : 'border-line-soft bg-paper text-ink-soft',
                  ].join(' ')}
                >
                  {row.status === 'VERIFIED' ? 'Verified' : 'Unverified'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-caption text-ink-faint">
        Editing takes effect immediately after you confirm. Deleting is
        permanent and requires typing DELETE; archiving is reversible.
      </p>
    </div>
  );
}
