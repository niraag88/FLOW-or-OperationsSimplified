import PrintStyles from './PrintStyles';

export default function PrintPage({ children, className = "", style = {} }) {
  const defaultStyle = {
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