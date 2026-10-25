/**
 * apps/api/src/jobs/cleanup.ts
 * Background Cleanup Jobs (Spec 7.3.5, 7.3.8, 7.4.9)
 *
 * Responsibilities:
 * 1. cleanupExpiredPendingPatients:
 *    Removes/archives accounts stuck in 'awaiting_face' longer than pending_expires_at (24h)
 *    and purges their biometric files in Supabase Storage.
 * 2. cleanupOrphanBiometricFiles:
 *    Inspects folders in 'biometric-data/' bucket and deletes files where enrollment_id
 *    is not 'active' in face_enrollments or belongs to non-existent patients.
 * 3. cleanupLoginSnapshots:
 *    Enforces LOGIN_SNAPSHOT_RETENTION policy (0 = purge all snapshots; > 0 = keep latest N per patient).
 */

import { getAdminClient } from '../lib/supabase/adminClient';
import { getEnv } from '../config/env';
import { logger } from '../middleware/logger';
import { audit } from '../modules/audit';

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * 1. Clean up patients stuck in 'awaiting_face' past their expiration timestamp (Spec 7.3.8)
 */
export async function cleanupExpiredPendingPatients(): Promise<number> {
  const adminClient = getAdminClient();
  const nowIso = new Date().toISOString();

  try {
    // 1. Find all expired awaiting_face patients
    const { data: expiredPatients, error: selectErr } = await adminClient
      .from('patients')
      .select('id, hn')
      .eq('registration_status', 'awaiting_face')
      .lte('pending_expires_at', nowIso);

    if (selectErr) {
      logger.error({ err: selectErr }, 'Failed to query expired pending patients');
      return 0;
    }

    if (!expiredPatients || expiredPatients.length === 0) {
      return 0;
    }

    let cleanedCount = 0;

    for (const patient of expiredPatients) {
      try {
        // A. Wipe all biometric files in Storage under biometric-data/{patient_id}
        await wipePatientBiometrics(patient.id);

        // B. Update status to 'archived' in DB
        const { error: updateErr } = await adminClient
          .from('patients')
          .update({
            registration_status: 'archived',
            updated_at: nowIso,
          })
          .eq('id', patient.id);

        if (!updateErr) {
          cleanedCount++;
          await audit.write({
            actor_type: 'system',
            action: 'PATIENT_PENDING_EXPIRED_CLEANUP',
            entity: 'patients',
            entity_id: patient.id,
            metadata: {
              hn: patient.hn,
              expired_at: nowIso,
            },
          }).catch(() => {});
        } else {
          logger.error({ err: updateErr, patientId: patient.id }, 'Failed to archive expired patient');
        }
      } catch (patientErr) {
        logger.error({ err: patientErr, patientId: patient.id }, 'Error cleaning up expired patient');
      }
    }

    logger.info({ cleanedCount }, 'cleanupExpiredPendingPatients completed');
    return cleanedCount;
  } catch (err) {
    logger.error({ err }, 'Unexpected error in cleanupExpiredPendingPatients');
    return 0;
  }
}

/**
 * 2. Delete biometric files that have no active enrollment in DB (Spec 7.3.5)
 */
export async function cleanupOrphanBiometricFiles(): Promise<number> {
  const adminClient = getAdminClient();
  let deletedFilesCount = 0;

  try {
    // List top-level folders in 'biometric-data' (each folder is a patient_id)
    const { data: topLevelItems, error: listErr } = await adminClient.storage
      .from('biometric-data')
      .list('');

    if (listErr) {
      // Bucket might be empty or unconfigured in tests
      logger.warn({ err: listErr }, 'Could not list biometric-data bucket for orphan cleanup');
      return 0;
    }

    if (!topLevelItems || topLevelItems.length === 0) {
      return 0;
    }

    for (const item of topLevelItems) {
      const patientId = item.name;
      if (!patientId || patientId.startsWith('.')) continue;

      try {
        // Query active face enrollments for this patient
        const { data: activeEnrollments, error: enrollErr } = await adminClient
          .from('face_enrollments')
          .select('id')
          .eq('patient_id', patientId)
          .eq('status', 'active');

        if (enrollErr) {
          logger.error({ err: enrollErr, patientId }, 'Failed to query face_enrollments for orphan check');
          continue;
        }

        const activeEnrollmentIds = new Set(
          (activeEnrollments || []).map((e: { id: string }) => e.id)
        );

        // List items inside patient folder
        const { data: subItems, error: subErr } = await adminClient.storage
          .from('biometric-data')
          .list(patientId);

        if (subErr || !subItems) continue;

        for (const subItem of subItems) {
          const subName = subItem.name;
          if (subName.startsWith('.')) continue;

          // If subName is an enrollment_id folder
          if (!activeEnrollmentIds.has(subName)) {
            // It's not an active enrollment! Purge all files in this subfolder
            const { data: filesToDelete } = await adminClient.storage
              .from('biometric-data')
              .list(`${patientId}/${subName}`);

            if (filesToDelete && filesToDelete.length > 0) {
              const paths = filesToDelete.map((f: { name: string }) => `${patientId}/${subName}/${f.name}`);
              const { data: removed } = await adminClient.storage
                .from('biometric-data')
                .remove(paths);

              deletedFilesCount += (removed || []).length;
            }
          }
        }
      } catch (err) {
        logger.error({ err, patientId }, 'Error scanning patient folder in orphan biometric cleanup');
      }
    }

    if (deletedFilesCount > 0) {
      logger.info({ deletedFilesCount }, 'cleanupOrphanBiometricFiles removed orphaned files');
    }
    return deletedFilesCount;
  } catch (err) {
    logger.error({ err }, 'Unexpected error in cleanupOrphanBiometricFiles');
    return 0;
  }
}

