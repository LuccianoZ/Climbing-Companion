import { validateOperatingHours } from './is-operating-hours.validator';

// A well-formed 7-day schedule: closed Sunday, normal hours Mon-Thu, a
// split shift Friday, 24h Saturday.
const validWeek = {
  '0': [],
  '1': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '2': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '3': [{ opens: '06:00', closes: '22:00', fullDay: false }],
  '4': [{ opens: '06:00', closes: '23:00', fullDay: false }],
  '5': [
    { opens: '06:00', closes: '12:00', fullDay: false },
    { opens: '16:00', closes: '02:00', fullDay: false }, // overnight close
  ],
  '6': [{ opens: '00:00', closes: '00:00', fullDay: true }],
};

describe('validateOperatingHours', () => {
  it('accepts a well-formed 7-day schedule (closed / normal / split / overnight / 24h)', () => {
    expect(validateOperatingHours(validWeek)).toBeNull();
  });

  it('rejects a non-object', () => {
    expect(validateOperatingHours(null)).toMatch(/object keyed by weekday/);
    expect(validateOperatingHours([])).toMatch(/object keyed by weekday/);
  });

  it('rejects a schedule missing a weekday key', () => {
    const { '3': _omit, ...missingWednesday } = validWeek;
    void _omit;
    expect(validateOperatingHours(missingWednesday)).toMatch(
      /missing weekday key/,
    );
  });

  it('rejects an unexpected key', () => {
    expect(validateOperatingHours({ ...validWeek, '7': [] })).toMatch(
      /unexpected key/,
    );
  });

  it('rejects a day that is not an array', () => {
    expect(
      validateOperatingHours({ ...validWeek, '2': { opens: '06:00' } }),
    ).toMatch(/array of ranges/);
  });

  it('rejects a malformed time string', () => {
    expect(
      validateOperatingHours({
        ...validWeek,
        '1': [{ opens: '6:00', closes: '22:00', fullDay: false }],
      }),
    ).toMatch(/not a valid 24-hour HH:MM/);
    expect(
      validateOperatingHours({
        ...validWeek,
        '1': [{ opens: '25:00', closes: '22:00', fullDay: false }],
      }),
    ).toMatch(/not a valid 24-hour HH:MM/);
  });

  it('rejects fullDay with non-midnight bounds', () => {
    expect(
      validateOperatingHours({
        ...validWeek,
        '6': [{ opens: '06:00', closes: '00:00', fullDay: true }],
      }),
    ).toMatch(/must use 00:00 for both/);
  });

  it('rejects fullDay combined with another range', () => {
    expect(
      validateOperatingHours({
        ...validWeek,
        '6': [
          { opens: '00:00', closes: '00:00', fullDay: true },
          { opens: '10:00', closes: '12:00', fullDay: false },
        ],
      }),
    ).toMatch(/must be the only range/);
  });

  it('rejects a zero-length non-fullDay range', () => {
    expect(
      validateOperatingHours({
        ...validWeek,
        '1': [{ opens: '08:00', closes: '08:00', fullDay: false }],
      }),
    ).toMatch(/must differ unless fullDay/);
  });

  it('rejects out-of-order / overlapping split shifts', () => {
    expect(
      validateOperatingHours({
        ...validWeek,
        '5': [
          { opens: '16:00', closes: '20:00', fullDay: false },
          { opens: '06:00', closes: '12:00', fullDay: false },
        ],
      }),
    ).toMatch(/chronological order/);
  });
});
