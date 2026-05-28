import './style.css'
import {EventsOn} from '../wailsjs/runtime/runtime'
import {
    SelectClip, GetClips, HideWindow, DeleteClip, ClearHistory,
    GetSnippets, GetSnippetContent, SelectSnippet,
    PinClip, UnpinClip, GetEditorText, SetEditorText,
    PasteSnippetImage, GetSnippetThumbnail
} from '../wailsjs/go/main/App'
import {emojiCategories} from './emojis'

type ClipEntry = { text: string; origIndex: number }
type SnippetEntry = { name: string; subPath: string; preview: string; isImage: boolean; fileSize: number }

let allClips: string[] = []
let allPinned: string[] = []
let filteredClips: ClipEntry[] = []
let selectedIndex = 0

let allSnippets: SnippetEntry[] = []
let filteredSnippets: SnippetEntry[] = []

let activeCategory = 0
let emojiQuery = ''
let filteredEmojis: { emoji: string; keywords: string[] }[] = []

const RECENT_KEY = 'ghostclip-emoji-recent'
const MAX_RECENT = 24

type Mode = 'clipboard' | 'emoji' | 'snippets' | 'editor'
let currentMode: Mode = 'clipboard'
let editorContent = ''

let undoStack: string[] = []
let redoStack: string[] = []
const MAX_UNDO = 100

let editorDebounceTimer: ReturnType<typeof setTimeout> | null = null

const clipList = document.getElementById('clip-list')!
const emptyState = document.getElementById('empty-state')!
const searchInput = document.getElementById('search')! as HTMLInputElement
const clearAllBtn = document.getElementById('clear-all')! as HTMLButtonElement
const closeBtn = document.getElementById('close-btn')! as HTMLButtonElement

window.addEventListener('focus', () => {
    if (currentMode === 'snippets') {
        allSnippets = []
        render()
    }
    if (currentMode === 'editor') {
        const ta = document.querySelector('.editor-textarea') as HTMLTextAreaElement | null
        if (ta) ta.focus()
    } else {
        searchInput.focus()
    }
})

window.addEventListener('blur', () => {
    HideWindow()
})

clearAllBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    ClearHistory()
})

closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    HideWindow()
})

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.substring(0, maxLen) + '...'
}

function getMode(query: string): Mode {
    if (query.startsWith('#')) return 'editor'
    if (query.startsWith('!')) return 'emoji'
    if (query.startsWith('@')) return 'snippets'
    return 'clipboard'
}

function modePrefix(mode: string): string {
    switch (mode) {
        case 'editor': return '#'
        case 'emoji': return '!'
        case 'snippets': return '@'
        default: return ''
    }
}

function getRecentEmojis(): string[] {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    } catch {
        return []
    }
}

