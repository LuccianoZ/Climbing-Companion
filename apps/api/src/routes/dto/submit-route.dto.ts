import {
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { GearRequirement, OutdoorDiscipline } from '../entities/route.entity';

// Architecture.md §3's CHECK constraint, mirrored here per its own wording
// ("enforced both as a Postgres CHECK... and mirrored in DTO validation"):
// bolt count / minimum rope length are forbidden outright for BOULDERING.
// A cross-field constraint (looking at args.object) rather than two
// separate @ValidateIf blocks on boltCount/minRopeLengthM individually --
// the rule genuinely spans three fields (discipline plus the two
// rope-climbing-only ones) and is clearer kept in one place than split
// across per-field conditionals.
@ValidatorConstraint({ name: 'boltRopeOnlyForRopeDisciplines', async: false })
class BoltRopeOnlyForRopeDisciplinesConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as SubmitRouteDto;
    if (dto.discipline !== OutdoorDiscipline.BOULDERING) {
      return true;
    }
    return dto.boltCount == null && dto.minRopeLengthM == null;
  }

  defaultMessage(): string {
    return 'boltCount and minRopeLengthM are not allowed when discipline is BOULDERING';
  }
}

function BoltRopeOnlyForRopeDisciplines(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: BoltRopeOnlyForRopeDisciplinesConstraint,
    });
  };
}

// Foundation §4 route submission fields, mirrored 1:1 as DTO properties.
// BL-006: only the fields listed there are mandatory (name, coordinates,
// discipline, summary, proposed grade) -- see the AC in TestInventory.md,
// which deliberately does NOT list gear requirements among the fields whose
// absence is rejected. gearRequirements is therefore optional here despite
// Foundation's prose calling it a "required field" (required as in "part of
// the form", not "must be non-empty") -- consistent with Architecture §3's
// `gear_requirements` column defaulting to `'{}'` rather than being
// NOT NULL with no default. See Architecture.md AR-14.
export class SubmitRouteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsLatitude()
  latitude: number;

  @IsLongitude()
  longitude: number;

  @IsEnum(OutdoorDiscipline)
  @BoltRopeOnlyForRopeDisciplines()
  discipline: OutdoorDiscipline;

  @IsOptional()
  @IsArray()
  @IsEnum(GearRequirement, { each: true })
  gearRequirements?: GearRequirement[];

  @IsString()
  @MinLength(1)
  @MaxLength(250)
  summary: string;

  // V-scale/rope-scale ordinal (Architecture §1) -- validated here at the
  // DTO layer, not as a DB enum. 0-31 is a shared upper bound wide enough
  // to cover both scales without needing to know which one applies until
  // display time (Architecture §1's note on grade ordinals generally).
  @IsInt()
  @Min(0)
  @Max(31)
  proposedGradeOrdinal: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  boltCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minRopeLengthM?: number;
}
