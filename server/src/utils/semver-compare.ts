function appendZeroes(s: string): string {
  let n_dots = 0
  for (let c of s) {
    if (c === '.') {
      n_dots++
    }
  }
  while (n_dots++ < 3) {
    s += '.0'
  }
  return s
}

export function semverCompare(s1: string, s2: string): -1 | 0 | 1 {
  s1 = appendZeroes(s1)
  s2 = appendZeroes(s2)
  return s1.localeCompare(s2, undefined, { numeric: true }) as any;
}
