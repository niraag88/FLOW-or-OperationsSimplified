import { useState } from "react";
import type { AttachGrnState } from "./types";

interface UseGrnDocsOptions {
  toast: (args: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
  onRefresh: () => void;
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_DOC_SIZE = 5 * 1024 * 1024;

export function useGrnDocs({ toast, onRefresh }: UseGrnDocsOptions) {
  const [pendingDocs, setPendingDocs] = useState<(File | null)[]>([null, null, null]);
  const [attachGrnState, setAttachGrnState] = useState<AttachGrnState | null>(null);

  const updatePendingDoc = (idx: number, file: File | null) => {
    setPendingDocs(prev => {
      const arr = [...prev];
      arr[idx] = file;
      return arr;
    });
  };

  const handlePendingDocSelect = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({ title: 'Invalid file', description: 'Only PDF, JPG, PNG allowed.', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_DOC_SIZE) {
      toast({ title: 'File too large', description: 'Max 5 MB per document.', variant: 'destructive' });
      return;
    }
    updatePendingDoc(idx, file);
  };

  const uploadGrnDocToStorage = async (grnId: number, slot: number, file: File) => {
    // The server pins the staging key year to the current year (the GRN we
    // just created has receivedDate=now()), so build the key with the same
    // current year here.
    const extMap = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg' };
    const ext = extMap[file.type as keyof typeof extMap] || 'pdf';
    const safeName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').substring(0, 80);
    const storageKey = `goods-receipts/${new Date().getUTCFullYear()}/${Date.now()}-${safeName}.${ext}`;
    const formData = new FormData();
    formData.append('file', file);
    const uploadResp = await fetch('/api/storage/upload-scan', {
      method: 'POST',
      headers: {
        'x-storage-key': storageKey,
        'x-content-type': file.type,
        'x-file-size': String(file.size),
      },
      body: formData,
      credentials: 'include',
    });
    if (!uploadResp.ok) {
      const err = await uploadResp.json();
      throw new Error(err.error || 'Upload failed');
    }
    await fetch(`/api/goods-receipts/${grnId}/scan-key`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanKey: storageKey, slot }),
      credentials: 'include',
    });
    return storageKey;
  };

  const handleGrnAttachSuccess = async (scanKey?: string) => {
    if (!scanKey) return;
    if (!attachGrnState) return;
    await fetch(`/api/goods-receipts/${attachGrnState.grnId}/scan-key`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanKey, slot: attachGrnState.slot }),
      credentials: 'include',
    });
    setAttachGrnState(null);
    if (onRefresh) onRefresh();
  };

  const handleRemoveGrnDoc = async (grnId: number, slot: number) => {
    try {
      const resp = await fetch(`/api/goods-receipts/${grnId}/scan-key/${slot}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Failed to remove');
      toast({ title: 'Document removed' });
      if (onRefresh) onRefresh();
    } catch (e: unknown) {
      toast({ title: 'Error', description: 'Could not remove the document.', variant: 'destructive' });
    }
  };

  const handleViewGrnDoc = async (scanKey: string) => {
    try {
      const res = await fetch(`/api/storage/signed-get?key=${encodeURIComponent(scanKey)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get link');
      window.open(data.url, '_blank');
    } catch (e: unknown) {
      toast({ title: 'Error', description: 'Could not retrieve the document.', variant: 'destructive' });
    }
  };

  return {
    pendingDocs,
    setPendingDocs,
    attachGrnState,
    setAttachGrnState,
    updatePendingDoc,
    handlePendingDocSelect,
    uploadGrnDocToStorage,
    handleGrnAttachSuccess,
    handleRemoveGrnDoc,
    handleViewGrnDoc,
  };
}
