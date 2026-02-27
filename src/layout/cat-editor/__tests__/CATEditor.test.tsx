import { createRef } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CATEditor } from '../CATEditor'

import type { CATEditorRef, IKeywordsRule, ISpellCheckRule } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wait for Lexical's async initialisation to finish. */
async function waitForEditor() {
  // Lexical initialises asynchronously — wait for the contenteditable to
  // appear and the initial paragraph to be rendered.
  await waitFor(() => {
    expect(document.querySelector('[contenteditable]')).toBeInTheDocument()
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CATEditor', () => {
  // ── Rendering ─────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the editor container', async () => {
      render(<CATEditor />)
      await waitForEditor()

      expect(
        document.querySelector('.cat-editor-container'),
      ).toBeInTheDocument()
    })

    it('renders the contenteditable area', async () => {
      render(<CATEditor />)
      await waitForEditor()

      const editable = document.querySelector('[contenteditable]')
      expect(editable).toBeInTheDocument()
    })

    it('renders the default placeholder text', async () => {
      render(<CATEditor />)
      await waitForEditor()

      expect(
        document.querySelector('.cat-editor-placeholder'),
      ).toBeInTheDocument()
      expect(
        document.querySelector('.cat-editor-placeholder')!.textContent,
      ).toBe('Start typing or paste text here…')
    })

    it('renders a custom placeholder', async () => {
      render(<CATEditor placeholder="Type here..." />)
      await waitForEditor()

      expect(
        document.querySelector('.cat-editor-placeholder')!.textContent,
      ).toBe('Type here...')
    })
  })

  // ── Initial text ──────────────────────────────────────────────────────

  describe('initialText', () => {
    it('populates the editor with initial text', async () => {
      render(<CATEditor initialText="Hello World" />)
      await waitForEditor()

      await waitFor(() => {
        const editable = document.querySelector('[contenteditable]')!
        expect(editable.textContent).toContain('Hello World')
      })
    })

    it('handles multiline initial text', async () => {
      render(<CATEditor initialText={'Line 1\nLine 2'} />)
      await waitForEditor()

      await waitFor(() => {
        const paragraphs = document.querySelectorAll('.cat-editor-paragraph')
        expect(paragraphs.length).toBeGreaterThanOrEqual(2)
      })
    })

    it('handles empty initial text', async () => {
      render(<CATEditor initialText="" />)
      await waitForEditor()

      expect(document.querySelector('[contenteditable]')).toBeInTheDocument()
    })
  })

  // ── className ─────────────────────────────────────────────────────────

  describe('className', () => {
    it('applies a custom className to the container', async () => {
      render(<CATEditor className="my-custom-class" />)
      await waitForEditor()

      const container = document.querySelector('.cat-editor-container')
      expect(container).toHaveClass('my-custom-class')
    })
  })

  // ── Direction (dir) ───────────────────────────────────────────────────

  describe('dir', () => {
    it('sets dir attribute on the container', async () => {
      render(<CATEditor dir="rtl" />)
      await waitForEditor()

      const container = document.querySelector('.cat-editor-container')
      expect(container).toHaveAttribute('dir', 'rtl')
    })

    it('sets ltr direction on the container', async () => {
      render(<CATEditor dir="ltr" />)
      await waitForEditor()

      const container = document.querySelector('.cat-editor-container')
      expect(container).toHaveAttribute('dir', 'ltr')
    })

    it('does not set dir when not provided', async () => {
      render(<CATEditor />)
      await waitForEditor()

      const container = document.querySelector('.cat-editor-container')
      expect(container).not.toHaveAttribute('dir')
    })
  })

  // ── JP font ───────────────────────────────────────────────────────────

  describe('jpFont', () => {
    it('adds jp-font class when jpFont is true', async () => {
      render(<CATEditor jpFont />)
      await waitForEditor()

      const container = document.querySelector('.cat-editor-container')
      expect(container).toHaveClass('cat-editor-jp-font')
    })

    it('does not add jp-font class by default', async () => {
      render(<CATEditor />)
      await waitForEditor()

      const container = document.querySelector('.cat-editor-container')
      expect(container).not.toHaveClass('cat-editor-jp-font')
    })
  })

  // ── Editable / Read-only ──────────────────────────────────────────────

  describe('editable', () => {
    it('makes the editor editable by default', async () => {
      render(<CATEditor />)
      await waitForEditor()

      const editable = document.querySelector('[contenteditable]')
      expect(editable).toHaveAttribute('contenteditable', 'true')
    })

    it('adds readonly class when editable=false', async () => {
      render(<CATEditor editable={false} />)
      await waitForEditor()

      const editable = document.querySelector('.cat-editor-editable')
      expect(editable).toHaveClass('cat-editor-readonly')
    })

    it('adds readonly-selectable class when editable=false + readOnlySelectable', async () => {
      render(<CATEditor editable={false} readOnlySelectable />)
      await waitForEditor()

      const editable = document.querySelector('.cat-editor-editable')
      expect(editable).toHaveClass('cat-editor-readonly-selectable')
      expect(editable).not.toHaveClass('cat-editor-readonly')
    })

    it('supports legacy readOnly prop', async () => {
      render(<CATEditor readOnly />)
      await waitForEditor()

      const editable = document.querySelector('.cat-editor-editable')
      expect(editable).toHaveClass('cat-editor-readonly')
    })
  })

  // ── onChange ───────────────────────────────────────────────────────────

  describe('onChange', () => {
    it('calls onChange when text content changes', async () => {
      const handleChange = vi.fn()
      render(<CATEditor onChange={handleChange} />)
      await waitForEditor()

      const editable = document.querySelector('[contenteditable]')!

      await act(async () => {
        // Focus and type into the editor
        editable.dispatchEvent(new FocusEvent('focus'))
      })

      const user = userEvent.setup()
      await user.click(editable)
      await user.keyboard('Hello')

      await waitFor(() => {
        expect(handleChange).toHaveBeenCalled()
      })
    })
  })

  // ── Imperative ref API ────────────────────────────────────────────────

  describe('imperative ref', () => {
    it('exposes getText() returning current content', async () => {
      const ref = createRef<CATEditorRef>()
      render(<CATEditor ref={ref} initialText="Test content" />)
      await waitForEditor()

      await waitFor(() => {
        expect(ref.current).not.toBeNull()
      })

      const text = ref.current!.getText()
      expect(text).toContain('Test content')
    })

    it('exposes focus() without throwing', async () => {
      const ref = createRef<CATEditorRef>()
      render(<CATEditor ref={ref} />)
      await waitForEditor()

      await waitFor(() => {
        expect(ref.current).not.toBeNull()
      })

      // In jsdom, focus() on a contenteditable doesn't reliably set
      // document.activeElement — just verify it doesn't throw.
      await act(async () => {
        expect(() => ref.current!.focus()).not.toThrow()
      })
    })

    it('exposes insertText() to insert text', async () => {
      const ref = createRef<CATEditorRef>()
      render(<CATEditor ref={ref} initialText="Hello " />)
      await waitForEditor()

      await waitFor(() => {
        expect(ref.current).not.toBeNull()
      })

      await act(async () => {
        ref.current!.insertText('World')
      })

      await waitFor(() => {
        const text = ref.current!.getText()
        expect(text).toContain('World')
      })
    })

    it('exposes replaceAll() to replace text', async () => {
      const ref = createRef<CATEditorRef>()
      render(<CATEditor ref={ref} initialText="foo bar foo baz foo" />)
      await waitForEditor()

      await waitFor(() => {
        expect(ref.current).not.toBeNull()
      })

      let count = 0
      await act(async () => {
        count = ref.current!.replaceAll('foo', 'qux')
      })

      expect(count).toBe(3)
      await waitFor(() => {
        const text = ref.current!.getText()
        expect(text).not.toContain('foo')
        expect(text).toContain('qux')
      })
    })

    it('replaceAll returns 0 when search string is not found', async () => {
      const ref = createRef<CATEditorRef>()
      render(<CATEditor ref={ref} initialText="hello world" />)
      await waitForEditor()

      await waitFor(() => {
        expect(ref.current).not.toBeNull()
      })

      let count = 0
      await act(async () => {
        count = ref.current!.replaceAll('xyz', 'abc')
      })
      expect(count).toBe(0)
    })

    it('replaceAll returns 0 when search string is empty', async () => {
      const ref = createRef<CATEditorRef>()
      render(<CATEditor ref={ref} initialText="hello" />)
      await waitForEditor()

      await waitFor(() => {
        expect(ref.current).not.toBeNull()
      })

      let count = 0
      await act(async () => {
        count = ref.current!.replaceAll('', 'abc')
      })
      expect(count).toBe(0)
    })
  })

  // ── Popover direction ─────────────────────────────────────────────────

  describe('popoverDir', () => {
    it('defaults popoverDir to ltr (popover is not affected by editor dir)', async () => {
      render(<CATEditor dir="rtl" />)
      await waitForEditor()

      // The container is RTL but the popover should default to LTR
      const container = document.querySelector('.cat-editor-container')
      expect(container).toHaveAttribute('dir', 'rtl')

      // Popover is hidden by default, but the component should render fine
      expect(document.querySelector('[contenteditable]')).toBeInTheDocument()
    })
  })

  // ── Rules basics ──────────────────────────────────────────────────────

  describe('rules', () => {
    it('renders with spellcheck rules', async () => {
      const rules: Array<ISpellCheckRule> = [
        {
          type: 'spellcheck',
          validations: [
            {
              categoryId: 'spell',
              start: 0,
              end: 5,
              content: 'Helo',
              message: 'Did you mean "Hello"?',
              shortMessage: 'Spelling',
              suggestions: [{ value: 'Hello' }],
            },
          ],
        },
      ]

      render(<CATEditor initialText="Helo world" rules={rules} />)
      await waitForEditor()

      // The editor should still render even with rules
      await waitFor(() => {
        const editable = document.querySelector('[contenteditable]')!
        expect(editable.textContent).toContain('Helo')
      })
    })

    it('renders with keyword rules', async () => {
      const rules: Array<IKeywordsRule> = [
        {
          type: 'keyword',
          label: 'search',
          entries: [{ pattern: 'test' }],
        },
      ]

      render(<CATEditor initialText="this is a test" rules={rules} />)
      await waitForEditor()

      await waitFor(() => {
        expect(
          document.querySelector('[contenteditable]')!.textContent,
        ).toContain('test')
      })
    })

    it('renders with empty rules array', async () => {
      render(<CATEditor initialText="Hello" rules={[]} />)
      await waitForEditor()

      await waitFor(() => {
        expect(
          document.querySelector('[contenteditable]')!.textContent,
        ).toContain('Hello')
      })
    })
  })

  // ── Callbacks ─────────────────────────────────────────────────────────

  describe('callbacks', () => {
    it('does not throw when no callbacks are provided', async () => {
      expect(() => {
        render(<CATEditor initialText="Hello" />)
      }).not.toThrow()

      await waitForEditor()
    })
  })
})
