
import React from 'react';
import { Home, BookOpen, Library, User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ViewState } from '../types';

interface NavigationProps {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
  unreadCount?: number;
}

const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange, unreadCount = 0 }) => {
  const { t } = useTranslation();
  const navItems = [
    { id: ViewState.HOME, icon: Home, label: t('nav.home') },
    { id: ViewState.COURSES, icon: BookOpen, label: t('nav.courses') },
    { id: ViewState.COMMUNITY, icon: Users, label: t('nav.community') }, // Restored Community
    { id: ViewState.LIBRARY, icon: Library, label: t('nav.library') },
    { id: ViewState.PROFILE, icon: User, label: t('nav.profile') },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 pb-safe-area shadow-[0_-4px_10px_rgba(0,0,0,0.03)] z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors duration-200 ${
                isActive ? 'text-blue-900' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className="relative">
                <Icon
                  size={24}
                  className={isActive ? 'fill-blue-50 stroke-blue-900' : ''}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {item.id === ViewState.COMMUNITY && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center bg-rose-500 text-white text-[9px] font-bold rounded-full border-2 border-white shadow-sm px-0.5 animate-scale-in">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-bold ${isActive ? 'text-blue-900' : 'text-slate-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default Navigation;
