import { defaultSmartOnboardingService } from '../apps/api/src/modules/smart-onboarding/service';
import { defaultPatientRepository } from '../apps/api/src/modules/patients/repository';

async function main() {
  console.log('--- 1. Testing registerPatient (NewPatientRegistrationModal flow) ---');
  const testHN = `P-${Math.floor(1000 + Math.random() * 9000)}`;
  const registered = await defaultSmartOnboardingService.registerPatient({
    hn: testHN,
    first_name: 'asda ทดสอบ',
    last_name: 'ระบบจริง',
    age: 28,
    sex: 'male',
    phone: '0812345678',
    injury: 'ปวดหลังส่วนล่าง',
    pin: '5912',
    frames: [
      {
        pose: 'front',
        embedding: Array.from({ length: 512 }, (_, i) => Math.sin(i * 0.1) * 0.044),
      },
    ],
  });

  console.log('✓ registerPatient success:', registered);

  console.log('--- 2. Testing pinLogin ---');
  const pinRes = await defaultSmartOnboardingService.pinLogin('5912');
  console.log('✓ pinLogin result:', {
    matched: pinRes.matched,
    patient_hn: pinRes.patient?.hn,
    patient_name: `${pinRes.patient?.first_name} ${pinRes.patient?.last_name}`,
  });

  console.log('--- 3. Testing PatientRepository.listPatients (/admin Directory) ---');
  const listRes = await defaultPatientRepository.listPatients({ page: 1, limit: 10 });
  console.log(`✓ Total patients in directory: ${listRes.total}, count fetched: ${listRes.patients.length}`);
  const found = listRes.patients.find((p) => p.hn === testHN || p.first_name.includes('asda'));
  console.log('✓ Found registered patient in directory:', !!found, found ? `HN: ${found.hn}, Name: ${found.first_name}` : 'Not found');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
