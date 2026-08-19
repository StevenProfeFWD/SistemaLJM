import * as React from "react"

import { cn } from "@/lib/utils"
import { filledRadioControl } from "./form-control-styles"

function Radio({
  className,
  ...props
}) {
  return (
    <input
      type="radio"
      data-slot="radio"
      className={cn(filledRadioControl, className)}
      {...props} />
  );
}

export { Radio }
