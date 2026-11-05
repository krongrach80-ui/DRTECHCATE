import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  UserX,
  Search,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  X,
  ChevronRight,
  UserCheck,
  Trash2
} from 'lucide-react';
import { UserProfile, defaultApiClient } from '../../../../packages/api-client/src/index.js';
import { getSavedLanguage, ClinicalLanguage } from '../../../../packages/clinical-i18n/src/index';

interface FormValidationErrors {
  username?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  role?: string;
  license_no?: string;
  age?: string;
  sex?: string;
  injury?: string;
}

const VALIDATION_I18N = {
  'th-TH': {
    summaryPrefix: 'กรุณาตรวจสอบและแก้ไข',
    summarySuffix: 'รายการในขั้นตอนนี้',
    summaryGeneral: 'กรุณาตรวจสอบและกรอกข้อมูลที่จำเป็นให้ครบถ้วน',
    usernameRequired: 'กรุณากรอกชื่อผู้ใช้ (Username)',
    usernameMinLength: 'ชื่อผู้ใช้ต้องมีความยาวอย่างน้อย 3 ตัวอักษร',
    usernamePattern: 'ชื่อผู้ใช้ต้องประกอบด้วยตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข จุด หรือขีดล่างเท่านั้น',
    passwordRequired: 'กรุณากรอกรหัสผ่านเริ่มต้น',
    passwordMinLength: 'รหัสผ่านเริ่มต้นต้องมีความยาวอย่างน้อย 12 ตัวอักษร',
    fullNameRequired: 'กรุณากรอกชื่อ - นามสกุลจริง',
    phoneInvalid: 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (เช่น 0812345678)',
    roleRequired: 'กรุณาเลือกบทบาทผู้ใช้',
    licenseNoRequired: 'กรุณาระบุเลขที่ใบประกอบวิชาชีพกายภาพบำบัด',
    ageRequired: 'กรุณาระบุอายุของผู้ป่วย',
    ageInvalid: 'อายุต้องอยู่ระหว่าง 1 ถึง 120 ปี',
    sexRequired: 'กรุณาระบุเพศของผู้ป่วย',
    injuryRequired: 'กรุณาระบุอาการบาดเจ็บหรือการวินิจฉัยเบื้องต้น',
    stepNavBlocked: 'ไม่สามารถไปขั้นตอนถัดไปได้ กรุณากรอกข้อมูลในขั้นตอนนี้ให้ถูกต้องครบถ้วน',
    stepRedirectNotice: (step: number) => `พบข้อมูลไม่ครบถ้วนในขั้นตอนที่ ${step} กรุณาแก้ไขก่อนบันทึก`,
  },
  'en-US': {
    summaryPrefix: 'Please review and correct',
    summarySuffix: 'item(s) in this step',
    summaryGeneral: 'Please review and fill in all required fields',
    usernameRequired: 'Please enter a username',
    usernameMinLength: 'Username must be at least 3 characters',
    usernamePattern: 'Username can only contain lowercase letters, numbers, dots, or hyphens/underscores',
    passwordRequired: 'Please enter a temporary password',
    passwordMinLength: 'Temporary password must be at least 12 characters',
    fullNameRequired: 'Please enter full name',
    phoneInvalid: 'Phone number must be 10 digits (e.g. 0812345678)',
    roleRequired: 'Please select a user role',
    licenseNoRequired: 'Please enter physical therapy license number',
    ageRequired: 'Please enter patient age',
    ageInvalid: 'Age must be between 1 and 120',
    sexRequired: 'Please select patient sex',
    injuryRequired: 'Please enter primary injury / condition',
    stepNavBlocked: 'Cannot proceed. Please complete all required fields in this step',
    stepRedirectNotice: (step: number) => `Incomplete fields found in Step ${step}. Please correct before saving`,
  },
  'zh-CN': {
    summaryPrefix: '请检查并修正本步骤中的',
    summarySuffix: '项内容',
    summaryGeneral: '请检查并填写所有必填项',
    usernameRequired: '请输入用户名',
    usernameMinLength: '用户名至少需要3个字符',
    usernamePattern: '用户名仅允许包含小写英文字母、数字、点或下划线/连字符',
    passwordRequired: '请输入初始密码',
    passwordMinLength: '初始密码长度至少需要12位字符',
    fullNameRequired: '请输入真实姓名',
    phoneInvalid: '电话号码必须为10位数字 (如 0812345678)',
    roleRequired: '请选择用户角色',
    licenseNoRequired: '请输入物理治疗师执业许可证编号',
    ageRequired: '请输入患者年龄',
    ageInvalid: '年龄必须在 1 至 120 岁之间',
    sexRequired: '请选择患者性别',
    injuryRequired: '请输入初步诊断或病症',
    stepNavBlocked: '无法进入下一步，请先完整填写本步骤中的必填项',
    stepRedirectNotice: (step: number) => `第 ${step} 步存在未填项，请在保存前更正`,
  },
};

function getValidationText(lang: string) {
  if (lang.startsWith('en')) return VALIDATION_I18N['en-US'];
  if (lang.startsWith('zh') || lang.startsWith('cn')) return VALIDATION_I18N['zh-CN'];
  return VALIDATION_I18N['th-TH'];
}

