import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ReactDOM from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { useVirtualizer } from '@tanstack/react-virtual'

import { $createTextNode } from 'lexical'
import { $createMentionNode } from './mention-node'

import type { TextNode } from 'lexical'
import type { MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import type { IMentionUser } from './types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTION_LIST_LENGTH_LIMIT = 50
const ITEM_HEIGHT = 36

// ─── Option class ─────────────────────────────────────────────────────────────

class MentionTypeaheadOption extends MenuOption {
  user: IMentionUser

  constructor(user: IMentionUser) {
    super(user.id)
    this.user = user
  }
}

// ─── Avatar helper ────────────────────────────────────────────────────────────

function MentionAvatar({
  user,
  size = 24,
}: {
  user: IMentionUser
  size?: number
}) {
  if (user.avatar) {
    return (
      <span
        className="inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {user.avatar()}
      </span>
    )
  }

  // Fallback: initials avatar
  const initials = user.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  )
}

// ─── Individual menu item ─────────────────────────────────────────────────────

function MentionMenuItem({
  option,
  isSelected,
  onClick,
  onMouseEnter,
}: {
  option: MentionTypeaheadOption
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
}) {
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={`flex items-center gap-2 px-2 py-1.5 text-sm cursor-default select-none rounded-sm ${
        isSelected
          ? 'bg-accent text-accent-foreground'
          : 'text-popover-foreground'
      }`}
      ref={option.setRefElement}
      role="option"
      aria-selected={isSelected}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <MentionAvatar user={option.user} size={22} />
      <span className="truncate">{option.user.name}</span>
    </li>
  )
}

// ─── Virtualized menu ─────────────────────────────────────────────────────────

function VirtualizedMentionMenu({
  options,
  selectedIndex,
  selectOptionAndCleanUp,
  setHighlightedIndex,
}: {
  options: Array<MentionTypeaheadOption>
  selectedIndex: number | null
  selectOptionAndCleanUp: (option: MentionTypeaheadOption) => void
  setHighlightedIndex: (index: number) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 8,
  })

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= 0) {
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
    }
  }, [selectedIndex, virtualizer])

  return (
    <div
      ref={parentRef}
      className="max-h-[280px] overflow-y-auto overflow-x-hidden"
    >
      <ul
        role="listbox"
        aria-label="Mention suggestions"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: '100%',
        }}
      >
        {virtualizer.getVirtualItems().map((vItem) => {
          const option = options[vItem.index]
          return (
            <div
              key={option.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start}px)`,
              }}
              ref={virtualizer.measureElement}
              data-index={vItem.index}
            >
              <MentionMenuItem
                option={option}
                isSelected={selectedIndex === vItem.index}
                onClick={() => {
                  setHighlightedIndex(vItem.index)
                  selectOptionAndCleanUp(option)
                }}
                onMouseEnter={() => {
                  setHighlightedIndex(vItem.index)
                }}
              />
            </div>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Custom trigger match that also handles @ at start of text ────────────────

function checkForMentionMatch(
  text: string,
  trigger: string,
): MenuTextMatch | null {
  // Match: start-of-string or preceded by whitespace/punctuation,
  // then the trigger character, then valid mention chars.
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(
    `(^|\\s|\\()([${escaped}]((?:[^${escaped}\\s]){0,75}))$`,
  )
  const match = regex.exec(text)
  if (match !== null) {
    const maybeLeadingWhitespace = match[1]
    const matchingString = match[3]
    return {
      leadOffset: match.index + maybeLeadingWhitespace.length,
      matchingString,
      replaceableString: match[2],
    }
  }
  return null
}

// ─── Main Plugin ──────────────────────────────────────────────────────────────

export interface MentionPluginProps {
  /** List of users that can be mentioned. */
  users: Array<IMentionUser>
  /** Trigger character (default `@`). */
  trigger?: string
  /** Called when a mention is inserted. */
  onMentionInsert?: (user: IMentionUser) => void
}

export function MentionPlugin({
  users,
  trigger = '@',
  onMentionInsert,
}: MentionPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  // Also allow slash-trigger to pass through (avoid conflicts)
  const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
  })

  // Filter users by query string
  const results = useMemo(() => {
    if (queryString === null)
      return users.slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
    const q = queryString.toLowerCase()
    return users
      .filter((u) => u.name.toLowerCase().includes(q))
      .slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
  }, [users, queryString])

  const options = useMemo(
    () => results.map((user) => new MentionTypeaheadOption(user)),
    [results],
  )

  const onSelectOption = useCallback(
    (
      selectedOption: MentionTypeaheadOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void,
    ) => {
      editor.update(() => {
        const mentionNode = $createMentionNode(
          selectedOption.user.id,
          selectedOption.user.name,
        )
        if (nodeToReplace) {
          nodeToReplace.replace(mentionNode)
        }
        // Insert a trailing space after the mention and place the caret there
        const spaceNode = $createTextNode(' ')
        mentionNode.insertAfter(spaceNode)
        spaceNode.selectEnd()
        closeMenu()
      })
      onMentionInsert?.(selectedOption.user)
    },
    [editor, onMentionInsert],
  )

  const checkForMentionTrigger = useCallback(
    (text: string) => {
      const slashMatch = checkForSlashTriggerMatch(text, editor)
      if (slashMatch !== null) {
        return null
      }
      return checkForMentionMatch(text, trigger)
    },
    [checkForSlashTriggerMatch, editor, trigger],
  )

  return (
    <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForMentionTrigger}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) =>
        anchorElementRef.current && options.length
          ? ReactDOM.createPortal(
              <div className="cat-mention-popover">
                <VirtualizedMentionMenu
                  options={options}
                  selectedIndex={selectedIndex}
                  selectOptionAndCleanUp={selectOptionAndCleanUp}
                  setHighlightedIndex={setHighlightedIndex}
                />
              </div>,
              anchorElementRef.current,
            )
          : null
      }
    />
  )
}
