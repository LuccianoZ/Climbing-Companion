'use client';

import {
  WEEKDAY_LABELS,
  type OperatingHours,
  type OperatingHoursRange,
} from '@/lib/types';

// AR-51 BL-x04: the seven-day hours editor. Every gym submission carries all
// seven weekday keys ("0".."6", 0 = Sunday). Each day is one of three modes:
//
//   * Closed   -> []
//   * 24 hours -> [{ opens: "00:00", closes: "00:00", fullDay: true }]
//   * Open     -> one or more { opens, closes, fullDay:false } ranges;
//                 `closes` < `opens` is a past-midnight range, multiple
//                 ranges are a split shift.
//
// The server's @IsOperatingHours() decorator is authoritative; this editor's
// job is to make an invalid shape hard to build in the first place.

const DEFAULT_RANGE: OperatingHoursRange = {
  opens: '09:00',
  closes: '21:00',
  fullDay: false,
};

export function defaultOperatingHours(): OperatingHours {
  const week: OperatingHours = {};
  for (let day = 0; day < 7; day += 1) {
    week[String(day)] = [{ ...DEFAULT_RANGE }];
  }
  return week;
}

type DayMode = 'CLOSED' | 'FULL_DAY' | 'OPEN';

function modeOf(ranges: OperatingHoursRange[]): DayMode {
  if (ranges.length === 0) return 'CLOSED';
  if (ranges.length === 1 && ranges[0].fullDay) return 'FULL_DAY';
  return 'OPEN';
}

export function OperatingHoursEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: OperatingHours;
  onChange: (next: OperatingHours) => void;
  disabled?: boolean;
}) {
  function setDay(day: number, ranges: OperatingHoursRange[]) {
    onChange({ ...value, [String(day)]: ranges });
  }

  function setMode(day: number, mode: DayMode) {
    if (mode === 'CLOSED') setDay(day, []);
    else if (mode === 'FULL_DAY')
      setDay(day, [{ opens: '00:00', closes: '00:00', fullDay: true }]);
    else setDay(day, [{ ...DEFAULT_RANGE }]);
  }

  return (
    <fieldset className="space-y-2" data-testid="operating-hours">
      <legend className="label-caps text-[9.5px] text-ink-faint">
        Operating hours * (all seven days)
      </legend>

      <div className="space-y-2">
        {WEEKDAY_LABELS.map((label, day) => {
          const ranges = value[String(day)] ?? [];
          const mode = modeOf(ranges);

          return (
            <div
              key={day}
              data-testid={`hours-day-${day}`}
              data-mode={mode}
              className="rounded-[10px] border-[1.5px] border-line-soft bg-surface p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-ink">{label}</span>
                <div
                  role="group"
                  aria-label={`${label} mode`}
                  className="flex gap-1"
                >
                  {(['OPEN', 'FULL_DAY', 'CLOSED'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      data-testid={`hours-mode-${day}-${m}`}
                      disabled={disabled}
                      onClick={() => setMode(day, m)}
                      className={[
                        'rounded-[7px] border px-2 py-1 text-[9.5px] font-bold uppercase tracking-wide',
                        mode === m
                          ? 'border-ink bg-ink text-paper'
                          : 'border-line-soft bg-surface text-ink-soft',
                      ].join(' ')}
                    >
                      {m === 'FULL_DAY' ? '24h' : m === 'OPEN' ? 'Open' : 'Closed'}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'OPEN' ? (
                <div className="mt-2 space-y-1.5">
                  {ranges.map((range, index) => (
                    <div
                      key={index}
                      data-testid={`hours-range-${day}-${index}`}
                      className="flex items-center gap-1.5 text-[11px]"
                    >
                      <input
                        type="time"
                        aria-label={`${label} range ${index + 1} opens`}
                        value={range.opens}
                        disabled={disabled}
                        onChange={(e) =>
                          setDay(
                            day,
                            ranges.map((r, i) =>
                              i === index ? { ...r, opens: e.target.value } : r,
                            ),
                          )
                        }
                        className="rounded-[7px] border-[1.5px] border-line bg-surface px-1.5 py-1 text-ink"
                      />
                      <span className="text-ink-faint">to</span>
                      <input
                        type="time"
                        aria-label={`${label} range ${index + 1} closes`}
                        value={range.closes}
                        disabled={disabled}
                        onChange={(e) =>
                          setDay(
                            day,
                            ranges.map((r, i) =>
                              i === index ? { ...r, closes: e.target.value } : r,
                            ),
                          )
                        }
                        className="rounded-[7px] border-[1.5px] border-line bg-surface px-1.5 py-1 text-ink"
                      />
                      {ranges.length > 1 ? (
                        <button
                          type="button"
                          aria-label={`Remove ${label} shift ${index + 1}`}
                          disabled={disabled}
                          onClick={() =>
                            setDay(
                              day,
                              ranges.filter((_, i) => i !== index),
                            )
                          }
                          className="rounded-full border border-line-soft px-1.5 text-[10px] text-ink-soft"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    data-testid={`hours-add-shift-${day}`}
                    disabled={disabled}
                    onClick={() =>
                      setDay(day, [
                        ...ranges,
                        { opens: '17:00', closes: '21:00', fullDay: false },
                      ])
                    }
                    className="text-[10px] font-semibold text-clay-deep"
                  >
                    + split shift
                  </button>
                  {ranges.some((r) => r.closes < r.opens) ? (
                    <p className="text-[9.5px] text-ink-faint">
                      A closing time earlier than the opening time means the
                      range runs past midnight.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
