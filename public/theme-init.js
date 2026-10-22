try {
  const storedTheme = localStorage.getItem("nike-theme");
  const theme = storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
} catch {
  // Theme initialization must never prevent a page from rendering.
}
