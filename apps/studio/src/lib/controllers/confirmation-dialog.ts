import {
  confirmationDialog,
  confirmationDialogBackdrop,
  confirmationDialogCancel,
  confirmationDialogConfirm,
  confirmationDialogMessage,
  confirmationDialogTitle,
} from '../dom'

export interface ConfirmationDialogOptions {
  title: string
  message: string
}

let pendingResolution: ((confirmed: boolean) => void) | null = null
let previousFocus: HTMLElement | null = null

export function initConfirmationDialog(): void {
  confirmationDialogBackdrop.addEventListener('click', () => close(false))
  confirmationDialogCancel.addEventListener('click', () => close(false))
  confirmationDialogConfirm.addEventListener('click', () => close(true))
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmationDialog.classList.contains('is-hidden')) {
      event.preventDefault()
      close(false)
    }
  })
}

export function confirmMazeReplacement(options: ConfirmationDialogOptions): Promise<boolean> {
  if (pendingResolution) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    pendingResolution = resolve
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    confirmationDialogTitle.textContent = options.title
    confirmationDialogMessage.textContent = options.message
    confirmationDialog.classList.remove('is-hidden')
    confirmationDialogCancel.focus()
  })
}

function close(confirmed: boolean): void {
  if (!pendingResolution) {
    return
  }
  const resolve = pendingResolution
  pendingResolution = null
  confirmationDialog.classList.add('is-hidden')
  previousFocus?.focus()
  previousFocus = null
  resolve(confirmed)
}
