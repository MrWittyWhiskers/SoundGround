// ----------------- Theme -------------------------
const THEME_KEY = "app-theme";

function applyTheme(theme) {
  document.body.classList.remove("theme-cyber");

  if (theme === "cyber") {
    document.body.classList.add("theme-cyber");
  }

  localStorage.setItem(THEME_KEY, theme);

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = theme === "cyber" ? "⚡ サイバー" : "🌿 テーマ";
  }
}

function toggleTheme() {
  const isCyber = document.body.classList.contains("theme-cyber");
  applyTheme(isCyber ? "default" : "cyber");
}

// Restore theme on load
const savedTheme = localStorage.getItem(THEME_KEY) || "default";
applyTheme(savedTheme);

// Sync across pages / tabs
window.addEventListener("storage", (event) => {
  if (event.key === THEME_KEY) {
    applyTheme(event.newValue || "default");
  }
});

// Button click
const themeToggle = document.getElementById("theme-toggle");
if (themeToggle) {
  themeToggle.addEventListener("click", toggleTheme);
}

// Page transition: HOME → NATURE
const goNature = document.getElementById("go-nature");

if (goNature) {
  goNature.addEventListener("click", (e) => {
    e.preventDefault();

    localStorage.setItem("motionLevel", "alive");
    document.body.classList.add("page-fade-out");

    setTimeout(() => {
      window.location.href = goNature.href;
    }, 600);
  });
}

// Feature card hover sound effects
const features = document.querySelectorAll('.feature');
features.forEach(feature => {
  feature.addEventListener('mouseenter', () => {
    console.log('Feature hovered');
  });
});