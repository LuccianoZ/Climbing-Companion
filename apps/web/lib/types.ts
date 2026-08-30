// Mirrors the payloads apps/api's MapController returns (AR-19). Kept as a
// hand-written mirror in apps/web rather than shared through
// packages/shared-types: that workspace is still an empty stub (only a
// package.json, AR-7's placeholder) with no build, no entry point and no
// consumer, and wiring a CommonJS package into the Next app's bundler is a
// larger change than Epic 4 scopes. Flagged in AR-19 as the natural first
// tenant of that package once someone stands it up.

export type LifecycleStatus = 'UNVERIFIED' | 'VERIFIED' | 'ARCHIVED';

export type OutdoorDiscipline =
  | 'SPORT_CLIMBING'
  | 'BOULDERING'
  | 'TRADITIONAL_CLIMBING';

export type GearRequirement =
  | 'QUICKDRAWS'
  | 'CRASH_PAD'
  | 'TRAD_GEAR'
  | 'HELMET';

export type GymDiscipline =
  | 'AUTO_BELAY'
  | 'TOP_ROPE'
  | 'LEAD'
  | 'BOULDERING'
  | 'SPEED_CLIMBING';

export type MapPinKind = 'CRAG' | 'GYM';

export interface MapPin {
  id: string;
  kind: MapPinKind;
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
}

export interface GradeDistributionEntry {
  gradeOrdinal: number;
  voteCount: number;
}

export interface GradeConsensus {
  source: 'PROPOSED' | 'CONSENSUS';
  gradeOrdinal: number;
  totalVotes: number;
  distribution: GradeDistributionEntry[];
}

export interface MapRouteSummary {
  id: string;
  name: string;
  discipline: OutdoorDiscipline;
  gearRequirements: GearRequirement[];
  summary: string;
  boltCount: number | null;
  minRopeLengthM: number | null;
  status: LifecycleStatus;
  latitude: number;
  longitude: number;
  grade: GradeConsensus;
  verificationCount: number;
  verificationsRequired: number;
}

export interface CragDetail {
  id: string;
  kind: 'CRAG';
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
  routes: MapRouteSummary[];
}

export interface GymDetail {
  id: string;
  kind: 'GYM';
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
  disciplinesOffered: GymDiscipline[];
}

export type PinDetail = CragDetail | GymDetail;

export interface MapSearchResult {
  id: string;
  kind: 'ROUTE' | 'CRAG' | 'GYM';
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
  cragId: string | null;
}

export const DISCIPLINE_LABELS: Record<OutdoorDiscipline, string> = {
  SPORT_CLIMBING: 'Sport Climbing',
  BOULDERING: 'Bouldering',
  TRADITIONAL_CLIMBING: 'Traditional',
};

export const GYM_DISCIPLINE_LABELS: Record<GymDiscipline, string> = {
  AUTO_BELAY: 'Auto Belay',
  TOP_ROPE: 'Top Rope',
  LEAD: 'Lead',
  BOULDERING: 'Bouldering',
  SPEED_CLIMBING: 'Speed Climbing',
};
