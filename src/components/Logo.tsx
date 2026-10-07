import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  variant?: 'horizontal' | 'vertical' | 'icon-only';
  className?: string;
  onClick?: () => void;
  clickable?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showText = false,
  subtitle,
  variant = 'horizontal',
  className = '',
  onClick,
  clickable = false,
}) => {
  const sizeMap = {
    sm: { box: 'w-9 h-9', text: 'text-sm', subText: 'text-[10px]' },
    md: { box: 'w-10 h-10', text: 'text-base', subText: 'text-xs' },
    lg: { box: 'w-14 h-14', text: 'text-xl', subText: 'text-xs' },
    xl: { box: 'w-20 h-20', text: 'text-2xl', subText: 'text-sm' },
  };

  const currentSize = sizeMap[size];
  const isInteractive = clickable || !!onClick;

  // Custom Thesis + Medical Research Emblem
  const iconSvg = (
    <div
      className={`relative ${currentSize.box} rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 p-0.5 shadow-md shadow-blue-500/20 flex items-center justify-center shrink-0 overflow-hidden select-none`}
    >
      {/* Background subtle mesh glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />

      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full p-1.5 drop-shadow-xs select-none pointer-events-none"
      >
        {/* Academic Mortarboard / Thesis Cap */}
        <path
          d="M24 6L6 15L24 24L42 15L24 6Z"
          fill="white"
          fillOpacity="0.95"
        />
        {/* Cap base & underside */}
        <path
          d="M14 19.5V26.5C14 26.5 17.5 30 24 30C30.5 30 34 26.5 34 26.5V19.5L24 24.5L14 19.5Z"
          fill="white"
          fillOpacity="0.8"
        />
        {/* Tassel */}
        <path
          d="M38 17.5V26.5M38 26.5C37.5 27 36.5 28 36.5 29C36.5 30 38 31 38 31C38 31 39.5 30 39.5 29C39.5 28 38.5 27 38 26.5Z"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Clinical Research Medical Cross */}
        <rect x="21.5" y="32" width="5" height="11" rx="1.5" fill="#38BDF8" />
        <rect x="18.5" y="35" width="11" height="5" rx="1.5" fill="#38BDF8" />

        {/* Center Research Sync Node */}
        <circle cx="24" cy="15" r="2" fill="#0284C7" />
      </svg>
    </div>
  );

  const interactiveClasses = isInteractive
    ? 'cursor-pointer active:scale-[0.97] active:opacity-90 select-none -webkit-user-select-none transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl touch-manipulation'
    : 'select-none';

  if (variant === 'icon-only' || !showText) {
    if (isInteractive) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label="Thesis Progress Tracker - Go to Home"
          className={`inline-flex items-center p-1 -m-1 ${interactiveClasses} ${className}`}
        >
          {iconSvg}
        </button>
      );
    }
    return <div className={`inline-flex items-center ${className}`}>{iconSvg}</div>;
  }

  if (variant === 'vertical') {
    const content = (
      <>
        {iconSvg}
        <div>
          <h1 className={`font-extrabold text-slate-900 tracking-tight leading-none ${currentSize.text} select-none`}>
            THESIS PROGRESS TRACKER
          </h1>
          {subtitle && (
            <p className={`text-slate-500 font-medium mt-1 ${currentSize.subText} select-none`}>
              {subtitle}
            </p>
          )}
        </div>
      </>
    );

    if (isInteractive) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-label="Thesis Progress Tracker - Go to Home"
          className={`flex flex-col items-center text-center gap-3 p-2 -m-2 text-left ${interactiveClasses} ${className}`}
        >
          {content}
        </button>
      );
    }

    return (
      <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
        {content}
      </div>
    );
  }

  // Horizontal variant (used in desktop sidebar and mobile header)
  const horizontalContent = (
    <>
      {iconSvg}
      <div className="min-w-0 text-left">
        <h1 className={`font-bold text-slate-900 tracking-tight leading-tight truncate ${currentSize.text} select-none`}>
          THESIS PROGRESS TRACKER
        </h1>
        {subtitle && (
          <p className={`text-slate-500 font-medium truncate ${currentSize.subText} select-none`}>
            {subtitle}
          </p>
        )}
      </div>
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Thesis Progress Tracker - Go to Home"
        className={`flex items-center gap-3 p-1.5 -m-1.5 w-full text-left ${interactiveClasses} ${className}`}
      >
        {horizontalContent}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {horizontalContent}
    </div>
  );
};
