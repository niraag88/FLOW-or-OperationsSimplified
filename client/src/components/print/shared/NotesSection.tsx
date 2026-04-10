interface NotesSectionProps {
  title?: string;
  content?: string;
}

export default function NotesSection({ 
  title = "Notes", 
  content 
}: NotesSectionProps) {
  if (!content) return null;
  
  return (
    <section className="mb-8 print-section">
      <h3 className="text-sm font-semibold text-gray-500 uppercase mb-2">{title}</h3>
      <p className="text-gray-600 text-sm whitespace-pre-wrap">{content}</p>
    </section>
  );
}