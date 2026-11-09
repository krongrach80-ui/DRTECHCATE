import { describe, it, expect } from 'vitest';
import { RepStateMachine } from '../engine/repStateMachine';
import { CLINICAL_EXERCISES_CONFIG } from '../presets/exercises.config';
import { ExerciseDetectionConfig, PoseEngineLandmark } from '../types/exerciseConfig';

/**
 * Helper to build a standard anatomical skeleton in camera space.
 * Origin at camera center. User facing camera:
 * Left shoulder (11): x = 0.6, y = 0.3, z = 0.0
 * Right shoulder (12): x = 0.4, y = 0.3, z = 0.0
 * Left hip (23): x = 0.6, y = 0.6, z = 0.0
 * Right hip (24): x = 0.4, y = 0.6, z = 0.0
 */
function createBaseSkeleton(): PoseEngineLandmark[] {
  const skel: PoseEngineLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0.0,
    visibility: 0.95,
  }));

  // Head
  skel[0] = { x: 0.5, y: 0.15, z: 0.0, visibility: 0.95 }; // Nose
  skel[7] = { x: 0.55, y: 0.15, z: 0.0, visibility: 0.95 }; // L Ear
  skel[8] = { x: 0.45, y: 0.15, z: 0.0, visibility: 0.95 }; // R Ear

  // Torso
  skel[11] = { x: 0.6, y: 0.3, z: 0.0, visibility: 0.95 }; // L Shoulder
  skel[12] = { x: 0.4, y: 0.3, z: 0.0, visibility: 0.95 }; // R Shoulder
  skel[23] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 }; // L Hip
  skel[24] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 }; // R Hip

  // Left arm resting at side
  skel[13] = { x: 0.6, y: 0.45, z: 0.0, visibility: 0.95 }; // L Elbow
  skel[15] = { x: 0.6, y: 0.6, z: 0.0, visibility: 0.95 };  // L Wrist

  // Right arm resting at side
  skel[14] = { x: 0.4, y: 0.45, z: 0.0, visibility: 0.95 }; // R Elbow
  skel[16] = { x: 0.4, y: 0.6, z: 0.0, visibility: 0.95 };  // R Wrist

  return skel;
}

