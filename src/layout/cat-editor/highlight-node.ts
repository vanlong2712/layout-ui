import { TextNode } from 'lexical'

import { NL_MARKER_PREFIX, replaceInvisibleChars } from './constants'

import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
} from 'lexical'

// ─── Serialized shape ─────────────────────────────────────────────────────────

interface SerializedHighlightNode extends SerializedTextNode {
  highlightTypes: string
  ruleIds: string
  displayText: string
}

// ─── HighlightNode ────────────────────────────────────────────────────────────

export class HighlightNode extends TextNode {
  __highlightTypes: string
  __ruleIds: string
  __displayText: string

  /** Per-editor codepoint display overrides.
   *  Set by HighlightsPlugin before each update cycle so that
   *  createDOM / updateDOM pick up the correct map without
   *  relying on module-level mutable state. */
  static __codepointOverrides: Record<number, string> | undefined

  static getType(): string {
    return 'highlight'
  }

  static clone(node: HighlightNode): HighlightNode {
    return new HighlightNode(
      node.__text,
      node.__highlightTypes,
      node.__ruleIds,
      node.__displayText,
      node.__key,
    )
  }

  constructor(
    text: string,
    highlightTypes: string,
    ruleIds: string,
    displayText?: string,
    key?: NodeKey,
  ) {
    super(text, key)
    this.__highlightTypes = highlightTypes
    this.__ruleIds = ruleIds
    this.__displayText = displayText ?? ''
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.classList.add('cat-highlight')
    for (const t of this.__highlightTypes.split(',')) {
      dom.classList.add(`cat-highlight-${t}`)
      if (t.startsWith('keyword-')) {
        dom.classList.add('cat-highlight-keyword')
      }
      if (t.startsWith('spellcheck-')) {
        dom.classList.add('cat-highlight-spellcheck')
      }
    }
    if (this.__highlightTypes.includes(',')) {
      dom.classList.add('cat-highlight-nested')
    }
    dom.dataset.highlightTypes = this.__highlightTypes
    dom.dataset.ruleIds = this.__ruleIds

    // NL-marker nodes are purely decorative — prevent selection but allow
    // cursor placement nearby (no contentEditable=false, which would block carets)
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) {
      dom.style.userSelect = 'none'
      dom.classList.add('cat-highlight-nl-marker')
    }

    // Tag nodes: store display text for CSS-based collapsed rendering
    if (this.__displayText) {
      dom.dataset.display = this.__displayText
    }

    // Collapsed tag nodes (token mode): put a single zero-width space
    // in the DOM so the browser cannot place a caret inside the
    // multi-char display text.  The visual tag label (e.g. <1>) is
    // rendered by CSS ::before via data-display.
    // contentEditable=false prevents the browser from inserting typed
    // text into this element (DOM text ≠ model text length).
    if (this.__highlightTypes.split(',').includes('tag-collapsed')) {
      dom.textContent = '\u200B'
      dom.contentEditable = 'false'
    }

    // Atomic keyword nodes: contentEditable=false prevents the browser
    // from placing a caret inside them.
    if (this.__highlightTypes.split(',').includes('keyword-atomic')) {
      dom.contentEditable = 'false'
      if (this.__text === ' ') {
        dom.classList.add('cat-highlight-space-char')
        dom.style.position = 'relative'
      } else {
        const replaced = replaceInvisibleChars(
          this.__text,
          HighlightNode.__codepointOverrides,
        )
        if (replaced !== this.__text) {
          dom.textContent = replaced
        }
      }
    }

    // Quote nodes: replace textContent with a zero-width space (like
    // collapsed tags) so the original character takes no visual width.
    // CSS ::before via data-display renders the replacement character.
    // Since quotes are single characters, DOM length (1 = ZWS) matches
    // model length (1 = original char), avoiding any offset mismatch.
    // contentEditable=false prevents the browser from inserting text inside.
    if (
      this.__highlightTypes.split(',').includes('quote') &&
      this.__displayText
    ) {
      dom.classList.add('cat-highlight-quote-char')
      dom.textContent = '\u200B'
      dom.contentEditable = 'false'
    }