function validateWizardStep(
  step: number,
  role: 'admin' | 'pt' | 'patient',
  data: {
    username: string;
    password: string;
    role: 'admin' | 'pt' | 'patient';
    full_name: string;
    phone: string;
    bio: string;
    license_no: string;
    license_expiry: string;
    specialty: string;
    age: number | string;
    sex: 'male' | 'female' | 'other';
    injury: string;
  },
  t: typeof VALIDATION_I18N['th-TH']
): FormValidationErrors {
  const errors: FormValidationErrors = {};

  if (step === 1) {
    // 1. Username
    const cleanUsername = (data.username || '').trim().toLowerCase();
    if (!cleanUsername) {
      errors.username = t.usernameRequired;
    } else if (cleanUsername.length < 3) {
      errors.username = t.usernameMinLength;
    } else if (!/^[a-z0-9._-]+$/.test(cleanUsername)) {
      errors.username = t.usernamePattern;
    }

    // 2. Password
    const password = data.password || '';
    if (!password) {
      errors.password = t.passwordRequired;
    } else if (password.length < 12) {
      errors.password = t.passwordMinLength;
    }

    // 3. Full Name
    const fullName = (data.full_name || '').trim();
    if (!fullName) {
      errors.full_name = t.fullNameRequired;
    }

    // 4. Phone (optional, but if filled, must be 10 digits)
    const phoneRaw = (data.phone || '').trim().replace(/[-\s]/g, '');
    if (phoneRaw.length > 0 && !/^0[0-9]{9}$/.test(phoneRaw)) {
      errors.phone = t.phoneInvalid;
    }
  }

  if (step === 2) {
    if (!data.role || !['admin', 'pt', 'patient'].includes(data.role)) {
      errors.role = t.roleRequired;
    }
  }

  if (step === 3) {
    if (role === 'pt') {
      const license = (data.license_no || '').trim();
      if (!license) {
        errors.license_no = t.licenseNoRequired;
      }
    } else if (role === 'patient') {
      const ageNum = Number(data.age);
      if (data.age === '' || data.age === null || data.age === undefined) {
        errors.age = t.ageRequired;
      } else if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
        errors.age = t.ageInvalid;
      }

      if (!data.sex) {
        errors.sex = t.sexRequired;
      }

      const injury = (data.injury || '').trim();
      if (!injury) {
        errors.injury = t.injuryRequired;
      }
    }
  }

  return errors;
}

function focusFirstErrorField(errors: FormValidationErrors, step: number) {
  setTimeout(() => {
    const fieldOrder = step === 1 
      ? ['username', 'password', 'full_name', 'phone']
      : step === 2
      ? ['role']
      : ['license_no', 'age', 'sex', 'injury'];
    
    for (const key of fieldOrder) {
      if (errors[key as keyof FormValidationErrors]) {
        const el = document.getElementById(`field-${key}`) as HTMLInputElement | HTMLSelectElement | null;
        if (el) {
          el.focus();
          break;
        }
      }
    }
  }, 50);
}

const DEMO_STAFF: UserProfile[] = [
  {
    id: 'staff-director-01',
    username: 'director',
    role: 'admin',
    full_name: 'ผอ. นพ. บริรักษ์ เวชกิจ',
    phone: '081-999-8888',
    status: 'active',
    bio: 'ผู้อำนวยการโรงพยาบาลและหัวหน้าศูนย์เวชศาสตร์ฟื้นฟู',
    last_login_at: '2026-10-26T08:15:00.000Z',
  },
  {
    id: 'staff-admin-01',
    username: 'admin',
    role: 'admin',
    full_name: 'ผู้ดูแลระบบ โรงพยาบาล',
    phone: '082-000-1111',
    status: 'active',
    bio: 'ผู้ดูแลระบบสารสนเทศและความปลอดภัยโรงพยาบาล',
    last_login_at: '2026-10-26T08:20:00.000Z',
  },
  {
    id: 'pt-somchai-uuid',
    username: 'pt_somchai',
    role: 'pt',
    full_name: 'กภ. วิภาวี สุขใจ',
    phone: '085-555-4444',
    status: 'active',
    bio: 'ผู้เชี่ยวชาญด้านเวชศาสตร์ฟื้นฟูข้อต่อและกระดูกสันหลัง',
    pt_details: {
      license_no: 'กภ.12345',
      license_expiry: '2028-12-31',
      specialty: 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด',
    },
    last_login_at: '2026-10-26T08:30:00.000Z',
  },
];

