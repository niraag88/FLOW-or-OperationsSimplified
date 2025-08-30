import React, { useState, useEffect } from 'react';
import Uppy from '@uppy/core';
import { Dashboard } from '@uppy/react';
import XHRUpload from '@uppy/xhr-upload';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Download } from 'lucide-react';

import '@uppy/core/dist/style.min.css';
import '@uppy/dashboard/dist/style.min.css';

interface ScanUploaderProps {
  value?: string; // current scanKey
  onChange: (scanKey: string | null) => void;
  storageKey: string; // the target storage key for the PDF
  disabled?: boolean;
  className?: string;
}

export function ScanUploader({ value, onChange, storageKey, disabled = false, className }: ScanUploaderProps) {
  const [uppy, setUppy] = useState<Uppy | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const uppyInstance = new Uppy({
      restrictions: {
        maxNumberOfFiles: 1,
        maxFileSize: 25 * 1024 * 1024, // 25MB
        allowedFileTypes: ['.pdf'],
      },
      autoProceed: false,
    })
      .use(XHRUpload, {
        endpoint: '/api/storage/upload-scan',
        method: 'POST',
        formData: true,
        fieldName: 'file',
        headers: (file) => ({
          'x-storage-key': storageKey,
          'x-content-type': 'application/pdf',
          'x-file-size': (file.size || 0).toString(),
        }),
      })
      .on('upload-success', (file, response) => {
        const result = response?.body as any;
        if (result?.success && result?.key) {
          onChange(result.key);
          toast({
            title: 'Upload successful',
            description: 'PDF scan has been uploaded successfully.',
          });
          setShowDashboard(false);
        }
      })
      .on('upload-error', (file, error, response) => {
        console.error('Upload error:', error);
        toast({
          title: 'Upload failed',
          description: (response?.body as any)?.error || 'Failed to upload PDF scan.',
          variant: 'destructive',
        });
      })
      .on('upload', () => {
        setIsUploading(true);
      })
      .on('complete', () => {
        setIsUploading(false);
      });

    setUppy(uppyInstance);

    return () => {
      uppyInstance.destroy();
    };
  }, [storageKey, onChange, toast]);

  const handleDownload = async () => {
    if (!value) return;
    
    try {
      const response = await fetch(`/api/storage/signed-get?key=${encodeURIComponent(value)}`);
      if (!response.ok) {
        throw new Error('Failed to get download URL');
      }
      
      const data = await response.json();
      if (data.url) {
        // Open the signed URL in a new tab
        window.open(data.url, '_blank');
      } else {
        throw new Error('No download URL returned');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to download PDF scan.',
        variant: 'destructive',
      });
    }
  };

  const handleRemove = () => {
    onChange(null);
    if (uppy) {
      uppy.cancelAll();
    }
    toast({
      title: 'Scan removed',
      description: 'PDF scan has been removed from the form.',
    });
  };

  if (!uppy) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        {!value ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDashboard(true)}
            disabled={disabled || isUploading}
            data-testid="button-upload-scan"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload PDF Scan
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-green-600">
              <FileText className="w-4 h-4" />
              PDF uploaded
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={disabled}
              data-testid="button-download-scan"
            >
              <Download className="w-4 h-4 mr-1" />
              Download
            </Button>
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemove}
                data-testid="button-remove-scan"
              >
                Remove
              </Button>
            )}
          </div>
        )}
      </div>
      
      <p className="text-xs text-muted-foreground">
        Only PDF scans (≤ 25 MB).
      </p>

      {showDashboard && (
        <div className="border rounded-lg p-4">
          <Dashboard
            uppy={uppy}
            hideUploadButton={false}
            hideRetryButton={false}
            hidePauseResumeButton={false}
            hideCancelButton={false}
            hideProgressDetails={false}
            proudlyDisplayPoweredByUppy={false}
            height={300}
          />
          <div className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDashboard(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}