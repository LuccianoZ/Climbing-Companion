'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { searchMap } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import type { MapSearchResult } from '@/lib/types';

// AR-51 BL-x07 (admin data stewardship): search a gym or climb by name, then
// open it to edit any field or take it off the map. Reuses the same
// name-search endpoint the map uses (/api/map/search, our own DB only) --
// crag results are dropped here since a crag is not independently editable
// (its state is its founding route's).

export function StewardshipSearch() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<MapSearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = term.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const rows = await searchMap(q);
      setResults(rows.filter((r) => r.kind === 'GYM' || r.kind === 'ROUTE'));
    } catch (err) {
      setError(messageFor('ADMIN_READ', err));
      setResults(null);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <form onSubmit={onSearch} data-testid="stewardship-search" className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search a gym or climb by name…"
          data-testid="stewardship-search-input"
          className="min-w-0 flex-1 rounded-[8px] border-[1.5px] border-line bg-surface px-3 py-2 text-[13px] text-ink"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-[8px] border-[1.5px] border-ink bg-ink px-4 py-2 text-[12px] font-bold text-paper disabled:opacity-45"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? (
        <p
          data-testid="stewardship-search-error"
          className="rounded-[8px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2 text-[12px] text-clay-deep"
        >
          {error}
        </p>
      ) : null}

      {results && results.length === 0 ? (
        <p
          data-testid="stewardship-search-empty"
          className="rounded-[8px] border-[1.5px] border-line bg-surface px-3 py-3 text-[12px] text-ink-soft"
        >
          No gym or climb matches &ldquo;{term.trim()}&rdquo;. Archived entities
          do not appear in search — open one by its id if you know it.
        </p>
      ) : null}

      {results && results.length > 0 ? (
        <ul data-testid="stewardship-results" className="space-y-2">
          {results.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link
                href={`/admin/stewardship/${row.kind.toLowerCase()}/${row.id}`}
                data-testid="stewardship-result"
                data-kind={row.kind}
                className="card flex items-center justify-between gap-3 p-3 hover:bg-paper"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-ink">
                    {row.name}
                  </p>
                  <p className="font-mono text-[10px] text-ink-faint">
                    {row.kind} · {row.latitude.toFixed(4)},{' '}
                    {row.longitude.toFixed(4)}
                  </p>
                </div>
                <span
                  className={[
                    'shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold italic',
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

      <p className="text-[10.5px] text-ink-faint">
        Editing takes effect immediately after you confirm. Deleting is
        permanent and requires typing DELETE; archiving is reversible.
      </p>
    </div>
  );
}
