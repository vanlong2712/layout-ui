import * as React from 'react'
import { Switch as BaseSwitch } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  required,
  name,
  value,
  id,
  onBlur,
  ...props
}: {
  className?: string
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  id?: string
  onBlur?: React.FocusEventHandler
} & Omit<React.ComponentProps<'span'>, 'onChange'>) {
  return (
    <BaseSwitch.Root
      id={id}
      name={name}
      value={value}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={
        onCheckedChange ? (checked) => onCheckedChange(checked) : undefined
      }
      disabled={disabled}
      required={required}
      onBlur={onBlur}
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        'bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/80',
        'data-[checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <BaseSwitch.Thumb
        data-slot="switch-thumb"
        className={cn(
          'bg-background dark:bg-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[checked]:translate-x-[calc(100%-2px)] data-[unchecked]:translate-x-0',
          'data-[checked]:dark:bg-primary-foreground',
        )}
      />
    </BaseSwitch.Root>
  )
}

export { Switch }
