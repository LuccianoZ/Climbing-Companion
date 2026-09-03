import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { containsProfanity } from './profanity.matcher';
import { IsCleanText } from './is-clean-text.validator';

class Sample {
  @IsCleanText()
  name!: string;
}

describe('containsProfanity', () => {
  it('passes ordinary climbing text', () => {
    expect(containsProfanity('The Great Wall — Sport Climbing')).toBe(false);
    expect(containsProfanity('Higher Ground')).toBe(false);
  });

  it('flags an obvious slur/expletive', () => {
    expect(containsProfanity('you are a shit climber')).toBe(true);
  });

  it('flags a leetspeak-obfuscated match (recommended transformers)', () => {
    expect(containsProfanity('sh1t route')).toBe(true);
  });

  it('treats non-string / empty input as clean', () => {
    expect(containsProfanity(undefined)).toBe(false);
    expect(containsProfanity('')).toBe(false);
    expect(containsProfanity(42)).toBe(false);
  });
});

describe('IsCleanText decorator', () => {
  it('produces no error for clean text', async () => {
    const errors = await validate(
      plainToInstance(Sample, { name: 'Solar Power' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('produces a validation error for profane text', async () => {
    const errors = await validate(
      plainToInstance(Sample, { name: 'shit crag' }),
    );
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
