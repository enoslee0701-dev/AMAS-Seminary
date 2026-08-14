
import React from 'react';
import {
  ChevronLeft, Stamp, Lock, MapPin,
  AlertCircle, CheckCircle, User
} from 'lucide-react';

interface SubViewProps {
  onBack: () => void;
}

export interface CertFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  type: string;
}

// 15. 开具证明 (Issue Certificates)
interface IssueCertificateProps extends SubViewProps {
  certFormSubmitted: boolean;
  certFormData: CertFormData;
  certFormError: string | null;
  setCertFormData: (data: CertFormData) => void;
  handleCertSubmit: (e: React.FormEvent) => void;
  resetCertForm: () => void;
}

export const IssueCertificateView = ({
  onBack,
  certFormSubmitted,
  certFormData,
  certFormError,
  setCertFormData,
  handleCertSubmit,
  resetCertForm,
}: IssueCertificateProps) => (
     <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative">
        <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200">
           <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
             <ChevronLeft size={24} className="text-slate-900" />
           </button>
           <h2 className="ml-2 font-bold text-lg text-slate-900">开具证明</h2>
        </div>

        <div className="p-4 space-y-4 pt-content-safe">
           {/* Info Card */}
           <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center mb-3">
                 <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                    <Stamp size={20} />
                 </div>
                 <h3 className="font-bold text-slate-900 text-base">证明办理说明</h3>
              </div>
              <div className="space-y-3">
                 <p className="text-xs text-slate-600 leading-relaxed text-justify">
                    学院教务处提供以下证明文件的开具服务。所有证明文件需经审核后开具，处理时间通常为3-5个工作日。
                 </p>
                 <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <h4 className="text-xs font-bold text-slate-700 mb-2">可申请证明类型：</h4>
                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                       {['在职证明', '毕业证明', '学位证明', '成绩证明', '开除证明', '宣教士训练证明', '牧师证证明', '其他'].map((t,i) => (
                          <div key={i} className="flex items-center">
                             <div className="w-1 h-1 bg-blue-400 rounded-full mr-1.5"></div>
                             {t}
                          </div>
                       ))}
                    </div>
                 </div>
                 <div className="bg-rose-50 border border-rose-100 rounded-lg p-2.5 flex items-start">
                    <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5 mr-2" />
                    <p className="text-[10px] text-rose-700 font-medium">
                       重要提示：证明文件邮寄费用需由申请人自付 (邮费自付)。
                    </p>
                 </div>
              </div>
           </div>

           {/* Application Form */}
           <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden">
              {certFormSubmitted && (
                 <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/95 backdrop-blur-[1px] animate-fade-in">
                    <div className="text-center px-6">
                       <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3 animate-bounce-subtle">
                          <CheckCircle size={24} />
                       </div>
                       <h3 className="font-bold text-slate-800">提交成功</h3>
                       <p className="text-xs text-slate-500 mt-1 mb-4">请留意您的邮箱或电话通知</p>
                       <button onClick={resetCertForm} className="bg-blue-900 text-white px-6 py-2 rounded-xl text-xs font-bold">再提交一份</button>
                    </div>
                 </div>
              )}

              <h3 className="font-bold text-slate-800 text-sm mb-4">证明申请表</h3>
              {certFormError && (
                 <div className="bg-rose-50 border border-rose-100 rounded-xl px-4 py-2.5 flex items-center text-rose-700 text-xs font-bold mb-3">
                    <AlertCircle size={14} className="mr-2 flex-shrink-0" /> {certFormError}
                 </div>
              )}
              <form onSubmit={handleCertSubmit} className="space-y-4">
                 <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">您的称呼 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={certFormData.name}
                      onChange={(e) => setCertFormData({...certFormData, name: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none"
                      placeholder="请输入姓名"
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">您的电话 <span className="text-red-500">*</span></label>
                    <input
                      type="tel"
                      value={certFormData.phone}
                      onChange={(e) => setCertFormData({...certFormData, phone: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none"
                      placeholder="联系电话"
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">您的邮箱</label>
                    <input
                      type="email"
                      value={certFormData.email}
                      onChange={(e) => setCertFormData({...certFormData, email: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none"
                      placeholder="接收电子版或通知"
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">邮寄地址</label>
                    <div className="relative">
                       <input
                         type="text"
                         value={certFormData.address}
                         onChange={(e) => setCertFormData({...certFormData, address: e.target.value})}
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm pl-9 focus:ring-2 focus:ring-blue-900 outline-none"
                         placeholder="如需纸质版请填写"
                       />
                       <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    </div>
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1.5">您需要开具的证明 <span className="text-red-500">*</span></label>
                    <select
                      value={certFormData.type}
                      onChange={(e) => setCertFormData({...certFormData, type: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-900 outline-none appearance-none"
                    >
                       <option value="">请选择证明类型...</option>
                       <option value="在职证明">在职证明</option>
                       <option value="毕业证明">毕业证明</option>
                       <option value="学位证明">学位证明</option>
                       <option value="成绩证明">成绩证明</option>
                       <option value="开除证明">开除证明</option>
                       <option value="宣教士训练证明">宣教士训练证明</option>
                       <option value="牧师证证明">牧师证证明</option>
                       <option value="其他">其他</option>
                    </select>
                 </div>

                 <button
                    type="submit"
                    className="w-full bg-blue-900 text-white font-bold py-3.5 rounded-xl shadow-lg mt-2 active:scale-95 transition-transform"
                 >
                    提交申请
                 </button>
              </form>
           </div>
        </div>
     </div>
);

// 16. 教授评价 & 成绩确认 (Restricted Access)
interface RestrictedAccessProps extends SubViewProps {
  selectedItem: string;
}

export const RestrictedAccessView = ({ onBack, selectedItem }: RestrictedAccessProps) => (
   <div className="min-h-screen bg-slate-50 pb-24 animate-fade-in relative flex flex-col">
      <div className="fixed top-0 left-0 right-0 max-w-md mx-auto z-20 bg-white/90 backdrop-blur-md px-4 py-3 pt-safe-top flex items-center shadow-sm border-b border-slate-200 shrink-0">
         <button onClick={onBack} className="p-1 -ml-2 rounded-full hover:bg-slate-100 transition">
           <ChevronLeft size={24} className="text-slate-900" />
         </button>
         <h2 className="ml-2 font-bold text-lg text-slate-900">{selectedItem}</h2>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 pt-content-safe">
         <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-indigo-600"></div>

            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
               <Lock size={32} className="text-slate-400" />
            </div>

            <h3 className="text-xl font-bold text-slate-900 mb-2">该功能仅对正式学员开放</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
               您正在尝试访问受保护的内容。<br/>请登录您的学生账号以查看{selectedItem === '教授评价' ? '教授评价' : '成绩单'}。
            </p>

            <div className="space-y-3">
               <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center">
                  <User size={16} className="text-slate-400 mr-3" />
                  <input type="text" placeholder="学号 / ID" className="bg-transparent text-sm w-full outline-none text-slate-700 placeholder:text-slate-400" disabled />
               </div>
               <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center">
                  <Lock size={16} className="text-slate-400 mr-3" />
                  <input type="password" placeholder="密码" className="bg-transparent text-sm w-full outline-none text-slate-700 placeholder:text-slate-400" disabled />
               </div>
            </div>

            <button
              onClick={() => alert("这是一个演示版，请联系管理员获取测试账号。")}
              className="w-full bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-lg mt-6 hover:bg-slate-900 transition-colors"
            >
               学员登录
            </button>

            <p className="text-[10px] text-slate-400 mt-4">
               忘记密码？请联系教务处重置。
            </p>
         </div>
      </div>
   </div>
);
