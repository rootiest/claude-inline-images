export type PastedImage = { png: string; width: number; height: number }

export type PastedPrompt = { key: string; images: PastedImage[] }

declare module 'claude-code' {
  interface PluginState {
    'inline-images': { pasted: Shaped<PastedPrompt[]> }
  }
}
