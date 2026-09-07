import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

// BL-036/037 (Epic 8, reinstated Sept 7, 2026). Reads `climb_logs` directly
// via DataSource rather than importing ClimbLogsModule -- this is a
// read-only aggregation, the same reasoning MapModule's read surface
// already established (AR-19) for reaching into another epic's table.
@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
