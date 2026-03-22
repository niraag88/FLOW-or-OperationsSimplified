import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Paperclip, X, FileText, Image } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const ALLOWED_TYPES = {
  'application/pdf': { ext: 'pdf', label: 'PDF' },
  'image/jpeg': { ext: 'jpg', label: 'JPG' },
  'image/jpg': { ext: 'jpg', label: 'JPG' },
  'image/png': { ext: 'png', label: 'PNG' },
};

const MAX_SIZE_BYTES = 25 * 1024 * 1024;

function getFileExtension(mimeType) {
  return ALLOWED_TYPES[mimeType]?.ext || 'pdf';
}

function buildStorageKey(recordType, documentNumber, file) {
  const year = new Date().getFullYear();
  const ext = getFileExtension(file.type);
  const safeName = (documentNumber || 'doc').replace(/[^a-zA-Z0-9\-_]/g, '-');
  return `${recordType}/${year}/${safeName}-attachment.${ext}`;
}

export default function UploadFileDialog({ open, onClose, onSuccess, recordType, recordId, documentNumber }) {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setError('');
    if (!file) return;

    if (!ALLOWED_TYPES[file.type]) {
      setError('Only PDF, JPG, and PNG files are accepted.');
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('File must be 25 MB or smaller.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError('');

    try {
      const storageKey = buildStorageKey(recordType, documentNumber, selectedFile);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/storage/upload-scan', {
        method: 'POST',
        headers: {
          'x-storage-key': storageKey,
          'x-content-type': selectedFile.type,
          'x-file-size': String(selectedFile.size),
        },
        body: formData,
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      toast({ title: 'File uploaded', description: 'The attachment has been saved.' });
      onSuccess(storageKey);
      handleClose();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
    onClose();
  };

  const getFileIcon = () => {
    if (!selectedFile) return null;
    if (selectedFile.type === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
    return <Image className="w-5 h-5 text-blue-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="w-4 h-4" />
            Upload Attachment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-600">Click to select a file</p>
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 25 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {selectedFile && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {getFileIcon()}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedFile(null); if (inputRef.current) inputRef.current.value = ''; }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
