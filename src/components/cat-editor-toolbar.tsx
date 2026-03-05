import { useCallback, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import {
  AtSign,
  BookOpen,
  Code,
  Database,
  Eye,
  Link2,
  Minus,
  MousePointerClick,
  Plus,
  Quote,
  Regex,
  RotateCcw,
  Search,
  Settings,
  SpellCheck,
  Type,
} from 'lucide-react'

import type {
  IKeywordsEntry,
  ILexiQAValidation,
  ISpellCheckValidation,
} from '@/layout/cat-editor'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Regex preset type ───────────────────────────────────────────────────────

/** A named regex pattern that can be inserted into the search input. */
export interface RegexPreset {
  label: string
  pattern: string
}

export const DEFAULT_REGEX_PRESETS: Array<RegexPreset> = [
  {
    label: 'All (combined, case-insensitive)',
    pattern:
      '(?i)[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}|https?://[^\\s]+|\\d+|\\+?\\d[\\d\\s()-]{6,}|\\d{4}-\\d{2}-\\d{2}',
  },
  {
    label: 'Email',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
  },
  { label: 'URL', pattern: 'https?://[^\\s]+' },
  { label: 'Number', pattern: '\\d+' },
  { label: 'Phone', pattern: '\\+?\\d[\\d\\s()-]{6,}' },
  { label: 'Date (YYYY-MM-DD)', pattern: '\\d{4}-\\d{2}-\\d{2}' },
]

// ─── Search term parser ──────────────────────────────────────────────────────
// Parses a search input into keyword entries.  Each comma-separated term
// is used directly as a regex pattern (no escaping) so users can type raw
// regex like `https?://[^\s]+` or `\d+` in the search box.
//
// Examples:
//   "hello"              → [{ pattern: "hello" }]
//   "https?://[^\\s]+"   → [{ pattern: "https?://[^\\s]+" }]
//   "fox, \\d+"          → [{ pattern: "fox" }, { pattern: "\\d+" }]

export function parseSearchTerms(input: string): Array<IKeywordsEntry> {
  if (!input.trim()) return []
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((term) => ({ pattern: term }))
}

// ─── Toolbar popover button ──────────────────────────────────────────────────

export function ToolbarPopoverButton({
  label,
  icon,
  enabled,
  onToggle,
  children,
}: {
  label: string
  icon: React.ReactNode
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors
              ${enabled ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20' : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'}
            `}
          />
        }
      >
        {icon}
        {label}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} side="bottom" align="start">
          <Popover.Popup className="z-50 w-80 max-h-[70vh] overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-lg p-3 space-y-3 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 origin-(--transform-origin) transition-[transform,scale,opacity] duration-150">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{label}</span>
              <Switch checked={enabled} onCheckedChange={onToggle} />
            </div>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

// ─── Shared keyword editor ───────────────────────────────────────────────────

export function KeywordEditor({
  entries,
  onUpdate,
  onRemove,
  onAdd,
}: {
  entries: Array<IKeywordsEntry>
  onUpdate: (idx: number, patch: Partial<IKeywordsEntry>) => void
  onRemove: (idx: number) => void
  onAdd: () => void
}) {
  return (
    <>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {entries.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded border border-border/50 bg-background p-1.5"
          >
            <Input
              className="h-7 text-xs flex-1 font-mono"
              value={e.pattern}
              placeholder="Pattern (e.g. fox|dog, \bAPI\b)"
              onChange={(ev) => onUpdate(i, { pattern: ev.target.value })}
            />
            <Input
              className="h-7 text-xs flex-1"
              value={e.description ?? ''}
              placeholder="Description (optional)"
              onChange={(ev) =>
                onUpdate(i, {
                  description: ev.target.value || undefined,
                })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => onRemove(i)}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        Each entry matches by <strong>Pattern</strong> (regex). e.g.{' '}
        <code className="bg-muted px-0.5 rounded">fox|dog</code>,{' '}
        <code className="bg-muted px-0.5 rounded">{`\\bAPI\\b`}</code>.
      </p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onAdd}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Add entry
      </Button>
    </>
  )
}

// ─── Toolbar props ───────────────────────────────────────────────────────────

export interface CATEditorToolbarProps {
  onReset: () => void

  // ── Spellcheck ─────────────────────────────────
  spellcheckEnabled: boolean
  onSpellcheckEnabledChange: (v: boolean) => void
  spellcheckData: Array<ISpellCheckValidation>
  onSpellcheckUpdate: (
    idx: number,
    patch: Partial<ISpellCheckValidation>,
  ) => void
  onSpellcheckRemove: (idx: number) => void
  onSpellcheckAdd: () => void
  flashedSpellcheckId: string | null
  onFlashSpellcheck: (annId: string, durationMs?: number) => void
  /** Disable flash buttons (e.g. when no editor is focused in perf demo) */
  spellcheckFlashDisabled?: boolean

  // ── LexiQA ─────────────────────────────────────
  lexiqaEnabled: boolean
  onLexiqaEnabledChange: (v: boolean) => void
  lexiqaData: Array<ILexiQAValidation>
  onLexiqaUpdate: (idx: number, patch: Partial<ILexiQAValidation>) => void
  onLexiqaRemove: (idx: number) => void
  onLexiqaAdd: () => void

  // ── TB Target ──────────────────────────────────
  tbTargetEnabled: boolean
  onTbTargetEnabledChange: (v: boolean) => void
  tbEntries: Array<IKeywordsEntry>
  onTbUpdate: (idx: number, patch: Partial<IKeywordsEntry>) => void
  onTbRemove: (idx: number) => void
  onTbAdd: () => void

  // ── Special Chars ──────────────────────────────
  specialCharEnabled: boolean
  onSpecialCharEnabledChange: (v: boolean) => void
  specialCharEntries: Array<IKeywordsEntry>
  onSpecialCharUpdate: (idx: number, patch: Partial<IKeywordsEntry>) => void
  onSpecialCharRemove: (idx: number) => void
  onSpecialCharAdd: () => void

  // ── Tags ───────────────────────────────────────
  tagsEnabled: boolean
  onTagsEnabledChange: (v: boolean) => void
  tagsCollapsed: boolean
  onTagsCollapsedChange: (v: boolean) => void
  tagCollapseScope: 'all' | 'html-only'
  onTagCollapseScopeChange: (v: boolean) => void
  tagsDetectInner: boolean
  onTagsDetectInnerChange: (v: boolean) => void
  tagPattern: string
  onTagPatternChange: (v: string) => void
  tagAlias: string
  onTagAliasChange: (v: string) => void
  checkExpectedTags: boolean
  onCheckExpectedTagsChange: (v: boolean) => void
  expectedTags: Array<string>
  onExpectedTagsChange: (v: Array<string>) => void

  // ── Quotes ─────────────────────────────────────
  quotesEnabled: boolean
  onQuotesEnabledChange: (v: boolean) => void
  singleQuoteOpen: string
  onSingleQuoteOpenChange: (v: string) => void
  singleQuoteClose: string
  onSingleQuoteCloseChange: (v: string) => void
  doubleQuoteOpen: string
  onDoubleQuoteOpenChange: (v: string) => void
  doubleQuoteClose: string
  onDoubleQuoteCloseChange: (v: string) => void
  quotesInTags: boolean
  onQuotesInTagsChange: (v: boolean) => void
  quoteEscapeContractions: boolean
  onQuoteEscapeContractionsChange: (v: boolean) => void
  quoteAllowNesting: boolean
  onQuoteAllowNestingChange: (v: boolean) => void
  quoteDetectInner: boolean
  onQuoteDetectInnerChange: (v: boolean) => void

  // ── Links ──────────────────────────────────────
  linkEnabled: boolean
  onLinkEnabledChange: (v: boolean) => void
  openLinksOnClick: boolean
  onOpenLinksOnClickChange: (v: boolean) => void

  // ── Mentions (optional — cat-editor only) ──────
  mentionEnabled?: boolean
  onMentionEnabledChange?: (v: boolean) => void
  mentionTrigger?: string
  onMentionTriggerChange?: (v: string) => void
  mentionSerializeFormat?: string
  onMentionSerializeFormatChange?: (v: string) => void
  mentionShowAvatar?: boolean
  onMentionShowAvatarChange?: (v: boolean) => void
  mentionUserCount?: number

  // ── Settings ───────────────────────────────────
  editorDir: 'ltr' | 'rtl' | 'auto'
  onEditorDirChange: (v: 'ltr' | 'rtl' | 'auto') => void
  popoverDir: 'ltr' | 'rtl' | 'auto' | 'inherit'
  onPopoverDirChange: (v: 'ltr' | 'rtl' | 'auto' | 'inherit') => void
  jpFont: boolean
  onJpFontChange: (v: boolean) => void
  editorEditable: boolean
  onEditorEditableChange: (v: boolean) => void
  readOnlySelectable: boolean
  onReadOnlySelectableChange: (v: boolean) => void
  /** Extra content rendered at the end of the Settings popover (e.g. row count, intercept enter) */
  settingsExtra?: React.ReactNode

  // ── Search ─────────────────────────────────────
  searchValue: string
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void

  // ── Regex presets ──────────────────────────────
  regexPresetsEnabled?: boolean
  onRegexPresetsEnabledChange?: (v: boolean) => void
  regexPresets?: Array<RegexPreset>
  onRegexPresetsChange?: (presets: Array<RegexPreset>) => void

  // ── Extra content after search ─────────────────
  afterSearch?: React.ReactNode
}

// ─── Regex presets popover ───────────────────────────────────────────────────

function RegexPresetsPopover({
  presets,
  onChange,
  enabled,
  onToggle,
  searchValue,
  onSearchChange,
}: {
  presets: Array<RegexPreset>
  onChange?: (presets: Array<RegexPreset>) => void
  enabled: boolean
  onToggle: (v: boolean) => void
  searchValue: string
  onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const [editIdx, setEditIdx] = useState<number | null>(null)

  const appendToSearch = useCallback(
    (pattern: string) => {
      // Wrap in [] to mark as regex in the search input
      const term = `[${pattern}]`
      const next = searchValue.trim() ? `${searchValue}, ${term}` : term
      // Synthesize a change event
      const synth = {
        target: { value: next },
      } as React.ChangeEvent<HTMLInputElement>
      onSearchChange(synth)
    },
    [searchValue, onSearchChange],
  )

  const updatePreset = (idx: number, patch: Partial<RegexPreset>) => {
    if (!onChange) return
    onChange(presets.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }
  const removePreset = (idx: number) => {
    if (!onChange) return
    onChange(presets.filter((_, i) => i !== idx))
    if (editIdx === idx) setEditIdx(null)
  }
  const addPreset = () => {
    if (!onChange) return
    onChange([...presets, { label: '', pattern: '' }])
    setEditIdx(presets.length)
  }

  return (
    <ToolbarPopoverButton
      label="Regex"
      icon={<Regex className="h-3.5 w-3.5" />}
      enabled={enabled}
      onToggle={onToggle}
    >
      <p className="text-[10px] text-muted-foreground">
        Each preset is applied as a <strong>keyword rule</strong> (label{' '}
        <code className="bg-muted px-0.5 rounded">custom</code>) when enabled.
        Click a preset to also append it to the search input.
      </p>

      {/* Preset list */}
      <div className="space-y-1.5 max-h-56 overflow-y-auto">
        {presets.map((preset, i) => (
          <div
            key={i}
            className="rounded border border-border/50 bg-background"
          >
            {editIdx === i ? (
              /* Edit mode */
              <div className="p-1.5 space-y-1">
                <Input
                  className="h-6 text-xs"
                  value={preset.label}
                  placeholder="Label"
                  onChange={(e) => updatePreset(i, { label: e.target.value })}
                />
                <Input
                  className="h-6 text-xs font-mono"
                  value={preset.pattern}
                  placeholder="Regex pattern"
                  onChange={(e) => updatePreset(i, { pattern: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setEditIdx(null)}
                >
                  Done
                </Button>
              </div>
            ) : (
              /* Display mode */
              <div className="flex items-center gap-1.5 p-1.5">
                <button
                  type="button"
                  className="flex-1 text-left text-xs hover:text-primary transition-colors"
                  onClick={() => appendToSearch(preset.pattern)}
                  title={`Insert [${preset.pattern}] into search`}
                >
                  <span className="font-medium">
                    {preset.label || 'Untitled'}
                  </span>
                  <span className="ml-1.5 font-mono text-muted-foreground text-[10px]">
                    {preset.pattern}
                  </span>
                </button>
                {onChange && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setEditIdx(i)}
                    >
                      <Settings className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removePreset(i)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {onChange && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={addPreset}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add preset
        </Button>
      )}
    </ToolbarPopoverButton>
  )
}

// ─── CATEditorToolbar ────────────────────────────────────────────────────────

export function CATEditorToolbar(props: CATEditorToolbarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
      {/* Reset */}
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onReset}
        className="h-7 px-2 text-xs"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>

      <div className="w-px h-5 bg-border" />

      {/* Spellcheck */}
      <ToolbarPopoverButton
        label="Spellcheck"
        icon={<SpellCheck className="h-3.5 w-3.5" />}
        enabled={props.spellcheckEnabled}
        onToggle={props.onSpellcheckEnabledChange}
      >
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {props.spellcheckData.map((v, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded border border-border/50 bg-background p-2"
            >
              <div className="grid grid-cols-[60px_1fr] gap-1.5 flex-1 text-xs">
                <span className="text-muted-foreground self-center">
                  content
                </span>
                <Input
                  className="h-7 text-xs"
                  value={v.content}
                  onChange={(e) =>
                    props.onSpellcheckUpdate(i, { content: e.target.value })
                  }
                />
                <span className="text-muted-foreground self-center">
                  start/end
                </span>
                <div className="flex gap-1">
                  <Input
                    className="h-7 text-xs w-16"
                    type="number"
                    value={v.start}
                    onChange={(e) =>
                      props.onSpellcheckUpdate(i, {
                        start: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <Input
                    className="h-7 text-xs w-16"
                    type="number"
                    value={v.end}
                    onChange={(e) =>
                      props.onSpellcheckUpdate(i, {
                        end: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <span className="text-muted-foreground self-center">
                  message
                </span>
                <Input
                  className="h-7 text-xs"
                  value={v.message}
                  onChange={(e) =>
                    props.onSpellcheckUpdate(i, { message: e.target.value })
                  }
                />
                <span className="text-muted-foreground self-center">
                  suggestions
                </span>
                <Input
                  className="h-7 text-xs"
                  value={v.suggestions
                    .map((s) => (typeof s === 'string' ? s : s.value))
                    .join(', ')}
                  placeholder="comma-separated"
                  onChange={(e) =>
                    props.onSpellcheckUpdate(i, {
                      suggestions: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => props.onSpellcheckRemove(i)}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={props.onSpellcheckAdd}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add validation
        </Button>

        {/* ── Spellcheck error list (click to flash-highlight) ── */}
        {props.spellcheckEnabled && props.spellcheckData.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <MousePointerClick className="h-3.5 w-3.5" />
              Click to highlight in editor
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {props.spellcheckData.map((v) => {
                const annId = `sc-${v.start}-${v.end}`
                const isActive = props.flashedSpellcheckId === annId
                return (
                  <button
                    key={annId}
                    type="button"
                    disabled={props.spellcheckFlashDisabled}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      isActive
                        ? 'bg-pink-100 border-pink-300 text-pink-700 dark:bg-pink-900/40 dark:border-pink-700 dark:text-pink-300'
                        : 'border-border bg-background text-foreground hover:bg-muted'
                    }`}
                    onClick={() => props.onFlashSpellcheck(annId, 5000)}
                  >
                    <span className="font-mono">{v.content || '…'}</span>
                    <span className="text-muted-foreground text-[10px]">
                      [{v.start}–{v.end}]
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </ToolbarPopoverButton>

      {/* LexiQA */}
      <ToolbarPopoverButton
        label="LexiQA"
        icon={<BookOpen className="h-3.5 w-3.5" />}
        enabled={props.lexiqaEnabled}
        onToggle={props.onLexiqaEnabledChange}
      >
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {props.lexiqaData.map((v, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded border border-border/50 bg-background p-2"
            >
              <div className="grid grid-cols-[60px_1fr] gap-1.5 flex-1 text-xs">
                <span className="text-muted-foreground self-center">msg</span>
                <Input
                  className="h-7 text-xs"
                  value={v.msg}
                  onChange={(e) =>
                    props.onLexiqaUpdate(i, { msg: e.target.value })
                  }
                />
                <span className="text-muted-foreground self-center">
                  start/len
                </span>
                <div className="flex gap-1">
                  <Input
                    className="h-7 text-xs w-16"
                    type="number"
                    value={v.start}
                    onChange={(e) =>
                      props.onLexiqaUpdate(i, {
                        start: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <Input
                    className="h-7 text-xs w-16"
                    type="number"
                    value={v.length}
                    onChange={(e) =>
                      props.onLexiqaUpdate(i, {
                        length: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <span className="text-muted-foreground self-center">
                  category
                </span>
                <Input
                  className="h-7 text-xs"
                  value={v.category}
                  onChange={(e) =>
                    props.onLexiqaUpdate(i, { category: e.target.value })
                  }
                />
                <span className="text-muted-foreground self-center">
                  module
                </span>
                <Input
                  className="h-7 text-xs"
                  value={v.module}
                  onChange={(e) =>
                    props.onLexiqaUpdate(i, { module: e.target.value })
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground"
                onClick={() => props.onLexiqaRemove(i)}
              >
                <Minus className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs gap-1"
          onClick={props.onLexiqaAdd}
        >
          <Plus className="h-3 w-3" /> Add validation
        </Button>
      </ToolbarPopoverButton>

      {/* TB Target */}
      <ToolbarPopoverButton
        label="TB Target"
        icon={<Database className="h-3.5 w-3.5" />}
        enabled={props.tbTargetEnabled}
        onToggle={props.onTbTargetEnabledChange}
      >
        <KeywordEditor
          entries={props.tbEntries}
          onUpdate={props.onTbUpdate}
          onRemove={props.onTbRemove}
          onAdd={props.onTbAdd}
        />
      </ToolbarPopoverButton>

      {/* Special Chars */}
      <ToolbarPopoverButton
        label="Special"
        icon={<Eye className="h-3.5 w-3.5" />}
        enabled={props.specialCharEnabled}
        onToggle={props.onSpecialCharEnabledChange}
      >
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {props.specialCharEntries.map((e, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 rounded border border-border/50 bg-background p-1"
            >
              <Input
                className="h-6 text-xs flex-1"
                value={e.description ?? ''}
                placeholder="Name"
                onChange={(ev) =>
                  props.onSpecialCharUpdate(i, {
                    description: ev.target.value || undefined,
                  })
                }
              />
              <Input
                className="h-6 text-xs w-24 font-mono"
                value={e.pattern}
                placeholder="Pattern"
                onChange={(ev) =>
                  props.onSpecialCharUpdate(i, { pattern: ev.target.value })
                }
              />
              <Input
                className="h-6 text-xs w-10 text-center font-mono"
                value={e.displaySymbol ?? ''}
                placeholder="—"
                onChange={(ev) =>
                  props.onSpecialCharUpdate(i, {
                    displaySymbol: ev.target.value || undefined,
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => props.onSpecialCharRemove(i)}
              >
                <Minus className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-6 text-xs"
          onClick={props.onSpecialCharAdd}
        >
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </ToolbarPopoverButton>

      {/* Tags */}
      <ToolbarPopoverButton
        label="Tags"
        icon={<Code className="h-3.5 w-3.5" />}
        enabled={props.tagsEnabled}
        onToggle={props.onTagsEnabledChange}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={props.tagsCollapsed}
                onCheckedChange={props.onTagsCollapsedChange}
              />
              <Label className="text-xs">Collapse</Label>
            </div>
            {props.tagsCollapsed && (
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={props.tagCollapseScope === 'html-only'}
                  onCheckedChange={props.onTagCollapseScopeChange}
                />
                <Label className="text-xs">HTML only</Label>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Switch
                checked={props.tagsDetectInner}
                onCheckedChange={props.onTagsDetectInnerChange}
              />
              <Label className="text-xs">Detect inner</Label>
            </div>
          </div>
          <Input
            className="h-6 text-xs font-mono"
            value={props.tagPattern}
            placeholder="Regex pattern…"
            onChange={(e) => props.onTagPatternChange(e.target.value)}
          />
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">
              Alias
            </Label>
            <Input
              className="h-6 text-xs font-mono flex-1"
              value={props.tagAlias}
              placeholder="e.g. source"
              onChange={(e) => props.onTagAliasChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={props.checkExpectedTags}
                onCheckedChange={props.onCheckExpectedTagsChange}
              />
              <Label className="text-xs">Check expected tags</Label>
            </div>
            {props.checkExpectedTags && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Expected tags (one per line)
                </Label>
                <textarea
                  className="w-full h-20 text-xs font-mono rounded-md border border-border bg-background px-2 py-1 resize-y"
                  value={props.expectedTags.join('\n')}
                  onChange={(e) =>
                    props.onExpectedTagsChange(
                      e.target.value.split('\n').filter((s) => s.trim() !== ''),
                    )
                  }
                />
              </div>
            )}
          </div>
        </div>
      </ToolbarPopoverButton>

      {/* Quotes */}
      <ToolbarPopoverButton
        label="Quotes"
        icon={<Quote className="h-3.5 w-3.5" />}
        enabled={props.quotesEnabled}
        onToggle={props.onQuotesEnabledChange}
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 items-center text-xs">
            <span />
            <span className="text-muted-foreground text-center text-[10px]">
              Open
            </span>
            <span className="text-muted-foreground text-center text-[10px]">
              Close
            </span>
            <span className="text-muted-foreground">Single</span>
            <Input
              className="h-6 text-xs text-center font-mono"
              value={props.singleQuoteOpen}
              onChange={(e) => props.onSingleQuoteOpenChange(e.target.value)}
            />
            <Input
              className="h-6 text-xs text-center font-mono"
              value={props.singleQuoteClose}
              onChange={(e) => props.onSingleQuoteCloseChange(e.target.value)}
            />
            <span className="text-muted-foreground">Double</span>
            <Input
              className="h-6 text-xs text-center font-mono"
              value={props.doubleQuoteOpen}
              onChange={(e) => props.onDoubleQuoteOpenChange(e.target.value)}
            />
            <Input
              className="h-6 text-xs text-center font-mono"
              value={props.doubleQuoteClose}
              onChange={(e) => props.onDoubleQuoteCloseChange(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={props.quotesInTags}
                onCheckedChange={props.onQuotesInTagsChange}
              />
              <Label className="text-xs">In tags</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                checked={props.quoteEscapeContractions}
                onCheckedChange={props.onQuoteEscapeContractionsChange}
              />
              <Label className="text-xs">Contractions</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                checked={props.quoteAllowNesting}
                onCheckedChange={props.onQuoteAllowNestingChange}
              />
              <Label className="text-xs">Nesting</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch
                checked={props.quoteDetectInner}
                onCheckedChange={props.onQuoteDetectInnerChange}
              />
              <Label className="text-xs">Inner</Label>
            </div>
          </div>
        </div>
      </ToolbarPopoverButton>

      {/* Links */}
      <ToolbarPopoverButton
        label="Links"
        icon={<Link2 className="h-3.5 w-3.5" />}
        enabled={props.linkEnabled}
        onToggle={props.onLinkEnabledChange}
      >
        <div className="flex items-center gap-2">
          <Switch
            checked={props.openLinksOnClick}
            onCheckedChange={props.onOpenLinksOnClickChange}
          />
          <Label className="text-xs text-muted-foreground">
            Open link on click
          </Label>
        </div>
      </ToolbarPopoverButton>

      {/* Mentions (optional) */}
      {props.onMentionEnabledChange != null && (
        <ToolbarPopoverButton
          label="Mentions"
          icon={<AtSign className="h-3.5 w-3.5" />}
          enabled={props.mentionEnabled ?? false}
          onToggle={props.onMentionEnabledChange}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-16">
                Trigger
              </Label>
              <Input
                className="h-7 text-xs font-mono w-16"
                value={props.mentionTrigger ?? '@'}
                onChange={(e) => props.onMentionTriggerChange?.(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-16">
                Serialize
              </Label>
              <Input
                className="h-7 text-xs font-mono flex-1"
                value={props.mentionSerializeFormat ?? '@{id}'}
                onChange={(e) =>
                  props.onMentionSerializeFormatChange?.(e.target.value)
                }
                placeholder="@{id}"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={props.mentionShowAvatar ?? false}
                onCheckedChange={props.onMentionShowAvatarChange ?? (() => {})}
              />
              <Label className="text-xs text-muted-foreground">
                Show avatar
              </Label>
            </div>
            {props.mentionUserCount != null && (
              <p className="text-[10px] text-muted-foreground">
                Type trigger to open typeahead. {props.mentionUserCount} users
                available.
              </p>
            )}
          </div>
        </ToolbarPopoverButton>
      )}

      {/* Settings */}
      <ToolbarPopoverButton
        label="Settings"
        icon={<Settings className="h-3.5 w-3.5" />}
        enabled={true}
        onToggle={() => {}}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Direction</Label>
            <Select
              value={props.editorDir}
              onValueChange={(v) =>
                props.onEditorDirChange(v as 'ltr' | 'rtl' | 'auto')
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ltr">LTR</SelectItem>
                <SelectItem value="rtl">RTL</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Popover Direction
            </Label>
            <Select
              value={props.popoverDir}
              onValueChange={(v) =>
                props.onPopoverDirChange(
                  v as 'ltr' | 'rtl' | 'auto' | 'inherit',
                )
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ltr">LTR</SelectItem>
                <SelectItem value="rtl">RTL</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="inherit">Inherit</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={props.jpFont}
              onCheckedChange={props.onJpFontChange}
            />
            <Label className="text-xs">Japanese font</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={props.editorEditable}
              onCheckedChange={props.onEditorEditableChange}
            />
            <Label className="text-xs">Editable</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={props.readOnlySelectable}
              onCheckedChange={props.onReadOnlySelectableChange}
              disabled={props.editorEditable}
            />
            <Label
              className={`text-xs ${props.editorEditable ? 'text-muted-foreground' : ''}`}
            >
              Allow selection when read-only
            </Label>
          </div>
          {props.settingsExtra}
        </div>
      </ToolbarPopoverButton>

      <div className="w-px h-5 bg-border" />

      {/* Search inline */}
      <div className="flex items-center gap-1.5 flex-1 min-w-30 max-w-60">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <Input
          value={props.searchValue}
          onChange={props.onSearchChange}
          placeholder="Search… (use [regex] for regex)"
          className="h-7 text-xs"
        />
      </div>

      {/* Regex Presets */}
      {props.regexPresets != null && (
        <RegexPresetsPopover
          presets={props.regexPresets}
          onChange={props.onRegexPresetsChange}
          enabled={props.regexPresetsEnabled ?? false}
          onToggle={props.onRegexPresetsEnabledChange ?? (() => {})}
          searchValue={props.searchValue}
          onSearchChange={props.onSearchChange}
        />
      )}

      {props.afterSearch}
    </div>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────

export interface CATEditorLegendProps {
  /** Show mention legend item (cat-editor has mentions, perf demo does not) */
  showMention?: boolean
}

export function CATEditorLegend({ showMention }: CATEditorLegendProps) {
  return (
    <div className="flex flex-wrap gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-spellcheck" />
        <span className="text-muted-foreground">Spellcheck</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-lexiqa" />
        <span className="text-muted-foreground">LexiQA</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-keyword cat-highlight-keyword-tb-target" />
        <span className="text-muted-foreground">TB Target</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-keyword cat-highlight-keyword-search" />
        <span className="text-muted-foreground">Search</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-keyword cat-highlight-keyword-custom" />
        <span className="text-muted-foreground">Custom (Regex)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-keyword cat-highlight-keyword-special-char" />
        <span className="text-muted-foreground">Special char</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-tag" />
        <span className="text-muted-foreground">Tag</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-quote" />
        <span className="text-muted-foreground">Quote</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-6 rounded cat-highlight cat-highlight-link" />
        <span className="text-muted-foreground">Link</span>
      </div>
      {showMention && (
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 px-1 rounded text-[9px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 leading-3">
            @A
          </span>
          <span className="text-muted-foreground">Mention</span>
        </div>
      )}
      <div className="text-muted-foreground/60 ml-auto">
        Hover a highlight to see details
      </div>
    </div>
  )
}

// ─── Text Snippets ───────────────────────────────────────────────────────────

export interface TextSnippet {
  label: string
  text: string
}

export interface FlashRangePreset {
  label: string
  start: number
  end: number
}

export type SnippetMode = 'insert' | 'reset'

export interface CATEditorSnippetsAndFlashProps {
  /** Snippet definitions */
  snippets: Array<TextSnippet>
  /** Flash-range preset definitions */
  flashRanges: Array<FlashRangePreset>
  /** Insert a snippet text at the active editor's cursor */
  onInsertText: (text: string) => void
  /** Replace the entire editor content with the snippet text.
   *  When provided, a toggle appears letting the user switch between
   *  "Insert at cursor" and "Reset editor" mode. */
  onSetText?: (text: string) => void
  /** Flash-highlight a range in the active editor */
  onFlashRange: (start: number, end: number, durationMs?: number) => void
  /** Whether snippet / flash buttons are disabled (e.g. no focused row) */
  disabled?: boolean
  /** Optional custom snippet input slot.  Receives the current snippet mode
   *  so the slot can adapt its label / action accordingly. */
  customSnippetSlot?: (mode: SnippetMode) => React.ReactNode
}

export function CATEditorSnippetsAndFlash(
  props: CATEditorSnippetsAndFlashProps,
) {
  const [snippetMode, setSnippetMode] = useState<SnippetMode>('insert')
  const hasResetMode = props.onSetText != null

  const handleSnippetClick = (text: string) => {
    if (snippetMode === 'reset' && props.onSetText) {
      props.onSetText(text)
    } else {
      props.onInsertText(text)
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Text Snippets */}
      <div className="rounded-lg border border-border bg-card p-3 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Type className="h-3.5 w-3.5 text-blue-500" />
            Text Snippets
          </h3>
          {hasResetMode && (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 p-0.5 text-[10px]">
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 font-medium transition-colors',
                  snippetMode === 'insert'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setSnippetMode('insert')}
              >
                Insert
              </button>
              <button
                type="button"
                className={cn(
                  'rounded px-1.5 py-0.5 font-medium transition-colors',
                  snippetMode === 'reset'
                    ? 'bg-orange-100 text-orange-700 shadow-sm dark:bg-orange-900/40 dark:text-orange-300'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setSnippetMode('reset')}
              >
                Reset
              </button>
            </div>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {snippetMode === 'reset'
            ? 'Click to replace the entire editor content.'
            : 'Click to insert at the editor cursor.'}
        </p>
        <div className="flex flex-wrap gap-1">
          {props.snippets.map((snippet) => (
            <button
              key={snippet.label}
              type="button"
              className={cn(
                'inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50',
                snippetMode === 'reset'
                  ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:border-orange-400 dark:border-orange-700 dark:bg-orange-900/20 dark:text-orange-300 dark:hover:bg-orange-900/40'
                  : 'border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary',
              )}
              disabled={props.disabled}
              onClick={() => handleSnippetClick(snippet.text)}
            >
              {snippet.label}
            </button>
          ))}
        </div>
        {props.customSnippetSlot?.(snippetMode)}
      </div>

      {/* Flash Range */}
      <div className="rounded-lg border border-border bg-card p-3 shadow-sm space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <MousePointerClick className="h-3.5 w-3.5 text-pink-500" />
          Click to Highlight
        </h3>
        <p className="text-[10px] text-muted-foreground">
          Flash-highlight a character range in the editor (5 s).
        </p>
        <div className="flex flex-wrap gap-1">
          {props.flashRanges.map((r) => (
            <button
              key={`${r.start}-${r.end}`}
              type="button"
              className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-pink-100 hover:text-pink-700 hover:border-pink-300 dark:hover:bg-pink-900/40 dark:hover:text-pink-300 dark:hover:border-pink-700 disabled:opacity-50"
              disabled={props.disabled}
              onClick={() => props.onFlashRange(r.start, r.end, 5000)}
            >
              <span>{r.label}</span>
              <span className="text-muted-foreground text-[10px]">
                [{r.start}–{r.end}]
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
