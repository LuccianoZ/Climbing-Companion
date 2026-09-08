'use client';

import { useState } from 'react';
import { createFriendInviteLink } from '@/lib/api';
import { messageFor } from '@/lib/errors';
import type { CreatedInviteLink } from '@/lib/types';

// BL-041 (AR-55): mint a single-use invite link and hand the climber the
// URL to send however they like. There is no in-app directory or DM, so
// "copy this and text it to them" is the whole flow. Each press generates a
// fresh link (a climber inviting three people makes three links).
export function InviteFriendCard() {
  const [link, setLink] = useState<CreatedInviteLink | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      setLink(await createFriendInviteLink());
    } catch (err) {
      setError(messageFor('CREATE_INVITE', err));
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context, permission) — the input below
      // is selectable, so the user can still copy by hand.
      setCopied(false);
    }
  }

  return (
    <div data-testid="invite-friend" className="space-y-2">
      <p className="text-[12px] leading-relaxed text-ink-soft">
        Send a friend a one-time invite link. When they open it while signed
        in, you&apos;re connected — no username needed.
      </p>

      <button
        type="button"
        data-testid="generate-invite"
        onClick={generate}
        disabled={pending}
        className="rounded-[8px] border-[1.5px] border-line bg-moss-wash px-3 py-1.5 text-[11px] font-bold text-moss-deep disabled:opacity-50"
      >
        {pending ? 'Generating…' : link ? 'Generate a new link' : 'Generate invite link'}
      </button>

      {error ? (
        <p
          data-testid="invite-error"
          className="rounded-[10px] border-[1.5px] border-clay-deep bg-clay-wash px-3 py-2 text-[12px] text-clay-deep"
        >
          {error}
        </p>
      ) : null}

      {link ? (
        <div className="space-y-1.5">
          <input
            data-testid="invite-url"
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-[8px] border-[1.5px] border-line bg-paper px-2.5 py-1.5 font-mono text-[11px] text-ink"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="copy-invite"
              onClick={copy}
              className="rounded-[8px] border-[1.5px] border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-ink-soft"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <span className="text-[10px] text-ink-faint">
              Expires{' '}
              {new Date(link.expiresAt).toLocaleDateString()} · one use
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
