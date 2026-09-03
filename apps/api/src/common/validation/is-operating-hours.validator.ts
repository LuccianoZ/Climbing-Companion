import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type {
  OperatingHours,
  OperatingHoursRange,
} from '../../gyms/entities/gym.entity';

// Foundation Revision Sept 3 2026 (AR-51, BL-x04): the shape of
// `gyms.operating_hours` is enforced here at the DTO layer, not by the DB
// (the column is a plain `jsonb` -- same convention as grade ordinals being
// a bare `smallint`). The rules:
//
//   - the value is an object with exactly the seven keys "0".."6"
//     (0 = Sunday); a valid submission always carries all seven;
//   - each key maps to an array of ranges. An empty array means "closed
//     that day" -- valid, and the only way to say a day is closed;
//   - a range is { opens, closes, fullDay } where opens/closes are
//     "HH:MM" 24-hour strings;
//   - `closes` < `opens` is allowed and means the range runs past midnight
//     into the next day;
//   - `fullDay: true` means open 24 hours and requires opens === closes ===
//     "00:00"; `fullDay: false` requires opens !== closes (a zero-length
//     range is meaningless);
//   - multiple ranges in one day's array = a split shift. They must not
//     overlap, and must be given in chronological order by `opens`.

const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function isRange(value: unknown): value is OperatingHoursRange {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const r = value as Record<string, unknown>;
  return (
    typeof r.opens === 'string' &&
    typeof r.closes === 'string' &&
    typeof r.fullDay === 'boolean'
  );
}

function dayIsValid(ranges: unknown): string | null {
  if (!Array.isArray(ranges)) {
    return 'each day must map to an array of ranges';
  }
  // [] is a valid "closed" day.
  let previousOpen = -1;
  for (const range of ranges) {
    if (!isRange(range)) {
      return 'each range must be { opens: "HH:MM", closes: "HH:MM", fullDay: boolean }';
    }
    if (!HH_MM.test(range.opens) || !HH_MM.test(range.closes)) {
      return `"${range.opens}"/"${range.closes}" is not a valid 24-hour HH:MM time`;
    }

    if (range.fullDay) {
      if (range.opens !== '00:00' || range.closes !== '00:00') {
        return 'a fullDay (24-hour) range must use 00:00 for both opens and closes';
      }
      if (ranges.length !== 1) {
        return 'a fullDay (24-hour) range must be the only range that day';
      }
      continue;
    }

    if (range.opens === range.closes) {
      return 'opens and closes must differ unless fullDay is true';
    }

    const open = toMinutes(range.opens);
    // A split shift is ordered by opening time and must not overlap the
    // previous range. Overnight ranges (closes < opens) only make sense as
    // the last range of the day, so we compare on `opens` alone here.
    if (open <= previousOpen) {
      return 'split-shift ranges must be in chronological order and must not overlap';
    }
    previousOpen = open;
  }
  return null;
}

// Pure predicate -- also exported so a Cucumber step or another service can
// check a schedule without going through class-validator.
export function validateOperatingHours(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'operatingHours must be an object keyed by weekday';
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);

  const missing = DAY_KEYS.filter((k) => !(k in obj));
  if (missing.length > 0) {
    return `operatingHours is missing weekday key(s): ${missing.join(', ')} (all of "0".."6" are required)`;
  }
  const extra = keys.filter(
    (k) => !(DAY_KEYS as readonly string[]).includes(k),
  );
  if (extra.length > 0) {
    return `operatingHours has unexpected key(s): ${extra.join(', ')}`;
  }

  for (const key of DAY_KEYS) {
    const err = dayIsValid(obj[key]);
    if (err) {
      return `operatingHours["${key}"]: ${err}`;
    }
  }
  return null;
}

@ValidatorConstraint({ name: 'isOperatingHours', async: false })
export class IsOperatingHoursConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return validateOperatingHours(value) === null;
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      validateOperatingHours(args.value) ??
      'operatingHours is not a valid weekly schedule'
    );
  }
}

export function IsOperatingHours(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isOperatingHours',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsOperatingHoursConstraint,
    });
  };
}

// Re-exported for tests and callers that want the type without reaching
// into the entity file.
export type { OperatingHours, OperatingHoursRange };
