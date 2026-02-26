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
}

// ─── HighlightNode ────────────────────────────────────────────────────────────

export class HighlightNode extends TextNode {
  __highlightTypes: string
  __ruleIds: string

  static getType(): string {
    return 'highlight'
  }

  static clone(node: HighlightNode): HighlightNode {
    return new HighlightNode(
      node.__text,
      node.__highlightTypes,
      node.__ruleIds,
      node.__key,
    )
  }

  constructor(
    text: string,
    highlightTypes: string,
    ruleIds: string,
    key?: NodeKey,
  ) {
    super(text, key)
    this.__highlightTypes = highlightTypes
    this.__ruleIds = ruleIds
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.classList.add('cat-highlight')
    for (const t of this.__highlightTypes.split(',')) {
      dom.classList.add(`cat-highlight-${t}`)
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

    // Special-char nodes in token mode: cursor can only sit before/after,
    // so it's safe to replace textContent with the visible display symbol.
    if (this.__highlightTypes.split(',').includes('special-char')) {
      // Regular spaces use a CSS-only approach (::before pseudo-element)
      // to avoid modifying textContent, which can conflict with Lexical's
      // internal DOM text tracking and cause some nodes to lose their
      // HighlightNode identity.
      if (this.__text === ' ') {
        dom.classList.add('cat-highlight-space-char')
        dom.style.position = 'relative'
      } else {
        const replaced = replaceInvisibleChars(this.__text)
        if (replaced !== this.__text) {
          dom.textContent = replaced
        }
      }
    }

    return dom
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, dom, config)
    if (prevNode.__highlightTypes !== this.__highlightTypes) {
      for (const t of prevNode.__highlightTypes.split(',')) {
        dom.classList.remove(`cat-highlight-${t}`)
      }
      dom.classList.remove('cat-highlight-nested')
      for (const t of this.__highlightTypes.split(',')) {
        dom.classList.add(`cat-highlight-${t}`)
      }
      if (this.__highlightTypes.includes(',')) {
        dom.classList.add('cat-highlight-nested')
      }
      dom.dataset.highlightTypes = this.__highlightTypes
    }
    if (prevNode.__ruleIds !== this.__ruleIds) {
      dom.dataset.ruleIds = this.__ruleIds
    }

    // Re-apply invisible char replacement after any DOM updates
    if (this.__highlightTypes.split(',').includes('special-char')) {
      if (this.__text === ' ') {
        dom.classList.add('cat-highlight-space-char')
        dom.style.position = 'relative'
      } else {
        const replaced = replaceInvisibleChars(this.__text)
        if (replaced !== this.__text) {
          dom.textContent = replaced
        }
      }
    }

    return updated
  }

  static importJSON(json: SerializedHighlightNode): HighlightNode {
    const node = new HighlightNode(json.text, json.highlightTypes, json.ruleIds)
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
    return true
  }

  canInsertTextAfter(): boolean {
    if (this.__ruleIds.startsWith(NL_MARKER_PREFIX)) return false
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
): HighlightNode {
  const node = new HighlightNode(text, highlightTypes, ruleIds)
  // Special-char and NL-marker nodes are atomic — cannot be split or typed into
  if (
    highlightTypes.split(',').includes('special-char') ||
    ruleIds.startsWith(NL_MARKER_PREFIX)
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