describe('Clinical Shoulder Elevation Plane Detection & Enforcement Suite', () => {
  // Test 1: Shoulder Abduction - Right arm in Coronal Plane (Correct) -> Completes rep
  it('1. Shoulder Abduction (Right Arm, Coronal Plane): Completes rep with high accuracy', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
      side: 'right',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'].angleMechanics!,
        holdDurationSec: 0.5, // 500ms hold
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    // Resting skeleton (elevation ~10 deg < 30 deg)
    const restSkel = createBaseSkeleton();
    let res = machine.evaluate(restSkel, time);
    expect(res.phase).toBe('IDLE');
    expect(res.completedReps).toBe(0);

    // Target skeleton: Right arm raised laterally to side (+X away from torso, x=0.15)
    // Elevation angle is ~90 deg, plane angle is ~0 deg (Coronal)
    const targetSkel = createBaseSkeleton();
    targetSkel[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
    targetSkel[16] = { x: 0.10, y: 0.3, z: 0.0, visibility: 0.95 };

    // Move into target zone (3 frames for 1€ filter to converge into target zone)
    time += 100;
    res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);

    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.accuracyPercent).toBeGreaterThanOrEqual(80);
    expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(false);

    // Hold finishes after 500ms
    time += 500;
    res = machine.evaluate(targetSkel, time);
    expect(res.phase).toBe('RETURNING_TO_START');

    // Return to resting position
    for (let i = 0; i < 4; i++) {
      time += 100;
      res = machine.evaluate(restSkel, time);
    }
    expect(res.completedReps).toBe(1);
  });

  // Test 2: Shoulder Abduction - Left arm in Coronal Plane (Correct) -> Completes rep
  it('2. Shoulder Abduction (Left Arm, Coronal Plane): Completes rep with high accuracy', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
      side: 'left',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'].angleMechanics!,
        holdDurationSec: 0.5,
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    const restSkel = createBaseSkeleton();
    machine.evaluate(restSkel, time);

    // Target: Left arm raised laterally (+X away from torso, x=0.90)
    const targetSkel = createBaseSkeleton();
    targetSkel[13] = { x: 0.75, y: 0.3, z: 0.0, visibility: 0.95 };
    targetSkel[15] = { x: 0.90, y: 0.3, z: 0.0, visibility: 0.95 };

    time += 100;
    let res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);

    expect(res.phase).toBe('HOLDING_TARGET');

    time += 500;
    res = machine.evaluate(targetSkel, time);
    expect(res.phase).toBe('RETURNING_TO_START');

    for (let i = 0; i < 4; i++) {
      time += 100;
      res = machine.evaluate(restSkel, time);
    }
    expect(res.completedReps).toBe(1);
  });

  // Test 3: Shoulder Abduction - Raised forward (Flexion plane) -> Blocked, warning emitted
  it('3. Shoulder Abduction with arm raised forward: 0 reps, warning "ทำผิดท่า: ให้กางแขนออกด้านข้าง"', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
      side: 'right',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'].angleMechanics!,
        holdDurationSec: 0.5,
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    const restSkel = createBaseSkeleton();
    machine.evaluate(restSkel, time);

    // Forward raise: Right arm raised into Sagittal plane (z = -0.3, x remains at shoulder line 0.4)
    // Elevation is ~90 deg, plane is ~90 deg (Flexion)
    const forwardSkel = createBaseSkeleton();
    forwardSkel[14] = { x: 0.4, y: 0.3, z: -0.15, visibility: 0.95 };
    forwardSkel[16] = { x: 0.4, y: 0.3, z: -0.30, visibility: 0.95 };

    let res = machine.evaluate(restSkel, time);
    for (let i = 0; i < 8; i++) {
      time += 100;
      res = machine.evaluate(forwardSkel, time);
    }

    // Must NOT reach HOLDING_TARGET, 0 reps completed
    expect(res.phase).not.toBe('HOLDING_TARGET');
    expect(res.completedReps).toBe(0);
    expect(res.isInsideTargetZone).toBe(false);
    expect(res.accuracyPercent).toBe(0);
    expect(res.coachingMessageTh).toBe('ทำผิดท่า: ให้กางแขนออกด้านข้าง');
    expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(true);
  });

  // Test 4: Active Shoulder Flexion - Right arm in Sagittal Plane (Correct) -> Completes rep
  it('4. Active Shoulder Flexion (Right Arm, Sagittal Plane): Completes rep with high accuracy', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'],
      side: 'right',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'].angleMechanics!,
        targetMinDeg: 120,
        holdDurationSec: 0.5,
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    const restSkel = createBaseSkeleton();
    machine.evaluate(restSkel, time);

    // Flexion forward-up raise: z = -0.35, y = 0.1, x = 0.4
    const targetSkel = createBaseSkeleton();
    targetSkel[14] = { x: 0.4, y: 0.2, z: -0.20, visibility: 0.95 };
    targetSkel[16] = { x: 0.4, y: 0.05, z: -0.35, visibility: 0.95 };

    time += 100;
    let res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);

    expect(res.phase).toBe('HOLDING_TARGET');
    expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(false);

    time += 500;
    res = machine.evaluate(targetSkel, time);
    expect(res.phase).toBe('RETURNING_TO_START');

    for (let i = 0; i < 4; i++) {
      time += 100;
      res = machine.evaluate(restSkel, time);
    }
    expect(res.completedReps).toBe(1);
  });

  // Test 5: Active Shoulder Flexion - Left arm in Sagittal Plane (Correct) -> Completes rep
  it('5. Active Shoulder Flexion (Left Arm, Sagittal Plane): Completes rep with high accuracy', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'],
      side: 'left',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'].angleMechanics!,
        targetMinDeg: 120,
        holdDurationSec: 0.5,
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    const restSkel = createBaseSkeleton();
    machine.evaluate(restSkel, time);

    // Left arm forward-up raise: x = 0.6, z = -0.35
    const targetSkel = createBaseSkeleton();
    targetSkel[13] = { x: 0.6, y: 0.2, z: -0.20, visibility: 0.95 };
    targetSkel[15] = { x: 0.6, y: 0.05, z: -0.35, visibility: 0.95 };

    time += 100;
    let res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);

    expect(res.phase).toBe('HOLDING_TARGET');

    time += 500;
    res = machine.evaluate(targetSkel, time);
    expect(res.phase).toBe('RETURNING_TO_START');

    for (let i = 0; i < 4; i++) {
      time += 100;
      res = machine.evaluate(restSkel, time);
    }
    expect(res.completedReps).toBe(1);
  });

  // Test 6: Active Shoulder Flexion - Raised sideways (Abduction plane) -> Blocked, warning emitted
  it('6. Active Shoulder Flexion with arm raised sideways: 0 reps, warning "ทำผิดท่า: ให้ยกแขนไปข้างหน้า"', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'],
      side: 'right',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'].angleMechanics!,
        targetMinDeg: 120,
        holdDurationSec: 0.5,
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    const restSkel = createBaseSkeleton();
    machine.evaluate(restSkel, time);

    // Raised sideways to 140 deg in coronal plane (x = 0.1, z = 0)
    const sideSkel = createBaseSkeleton();
    sideSkel[14] = { x: 0.2, y: 0.2, z: 0.0, visibility: 0.95 };
    sideSkel[16] = { x: 0.05, y: 0.05, z: 0.0, visibility: 0.95 };

    let res = machine.evaluate(restSkel, time);
    for (let i = 0; i < 8; i++) {
      time += 100;
      res = machine.evaluate(sideSkel, time);
    }

    expect(res.phase).not.toBe('HOLDING_TARGET');
    expect(res.completedReps).toBe(0);
    expect(res.isInsideTargetZone).toBe(false);
    expect(res.accuracyPercent).toBe(0);
    expect(res.coachingMessageTh).toBe('ทำผิดท่า: ให้ยกแขนไปข้างหน้า');
    expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(true);
  });

  // Test 7: Scaption Zone (~45 deg diagonal) -> Friendly cueing, does not complete rep
  it('7. Scaption Zone (~45°): Emits friendly cueing, does not count as completed rep', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
      side: 'right',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'].angleMechanics!,
        holdDurationSec: 0.5,
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    const restSkel = createBaseSkeleton();
    machine.evaluate(restSkel, time);

    // Diagonal raise: 45° between side and front (x = 0.20, z = -0.21)
    const scaptionSkel = createBaseSkeleton();
    scaptionSkel[14] = { x: 0.30, y: 0.3, z: -0.10, visibility: 0.95 };
    scaptionSkel[16] = { x: 0.20, y: 0.3, z: -0.21, visibility: 0.95 };

    let res = machine.evaluate(restSkel, time);
    for (let i = 0; i < 8; i++) {
      time += 100;
      res = machine.evaluate(scaptionSkel, time);
    }

    // Should give cue to move slightly more to the side, and NOT count rep
    expect(res.phase).not.toBe('HOLDING_TARGET');
    expect(res.completedReps).toBe(0);
    expect(res.isInsideTargetZone).toBe(false);
    expect(res.coachingMessageTh).toContain('ใกล้เคียง');
    expect(res.activeWarnings.some((w) => w.ruleId === 'scaption_plane_cue')).toBe(true);
  });

  // Test 8: Low elevation (< 30 deg) -> Does not trigger wrong plane warning
  it('8. Arm at low elevation (< 30° resting): Does not trigger wrong plane warning', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['active-shoulder-flexion'],
      side: 'right',
    };
    const machine = new RepStateMachine(config);

    const restSkel = createBaseSkeleton();
    const res = machine.evaluate(restSkel, 1000);

    expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(false);
    expect(res.activeWarnings.some((w) => w.ruleId === 'scaption_plane_cue')).toBe(false);
  });

  // Test 9: Mid-movement Direction Switch (Raises in correct plane, then deviates to wrong plane midway) -> Blocked
  it('9. Mid-movement direction change: Dropping into wrong plane cancels hold and blocks rep', () => {
    const config: ExerciseDetectionConfig = {
      ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'],
      side: 'right',
      angleMechanics: {
        ...CLINICAL_EXERCISES_CONFIG['shoulder-abduction'].angleMechanics!,
        holdDurationSec: 0.5,
      },
    };
    const machine = new RepStateMachine(config);
    let time = 1000;

    const restSkel = createBaseSkeleton();
    machine.evaluate(restSkel, time);

    // Step 1: Start raising correctly in coronal plane
    const targetSkel = createBaseSkeleton();
    targetSkel[14] = { x: 0.25, y: 0.3, z: 0.0, visibility: 0.95 };
    targetSkel[16] = { x: 0.10, y: 0.3, z: 0.0, visibility: 0.95 };

    time += 100;
    let res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);
    time += 100;
    res = machine.evaluate(targetSkel, time);
    expect(res.phase).toBe('HOLDING_TARGET');

    // Step 2: Midway through hold (at 200ms), patient rotates arm forward into sagittal plane (wrong direction!)
    const forwardSkel = createBaseSkeleton();
    forwardSkel[14] = { x: 0.4, y: 0.3, z: -0.15, visibility: 0.95 };
    forwardSkel[16] = { x: 0.4, y: 0.3, z: -0.30, visibility: 0.95 };

    for (let i = 0; i < 4; i++) {
      time += 100;
      res = machine.evaluate(forwardSkel, time);
    }

    // Must be kicked out of HOLDING_TARGET, hold reset, warning shown, 0 reps
    expect(res.phase).toBe('MOVING_TO_TARGET');
    expect(res.completedReps).toBe(0);
    expect(res.coachingMessageTh).toBe('ทำผิดท่า: ให้กางแขนออกด้านข้าง');
  });

  // Test 10: Non-Regression on other exercises (e.g. Elbow Flexion, Knee Extension, Sit-to-Stand)
  it('10. Non-regression: Other exercises without elevationPlane config evaluate without plane errors', () => {
    const elbowConfig = CLINICAL_EXERCISES_CONFIG['elbow-flexion-extension'];
    expect(elbowConfig.elevationPlane).toBeUndefined();

    const machine = new RepStateMachine({
      ...elbowConfig,
      side: 'right',
    });

    const skel = createBaseSkeleton();
    const res = machine.evaluate(skel, 1000);
    expect(res.activeWarnings.some((w) => w.ruleId === 'wrong_elevation_plane')).toBe(false);
  });
});
