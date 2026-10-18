import { describe, expect, it } from 'vitest'
import { fitSize } from './image'

describe('fitSize', () => {
  it('riduce mantenendo le proporzioni', () => expect(fitSize(4000, 3000, 800)).toEqual({ width: 800, height: 600 }))
  it('gestisce le foto verticali', () => expect(fitSize(3000, 4000, 800)).toEqual({ width: 600, height: 800 }))
  it('non ingrandisce', () => expect(fitSize(300, 200, 800)).toEqual({ width: 300, height: 200 }))
})
