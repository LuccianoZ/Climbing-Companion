import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ArchivalService } from './archival.service';

// Architecture.md §9 / §19.5: the thin @Cron wrapper -- all the actual
// logic lives in ArchivalService.archiveExpiredUnverifiedItems() (a plain,
// directly-callable method Cucumber calls without waiting on this tick).
// This class exists solely so the job also runs unattended in production;
// it is never itself exercised by a feature file. Hourly is frequent
// enough relative to the 30-day production window (Architecture §16)
// without being wasteful -- there is no requirement anywhere for
// near-real-time archival.
@Injectable()
export class ArchivalCronService {
  private readonly logger = new Logger(ArchivalCronService.name);

  constructor(private readonly archivalService: ArchivalService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    const result = await this.archivalService.archiveExpiredUnverifiedItems();
    if (result.routesArchived || result.gymsArchived || result.cragsArchived) {
      this.logger.log(
        `Archived ${result.routesArchived} route(s), ${result.gymsArchived} gym(s), ${result.cragsArchived} crag(s).`,
      );
    }
  }
}
