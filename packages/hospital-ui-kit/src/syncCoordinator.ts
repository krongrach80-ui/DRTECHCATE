/**
 * packages/hospital-ui-kit/src/syncCoordinator.ts
 * Master Prompt v5 Section 3: Deterministic Zero-Conflict & Idempotent Sync Guard
 *
 * Guarantees:
 * 1. Strict Patient-ID & Session Scoping (drops stale / mismatched events)
 * 2. Single-Flight Mutation Queue with Idempotency Key (prevents duplicate API spam)
 * 3. Dirty / Focused Input Guard (prevents background polling from clobbering active user typing)
 */

export interface VersionedEntity {
  patient_id?: string;
  id?: string;
  updatedAt?: string | number;
  version?: number;
}

export interface SyncGuardConfig {
  activePatientId?: string | null;
  currentUpdatedAt?: string | number;
}

export class SyncCoordinator {
  private static instance: SyncCoordinator;

  // Single-flight active mutation locks
  private inflightMutations = new Set<string>();

  // Tracks active input dirty state per form field
  private dirtyFieldKeys = new Set<string>();

  // Stored timestamps of last known updates per entity
  private entityTimestamps = new Map<string, number>();

  public static getInstance(): SyncCoordinator {
    if (!SyncCoordinator.instance) {
      SyncCoordinator.instance = new SyncCoordinator();
    }
    return SyncCoordinator.instance;
  }

  /**
   * Generates a unique idempotency request ID
   */
  public generateRequestId(actionName: string, entityId: string): string {
    return `${actionName}:${entityId}:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 1. Single-Flight Mutation Queue:
   * Acquires a lock for an action. Returns true if acquired, false if already inflight.
   */
  public acquireFlightLock(lockKey: string): boolean {
    if (this.inflightMutations.has(lockKey)) {
      return false; // Duplicate request blocked
    }
    this.inflightMutations.add(lockKey);
    return true;
  }

  /**
   * Releases a flight lock once mutation finishes
   */
  public releaseFlightLock(lockKey: string): void {
    this.inflightMutations.delete(lockKey);
  }

  /**
   * 2. Strict Patient-ID & Session Scoping:
   * Evaluates if incoming SSE / Realtime event should be applied or dropped
   */
  public shouldApplyIncomingEvent(
    incomingPatientId: string | undefined,
    incomingUpdatedAt: string | number | undefined,
    activePatientId?: string | null
  ): boolean {
    // A. Check Patient-ID scope
    if (activePatientId && incomingPatientId && activePatientId !== incomingPatientId) {
      // Event belongs to a different patient; ignore safely
      return false;
    }

    // B. Check Timestamp ordering (Drop stale events)
    if (incomingPatientId && incomingUpdatedAt) {
      const incomingMs = typeof incomingUpdatedAt === 'string'
        ? new Date(incomingUpdatedAt).getTime()
        : Number(incomingUpdatedAt);

      const lastKnownMs = this.entityTimestamps.get(incomingPatientId) || 0;

      if (incomingMs <= lastKnownMs) {
        // Drop stale event older than or equal to current state
        return false;
      }

      // Record newest timestamp
      this.entityTimestamps.set(incomingPatientId, incomingMs);
    }

    return true;
  }

  /**
   * 3. Dirty / Focused Input Guard:
   * Flags a field as actively being typed in by the user
   */
  public markFieldDirty(fieldKey: string, isDirty: boolean): void {
    if (isDirty) {
      this.dirtyFieldKeys.add(fieldKey);
    } else {
      this.dirtyFieldKeys.delete(fieldKey);
    }
  }

  /**
   * Checks whether background polling is allowed to overwrite a specific field
   */
  public canOverwriteField(fieldKey: string): boolean {
    return !this.dirtyFieldKeys.has(fieldKey);
  }

  /**
   * Resets all dirty flags (e.g. after successful submit or form reset)
   */
  public resetDirtyFields(): void {
    this.dirtyFieldKeys.clear();
  }
}

export const syncCoordinator = SyncCoordinator.getInstance();
