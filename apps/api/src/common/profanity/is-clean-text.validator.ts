import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { containsProfanity } from './profanity.matcher';

// BL-026: the profanity gateway as a class-validator constraint, so it runs
// inside the same global ValidationPipe every DTO already passes through
// (main.ts) and a match surfaces as a 400 before the controller -- and
// therefore the transaction -- is ever entered (Foundation §10: "aborts the
// transaction").
//
// Applied to SubmitRouteDto.name and SubmitGymDto.name now. Bios and reviews
// (Foundation §10's other two targets) have no write path in the codebase
// yet -- no users-profile-update endpoint, no reviews table -- so adopting
// this there is a one-line change on those DTOs when their epics land (AR-45).
@ValidatorConstraint({ name: 'isCleanText', async: false })
export class IsCleanTextConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return !containsProfanity(value);
  }

  defaultMessage(): string {
    return 'text contains language that is not allowed';
  }
}

export function IsCleanText(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsCleanTextConstraint,
    });
  };
}
