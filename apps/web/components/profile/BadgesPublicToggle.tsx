'use client';

// BL-x09 (AR-53, Sept 7 2026). Independent of the (not-yet-built, BL-047)
// photo-gallery privacy toggle: this gates only whether non-friends and
// Visitors can see the badge shelf. Friends and the owner always see it
// regardless of this setting. Mirrors GradeScaleToggle's segmented-control
// shape for visual consistency.
export function BadgesPublicToggle({
  badgesPublic,
  onChange,
  disabled,
}: {
  badgesPublic: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-small text-ink-soft">
        Show badges publicly
        <span className="block text-caption text-ink-faint">
          Friends can always see your badges either way.
        </span>
      </span>
      <div
        role="group"
        aria-label="Badge public visibility"
        data-testid="badges-public-toggle"
        className="flex items-center rounded-full border border-line bg-ink p-[2px]"
      >
        {([true, false] as const).map((option) => {
          const active = badgesPublic === option;
          return (
            <button
              key={String(option)}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              data-testid={`badges-public-${option ? 'on' : 'off'}`}
              onClick={() => onChange(option)}
              className={[
                'rounded-full px-2.5 py-[3px] text-caption font-bold tracking-wide transition-colors disabled:opacity-50',
                active ? 'bg-surface text-ink' : 'text-paper/70',
              ].join(' ')}
            >
              {option ? 'On' : 'Off'}
            </button>
          );
        })}
      </div>
    </div>
  );
}
