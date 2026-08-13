import React, { useState } from 'react';
import { Lock, GraduationCap, UserPlus, LogIn, CheckCircle2, ShieldCheck, UserCheck, AlertCircle, User, CheckCircle, KeyRound, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AcademicLevel } from '../types';
import { register as apiRegister, login as apiLogin, type PublicUser } from '../services/authService';

interface AuthViewProps {
  onLogin: (userData: any) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AuthView: React.FC<AuthViewProps> = ({ onLogin }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'register' | 'professor_apply'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<AcademicLevel>(AcademicLevel.BTH);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profApplied, setProfApplied] = useState(false);

  const validateCredentials = (): string | null => {
    const e = email.trim();
    if (!e) return t('auth.validation.emailRequired');
    if (!EMAIL_RE.test(e)) return t('auth.validation.emailInvalid');
    if (!password) return t('auth.validation.passwordRequired');
    if (mode === 'register') {
      if (password.length < 8) return t('auth.validation.passwordTooShort');
      if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return t('auth.validation.passwordComplexity');
      const n = name.trim();
      if (n.length < 1) return t('auth.validation.nameRequired');
      if (n.length > 64) return t('auth.validation.nameTooLong');
    } else {
      // Login — server enforces the real length rule; just guard against empty.
      if (password.length < 1) return t('auth.validation.passwordRequired');
    }
    return null;
  };

  /**
   * Adapt the backend's PublicUser into the shape App.tsx already
   * consumes (it expects `name`, `email`, `degree`, `avatar`, optional
   * `role`). We attach the locally selected degree for new student
   * accounts; existing accounts keep their stored degree if the server
   * provided one.
   */
  const toAppUser = (user: PublicUser): any => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    degree: user.degree ?? (mode === 'register' ? selectedLevel : 'M.Div'),
    avatar: user.avatar ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (mode === 'professor_apply') {
      setProfApplied(true);
      return;
    }

    const err = validateCredentials();
    if (err) { setAuthError(err); return; }

