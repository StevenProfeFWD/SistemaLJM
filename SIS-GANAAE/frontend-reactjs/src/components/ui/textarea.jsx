import * as React from "react"

import { cn } from "@/lib/utils"
import { filledControlBase } from "./form-control-styles"

function Textarea({
  className,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-h-[80px] rounded-md px-3 py-2 text-sm resize-y",
        filledControlBase,
        className
      )}
      {...props} />
  );
}

export { Textarea }
