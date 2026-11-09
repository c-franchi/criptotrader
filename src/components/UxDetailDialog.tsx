import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

/** Consistent compact actions used on all key screens. Editing stays inside dialogs. */
export function UxActionTile({
  label,
  icon: Icon,
  onClick,
  description,
  disabled = false,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-ux-action
      className="ux-action-tile"
      onClick={onClick}
      disabled={disabled}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-semibold leading-snug">{label}</span>
        {description && <span className="mt-1 block text-xs text-muted-foreground">{description}</span>}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function UxDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  children,
  closeLabel = "Concluído",
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  children: ReactNode;
  closeLabel?: string;
  footer?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-ux-detail-dialog className="ux-detail-dialog">
        <DialogHeader className="ux-dialog-heading text-left">
          <DialogTitle className="flex items-center gap-2 pr-6 text-lg">
            {Icon && <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div data-ux-dialog-body className="ux-detail-body min-w-0 space-y-4">
          {children}
        </div>
        <div className="ux-dialog-footer">
          {footer ?? (
            <Button type="button" className="w-full" onClick={() => onOpenChange(false)}>
              {closeLabel}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
