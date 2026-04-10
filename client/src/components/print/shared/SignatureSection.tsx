export default function SignatureSection({
  leftSignatureLabel,
  rightSignatureLabel
}: any) {
  return (
    <section className="mt-auto pt-8 border-t print-signature">
      <div className="grid grid-cols-2 gap-8">
        <div className="text-center">
          <div className="border-b border-gray-400 mb-2 pb-6"></div>
          <p className="text-sm font-medium">{leftSignatureLabel}</p>
        </div>
        <div className="text-center">
          <div className="border-b border-gray-400 mb-2 pb-6"></div>
          <p className="text-sm font-medium">{rightSignatureLabel}</p>
        </div>
      </div>
    </section>
  );
}
