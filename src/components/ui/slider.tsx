import * as React from 'react'
import { Slider as BaseSlider } from '@base-ui/react/slider'

import { cn } from '@/lib/utils'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  orientation = 'horizontal',
  onValueChange,
  onValueCommitted,
  id,
  onBlur,
  ...props
}: {
  className?: string
  defaultValue?: number | number[]
  value?: number | number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  orientation?: 'horizontal' | 'vertical'
  onValueChange?: (value: number | number[]) => void
  onValueCommitted?: (value: number | number[]) => void
  id?: string
  onBlur?: React.FocusEventHandler
} & Omit<React.ComponentProps<'div'>, 'defaultValue' | 'onChange'>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : value !== undefined
          ? [value]
          : Array.isArray(defaultValue)
            ? defaultValue
            : defaultValue !== undefined
              ? [defaultValue]
              : [min],
    [value, defaultValue, min],
  )

  return (
    <BaseSlider.Root
      id={id}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      orientation={orientation}
      onValueChange={onValueChange}
      onValueCommitted={onValueCommitted}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <BaseSlider.Control
        data-slot="slider-control"
        className="flex w-full items-center py-2"
      >
        <BaseSlider.Track
          data-slot="slider-track"
          className={cn(
            'bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
          )}
        >
          <BaseSlider.Indicator
            data-slot="slider-range"
            className={cn(
              'bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
            )}
          />
          {Array.from({ length: _values.length }, (_, index) => (
            <BaseSlider.Thumb
              data-slot="slider-thumb"
              key={index}
              index={index}
              onBlur={onBlur}
              className="border-primary ring-ring/50 block size-4 shrink-0 rounded-full border bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
            />
          ))}
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}

export { Slider }
