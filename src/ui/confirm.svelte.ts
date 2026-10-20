// Conferme dentro l'app al posto di window.confirm(): la finestra di sistema su iPhone può non comparire
// o perdere il tocco (tastiera aperta, app installata sulla Home). Una sola richiesta alla volta.

export interface ConfirmRequest {
  message: string
  confirmLabel: string
  danger: boolean
  resolve: (ok: boolean) => void
}

export const confirmState = $state<{ current: ConfirmRequest | null }>({ current: null })

/** Chiede conferma; risolve true solo se l'utente tocca il pulsante di conferma. */
export function ask(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  confirmState.current?.resolve(false)
  return new Promise((resolve) => {
    confirmState.current = { message, confirmLabel: opts.confirmLabel ?? 'Conferma', danger: opts.danger ?? true, resolve }
  })
}

export function answer(ok: boolean) {
  const req = confirmState.current
  confirmState.current = null
  req?.resolve(ok)
}
