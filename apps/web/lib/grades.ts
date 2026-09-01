// BL-046 pulled forward, minimally -- Architecture.md AR-20.
//
// Grades are stored as bare `smallint` ordinals (Architecture §1/§3): the
// database never records which scale a number is "in". Rendering one as
// text therefore needs a mapping, and BL-021's detail panel is the first
// thing in the codebase that has to render one at all. Foundation §3 says
// the Yosemite<->French display preference is a persisted user setting
// (`users.grade_display_pref`, default YOSEMITE) delivered by BL-046 in
// Sprint 3.
//
// What ships here is the display half only: the ordinal->label tables and a
// client-side toggle. Nothing persists, nothing calls the API, and no
// column is read or written -- BL-046 remains an open story whose whole
// remaining job is to bind this toggle to `users.grade_display_pref`. The
// alternative (hardcode Yosemite now) was rejected because the approved
// mockups put the YDS/FRA switch directly in the panel header, so the
// component would be built twice and the header re-laid-out in Sprint 3.

import type { OutdoorDiscipline } from './types';

export type GradeScale = 'YOSEMITE' | 'FRENCH';

// Rope-scale ordinals 0-31 (Architecture §1). Index is the ordinal.
const ROPE_YOSEMITE = [
  '5.0', '5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7',
  '5.8', '5.9', '5.10a', '5.10b', '5.10c', '5.10d', '5.11a', '5.11b',
  '5.11c', '5.11d', '5.12a', '5.12b', '5.12c', '5.12d', '5.13a', '5.13b',
  '5.13c', '5.13d', '5.14a', '5.14b', '5.14c', '5.14d', '5.15a', '5.15b',
];

const ROPE_FRENCH = [
  '1', '2', '3', '4a', '4b', '4c', '5a', '5b',
  '5c', '6a', '6a+', '6b', '6b+', '6c', '6c+', '7a',
  '7a+', '7b', '7b+', '7c', '7c+', '8a', '8a+', '8b',
  '8b+', '8c', '8c+', '9a', '9a+', '9b', '9b+', '9c',
];

// V-scale ordinals 0-18 (Architecture §1). Bouldering has no French
// equivalent in common use for the MVP's purposes -- the Fontainebleau
// scale is a separate system, not a translation of the V-scale -- so the
// toggle deliberately leaves boulder grades alone rather than inventing a
// mapping. Flagged in AR-20 as the one place the toggle is a no-op.
const BOULDER_V = [
  'V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9',
  'V10', 'V11', 'V12', 'V13', 'V14', 'V15', 'V16', 'V17', 'V18',
];

export function isBoulderDiscipline(discipline: OutdoorDiscipline): boolean {
  return discipline === 'BOULDERING';
}

// Renders an ordinal for display. Out-of-range ordinals fall back to a
// visible `?` rather than throwing or rendering `undefined` -- a bad
// ordinal is a data problem, and a panel that still opens is easier to
// diagnose than one that crashes on render.
export function formatGrade(
  ordinal: number,
  discipline: OutdoorDiscipline,
  scale: GradeScale,
): string {
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    return '?';
  }
  if (isBoulderDiscipline(discipline)) {
    return BOULDER_V[ordinal] ?? '?';
  }
  const table = scale === 'FRENCH' ? ROPE_FRENCH : ROPE_YOSEMITE;
  return table[ordinal] ?? '?';
}

export const GRADE_SCALE_LABELS: Record<GradeScale, string> = {
  YOSEMITE: 'YDS',
  FRENCH: 'FRA',
};

// --- grade pickers (Sprint 1/2 frontend backfill) --------------------------

export interface GradeOption {
  ordinal: number;
  label: string;
}

// The set of ordinals a *form* should offer, which is narrower than what the
// DTOs accept. SubmitRouteDto, SubmitRouteVerificationDto and VoteOnGradeDto
// all validate a flat 0-31 regardless of discipline (AR-18 records that as a
// deliberate, accepted convention on the API side, since neither DTO is
// discipline-aware). A dropdown is: it knows the route's discipline, so
// offering V19-V31 on a boulder problem -- ordinals the V-scale has no label
// for, which formatGrade renders as "?" -- would be offering nonsense the
// server would happily store.
//
// So the picker is clamped to the real scale: 0-18 for bouldering, 0-31 for
// rope. Recorded as AR-35 rather than left implicit, because it is a place
// where the client is deliberately stricter than the API.
export function gradeOptions(
  discipline: OutdoorDiscipline,
  scale: GradeScale,
): GradeOption[] {
  const count = isBoulderDiscipline(discipline) ? BOULDER_V.length : ROPE_YOSEMITE.length;
  return Array.from({ length: count }, (_, ordinal) => ({
    ordinal,
    label: formatGrade(ordinal, discipline, scale),
  }));
}

export function maxGradeOrdinal(discipline: OutdoorDiscipline): number {
  return (isBoulderDiscipline(discipline) ? BOULDER_V.length : ROPE_YOSEMITE.length) - 1;
}
