import { Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useTheme, type Theme } from '@/lib/theme'

export function SettingsPage({ role }: { role: 'teacher' | 'student' }) {
  const { theme, setTheme } = useTheme()

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        description={
          role === 'teacher'
            ? 'Personal preferences for your teacher workspace.'
            : 'Personal preferences for your student workspace.'
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <p className="text-sm text-muted-foreground">
              Choose light or dark mode. Your choice is saved on this device.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {(
                [
                  { value: 'light' as Theme, label: 'Light', icon: Sun },
                  { value: 'dark' as Theme, label: 'Dark', icon: Moon },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={theme === value ? 'default' : 'outline'}
                  onClick={() => setTheme(value)}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
