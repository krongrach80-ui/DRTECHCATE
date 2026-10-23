import { AppError } from '../../middleware/errorHandler';
import { UserSession } from '../../middleware/authenticate';
import { AuditService, defaultAuditService } from '../audit/service';
import { dispatchHospitalEvent } from '../events/routes';
import {
  PatientRecord,
  CreatePatientInput,
  UpdatePatientInput,
  PatientQueryFilter,
  EnrollmentTicketRecord,
  CheckinRecord,
} from './schema';
import { PatientRepository, defaultPatientRepository } from './repository';

export class PatientService {
  constructor(
    private repo: PatientRepository = defaultPatientRepository,
    private auditService: AuditService = defaultAuditService
  ) {}

  // =========================================================================
  // 1. CREATE PATIENT
  // =========================================================================
  async createPatient(
    input: CreatePatientInput,
    actor: UserSession,
    ipAddress?: string
  ): Promise<PatientRecord> {
    // Section 8.2: PT creates patient with themselves as responsible PT
    let responsiblePtId = input.responsible_pt_id;
    if (actor.role === 'pt') {
      responsiblePtId = actor.id;
    }

    const patient = await this.repo.createPatient(input, actor.id, responsiblePtId);

    // Audit log
    await this.auditService.write({
      actor_type: 'staff',
      action: 'patient.create',
      actor_id: actor.id,
      entity: 'patient',
      entity_id: patient.id,
      ip: ipAddress,
      metadata: {
        hn: patient.hn,
        responsible_pt_id: patient.responsible_pt_id,
        registered_via: patient.registered_via,
      },
    });

    return patient;
  }

  // =========================================================================
  // 2. GET PATIENT DETAILS (WITH MEDICAL RECORD AUDIT LOGGING)
  // =========================================================================
  async getPatientById(
    id: string,
    actor: UserSession,
    ipAddress?: string
  ): Promise<PatientRecord> {
    const patient = await this.repo.getPatientById(id);
    if (!patient) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    }

    // Role check: Admin can access any; PT can access only if assigned or active transfer
    if (actor.role === 'pt') {
      const hasAccess = await this.repo.isPatientAccessibleByPt(id, actor.id);
      if (!hasAccess) {
        throw new AppError(
          'Forbidden: You do not have access to this patient record.',
          403,
          'FORBIDDEN'
        );
      }
    }

    // Spec Section 11: Audit log on reading patient medical records
    await this.auditService.write({
      actor_type: 'staff',
      action: 'patient.read',
      actor_id: actor.id,
      entity: 'patient',
      entity_id: patient.id,
      ip: ipAddress,
      metadata: { hn: patient.hn },
    });