function addRecentEmoji(emoji: string) {
    const recent = getRecentEmojis().filter(e => e !== emoji)
    recent.unshift(emoji)
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

function pushUndo(text: string) {
    undoStack.push(text)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack = []
}

function persistEditor() {
    if (editorDebounceTimer) clearTimeout(editorDebounceTimer)
    editorDebounceTimer = setTimeout(() => {
        SetEditorText(editorContent)
    }, 500)
}

function render() {
    const query = searchInput.value.trim()
    const mode = getMode(query)
    currentMode = mode

    clearAllBtn.style.display = mode === 'clipboard' ? '' : 'none'

    if (mode === 'editor') {
        renderEditor()
    } else if (mode === 'clipboard') {
        renderClipboard(query)
    } else if (mode === 'emoji') {
        emojiQuery = query.slice(1).toLowerCase().trim()
        renderEmoji()
    } else if (mode === 'snippets') {
        allSnippets = []
        renderSnippets(query.slice(1).toLowerCase().trim())
    }
}

function renderEditor() {
    clearModeContent()
    emptyState.style.display = 'none'

    const container = document.createElement('div')
    container.className = 'editor-container'

    const textarea = document.createElement('textarea')
    textarea.className = 'editor-textarea'
    textarea.value = editorContent
    textarea.placeholder = 'Type or paste text here...\nCtrl+Enter to send'
    textarea.spellcheck = false

    textarea.addEventListener('input', () => {
        pushUndo(editorContent)
        editorContent = textarea.value
        updateEditorFooter(footer, textarea.value)
        persistEditor()
    })

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'z' && e.ctrlKey && !e.shiftKey) {
            e.preventDefault()
            if (undoStack.length > 0) {
                redoStack.push(editorContent)
                editorContent = undoStack.pop()!
                textarea.value = editorContent
                updateEditorFooter(footer, textarea.value)
                persistEditor()
            }
            return
        }
        if ((e.key === 'z' && e.ctrlKey && e.shiftKey) || (e.key === 'y' && e.ctrlKey)) {
            e.preventDefault()
            if (redoStack.length > 0) {
                undoStack.push(editorContent)
                editorContent = redoStack.pop()!
                textarea.value = editorContent
                updateEditorFooter(footer, textarea.value)
                persistEditor()
            }
            return
        }
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault()
            e.stopPropagation()
            sendEditor()
            return
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            editorContent = textarea.value
            searchInput.value = ''
            selectedIndex = 0
            persistEditor()
            render()
            HideWindow()
            return
        }
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault()
            searchInput.focus()
            return
        }
        e.stopPropagation()
    })

    container.appendChild(textarea)

    const footer = document.createElement('div')
    footer.className = 'editor-footer'

    const info = document.createElement('span')
    info.className = 'editor-info'
    footer.appendChild(info)

    const btnGroup = document.createElement('div')
    btnGroup.className = 'editor-btn-group'

    const clearBtn = document.createElement('button')
    clearBtn.className = 'editor-btn clear'
    clearBtn.textContent = 'Clear'
    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        pushUndo(editorContent)
        textarea.value = ''
        editorContent = ''
        updateEditorFooter(footer, '')
        persistEditor()
    })

    const sendBtn = document.createElement('button')
    sendBtn.className = 'editor-btn send'
    sendBtn.textContent = 'Send'
    sendBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        sendEditor()
    })

    btnGroup.appendChild(clearBtn)
    btnGroup.appendChild(sendBtn)
    footer.appendChild(btnGroup)
    container.appendChild(footer)

    clipList.appendChild(container)
    updateEditorFooter(footer, textarea.value)

    requestAnimationFrame(() => textarea.focus())
}

function sendEditor() {
    if (!editorContent.trim()) return
    SelectClip(editorContent).catch((err: unknown) => console.error('SelectClip failed:', err))
    editorContent = ''
    undoStack = []
    redoStack = []
    SetEditorText('')
    searchInput.value = ''
    selectedIndex = 0
    render()
}

function updateEditorFooter(footer: HTMLDivElement, text: string) {
    const info = footer.querySelector('.editor-info')!
    const chars = text.length
    const lines = text ? text.split('\n').length : 0
    const undoInfo = undoStack.length > 0 ? ` · undo ${undoStack.length}` : ''
    info.textContent = `${chars} chars · ${lines} lines${undoInfo}`
}

