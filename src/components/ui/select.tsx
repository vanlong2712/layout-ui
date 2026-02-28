import { Select as BaseSelect } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

function Select({
  children,
  value,
  defaultValue,
  onValueChange,
  name,
  disabled,
  required,
  open,
  onOpenChange,
  ...props
}: {
  children?: React.ReactNode
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  name?: string
  disabled?: boolean
  required?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  // Base UI Select uses items prop for label lookup
  return (
    <BaseSelect.Root
      data-slot="select"
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange as any}
      name={name}
      disabled={disabled}
      required={required}
      open={open}
      onOpenChange={onOpenChange}
      {...props}
    >
      {children}
    </BaseSelect.Root>
  )
}

function SelectGroup({
  children,
  ...props
}: React.ComponentProps<'div'> & { children?: React.ReactNode }) {
  return (
    <BaseSelect.Group data-slot="select-group" {...(props as any)}>
      {children}
    </BaseSelect.Group>
  )
}

function SelectValue({
  placeholder,
  children,
  className,
  ...props
}: {
  placeholder?: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <BaseSelect.Value
      data-slot="select-value"
      placeholder={placeholder}
      className={className}
      {...(props as any)}
    >
      {children}
    </BaseSelect.Value>
  )
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: {
  className?: string
  size?: 'sm' | 'default'
  children?: React.ReactNode
} & Omit<React.ComponentProps<'button'>, 'children'>) {
  return (
    <BaseSelect.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...(props as any)}
    >
      {children}
      <BaseSelect.Icon>
        <ChevronDownIcon className="size-4 opacity-50" />
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'item-aligned',
  ...props
}: {
  className?: string
  children?: React.ReactNode
  position?: 'item-aligned' | 'popper'
} & Record<string, any>) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Positioner
        data-slot="select-content"
        sideOffset={4}
        alignItemWithTrigger={position === 'item-aligned'}
        className="z-50 outline-none"
      >
        <BaseSelect.Popup
          className={cn(
            'bg-popover text-popover-foreground relative max-h-[var(--available-height)] min-w-[8rem] origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-md border shadow-md',
            'data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
            'transition-[transform,scale,opacity] duration-150',
            className,
          )}
          {...props}
        >
          <BaseSelect.ScrollUpArrow
            data-slot="select-scroll-up-button"
            className="flex cursor-default items-center justify-center py-1"
          />
          <BaseSelect.List className="p-1">{children}</BaseSelect.List>
          <BaseSelect.ScrollDownArrow
            data-slot="select-scroll-down-button"
            className="flex cursor-default items-center justify-center py-1"
          />
        </BaseSelect.Popup>
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  )
}

function SelectLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <BaseSelect.GroupLabel
      data-slot="select-label"
      className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
      {...(props as any)}
    />
  )
}

function SelectItem({
  className,
  children,
  value,
  disabled,
  ...props
}: {
  className?: string
  children?: React.ReactNode
  value: string
  disabled?: boolean
}) {
  return (
    <BaseSelect.Item
      data-slot="select-item"
      value={value}
      disabled={disabled}
      className={cn(
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...(props as any)}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <BaseSelect.ItemIndicator>
          <CheckIcon className="size-4" />
        </BaseSelect.ItemIndicator>
      </span>
      <BaseSelect.ItemText>{children}</BaseSelect.ItemText>
    </BaseSelect.Item>
  )
}

function SelectSeparator({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="select-separator"
      role="separator"
      className={cn('bg-border pointer-events-none -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
