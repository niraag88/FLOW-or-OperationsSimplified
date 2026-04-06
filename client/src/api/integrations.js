async function _uploadFile({ file }) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({ success: true, file_url: e.target.result });
    };
    reader.readAsDataURL(file);
  });
}

export const UploadFile = _uploadFile;

export const InvokeLLM = () => Promise.resolve({ success: true });
export const SendEmail = () => Promise.resolve({ success: true });
export const GenerateImage = () => Promise.resolve({ success: true, url: '#' });
export const ExtractDataFromUploadedFile = () => Promise.resolve({ success: true, data: {} });
export const Core = { InvokeLLM, SendEmail, UploadFile, GenerateImage, ExtractDataFromUploadedFile };
