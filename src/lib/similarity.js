/**
 * Zero-dependency text similarity using trigram Jaccard coefficient.
 * Used for duplicate ticket detection against lessons.md and existing tickets.
 */

export const DUPLICATE_THRESHOLD = 0.65;

export function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function trigrams(tokens) {
  const set = new Set();
  for (let i = 0; i <= tokens.length - 3; i++) {
    set.add(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  // Also include bigrams for short texts
  for (let i = 0; i <= tokens.length - 2; i++) {
    set.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return set;
}

export function similarity(textA, textB) {
  const a = trigrams(tokenize(textA));
  const b = trigrams(tokenize(textB));

  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const gram of a) {
    if (b.has(gram)) intersection++;
  }

  // Jaccard = |A ∩ B| / |A ∪ B|
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find best match above threshold from a list of candidates.
 * @returns {{ text: string, score: number } | null}
 */
export function findBestMatch(query, candidates) {
  let best = null;
  for (const text of candidates) {
    const score = similarity(query, text);
    if (score >= DUPLICATE_THRESHOLD && (!best || score > best.score)) {
      best = { text, score };
    }
  }
  return best;
}
