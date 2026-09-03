'use client';

import {
  MODERATION_REASON_MAX_LENGTH,
  MODERATION_REASON_PRESET_LABELS,
  type ModerationReasonPreset,
} from '@/lib/types';

// Foundation §11: every strike / ban / revoke / restore carries a mandatory
// reason -- a preset (which pre-fills an editable field), typed freehand, or
// both, capped at 500 chars, stored and emailed. The same control the photo
// moderation panel uses (ModerationDecisionPanel), pulled out so the User
// Account Audit view (BL-033) shares one implementation.

const PRESETS = Object.keys(
  MODERATION_REASON_PRESET_LABELS,
) as ModerationReasonPreset[];

export function ReasonFields({
  preset,
  text,
  onPreset,
  onText,
  disabled = false,
}: {
  preset: ModerationReasonPreset | '';
  text: string;
  onPreset: (next: ModerationReasonPreset | '') => void;
  onText: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="label-caps text-[9px] text-ink-faint">
          Reason preset
        </span>
        <select
          data-testid="accountability-reason-preset"
          value={preset}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value as ModerationReasonPreset | '';
            onPreset(next);
            // Pre-fill the editable field (Foundation §11), but only when it
            // is empty so an admin's own wording is never clobbered.
            if (next && next !== 'OTHER' && text.trim() === '') {
              onText(MODERATION_REASON_PRESET_LABELS[next]);
            }
          }}
          className="mt-1 w-full rounded-[8px] border-[1.5px] border-line-soft bg-surface px-2.5 py-2 text-[12px] text-ink"
        >
          <option value="">— none —</option>
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {MODERATION_REASON_PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="label-caps text-[9px] text-ink-faint">
          Reason text {preset === 'OTHER' ? '*' : '(emailed to the user)'}
        </span>
        <textarea
          data-testid="accountability-reason-text"
          value={text}
          disabled={disabled}
          onChange={(e) => onText(e.target.value)}
          maxLength={MODERATION_REASON_MAX_LENGTH}
          rows={2}
          className="mt-1 w-full rounded-[8px] border-[1.5px] border-line-soft bg-surface px-2.5 py-2 text-[12px] text-ink"
        />
        <span className="text-[10px] text-ink-faint">
          {text.length}/{MODERATION_REASON_MAX_LENGTH}
        </span>
      </label>
    </div>
  );
}