    setIsLoading(true);
    try {
      const user = mode === 'register'
        ? await apiRegister(email.trim(), password, name.trim())
        : await apiLogin(email.trim(), password);
      onLogin(toAppUser(user));
    } catch (e: any) {
      // Translate common server messages into localized text. The server
      // already returns user-friendly strings, but we map the critical
      // ones for clarity.
      const status: number | undefined = e?.status;
      const msg: string = e?.message ?? t('auth.errors.network');
      if (status === 409) {
        setAuthError(t('auth.errors.emailExists'));
      } else if (status === 401) {
        setAuthError(t('auth.errors.invalidCredentials'));
      } else if (status === 0) {
        setAuthError(t('auth.errors.noConnection'));
      } else if (status === 400) {
        setAuthError(msg);
      } else {
        setAuthError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminQuickEntry = () => {
    // Admin quick-entry remains a local-only shortcut for now — it
    // bypasses the auth backend and goes straight into the admin UI.
    // (Real admin login would call apiLogin() with an admin account.)
    onLogin({
      name: '管理员',
      email: 'admin@amas.hk',
      degree: '教务管理',
      role: 'admin',
      avatar: 'https://ui-avatars.com/api/?name=Admin&background=1e3a8a&color=fff&bold=true',
    });
  };

  const degreeOptions = [
    { level: AcademicLevel.BTH, title: '神学学士 B.Th', desc: 'BACHELOR OF THEOLOGY' },
    { level: AcademicLevel.MDIV, title: '道学硕士 M.Div', desc: 'MASTER OF DIVINITY' },
    { level: AcademicLevel.MPTH, title: '教牧学研究硕士 M.P.Th', desc: 'MASTER OF PASTORAL THEOLOGY' },
    { level: AcademicLevel.DMIN, title: '教牧学博士 D.Min', desc: 'DOCTOR OF MINISTRY' },
    { level: AcademicLevel.PHD, title: '哲学博士 Ph.D.', desc: 'DOCTOR OF PHILOSOPHY' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 animate-fade-in">
      {/* Background Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-5">
         <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-900 rounded-full blur-3xl"></div>
         <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-900 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-sm z-10">
        {/* Logo Section */}
        <div className="text-center mb-8">
           <div className="w-20 h-20 bg-blue-900 rounded-3xl mx-auto flex items-center justify-center shadow-2xl mb-4 border-2 border-white/20">
              <span className="text-white font-serif font-bold text-2xl tracking-tighter">AMAS</span>
           </div>
           <h1 className="text-2xl font-black text-blue-900 tracking-tight">{t('auth.title')}</h1>
           <p className="text-slate-400 text-[10px] mt-1 font-bold uppercase tracking-widest text-center leading-tight">{t('auth.subtitle')}</p>
        </div>

        {/* Admin Quick Entry */}
        <button
          type="button"
          onClick={handleAdminQuickEntry}
          className="w-full mb-4 bg-gradient-to-r from-slate-900 to-blue-900 hover:from-slate-800 hover:to-blue-800 text-white py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center group"
        >
          <KeyRound size={16} className="mr-2 group-hover:rotate-12 transition-transform"/>
          {t('auth.adminQuickEntry')}
          <span className="ml-2 text-[10px] font-black uppercase tracking-widest opacity-70">{t('auth.adminBadge')}</span>
        </button>

        {/* Auth Card */}
        <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-blue-900/10 p-8 border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-900 via-blue-700 to-blue-900"></div>

          <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
             <button
                onClick={() => { setMode('register'); setAuthError(null); }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${mode === 'register' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
             >
                {t('auth.tabs.register')}
             </button>
             <button
                onClick={() => { setMode('login'); setAuthError(null); }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${mode === 'login' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500'}`}
             >
                {t('auth.tabs.login')}
             </button>
          </div>

          {mode === 'professor_apply' && profApplied ? (
            <div className="animate-fade-in text-center py-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">{t('auth.professor.submitted')}</h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">{t('auth.professor.submittedDesc')}</p>
              <button
                onClick={() => { setProfApplied(false); setMode('login'); }}
                className="w-full bg-blue-900 text-white py-3 rounded-2xl font-bold text-sm"
              >{t('auth.buttons.backToLogin')}</button>
            </div>
          ) : mode === 'professor_apply' ? (
            <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start mb-2">
                <AlertCircle size={18} className="text-blue-600 mr-3 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 leading-relaxed font-medium">
                  {t('auth.professor.notice')}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-950 uppercase tracking-widest ml-1">{t('auth.professor.applicantName')}</label>
                <input
                  type="text"
                  placeholder={t('auth.fields.namePlaceholder')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-blue-900/10 outline-none transition-all text-slate-950 font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-slate-950 uppercase tracking-widest ml-1">{t('auth.professor.contact')}</label>
                <input
                  type="text"
                  placeholder={t('auth.professor.contactPlaceholder')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-sm focus:ring-2 focus:ring-blue-900/10 outline-none transition-all text-slate-950 font-bold"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-sm shadow-xl transition-all active:scale-95 flex items-center justify-center mt-6"
              >
                <UserCheck size={18} className="mr-2"/>
                {t('auth.buttons.submitApplication')}
              </button>

              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-center text-xs font-bold text-slate-400 mt-4 hover:text-blue-900 transition-colors"
              >
                {t('auth.buttons.backToLogin')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
               {mode === 'register' && (
                  <div className="space-y-1.5">
                     <label className="text-[11px] font-black text-slate-950 uppercase tracking-widest ml-1">{t('auth.fields.name')}</label>
                     <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                           type="text"
                           value={name}
                           onChange={(e) => setName(e.target.value)}
                           placeholder={t('auth.fields.namePlaceholder')}
                           autoComplete="name"
                           className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-blue-900/10 outline-none transition-all font-bold text-slate-950"
                           required
                        />
                     </div>
                  </div>
               )}

               <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-950 uppercase tracking-widest ml-1">{t('auth.fields.email')}</label>
                  <div className="relative">
                     <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('auth.fields.emailPlaceholder')}
                        autoComplete={mode === 'login' ? 'username' : 'email'}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-blue-900/10 outline-none transition-all font-bold text-slate-950"
                        required
                     />
                  </div>
               </div>

               <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-slate-950 uppercase tracking-widest ml-1">{t('auth.fields.password')}</label>
                  <div className="relative">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                     <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={mode === 'register' ? t('auth.fields.passwordRegisterPlaceholder') : t('auth.fields.passwordLoginPlaceholder')}
                        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:ring-2 focus:ring-blue-900/10 outline-none transition-all font-bold text-slate-950"
                        required
                     />
                  </div>
               </div>

               {mode === 'register' && (
                  <div className="space-y-3 pt-2">
                     <label className="text-[11px] font-black text-slate-950 uppercase tracking-widest ml-1 flex items-center mb-3">
                        <GraduationCap size={14} className="mr-2 text-blue-600"/>
                        {t('auth.fields.identity')}
                     </label>
                     <div className="space-y-3">
                        {degreeOptions.map((opt) => (
                           <div
                              key={opt.level}
                              onClick={() => setSelectedLevel(opt.level)}
                              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${selectedLevel === opt.level ? 'border-blue-600 bg-white shadow-md shadow-blue-900/5' : 'border-slate-100 bg-white hover:bg-slate-50'}`}
                           >
                              <div className="min-w-0">
                                 <p className={`text-base font-bold ${selectedLevel === opt.level ? 'text-blue-900' : 'text-slate-800'}`}>{opt.title}</p>
                                 <p className="text-[10px] text-slate-400 mt-1 font-black uppercase tracking-wider">{opt.desc}</p>
                              </div>
                              {selectedLevel === opt.level && (
                                <div className="bg-blue-50 text-blue-600 rounded-full p-0.5">
                                  <CheckCircle size={18} fill="currentColor" className="text-white" />
                                </div>
                              )}
                           </div>
                        ))}
                     </div>
                  </div>
               )}

               {authError && (
                 <div className="bg-rose-50 border border-rose-100 rounded-2xl px-4 py-2.5 flex items-center text-rose-700 text-xs font-bold animate-fade-in">
                   <AlertCircle size={14} className="mr-2 flex-shrink-0" /> {authError}
                 </div>
               )}

               <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-900 hover:bg-blue-800 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center disabled:opacity-70 mt-6"
               >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      {mode === 'register' ? <UserPlus size={18} className="mr-2"/> : <LogIn size={18} className="mr-2"/>}
                      {mode === 'register' ? t('auth.buttons.register') : t('auth.buttons.login')}
                    </>
                  )}
               </button>

               <div className="pt-2 text-center">
                 <button
                   type="button"
                   onClick={() => setMode('professor_apply')}
                   className="text-[11px] font-black text-slate-400 hover:text-blue-600 transition-colors uppercase tracking-widest"
                 >
                   {t('auth.buttons.professorApply')}
                 </button>
               </div>
            </form>
          )}

          <div className="mt-6 flex items-center justify-center space-x-2 text-slate-400">
             <ShieldCheck size={14} />
             <span className="text-[10px] font-bold italic uppercase tracking-wider">{t('auth.secureGateway')}</span>
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-10 text-center text-[9px] text-slate-400 font-black uppercase tracking-[0.3em] opacity-60">
           {t('auth.footer')}
        </p>
      </div>
    </div>
  );
};

export default AuthView;
