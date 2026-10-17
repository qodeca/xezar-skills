// Line-diff distance (Myers), for plan §6.2 step 3: "the version with the smallest line diff".
// Returns insertions + deletions. `limit` stops early once the distance is known to exceed it.

export function lineDistance(aText, bText, limit = Infinity) {
  const a = aText.split("\n");
  const b = bText.split("\n");
  // Trim the common prefix and suffix first: most versions differ in a few lines.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const A = a.slice(start, endA);
  const B = b.slice(start, endB);
  const n = A.length;
  const m = B.length;
  if (n === 0 || m === 0) return n + m;
  const max = Math.min(n + m, limit);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  for (let d = 0; d <= max; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return d;
    }
  }
  return limit === Infinity ? n + m : limit + 1;
}
