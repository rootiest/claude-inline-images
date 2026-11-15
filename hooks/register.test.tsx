import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const result = (output: unknown, surface: 'terminal' | 'desktop' = 'terminal') =>
  ({
    plugin: 'inline-images',
    component: 'ToolResult',
    requestId: 'toolu_1',
    surface,
    props: { tool_use_id: 'toolu_1', tool: 'SendUserFile', output, isErrored: false },
  }) as const

const png = {
  path: '/tmp/shot #1.png',
  size: 1234,
  isImage: true,
  scaled: { width: 800, height: 500, original_width: 1600, original_height: 1000 },
}

const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

test('draws a PNG inline in the terminal with its path below', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(result({ caption: 'Before and after', attachments: [png] }))

  expect(await ui.find({ type: 'Image' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Before and after/ }))?.text).toBe('Before and after')
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeFalsy()
  await ui.unmount()
})

test('leaves every other surface to the engine', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(result({ attachments: [png] }, 'desktop'))

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('leaves downloads, other formats and failed sends to the engine', async ($, on) => {
  engine(on)
  const cases = [
    { display: 'attach', attachments: [png] },
    { attachments: [{ ...png, path: '/tmp/photo.jpg' }] },
    { attachments: [{ ...png, upload_error: 'too large' }] },
  ]

  for (const output of cases) {
    const ui = await $.ui.mount(result(output))
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  }
})

const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGP4z8AARwzIHABvqgf5gNwAKAAAAABJRU5ErkJggg=='

const read = (type: string) =>
  ({
    plugin: 'inline-images',
    component: 'ToolResult',
    requestId: 'toolu_2',
    surface: 'terminal',
    props: {
      tool_use_id: 'toolu_2',
      tool: 'Read',
      isErrored: false,
      output: {
        type: 'image',
        file: { base64: TINY_PNG, type, originalSize: 95, dimensions: { originalWidth: 4, originalHeight: 2 } },
      },
    },
  }) as const

test('draws a PNG that Claude read, in any session', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(read('image/png'))

  expect(await ui.find({ type: 'Image' })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeFalsy()
  await ui.unmount()
})

test('leaves a JPEG that Claude read to the engine', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(read('image/jpeg'))

  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

const group = (type: string, isExpanded = false) =>
  ({
    plugin: 'inline-images',
    component: 'ToolGroup',
    requestId: 'group_1',
    surface: 'terminal',
    props: {
      isActive: false,
      isExpanded,
      calls: [
        {
          tool_use_id: 'toolu_3',
          tool: 'Read',
          input: { file_path: '/tmp/test.png' },
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
          output: read(type).props.output,
        },
      ],
    },
  }) as const

test('keeps the grouped Read line and draws the PNG under it', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(group('image/png'))

  expect(await ui.find({ type: 'Image' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('leaves an expanded group and a JPEG read to the engine', async ($, on) => {
  engine(on)
  for (const mounted of [group('image/png', true), group('image/jpeg')]) {
    const ui = await $.ui.mount(mounted)
    expect(await ui.find({ type: 'Image' })).toBeFalsy()
    await ui.unmount()
  }
})

const message = (text: string, surface: 'terminal' | 'desktop' = 'terminal') =>
  ({
    plugin: 'inline-images',
    component: 'UserMessage',
    requestId: 'message_1',
    surface,
    props: { text, origin: { kind: 'composer' }, isExpanded: false },
  }) as const

const stored = (key: string) =>
  ({
    value: {
      value: { shape: 'pasted-1', value: [{ key, images: [{ png: TINY_PNG, width: 4, height: 2 }] }] },
      version: 1,
    },
  }) as const

test('draws an image pasted with a prompt under that prompt', async ($, on) => {
  engine(on)
  on('state.get', () => stored('what is this'))
  const ui = await $.ui.mount(message('[Image #1] what is this'))

  expect(await ui.find({ type: 'Image' })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('leaves other prompts and other surfaces to the engine', async ($, on) => {
  engine(on)
  on('state.get', () => stored('what is this'))

  for (const mounted of [message('something else'), message('what is this', 'desktop')]) {
    const ui = await $.ui.mount(mounted)
    expect(await ui.find({ type: 'Image' })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
    await ui.unmount()
  }
})

test('declines pasted images an earlier version stored', async ($, on) => {
  engine(on)
  on('state.get', () => ({ value: { value: [{ key: 'what is this', images: [] }], version: 1 } }))
  const ui = await $.ui.mount(message('what is this'))

  expect(await ui.find({ type: 'Image' })).toBeFalsy()
  await ui.unmount()
})

test('a prompt without images goes through untouched and stores nothing', async ($, on) => {
  engine(on)
  on('prompt.submit', (_, e) => ({ text: e.text }))
  const writes: unknown[] = []
  on('state.set', (_, e) => {
    writes.push(e)
    return { value: { isSet: true, version: 1 } } as const
  })

  const entered = await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })

  expect(entered.text).toBe('hello')
  expect(writes.length).toBe(0)
})