    return patient;
  }

  // =========================================================================
  // 3. UPDATE PATIENT (WITH OPTIMISTIC LOCKING VERSION VALIDATION)
  // =========================================================================
  async updatePatient(
    id: string,
    input: UpdatePatientInput,
    actor: UserSession,
    ipAddress?: string
  ): Promise<PatientRecord> {
    const current = await this.repo.getPatientById(id);
    if (!current) {
      throw new AppError('Patient not found', 404, 'PATIENT_NOT_FOUND');
    }

    // Role check
    if (actor.role === 'pt') {
      const hasAccess = await this.repo.isPatientAccessibleByPt(id, actor.id);
      if (!hasAccess) {
        throw new AppError(
          'Forbidden: You do not have access to modify this patient record.',
          403,
          'FORBIDDEN'
        );
      }
      // PT cannot reassign responsible PT to someone else
      if (input.responsible_pt_id && input.responsible_pt_id !== actor.id) {
        throw new AppError(
          'Forbidden: Only administrators can reassign patient responsible physiotherapist.',
          403,
          'FORBIDDEN'
        );
      }
    }

    // Perform atomic update with optimistic locking
    const updated = await this.repo.updatePatient(id, input, input.version);

    await this.auditService.write({
      actor_type: 'staff',
      action: 'patient.update',
      actor_id: actor.id,
      entity: 'patient',
      entity_id: updated.id,
      ip: ipAddress,
      metadata: {
        hn: updated.hn,
        previous_version: input.version,
        new_version: updated.version,
      },
    });

    return updated;
  }

  // =========================================================================
  // 4. LIST PATIENTS (FILTERED BY ROLE & ACTIVE DELEGATIONS)
  // =========================================================================
  async listPatients(
    filter: PatientQueryFilter,
    actor: UserSession
  ): Promise<{ patients: PatientRecord[]; total: number; page: number; limit: number }> {
    let accessibleIds: string[] | null = null;

    if (actor.role === 'pt') {
      accessibleIds = await this.repo.getAccessiblePatientIdsForPt(actor.id);
    }

    return this.repo.listPatients(filter, accessibleIds);
  }

  // =========================================================================
  // 5. SEND TO KIOSK (CREATE 10-MIN ENROLLMENT TICKET + SSE NOTIFICATION)
  // =========================================================================
  async sendToKiosk(
    patientId: string,
    kioskId: string,
    actor: UserSession,
    ipAddress?: string
  ): Promise<EnrollmentTicketRecord> {
    const patient = await this.getPatientById(patientId, actor, ipAddress);

    const ticket = await this.repo.createEnrollmentTicket(patient.id, kioskId, actor.id);

    // Notify kiosk listeners via SSE Realtime Event Bus
    dispatchHospitalEvent({
      event: 'kiosk_enrollment_dispatch',
      patientId: patient.id,
      responsiblePtId: patient.responsible_pt_id || undefined,
      data: {
        ticketId: ticket.id,
        kioskId,
        patientId: patient.id,
        patientName: `${patient.first_name} ${patient.last_name}`,
        expiresAt: ticket.expires_at,
      },
    });

    await this.auditService.write({
      actor_type: 'staff',
      action: 'patient.send_to_kiosk',
      actor_id: actor.id,
      entity: 'patient',
      entity_id: patient.id,
      ip: ipAddress,
      metadata: {
        kiosk_id: kioskId,
        ticket_id: ticket.id,
        expires_at: ticket.expires_at,
      },
    });

    return ticket;
  }

  // =========================================================================
  // 6. COUNTER CHECK-IN (PRUNES CANDIDATE POOL FOR TODAY'S KIOSK FACE MATCH)
  // =========================================================================
  async checkin(
    patientId: string,
    kioskId: string | null,
    actor: UserSession,
    ipAddress?: string
  ): Promise<CheckinRecord> {
    const patient = await this.getPatientById(patientId, actor, ipAddress);

    const checkin = await this.repo.createCheckin(patient.id, kioskId, actor.id);

    // Broadcast checkin event
    dispatchHospitalEvent({
      event: 'patient_checkin',
      patientId: patient.id,
      responsiblePtId: patient.responsible_pt_id || undefined,
      data: {
        checkinId: checkin.id,
        patientId: patient.id,
        hn: patient.hn,
        date: checkin.date,
      },
    });

    await this.auditService.write({
      actor_type: 'staff',
      action: 'patient.checkin',
      actor_id: actor.id,
      entity: 'patient',
      entity_id: patient.id,
      ip: ipAddress,
      metadata: {
        date: checkin.date,
        kiosk_id: kioskId,
      },
    });

    return checkin;
  }

  // =========================================================================
  // 7. ARCHIVE PATIENT (SOFT DELETE)
  // =========================================================================
  async archivePatient(
    patientId: string,
    actor: UserSession,
    ipAddress?: string
  ): Promise<PatientRecord> {
    const patient = await this.getPatientById(patientId, actor, ipAddress);

    const updated = await this.repo.updatePatient(
      patientId,
      { registration_status: 'archived', version: patient.version },
      patient.version
    );

    await this.auditService.write({
      actor_type: 'staff',
      action: 'patient.archive',
      actor_id: actor.id,
      entity: 'patient',
      entity_id: patientId,
      ip: ipAddress,
      metadata: { hn: patient.hn },
    });

    return updated;
  }

  // =========================================================================
  // 8. PDPA BIOMETRIC DELETION (DELETE /api/face/:patientId)
  // =========================================================================
  async deleteBiometrics(
    patientId: string,
    actor: UserSession,
    ipAddress?: string
  ): Promise<void> {
    const patient = await this.getPatientById(patientId, actor, ipAddress);

    await this.repo.deleteBiometrics(patient.id);

    await this.auditService.write({
      actor_type: 'staff',
      action: 'patient.delete_biometrics',
      actor_id: actor.id,
      entity: 'patient',
      entity_id: patient.id,
      ip: ipAddress,
      metadata: {
        hn: patient.hn,
        reason: 'PDPA right to erasure request',
      },
    });
  }
}

export const defaultPatientService = new PatientService();