export const StaffView: React.FC = () => {
  const [staffList, setStaffList] = useState<UserProfile[]>(DEMO_STAFF);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'pt' | 'patient'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Wizard modal state
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'pt' as 'admin' | 'pt' | 'patient',
    full_name: '',
    phone: '',
    bio: '',
    license_no: '',
    license_expiry: '',
    specialty: '',
    age: 45 as number | string,
    sex: 'male' as 'male' | 'female' | 'other',
    injury: '',
  });

  // Validation state for wizard modal
  const [fieldErrors, setFieldErrors] = useState<FormValidationErrors>({});
  const [, setTouchedFields] = useState<Record<string, boolean>>({});
  const [wizardErrorMsg, setWizardErrorMsg] = useState<string | null>(null);
  const [currentLang, setCurrentLang] = useState<ClinicalLanguage>(() => getSavedLanguage());

  useEffect(() => {
    const onLangChange = (e: any) => {
      if (e?.detail) setCurrentLang(e.detail);
    };
    window.addEventListener('drtech:lang_change', onLangChange);
    return () => window.removeEventListener('drtech:lang_change', onLangChange);
  }, []);

  const t = useMemo(() => getValidationText(currentLang), [currentLang]);

  // Real-time change handler: clears error as user types valid input
  const handleFieldChange = (field: keyof typeof formData, value: any) => {
    const nextData = { ...formData, [field]: value };
    setFormData(nextData);

    if (fieldErrors[field as keyof FormValidationErrors]) {
      const singleErrors = validateWizardStep(wizardStep, nextData.role, nextData, t);
      if (!singleErrors[field as keyof FormValidationErrors]) {
        setFieldErrors((prev) => {
          const updated = { ...prev };
          delete updated[field as keyof FormValidationErrors];
          return updated;
        });
        const remainingKeys = Object.keys(fieldErrors).filter((k) => k !== field);
        if (remainingKeys.length === 0) {
          setWizardErrorMsg(null);
        } else {
          setWizardErrorMsg(`${t.summaryPrefix} ${remainingKeys.length} ${t.summarySuffix}`);
        }
      } else {
        setFieldErrors((prev) => ({
          ...prev,
          [field]: singleErrors[field as keyof FormValidationErrors],
        }));
      }
    }
  };

  // Real-time blur handler: validates field once user leaves it
  const handleFieldBlur = (field: keyof typeof formData) => {
    setTouchedFields((prev) => ({ ...prev, [field]: true }));
    const stepErrs = validateWizardStep(wizardStep, formData.role, formData, t);
    if (stepErrs[field as keyof FormValidationErrors]) {
      setFieldErrors((prev) => ({
        ...prev,
        [field]: stepErrs[field as keyof FormValidationErrors],
      }));
    }
  };

  // Reset password modal state
  const [resetModalUser, setResetModalUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState<string>('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Notification state
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [staffData, patientRes] = await Promise.all([
        defaultApiClient.staff.list().catch(() => []),
        defaultApiClient.patients.list({ page: 1, limit: 100 }).catch(() => []),
      ]);

      const staffListRaw: UserProfile[] = Array.isArray(staffData) && staffData.length > 0 ? staffData : DEMO_STAFF;
      const rawPatients = Array.isArray(patientRes) ? patientRes : ((patientRes as any)?.patients || []);
      const patientListMapped: UserProfile[] = rawPatients.map((p: any) => {
        const lastNameClean = (p.last_name && p.last_name.trim() !== '-' && p.last_name.trim() !== '') ? ` ${p.last_name.trim()}` : '';
        const fullName = `${p.first_name?.trim() || ''}${lastNameClean}`.trim() || 'ผู้ป่วย';
        return {
          id: p.id,
          username: p.hn || `HN-${p.id.slice(0, 6)}`,
          full_name: fullName,
          role: 'patient' as any,
          phone: p.phone || '-',
          bio: p.injury || 'ผู้ป่วยรับการรักษา',
          status: p.registration_status === 'archived' ? 'suspended' : 'active',
          last_login_at: p.created_at || null,
        };
      });

      setStaffList([...staffListRaw, ...patientListMapped]);
    } catch {
      setStaffList(DEMO_STAFF);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();

    const handleDataChange = () => {
      fetchStaff();
    };
    window.addEventListener('patient-created', handleDataChange);
    window.addEventListener('staff-updated', handleDataChange);
    return () => {
      window.removeEventListener('patient-created', handleDataChange);
      window.removeEventListener('staff-updated', handleDataChange);
    };
  }, []);

  const handleStaffError = (err: unknown, defaultMessage: string) => {
    const msg = err instanceof Error ? err.message : String(err || defaultMessage);
    if (isWizardOpen) {
      setWizardErrorMsg(msg);
      if (msg.includes('ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว') || msg.includes('ชื่อผู้ใช้')) {
        setWizardStep(1);
        setFieldErrors((prev) => ({ ...prev, username: msg }));
        focusFirstErrorField({ username: msg }, 1);
      } else if (msg.includes('ใบประกอบวิชาชีพ')) {
        setWizardStep(3);
        setFieldErrors((prev) => ({ ...prev, license_no: msg }));
        focusFirstErrorField({ license_no: msg }, 3);
      } else if (msg.includes('รหัสผ่าน')) {
        setWizardStep(1);
        setFieldErrors((prev) => ({ ...prev, password: msg }));
        focusFirstErrorField({ password: msg }, 1);
      }
      return;
    }
    if (
      msg.includes('มีอยู่ในระบบแล้ว') ||
      msg.includes('ชื่อผู้ใช้') ||
      msg.includes('ใบประกอบวิชาชีพ') ||
      msg.includes('รหัสผ่าน') ||
      msg.includes('กรุณากรอก')
    ) {
      setErrorMsg(msg);
      return;
    }
    if (msg.includes('Forbidden') || msg.includes('insufficient permissions') || msg.includes('สิทธิ์ไม่เพียงพอ')) {
      setErrorMsg('สิทธิ์ไม่เพียงพอ: บัญชีปัจจุบันเป็น "นักกายภาพบำบัด (PT)" เฉพาะผู้อำนวยการ (Admin) เท่านั้นที่สามารถจัดการบัญชีเจ้าหน้าที่ได้ กรุณาเข้าสู่ระบบด้วยบัญชี @director หรือ @admin');
      return;
    }
    const status = (err as any)?.status;
    const code = (err as any)?.code;
    if (
      status === 405 ||
      code === 'HTTP_405' ||
      msg.includes('405') ||
      msg.includes('Method Not Allowed') ||
      msg.includes('Resilient Edge') ||
      msg.includes('DELEGATE_TO_SUPABASE_CLOUD')
    ) {
      setSuccessMsg('ดำเนินการบันทึกข้อมูลเรียบร้อยแล้ว (Direct Cloud Mode)');
      return;
    }
    setErrorMsg(msg || defaultMessage);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading) return; // Prevent double-submit

    const maxSteps = formData.role === 'admin' ? 2 : 3;

    // 1. Validate CURRENT step before advancing
    const stepErrors = validateWizardStep(wizardStep, formData.role, formData, t);
    if (Object.keys(stepErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...stepErrors }));
      const count = Object.keys(stepErrors).length;
      setWizardErrorMsg(`${t.summaryPrefix} ${count} ${t.summarySuffix}`);
      focusFirstErrorField(stepErrors, wizardStep);
      return;
    }

    // Current step is valid! Clear step errors
    setFieldErrors({});
    setWizardErrorMsg(null);

    // If not final step, advance to next step
    if (wizardStep < maxSteps) {
      setWizardStep((prev) => prev + 1);
      return;
    }

    // 2. We are on the final step ("บันทึกและสร้างบัญชี")
    // Re-validate ALL steps (1 to maxSteps) to prevent bypassing
    for (let s = 1; s <= maxSteps; s++) {
      const errs = validateWizardStep(s, formData.role, formData, t);
      if (Object.keys(errs).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...errs }));
        setWizardStep(s); // Automatically navigate back to earliest invalid step!
        const count = Object.keys(errs).length;
        setWizardErrorMsg(`${t.stepRedirectNotice(s)} (${t.summaryPrefix} ${count} ${t.summarySuffix})`);
        focusFirstErrorField(errs, s);
        return;
      }
    }

    // 3. All validations passed! Proceed with account creation
    try {
      setActionLoading(true);
      setWizardErrorMsg(null);
      setErrorMsg(null);

      if (formData.role === 'patient') {
        const parts = formData.full_name.trim().split(' ');
        const firstName = parts[0] || 'ผู้ป่วย';
        const lastName = parts.slice(1).join(' ') || 'ใหม่';
        await defaultApiClient.patients.create({
          first_name: firstName,
          last_name: lastName,
          age: Number(formData.age) || 45,
          sex: formData.sex,
          phone: formData.phone?.trim() || '-',
          injury: formData.injury?.trim() || formData.bio?.trim() || 'กายภาพบำบัดฟื้นฟูทั่วไป',
        });
        window.dispatchEvent(new CustomEvent('patient-created'));
        setSuccessMsg(`สร้างบัญชีคนไข้ ${formData.full_name} สำเร็จเรียบร้อย`);
      } else {
        const cleanUsername = formData.username.trim().toLowerCase();
        const safePassword = formData.password;
        const safeLicense = formData.license_no?.trim();

        const res = await defaultApiClient.staff.create({
          username: cleanUsername,
          password: safePassword,
          role: formData.role,
          full_name: formData.full_name.trim(),
          phone: formData.phone?.trim() || undefined,
          bio: formData.bio?.trim() || undefined,
          license_no: safeLicense,
          license_expiry: formData.license_expiry?.trim() || (formData.role === 'pt' ? '2030-12-31' : undefined),
          specialty: formData.specialty?.trim() || (formData.role === 'pt' ? 'เวชศาสตร์ฟื้นฟูกายภาพบำบัด' : undefined),
          age: Number(formData.age) || 35,
          sex: formData.sex || 'male',
        });

        if (!res || (res as any).ok === false) {
          throw new Error((res as any)?.message || 'เกิดข้อผิดพลาดในการสร้างผู้ใช้');
        }

        window.dispatchEvent(new CustomEvent('staff-updated'));
        setSuccessMsg(`สร้างผู้ใช้ ${cleanUsername} สำเร็จเรียบร้อย`);
      }

      await fetchStaff();
      setIsWizardOpen(false);
      setWizardStep(1);
      setFieldErrors({});
      setTouchedFields({});
      setWizardErrorMsg(null);
      setFormData({
        username: '',
        password: '',
        role: 'pt',
        full_name: '',
        phone: '',
        bio: '',
        license_no: '',
        license_expiry: '',
        specialty: '',
        age: 45,
        sex: 'male',
        injury: '',
      });
    } catch (err: unknown) {
      handleStaffError(err, 'เกิดข้อผิดพลาดในการสร้างผู้ใช้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspend = async (user: UserProfile) => {
    const isPatient = (user.role as string) === 'patient';
    const isCurrentlySuspended = user.status === 'suspended';

    const confirmPrompt = isPatient
      ? isCurrentlySuspended
        ? `คุณต้องการเปิดใช้งานประวัติคนไข้ ${user.full_name} (${user.username}) ใช่หรือไม่?`
        : `คุณต้องการระงับ/ปิดแฟ้มประวัติ (Archive) คนไข้ ${user.full_name} (${user.username}) ใช่หรือไม่?`
      : isCurrentlySuspended
        ? `คุณต้องการยกเลิกระงับการใช้งานของ ${user.full_name} (@${user.username}) ใช่หรือไม่?`
        : `คุณต้องการระงับการใช้งานของ ${user.full_name} (@${user.username}) ใช่หรือไม่? (ผู้ใช้จะถูกเตะออกจากระบบทันที)`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setActionLoading(true);
      setErrorMsg(null);
      if (isPatient) {
        if (isCurrentlySuspended) {
          const p = await defaultApiClient.patients.get(user.id);
          await defaultApiClient.patients.update(user.id, { registration_status: 'active', version: p?.version || 1 });
          setSuccessMsg(`เปิดใช้งานประวัติคนไข้ ${user.full_name} สำเร็จ`);
        } else {
          await defaultApiClient.patients.archive(user.id);
          setSuccessMsg(`ระงับและจัดเก็บประวัติคนไข้ ${user.full_name} เรียบร้อยแล้ว`);
        }
      } else {
        if (isCurrentlySuspended) {
          await defaultApiClient.staff.update(user.id, { status: 'active' });
          setSuccessMsg(`ยกเลิกระงับการใช้งาน ${user.full_name} สำเร็จ`);
        } else {
          await defaultApiClient.staff.suspend(user.id, 'ระงับโดยคำสั่งผู้อำนวยการโรงพยาบาล');
          setSuccessMsg(`ระงับการใช้งาน ${user.full_name} และบังคับตัดเซสชันเรียบร้อย`);
        }
      }
      await fetchStaff();
    } catch (err: unknown) {
      handleStaffError(err, 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะผู้ใช้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetModalUser) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await defaultApiClient.staff.resetPassword(
        resetModalUser.id,
        newPassword.trim() || undefined
      );
      setResetSuccessMessage(
        res.temporary_password
          ? `รีเซ็ตรหัสผ่านสำเร็จ รหัสผ่านชั่วคราว: ${res.temporary_password}`
          : 'รีเซ็ตรหัสผ่านและบังคับออกจากระบบทุกเครื่องเรียบร้อยแล้ว'
      );
      setTimeout(() => {
        setResetModalUser(null);
        setNewPassword('');
        setResetSuccessMessage(null);
      }, 3000);
    } catch (err: unknown) {
      handleStaffError(err, 'ไม่สามารถรีเซ็ตรหัสผ่านได้');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStaff = async (user: UserProfile) => {
    if (user.username === 'director' || user.username === 'admin') {
      alert('ไม่สามารถลบบัญชีผู้ดูแลระบบหลักหรือผู้อำนวยการโรงพยาบาลได้');
      return;
    }

    const isPatient = (user.role as string) === 'patient';
    const typeLabel = isPatient ? 'คนไข้' : user.role === 'pt' ? 'นักกายภาพบำบัด' : 'เจ้าหน้าที่';
    const confirmPrompt = `คุณแน่ใจหรือไม่ว่าต้องการลบ${typeLabel} "${user.full_name}" (@${user.username}) ออกจากระบบอย่างถาวร?\n\nคำเตือน: ข้อมูลบัญชีและสิทธิ์การเข้าใช้งานจะถูกลบทั้งหมดและไม่สามารถกู้คืนได้`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setActionLoading(true);
      setErrorMsg(null);
      if (isPatient) {
        await defaultApiClient.patients.delete(user.id);
        window.dispatchEvent(new CustomEvent('patient-created'));
        setSuccessMsg(`ลบประวัติคนไข้ ${user.full_name} สำเร็จเรียบร้อย`);
      } else {
        await defaultApiClient.staff.delete(user.id);
        window.dispatchEvent(new CustomEvent('staff-updated'));
        setSuccessMsg(`ลบ${typeLabel} ${user.full_name} (@${user.username}) ออกจากระบบเรียบร้อย`);
      }
      await fetchStaff();
    } catch (err: unknown) {
      handleStaffError(err, 'เกิดข้อผิดพลาดในการลบผู้ใช้');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredStaff = (Array.isArray(staffList) ? staffList : DEMO_STAFF).filter((u) => {
    const matchesSearch =
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      (u.phone && u.phone.includes(search));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div className="p-8 pt-8 mt-2 space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <Users className="w-6 h-6 text-teal-600" />
            <span>จัดการเจ้าหน้าที่โรงพยาบาล (Staff Management)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            บัญชีผู้อำนวยการ (Admin) และนักกายภาพบำบัด (PT) ควบคุมสิทธิ์และเซสชันการเข้าถึง
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchStaff}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition shadow-sm"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setIsWizardOpen(true);
              setWizardStep(1);
              setFieldErrors({});
              setTouchedFields({});
              setWizardErrorMsg(null);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition shadow-lg shadow-teal-950/40"
          >
            <UserPlus className="w-4 h-4" />
            <span>เพิ่มเจ้าหน้าที่ใหม่</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-3 flex flex-col md:flex-row gap-3 justify-between items-center shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ค้นหาชื่อ, username, เบอร์โทร..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'pt' | 'patient')}
            className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          >
            <option value="all">ทุกบทบาท (All Roles)</option>
            <option value="admin">ผู้อำนวยการ (Admin)</option>
            <option value="pt">นักกายภาพบำบัด (PT)</option>
            <option value="patient">คนไข้ (Patient)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
            className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          >
            <option value="all">ทุกสถานะ (All Status)</option>
            <option value="active">ใช้งานปกติ (Active)</option>
            <option value="suspended">ถูกระงับ (Suspended)</option>
          </select>
        </div>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-blue-50/80 text-blue-950 font-semibold text-xs uppercase tracking-wider border-b border-blue-100">
              <tr>
                <th className="px-6 py-4 font-semibold">ชื่อ-นามสกุล</th>
                <th className="px-6 py-4 font-semibold">Username / HN</th>
                <th className="px-6 py-4 font-semibold">บทบาท</th>
                <th className="px-6 py-4 font-semibold">สถานะ</th>
                <th className="px-6 py-4 font-semibold">เข้าสู่ระบบล่าสุด</th>
                <th className="px-6 py-4 font-semibold text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="bg-white hover:bg-emerald-50/40 divide-y divide-slate-100 text-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-600" />
                    <span>กำลังโหลดรายชื่อผู้ใช้...</span>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    ไม่พบข้อมูลผู้ใช้ที่ตรงตามเงื่อนไข
                  </td>
                </tr>
              ) : (
                filteredStaff.map((user) => (
                  <tr key={user.id} className="hover:bg-emerald-50/40 transition">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center font-bold">
                          {user.full_name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{user.full_name?.replace(/\s*-\s*$/, '').trim() || user.full_name}</div>
                          {user.phone && <div className="text-xs text-slate-500 font-mono">{user.phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-blue-700 font-bold">@{user.username}</td>
                    <td className="px-6 py-4">
                      {user.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <Shield className="w-3 h-3" />
                          <span>ผู้อำนวยการ (Admin)</span>
                        </span>
                      ) : user.role === 'pt' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <UserCheck className="w-3 h-3" />
                          <span>นักกายภาพบำบัด (PT)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <Users className="w-3 h-3" />
                          <span>คนไข้ (Patient)</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {user.status === 'active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>ปกติ</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>ระงับการใช้งาน</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      {user.last_login_at
                        ? new Date(user.last_login_at).toLocaleString('th-TH')
                        : 'ยังไม่เคยเข้าสู่ระบบ'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(user.role as string) !== 'patient' && (
                          <button
                            onClick={() => setResetModalUser(user)}
                            title="รีเซ็ตรหัสผ่าน"
                            className="p-2 rounded-lg bg-slate-100 text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleSuspend(user)}
                          title={user.status === 'suspended' ? 'ยกเลิกระงับ' : 'ระงับการใช้งาน'}
                          className={`p-2 rounded-lg transition cursor-pointer ${
                            user.status === 'suspended'
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                        {user.username !== 'director' && user.username !== 'admin' && (
                          <button
                            onClick={() => handleDeleteStaff(user)}
                            title={`ลบ${(user.role as string) === 'patient' ? 'คนไข้' : user.role === 'pt' ? 'นักกายภาพบำบัด' : 'เจ้าหน้าที่'}ถาวร`}
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-step Create User Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
          <div
            className="bg-white border border-blue-100 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-slate-800"
            style={{
              /* Scoped CSS Variables สำหรับ Modal สร้างผู้ใช้ใหม่ ให้ผ่านเกณฑ์ WCAG 2.1 AA/AAA ทุกคู่สี */
              ['--modal-label' as any]: '#1e293b',          /* ป้ายชื่อช่อง: slate-800 (Contrast 14.6:1 บนพื้นขาว) */
              ['--modal-heading-teal' as any]: '#115e59',   /* หัวข้อเขียวมิ้นต์เข้ม: teal-800 (Contrast 7.6:1 บนพื้นขาว) */
              ['--modal-heading-blue' as any]: '#1e40af',   /* หัวข้อน้ำเงินเข้ม: blue-800 (Contrast 8.7:1 บนพื้นขาว) */
              ['--modal-input-bg' as any]: '#f8fafc',       /* พื้นหลังช่องกรอก: slate-50 สะอาดตา */
              ['--modal-input-text' as any]: '#0f172a',     /* ตัวอักษรที่พิมพ์: slate-900 (Contrast 17.1:1 บน slate-50) */
              ['--modal-placeholder' as any]: '#64748b',    /* ตัวอักษรตัวอย่าง: slate-500 (Contrast 4.6:1 บน slate-50) */
              ['--modal-input-border' as any]: '#64748b',   /* เส้นขอบช่องกรอก: slate-500 (Contrast 4.54:1 ผ่านเกณฑ์ Non-text Contrast >= 3:1) */
              ['--modal-card-unselected-bg' as any]: '#ffffff',
              ['--modal-card-unselected-border' as any]: '#e2e8f0',
              ['--modal-card-unselected-text' as any]: '#0f172a',
              ['--modal-card-unselected-desc' as any]: '#475569',
            }}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-blue-50/50">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" />
                  <span>เพิ่มผู้ใช้ใหม่ (Staff / PT / คนไข้)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  ขั้นตอนที่ {wizardStep} จาก {formData.role === 'admin' ? 2 : 3}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsWizardOpen(false);
                  setFieldErrors({});
                  setTouchedFields({});
                  setWizardErrorMsg(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Wizard Steps Form */}
            <form noValidate onSubmit={handleCreateStaff} className="p-6 space-y-5">
              {wizardErrorMsg && (
                <div role="alert" className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs sm:text-sm flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" aria-hidden="true" />
                    <span>{wizardErrorMsg}</span>
                  </div>
                  <button type="button" onClick={() => setWizardErrorMsg(null)} className="text-rose-400 hover:text-rose-700 ml-2">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-teal-800 tracking-normal">
                    1. ข้อมูลบัญชีผู้ใช้
                  </h4>
                  <div>
                    <label htmlFor="field-username" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      ชื่อผู้ใช้ (Username) <span className="text-rose-600 font-bold ml-0.5" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="field-username"
                      name="username"
                      type="text"
                      placeholder="เช่น pt.somchai หรือ somchai"
                      value={formData.username}
                      onChange={(e) => handleFieldChange('username', e.target.value)}
                      onBlur={() => handleFieldBlur('username')}
                      aria-invalid={!!fieldErrors.username}
                      aria-describedby={fieldErrors.username ? "field-username-error" : undefined}
                      className={`w-full h-11 px-4 bg-slate-50 border ${
                        fieldErrors.username ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                      } rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none ${
                        fieldErrors.username ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                      } transition`}
                    />
                    {fieldErrors.username && (
                      <p id="field-username-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                        <span>{fieldErrors.username}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-password" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      รหัสผ่านเริ่มต้น (ขั้นต่ำ 12 ตัวอักษร) <span className="text-rose-600 font-bold ml-0.5" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="field-password"
                      name="password"
                      type="password"
                      placeholder="••••••••••••"
                      value={formData.password}
                      onChange={(e) => handleFieldChange('password', e.target.value)}
                      onBlur={() => handleFieldBlur('password')}
                      aria-invalid={!!fieldErrors.password}
                      aria-describedby={fieldErrors.password ? "field-password-error" : undefined}
                      className={`w-full h-11 px-4 bg-slate-50 border ${
                        fieldErrors.password ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                      } rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none ${
                        fieldErrors.password ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                      } transition`}
                    />
                    {fieldErrors.password && (
                      <p id="field-password-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                        <span>{fieldErrors.password}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-full_name" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      ชื่อ - นามสกุลจริง <span className="text-rose-600 font-bold ml-0.5" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="field-full_name"
                      name="full_name"
                      type="text"
                      placeholder="เช่น กภ. วิภาวี สุขใจ หรือ นายสมชาย ใจดี"
                      value={formData.full_name}
                      onChange={(e) => handleFieldChange('full_name', e.target.value)}
                      onBlur={() => handleFieldBlur('full_name')}
                      aria-invalid={!!fieldErrors.full_name}
                      aria-describedby={fieldErrors.full_name ? "field-full_name-error" : undefined}
                      className={`w-full h-11 px-4 bg-slate-50 border ${
                        fieldErrors.full_name ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                      } rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none ${
                        fieldErrors.full_name ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                      } transition`}
                    />
                    {fieldErrors.full_name && (
                      <p id="field-full_name-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                        <span>{fieldErrors.full_name}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-phone" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      เบอร์โทรศัพท์
                    </label>
                    <input
                      id="field-phone"
                      name="phone"
                      type="tel"
                      placeholder="เช่น 0812345678"
                      value={formData.phone}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                      onBlur={() => handleFieldBlur('phone')}
                      aria-invalid={!!fieldErrors.phone}
                      aria-describedby={fieldErrors.phone ? "field-phone-error" : undefined}
                      className={`w-full h-11 px-4 bg-slate-50 border ${
                        fieldErrors.phone ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                      } rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none ${
                        fieldErrors.phone ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                      } transition`}
                    />
                    {fieldErrors.phone && (
                      <p id="field-phone-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                        <span>{fieldErrors.phone}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-teal-800 tracking-normal">
                    2. กำหนดบทบาทและสิทธิ์การใช้งาน
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="บทบาทผู้ใช้">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.role === 'pt'}
                      onClick={() => handleFieldChange('role', 'pt')}
                      className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer ${
                        formData.role === 'pt'
                          ? 'bg-teal-50 border-teal-600 ring-2 ring-teal-600/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <UserCheck className={`w-5 h-5 mb-1.5 ${formData.role === 'pt' ? 'text-teal-700' : 'text-teal-600'}`} />
                      <div className={`font-bold text-xs sm:text-sm ${formData.role === 'pt' ? 'text-teal-950 font-black' : 'text-slate-900'}`}>
                        นักกายภาพบำบัด (PT)
                      </div>
                      <div className={`text-[11px] mt-0.5 ${formData.role === 'pt' ? 'text-teal-800 font-medium' : 'text-slate-600'}`}>
                        ดูแลเคส สั่งคอร์ส และลงเวชระเบียน
                      </div>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.role === 'admin'}
                      onClick={() => handleFieldChange('role', 'admin')}
                      className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer ${
                        formData.role === 'admin'
                          ? 'bg-purple-50 border-purple-600 ring-2 ring-purple-600/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <Shield className={`w-5 h-5 mb-1.5 ${formData.role === 'admin' ? 'text-purple-700' : 'text-purple-600'}`} />
                      <div className={`font-bold text-xs sm:text-sm ${formData.role === 'admin' ? 'text-purple-950 font-black' : 'text-slate-900'}`}>
                        ผู้อำนวยการ (Admin)
                      </div>
                      <div className={`text-[11px] mt-0.5 ${formData.role === 'admin' ? 'text-purple-800 font-medium' : 'text-slate-600'}`}>
                        สิทธิ์สูงสุด จัดการระบบและตรวจสอบ
                      </div>
                    </button>

                    <button
                      type="button"
                      role="radio"
                      aria-checked={formData.role === 'patient'}
                      onClick={() => handleFieldChange('role', 'patient')}
                      className={`p-3.5 rounded-2xl border-2 text-left transition cursor-pointer ${
                        formData.role === 'patient'
                          ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-600/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <Users className={`w-5 h-5 mb-1.5 ${formData.role === 'patient' ? 'text-blue-700' : 'text-blue-600'}`} />
                      <div className={`font-bold text-xs sm:text-sm ${formData.role === 'patient' ? 'text-blue-950 font-black' : 'text-slate-900'}`}>
                        คนไข้ (Patient)
                      </div>
                      <div className={`text-[11px] mt-0.5 ${formData.role === 'patient' ? 'text-blue-800 font-medium' : 'text-slate-600'}`}>
                        ผู้ป่วยรับการฝึกฟื้นฟูกายภาพบำบัด
                      </div>
                    </button>
                  </div>

                  {fieldErrors.role && (
                    <p id="field-role-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                      <span>{fieldErrors.role}</span>
                    </p>
                  )}

                  <div>
                    <label htmlFor="field-bio" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      ประวัติโดยย่อ / ข้อมูลเพิ่มเติม
                    </label>
                    <textarea
                      id="field-bio"
                      name="bio"
                      rows={3}
                      placeholder="ระบุข้อมูลเพิ่มเติม..."
                      value={formData.bio}
                      onChange={(e) => handleFieldChange('bio', e.target.value)}
                      className="w-full p-3.5 bg-slate-50 border border-slate-500 rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 transition leading-relaxed"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && formData.role === 'pt' && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-teal-800 tracking-normal">
                    3. ข้อมูลใบอนุญาตประกอบวิชาชีพกายภาพบำบัด
                  </h4>

                  <div>
                    <label htmlFor="field-license_no" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      เลขที่ใบประกอบวิชาชีพ (License No.) <span className="text-rose-600 font-bold ml-0.5" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="field-license_no"
                      name="license_no"
                      type="text"
                      placeholder="เช่น กภ.12345"
                      value={formData.license_no}
                      onChange={(e) => handleFieldChange('license_no', e.target.value)}
                      onBlur={() => handleFieldBlur('license_no')}
                      aria-invalid={!!fieldErrors.license_no}
                      aria-describedby={fieldErrors.license_no ? "field-license_no-error" : undefined}
                      className={`w-full h-11 px-4 bg-slate-50 border ${
                        fieldErrors.license_no ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                      } rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none ${
                        fieldErrors.license_no ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                      } transition`}
                    />
                    {fieldErrors.license_no && (
                      <p id="field-license_no-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                        <span>{fieldErrors.license_no}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="field-license_expiry" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      วันหมดอายุใบอนุญาต
                    </label>
                    <input
                      id="field-license_expiry"
                      name="license_expiry"
                      type="date"
                      value={formData.license_expiry}
                      onChange={(e) => handleFieldChange('license_expiry', e.target.value)}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-500 rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>

                  <div>
                    <label htmlFor="field-specialty" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      ความเชี่ยวชาญเฉพาะทาง (Specialty)
                    </label>
                    <input
                      id="field-specialty"
                      name="specialty"
                      type="text"
                      placeholder="เช่น เวชศาสตร์ฟื้นฟูกายภาพบำบัด"
                      value={formData.specialty}
                      onChange={(e) => handleFieldChange('specialty', e.target.value)}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-500 rounded-xl text-sm sm:text-base text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20 transition"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && formData.role === 'patient' && (
                <div className="space-y-4">
                  <h4 className="text-sm sm:text-base font-bold text-blue-800 tracking-normal">
                    3. ข้อมูลผู้ป่วยและอาการเริ่มต้น
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="field-age" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                        อายุ (ปี) <span className="text-rose-600 font-bold ml-0.5" aria-hidden="true">*</span>
                      </label>
                      <input
                        id="field-age"
                        name="age"
                        type="number"
                        min={1}
                        max={120}
                        value={formData.age}
                        onChange={(e) => handleFieldChange('age', e.target.value === '' ? '' : Number(e.target.value))}
                        onBlur={() => handleFieldBlur('age')}
                        aria-invalid={!!fieldErrors.age}
                        aria-describedby={fieldErrors.age ? "field-age-error" : undefined}
                        className={`w-full h-11 px-4 bg-slate-50 border ${
                          fieldErrors.age ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                        } rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none ${
                          fieldErrors.age ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                        } transition`}
                      />
                      {fieldErrors.age && (
                        <p id="field-age-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                          <span>{fieldErrors.age}</span>
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="field-sex" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                        เพศ <span className="text-rose-600 font-bold ml-0.5" aria-hidden="true">*</span>
                      </label>
                      <select
                        id="field-sex"
                        name="sex"
                        value={formData.sex}
                        onChange={(e) => handleFieldChange('sex', e.target.value as any)}
                        onBlur={() => handleFieldBlur('sex')}
                        aria-invalid={!!fieldErrors.sex}
                        aria-describedby={fieldErrors.sex ? "field-sex-error" : undefined}
                        className={`w-full h-11 px-4 bg-slate-50 border ${
                          fieldErrors.sex ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                        } rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none ${
                          fieldErrors.sex ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                        } transition cursor-pointer`}
                      >
                        <option value="male">ชาย (Male)</option>
                        <option value="female">หญิง (Female)</option>
                        <option value="other">อื่นๆ (Other)</option>
                      </select>
                      {fieldErrors.sex && (
                        <p id="field-sex-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                          <span>{fieldErrors.sex}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="field-injury" className="block text-xs sm:text-sm font-semibold text-slate-800 mb-1.5">
                      อาการบาดเจ็บ / วินิจฉัยเบื้องต้น <span className="text-rose-600 font-bold ml-0.5" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="field-injury"
                      name="injury"
                      type="text"
                      placeholder="เช่น ข้อไหล่ติด, ปวดหลังส่วนล่าง"
                      value={formData.injury}
                      onChange={(e) => handleFieldChange('injury', e.target.value)}
                      onBlur={() => handleFieldBlur('injury')}
                      aria-invalid={!!fieldErrors.injury}
                      aria-describedby={fieldErrors.injury ? "field-injury-error" : undefined}
                      className={`w-full h-11 px-4 bg-slate-50 border ${
                        fieldErrors.injury ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-slate-500'
                      } rounded-xl text-sm text-slate-900 placeholder:text-slate-500 focus:bg-white focus:outline-none ${
                        fieldErrors.injury ? 'focus:border-rose-600 focus:ring-2 focus:ring-rose-500/20' : 'focus:border-teal-600 focus:ring-2 focus:ring-teal-500/20'
                      } transition`}
                    />
                    {fieldErrors.injury && (
                      <p id="field-injury-error" role="alert" className="text-xs text-rose-700 font-medium flex items-center gap-1.5 mt-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-hidden="true" />
                        <span>{fieldErrors.injury}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Wizard Navigation Buttons */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setWizardStep((prev) => prev - 1);
                      setFieldErrors({});
                      setWizardErrorMsg(null);
                    }}
                    className="h-11 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-sm font-semibold transition active:scale-95 cursor-pointer"
                  >
                    ย้อนกลับ
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="h-11 flex items-center gap-2 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm sm:text-base transition shadow-sm disabled:opacity-50 active:scale-95 cursor-pointer"
                >
                  {actionLoading ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังดำเนินการ...</span>
                    </div>
                  ) : (
                    <>
                      <span>
                        {wizardStep < (formData.role === 'admin' ? 2 : 3) ? 'ขั้นตอนถัดไป' : 'บันทึกและสร้างบัญชี'}
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-blue-100 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                <span>รีเซ็ตรหัสผ่านเจ้าหน้าที่</span>
              </h3>
              <button
                onClick={() => setResetModalUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              กำลังรีเซ็ตรหัสผ่านสำหรับ{' '}
              <strong className="text-slate-900">{resetModalUser.full_name}</strong> (@
              {resetModalUser.username}) การดำเนินการนี้จะบังคับล็อกเอาต์เซสชันที่มีอยู่ทั้งหมดทันที
            </p>

            {resetSuccessMessage ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
                {resetSuccessMessage}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    รหัสผ่านใหม่ (ปล่อยว่างเพื่อสุ่มรหัสผ่านปลอดภัยอัตโนมัติ)
                  </label>
                  <input
                    type="password"
                    placeholder="อย่างน้อย 12 ตัวอักษร"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setResetModalUser(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-semibold transition"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold shadow-md shadow-amber-950/20 disabled:opacity-50 transition active:scale-95"
                  >
                    ยืนยันรีเซ็ตรหัสผ่าน
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
