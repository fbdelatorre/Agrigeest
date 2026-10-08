import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <input
          className={`
            w-full h-10 px-3 bg-white border rounded-lg text-sm shadow-sm
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500
            [appearance:textfield]
            [&::-webkit-outer-spin-button]:appearance-none 
            [&::-webkit-inner-spin-button]:appearance-none
            ${error ? 'border-danger-500 focus:ring-danger-500 focus:border-danger-500' : 'border-gray-300 hover:border-gray-400'} 
            ${className}
          `}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-danger-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-xs text-gray-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
