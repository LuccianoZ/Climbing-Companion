'use client';

import { GRADE_SCALE_LABELS, type GradeScale } from '@/lib/grades';

// The YDS/FRA switch the mockups put in the detail panel header.
// Architecture.md AR-20: display-only, client state only. BL-046 (Sprint 3)
// is what binds it to `users.grade_display_pref`; nothing here reads or
// writes that column, and no request is made when it is toggled.
export function GradeScaleToggle({
  scale,
  onChange,
}: {
  scale: GradeScale;
  onChange: (next: GradeScale) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Grade scale"
      data-testid="grade-scale-toggle"
      className="flex items-center rounded-full border border-line bg-ink p-[2px]"
    >
      {(['YOSEMITE', 'FRENCH'] as const).map((option) => {
        const active = scale === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            data-testid={`grade-scale-${option.toLowerCase()}`}
            onClick={() => onChange(option)}
            className={[
              'rounded-full px-2.5 py-[3px] text-[10px] font-bold tracking-wide transition-colors',
              active ? 'bg-surface text-ink' : 'text-paper/70',
            ].join(' ')}
          >
            {GRADE_SCALE_LABELS[option]}
          </button>
        );
      })}
    </div>
  );
}
