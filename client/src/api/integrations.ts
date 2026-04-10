interface UploadResult {
  success: boolean;
  file_url: string | ArrayBuffer | null;
}

async function _uploadFile({ file }: { file: File }): Promise<UploadResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({ success: true, file_url: e.target ? e.target.result : null });
    };
    reader.readAsDataURL(file);
  });
}

export const UploadFile = _uploadFile;

export const InvokeLLM = (): Promise<{ success: boolean }> => Promise.resolve({ success: true });
export const SendEmail = (): Promise<{ success: boolean }> => Promise.resolve({ success: true });
export const GenerateImage = (): Promise<{ success: boolean; url: string }> => Promise.resolve({ success: true, url: '#' });
export const ExtractDataFromUploadedFile = (): Promise<{ success: boolean; data: Record<string, unknown> }> => Promise.resolve({ success: true, data: {} });
export const Core = { InvokeLLM, SendEmail, UploadFile, GenerateImage, ExtractDataFromUploadedFile };
