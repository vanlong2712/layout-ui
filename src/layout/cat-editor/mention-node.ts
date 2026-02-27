import { $applyNodeReplacement, TextNode } from 'lexical'

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
  Spread,
} from 'lexical'

// ─── Serialized shape ─────────────────────────────────────────────────────────

export type SerializedMentionNode = Spread<
  {
    mentionId: string
    mentionName: string
  },
  SerializedTextNode
>

// ─── Global configuration ─────────────────────────────────────────────────────

/** Render function that fills the DOM of a mention node.
 *  Receives the host `<span>` element, the mentionId, and the display name.
 *  Return `true` to signal that you handled the rendering;
 *  return `false` / `undefined` to fall back to the built-in renderer. */
export type MentionDOMRenderer = (
  element: HTMLSpanElement,
  mentionId: string,
  mentionName: string,
) => boolean | void

export interface MentionNodeConfig {
  /** Custom renderer for the mention node DOM content.
   *  When provided, this function is called every time the mention DOM
   *  is created or updated.  Return `true` to take over rendering. */
  renderDOM?: MentionDOMRenderer
  /** Converts a mention ID to the model text stored in the editor.
   *  Default: `` id => `@{${id}}` `` — produces `@{5}`, `@{user_abc}`, etc. */
  serialize?: (id: string) => string
  /** RegExp used to detect mention patterns in pasted / imported text.
   *  Must contain exactly one capture group that extracts the mention ID.
   *  The `g` flag is required.
   *  Default: `/@\{([^}]+)\}/g` — matches `@{5}`, `@{user_abc}`, etc. */
  pattern?: RegExp
}

// ─── Default serialization ────────────────────────────────────────────────────

const DEFAULT_MENTION_SERIALIZE = (id: string): string => `@{${id}}`
const DEFAULT_MENTION_PATTERN = /@\{([^}]+)\}/g

/** Module-level config — set by the editor component on mount. */
let _mentionNodeConfig: MentionNodeConfig = {}

/** Configure the global MentionNode behaviour.
 *  Call this from CATEditor whenever props change. */
export function setMentionNodeConfig(config: MentionNodeConfig) {
  _mentionNodeConfig = config
}

/** Get the model text for a mention with the given ID,
 *  using the configured `serialize` function (or the default `@{id}`). */
export function getMentionModelText(id: string): string {
  return (_mentionNodeConfig.serialize ?? DEFAULT_MENTION_SERIALIZE)(id)
}

/** Get a fresh copy of the mention detection RegExp.
 *  A new RegExp is returned every time so that `lastIndex` is always 0. */
export function getMentionPattern(): RegExp {
  const src = _mentionNodeConfig.pattern ?? DEFAULT_MENTION_PATTERN
  return new RegExp(src.source, src.flags)
}

// ─── Built-in DOM renderer ────────────────────────────────────────────────────

/** Default rendering: `@DisplayName` */
function renderDefaultMentionDOM(
  element: HTMLSpanElement,
  _mentionId: string,
  mentionName: string,
): void {
  element.textContent = ''
  const label = document.createElement('span')
  label.className = 'cat-mention-label'
  label.textContent = `@${mentionName}`
  element.appendChild(label)
}

// ─── DOM import helper ────────────────────────────────────────────────────────

function $convertMentionElement(
  domNode: HTMLElement,
): DOMConversionOutput | null {
  const mentionId = domNode.getAttribute('data-mention-id')
  const mentionName = domNode.getAttribute('data-mention-name')

  if (mentionId !== null) {
    const node = $createMentionNode(mentionId, mentionName ?? mentionId)
    return { node }
  }
  return null
}

// ─── MentionNode ──────────────────────────────────────────────────────────────

/**
 * A custom Lexical TextNode that represents a mention.
 *
 * **Model text** (what Lexical stores, what `getTextContent()` returns):
 *   `@{mentionId}` — e.g. `@1`, `@user_abc`.
 *
 * **Visible DOM**: `@DisplayName` (+ optional avatar).  The display is
 * controlled by a configurable renderer — see `setMentionNodeConfig`.
 *
 * The node uses "segmented" mode so it behaves as an atomic unit:
 * backspace removes the whole mention, typing at boundaries creates a
 * sibling TextNode instead of editing the mention text.
 */
export class MentionNode extends TextNode {
  __mentionId: string
  __mentionName: string

  static getType(): string {
    return 'mention'
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(
      node.__mentionId,
      node.__mentionName,
      node.__text,
      node.__key,
    )
  }

  static importJSON(serializedNode: SerializedMentionNode): MentionNode {
    return $createMentionNode(
      serializedNode.mentionId,
      serializedNode.mentionName,
    ).updateFromJSON(serializedNode)
  }

  constructor(
    mentionId: string,
    mentionName: string,
    text?: string,
    key?: NodeKey,
  ) {
    // Model text is always the serialized form (default `@{id}`) — this is
    // what getTextContent() returns, what HighlightsPlugin collects, and
    // what onChange emits.
    super(text ?? getMentionModelText(mentionId), key)
    this.__mentionId = mentionId
    this.__mentionName = mentionName
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      mentionId: this.__mentionId,
      mentionName: this.__mentionName,
    }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.className = 'cat-mention-node'
    dom.spellcheck = false
    dom.contentEditable = 'false'
    dom.setAttribute('data-mention-id', this.__mentionId)
    dom.setAttribute('data-mention-name', this.__mentionName)
    this._renderInnerDOM(dom as HTMLSpanElement)
    return dom
  }

  updateDOM(
    prevNode: MentionNode,
    dom: HTMLElement,
    _config: EditorConfig,
  ): boolean {
    // If id or name changed, re-render the inner content
    if (
      prevNode.__mentionId !== this.__mentionId ||
      prevNode.__mentionName !== this.__mentionName
    ) {
      dom.setAttribute('data-mention-id', this.__mentionId)
      dom.setAttribute('data-mention-name', this.__mentionName)
      this._renderInnerDOM(dom as HTMLSpanElement)
    }
    // Return false = Lexical should NOT recreate the DOM from scratch
    return false
  }

  /** Fill the span with visible content (default: @label, or custom). */
  private _renderInnerDOM(element: HTMLSpanElement): void {
    const renderer = _mentionNodeConfig.renderDOM
    if (renderer) {
      const handled = renderer(element, this.__mentionId, this.__mentionName)
      if (handled) return
    }
    renderDefaultMentionDOM(element, this.__mentionId, this.__mentionName)
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span')
    element.setAttribute('data-mention', 'true')
    element.setAttribute('data-mention-id', this.__mentionId)
    element.setAttribute('data-mention-name', this.__mentionName)
    element.textContent = this.__text
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      span: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-mention')) {
          return null
        }
        return {
          conversion: $convertMentionElement,
          priority: 1,
        }
      },
    }
  }

  isTextEntity(): true {
    return true
  }

  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }
}

// ─── Factory & guard ──────────────────────────────────────────────────────────

export function $createMentionNode(
  mentionId: string,
  mentionName: string,
  textContent?: string,
): MentionNode {
  const node = new MentionNode(
    mentionId,
    mentionName,
    textContent ?? getMentionModelText(mentionId),
  )
  node.setMode('token').toggleDirectionless()
  return $applyNodeReplacement(node)
}

export function $isMentionNode(
  node: LexicalNode | null | undefined,
): node is MentionNode {
  return node instanceof MentionNode
}
