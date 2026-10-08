import React, { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`px-5 py-4 border-b border-gray-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

export const CardTitle: React.FC<CardTitleProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <h3
      className={`text-base font-semibold text-gray-800 ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export const CardDescription: React.FC<CardDescriptionProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <p
      className={`text-xs text-gray-500 mt-0.5 ${className}`}
      {...props}
    >
      {children}
    </p>
  );
};

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardContent: React.FC<CardContentProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`px-5 py-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`px-5 py-3 bg-gray-50 border-t border-gray-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Object.assign(Card, {
  Header: CardHeader,
  Title: CardTitle,
  Description: CardDescription,
  Content: CardContent,
  Footer: CardFooter,
});
