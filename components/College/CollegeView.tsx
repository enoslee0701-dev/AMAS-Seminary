
import React, { useEffect, useState } from 'react';

import { HeroSection } from './HeroSection';
import QuestionAnswerView from './QuestionAnswerView';
import {
  DeanMessageView,
  PurposeVisionView,
  StatementOfFaithView,
  EducationDirectionView,
  OrganizationView,
  FacultyView,
  SupportSchoolView,
} from './HistorySection';
import {
  AcademicProgramsView,
  StudyPlanView,
} from './SubjectsSection';
import {
  AdmissionGuideView,
  AdmissionRequirementsView,
  GraduationRequirementsView,
  AdmissionApplicationView,
  type AdmissionFormData,
} from './AdmissionsSection';
import {
  IssueCertificateView,
  RestrictedAccessView,
  type CertFormData,
} from './shared/SectionHeader';

interface CollegeViewProps {
  onBack?: () => void;
  initialItem?: string | null;
}

const CollegeView: React.FC<CollegeViewProps> = ({ onBack, initialItem }) => {
  const [selectedItem, setSelectedItem] = useState<string | null>(initialItem ?? null);

  // Reset scroll position whenever the subview switches (incl. deep-link mount).
  // Subviews live in this same component, so the previous scroll offset would persist.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelectorAll('main').forEach((el) => { el.scrollTop = 0; });
  }, [selectedItem]);

  // Form State for Admission
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formData, setFormData] = useState<AdmissionFormData>({
    name: '',
    englishName: '',
    gender: '男',
    nationality: '中国',
    dob: '',
    status: '新生',
    time: '',
    major: '',
    phone: '',
    wechat: '',
    email: '',
    address: '',
    description: ''
  });

  // Form State for Certificate Issuance
  const [certFormSubmitted, setCertFormSubmitted] = useState(false);
  const [certFormData, setCertFormData] = useState<CertFormData>({
     name: '',
     phone: '',
     email: '',
     address: '',
     type: ''
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [certFormError, setCertFormError] = useState<string | null>(null);

  const persistSubmission = (key: string, data: any) => {
    try {
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push({ ...data, submittedAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {}
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if(!formData.name || !formData.phone || !formData.email) {
       setFormError('请填写带 * 的必填项');
       return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRe.test(formData.email)) { setFormError('邮箱格式不正确'); return; }
    if(!/^\d{7,}$/.test(formData.phone.replace(/\D/g, ''))) { setFormError('电话号码格式不正确'); return; }
    persistSubmission('amas_admission_submissions', formData);
    setFormSubmitted(true);
  };

  const resetAdmissionForm = () => {
    setFormSubmitted(false);
    setFormError(null);
    setFormData({
      name: '', englishName: '', gender: '男', nationality: '中国',
      dob: '', status: '新生', time: '', major: '',
      phone: '', wechat: '', email: '', address: '', description: ''
    });
  };

  const handleCertSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setCertFormError(null);
      if(!certFormData.name || !certFormData.phone || !certFormData.type) {
         setCertFormError('请填写带 * 的必填项');
         return;
      }
      if(!/^\d{7,}$/.test(certFormData.phone.replace(/\D/g, ''))) { setCertFormError('电话号码格式不正确'); return; }
      persistSubmission('amas_cert_submissions', certFormData);
      setCertFormSubmitted(true);
  };

  const resetCertForm = () => {
    setCertFormSubmitted(false);
    setCertFormError(null);
    setCertFormData({ name: '', phone: '', email: '', address: '', type: '' });
  };

  const handleItemClick = (itemName: string) => {
    setSelectedItem(itemName);
  };

  const backToMenu = () => setSelectedItem(null);

  // --- Detailed Views ---

  // 1. 院长致辞 (Dean's Message)
  if (selectedItem === '院长致辞') {
    return <DeanMessageView onBack={backToMenu} />;
  }

  // 2. 目的异象 (Purpose & Vision)
  if (selectedItem === '目的异象') {
    return <PurposeVisionView onBack={backToMenu} />;
  }

  // 3. 信仰告白 (Statement of Faith)
  if (selectedItem === '信仰告白') {
     return <StatementOfFaithView onBack={backToMenu} />;
  }

  // 4. 教育方向 (Educational Direction)
  if (selectedItem === '教育方向') {
     return <EducationDirectionView onBack={backToMenu} />;
  }

  // 5. 学校组织 (Organization Chart)
  if (selectedItem === '学校组织') {
     return <OrganizationView onBack={backToMenu} />;
  }

  // 6. 师资团队 (Faculty)
  if (selectedItem === '师资团队') {
     return <FacultyView onBack={backToMenu} />;
  }

  // 7. 支持学校 (Support School)
  if (selectedItem === '支持学校') {
     return <SupportSchoolView onBack={backToMenu} />;
  }

  // 8. 学科介绍 (Academic Programs)
  if (selectedItem === '学科介绍') {
     return <AcademicProgramsView onBack={backToMenu} />;
  }

  // 9. 学习计划 (Study Plan)
  if (selectedItem === '学习计划') {
     return <StudyPlanView onBack={backToMenu} />;
  }

  // 10. 入学指南 (Admission Guide)
  if (selectedItem === '入学指南') {
     return <AdmissionGuideView onBack={backToMenu} />;
  }

  // 11. 入学条件 (Admission Requirements)
  if (selectedItem === '入学条件') {
    return <AdmissionRequirementsView onBack={backToMenu} />;
  }

  // 12. 毕业条件 (Graduation Requirements)
  if (selectedItem === '毕业条件' || selectedItem === '毕业') {
    return <GraduationRequirementsView onBack={backToMenu} />;
  }

  // 13. 入学申请表 (Admission Application Form)
  if (selectedItem === '入学申请表') {
     return (
       <AdmissionApplicationView
         onBack={backToMenu}
         formSubmitted={formSubmitted}
         formData={formData}
         formError={formError}
         setFormData={setFormData}
         handleFormSubmit={handleFormSubmit}
         resetAdmissionForm={resetAdmissionForm}
       />
     );
  }

  // 14. 提问解答 (Q&A) - Use Extracted Component
  if (selectedItem === '提问解答') {
    return <QuestionAnswerView onBack={backToMenu} />;
  }

  // 15. 开具证明 (Issue Certificates)
  if (selectedItem === '开具证明') {
     return (
       <IssueCertificateView
         onBack={backToMenu}
         certFormSubmitted={certFormSubmitted}
         certFormData={certFormData}
         certFormError={certFormError}
         setCertFormData={setCertFormData}
         handleCertSubmit={handleCertSubmit}
         resetCertForm={resetCertForm}
       />
     );
  }

  // 16. 教授评价 & 成绩确认 (Restricted Access)
  if (selectedItem === '教授评价' || selectedItem === '成绩确认') {
     return <RestrictedAccessView onBack={backToMenu} selectedItem={selectedItem} />;
  }

  // --- Main Menu View ---
  return <HeroSection onBack={onBack} onItemClick={handleItemClick} />;
};

export default CollegeView;
