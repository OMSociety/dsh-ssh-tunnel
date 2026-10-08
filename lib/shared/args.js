/**
 * Strict argument coercion for API/tool entry points.
 *
 * `String(x || fallback)` turns a missing argument into the literal string
 * "undefined" (or the fallback), which then flows into path operations and
 * silently creates files or remote paths named "undefined". These helpers
 * throw instead, so the caller sees which argument is missing.
 */

export function requireString(value, label) {
  if (value == null) throw new Error(label + ' required')
  const s = String(value).trim()
  if (!s) throw new Error(label + ' required')
  return s
}

/** Like requireString, but an empty value resolves to the fallback. */
export function stringOrDefault(value, fallback, label) {
  if (value == null) return requireString(fallback, label)
  const s = String(value).trim()
  if (!s) return requireString(fallback, label)
  return s
}
