import { base44 } from './base44Client';

export const Core = base44.integrations?.Core || {};

export const InvokeLLM = base44.integrations?.Core?.InvokeLLM || (() => Promise.resolve({}));

export const SendEmail = base44.integrations?.Core?.SendEmail || (() => Promise.resolve({}));

export const UploadFile = base44.integrations?.Core?.UploadFile || (() => Promise.resolve({}));

export const GenerateImage = base44.integrations?.Core?.GenerateImage || (() => Promise.resolve({}));

export const ExtractDataFromUploadedFile = base44.integrations?.Core?.ExtractDataFromUploadedFile || (() => Promise.resolve({}));