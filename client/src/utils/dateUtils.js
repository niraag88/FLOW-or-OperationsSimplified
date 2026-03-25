import { format, parseISO, isValid } from "date-fns";

/**
 * Formats a date string to dd/MM/yy format
 * @param {string|Date} dateString - The date to format
 * @returns {string} - Formatted date string or empty string if invalid
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return isValid(date) ? format(date, 'dd/MM/yy') : '';
  } catch (error) {
    return '';
  }
};

/**
 * Formats a date string to dd/MM/yy format
 * @param {string|Date} dateString - The date to format
 * @returns {string} - Formatted date string or empty string if invalid
 */
export const formatDateFull = (dateString) => {
  if (!dateString) return '';
  try {
    const date = typeof dateString === 'string' ? parseISO(dateString) : new Date(dateString);
    return isValid(date) ? format(date, 'dd/MM/yy') : '';
  } catch (error) {
    return '';
  }
};