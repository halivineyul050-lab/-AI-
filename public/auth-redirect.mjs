export function resolveAuthNextPath(rawValue, origin) {
  try {
    const value = rawValue || "/";
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return "/";
    const target = new URL(value, origin);
    if (target.origin !== new URL(origin).origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}
