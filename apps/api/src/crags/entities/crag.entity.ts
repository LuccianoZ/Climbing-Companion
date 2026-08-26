import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { LifecycleStatus } from '../../common/enums/lifecycle-status.enum';

// TypeORM's postgres driver auto-converts geometry/geography columns to and
// from GeoJSON (ST_GeomFromGeoJSON on write, ST_AsGeoJSON on read) whenever
// spatialFeatureType/srid are set on the column -- so entities work with
// plain GeoJSON objects, never raw WKT/EWKB strings.
export interface GeoJsonPoint {
  type: 'Point';
  // [longitude, latitude] -- GeoJSON/PostGIS coordinate order, the opposite
  // of the [latitude, longitude] order humans usually say out loud.
  coordinates: [number, number];
}

// Architecture.md §3 `crags`. BL-006 / AR-2: `founding_route_id` is
// nullable at the DB level even though it's conceptually mandatory once a
// crag exists -- the crag row must exist before the route row can
// reference it back (circular FK with `routes`). RoutesService.submitRoute
// is what actually enforces "always set, eventually" via its 3-statement
// transaction; see Architecture §3 for the exact insert pattern and AR-2
// for why NOT NULL can't be declared directly.
@Entity('crags')
export class Crag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  // Mandatory GiST index (Architecture §19.4) is created explicitly by the
  // migration below, not via an @Index() decorator here -- synchronize is
  // permanently false (Foundation §20.1) so decorator-driven index creation
  // never actually runs; the migration is the only thing that matters.
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  location: GeoJsonPoint;

  @Index()
  @Column({
    type: 'enum',
    enum: LifecycleStatus,
    enumName: 'lifecycle_status',
    default: LifecycleStatus.UNVERIFIED,
  })
  status: LifecycleStatus;

  @Column({ name: 'founding_route_id', type: 'uuid', nullable: true })
  foundingRouteId: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
