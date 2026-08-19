import * as React from "react"

import { cn } from "@/lib/utils"
import { filledControlBase } from "./form-control-styles"

function Input({
  className,
  type,
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md px-3 py-1 text-base shadow-xs md:text-sm",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "selection:bg-primary selection:text-primary-foreground",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        filledControlBase,
        className
      )}
      {...props} />
  );
}

export { Input }
