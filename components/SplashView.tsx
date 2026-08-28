import React, { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';

interface SplashViewProps {
  onFinish: () => void;
}

const SplashView: React.FC<SplashViewProps> = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(onFinish, 9000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <>
      <style>{`
        @keyframes amasBgIn    { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes amasBgZoom  { 0% { transform: scale(1.10); } 100% { transform: scale(1.02); } }
        @keyframes amasLogoIn  { 0% { opacity: 0; transform: scale(0.92); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes amasUp      { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes amasFade    { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes amasGlow    { 0% { opacity: 0; } 70% { opacity: 0.42; } 100% { opacity: 0.28; } }
        @keyframes amasBookIn  { 0% { opacity: 0; transform: translateY(20px) scale(0.96); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes amasOpenL   { 0% { transform: scaleX(0.02); opacity: 0; } 50% { opacity: 1; } 100% { transform: scaleX(1); opacity: 1; } }
        @keyframes amasOpenR   { 0% { transform: scaleX(0.02); opacity: 0; } 50% { opacity: 1; } 100% { transform: scaleX(1); opacity: 1; } }
        @keyframes amasRibbon  { 0% { transform: scaleY(0); opacity: 0; } 100% { transform: scaleY(1); opacity: 0.95; } }
        @keyframes amasGilt    { 0% { opacity: 0; } 100% { opacity: 0.9; } }
        @keyframes amasCtaIn   { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes amasCtaPulse{ 0%,100% { text-shadow: 0 0 14px rgba(232,201,140,0.45), 0 2px 8px rgba(0,0,0,0.7); } 50% { text-shadow: 0 0 30px rgba(232,201,140,0.90), 0 2px 8px rgba(0,0,0,0.7); } }
        @keyframes amasArrow   { 0%,100% { transform: translateX(0); opacity: 0.7; } 50% { transform: translateX(4px); opacity: 1; } }
        @keyframes amasLineGrow{ 0% { width: 0; opacity: 0; } 100% { width: 44px; opacity: 1; } }

        .amas-splash         { animation: amasBgIn 0.5s ease-out 0s both; }
        .amas-splash-bg      { animation: amasBgZoom 9s ease-out 0s both; }
        .amas-splash-glow    { animation: amasGlow 2.4s ease-in-out 0.3s both; }
        .amas-splash-book    { animation: amasBookIn 1.0s ease-out 1.6s both; }
        .amas-splash-pageL   { animation: amasOpenL 1.1s cubic-bezier(0.22, 1, 0.36, 1) 1.95s both; transform-origin: 200px 96px; transform-box: view-box; }
        .amas-splash-pageR   { animation: amasOpenR 1.1s cubic-bezier(0.22, 1, 0.36, 1) 1.95s both; transform-origin: 200px 96px; transform-box: view-box; }
        .amas-splash-gilt    { animation: amasGilt   0.8s ease-out 2.7s both; }
        .amas-splash-ribbon  { animation: amasRibbon 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 2.85s both; transform-origin: 200px 92px; transform-box: view-box; }
        .amas-splash-logo    { animation: amasLogoIn 0.5s ease-out 0.30s both; }
        .amas-splash-title   { animation: amasUp     0.5s ease-out 0.70s both; }
        .amas-splash-suben   { animation: amasFade   0.4s ease-out 1.00s both; }
        .amas-splash-line    { animation: amasLineGrow 0.5s ease-out 1.15s both; }
        .amas-splash-cert    { animation: amasFade   0.4s ease-out 1.30s both; }
        .amas-splash-mission { animation: amasUp     0.5s ease-out 1.55s both; }
        .amas-splash-vcall   { animation: amasUp     0.6s ease-out 2.30s both; }
        .amas-splash-cta     { animation: amasCtaIn  0.7s ease-out 2.60s both, amasCtaPulse 2.6s ease-in-out 3.50s infinite; }
        .amas-splash-arrow   { animation: amasArrow  1.6s ease-in-out 3.50s infinite; }
        .amas-splash-attr    { animation: amasFade   0.5s ease-out 2.95s both; }
        @keyframes amasSloganIn { 0% { opacity: 0; transform: translateY(12px) scale(0.96); letter-spacing: 14px; } 100% { opacity: 1; transform: translateY(0) scale(1); letter-spacing: 6px; } }
        @keyframes amasShimmer  { 0% { background-position: 200% 50%; } 100% { background-position: -200% 50%; } }
        @keyframes amasRule     { 0% { width: 0; opacity: 0; } 100% { width: 56px; opacity: 1; } }
        @keyframes amasChipIn   { 0% { opacity: 0; transform: scale(0.9); } 100% { opacity: 1; transform: scale(1); } }
        .amas-splash-slogan-chip { animation: amasChipIn 0.5s ease-out 1.85s both; }
        .amas-splash-slogan      { animation: amasSloganIn 0.9s cubic-bezier(0.22, 1, 0.36, 1) 2.05s both, amasShimmer 4.5s linear 3.2s infinite; }
        .amas-splash-slogan-rule { animation: amasRule 0.6s ease-out 2.35s both; }
        .amas-splash-slogan-sub  { animation: amasFade 0.6s ease-out 2.55s both; }
      `}</style>

      <div
        className="amas-splash fixed inset-0 z-[200] overflow-hidden flex flex-col items-center"
        style={{
          backgroundColor: '#050D22',
          paddingTop: 'calc(env(safe-area-inset-top) + 40px)',
        }}
      >
        {/* Chapel backdrop — slowly drifts in (very subtle) */}
        <div
          className="amas-splash-bg absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "url('/splash-bg.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        {/* Tonal wash for legibility (bottom darker so verse + CTA stay readable) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(5,13,34,0.05) 0%, rgba(5,13,34,0.10) 35%, rgba(5,13,34,0.45) 65%, rgba(5,13,34,0.78) 100%)',
          }}
        />

        {/* Soft halo behind brand */}
        <div
          className="amas-splash-glow absolute pointer-events-none"
          style={{
            top: '18%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 460,
            height: 460,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(232,201,140,0.55) 0%, rgba(232,201,140,0.15) 35%, rgba(232,201,140,0) 70%)',
            filter: 'blur(28px)',
            mixBlendMode: 'screen',
          }}
        />

        {/* === BRAND STACK (top) === */}
        <div className="flex flex-col items-center relative" style={{ width: '100%', zIndex: 5 }}>
          <div
            className="amas-splash-logo flex items-center justify-center"
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.06)',
              boxShadow: '0 0 48px rgba(232,201,140,0.35), 0 0 0 1px rgba(232,201,140,0.18)',
              padding: 4,
              marginBottom: 18,
            }}
          >
            <img
              src="/amas-crest.png"
              alt="AMAS 校徽"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
              }}
            />
          </div>

          <div className="amas-splash-title flex items-baseline" style={{ gap: 10 }}>
            <span
              style={{
                fontFamily: '"Cormorant Garamond", Georgia, serif',
                fontSize: 30, fontWeight: 700, lineHeight: '34px',
                color: '#E8C98C', letterSpacing: '0.5px',
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              }}
            >
              AMAS
            </span>
            <span
              style={{
                fontFamily: '"PingFang SC", -apple-system, sans-serif',
                fontSize: 22, fontWeight: 700, lineHeight: '28px',
                color: '#E8C98C',
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              }}
            >
              亚洲宣教神学院
            </span>
          </div>

          <p
            className="amas-splash-suben"
            style={{
              marginTop: 8, marginBottom: 0,
              fontFamily: '-apple-system, "SF Pro Text", sans-serif',
              fontSize: 9.5, fontWeight: 500, letterSpacing: '0.22em',
              color: 'rgba(243,228,191,0.78)',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}
          >
            ASIA MISSIONARY ASSOCIATION SEMINARY
          </p>

          <div
            className="amas-splash-line"
            style={{ marginTop: 16, height: 2, borderRadius: 1, backgroundColor: '#C99A45' }}
          />

          <div
            className="amas-splash-cert inline-flex items-center"
            style={{
              marginTop: 14,
              height: 26, paddingLeft: 12, paddingRight: 14, borderRadius: 13,
              backgroundColor: 'rgba(8,24,59,0.72)',
              border: '1px solid rgba(201,154,69,0.32)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              gap: 6,
            }}
          >
            <ShieldCheck size={12} strokeWidth={2.2} color="#D7AE62" />
            <span
              style={{
                fontFamily: '"PingFang SC", -apple-system, sans-serif',
                fontSize: 12, fontWeight: 500, color: '#F1E4C3',
              }}
            >
              ATA 亚洲神学协会认证
            </span>
          </div>

          <p
            className="amas-splash-mission"
            style={{
              marginTop: 22, marginBottom: 0,
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 13, fontWeight: 500, letterSpacing: '2px',
              color: 'rgba(247,242,232,0.88)',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}
          >
            门徒训练 · 建造教会 · 使命宣教
          </p>
        </div>

        {/* === 定制化神学 SLOGAN (fills the quiet middle of the sky) === */}
        <div className="flex flex-col items-center justify-center relative" style={{ flex: 1, width: '100%', zIndex: 5, padding: '0 24px' }}>
          <span
            className="amas-splash-slogan-chip"
            style={{
              fontFamily: '-apple-system, "SF Pro Text", sans-serif',
              fontSize: 9.5, fontWeight: 700, letterSpacing: '0.26em',
              color: 'rgba(232,201,140,0.8)', textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}
          >
            AMAS CHRISTIAN PROFILE
          </span>

          {/* 主标题：定制化神学 */}
          <p
            className="amas-splash-slogan"
            style={{
              margin: '8px 0 0',
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 'clamp(38px, 11.5vw, 48px)', fontWeight: 900, lineHeight: 1.15,
              letterSpacing: '6px', whiteSpace: 'nowrap', textAlign: 'center',
              background: 'linear-gradient(100deg, #E4BC6E 0%, #FFF3D0 45%, #F7E3B4 50%, #E4BC6E 55%, #E4BC6E 100%)',
              backgroundSize: '200% 100%',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 3px 14px rgba(0,0,0,0.6))',
            }}
          >
            定制化神学
          </p>

          <div className="flex items-center" style={{ marginTop: 10, gap: 10 }}>
            <span className="amas-splash-slogan-rule" style={{ height: 1, background: 'linear-gradient(90deg, rgba(201,154,69,0), #C99A45)' }} />
            <span style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#E8C98C', boxShadow: '0 0 8px rgba(232,201,140,0.9)' }} />
            <span className="amas-splash-slogan-rule" style={{ height: 1, background: 'linear-gradient(90deg, #C99A45, rgba(201,154,69,0))' }} />
          </div>

          {/* 标语 */}
          <p
            className="amas-splash-slogan-sub"
            style={{
              margin: '12px 0 0',
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 'clamp(18px, 5.4vw, 22px)', fontWeight: 800, letterSpacing: '3px', lineHeight: 1.3,
              color: '#FFF3DA', textAlign: 'center', whiteSpace: 'nowrap',
              textShadow: '0 2px 12px rgba(0,0,0,0.7)',
            }}
          >
            认识你，才能装备你
          </p>
          <p
            className="amas-splash-slogan-sub"
            style={{
              margin: '8px 0 0',
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 12, fontWeight: 500, letterSpacing: '1.5px', lineHeight: '18px',
              color: 'rgba(247,242,232,0.82)', textAlign: 'center',
              textShadow: '0 1px 8px rgba(0,0,0,0.7)',
            }}
          >
            发现你的 12 项事奉倾向 · 生成专属装备路径
          </p>
        </div>

        {/* === VERSE + CTA + ATTRIBUTION === */}
        <div
          className="flex flex-col items-center relative"
          style={{
            width: '100%',
            zIndex: 5,
            marginBottom: 'calc(env(safe-area-inset-bottom) + 28% + 100px)',
          }}
        >
          <p
            className="amas-splash-vcall"
            style={{
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 15, fontWeight: 400, lineHeight: '24px',
              letterSpacing: '1.5px', color: 'rgba(247,242,232,0.88)',
              textShadow: '0 1px 8px rgba(0,0,0,0.7)',
              margin: 0, padding: '0 36px', textAlign: 'center',
            }}
          >
            我可以差遣谁呢？谁肯为我们去呢？
          </p>

          <button
            type="button"
            aria-label="进入首页"
            onClick={onFinish}
            className="amas-splash-cta inline-flex items-center justify-center active:scale-[0.97] transition-transform"
            style={{
              marginTop: 18,
              background: 'transparent', border: 'none',
              padding: '12px 24px', cursor: 'pointer',
              color: '#FFE8C0',
              fontFamily: '"PingFang SC", -apple-system, sans-serif',
              fontSize: 22, fontWeight: 700, letterSpacing: '4px',
              lineHeight: '30px', whiteSpace: 'nowrap',
            }}
          >
            我在这里，请差遣我
            <span
              className="amas-splash-arrow"
              style={{
                display: 'inline-block', marginLeft: 12,
                fontSize: 24, fontWeight: 400,
                color: '#E8C98C', transform: 'translateY(-1px)',
              }}
              aria-hidden
            >
              ›
            </span>
          </button>

          <p
            className="amas-splash-attr"
            style={{
              marginTop: 12, marginBottom: 0,
              fontFamily: '"Cormorant Garamond", Georgia, serif',
              fontStyle: 'italic',
              fontSize: 14, fontWeight: 500, letterSpacing: '0.6px',
              color: 'rgba(247,242,232,0.7)',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            }}
          >
            — 以赛亚书 6:8
          </p>
        </div>

        {/* === OPEN BIBLE (bottom) === */}
        <div
          className="amas-splash-book absolute pointer-events-none"
          style={{
            bottom: 0, left: 0, right: 0,
            height: '30%',
            zIndex: 3,
          }}
        >
          {/* Glow rising from the spine */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: '50%', top: '0%',
              transform: 'translateX(-50%)',
              width: '120%', height: '85%',
              background:
                'radial-gradient(ellipse 50% 70% at 50% 25%, rgba(255,232,180,0.85) 0%, rgba(232,201,140,0.40) 30%, rgba(201,154,69,0.10) 60%, rgba(201,154,69,0) 80%)',
              filter: 'blur(22px)',
              mixBlendMode: 'screen',
              opacity: 0.85,
            }}
          />

          <svg
            viewBox="0 0 400 220"
            preserveAspectRatio="xMidYMax slice"
            className="absolute"
            style={{ bottom: 0, left: 0, width: '100%', height: '100%' }}
          >
            <defs>
              <linearGradient id="amasPageL" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="#FFF7E2" />
                <stop offset="65%"  stopColor="#F1D9A4" />
                <stop offset="100%" stopColor="#9C7240" />
              </linearGradient>
              <linearGradient id="amasPageR" x1="1" y1="0" x2="0" y2="0">
                <stop offset="0%"   stopColor="#FFF7E2" />
                <stop offset="65%"  stopColor="#F1D9A4" />
                <stop offset="100%" stopColor="#9C7240" />
              </linearGradient>
              <linearGradient id="amasLeather" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#5C2810" />
                <stop offset="50%"  stopColor="#371607" />
                <stop offset="100%" stopColor="#160803" />
              </linearGradient>
              <linearGradient id="amasGilt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#F4D27A" />
                <stop offset="50%"  stopColor="#C99A45" />
                <stop offset="100%" stopColor="#7E5A28" />
              </linearGradient>
              <linearGradient id="amasSpineDark" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stopColor="rgba(20,8,2,0)" />
                <stop offset="50%"  stopColor="rgba(20,8,2,0.7)" />
                <stop offset="100%" stopColor="rgba(20,8,2,0)" />
              </linearGradient>
              <linearGradient id="amasRibbonGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="#C13030" />
                <stop offset="100%" stopColor="#7A1B1B" />
              </linearGradient>
            </defs>

            {/* Drop shadow */}
            <ellipse cx="200" cy="217" rx="178" ry="3.8" fill="rgba(0,0,0,0.5)" />

            {/* Leather binding base (wider than pages) */}
            <path
              d="M 24 196 Q 24 188 32 188 L 368 188 Q 376 188 376 196 L 376 213 Q 376 218 370 218 L 30 218 Q 24 218 24 213 Z"
              fill="url(#amasLeather)"
            />
            <line x1="32" y1="190" x2="368" y2="190" stroke="#C99A45" strokeWidth="0.7" opacity="0.65" />

            {/* Outer page-block edges (gilded — show book block thickness) */}
            <g className="amas-splash-gilt">
              <path
                d="M 32 188 L 32 110 Q 32 100 40 96 L 50 92 L 50 188 Z"
                fill="url(#amasGilt)"
              />
              <g stroke="#8C6225" strokeWidth="0.4" opacity="0.55">
                <line x1="34" y1="115" x2="48" y2="113" />
                <line x1="34" y1="128" x2="48" y2="126" />
                <line x1="34" y1="141" x2="48" y2="139" />
                <line x1="34" y1="154" x2="48" y2="152" />
                <line x1="34" y1="167" x2="48" y2="165" />
                <line x1="34" y1="180" x2="48" y2="178" />
              </g>
              <path
                d="M 368 188 L 368 110 Q 368 100 360 96 L 350 92 L 350 188 Z"
                fill="url(#amasGilt)"
              />
              <g stroke="#8C6225" strokeWidth="0.4" opacity="0.55">
                <line x1="352" y1="115" x2="366" y2="113" />
                <line x1="352" y1="128" x2="366" y2="126" />
                <line x1="352" y1="141" x2="366" y2="139" />
                <line x1="352" y1="154" x2="366" y2="152" />
                <line x1="352" y1="167" x2="366" y2="165" />
                <line x1="352" y1="180" x2="366" y2="178" />
              </g>
            </g>

            {/* LEFT PAGE — domed top curving from outer corner up over to spine */}
            <g className="amas-splash-pageL">
              <path
                d="M 50 92 Q 128 78 198 96 L 198 188 L 50 188 Z"
                fill="url(#amasPageL)"
              />
              {/* Inner spine shadow on left page */}
              <path
                d="M 198 96 L 198 188 L 184 188 Q 188 130 198 96 Z"
                fill="rgba(60,30,10,0.20)"
              />
              {/* Text lines — horizontal, decreasing toward top */}
              <g stroke="#6F5230" strokeWidth="0.7" opacity="0.55">
                <line x1="64" y1="106" x2="186" y2="109" />
                <line x1="62" y1="117" x2="190" y2="118" />
                <line x1="60" y1="128" x2="192" y2="128" />
                <line x1="60" y1="139" x2="192" y2="139" />
                <line x1="60" y1="150" x2="192" y2="150" />
                <line x1="60" y1="161" x2="192" y2="161" />
                <line x1="60" y1="172" x2="192" y2="172" />
                <line x1="60" y1="182" x2="178" y2="182" />
              </g>
            </g>

            {/* RIGHT PAGE */}
            <g className="amas-splash-pageR">
              <path
                d="M 350 92 Q 272 78 202 96 L 202 188 L 350 188 Z"
                fill="url(#amasPageR)"
              />
              <path
                d="M 202 96 L 202 188 L 216 188 Q 212 130 202 96 Z"
                fill="rgba(60,30,10,0.20)"
              />
              <g stroke="#6F5230" strokeWidth="0.7" opacity="0.55">
                <line x1="336" y1="106" x2="214" y2="109" />
                <line x1="338" y1="117" x2="210" y2="118" />
                <line x1="340" y1="128" x2="208" y2="128" />
                <line x1="340" y1="139" x2="208" y2="139" />
                <line x1="340" y1="150" x2="208" y2="150" />
                <line x1="340" y1="161" x2="208" y2="161" />
                <line x1="340" y1="172" x2="208" y2="172" />
                <line x1="340" y1="182" x2="222" y2="182" />
              </g>
            </g>

            {/* Spine band — dark gutter between pages */}
            <rect x="196" y="90" width="8" height="98" fill="url(#amasSpineDark)" />
            <line x1="200" y1="90" x2="200" y2="186" stroke="#1A0903" strokeWidth="1.2" opacity="0.55" />
            <line x1="200" y1="88" x2="200" y2="108" stroke="#FFE9B3" strokeWidth="2" opacity="0.85" />

            {/* Red ribbon bookmark — drops from spine */}
            <g className="amas-splash-ribbon">
              <path
                d="M 196 92 L 196 178 L 192 188 L 196 200 L 200 188 L 200 178 Z"
                fill="url(#amasRibbonGrad)"
              />
              <path
                d="M 200 92 L 200 178 L 204 188 L 208 200 L 204 188 L 200 178 Z"
                fill="url(#amasRibbonGrad)"
                opacity="0.85"
              />
              <line x1="198" y1="94" x2="198" y2="180" stroke="#E04D4D" strokeWidth="0.6" opacity="0.55" />
            </g>

            {/* Crisp shadow line where pages meet leather */}
            <line x1="32" y1="188" x2="368" y2="188" stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
          </svg>
        </div>
      </div>
    </>
  );
};

export default SplashView;