function renderClipboard(query: string) {
    const lowerQuery = query.toLowerCase()
    let clipsToShow: ClipEntry[]

    if (query) {
        const posNum = parseInt(query)
        clipsToShow = allClips
            .map((text, origIndex) => ({text, origIndex}))
            .filter((entry, i) => {
                if (entry.text.toLowerCase().includes(lowerQuery)) return true
                if (!isNaN(posNum) && posNum >= 1 && posNum <= allClips.length && (i + 1) === posNum) return true
                return false
            })
    } else {
        clipsToShow = allClips.map((text, origIndex) => ({text, origIndex}))
    }

    const pinnedEntries: ClipEntry[] = allPinned.map((text, origIndex) => ({text, origIndex: -(origIndex + 1)}))

    filteredClips = [...pinnedEntries, ...clipsToShow]

    clearModeContent()

    if (filteredClips.length === 0) {
        emptyState.style.display = 'block'
        emptyState.innerHTML = '<p>No clips yet</p><p class="empty-hint">Copy some text to get started</p>'
        return
    }

    emptyState.style.display = 'none'
    if (selectedIndex >= filteredClips.length) selectedIndex = 0

    const fragment = document.createDocumentFragment()

    if (pinnedEntries.length > 0 && !query) {
        const pinnedLabel = document.createElement('div')
        pinnedLabel.className = 'section-label'
        pinnedLabel.textContent = 'Pinned'
        fragment.appendChild(pinnedLabel)
    }

    let renderedPinned = false
    filteredClips.forEach((entry, i) => {
        if (!renderedPinned && entry.origIndex >= 0 && pinnedEntries.length > 0 && !query) {
            renderedPinned = true
            const recentLabel = document.createElement('div')
            recentLabel.className = 'section-label'
            recentLabel.textContent = 'Recent'
            fragment.appendChild(recentLabel)
        }

        const isPinned = entry.origIndex < 0
        const card = document.createElement('div')
        card.className = 'clip-card' + (i === selectedIndex ? ' selected' : '') + (isPinned ? ' pinned' : '')

        const indexLabel = document.createElement('div')
        indexLabel.className = 'clip-index'
        if (isPinned) {
            indexLabel.textContent = '📌'
        } else {
            indexLabel.textContent = `#${entry.origIndex + 1}`
        }

        const preview = document.createElement('div')
        preview.textContent = truncate(entry.text, 120)

        const actionsRow = document.createElement('div')
        actionsRow.className = 'clip-actions'

        const editBtn = document.createElement('button')
        editBtn.className = 'action-btn'
        editBtn.textContent = '✏'
        editBtn.title = 'Edit before pasting'
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            pushUndo(editorContent)
            editorContent = entry.text
            undoStack = []
            redoStack = []
            searchInput.value = '#'
            selectedIndex = 0
            render()
        })

        const pinBtn = document.createElement('button')
        pinBtn.className = 'action-btn'
        if (isPinned) {
            pinBtn.textContent = '📌'
            pinBtn.title = 'Unpin'
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                UnpinClip(entry.text)
            })
        } else {
            pinBtn.textContent = '📍'
            pinBtn.title = 'Pin'
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                PinClip(entry.text)
            })
        }

        const deleteBtn = document.createElement('button')
        deleteBtn.className = 'action-btn delete'
        deleteBtn.textContent = '✕'
        deleteBtn.title = 'Delete'
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            if (isPinned) {
                UnpinClip(entry.text)
            } else {
                DeleteClip(entry.text)
            }
        })

        actionsRow.appendChild(editBtn)
        actionsRow.appendChild(pinBtn)
        actionsRow.appendChild(deleteBtn)

        card.appendChild(actionsRow)
        card.appendChild(indexLabel)
        card.appendChild(preview)

        card.addEventListener('click', () => {
            SelectClip(entry.text).catch((err: unknown) => console.error('SelectClip failed:', err))
        })

        fragment.appendChild(card)
    })
    clipList.appendChild(fragment)

    const selectedEl = clipList.querySelector('.clip-card.selected')
    if (selectedEl) selectedEl.scrollIntoView({block: 'nearest'})
}

