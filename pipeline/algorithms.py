import random


class MinHeap:
    """Array-backed binary min-heap of (priority, item) pairs.
    children of index i live at 2i+1 and 2i+2; the parent of i is (i-1)//2"""

    def __init__(self):
        self._data = []

    def __len__(self):
        return len(self._data)

    def peek(self):
        if not self._data:
            raise IndexError("Peek called from empty heap")
        return self._data[0]

    def push(self, priority, item):
        self._data.append((priority, item))
        self._sift_up(len(self._data) - 1)

    def pop(self):
        if not self._data:
            raise IndexError("Pop called from empty heap")
        last = self._data.pop()
        if not self._data:
            return last
        top = self._data[0]
        self._data[0] = last
        self._sift_down(0)
        return top

    def replace_top(self, priority, item):
        top = self._data[0]
        self._data[0] = (priority, item)
        self._sift_down(0)
        return top

    def _sift_up(self, i):
        data = self._data
        while i > 0:
            parent = (i - 1) // 2
            if data[i][0] >= data[parent][0]:
                break
            data[i], data[parent] = data[parent], data[i]
            i = parent

    def _sift_down(self, i):
        data = self._data
        n = len(data)
        while True:
            left = 2 * i + 1
            right = left + 1
            smallest = i
            if left < n and data[left][0] < data[smallest][0]:
                smallest = left
            if right < n and data[right][0] < data[smallest][0]:
                smallest = right
            if smallest == i:
                return
            data[i], data[smallest] = data[smallest], data[i]
            i = smallest


def top_k(items, k, key):
    if k <= 0:
        return []
    heap = MinHeap()
    for item in items:
        value = key(item)
        if value is None:
            continue
        if len(heap) < k:
            heap.push(value, item)
        elif value > heap.peek()[0]:
            heap.replace_top(value, item)
    # popping a min-heap yields ascending order; fill the result from the back.
    result = [None] * len(heap)
    for i in range(len(result) - 1, -1, -1):
        result[i] = heap.pop()[1]
    return result


def quickselect(values, k):
    if not values:
        raise ValueError("quickselect on empty list")
    if k < 0 or k >= len(values):
        raise IndexError("k out of range")
    arr = list(values)
    lo, hi = 0, len(arr) - 1
    while True:
        if lo == hi:
            return arr[lo]
        p = random.randint(lo, hi)
        arr[p], arr[hi] = arr[hi], arr[p]
        pivot = arr[hi]
        store = lo
        for i in range(lo, hi):
            if arr[i] < pivot:
                arr[i], arr[store] = arr[store], arr[i]
                store += 1
        arr[store], arr[hi] = arr[hi], arr[store]
        if k == store:
            return arr[store]
        if k < store:
            hi = store - 1
        else:
            lo = store + 1


def percentile(values, q):
    n = len(values)
    pos = q * (n - 1)
    lower = int(pos)
    frac = pos - lower
    low_val = quickselect(values, lower)
    if frac == 0 or lower + 1 >= n:
        return low_val
    high_val = quickselect(values, lower + 1)
    return low_val + (high_val - low_val) * frac


def iqr_fences(values, multiplier=1.5):
    q1 = percentile(values, 0.25)
    q3 = percentile(values, 0.75)
    iqr = q3 - q1
    return q1 - multiplier * iqr, q3 + multiplier * iqr, q1, q3
