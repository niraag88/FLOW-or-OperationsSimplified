import { useEffect, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

export interface TypedConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (typedPhrase: string) => void | Promise<void>;
  title: string;
  description: ReactNode;
  phrase: string;
  confirmLabel?: string;
  isPending?: boolean;
  // Optional informational panel rendered above the input. Never
  // participates in the disable predicate.
  extra?: ReactNode;
  inputTestId?: string;
  confirmTestId?: string;
}

export function TypedConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  phrase,
  confirmLabel = 'Confirm',
  isPending = false,
  extra,
  inputTestId,
  confirmTestId,
}: TypedConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const phraseMatches = typed === phrase;
  const submitDisabled = isPending || !phraseMatches;

  const handleSubmit = () => {
    if (submitDisabled) return;
    void onConfirm(typed);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 text-sm text-gray-700 space-y-3">
              {description}
            </div>
          </DialogDescription>
        </DialogHeader>

        {extra ? <div className="space-y-2">{extra}</div> : null}

        <div className="space-y-2 pt-2">
          <Label htmlFor="typed-confirm-input" className="text-sm font-medium">
            Type{' '}
            <span className="font-mono font-semibold text-red-700">
              {phrase}
            </span>{' '}
            to enable the button:
          </Label>
          <Input
            id="typed-confirm-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={phrase}
            autoComplete="off"
            spellCheck={false}
            disabled={isPending}
            data-testid={inputTestId}
          />
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitDisabled}
            data-testid={confirmTestId}
          >
            {isPending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TypedConfirmDialog;
