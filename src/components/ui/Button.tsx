import React, { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantConfig: Record<ButtonVariant, { enabled: string; disabled: string }> = {
  primary: {
    enabled: 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700 hover:border-brand-700',
    disabled: 'bg-brand-400 text-white border-brand-400',
  },
  secondary: {
    enabled: 'bg-brand-100 text-brand-700 border-brand-200 hover:bg-brand-200 hover:border-brand-300',
    disabled: 'bg-brand-100 text-brand-400 border-brand-200',
  },
  outline: {
    enabled: 'bg-white text-brand-600 border-gray-300 hover:bg-brand-50 hover:border-brand-600',
    disabled: 'bg-white text-gray-400 border-gray-300',
  },
  ghost: {
    enabled: 'bg-transparent text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900',
    disabled: 'bg-transparent text-gray-400 border-transparent',
  },
  danger: {
    enabled: 'bg-danger-500 text-white border-danger-500 hover:bg-danger-600 hover:border-danger-600',
    disabled: 'bg-danger-500/60 text-white border-danger-500/60',
  },
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const cfg = variantConfig[variant];
  const isDisabled = disabled || isLoading;
  const variantClasses = isDisabled ? cfg.disabled : cfg.enabled;

  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.98] ${variantClasses} ${sizeStyles[size]} ${isDisabled ? 'cursor-not-allowed active:scale-100' : ''} ${isLoading ? 'opacity-70 cursor-not-allowed active:scale-100' : ''} ${className}`}
      data-button="true"
      data-variant={variant}
      disabled={isDisabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!isLoading && leftIcon && <span className="mr-2 flex-shrink-0">{leftIcon}</span>}
      {children}
      {!isLoading && rightIcon && <span className="ml-2 flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};

export default Button;
