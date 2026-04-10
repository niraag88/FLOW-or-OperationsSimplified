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
export const Core = { UploadFile };
