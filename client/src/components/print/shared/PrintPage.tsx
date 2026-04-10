import React from 'react';
import PrintStyles from './PrintStyles';

interface PrintPageProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function PrintPage({ children, className = "", style = {} }: PrintPageProps) {
  const defaultStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '210mm',
    margin: '0 auto',
    background: 'white',
    fontFamily: 'sans-serif',
    minHeight: '297mm',
    boxSizing: 'border-box',
    ...style
  };

  return (
    <>
      <PrintStyles />
      <div className={`print-container ${className}`} style={defaultStyle}>
        {children}
      </div>
    </>
  );
}