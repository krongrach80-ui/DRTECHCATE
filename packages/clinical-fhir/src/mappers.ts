/**
 * packages/clinical-fhir/src/mappers.ts
 *
 * HL7 FHIR v4 CLINICAL RESOURCE MAPPERS
 * Transforms DrTech.Care biomechanical kinematics telemetry into standard
 * HL7 FHIR v4 Observation, CarePlan, and Condition resources.
 */

import {
  FHIRObservation,
  FHIRCarePlan,
  FHIRCondition,
  FHIRCodeableConcept,
  FHIRQuantity,
} from './types';
import { ExerciseSessionTelemetry } from '../../pose-engine/src/types/exerciseConfig';

/**
 * Standard Clinical Vocabulary Systems
 */
export const CLINICAL_SYSTEMS = {
  LOINC: 'http://loinc.org',
  SNOMED_CT: 'http://snomed.info/sct',
  UCUM: 'http://unitsofmeasure.org',
  ICD_10: 'http://hl7.org/fhir/sid/icd-10',
  DRTECH_SYSTEM: 'https://drtech.care/fhir/terminology',
} as const;

/**
 * Maps ExerciseSessionTelemetry into an HL7 FHIR v4 Observation resource
 */
export function mapSessionToFHIRObservation(
  telemetry: ExerciseSessionTelemetry,
  patientHn: string,
  practitionerId?: string
): FHIRObservation {
  const observationId = `obs-${telemetry.exerciseId}-${Date.now()}`;

  // Primary LOINC code for active joint range of motion (80317-1)
  const primaryCode: FHIRCodeableConcept = {
    coding: [
      {
        system: CLINICAL_SYSTEMS.LOINC,
        code: '80317-1',
        display: 'Joint range of motion active',
      },
      {
        system: CLINICAL_SYSTEMS.SNOMED_CT,
        code: '399307001',
        display: 'Range of motion',
      },
    ],
    text: `การฝึกกายภาพบำบัด: ${telemetry.exerciseName}`,
  };

  // Primary value: Maximum ROM achieved
  const maxRomQuantity: FHIRQuantity = {
    value: Math.round(telemetry.maxAngleAchievedDeg * 10) / 10,
    unit: 'degrees',
    system: CLINICAL_SYSTEMS.UCUM,
    code: 'deg',
  };

  // Component observations
  const components: FHIRObservation['component'] = [
    // 1. Average ROM
    {
      code: {
        coding: [
          {
            system: CLINICAL_SYSTEMS.LOINC,
            code: '80315-5',
            display: 'Average Range of Motion',
          },
        ],
        text: 'Average Range of Motion (องศาเฉลี่ย)',
      },
      valueQuantity: {
        value: Math.round(telemetry.averageAngleDeg * 10) / 10,
        unit: 'degrees',
        system: CLINICAL_SYSTEMS.UCUM,
        code: 'deg',
      },
    },

    // 2. Total Valid Repetitions
    {
      code: {
        coding: [
          {
            system: CLINICAL_SYSTEMS.LOINC,
            code: '88121-9',
            display: 'Number of repetitions',
          },
        ],
        text: 'Total Completed Repetitions',
      },
      valueQuantity: {
        value: telemetry.completedReps,
        unit: 'count',
        system: CLINICAL_SYSTEMS.UCUM,
        code: '{count}',
      },
    },

    // 3. Scapular Hiking Rate
    {
      code: {
        coding: [
          {
            system: CLINICAL_SYSTEMS.DRTECH_SYSTEM,
            code: 'COMP-SCAPULAR-HIKE',
            display: 'Scapular Hiking Compensation Ratio',
          },
        ],
        text: 'อัตราการยกหัวไหล่ชดเชย (Scapular Hiking Ratio)',
      },
      valueQuantity: {
        value: Math.round((telemetry.scapularHikingRate ?? 0) * 100) / 100,
        unit: 'ratio',
        system: CLINICAL_SYSTEMS.UCUM,
        code: '1',
      },
    },

    // 4. Trunk Compensation Index (Lateral Flexion)
    {
      code: {
        coding: [
          {
            system: CLINICAL_SYSTEMS.DRTECH_SYSTEM,
            code: 'COMP-TRUNK-LATERAL',
            display: 'Trunk Lateral Flexion Compensation Angle',
          },
        ],
        text: 'มุมเอียงลำตัวชดเชย (Trunk Lateral Flexion)',
      },
      valueQuantity: {
        value: Math.round((telemetry.trunkCompensationIndex ?? 0) * 10) / 10,
        unit: 'degrees',
        system: CLINICAL_SYSTEMS.UCUM,
        code: 'deg',
      },
    },

    // 5. Pain Reported Event
    {
      code: {
        coding: [
          {
            system: CLINICAL_SYSTEMS.LOINC,
            code: '72514-3',
            display: 'Pain reported during physical therapy session',
          },
        ],
        text: 'รายงานอาการเจ็บปวดขณะฝึก',
      },
      valueBoolean: telemetry.painReported,
    },
  ];

  // Optional: Angular velocity component
  if (telemetry.averageVelocityDegPerSec !== undefined) {
    components.push({
      code: {
        coding: [
          {
            system: CLINICAL_SYSTEMS.DRTECH_SYSTEM,
            code: 'KINEMATICS-ANGULAR-VELOCITY',
            display: 'Mean Angular Velocity',
          },
        ],
        text: 'ความเร็วเชิงมุมเฉลี่ย (Mean Angular Velocity)',
      },
      valueQuantity: {
        value: Math.round(telemetry.averageVelocityDegPerSec * 10) / 10,
        unit: 'deg/s',
        system: CLINICAL_SYSTEMS.UCUM,
        code: 'deg/s',
      },
    });
  }

  const observation: FHIRObservation = {
    resourceType: 'Observation',
    id: observationId,
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'therapy',
            display: 'Therapy',
          },
        ],
      },
    ],
    code: primaryCode,
    subject: {
      reference: `Patient/${patientHn}`,
      display: `Patient HN ${patientHn}`,
    },
    effectiveDateTime: telemetry.timestamp || new Date().toISOString(),
    valueQuantity: maxRomQuantity,
    component: components,
  };

  if (practitionerId) {
    observation.performer = [
      {
        reference: `Practitioner/${practitionerId}`,
        type: 'Practitioner',
      },
    ];
  }

  return observation;
}

