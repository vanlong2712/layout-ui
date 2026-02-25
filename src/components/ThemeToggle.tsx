import { Monitor, Moon, Sun } from 'lucide-react'

import type { Theme } from '@/hooks/useTheme'
import { useTheme } from '@/hooks/useTheme'
import { Button } from '@/components/ui/button'

const icons: Record<Theme, React.ReactNode> = {
  light: <Sun size={18} />,
  dark: <Moon size={18} />,
  system: <Monitor size={18} />,
}

const labels: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
}

export function ThemeToggle() {
  const { theme, cycleTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`Theme: ${labels[theme]}. Click to change.`}
      title={labels[theme]}
      className="text-foreground/80 hover:text-foreground"
    >
      {icons[theme]}
    </Button>
  )
}
