export function escapeLikePattern(value) {
  return String(value).replaceAll("!", "!!").replaceAll("%", "!%").replaceAll("_", "!_");
}