export interface CarePlanProtocolInput {
  carePlanId: string;
  patientHn: string;
  protocolTitle: string;
  practitionerId?: string;
  targetJoint?: string;
  exercises: Array<{
    name: string;
    repsPerSet: number;
    sets: number;
    frequencyPerWeek?: number;
  }>;
}

/**
 * Maps a Physical Therapy prescription protocol into an HL7 FHIR v4 CarePlan resource
 */
export function mapPrescriptionToFHIRCarePlan(
  input: CarePlanProtocolInput
): FHIRCarePlan {
  return {
    resourceType: 'CarePlan',
    id: input.carePlanId,
    status: 'active',
    intent: 'plan',
    title: input.protocolTitle,
    description: `แผนการฟื้นฟูกายภาพบำบัดข้อต่อ: ${input.targetJoint || 'ทั่วไป'}`,
    subject: {
      reference: `Patient/${input.patientHn}`,
      display: `Patient HN ${input.patientHn}`,
    },
    period: {
      start: new Date().toISOString(),
    },
    careTeam: input.practitionerId
      ? [
          {
            reference: `Practitioner/${input.practitionerId}`,
            display: 'Licensed Physical Therapist',
          },
        ]
      : undefined,
    activity: input.exercises.map((ex) => ({
      detail: {
        code: {
          coding: [
            {
              system: CLINICAL_SYSTEMS.SNOMED_CT,
              code: '229177007',
              display: ex.name,
            },
          ],
          text: `${ex.name} (${ex.sets} เซ็ต x ${ex.repsPerSet} ครั้ง)`,
        },
        status: 'in-progress',
        scheduledTiming: {
          repeat: {
            frequency: ex.frequencyPerWeek || 3,
            period: 1,
            periodUnit: 'wk',
          },
        },
      },
    })),
  };
}

/**
 * Maps a diagnostic condition into an HL7 FHIR v4 Condition resource
 */
export function mapConditionToFHIR(
  conditionId: string,
  patientHn: string,
  icd10Code: string,
  diagnosisTextTh: string
): FHIRCondition {
  return {
    resourceType: 'Condition',
    id: conditionId,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: CLINICAL_SYSTEMS.ICD_10,
          code: icd10Code,
          display: diagnosisTextTh,
        },
      ],
      text: diagnosisTextTh,
    },
    subject: {
      reference: `Patient/${patientHn}`,
    },
    recordedDate: new Date().toISOString(),
  };
}
