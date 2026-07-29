export class PriorityQueue<Item> {
  private readonly heap: Item[] = []

  constructor(private readonly compare: (a: Item, b: Item) => boolean) {}

  push(item: Item): void {
    this.heap.push(item)

    let current = this.heap.length - 1
    while (current > 0) {
      const parent = (current - 1) >> 1
      if (!this.compare(this.heap[current], this.heap[parent])) {
        break
      }
      this.swap(current, parent)
      current = parent
    }
  }

  pop(): Item | undefined {
    if (this.heap.length === 0) {
      return undefined
    }

    const first = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length === 0) {
      return first
    }

    this.heap[0] = last
    this.bubbleDown(0)
    return first
  }

  size(): number {
    return this.heap.length
  }

  isEmpty(): boolean {
    return this.heap.length === 0
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length
    let current = index

    while (true) {
      const left = current * 2 + 1
      const right = left + 1
      let smallest = current

      if (left < length && this.compare(this.heap[left], this.heap[smallest])) {
        smallest = left
      }
      if (right < length && this.compare(this.heap[right], this.heap[smallest])) {
        smallest = right
      }
      if (smallest === current) {
        break
      }

      this.swap(current, smallest)
      current = smallest
    }
  }

  private swap(a: number, b: number): void {
    const tmp = this.heap[a]
    this.heap[a] = this.heap[b]
    this.heap[b] = tmp
  }
}
