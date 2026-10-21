import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Question-mark button that opens a plain-language explanation. */
export function HelpTip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`O que é: ${title}`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/15"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(20rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-y-auto break-words text-sm"
        align="center"
        collisionPadding={12}
      >
        <p className="mb-1 font-semibold text-primary">{title}</p>
        <div className="space-y-1.5 text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
