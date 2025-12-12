// ==============================
// Nature Sound Engine
// ==============================

const API_KEY = "YGNE8y4WuAWOaQT6D18K1SJ1RM1ab8RzR2LefHLJ";

// sound IDs 
const soundIDs = {
  waterfall:   365920,
  campfire:    637523,
  crickets:    530759,
  nightwind:   646315,
  waves:       410612,
  seagulls:    712282,
  seabreeze:   721360,
  frog:        581647,  
  rain:        193336,
  raindrops:   440489,
  space_wind:  38969,    
  wind_winter: 400992,   
  soft_rainy:    554158,
  soft_space:    76420,   
  soft_tropical: 451945,
  soft_cabin:    663270,  
  soft_meadow:   658514,  
  soft_autumn:   651241,  

  birds_forest:  507264,
  birds_meadow:  425378,
  birds_autumn:  659990,

  wind_valley:   463553,
  wind_space:    233995,
  wind_field:    463553,
  wind_autumn:   669871
};

// audio pool
let audioObjects = {};
let soundsReady = false;

const scenePresets = {
  "scene-waterfall": ["waterfall","birds_forest","wind_valley"],
  "scene-nightcamp": ["campfire","crickets","nightwind"],
  "scene-ocean":     ["waves","seagulls","seabreeze"],
  "scene-rainy":     ["rain","raindrops","soft_rainy"],

  // space scene 
  "scene-space":     ["soft_space","space_wind","wind_space"],

  // tropical scene 
  "scene-tropical":  ["seabreeze","frog","soft_tropical"],

  // cabin scene 
  "scene-cabin":     ["campfire","wind_winter","soft_cabin"],

  "scene-meadow":    ["birds_meadow","wind_field","soft_meadow"],
  "scene-autumn":    ["birds_autumn","wind_autumn","soft_autumn"]
};

// ------------------------------
// load sounds
// ------------------------------
async function preloadSounds() {
  try {
    for (const key in soundIDs) {
      try {
        const meta = await fetch(
          `https://freesound.org/apiv2/sounds/${soundIDs[key]}/?token=${API_KEY}`
        );
        if (!meta.ok) throw new Error(`meta failed: ${key}`);
        const data = await meta.json();

        const file = await fetch(data.previews["preview-hq-mp3"]);
        if (!file.ok) throw new Error(`audio failed: ${key}`);
        const blob = await file.blob();
        const url = URL.createObjectURL(blob);

        const a = new Audio(url);
        a.loop = true;
        a.volume = 0.3;
        audioObjects[key] = a;
      } catch (errOne) {
        console.error("load", key, errOne);
      }
    }
    soundsReady = true;
    console.log("sounds ready");
  } catch (errAll) {
    console.error(errAll);
  }
}

// play individual sound
function playSound(key) {
  const a = audioObjects[key];
  if (!a) {
    console.warn("not loaded yet:", key);
    return;
  }
  a.play().catch(()=>{});
}

// stop everything
function stopAllSounds() {
  Object.values(audioObjects).forEach(a => {
    a.pause();
    a.currentTime = 0;
  });
}

