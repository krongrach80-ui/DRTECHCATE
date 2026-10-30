/**
 * packages/clinical-fhir/src/__tests__/fhirMapper.test.ts
 *
 * Unit tests for HL7 FHIR v4 Clinical Interoperability Mappers
 */

import { describe, it, expect } from 'vitest';
import {
  mapSessionToFHIRObservation,
  mapPrescriptionToFHIRCarePlan,
  mapConditionToFHIR,
  CLINICAL_SYSTEMS,
} from '../index';
import { ExerciseSessionTelemetry } from '../../../pose-engine/src/types/exerciseConfig';

describe('HL7 FHIR v4 Clinical Data Interoperability', () => {
  const mockTelemetry: ExerciseSessionTelemetry = {
    exerciseId: 'ex-shoulder-pendulum',
    exerciseName: 'Shoulder Pendulum',
    patientId: 'HN-884920',
    totalRepsTarget: 10,
    completedReps: 10,
    incorrectReps: 0,
    totalSetsCompleted: 3,
    maxAngleAchievedDeg: 135.5,
    averageAngleDeg: 128.2,
    averageHoldDurationSec: 2.0,
    consistencyScorePercent: 98,
    compensationEventsCount: 0,
    scapularHikingRate: 0.04,
    trunkCompensationIndex: 4.1,
    averageVelocityDegPerSec: 72.5,
    completionMode: 'ai_verified',
    painReported: false,
    sessionDurationSec: 140,
    timestamp: '2026-10-30T10:30:00Z',
  };

  it('1. maps exercise telemetry to valid HL7 FHIR v4 Observation resource', () => {
    const obs = mapSessionToFHIRObservation(mockTelemetry, 'HN-884920', 'PT-SOMCHAI');

    expect(obs.resourceType).toBe('Observation');
    expect(obs.status).toBe('final');
    expect(obs.subject.reference).toBe('Patient/HN-884920');
    expect(obs.performer?.[0].reference).toBe('Practitioner/PT-SOMCHAI');

    // Primary LOINC code for active ROM
    const loincCoding = obs.code.coding.find((c) => c.system === CLINICAL_SYSTEMS.LOINC);
    expect(loincCoding).toBeDefined();
    expect(loincCoding?.code).toBe('80317-1');

    // Max ROM valueQuantity
    expect(obs.valueQuantity?.value).toBe(135.5);
    expect(obs.valueQuantity?.code).toBe('deg');
    expect(obs.valueQuantity?.system).toBe(CLINICAL_SYSTEMS.UCUM);
  });

  it('2. maps components: Avg ROM, Valid Reps, Scapular Hiking, Trunk Tilt, and Pain Event', () => {
    const obs = mapSessionToFHIRObservation(mockTelemetry, 'HN-884920');
    const components = obs.component || [];

    // 1. Avg ROM
    const avgRomComp = components.find((c) =>
      c.code.coding.some((code) => code.code === '80315-5')
    );
    expect(avgRomComp).toBeDefined();
    expect(avgRomComp?.valueQuantity?.value).toBe(128.2);

    // 2. Completed Reps
    const repsComp = components.find((c) =>
      c.code.coding.some((code) => code.code === '88121-9')
    );
    expect(repsComp).toBeDefined();
    expect(repsComp?.valueQuantity?.value).toBe(10);

    // 3. Scapular Hiking Rate
    const hikingComp = components.find((c) =>
      c.code.coding.some((code) => code.code === 'COMP-SCAPULAR-HIKE')
    );
    expect(hikingComp).toBeDefined();
    expect(hikingComp?.valueQuantity?.value).toBe(0.04);

    // 4. Trunk Compensation Index
    const trunkComp = components.find((c) =>
      c.code.coding.some((code) => code.code === 'COMP-TRUNK-LATERAL')
    );
    expect(trunkComp).toBeDefined();
    expect(trunkComp?.valueQuantity?.value).toBe(4.1);

    // 5. Pain Reported Event
    const painComp = components.find((c) =>
      c.code.coding.some((code) => code.code === '72514-3')
    );
    expect(painComp).toBeDefined();
    expect(painComp?.valueBoolean).toBe(false);
  });

  it('3. maps Physical Therapy protocol to HL7 FHIR v4 CarePlan resource', () => {
    const carePlan = mapPrescriptionToFHIRCarePlan({
      carePlanId: 'cp-shoulder-rehab-01',
      patientHn: 'HN-884920',
      protocolTitle: 'Shoulder Impingement Protocol A',
      practitionerId: 'PT-01',
      targetJoint: 'shoulder',
      exercises: [
        { name: 'Codman Shoulder Pendulum', sets: 3, repsPerSet: 10, frequencyPerWeek: 3 },
        { name: 'Scapular Retraction', sets: 2, repsPerSet: 12, frequencyPerWeek: 3 },
      ],
    });

    expect(carePlan.resourceType).toBe('CarePlan');
    expect(carePlan.status).toBe('active');
    expect(carePlan.intent).toBe('plan');
    expect(carePlan.subject.reference).toBe('Patient/HN-884920');
    expect(carePlan.activity).toHaveLength(2);
    expect(carePlan.activity?.[0].detail?.status).toBe('in-progress');
  });

  it('4. maps clinical diagnostic context to HL7 FHIR v4 Condition resource', () => {
    const condition = mapConditionToFHIR(
      'cond-rotator-cuff-01',
      'HN-884920',
      'M75.1',
      'Rotator cuff tear or rupture'
    );

    expect(condition.resourceType).toBe('Condition');
    expect(condition.code.coding[0].code).toBe('M75.1');
    expect(condition.code.coding[0].system).toBe(CLINICAL_SYSTEMS.ICD_10);
    expect(condition.subject.reference).toBe('Patient/HN-884920');
    expect(condition.clinicalStatus.coding[0].code).toBe('active');
  });
});
