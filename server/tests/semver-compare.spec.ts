import { semverCompare } from "../src/utils/semver-compare";

describe('semver-compare', () => {
  it('should compare when 3 dots', () => {
    expect(semverCompare('0.1.2', '0.1.2')).toBe(0)
    expect(semverCompare('0.1', '0.1')).toBe(0)

    expect(semverCompare('0.1.3', '0.1.2')).toBe(1)
    expect(semverCompare('0.1.10', '0.1.2')).toBe(1)
    expect(semverCompare('0.1.20', '0.1.2')).toBe(1)
    expect(semverCompare('0.10.2', '0.1.2')).toBe(1)
    expect(semverCompare('0.100.2', '0.20.10')).toBe(1)

    expect(semverCompare('0.1.1', '0.1.2')).toBe(-1)
    expect(semverCompare('0.1.10', '0.1.20')).toBe(-1)
    expect(semverCompare('0.1.10', '0.1.20')).toBe(-1)
  })

  it('should compare when less than 3 dots', () => {
    expect(semverCompare('1', '1')).toBe(0)
    expect(semverCompare('0.10', '0.10')).toBe(0)
    expect(semverCompare('0.1.0', '0.1')).toBe(0)
    expect(semverCompare('123', '123.0.0')).toBe(0)

    expect(semverCompare('123', '123.0.1')).toBe(-1)
    expect(semverCompare('1.2', '1.2.3')).toBe(-1)

    expect(semverCompare('123.0.1', '123')).toBe(1)
  })

  it('should compare if "v" letter', () => {
    expect(semverCompare('v0.1.2', 'v0.1.2')).toBe(0)
    expect(semverCompare('v0.1.20', 'v0.1.2')).toBe(1)
    expect(semverCompare('v0.5.13', 'v0.5.2')).toBe(1)

    expect(semverCompare('v1.3', 'v1.2.3')).toBe(1)
    expect(semverCompare('v2', 'v2.0.0')).toBe(0)
  })
})
