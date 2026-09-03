import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Crag, GeoJsonPoint } from '../crags/entities/crag.entity';
import {
  Gym,
  GymDiscipline,
  OperatingHours,
} from '../gyms/entities/gym.entity';
import { hasApprovedSubmissionPhoto } from '../common/media/link-submission-photos.util';
import {
  GearRequirement,
  OutdoorDiscipline,
  Route,
} from '../routes/entities/route.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';
import {
  GradeConsensusResult,
  GradeVoteService,
} from '../grade-votes/grade-vote.service';

// Foundation §5: a route/gym becomes VERIFIED on its 4th independent
// verification. The map's detail panel surfaces the running count as
// "n of 4" progress, so it needs the same denominator VerificationService
// gates on. Kept as its own local constant for the same reason
// GradeVoteService keeps VOTES_REQUIRED_FOR_CONSENSUS local: the two 4s
// are conceptually independent counts that happen to share a value.
export const VERIFICATIONS_REQUIRED_TO_VERIFY = 4;

// Cap on name-search rows. Foundation §9's search is a "fly to the one you
// meant" affordance, not a browsable result set -- a bounded list keeps the
// query cheap and the mobile-first dropdown scrollable rather than endless.
const SEARCH_RESULT_LIMIT = 20;

export type MapPinKind = 'CRAG' | 'GYM';
export type MapSearchKind = 'ROUTE' | 'CRAG' | 'GYM';

export interface MapPin {
  id: string;
  kind: MapPinKind;
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
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
  // BL-016's read, embedded per route so the detail panel never has to
  // fan out one consensus request per row.
  grade: GradeConsensusResult;
  verificationCount: number;
  verificationsRequired: number;
  // BL-x05: true while no ROUTE_SUBMISSION_PHOTO for this route has been
  // APPROVED yet -- drives the "Photos pending admin approval" panel state.
  photosPending: boolean;
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
  // Sept 3 revision (AR-51, BL-x04): rendered in the gym's local time via
  // ianaTimezone. Keys "0".."6" (0 = Sunday).
  operatingHours: OperatingHours;
  ianaTimezone: string;
  // BL-x05: true while no GYM_SUBMISSION_PHOTO for this gym is APPROVED yet.
  photosPending: boolean;
}

export interface MapSearchResult {
  id: string;
  kind: MapSearchKind;
  name: string;
  latitude: number;
  longitude: number;
  status: LifecycleStatus;
  // Only set for ROUTE hits: which crag's detail panel to open once the
  // map has flown to the route's own coordinates.
  cragId: string | null;
}

