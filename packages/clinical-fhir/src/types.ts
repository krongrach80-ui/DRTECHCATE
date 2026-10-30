/**
 * packages/clinical-fhir/src/types.ts
 *
 * HL7 FHIR Release 4 (v4.0.1) CLINICAL DATA TYPES
 * Interoperability definitions for EMR/EHR integration (Epic, Cerner, MediTech):
 * - Observation (ROM, Reps, Biomechanical Compensation, Pain)
 * - CarePlan (Physical Therapy Prescription & Protocol Alignment)
 * - Condition (ICD-10 Musculoskeletal Diagnostic Context)
 */

export interface FHIRCoding {
  system: string;
  code: string;
  display: string;
}

export interface FHIRCodeableConcept {
  coding: FHIRCoding[];
  text?: string;
}

export interface FHIRReference {
  reference: string;
  display?: string;
  type?: string;
}

export interface FHIRQuantity {
  value: number;
  unit: string;
  system: string;
  code: string;
}

export interface FHIRObservationComponent {
  code: FHIRCodeableConcept;
  valueQuantity?: FHIRQuantity;
  valueString?: string;
  valueBoolean?: boolean;
}

export type FHIRObservationStatus =
  | 'registered'
  | 'preliminary'
  | 'final'
  | 'amended'
  | 'corrected'
  | 'cancelled';

export interface FHIRObservation {
  resourceType: 'Observation';
  id: string;
  status: FHIRObservationStatus;
  category: FHIRCodeableConcept[];
  code: FHIRCodeableConcept;
  subject: FHIRReference;
  focus?: FHIRReference[];
  effectiveDateTime: string;
  performer?: FHIRReference[];
  valueQuantity?: FHIRQuantity;
  bodySite?: FHIRCodeableConcept;
  component?: FHIRObservationComponent[];
}

export interface FHIRCarePlanActivity {
  detail?: {
    code?: FHIRCodeableConcept;
    status: 'not-started' | 'scheduled' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled';
    description?: string;
    scheduledTiming?: {
      repeat?: {
        frequency?: number;
        period?: number;
        periodUnit?: 'd' | 'wk' | 'mo';
      };
    };
  };
}

export interface FHIRCarePlan {
  resourceType: 'CarePlan';
  id: string;
  status: 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed' | 'entered-in-error' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'option';
  title?: string;
  description?: string;
  subject: FHIRReference;
  period?: {
    start?: string;
    end?: string;
  };
  careTeam?: FHIRReference[];
  addresses?: FHIRReference[];
  activity?: FHIRCarePlanActivity[];
}

export interface FHIRCondition {
  resourceType: 'Condition';
  id: string;
  clinicalStatus: FHIRCodeableConcept;
  verificationStatus: FHIRCodeableConcept;
  category: FHIRCodeableConcept[];
  severity?: FHIRCodeableConcept;
  code: FHIRCodeableConcept;
  bodySite?: FHIRCodeableConcept[];
  subject: FHIRReference;
  recordedDate?: string;
}
