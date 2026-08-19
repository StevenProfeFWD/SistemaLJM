import * as React from "react"

import { cn } from "@/lib/utils"
import { filledChoiceControl } from "./form-control-styles"

function Checkbox({
  className,
  ...props
}) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(filledChoiceControl, className)}
      {...props} />
  );
}

export { Checkbox }
