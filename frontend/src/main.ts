import './style.css'
import {EventsOn} from '../wailsjs/runtime/runtime'
import {SelectClip, GetClips, HideWindow} from '../wailsjs/go/main/App'

let allClips: string[] = []
let selectedIndex = 0
let filteredClips: string[] = []

const clipList = document.getElementById('clip-list')!
const emptyState = document.getElementById('empty-state')!
const searchInput = document.getElementById('search')! as HTMLInputElement

window.addEventListener('blur', () => {
    HideWindow()
})

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.substring(0, maxLen) + '...'
}

function render() {
    const query = searchInput.value.toLowerCase().trim()
    filteredClips = query
        ? allClips.filter(c => c.toLowerCase().includes(query))
        : [...allClips]

    if (filteredClips.length === 0) {
        emptyState.style.display = 'block'
        const cards = clipList.querySelectorAll('.clip-card')
        cards.forEach(c => c.remove())
        return
    }

    emptyState.style.display = 'none'

    if (selectedIndex >= filteredClips.length) {
        selectedIndex = 0
    }

    const fragment = document.createDocumentFragment()
    filteredClips.forEach((clip, i) => {
        const card = document.createElement('div')
        card.className = 'clip-card' + (i === selectedIndex ? ' selected' : '')
        card.dataset.index = String(i)

        const indexLabel = document.createElement('div')
        indexLabel.className = 'clip-index'
        indexLabel.textContent = `#${i + 1}`

        const preview = document.createElement('div')
        preview.textContent = truncate(clip, 120)

        card.appendChild(indexLabel)
        card.appendChild(preview)

        card.addEventListener('click', () => {
            SelectClip(clip).catch((err: unknown) => {
                console.error('SelectClip failed:', err)
            })
        })

        fragment.appendChild(card)
    })

    const existing = clipList.querySelectorAll('.clip-card')
    existing.forEach(c => c.remove())
    clipList.appendChild(fragment)

    const selectedEl = clipList.querySelector('.clip-card.selected')
    if (selectedEl) {
        selectedEl.scrollIntoView({block: 'nearest'})
    }
}

searchInput.addEventListener('input', () => {
    selectedIndex = 0
    render()
})

document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
        e.preventDefault()
        searchInput.value = ''
        selectedIndex = 0
        render()
        HideWindow()
        return
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (filteredClips.length > 0) {
            selectedIndex = (selectedIndex + 1) % filteredClips.length
            render()
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (filteredClips.length > 0) {
            selectedIndex = (selectedIndex - 1 + filteredClips.length) % filteredClips.length
            render()
        }
    } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredClips.length > 0 && selectedIndex < filteredClips.length) {
            SelectClip(filteredClips[selectedIndex]).catch((err: unknown) => {
                console.error('SelectClip failed:', err)
            })
        }
    } else if (/^[1-9]$/.test(e.key) && e.target !== searchInput) {
        const idx = parseInt(e.key) - 1
        if (idx < filteredClips.length) {
            e.preventDefault()
            SelectClip(filteredClips[idx]).catch((err: unknown) => {
                console.error('SelectClip failed:', err)
            })
        }
    }
})

EventsOn('clipboard_updated', (clips: string[]) => {
    allClips = clips || []
    selectedIndex = 0
    render()
})

GetClips().then((clips: string[]) => {
    allClips = clips || []
    render()
})
