import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { SearchMapDto } from './dto/search-map.dto';
import { MapService } from './map.service';

// BL-019-022 / Architecture.md AR-19. Every handler here is deliberately
// UNGUARDED. Foundation §9 frames the map as the app's public front door
// -- a Visitor who has not registered can pan the map, read pins, open a
// detail panel and search by name; what they cannot do is act (verify,
// vote, log, check in), and every one of those actions already lives
// behind SessionGuard on its own controller. This mirrors the precedent
// GradeVotesController set with GET .../grade-votes/consensus, which is
// unguarded for exactly the same reason (TestInventory requires the vote
// distribution be visible to an unauthenticated Visitor).
//
// Consequently this controller must stay read-only. A write handler added
// here later would inherit the missing guard silently -- that is the whole
// reason the map's reads are not folded into RoutesController or
// GymsController, whose handlers are guarded (AR-19).
@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  // BL-019/BL-020: every crag and gym that should render as a pin.
  @Get('pins')
  getPins() {
    return this.mapService.findMapPins();
  }

  // BL-022. Registered before the ':id' routes below is not a concern here
  // (the crag/gym routes are namespaced under their own path segments), but
  // the ordering is kept conventional anyway.
  @Get('search')
  search(@Query() query: SearchMapDto) {
    return this.mapService.searchByName(query.q);
  }

  // BL-021, crag branch: name + route list, each route carrying its own
  // consensus grade, gear requirements, summary and verification progress.
  @Get('crags/:cragId')
  getCrag(@Param('cragId', ParseUUIDPipe) cragId: string) {
    return this.mapService.getCragDetail(cragId);
  }

  // BL-021, gym branch: disciplines instead of a route list (Foundation §4).
  @Get('gyms/:gymId')
  getGym(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.mapService.getGymDetail(gymId);
  }
}