    return dom
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config)
    if (prevNode.__highlightTypes !== this.__highlightTypes) {
      for (const t of prevNode.__highlightTypes.split(',')) {
        dom.classList.remove(`cat-highlight-${t}`)
        if (t.startsWith('keyword-')) {
          dom.classList.remove('cat-highlight-keyword')
        }
        if (t.startsWith('spellcheck-')) {
          dom.classList.remove('cat-highlight-spellcheck')
        }
      }
      dom.classList.remove('cat-highlight-nested')
      for (const t of this.__highlightTypes.split(',')) {
        dom.classList.add(`cat-highlight-${t}`)
        if (t.startsWith('keyword-')) {
          dom.classList.add('cat-highlight-keyword')
        }
        if (t.startsWith('spellcheck-')) {
          dom.classList.add('cat-highlight-spellcheck')
        }
      }
      if (this.__highlightTypes.includes(',')) {
        dom.classList.add('cat-highlight-nested')
      }
      dom.dataset.highlightTypes = this.__highlightTypes
    }
    if (prevNode.__ruleIds !== this.__ruleIds) {
      dom.dataset.ruleIds = this.__ruleIds
    }

    // Keep display text in sync
    if (prevNode.__displayText !== this.__displayText) {
      if (this.__displayText) {
        dom.dataset.display = this.__displayText
      } else {
        delete dom.dataset.display
      }
    }

    // Collapsed tag nodes: keep DOM in sync
    if (this.__highlightTypes.split(',').includes('tag-collapsed')) {
      dom.textContent = '\u200B'
      dom.contentEditable = 'false'
    } else if (dom.contentEditable === 'false') {
      // Clear if node transitioned away from collapsed
      dom.removeAttribute('contenteditable')
    }

    // Re-apply atomic keyword rendering after any DOM updates
    if (this.__highlightTypes.split(',').includes('keyword-atomic')) {
      dom.contentEditable = 'false'
      if (this.__text === ' ') {
        dom.classList.add('cat-highlight-space-char')
        dom.style.position = 'relative'
      } else {
        const replaced = replaceInvisibleChars(
          this.__text,
          HighlightNode.__codepointOverrides,
        )
        if (replaced !== this.__text) {
          dom.textContent = replaced
        }
      }
    }

    // Re-apply quote visual class + ZWS after DOM updates
    if (
      this.__highlightTypes.split(',').includes('quote') &&
      this.__displayText
    ) {
      dom.classList.add('cat-highlight-quote-char')
      dom.textContent = '\u200B'
      dom.contentEditable = 'false'
    } else if (prevNode.__highlightTypes.split(',').includes('quote')) {
      dom.classList.remove('cat-highlight-quote-char')
      if (dom.contentEditable === 'false') {
        dom.removeAttribute('contenteditable')
      }
    }

    return updated
  }

  static importJSON(json: SerializedHighlightNode): HighlightNode {
    const node = new HighlightNode(
      json.text,
      json.highlightTypes,
      json.ruleIds,
      json.displayText,
    )
    node.setFormat(json.format)
    node.setDetail(json.detail)
    node.setMode(json.mode)
    node.setStyle(json.style)
    return node
  }

  exportJSON(): SerializedHighlightNode {
    return {
      ...super.exportJSON(),
      type: 'highlight',
      highlightTypes: this.__highlightTypes,
      ruleIds: this.__ruleIds,
      displayText: this.__displayText,
    }
  }

  /** NL-marker nodes must not leak the display symbol ↩ into
   *  clipboard or getTextContent() calls — they are purely visual. */
  getTextContent(): string {
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) return ''
    return super.getTextContent()
  }

  canInsertTextBefore(): boolean {
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) return false
    // Token mode nodes (collapsed tags, quotes, atomic keywords) must
    // reject text insertion so typing creates a sibling TextNode
    // instead of merging into (and corrupting) the highlight node.
    if (this.getMode() === 'token') return false
    return true
  }

  canInsertTextAfter(): boolean {
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) return false
    if (this.getMode() === 'token') return false
    return true
  }

  isTextEntity(): boolean {
    return false
  }
}

export function $createHighlightNode(
  text: string,
  highlightTypes: string,
  ruleIds: string,
  displayText?: string,
  /** Force token mode (atomic, non-editable). Atomic keyword and NL-marker
   *  nodes are always token; tag nodes should only be token when collapsed. */
  forceToken?: boolean,
): HighlightNode {
  const node = new HighlightNode(text, highlightTypes, ruleIds, displayText)
  // Atomic keyword and NL-marker nodes are always atomic.
  // Tag nodes are only atomic when explicitly requested (collapsed mode).
  if (
    highlightTypes.split(',').includes('keyword-atomic') ||
    ruleIds.startsWith(NL_MARKER_PREFIX) ||
    forceToken
  ) {
    node.setMode('token')
  }
  return node
}

export function $isHighlightNode(
  node: LexicalNode | null | undefined,
): node is HighlightNode {
  return node instanceof HighlightNode
}
