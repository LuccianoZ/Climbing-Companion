'use client';

// BL-028 / Foundation §12: a banned account is "locked out — reasoning
// arrives by email". There is no in-app notification for a ban and nothing
// for the user to do here except read that email or contact support
// (Foundation §13's static address). This is the "Account Suspended" state
// from the 4-screen mockup: a lock, one sentence, and a Contact Support
// button — no navigation, because every guarded screen is now closed to them.

const SUPPORT_EMAIL = 'support@climbingcompanion.com';

export function SuspendedNotice() {
  return (
    <div
      data-testid="account-suspended"
      className="mx-auto flex min-h-full w-full max-w-[430px] flex-col items-center justify-center gap-5 border-line-soft bg-paper px-8 py-16 text-center sm:border-x"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full border-[1.5px] border-clay-deep bg-clay-wash">
        <LockIcon className="h-9 w-9 text-clay-deep" />
      </div>

      <div className="space-y-2">
        <h1 className="text-[19px] font-bold tracking-tight text-ink">
          Account suspended
        </h1>
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          This account has been suspended after reaching the moderation strike
          threshold. The reasoning was sent to your email address.
        </p>
      </div>

      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        data-testid="account-suspended-support"
        className="rounded-[10px] border-[1.5px] border-ink bg-ink px-4 py-2.5 text-[12.5px] font-bold text-paper"
      >
        Contact support
      </a>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
