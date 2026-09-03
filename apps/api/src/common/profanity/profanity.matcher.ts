import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

// BL-026 / Foundation §10: "an in-memory npm filter ... in the NestJS
// validation layer screens bios, reviews, and route/gym names. A match
// returns 400 Bad Request and aborts the transaction. Deterministic
// word/pattern matching, not an AI service."
//
// One module-level RegExpMatcher, built once from obscenity's English
// dataset + recommended transformers (leetspeak, spacing, etc). It is
// stateless and pure, so a singleton is safe to share across every request
// and every validator instance -- rebuilding it per DTO validation (the
// naive class-validator pattern) would recompile ~1600 patterns on every
// route/gym submission.
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Returns true if `text` contains profanity. Non-string / empty input is
// treated as clean -- presence/length validation is a separate concern owned
// by the other decorators on the same DTO field.
export function containsProfanity(text: unknown): boolean {
  if (typeof text !== 'string' || text.length === 0) {
    return false;
  }
  return matcher.hasMatch(text);
}
