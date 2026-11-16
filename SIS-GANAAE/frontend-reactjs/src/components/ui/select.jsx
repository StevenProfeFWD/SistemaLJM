import * as React from "react"

import { cn } from "@/lib/utils"
import { filledSelectBase } from "./form-control-styles"

function Select({
  className,
  ...props
}) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-10 w-full min-w-0 rounded-md px-3 text-sm",
        filledSelectBase,
        className
      )}
      {...props} />
  );
}

export { Select }
