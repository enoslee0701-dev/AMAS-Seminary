import React, { useState } from 'react';
import { ChevronLeft, Building2, Handshake, BookOpen, Users, ArrowRight, MessageSquare, ShieldCheck, Globe, Send, CheckCircle } from 'lucide-react';
import { submitCooperation, isBackendConfigured } from '../services/cooperationService';

interface CooperationViewProps {
  onBack: () => void;
}

const CooperationView: React.FC<CooperationViewProps> = ({ onBack }) => {
  const [formData, setFormData] = useState({
    institution: '',
    contactName: '',
    email: '',
    cooperationType: '课程资源',
    message: ''
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const persistLocal = () => {
    try {
      const existing = JSON.parse(localStorage.getItem('amas_cooperation_submissions') || '[]');
      existing.push({ ...formData, submittedAt: new Date().toISOString() });
      localStorage.setItem('amas_cooperation_submissions', JSON.stringify(existing));
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.institution.trim() || !formData.contactName.trim() || !formData.email.trim()) {
      setFormError('请填写必填项');
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(formData.email)) { setFormError('邮箱格式不正确'); return; }
    setSubmitting(true);

    // Prefer the backend when configured. On any error (network / server /
    // unconfigured) we fall back to the existing localStorage flow so the
    // user still sees the success state — matches prior behavior.
    if (isBackendConfigured()) {
      const result = await submitCooperation({
        name: formData.contactName,
        email: formData.email,
        organization: formData.institution,
        message: formData.message,
        type: formData.cooperationType,
      });
      if (result.ok === true) {
        setIsSubmitted(true);
        setSubmitting(false);
        return;
      }
      // result.ok === false here — safe to read .error/.message.
      const errKind = (result as { error?: string }).error;
      const errMsg = (result as { message?: string }).message;
      if (errKind === 'validation') {
        // Mirror server validation error to the user; do NOT persist locally.
        setFormError(errMsg || '提交失败，请检查表单');
        setSubmitting(false);
        return;
      }
      // network/server/offline — fall through to local persistence so the
      // user still gets a confirmation (parity with previous behavior).
    }

    persistLocal();
    setIsSubmitted(true);
    setSubmitting(false);
  };

  if (isSubmitted) {
    return (
      <div className="flex-1 bg-white flex flex-col pt-safe-top animate-fade-in h-screen overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 border border-emerald-100 shadow-sm animate-bounce-subtle">
            <CheckCircle size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-3 tracking-tight">申请已提交</h2>
          <p className="text-slate-500 text-sm leading-relaxed mb-10 max-w-xs">
            感谢您对 AMAS 的关注！我们的机构合作专员将在 2 个工作日内通过邮件与您取得联系。
          </p>
          <button 
            onClick={onBack}
            className="w-full max-w-xs py-4 bg-blue-900 text-white rounded-2xl font-bold shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 flex flex-col pt-safe-top h-screen overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center shrink-0">
        <button onClick={onBack} className="p-1 -ml-1 rounded-full hover:bg-slate-100 text-slate-800 transition">
          <ChevronLeft size={24} />
        </button>
        <h2 className="ml-2 font-bold text-lg text-slate-900">机构合作</h2>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide pb-24">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-blue-900 to-blue-800 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 opacity-10 -mr-10 -mt-10"><Building2 size={200} /></div>
          <div className="relative z-10">
            <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full inline-flex items-center border border-white/20 mb-4">
              <Handshake size={14} className="mr-2 text-blue-200" />
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-100">Institutional Cooperation</span>
            </div>
            <h1 className="text-2xl font-black mb-3 tracking-tight">携手 AMAS<br/>共享数字化宣教未来</h1>
            <p className="text-xs text-blue-100 leading-relaxed opacity-90 max-w-[240px]">
              连接亚洲宣教神学院，通过领先的教育技术与丰富的神学资源，为您的机构注入新动力。
            </p>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="p-5">
          <h3 className="text-sm font-black text-slate-900 mb-4 uppercase tracking-widest flex items-center">
            <div className="w-1.5 h-4 bg-blue-600 mr-2 rounded-full"></div>
            合作权益
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: BookOpen, title: '课程订阅', desc: '全库神学课程授权', color: 'bg-indigo-50 text-indigo-600' },
              { icon: Users, title: '人才培养', desc: '宣教同工定向委培', color: 'bg-emerald-50 text-emerald-600' },
              { icon: Globe, title: '平台共享', desc: '社区与互动系统白标', color: 'bg-blue-50 text-blue-600' },
              { icon: ShieldCheck, title: '学术认证', desc: '学分互认与学位对接', color: 'bg-rose-50 text-rose-600' },
            ].map((item, idx) => (
              <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-start transition-transform hover:translate-y-[-2px]">
                <div className={`w-10 h-10 ${item.color} rounded-xl flex items-center justify-center mb-3`}>
                  <item.icon size={20} />
                </div>
                <h4 className="text-xs font-bold text-slate-800 mb-1">{item.title}</h4>
                <p className="text-[9px] text-slate-400 font-medium leading-tight">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Application Form */}
        <div className="p-5 pt-0">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 relative overflow-hidden">
            <h3 className="text-base font-black text-slate-900 mb-6 flex items-center">
               <MessageSquare size={20} className="mr-2 text-blue-600" />
               合作意向申请
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">机构名称</label>
                <input 
                  type="text" 
                  required
                  value={formData.institution}
                  onChange={e => setFormData({...formData, institution: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                  placeholder="请输入您的机构/堂会全称"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">联系人</label>
                  <input 
                    type="text" 
                    required
                    value={formData.contactName}
                    onChange={e => setFormData({...formData, contactName: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                    placeholder="您的姓名"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">合作类型</label>
                  <select 
                    value={formData.cooperationType}
                    onChange={e => setFormData({...formData, cooperationType: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all appearance-none"
                  >
                    <option>课程资源</option>
                    <option>人才委培</option>
                    <option>平台系统</option>
                    <option>赞助支持</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">工作邮箱</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                  placeholder="example@org.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">合作详情 (选填)</label>
                <textarea 
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-medium min-h-[100px] resize-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all"
                  placeholder="简述您的合作需求或想法..."
                />
              </div>

              {formError && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5 flex items-center text-rose-700 text-xs font-bold animate-fade-in">
                  <span className="mr-2">⚠</span>{formError}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-blue-900 text-white rounded-2xl font-bold shadow-lg shadow-blue-900/10 flex items-center justify-center group active:scale-95 transition-all disabled:opacity-60"
              >
                {submitting ? '提交中...' : <>提交申请 <Send size={18} className="ml-2 group-hover:translate-x-1 transition-transform" /></>}
              </button>
            </form>
          </div>
        </div>

        {/* Success Partners Area */}
        <div className="p-5 pt-0">
          <div className="bg-slate-100/50 rounded-2xl p-4 border border-slate-200/50">
             <div className="flex items-center space-x-1 mb-3">
                {[1,2,3,4].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-300"></div>)}
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Existing Partners</span>
             </div>
             <div className="flex flex-wrap gap-4 items-center opacity-40 grayscale group-hover:grayscale-0 transition-all">
                <span className="text-xs font-black tracking-tighter">MISSION ASIA</span>
                <span className="text-xs font-black tracking-tighter">GOSPEL TECH</span>
                <span className="text-xs font-black tracking-tighter">ASI_THEOLOGY</span>
                <span className="text-xs font-black tracking-tighter">CROSS_LIGHT</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CooperationView;