function renderEmoji() {
    clearModeContent()

    const container = document.createElement('div')
    container.className = 'emoji-container'

    const recent = getRecentEmojis()
    if (recent.length > 0 && !emojiQuery) {
        const recentSection = document.createElement('div')
        recentSection.className = 'emoji-section-title'
        recentSection.textContent = 'Recent'
        container.appendChild(recentSection)

        const recentGrid = document.createElement('div')
        recentGrid.className = 'emoji-grid'
        recent.forEach(e => {
            const btn = createEmojiBtn(e)
            recentGrid.appendChild(btn)
        })
        container.appendChild(recentGrid)
    }

    const tabs = document.createElement('div')
    tabs.className = 'emoji-tabs'
    emojiCategories.forEach((cat, i) => {
        const tab = document.createElement('button')
        tab.className = 'emoji-tab' + (i === activeCategory ? ' active' : '')
        tab.textContent = cat.icon
        tab.title = cat.name
        tab.addEventListener('click', () => {
            activeCategory = i
            renderEmoji()
        })
        tabs.appendChild(tab)
    })
    container.appendChild(tabs)

    let emojisToRender: { emoji: string; keywords: string[] }[]
    if (emojiQuery) {
        if (filteredEmojis.length === 0 || container.querySelector('.emoji-grid')) {
            filteredEmojis = []
            emojiCategories.forEach(cat => {
                cat.emojis.forEach(e => {
                    if (e.keywords.some(k => k.includes(emojiQuery)) || e.emoji.includes(emojiQuery)) {
                        filteredEmojis.push(e)
                    }
                })
            })
        }
        emojisToRender = filteredEmojis
    } else {
        emojisToRender = emojiCategories[activeCategory]?.emojis || []
    }

    const grid = document.createElement('div')
    grid.className = 'emoji-grid'
    emojisToRender.forEach((e, i) => {
        const btn = createEmojiBtn(e.emoji)
        if (i === selectedIndex) btn.classList.add('highlighted')
        grid.appendChild(btn)
    })

    if (emojisToRender.length === 0) {
        emptyState.style.display = 'block'
        emptyState.innerHTML = '<p>No emojis found</p>'
    } else {
        emptyState.style.display = 'none'
    }

    container.appendChild(grid)
    clipList.appendChild(container)
}

function createEmojiBtn(emoji: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'emoji-btn'
    btn.textContent = emoji
    btn.addEventListener('click', () => {
        addRecentEmoji(emoji)
        SelectClip(emoji).catch((err: unknown) => console.error('SelectClip failed:', err))
    })
    return btn
}

function renderSnippets(query: string) {
    if (allSnippets.length === 0) {
        GetSnippets().then((snippets: SnippetEntry[]) => {
            allSnippets = snippets || []
            renderSnippets(query)
        })
        clearModeContent()
        emptyState.style.display = 'block'
        emptyState.innerHTML = '<p>Loading snippets...</p>'
        return
    }

    filteredSnippets = query
        ? allSnippets.filter(s =>
            s.name.toLowerCase().includes(query) ||
            s.subPath.toLowerCase().includes(query) ||
            s.preview.toLowerCase().includes(query))
        : [...allSnippets]

    clearModeContent()

    if (filteredSnippets.length === 0) {
        emptyState.style.display = 'block'
        emptyState.innerHTML = '<p>No snippets found</p><p class="empty-hint">Add text files to ~/Snippets</p>'
        return
    }

    emptyState.style.display = 'none'

    const fragment = document.createDocumentFragment()
    filteredSnippets.forEach((snippet, i) => {
        const card = document.createElement('div')
        card.className = 'snippet-card' + (i === selectedIndex ? ' selected' : '')

        const header = document.createElement('div')
        header.className = 'snippet-header'

        const name = document.createElement('span')
        name.className = 'snippet-name'
        name.textContent = (snippet.isImage ? '🖼 ' : '📄 ') + snippet.name

        header.appendChild(name)

        if (snippet.subPath) {
            const sub = document.createElement('span')
            sub.className = 'snippet-sub'
            sub.textContent = snippet.subPath
            header.appendChild(sub)
        }

        card.appendChild(header)

        if (snippet.isImage) {
            const thumbWrap = document.createElement('div')
            thumbWrap.className = 'snippet-thumb-wrap'

            const thumb = document.createElement('img')
            thumb.className = 'snippet-thumb'
            thumb.alt = snippet.name
            GetSnippetThumbnail(snippet.name).then((dataUri: string) => {
                if (dataUri) thumb.src = dataUri
            })

            const sizeInfo = document.createElement('span')
            sizeInfo.className = 'snippet-thumb-info'
            sizeInfo.textContent = snippet.preview

            thumbWrap.appendChild(thumb)
            thumbWrap.appendChild(sizeInfo)
            card.appendChild(thumbWrap)
        } else {
            const preview = document.createElement('div')
            preview.className = 'snippet-preview'
            preview.textContent = truncate(snippet.preview, 120)
            card.appendChild(preview)
        }

        card.addEventListener('click', () => {
            if (snippet.isImage) {
                PasteSnippetImage(snippet.name).catch((err: unknown) => console.error('PasteSnippetImage failed:', err))
            } else {
                GetSnippetContent(snippet.name).then((content: string) => {
                    if (content) {
                        SelectSnippet(content).catch((err: unknown) => console.error('SelectSnippet failed:', err))
                    }
                })
            }
        })

        fragment.appendChild(card)
    })
    clipList.appendChild(fragment)
}