/**
 * 3. Enforce LOGIN_SNAPSHOT_RETENTION policy (Spec 7.4.9)
 * If LOGIN_SNAPSHOT_RETENTION === 0: Purge all snapshots
 * If > 0: Retain at most N newest snapshots per patient
 */
export async function cleanupLoginSnapshots(): Promise<number> {
  const adminClient = getAdminClient();
  const env = getEnv();
  const retention = env.LOGIN_SNAPSHOT_RETENTION;
  let deletedCount = 0;

  try {
    // List patients with snapshots under 'biometric-data'
    const { data: patients, error: listErr } = await adminClient.storage
      .from('biometric-data')
      .list('');

    if (listErr || !patients) return 0;

    for (const p of patients) {
      const patientId = p.name;
      if (!patientId || patientId.startsWith('.')) continue;

      // Check if snapshots folder exists for patient: biometric-data/{patient_id}/snapshots/
      const snapshotPath = `${patientId}/snapshots`;
      const { data: snapshotFiles, error: snapErr } = await adminClient.storage
        .from('biometric-data')
        .list(snapshotPath);

      if (snapErr || !snapshotFiles || snapshotFiles.length === 0) continue;

      if (retention === 0) {
        // Zero retention: purge all snapshots
        const paths = snapshotFiles.map((f: { name: string }) => `${snapshotPath}/${f.name}`);
        const { data: removed } = await adminClient.storage
          .from('biometric-data')
          .remove(paths);
        deletedCount += (removed || []).length;
      } else if (snapshotFiles.length > retention) {
        // Sort files by created_at ascending (oldest first)
        const sorted = [...snapshotFiles].sort((a, b) => {
          const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tA - tB;
        });

        const toRemove = sorted.slice(0, sorted.length - retention);
        const paths = toRemove.map((f: { name: string }) => `${snapshotPath}/${f.name}`);
        const { data: removed } = await adminClient.storage
          .from('biometric-data')
          .remove(paths);
        deletedCount += (removed || []).length;
      }
    }

    if (deletedCount > 0) {
      logger.info({ deletedCount, retention }, 'cleanupLoginSnapshots completed');
    }
    return deletedCount;
  } catch (err) {
    logger.error({ err }, 'Unexpected error in cleanupLoginSnapshots');
    return 0;
  }
}

/**
 * Helper to wipe all biometric files under biometric-data/{patientId}/
 */
async function wipePatientBiometrics(patientId: string): Promise<void> {
  const adminClient = getAdminClient();

  try {
    const { data: items } = await adminClient.storage
      .from('biometric-data')
      .list(patientId);

    if (!items || items.length === 0) return;

    for (const item of items) {
      if (item.name.startsWith('.')) continue;

      // Check if it's a subfolder
      const { data: subFiles } = await adminClient.storage
        .from('biometric-data')
        .list(`${patientId}/${item.name}`);

      if (subFiles && subFiles.length > 0) {
        const paths = subFiles.map((f: { name: string }) => `${patientId}/${item.name}/${f.name}`);
        await adminClient.storage.from('biometric-data').remove(paths);
      } else {
        // Flat file directly under patientId
        await adminClient.storage.from('biometric-data').remove([`${patientId}/${item.name}`]);
      }
    }
  } catch (err) {
    logger.error({ err, patientId }, 'Failed to wipe patient biometrics in storage');
  }
}

/**
 * Execute all cleanup jobs in sequence
 */
export async function runAllCleanups(): Promise<{
  expiredPatients: number;
  orphanFiles: number;
  snapshotsCleaned: number;
}> {
  const expiredPatients = await cleanupExpiredPendingPatients();
  const orphanFiles = await cleanupOrphanBiometricFiles();
  const snapshotsCleaned = await cleanupLoginSnapshots();

  return {
    expiredPatients,
    orphanFiles,
    snapshotsCleaned,
  };
}

/**
 * Start recurring cleanup scheduler
 * Default interval: 1 hour (3,600,000 ms)
 */
export function startCleanupScheduler(intervalMs = 60 * 60 * 1000): NodeJS.Timeout | null {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  logger.info({ intervalMs }, 'Starting background cleanup scheduler');

  // Trigger one pass immediately in background (non-blocking)
  runAllCleanups().catch((err) => {
    logger.error({ err }, 'Error during initial cleanup run');
  });

  cleanupTimer = setInterval(() => {
    runAllCleanups().catch((err) => {
      logger.error({ err }, 'Error during scheduled cleanup run');
    });
  }, intervalMs);

  return cleanupTimer;
}

/**
 * Stop recurring cleanup scheduler
 */
export function stopCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    logger.info('Background cleanup scheduler stopped');
  }
}
