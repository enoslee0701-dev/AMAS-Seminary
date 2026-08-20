import React, { useEffect, useRef, useState } from 'react';
import { Headset, Send, X } from 'lucide-react';
import { getSupportReply, QUICK_QUESTIONS, isSmartMode } from '../services/aiSupportService';

interface Msg { id: string; role: 'user' | 'model'; text: string }

const WELCOME =
  '您好，我是 AMAS 智能客服 🙌\n关于报名入学、学位课程、上课方式、证明开具等问题都可以问我。您也可以点击下方的常见问题快速开始。';

/**
 * AMAS 智能客服 — 全屏聊天覆盖层。
 * 配置了 GEMINI_API_KEY 时由 Gemini 回答；否则使用内置 FAQ 知识库。
 */
const AIServiceChat: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'w', role: 'model', text: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setInput('');
    const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setBusy(true);
    try {
      const history = messages
        .filter(m => m.id !== 'w')
        .map(m => ({ role: m.role, text: m.text }));
      const reply = await getSupportReply(q, history);
      setMessages(prev => [...prev, { id: `m-${Date.now()}`, role: 'model', text: reply }]);
    } finally {
      setBusy(false);
    }
  };

  const showQuick = messages.length <= 2;

  return (
    <div className="fixed inset-0 z-[120] max-w-md mx-auto flex flex-col bg-slate-50 animate-fade-in">
      {/* Header */}
      <div
        className="flex items-center px-4"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingBottom: 12,
          background: 'linear-gradient(160deg, #0A3878 0%, #04285F 70%)',
          borderBottom: '1px solid rgba(232,201,140,0.30)',
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)',
            border: '1.5px solid rgba(232,201,140,0.55)',
          }}
        >
          <Headset size={19} color="#E8C98C" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0" style={{ marginLeft: 10 }}>
          <p className="text-white font-bold" style={{ fontSize: 15, margin: 0, lineHeight: '20px' }}>AMAS 智能客服</p>
          <p style={{ fontSize: 10, margin: 0, color: 'rgba(232,201,140,0.9)', lineHeight: '14px' }}>
            {isSmartMode() ? 'AI 在线 · 招生与学务咨询' : '在线 · 招生与学务咨询'}
          </p>
        </div>
        <button onClick={onClose} aria-label="关闭客服" className="p-2 -mr-1 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition">
          <X size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] whitespace-pre-wrap"
              style={{
                padding: '10px 13px',
                borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                fontSize: 13.5, lineHeight: '21px',
                ...(m.role === 'user'
                  ? { background: '#04285F', color: '#FFFFFF' }
                  : { background: '#FFFFFF', color: '#1F2A37', border: '1px solid #E8E4DA', boxShadow: '0 1px 3px rgba(16,24,40,0.05)' }),
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div
              className="flex items-center"
              style={{
                gap: 5, padding: '12px 14px', borderRadius: '16px 16px 16px 4px',
                background: '#FFFFFF', border: '1px solid #E8E4DA',
              }}
            >
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="animate-bounce"
                  style={{
                    width: 6, height: 6, borderRadius: '50%', backgroundColor: '#C99A45',
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {showQuick && !busy && (
          <div className="flex flex-wrap" style={{ gap: 8, paddingTop: 4 }}>
            {QUICK_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => ask(q)}
                style={{
                  fontSize: 12, fontWeight: 600, color: '#04285F',
                  border: '1px solid rgba(4,40,95,0.25)', borderRadius: 999,
                  padding: '7px 12px', background: '#FFFFFF',
                }}
                className="active:scale-95 transition-transform"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-center px-3"
        style={{
          paddingTop: 10,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
          backgroundColor: '#FFFFFF',
          borderTop: '1px solid #E8E4DA',
          gap: 8,
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask(input)}
          placeholder="请输入您的问题…"
          className="flex-1 bg-slate-100 rounded-full outline-none focus:ring-2 focus:ring-blue-900"
          style={{ fontSize: 14, padding: '10px 16px', border: 'none' }}
        />
        <button
          onClick={() => ask(input)}
          disabled={!input.trim() || busy}
          aria-label="发送"
          className="flex items-center justify-center shrink-0 active:scale-90 transition-transform disabled:opacity-40"
          style={{ width: 42, height: 42, borderRadius: '50%', background: '#04285F' }}
        >
          <Send size={17} color="#E8C98C" />
        </button>
      </div>
    </div>
  );
};

export default AIServiceChat;