// ------------------------------
// DOM ready
// ------------------------------
window.addEventListener("DOMContentLoaded", () => {

  const scenes         = Array.from(document.querySelectorAll(".scene"));
  const volumeSections = Array.from(document.querySelectorAll(".volume-section"));

  const btnPrev   = document.getElementById("prev-page");
  const btnNext   = document.getElementById("next-page");
  const btnStop   = document.getElementById("stop-btn");
  const btnMenu   = document.querySelector(".panel-toggle");
  const moodBtn   = document.getElementById("toggle-mood");
  const panel     = document.querySelector(".control-panel");
  const panelBody = document.querySelector(".control-panel .panel-content");

  // gesture unlock for autoplay 
  const unlock = () => {
    Object.values(audioObjects).forEach(a => {
      a.play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
        })
        .catch(()=>{});
    });
  };
  window.addEventListener("click", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });

  // clicking zones
  document.querySelectorAll(".zone").forEach(z => {
    z.addEventListener("click", () => {
      const key = z.dataset.sound;
      playSound(key);
    });
  });

  // sliders volume control
  document.querySelectorAll('.volume-section input[type="range"]').forEach(sl => {
    sl.addEventListener("input", () => {
      const key = sl.dataset.sound;
      const a = audioObjects[key];
      if (a) {
        a.volume = parseFloat(sl.value);
      }
    });
  });

  // volume-waterfall
  function volumeElForScene(sceneEl) {
    if (!sceneEl || !sceneEl.id) return null;
    const suffix = sceneEl.id.replace(/^scene-/, "");
    return document.getElementById(`volume-${suffix}`);
  }


  // auto-play scene (lively mode only)
  function playScenePreset(sceneEl) {
    if (!sceneEl) return;
    stopAllSounds();
    const list = scenePresets[sceneEl.id];
    if (!list || !list.length) return;
    list.forEach(k => playSound(k));
  }

  // scene switching
  let currentScene = 0;

  function showScene(i) {
    if (!scenes.length) return;

    // set active scene
    scenes.forEach(s => s.classList.remove("active"));
    const nextScene = scenes[i];
    if (nextScene) nextScene.classList.add("active");

    // slider group
    volumeSections.forEach(v => v.style.display = "none");
    const volBox = volumeElForScene(nextScene);
    if (volBox) volBox.style.display = "block";

    // reset sounds
    stopAllSounds();
    if (document.body.classList.contains("mode-lively") && nextScene) {
      playScenePreset(nextScene);
    }
  }

  // random scene 
  if (scenes.length) {
    currentScene = Math.floor(Math.random() * scenes.length);
    showScene(currentScene);
  }

  // prev/next nav
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      currentScene = (currentScene + 1) % scenes.length;
      showScene(currentScene);
    });
  }
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      currentScene = (currentScene - 1 + scenes.length) % scenes.length;
      showScene(currentScene);
    });
  }

  // stop button
  if (btnStop) {
    btnStop.addEventListener("click", stopAllSounds);
  }

  // lively / stable mode toggle
  function setMode(lively) {
    if (lively) {
      document.body.classList.add("mode-lively");
      if (moodBtn) moodBtn.textContent = "🌿 画像を動かす";
      if (scenes[currentScene]) {
        playScenePreset(scenes[currentScene]);
      }
    } else {
      document.body.classList.remove("mode-lively");
      if (moodBtn) moodBtn.textContent = "🌙 止める";
      stopAllSounds();
    }
  }

  // start Stable
  setMode(false);

  if (moodBtn) {
    moodBtn.addEventListener("click", () => {
      const newState = !document.body.classList.contains("mode-lively");
      setMode(newState);

      if (!panelVisible) showPanel();
    });
  }

  // panel show/hide 
  let panelVisible = true;

  // reopen button
  const handle = document.createElement("button");
  handle.className = "panel-handle hidden";
  handle.type = "button";
  handle.textContent = "コントロールを開く";
  document.body.appendChild(handle);

  function showPanel() {
    if (!panel) return;
    panel.classList.remove("panel-hidden");
    handle.classList.add("hidden");
    panelVisible = true;
  }

  function hidePanel() {
    if (!panel) return;
    panel.classList.add("panel-hidden");
    handle.classList.remove("hidden");
    panelVisible = false;
  }

  // collapse inside content when ☰ clicked
  if (btnMenu && panelBody) {
    btnMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      panelBody.classList.toggle("collapsed");
    });
  }

  // click outside closes panel
  if (panel) {
    document.addEventListener("click", (e) => {
      const clickedInsidePanel = panel.contains(e.target);
      const clickedHandle      = e.target === handle;
      if (!clickedInsidePanel && !clickedHandle && panelVisible) {
        hidePanel();
      }
    });

    // keep panel open while using it
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // reopen button
    handle.addEventListener("click", (e) => {
      e.stopPropagation();
      showPanel();
    });

    // "p" to reopen if hidden
    document.addEventListener("keydown", (e) => {
      if (e.key && e.key.toLowerCase() === "p" && !panelVisible) {
        showPanel();
      }
    });
  }
  // start loading all audio
  preloadSounds();
});

