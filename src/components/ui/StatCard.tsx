import React from 'react';
import { Link } from 'react-router-dom';

type StatVariant = 'brand' | 'amber' | 'info' | 'purple' | 'danger' | 'success';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: StatVariant;
  to?: string;
  alert?: boolean;
}

const variantConfig: Record<StatVariant, { bg: string; iconColor: string }> = {
  brand: { bg: '#DDEEE4', iconColor: '#1F6B45' },
  amber: { bg: '#FFF7E1', iconColor: '#C08A22' },
  info: { bg: '#EAF2FF', iconColor: '#3471DD' },
  purple: { bg: '#F3EEFA', iconColor: '#6B4DAD' },
  danger: { bg: '#FDECEC', iconColor: '#C24444' },
  success: { bg: '#E8F5EE', iconColor: '#267A4D' },
};

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'brand',
  to,
  alert,
}) => {
  const cfg = variantConfig[variant];

  const inner = (
    <div
      className={`
        bg-white rounded-2xl border border-gray-200 shadow-card
        p-5 lg:p-6 h-full
        transition-all duration-150
        ${to ? 'hover:shadow-card-hover hover:border-gray-300 cursor-pointer' : ''}
      `}
      style={{ minHeight: '135px' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-gray-500 mb-1.5">{title}</p>
          <p className="text-[30px] lg:text-[32px] font-bold leading-none tracking-tight" style={{ color: alert ? '#C24444' : '#17231C' }}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[13px] text-gray-500 mt-2 truncate">{subtitle}</p>
          )}
        </div>
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-xl"
          style={{ width: '44px', height: '44px', backgroundColor: cfg.bg }}
        >
          <span style={{ color: cfg.iconColor }}>{icon}</span>
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block h-full">
        {inner}
      </Link>
    );
  }

  return inner;
};

export default StatCard;
