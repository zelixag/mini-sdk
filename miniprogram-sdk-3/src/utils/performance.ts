class PerformanceTracker {
  private marks: Map<string, number> = new Map()
  private measurements: Map<string, number[]> = new Map()

  markStart(key: string): void {
    this.marks.set(key, Date.now())
  }

  markEnd(key: string): number {
    const start = this.marks.get(key)
    if (start === undefined) return -1
    const duration = Date.now() - start
    this.marks.delete(key)
    if (!this.measurements.has(key)) this.measurements.set(key, [])
    this.measurements.get(key)!.push(duration)
    return duration
  }

  getAverage(key: string): number {
    const m = this.measurements.get(key)
    if (!m || m.length === 0) return 0
    return m.reduce((a, b) => a + b, 0) / m.length
  }

  clear(): void {
    this.marks.clear()
    this.measurements.clear()
  }
}

export const perfTracker = new PerformanceTracker()
