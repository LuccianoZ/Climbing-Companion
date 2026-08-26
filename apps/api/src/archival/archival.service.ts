import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { Route } from '../routes/entities/route.entity';
import { Gym } from '../gyms/entities/gym.entity';
import { Crag } from '../crags/entities/crag.entity';
import { LifecycleStatus } from '../common/enums/lifecycle-status.enum';

// Architecture.md §9 / §19.5: 30 days in production, 5 seconds in test
// (Foundation-mandated split so the archival Cucumber scenarios don't need
// to wait real days) -- matches the fallback ARCHIVAL_WINDOW_MS ships with
// in .env if the key is ever missing. .env.test overrides this to 5000.
const DEFAULT_ARCHIVAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface ArchivalResult {
  routesArchived: number;
  gymsArchived: number;
  cragsArchived: number;
}

// Architecture.md §9 / §19.5 (BL-013): "a plain, directly-callable service
// method" -- Cucumber calls archiveExpiredUnverifiedItems() directly, not
// by waiting on a cron tick, same posture as the auto-ban-at-3-strikes
// logic being service code rather than a DB trigger. The @nestjs/schedule
// @Cron wrapper (archival-cron.service.ts) is a thin caller of this same
// method, never where the logic itself lives.
//
// Scan path: the partial indexes already created back in BL-006/BL-007's
// migrations -- routes(created_at) WHERE status='UNVERIFIED' and
// gyms(created_at) WHERE status='UNVERIFIED' (Architecture §8) -- are
// exactly what the WHERE clauses below match, so Postgres can use them.
//
// Cascade rule mirrors BL-010's forward cascade, in reverse: when an
// archived route is its crag's founding_route_id, the crag cascades to
// ARCHIVED in the same transaction -- even if a sibling (non-founding)
// route under that crag is independently VERIFIED (Foundation §4/§21 risk
// 8, TestInventory §3.3's 4th scenario). A VERIFIED item (route, gym, or
// crag) is never archived regardless of elapsed time: the WHERE clauses
// below only ever select status = 'UNVERIFIED' rows, so a VERIFIED item
// simply never enters the scan population in the first place -- no
// separate "is it VERIFIED" guard is needed.
@Injectable()
export class ArchivalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async archiveExpiredUnverifiedItems(): Promise<ArchivalResult> {
    const cutoff = new Date(Date.now() - this.getArchivalWindowMs());

    return this.dataSource.transaction(async (manager) => {
      const routesArchived = await this.archiveExpiredRoutes(manager, cutoff);
      const gymsArchived = await this.archiveExpiredGyms(manager, cutoff);
      return {
        routesArchived: routesArchived.routeCount,
        gymsArchived,
        cragsArchived: routesArchived.cragCount,
      };
    });
  }

  private async archiveExpiredRoutes(
    manager: EntityManager,
    cutoff: Date,
  ): Promise<{ routeCount: number; cragCount: number }> {
    const routeRepo = manager.getRepository(Route);
    const cragRepo = manager.getRepository(Crag);

    const expiredRoutes = await routeRepo.find({
      where: {
        status: LifecycleStatus.UNVERIFIED,
        createdAt: LessThan(cutoff),
      },
    });

    let cragCount = 0;
    for (const route of expiredRoutes) {
      route.status = LifecycleStatus.ARCHIVED;
      route.archivedAt = new Date();
      await routeRepo.save(route);

      const crag = await cragRepo.findOne({ where: { id: route.cragId } });
      if (crag && crag.foundingRouteId === route.id) {
        crag.status = LifecycleStatus.ARCHIVED;
        crag.archivedAt = new Date();
        await cragRepo.save(crag);
        cragCount += 1;
      }
    }

    return { routeCount: expiredRoutes.length, cragCount };
  }

  private async archiveExpiredGyms(
    manager: EntityManager,
    cutoff: Date,
  ): Promise<number> {
    const gymRepo = manager.getRepository(Gym);

    const expiredGyms = await gymRepo.find({
      where: {
        status: LifecycleStatus.UNVERIFIED,
        createdAt: LessThan(cutoff),
      },
    });

    for (const gym of expiredGyms) {
      gym.status = LifecycleStatus.ARCHIVED;
      gym.archivedAt = new Date();
      await gymRepo.save(gym);
    }

    return expiredGyms.length;
  }

  private getArchivalWindowMs(): number {
    const raw = this.config.get<string>('ARCHIVAL_WINDOW_MS');
    const parsed = raw != null ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed : DEFAULT_ARCHIVAL_WINDOW_MS;
  }
}
