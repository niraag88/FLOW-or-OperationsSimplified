/**
 * client/src/components/common/TypedConfirmDialog.tsx
 *
 * Reusable typed-phrase confirmation dialog (Task #337).
 *
 * Generalises the inline factory-reset dialog (Task #331) so every
 * destructive admin action shares the same pattern:
 *
 *   - Renders a destructive-styled confirmation modal.
 *   - Asks the user to type the exact `phrase` into a text input.
 *   - Keeps the destructive submit button disabled until the typed text
 *     equals the phrase byte-for-byte. No trim, no lowercase fallback —
 *     a stray space prevents the click on purpose.
 *   - When the user submits, calls `onConfirm(phrase)`. The phrase is
 *     handed back so the caller can include it as `{ confirmation }` in
 *     the request body that the server-side guard will check.
 *
 * Using this component directly couples the UI to the SAME shared phrase
 * constant the server enforces (`shared/destructiveActionPhrases.ts`).
 * That single coupling is the whole point of the pattern: there is no
 * second place a phrase can drift between client and server.
 *
 * Side-information panels (e.g. the latest-backup freshness panel in the
 * factory-reset dialog from Task #336) can be passed via the `extra`
 * prop. They are deliberately NOT part of the disable predicate — admins
 * must remain free to proceed once they have typed the phrase, regardless
 * of any informational warning shown above.
 */
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
  /** Controls dialog visibility. */
  open: boolean;
  /**
   * Called when the user dismisses the dialog (Cancel, Esc, click outside).
   * Will NOT be called while `isPending` is true so the user cannot close
   * the dialog while the destructive request is mid-flight.
   */
  onClose: () => void;
  /**
   * Called when the user submits AND the typed phrase matches. Receives
   * the typed phrase (always equal to `phrase`) so the caller can include
   * it verbatim in the request body for the server-side guard.
   */
  onConfirm: (typedPhrase: string) => void | Promise<void>;
  /** Modal title. Defaults to the icon + the action name. */
  title: string;
  /**
   * Description body. Pass JSX for rich content (lists of what will be
   * deleted, warning callouts, etc.).
   */
  description: ReactNode;
  /** The phrase the user must type. Comes from `shared/destructiveActionPhrases.ts`. */
  phrase: string;
  /** Label of the destructive submit button. */
  confirmLabel?: string;
  /** True while the destructive request is in flight. Disables both buttons. */
  isPending?: boolean;
  /**
   * Optional side panel rendered between the description and the typed
   * input (e.g. the "latest backup" freshness panel from Task #336).
   * NEVER participates in the disable predicate.
   */
  extra?: ReactNode;
  /** Optional `data-testid` for the typed input. */
  inputTestId?: string;
  /** Optional `data-testid` for the destructive submit button. */
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

  // Reset the typed input every time the dialog opens or closes so a
  // previous attempt's text never lingers. Mirrors the factory-reset
  // dialog's behaviour.
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  // The ENTIRE enable predicate. Any informational extra panel must NOT
  // participate — see Task #336 (factory-reset backup-freshness panel).
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
