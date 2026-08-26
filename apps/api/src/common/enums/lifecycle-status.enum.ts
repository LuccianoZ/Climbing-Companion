// Architecture.md §1: shared lifecycle state machine reused across `crags`,
// `routes`, and (later) `gyms` -- one enum instead of three near-identical
// ones, since Architecture explicitly documents it as shared.
export enum LifecycleStatus {
  UNVERIFIED = 'UNVERIFIED',
  VERIFIED = 'VERIFIED',
  ARCHIVED = 'ARCHIVED',
}
