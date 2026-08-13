import React from 'react';
import type { GiftEffect } from '../types';

// --- Gift Animation Layer Component ---
const GiftAnimationLayer: React.FC<{ activeEffects: GiftEffect[] }> = ({ activeEffects }) => {
  return (
    <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden">
      <style>{`
        @keyframes floatUpFade {
          0% { transform: translateY(0) scale(0.5) rotate(0deg); opacity: 0; }
          20% { opacity: 1; transform: translateY(-20px) scale(1.2) rotate(10deg); }
          100% { transform: translateY(-150px) scale(0.8) rotate(-10deg); opacity: 0; }
        }
        @keyframes floatUp {
            0% { transform: translateY(0) scale(0.8); opacity: 0; }
            20% { opacity: 1; transform: translateY(-40px) scale(1.2); }
            100% { transform: translateY(-300px) scale(1.5); opacity: 0; }
        }
        @keyframes burst {
          0% { transform: scale(0) rotate(0deg); opacity: 0; filter: brightness(1); }
          50% { opacity: 1; transform: scale(1.5) rotate(180deg); filter: brightness(1.5); }
          100% { transform: scale(2) rotate(360deg); opacity: 0; filter: brightness(1); }
        }
        @keyframes flyAcross {
          0% { transform: translateX(-50px) translateY(50px) scale(0.5); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateX(400px) translateY(-200px) scale(1.2); opacity: 0; }
        }
        @keyframes holyLight {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1.1); box-shadow: 0 0 50px white; }
          100% { opacity: 0; transform: scale(1.5); }
        }
        .animate-float-up {
            animation: floatUp 3.5s ease-out forwards;
        }
      `}</style>
      {(activeEffects.length > 30 ? activeEffects.slice(activeEffects.length - 30) : activeEffects).map(effect => {
        let animationStyle = {};
        if (effect.type === 'float') {
          animationStyle = { animation: `floatUpFade 2s ease-out forwards` };
        } else if (effect.type === 'burst') {
          animationStyle = { animation: `burst 2s ease-out forwards` };
        } else if (effect.type === 'fly') {
          animationStyle = { animation: `flyAcross 3s ease-in-out forwards` };
        } else if (effect.type === 'holy') {
          animationStyle = { animation: `holyLight 2.5s ease-out forwards` };
        }

        return (
          <div
            key={effect.id}
            className="absolute flex items-center justify-center text-6xl drop-shadow-lg"
            style={{
              left: `${effect.x}%`,
              top: `${effect.y}%`,
              ...animationStyle,
              textShadow: `0 0 20px ${effect.color || 'white'}`,
              zIndex: effect.type === 'fly' ? 120 : 100,
              willChange: 'transform',
              transform: 'translateZ(0)',
              pointerEvents: 'none'
            }}
          >
            {effect.icon}
          </div>
        );
      })}
    </div>
  );
};

export default React.memo(GiftAnimationLayer);