function clearModeContent() {
    const items = clipList.querySelectorAll(
        '.clip-card, .snippet-card, .emoji-container, .editor-container, .section-label'
    )
    items.forEach(c => c.remove())
}

searchInput.addEventListener('input', () => {
    selectedIndex = 0
    filteredEmojis = []
    activeCategory = 0
    render()
})

document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        searchInput.focus()
        return
    }

    if (currentMode === 'editor') {
        return
    }

    if (e.key === 'Escape') {
        e.preventDefault()
        searchInput.value = ''
        selectedIndex = 0
        filteredEmojis = []
        render()
        HideWindow()
        return
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault()
        navigateDown()
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        navigateUp()
    } else if (e.key === 'Enter') {
        e.preventDefault()
        selectCurrent()
    }
})

function navigateDown() {
    const count = getItemCount()
    if (count > 0) {
        selectedIndex = (selectedIndex + 1) % count
        render()
        scrollToSelected()
    }
}

function navigateUp() {
    const count = getItemCount()
    if (count > 0) {
        selectedIndex = (selectedIndex - 1 + count) % count
        render()
        scrollToSelected()
    }
}

function selectCurrent() {
    if (currentMode === 'clipboard') {
        if (filteredClips.length > 0 && selectedIndex < filteredClips.length) {
            SelectClip(filteredClips[selectedIndex].text).catch((err: unknown) => console.error('SelectClip failed:', err))
        }
    } else if (currentMode === 'emoji') {
        const emojis = getCurrentEmojis()
        if (emojis.length > 0 && selectedIndex < emojis.length) {
            const e = emojis[selectedIndex].emoji
            addRecentEmoji(e)
            SelectClip(e).catch((err: unknown) => console.error('SelectClip failed:', err))
        }
    } else if (currentMode === 'snippets') {
        if (filteredSnippets.length > 0 && selectedIndex < filteredSnippets.length) {
            GetSnippetContent(filteredSnippets[selectedIndex].name).then((content: string) => {
                if (content) {
                    SelectSnippet(content).catch((err: unknown) => console.error('SelectSnippet failed:', err))
                }
            })
        }
    }
}

function getItemCount(): number {
    if (currentMode === 'clipboard') return filteredClips.length
    if (currentMode === 'emoji') return getCurrentEmojis().length
    if (currentMode === 'snippets') return filteredSnippets.length
    return 0
}

function getCurrentEmojis(): { emoji: string; keywords: string[] }[] {
    if (emojiQuery) return filteredEmojis
    return emojiCategories[activeCategory]?.emojis || []
}

function scrollToSelected() {
    const sel = clipList.querySelector('.selected, .emoji-btn.highlighted, .snippet-card.selected')
    if (sel) sel.scrollIntoView({block: 'nearest'})
}

EventsOn('set_mode', (mode: string) => {
    searchInput.value = modePrefix(mode)
    selectedIndex = 0
    filteredEmojis = []
    activeCategory = 0
    if (mode === 'snippets') {
        allSnippets = []
    }
    render()
})

EventsOn('clipboard_updated', (data: Record<string, any>) => {
    allClips = (data.clips as string[]) || []
    allPinned = (data.pinned as string[]) || []
    selectedIndex = 0
    if (currentMode !== 'editor') {
        render()
    }
})

GetClips().then((data: Record<string, any>) => {
    allClips = (data.clips as string[]) || []
    allPinned = (data.pinned as string[]) || []
    GetEditorText().then((text: string) => {
        editorContent = text || ''
        undoStack = []
        redoStack = []
        render()
    })
})
