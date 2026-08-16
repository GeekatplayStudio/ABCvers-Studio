import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { Stage } from './Stage'
import { useStudio } from '../store/useStudio'

/**
 * jsdom performs no layout, so the stage is given a fixed box and the geometry
 * the components actually write to the DOM is asserted. This is the test that
 * pins the "pictures touch, no gaps" behaviour end to end: fitRow -> Row -> the
 * inline widths and heights on the real elements.
 */
function withStageBox(width: number, height: number) {
  const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return () => spy.mockRestore()
}

function fakeFile(name: string, type = 'video/mp4'): File {
  return { name, type, size: 4096, lastModified: 0 } as File
}

const initial = useStudio.getState()

beforeEach(() => {
  useStudio.setState({
    ...initial,
    items: [],
    aspect: 'free',
    columns: 'auto',
    layout: 'row',
    fitMode: 'fit',
  })
  vi.spyOn(URL, 'createObjectURL').mockImplementation((file) => `blob:${(file as File).name}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
})

/** Add clips and give them intrinsic sizes, as loadedmetadata would. */
function seed(sizes: [number, number][]): void {
  act(() => {
    useStudio.getState().addFiles(sizes.map((_, i) => fakeFile(`clip${i}.mp4`)))
  })
  act(() => {
    useStudio.getState().items.forEach((item, index) => {
      const [width, height] = sizes[index]!
      useStudio.getState().setMeta(item.id, { width, height, duration: 10, fps: 25 })
    })
  })
}

const cells = () => Array.from(document.querySelectorAll<HTMLElement>('.row__cell'))
const stages = () => Array.from(document.querySelectorAll<HTMLElement>('.panel__stage'))
const widths = () => cells().map((cell) => Number.parseFloat(cell.style.width))

describe('Stage geometry', () => {
  it('sizes a 16:9 and a 1:1 panel so both pictures are full bleed and touch', () => {
    const restore = withStageBox(1200, 700)
    seed([
      [1920, 1080],
      [1000, 1000],
    ])
    render(<Stage />)

    // Shared picture height, widths in proportion to each source's own ratio.
    const heights = stages().map((element) => Number.parseFloat(element.style.height))
    expect(new Set(heights).size).toBe(1)
    expect(heights[0]).toBe(432)
    expect(widths()).toEqual([768, 432])

    // 768/432 is exactly 16:9 and 432/432 is exactly 1:1 - no letterbox bars,
    // and the two widths sum to the full row, so nothing shows between them.
    expect(widths()[0]! / heights[0]!).toBeCloseTo(16 / 9)
    expect(widths()[1]! / heights[0]!).toBeCloseTo(1)
    expect(widths().reduce((a, b) => a + b, 0)).toBe(1200)
    restore()
  })

  it('leaves no gap between three panels of mixed orientation', () => {
    const restore = withStageBox(1600, 500)
    seed([
      [1920, 1080],
      [1080, 1920],
      [1000, 1000],
    ])
    render(<Stage />)

    const heights = stages().map((element) => Number.parseFloat(element.style.height))
    expect(new Set(heights).size).toBe(1)

    // Every edge lands on a whole pixel, and each panel's box is its own shape.
    const h = heights[0]!
    expect(widths().every(Number.isInteger)).toBe(true)
    expect(widths()[0]! / h).toBeCloseTo(16 / 9, 1)
    expect(widths()[1]! / h).toBeCloseTo(9 / 16, 1)
    expect(widths()[2]! / h).toBeCloseTo(1, 1)
    expect(widths().reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1600)
    restore()
  })

  it('gives every panel the same box when the aspect is locked', () => {
    const restore = withStageBox(1200, 700)
    useStudio.setState({ aspect: '1:1' })
    seed([
      [1920, 1080],
      [1080, 1920],
    ])
    render(<Stage />)

    const [first, second] = widths()
    expect(first).toBe(second)
    const height = Number.parseFloat(stages()[0]!.style.height)
    expect(first! / height).toBeCloseTo(1)
    restore()
  })

  it('is height-constrained rather than overflowing a short row', () => {
    const restore = withStageBox(4000, 300)
    seed([[1920, 1080]])
    render(<Stage />)
    expect(Number.parseFloat(stages()[0]!.style.height)).toBe(300)
    expect(widths()[0]).toBe(533) // 300 * 16/9
    restore()
  })

  it('splits into rows and gives each row its share of the height', () => {
    const restore = withStageBox(1200, 700)
    useStudio.setState({ columns: 2 })
    seed([
      [1920, 1080],
      [1920, 1080],
      [1920, 1080],
      [1920, 1080],
    ])
    render(<Stage />)

    expect(document.querySelectorAll('.row')).toHaveLength(2)
    const heights = stages().map((element) => Number.parseFloat(element.style.height))
    expect(new Set(heights).size).toBe(1)
    // Each row gets half the stage; the pictures are width-constrained here,
    // and a width-constrained row is not rounded down - that would leave a
    // sliver of background showing down the side of a row meant to reach both
    // edges.
    expect(heights[0]).toBe(337.5)
    restore()
  })

  it('keeps every panel on one line in row layout, however many there are', () => {
    const restore = withStageBox(1200, 700)
    seed(Array.from({ length: 6 }, () => [1920, 1080] as [number, number]))
    render(<Stage />)
    expect(document.querySelectorAll('.row')).toHaveLength(1)
    restore()
  })

  it('wraps into a squared-off block in grid layout', () => {
    const restore = withStageBox(1200, 700)
    useStudio.setState({ layout: 'grid' })
    seed(Array.from({ length: 6 }, () => [1920, 1080] as [number, number]))
    render(<Stage />)

    // Six 16:9 panels -> three columns, two rows.
    expect(document.querySelectorAll('.row')).toHaveLength(2)
    expect(widths()).toHaveLength(6)
    // Each panel is far taller than the same six squeezed onto a single line
    // would be (1200/6 wide, i.e. 112px tall) - that is the point of the mode.
    const heights = stages().map((element) => Number.parseFloat(element.style.height))
    expect(new Set(heights).size).toBe(1)
    expect(heights[0]).toBe(225) // (1200 / 3) / (16/9)
    restore()
  })

  it('fills the stage width in grid layout, leaving nothing black down the sides', () => {
    const restore = withStageBox(1200, 700)
    useStudio.setState({ layout: 'grid' })
    seed(Array.from({ length: 9 }, () => [1920, 1080] as [number, number]))
    render(<Stage />)

    // The column count is measured against the stage, not guessed from the
    // panel count: whatever it picks, a full row reaches both edges.
    const perRow = 9 / document.querySelectorAll('.row').length
    const rowWidth = widths()
      .slice(0, perRow)
      .reduce((sum, width) => sum + width, 0)
    expect(rowWidth).toBe(1200)
    restore()
  })

  it('does not let a short final grid row blow its panels up bigger than the rest', () => {
    const restore = withStageBox(1200, 700)
    useStudio.setState({ layout: 'grid' })
    seed(Array.from({ length: 5 }, () => [1920, 1080] as [number, number]))
    render(<Stage />)

    // Three columns, so the last row holds two panels - and they must match
    // the three above them rather than justify across the whole stage.
    expect(document.querySelectorAll('.row')).toHaveLength(2)
    expect(new Set(widths()).size).toBe(1)
    restore()
  })

  it('still renders before the stage has been measured', () => {
    seed([[1920, 1080]])
    render(<Stage />)
    expect(document.querySelectorAll('.panel')).toHaveLength(1)
    expect(document.querySelector('.row')).not.toHaveAttribute('data-measured')
  })
})