// Architecture.md AR-19 / BL-019-022: Epic 4 is the first epic that needs
// HTTP-level *read* endpoints at all -- every prior epic reached its
// service directly from Cucumber steps (RoutesService.findVisibleCrags(),
// ArchivalService.archiveExpiredUnverifiedItems()) because nothing had to
// render anything client-side before now. Those reads live here on one
// read-only MapService rather than being scattered across
// RoutesController/GymsController, for three reasons:
//
//   1. The map's pin query is inherently cross-entity -- one list holding
//      both crags and gyms -- so it has no natural home on either of the
//      single-entity controllers, and neither does name search, which
//      spans routes, crags and gyms at once.
//   2. Those controllers are write-side (submit, verify, admin-verify) and
//      guarded accordingly; the whole map read path is deliberately
//      unauthenticated (see the controller), and mixing guarded and
//      unguarded handlers on one controller is exactly the shape that
//      leaks an unguarded endpoint by accident later.
//   3. DoD §17.2's >=80% statement coverage is measured per touched
//      service. One service means one spec file and one coverage surface
//      for this epic instead of pushing new untested branches into
//      RoutesService and GymsService, both already green.
//
// This service never writes. It reuses GradeVoteService.computeConsensus()
// (AR-18) rather than re-deriving the plurality query a third time.
@Injectable()
export class MapService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gradeVoteService: GradeVoteService,
  ) {}

  // BL-019/BL-020: everything that should appear as a pin, in one round
  // trip. Visibility rules are the ones already settled in AR-14/AR-17 and
  // implemented by RoutesService.findVisibleCrags():
  //   - a crag is visible when it is not itself ARCHIVED *and* it still has
  //     at least one non-ARCHIVED route (both conditions are needed --
  //     see the long comment on findVisibleCrags for why neither alone is
  //     sufficient);
  //   - a gym is visible whenever it is not ARCHIVED. Gyms are standalone
  //     pins with no child rows (Foundation §4), so there is no EXISTS
  //     clause to mirror.
  // UNVERIFIED rows are deliberately included: BL-020's whole point is
  // that they render, translucent and badged, rather than being hidden.
  async findMapPins(): Promise<MapPin[]> {
    const cragRepo = this.dataSource.getRepository(Crag);
    const gymRepo = this.dataSource.getRepository(Gym);

    const [crags, gyms] = await Promise.all([
      cragRepo
        .createQueryBuilder('crag')
        .where('"crag"."status" <> :archived', {
          archived: LifecycleStatus.ARCHIVED,
        })
        .andWhere(
          `EXISTS (SELECT 1 FROM "routes" r WHERE r."crag_id" = "crag"."id" AND r."status" <> :archived)`,
          { archived: LifecycleStatus.ARCHIVED },
        )
        .orderBy('"crag"."name"', 'ASC')
        .getMany(),
      gymRepo
        .createQueryBuilder('gym')
        .where('"gym"."status" <> :archived', {
          archived: LifecycleStatus.ARCHIVED,
        })
        .orderBy('"gym"."name"', 'ASC')
        .getMany(),
    ]);

    return [
      ...crags.map((crag) => this.toPin(crag, 'CRAG')),
      ...gyms.map((gym) => this.toPin(gym, 'GYM')),
    ];
  }

  // BL-021's crag branch: the panel's route list, each row carrying its own
  // consensus-or-proposed grade and verification progress.
  async getCragDetail(cragId: string): Promise<CragDetail> {
    const crag = await this.dataSource
      .getRepository(Crag)
      .findOne({ where: { id: cragId } });
    if (!crag || crag.status === LifecycleStatus.ARCHIVED) {
      throw new NotFoundException(`Crag "${cragId}" not found`);
    }

    const routes = await this.dataSource
      .getRepository(Route)
      .createQueryBuilder('route')
      .where('"route"."crag_id" = :cragId', { cragId })
      .andWhere('"route"."status" <> :archived', {
        archived: LifecycleStatus.ARCHIVED,
      })
      .orderBy('"route"."created_at"', 'ASC')
      .getMany();

    const verificationCounts = await this.countVerifications(
      routes.map((r) => r.id),
    );

    const summaries: MapRouteSummary[] = [];
    for (const route of routes) {
      // Sequential rather than Promise.all: each call runs its own
      // aggregation query on the shared default manager, and Epic 4 has no
      // requirement that would justify N concurrent connections per panel
      // open. Route counts per crag are small by construction.
      const grade = await this.gradeVoteService.computeConsensus(
        this.dataSource.manager,
        route,
      );
      const photosPending = !(await hasApprovedSubmissionPhoto(
        this.dataSource,
        {
          routeId: route.id,
        },
      ));
      summaries.push({
        id: route.id,
        name: route.name,
        discipline: route.discipline,
        gearRequirements: route.gearRequirements ?? [],
        summary: route.summary,
        boltCount: route.boltCount,
        minRopeLengthM: route.minRopeLengthM,
        status: route.status,
        latitude: latitudeOf(route.location),
        longitude: longitudeOf(route.location),
        grade,
        verificationCount: verificationCounts.get(route.id) ?? 0,
        verificationsRequired: VERIFICATIONS_REQUIRED_TO_VERIFY,
        photosPending,
      });
    }

    return {
      id: crag.id,
      kind: 'CRAG',
      name: crag.name,
      latitude: latitudeOf(crag.location),
      longitude: longitudeOf(crag.location),
      status: crag.status,
      routes: summaries,
    };
  }

  // BL-021's gym branch: Foundation §4 gives a gym no child routes and no
  // grade, so its panel shows disciplines_offered instead of a route list.
  async getGymDetail(gymId: string): Promise<GymDetail> {
    const gym = await this.dataSource
      .getRepository(Gym)
      .findOne({ where: { id: gymId } });
    if (!gym || gym.status === LifecycleStatus.ARCHIVED) {
      throw new NotFoundException(`Gym "${gymId}" not found`);
    }

    const photosPending = !(await hasApprovedSubmissionPhoto(this.dataSource, {
      gymId: gym.id,
    }));

    return {
      id: gym.id,
      kind: 'GYM',
      name: gym.name,
      latitude: latitudeOf(gym.location),
      longitude: longitudeOf(gym.location),
      status: gym.status,
      disciplinesOffered: gym.disciplinesOffered ?? [],
      operatingHours: gym.operatingHours ?? {},
      ianaTimezone: gym.ianaTimezone,
      photosPending,
    };
  }

  // BL-022: name search against our own tables only. Foundation §9/§18
  // rules out an external geocoding service for the MVP, so there is
  // deliberately no HTTP client, no API key, and no fallback provider
  // anywhere in this method -- the absence is the requirement, and
  // map-and-search.feature asserts it by exercising this path with the
  // network unavailable.
  //
  // ILIKE '%term%' rather than a tsvector/pg_trgm index: the MVP's dataset
  // is small, the match must be substring (a climber typing "wall" should
  // find "The Great Wall"), and adding an index type here would be a
  // schema change this story's Trello card does not scope. Revisit if the
  // dataset grows past the point where a sequential scan is acceptable.
  async searchByName(term: string): Promise<MapSearchResult[]> {
    const trimmed = term.trim();
    if (trimmed.length === 0) {
      return [];
    }

    // Escape LIKE metacharacters so a user typing "100%" searches for the
    // literal string rather than turning the pattern into a wildcard.
    const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

    const rows: Array<{
      id: string;
      kind: MapSearchKind;
      name: string;
      latitude: string | number;
      longitude: string | number;
      status: LifecycleStatus;
      crag_id: string | null;
    }> = await this.dataSource.query(
      `SELECT "id", 'ROUTE' AS kind, "name",
              ST_Y("location"::geometry) AS latitude,
              ST_X("location"::geometry) AS longitude,
              "status"::text AS status,
              "crag_id"
         FROM "routes"
        WHERE "status" <> 'ARCHIVED' AND "name" ILIKE $1
       UNION ALL
       SELECT "id", 'CRAG' AS kind, "name",
              ST_Y("location"::geometry) AS latitude,
              ST_X("location"::geometry) AS longitude,
              "status"::text AS status,
              NULL AS "crag_id"
         FROM "crags"
        WHERE "status" <> 'ARCHIVED' AND "name" ILIKE $1
       UNION ALL
       SELECT "id", 'GYM' AS kind, "name",
              ST_Y("location"::geometry) AS latitude,
              ST_X("location"::geometry) AS longitude,
              "status"::text AS status,
              NULL AS "crag_id"
         FROM "gyms"
        WHERE "status" <> 'ARCHIVED' AND "name" ILIKE $1
        ORDER BY "name" ASC
        LIMIT ${SEARCH_RESULT_LIMIT}`,
      [pattern],
    );

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      // ST_Y/ST_X come back as float8; node-postgres hands those over as
      // numbers, but Number() keeps the DTO's contract explicit either way.
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      status: row.status,
      cragId: row.crag_id,
    }));
  }

  // One grouped count instead of one query per route -- the detail panel
  // renders every route's "n of 4" progress at once.
  private async countVerifications(
    routeIds: string[],
  ): Promise<Map<string, number>> {
    if (routeIds.length === 0) {
      return new Map();
    }
    const rows: Array<{ route_id: string; verification_count: string }> =
      await this.dataSource.query(
        `SELECT "route_id", COUNT(*) AS verification_count
           FROM "route_verifications"
          WHERE "route_id" = ANY($1::uuid[])
          GROUP BY "route_id"`,
        [routeIds],
      );
    // COUNT(*) is a bigint, which node-postgres returns as a string.
    return new Map(rows.map((r) => [r.route_id, Number(r.verification_count)]));
  }

  private toPin(
    entity: {
      id: string;
      name: string;
      status: LifecycleStatus;
      location: GeoJsonPoint;
    },
    kind: MapPinKind,
  ): MapPin {
    return {
      id: entity.id,
      kind,
      name: entity.name,
      latitude: latitudeOf(entity.location),
      longitude: longitudeOf(entity.location),
      status: entity.status,
    };
  }
}

// GeoJSON stores coordinates as [longitude, latitude] -- the reverse of
// the order humans say them in (see crag.entity.ts). Every read path out
// of this service flips them back to named latitude/longitude fields so no
// frontend component ever has to remember which index is which.
function latitudeOf(point: GeoJsonPoint): number {
  return point.coordinates[1];
}

function longitudeOf(point: GeoJsonPoint): number {
  return point.coordinates[0];
}
