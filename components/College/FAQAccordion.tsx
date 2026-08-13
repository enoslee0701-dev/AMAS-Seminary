
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface FAQItem {
  q: string;
  a: string;
}

export const FAQAccordion = ({ faqs }: { faqs: FAQItem[] }) => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
       <div className="space-y-3">
          {faqs.map((faq, idx) => {
             const isOpen = openIndex === idx;
             return (
                <div
                  key={idx}
                  className={`bg-white rounded-xl border transition-all duration-300 overflow-hidden ${isOpen ? 'border-blue-300 shadow-md' : 'border-slate-200 shadow-sm hover:border-blue-200'}`}
                >
                   <button
                     onClick={() => setOpenIndex(isOpen ? null : idx)}
                     className="w-full flex items-start justify-between p-4 text-left"
                   >
                      <div className="flex items-start pr-4">
                         <span className={`text-sm font-bold mr-3 mt-0.5 ${isOpen ? 'text-blue-700' : 'text-slate-700'}`}>Q{idx + 1}.</span>
                         <span className={`text-sm font-bold leading-relaxed ${isOpen ? 'text-blue-900' : 'text-slate-800'}`}>{faq.q}</span>
                      </div>
                      <div className={`shrink-0 mt-1 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                         {isOpen ? <ChevronUp size={18} className="text-blue-500" /> : <ChevronDown size={18} className="text-slate-400" />}
                      </div>
                   </button>

                   <div
                     className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
                   >
                      <div className="px-4 pb-5 pt-0 pl-10">
                         <p className="text-sm text-slate-600 leading-7 text-justify whitespace-pre-wrap border-l-2 border-blue-100 pl-3">
                            {faq.a}
                         </p>
                      </div>
                   </div>
                </div>
             );
          })}
       </div>
    );
};

export default FAQAccordion;
