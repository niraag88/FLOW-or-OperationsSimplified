import PrintStyles from './PrintStyles';

export default function PrintPage({ children, className = "", style = {} }) {
  const defaultStyle = {
    maxWidth: '210mm',
    margin: '0 auto',
    padding: '20mm',
    background: 'white',
    fontFamily: 'sans-serif',
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