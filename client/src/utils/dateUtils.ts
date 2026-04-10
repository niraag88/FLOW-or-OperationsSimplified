import { format, parseISO, isValid } from "date-fns";

export const formatDate = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return isValid(date) ? format(date, 'dd/MM/yy') : '';
  } catch {
    return '';
  }
};

export const formatDateFull = (dateString: string | Date | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return isValid(date) ? format(date, 'dd/MM/yy') : '';
  } catch {
    return '';
  }
};
