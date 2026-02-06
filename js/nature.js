// ==============================
// Nature Sound
// ==============================

const API_KEY = "YGNE8y4WuAWOaQT6D18K1SJ1RM1ab8RzR2LefHLJ";

/* ------------------------------
   Sound + Scene 
-------------------------------- */
const soundIDs = {
  // Water & Forest
  waterfall: 365920,
  birds_forest: 507264,
  wind_valley: 463553,
  
  // Camp & Night
  campfire: 637523,
  crickets: 530759,
  nightwind: 646315,
  
  // Ocean & Beach
  waves: 410612,
  seagulls: 712282,
  seabreeze: 721360,
  
  // Rain
  rain: 193336,
  raindrops: 440489,
  soft_rainy: 554158,
  
  // Space
  soft_space: 76420,
  space_wind: 38969,
  wind_space: 233995,
  
  // Tropical
  frog: 581647,
  soft_tropical: 451945,
  
  // Winter Cabin
  wind_winter: 400992,
  soft_cabin: 663270,
  
  // Meadow
  birds_meadow: 425378,
  wind_field: 463554,  
  soft_meadow: 658514,
  
  // Autumn
  birds_autumn: 659990,
  wind_autumn: 669871,
  soft_autumn: 651241
};

const scenePresets = {
  "scene-waterfall": ["waterfall", "birds_forest", "wind_valley"],
  "scene-nightcamp": ["campfire", "crickets", "nightwind"],
  "scene-ocean": ["waves", "seagulls", "seabreeze"],
  "scene-rainy": ["rain", "raindrops", "soft_rainy"],
  "scene-space": ["soft_space", "space_wind", "wind_space"],
  "scene-tropical": ["seabreeze", "frog", "soft_tropical"],
  "scene-cabin": ["campfire", "wind_winter", "soft_cabin"],
  "scene-meadow": ["birds_meadow", "wind_field", "soft_meadow"],
  "scene-autumn": ["birds_autumn", "wind_autumn", "soft_autumn"]
};

const audioObjects = {};
const loadingPromises = {};
const soundStatus = {};
const FADE_TIME = 800;

let currentScene = "scene-waterfall";
let previousScene = null;
let isLivelyMode = false;
let sleepTimer = null;
let isPanelMinimized = false;
let sleepSceneAutoSelected = false;
let isTimerPaused = false;
let timeLeft = 0;
let savedVolumes = {};
let userInteracted = false;
let isSleepTimerActive = false;
let sleepTimerVolume = 0.3;

// Time-based scene recommendations
const timeBasedScenes = {
  morning: ["scene-waterfall", "scene-meadow", "scene-ocean"],
  lunch: ["scene-cabin", "scene-rainy", "scene-autumn"],
  night: ["scene-nightcamp", "scene-space", "scene-rainy"]
};

/* ------------------------------
   Fade Helpers
-------------------------------- */
function fadeTo(audio, target, duration = FADE_TIME) {
  if (!audio) return;

  if (Math.abs(audio.volume - target) < 0.01) {
    audio.volume = target;
    if (target === 0 && !audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
    return;
  }
  
  const step = 50;
  const steps = duration / step;
  const delta = (target - audio.volume) / steps;
  let count = 0;

  const t = setInterval(() => {
    if (!audio) {
      clearInterval(t);
      return;
    }
    audio.volume = Math.max(0, Math.min(1, audio.volume + delta));
    if (++count >= steps) {
      clearInterval(t);
      audio.volume = target;
      if (target === 0 && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }
  }, step);
}

/* ------------------------------
   Sound Loading 
-------------------------------- */
async function loadSound(key) {
  if (audioObjects[key] && audioObjects[key].src) {
    return audioObjects[key];
  }
  
  if (loadingPromises[key]) {
    return loadingPromises[key];
  }

  loadingPromises[key] = (async () => {
    try {
      console.log(`Loading sound: ${key} (ID: ${soundIDs[key]})`);
      
      let previewUrl = null;
      
      try {
        const response = await fetch(
          `https://freesound.org/apiv2/sounds/${soundIDs[key]}/?token=${API_KEY}`,
          { 
            signal: AbortSignal.timeout(10000),
            mode: 'cors'
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.previews && data.previews["preview-hq-mp3"]) {
            previewUrl = data.previews["preview-hq-mp3"];
            console.log(`Got preview URL for ${key}: ${previewUrl.substring(0, 50)}...`);
          }
        }
      } catch (apiError) {
        console.log(`API error for ${key}, using fallback`);
        previewUrl = null;
      }
      
      if (previewUrl) {
        const audio = new Audio();
        audio.src = previewUrl;
        audio.loop = true;
        audio.volume = 0;
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        
        return new Promise((resolve) => {
          const onCanPlay = () => {
            console.log(`Sound ${key} loaded successfully`);
            audio.removeEventListener('canplaythrough', onCanPlay);
            audio.removeEventListener('error', onError);
            audioObjects[key] = audio;
            soundStatus[key] = 'loaded';
            resolve(audio);
          };
          
          const onError = (err) => {
            console.log(`Error loading sound ${key}, using silent audio`);
            audio.removeEventListener('canplaythrough', onCanPlay);
            audio.removeEventListener('error', onError);
            const silentAudio = new Audio();
            silentAudio.loop = true;
            silentAudio.volume = 0;
            audioObjects[key] = silentAudio;
            soundStatus[key] = 'silent';
            resolve(silentAudio);
          };
          
          audio.addEventListener('canplaythrough', onCanPlay);
          audio.addEventListener('error', onError);
          audio.load();
        });
      } else {
        console.log(`No preview URL for ${key}, using silent audio`);
        const silentAudio = new Audio();
        silentAudio.loop = true;
        silentAudio.volume = 0;
        audioObjects[key] = silentAudio;
        soundStatus[key] = 'silent';
        return silentAudio;
      }
      
    } catch (error) {
      console.error(`Critical error loading sound ${key}:`, error);
      const silentAudio = new Audio();
      silentAudio.loop = true;
      silentAudio.volume = 0;
      audioObjects[key] = silentAudio;
      soundStatus[key] = 'silent';
      return silentAudio;
    }
  })();

  return loadingPromises[key];
}

function stopAllSounds() {
  console.log("Stopping all sounds");
  Object.keys(audioObjects).forEach(key => {
    const audio = audioObjects[key];
    if (audio && typeof audio.volume !== 'undefined') {
      fadeTo(audio, 0, 300);
    }
  });
}

function stopAllSoundsImmediately() {
  console.log("Stopping all sounds immediately");
  Object.keys(audioObjects).forEach(key => {
    const audio = audioObjects[key];
    if (audio) {
      audio.volume = 0;
      audio.pause();
      audio.currentTime = 0;
    }
  });
}

/* ------------------------------
   Scene 
-------------------------------- */
function switchScene(sceneId, autoPlay = false) {
  console.log(`Switching scene: ${previousScene} -> ${sceneId}, autoPlay: ${autoPlay}, isSleepTimerActive: ${isSleepTimerActive}`);
  
  previousScene = currentScene;
  
  // Hide all scenes
  document.querySelectorAll('.scene').forEach(scene => {
    scene.classList.remove('active');
  });
  
  // Show target scene
  const targetScene = document.getElementById(sceneId);
  if (targetScene) {
    targetScene.classList.add('active');
    currentScene = sceneId;
    
    // Update volume section 
    document.querySelectorAll('.volume-section').forEach(section => {
      section.style.display = 'none';
    });
    
    const sceneKey = sceneId.split('-')[1];
    const volumeSection = document.getElementById(`volume-${sceneKey}`);
    if (volumeSection) {
      volumeSection.style.display = 'grid';
    }
    
    // Stop sounds
    if (previousScene && previousScene !== sceneId) {
      const previousSounds = scenePresets[previousScene];
      if (previousSounds) {
        console.log(`Fading out previous scene: ${previousScene}`);
        previousSounds.forEach(soundKey => {
          if (audioObjects[soundKey]) {
            fadeTo(audioObjects[soundKey], 0, 500);
          }
        });
      }
    }
    
    // Load and play sounds for new scene
    const sounds = scenePresets[sceneId];
    
    if (sounds && sounds.length > 0) {
      console.log(`Loading sounds for ${sceneId}:`, sounds);
      
      const loadPromises = sounds.map(soundKey => loadSound(soundKey));
      
      Promise.all(loadPromises).then(loadedAudios => {
        console.log(`All sounds loaded for ${sceneId}, starting playback`);
        
        loadedAudios.forEach((audio, index) => {
          const soundKey = sounds[index];
          if (audio) {
            // If sleep timer is active, use sleep timer volume
            if (isSleepTimerActive) {
              console.log(`Sleep timer active: setting ${soundKey} to volume ${sleepTimerVolume}`);
              audio.volume = sleepTimerVolume;
              
              if (audio.paused) {
                audio.play().then(() => {
                  console.log(`Sleep timer sound ${soundKey} started`);
                }).catch((error) => {
                  console.log(`Autoplay blocked for sleep timer ${soundKey}`);
                });
              }
            }
            else if (isLivelyMode || autoPlay) {
              console.log(`Starting ${soundKey} at volume 0.3`);
              audio.volume = 0.3;
              
              if (audio.paused) {
                audio.play().then(() => {
                  console.log(`${soundKey} started playing`);
                }).catch((error) => {
                  console.log(`Autoplay blocked for ${soundKey}, volume set to 0.3`);
                });
              }
            }
            else {
              console.log(`Stable mode: ${soundKey} volume 0`);
              audio.volume = 0;
            }
          }
        });
        
        // Update sliders
        updateSlidersForScene(sceneId);
        
      }).catch((error) => {
        console.error(`Error loading sounds for ${sceneId}:`, error);
        updateSlidersForScene(sceneId);
      });
    } else {
      console.error(`No sounds defined for scene ${sceneId}`);
    }
  } else {
    console.error(`Scene element not found: ${sceneId}`);
  }
}

function updateSlidersForScene(sceneId) {
  const sounds = scenePresets[sceneId];
  if (!sounds) return;
  
  sounds.forEach(soundKey => {
    const slider = document.querySelector(`input[data-sound="${soundKey}"]`);
    const audio = audioObjects[soundKey];
    
    if (slider && audio) {
      slider.value = audio.volume || 0;
    }
  });
}

function toggleLivelyMode() {
  isLivelyMode = !isLivelyMode;
  document.body.classList.toggle('mode-lively', isLivelyMode);
  const btn = document.getElementById('toggle-mood');
  if (btn) {
    btn.textContent = isLivelyMode ? '🌙 動きを止める' : '🌙 動きをつける';
  }
  
  console.log(`Lively mode: ${isLivelyMode}, isSleepTimerActive: ${isSleepTimerActive}`);

  if (isSleepTimerActive) {
    console.log("Sleep timer active, not changing sounds");
    return;
  }
  
  if (isLivelyMode) {
    const sounds = scenePresets[currentScene];
    if (sounds) {
      console.log(`Starting sounds for ${currentScene}`);
      sounds.forEach(soundKey => {
        if (audioObjects[soundKey]) {
          console.log(`Starting ${soundKey}`);
          audioObjects[soundKey].volume = 0.3;
          if (audioObjects[soundKey].paused) {
            audioObjects[soundKey].play().then(() => {
              console.log(`${soundKey} started`);
            }).catch((error) => {
              console.log(`Autoplay blocked for ${soundKey}`);
            });
          }
        }
      });
    }
  } else {
    // Stop ALL sounds 
    console.log(`Stopping all sounds`);
    stopAllSounds();
  }
  
  updateSlidersForScene(currentScene);
}

/* ------------------------------
   Time of Day Functions
-------------------------------- */
function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'lunch';
  return 'night';
}

function getRecommendedScene() {
  const timeOfDay = getTimeOfDay();
  const scenes = timeBasedScenes[timeOfDay];
  const randomScene = scenes[Math.floor(Math.random() * scenes.length)];
  console.log(`Time of day: ${timeOfDay}, recommended scene: ${randomScene}`);
  return randomScene;
}

function updateWeatherSuggestion() {
  const timeOfDay = getTimeOfDay();
  const weatherIcon = document.getElementById('weather-icon');
  const weatherText = document.getElementById('weather-text');
  
  let icon = '🌙';
  let text = '夜にぴったりの音をおすすめ';
  
  if (timeOfDay === 'morning') {
    icon = '🌅';
    text = '朝にぴったりの音をおすすめ';
  } else if (timeOfDay === 'lunch') {
    icon = '☀️';
    text = '昼間にぴったりの音をおすすめ';
  }
  
  if (weatherIcon) weatherIcon.textContent = icon;
  if (weatherText) weatherText.textContent = text;
}

/* ------------------------------
   Timer Functions
-------------------------------- */
function startTimer(minutes, sceneId = null) {
  console.log(`Starting sleep timer for ${minutes} minutes, scene: ${sceneId}`);
  
  clearSleepTimer();
  
  const timerCorner = document.getElementById('timer-corner');
  const countdownEl = document.getElementById('timer-countdown');
  const pauseBtn = document.getElementById('timer-pause-btn');
  
  if (!timerCorner || !countdownEl || !pauseBtn) return;
  
  timeLeft = minutes * 60;
  isTimerPaused = false;
  isSleepTimerActive = true;
  timerCorner.style.display = 'flex';
  pauseBtn.textContent = '⏸';
  
  // Get sleep vol from slider
  sleepTimerVolume = parseFloat(document.querySelector('.sleep-volume')?.value) || 0.3;
  console.log(`Sleep timer volume: ${sleepTimerVolume}`);
  
  // Save current vol
  savedVolumes = {};
  Object.keys(audioObjects).forEach(key => {
    if (audioObjects[key]) {
      savedVolumes[key] = audioObjects[key].volume || 0;
    }
  });
  
  // switch to selected scene
  if (sceneId) {
    console.log(`Sleep timer switching to scene: ${sceneId}`);
    
    // stop all sounds
    stopAllSoundsImmediately();
    
    setTimeout(() => {
      switchScene(sceneId, true);
   
      setTimeout(() => {
        const sounds = scenePresets[sceneId];
        if (sounds) {
          sounds.forEach(soundKey => {
            if (audioObjects[soundKey]) {
              console.log(`Setting sleep volume for ${soundKey}: ${sleepTimerVolume}`);
              audioObjects[soundKey].volume = sleepTimerVolume;
              
              if (audioObjects[soundKey].paused) {
                audioObjects[soundKey].play().catch(e => {
                  console.log(`Could not autoplay ${soundKey} for sleep timer`);
                });
              }
            }
          });
        }
      }, 300);
    }, 100);
  } else {
    console.log(`No scene specified, using current scene: ${currentScene}`);
    
    const sounds = scenePresets[currentScene];
    if (sounds) {
      sounds.forEach(soundKey => {
        if (audioObjects[soundKey]) {
          console.log(`Setting sleep volume for ${soundKey}: ${sleepTimerVolume}`);
          fadeTo(audioObjects[soundKey], sleepTimerVolume, 800);
          
          if (audioObjects[soundKey].paused) {
            audioObjects[soundKey].play().catch(e => {
              console.log(`Could not autoplay ${soundKey} for sleep timer`);
            });
          }
        }
      });
    }
  }
  
  // Start the countdown timer
  sleepTimer = setInterval(updateTimer, 1000);
  
  function updateTimer() {
    if (!isTimerPaused) {
      timeLeft--;
      if (timeLeft <= 0) {
        console.log("Sleep timer finished");
        clearSleepTimer();
        timerCorner.style.display = 'none';
        stopAllSounds();
        isSleepTimerActive = false;
        
        const timeOfDay = getTimeOfDay();
        showGoodnightMessage(timeOfDay);
        playJapaneseVoiceOver(timeOfDay);
        return;
      }
      
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      countdownEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }
}

function togglePauseTimer() {
  if (!sleepTimer) return;
  
  isTimerPaused = !isTimerPaused;
  const pauseBtn = document.getElementById('timer-pause-btn');
  
  if (pauseBtn) {
    pauseBtn.textContent = isTimerPaused ? '▶' : '⏸';
  }
  
  if (isTimerPaused) {
    console.log("Pausing sleep timer sounds");
    // Save current volumes
    savedVolumes = {};
    Object.keys(audioObjects).forEach(key => {
      if (audioObjects[key]) {
        savedVolumes[key] = audioObjects[key].volume || 0;
        fadeTo(audioObjects[key], 0, 500);
      }
    });
  } else {
    console.log("Resuming sleep timer sounds");
    // Restore volumes
    Object.keys(savedVolumes).forEach(key => {
      if (audioObjects[key] && savedVolumes[key] > 0) {
        if (audioObjects[key].paused) {
          audioObjects[key].play().then(() => {
            fadeTo(audioObjects[key], savedVolumes[key], 500);
          }).catch(() => {
            audioObjects[key].volume = savedVolumes[key];
          });
        } else {
          fadeTo(audioObjects[key], savedVolumes[key], 500);
        }
      }
    });
  }
}

function resetTimer() {
  console.log("Resetting sleep timer");
  clearSleepTimer();
  isSleepTimerActive = false;
  
  const timerCorner = document.getElementById('timer-corner');
  if (timerCorner) {
    timerCorner.style.display = 'none';
  }
  
  // Restore saved vol
  if (Object.keys(savedVolumes).length > 0) {
    Object.keys(savedVolumes).forEach(key => {
      if (audioObjects[key]) {
        fadeTo(audioObjects[key], savedVolumes[key], 500);
      }
    });
  }
}

function clearSleepTimer() {
  console.log("Clearing sleep timer");
  if (sleepTimer) {
    clearInterval(sleepTimer);
    sleepTimer = null;
  }
  isTimerPaused = false;
  isSleepTimerActive = false;
  
  const timerCorner = document.getElementById('timer-corner');
  if (timerCorner) {
    timerCorner.style.display = 'none';
  }
}

function showGoodnightMessage(timeOfDay = null) {
  const goodnightEl = document.getElementById('sleep-goodnight');
  if (goodnightEl) {
    
    let message = "おやすみなさい 🌙";
    if (timeOfDay === 'morning') {
      message = "おはようございます 🌅";
    } else if (timeOfDay === 'lunch') {
      message = "こんにちは ☀️";
    }
    
    goodnightEl.textContent = message;
    goodnightEl.classList.add('show');
    
    setTimeout(() => {
      goodnightEl.classList.remove('show');
    }, 4000);
  }
}

function playJapaneseVoiceOver(timeOfDay = null) {
  if (!timeOfDay) {
    timeOfDay = getTimeOfDay();
  }
  
  let message = "";
  
  switch(timeOfDay) {
    case 'morning':
      message = "おはようございます。気持ちの良い朝をお過ごしください。";
      break;
    case 'lunch':
      message = "こんにちは。心地よい昼下がりをお楽しみください。";
      break;
    case 'night':
      message = "おやすみなさい。ゆっくり休んでください。";
      break;
    default:
      message = "おやすみなさい。ゆっくり休んでください。";
  }
  
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance();
    utterance.text = message;
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    
    const voices = speechSynthesis.getVoices();
    const japaneseVoice = voices.find(voice => voice.lang === 'ja-JP' || voice.lang.startsWith('ja'));
    if (japaneseVoice) {
      utterance.voice = japaneseVoice;
    }
    
    try {
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.log("Voice synthesis error:", error);
    }
  }
}

/* ==============================
   DOM 
================================ */
window.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Content Loaded - Initializing nature sounds");
  
  // Track user interaction
  const enableAudio = () => {
    if (!userInteracted) {
      userInteracted = true;
      console.log("User interacted - audio enabled");
      
      if (isLivelyMode && !isSleepTimerActive) {
        const sounds = scenePresets[currentScene];
        if (sounds) {
          sounds.forEach(soundKey => {
            if (audioObjects[soundKey] && audioObjects[soundKey].paused) {
              audioObjects[soundKey].play().catch(e => {
                console.log(`Still can't play ${soundKey}:`, e);
              });
            }
          });
        }
      }
    }
  };
  
  // Listen for user interaction
  document.addEventListener('click', enableAudio);
  document.addEventListener('touchstart', enableAudio);
  document.addEventListener('keydown', enableAudio);

  // Suppress errors for API
  const originalConsoleError = console.error;
  console.error = function(...args) {
    if (args.some(arg => 
      typeof arg === 'string' && (
        arg.includes('freesound') || 
        arg.includes('CORS') || 
        arg.includes('Failed to fetch') ||
        arg.includes('504') ||
        arg.includes('Gateway Time-out') ||
        arg.includes('Access-Control-Allow-Origin')
      )
    )) {
      return;
    }
    originalConsoleError.apply(console, args);
  };

  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => {
      console.log("Speech synthesis voices loaded");
    };
  }

  // Create overlay for closing panel
  const overlay = document.createElement('div');
  overlay.className = 'panel-overlay';
  document.body.appendChild(overlay);

  /* ------------------------------
     Control Panel Toggle
  -------------------------------- */
  const controlPanel = document.getElementById('control-panel');
  const panelToggle = document.getElementById('panel-toggle');
  
  function togglePanel() {
    isPanelMinimized = !isPanelMinimized;
    if (controlPanel) {
      controlPanel.classList.toggle('minimized', isPanelMinimized);
    }
    document.body.classList.toggle('panel-open', !isPanelMinimized);
    
    if (panelToggle) {
      panelToggle.textContent = isPanelMinimized ? '☰' : '✕';
    }
  }
  
  if (panelToggle && controlPanel) {
    panelToggle.addEventListener('click', togglePanel);
  }
  
  overlay.addEventListener('click', () => {
    if (!isPanelMinimized) {
      togglePanel();
    }
  });
  
  document.addEventListener('click', (e) => {
    if (!isPanelMinimized && controlPanel && 
        !controlPanel.contains(e.target) && 
        e.target !== panelToggle &&
        window.innerWidth <= 768) {
      togglePanel();
    }
  });

  /* ------------------------------
     Mixer Toggle
  -------------------------------- */
  const mixerToggle = document.getElementById("mixer-toggle");
  const mixerPanel = document.getElementById("mixer-panel");

  if (mixerToggle && mixerPanel) {
    mixerToggle.addEventListener("click", () => {
      mixerPanel.classList.toggle("collapsed");
      mixerToggle.textContent =
        mixerPanel.classList.contains("collapsed")
          ? "🎚 ミキサーを開く"
          : "🎚 ミキサーを閉じる";
    });
  }

  /* ------------------------------
     Scene Navigation
  -------------------------------- */
  const prevBtn = document.getElementById('prev-scene');
  const nextBtn = document.getElementById('next-scene');
  const sceneIds = Object.keys(scenePresets);
  
  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      const currentIndex = sceneIds.indexOf(currentScene);
      const prevIndex = (currentIndex - 1 + sceneIds.length) % sceneIds.length;
      switchScene(sceneIds[prevIndex]);
    });
    
    nextBtn.addEventListener('click', () => {
      const currentIndex = sceneIds.indexOf(currentScene);
      const nextIndex = (currentIndex + 1) % sceneIds.length;
      switchScene(sceneIds[nextIndex]);
    });
  }

  /* ------------------------------
     Volume Sliders
  -------------------------------- */
  document.querySelectorAll('input[type="range"][data-sound]').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const soundKey = e.target.getAttribute('data-sound');
      const volume = parseFloat(e.target.value);
      
      if (audioObjects[soundKey]) {
        console.log(`Slider changed: ${soundKey} = ${volume}`);
        
        if (audioObjects[soundKey].paused && volume > 0) {
          audioObjects[soundKey].play().catch(() => {
            audioObjects[soundKey].volume = volume;
          });
        }
        
        audioObjects[soundKey].volume = volume;
        
        if (volume === 0) {
          setTimeout(() => {
            if (audioObjects[soundKey] && audioObjects[soundKey].volume === 0) {
              audioObjects[soundKey].pause();
              audioObjects[soundKey].currentTime = 0;
            }
          }, 100);
        }
      }
    });
  });

  /* ------------------------------
     Stop Button
  -------------------------------- */
  const stopBtn = document.getElementById('stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      console.log("Stop button clicked");
      stopAllSounds();
      if (isSleepTimerActive) {
        resetTimer();
      }
    });
  }

  /* ------------------------------
     Mood Toggle
  -------------------------------- */
  const moodToggle = document.getElementById('toggle-mood');
  if (moodToggle) {
    moodToggle.addEventListener('click', toggleLivelyMode);
  }

  /* ------------------------------
     Timer Pause/Reset Buttons
  -------------------------------- */
  const timerPauseBtn = document.getElementById('timer-pause-btn');
  const timerResetBtn = document.getElementById('timer-reset-btn');
  
  if (timerPauseBtn) {
    timerPauseBtn.addEventListener('click', togglePauseTimer);
  }
  
  if (timerResetBtn) {
    timerResetBtn.addEventListener('click', resetTimer);
  }

  /* ------------------------------
     Sleep Timer 
  -------------------------------- */
  const sleepTimerBtn = document.getElementById("sleep-timer-btn");
  const sleepTimerMode = document.getElementById("sleep-timer-mode");
  const sleepCancelBtn = document.getElementById("sleep-cancel-btn");
  const sleepStartBtn = document.getElementById("sleep-start-btn");
  const sleepVolumeSlider = document.querySelector('.sleep-volume');
  const sleepVolumeValue = document.querySelector('.volume-value');
  const previewImage = document.getElementById('preview-image');
  const previewTitle = document.getElementById('preview-title');
  const autoRadio = document.querySelector('input[value="auto"]');
  const sceneRadios = document.querySelectorAll('input[name="sleep-sound"]');

  updateWeatherSuggestion();

  function openSleepTimer() {
    console.log("Opening sleep timer modal");
    document.body.classList.add("sleep-lock");
    if (sleepTimerMode) sleepTimerMode.classList.add("active");
    
    if (autoRadio && autoRadio.checked) {
      const autoSceneId = getRecommendedScene();
      const sceneImg = document.querySelector(`input[value="${autoSceneId}"]`)?.getAttribute('data-img') || 'fire.jpg';
      const sceneName = document.querySelector(`input[value="${autoSceneId}"]`)?.getAttribute('data-title') || '自動選択';
      
      if (previewImage) previewImage.src = `img/${sceneImg}`;
      if (previewTitle) previewTitle.textContent = `${sceneName} (自動)`;
    }
    
    updateSleepVolumeDisplay();
    
    document.querySelectorAll('.sleep-option').forEach(option => {
      option.classList.remove('selected');
      if (option.getAttribute('data-minutes') === '30') {
        option.classList.add('selected');
        const customInput = document.getElementById('custom-minutes');
        if (customInput) customInput.value = 30;
      }
    });
  }

  function closeSleepTimer() {
    console.log("Closing sleep timer modal");
    document.body.classList.remove("sleep-lock");
    if (sleepTimerMode) sleepTimerMode.classList.remove("active");
  }

  if (sleepTimerBtn) sleepTimerBtn.addEventListener("click", openSleepTimer);
  if (sleepCancelBtn) sleepCancelBtn.addEventListener("click", closeSleepTimer);

  if (sleepTimerMode) {
    sleepTimerMode.addEventListener("click", e => {
      if (e.target === sleepTimerMode) closeSleepTimer();
    });
  }

  if (sceneRadios) {
    sceneRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        console.log(`Sleep timer scene changed to: ${radio.value}`);
        if (radio.value === 'auto') {
          const autoSceneId = getRecommendedScene();
          const sceneImg = document.querySelector(`input[value="${autoSceneId}"]`)?.getAttribute('data-img') || 'fire.jpg';
          const sceneName = document.querySelector(`input[value="${autoSceneId}"]`)?.getAttribute('data-title') || '自動選択';
          
          if (previewImage) previewImage.src = `img/${sceneImg}`;
          if (previewTitle) previewTitle.textContent = `${sceneName} (自動)`;
          sleepSceneAutoSelected = true;
        } else {
          const sceneImg = radio.getAttribute('data-img') || 'fire.jpg';
          const sceneName = radio.getAttribute('data-title') || 'シーン';
          
          if (previewImage) previewImage.src = `img/${sceneImg}`;
          if (previewTitle) previewTitle.textContent = sceneName;
          sleepSceneAutoSelected = false;
        }
      });
    });
  }

  document.querySelectorAll('.sleep-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.sleep-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      option.classList.add('selected');
      const minutes = option.getAttribute('data-minutes');
      const customInput = document.getElementById('custom-minutes');
      if (customInput) customInput.value = minutes;
    });
  });

  const customMinutesInput = document.getElementById('custom-minutes');
  if (customMinutesInput) {
    customMinutesInput.addEventListener('change', () => {
      let value = parseInt(customMinutesInput.value);
      if (isNaN(value)) {
        customMinutesInput.value = 30;
      } else if (value < 1) {
        customMinutesInput.value = 1;
      } else if (value > 240) {
        customMinutesInput.value = 240;
      }
      
      document.querySelectorAll('.sleep-option').forEach(option => {
        if (option.getAttribute('data-minutes') === value.toString()) {
          option.classList.add('selected');
        } else {
          option.classList.remove('selected');
        }
      });
    });
  }

  if (sleepVolumeSlider && sleepVolumeValue) {
    sleepVolumeSlider.addEventListener('input', () => {
      updateSleepVolumeDisplay();
    });
  }

  function updateSleepVolumeDisplay() {
    if (sleepVolumeSlider && sleepVolumeValue) {
      const volume = parseFloat(sleepVolumeSlider.value);
      sleepVolumeValue.textContent = `${Math.round(volume * 100)}%`;
    }
  }

  if (sleepStartBtn) {
    sleepStartBtn.addEventListener('click', () => {
      const minutes = parseInt(document.getElementById('custom-minutes').value) || 30;
      const volume = parseFloat(sleepVolumeSlider?.value) || 0.3;
      
      if (minutes < 1) {
        alert('最低1分以上に設定してください');
        document.getElementById('custom-minutes').value = 1;
        return;
      }
      
      let selectedSceneId = null;
      const selectedRadio = document.querySelector('input[name="sleep-sound"]:checked');
      if (selectedRadio) {
        if (selectedRadio.value === 'auto') {
          selectedSceneId = getRecommendedScene();
          sleepSceneAutoSelected = true;
          console.log(`Auto-selected scene for sleep timer: ${selectedSceneId}`);
        } else {
          selectedSceneId = selectedRadio.value;
          sleepSceneAutoSelected = false;
          console.log(`Manually selected scene for sleep timer: ${selectedSceneId}`);
        }
      }
      
      console.log(`Starting sleep timer: ${minutes} minutes, scene: ${selectedSceneId}, volume: ${volume}`);
      
      // Start the timer with the selected scene
      startTimer(minutes, selectedSceneId);
      closeSleepTimer();
    });
  }

  /* ------------------------------
     Theme 
  -------------------------------- */
  const THEME_KEY = "app-theme";

  function applyTheme(theme) {
    document.body.classList.toggle("theme-cyber", theme === "cyber");
    localStorage.setItem(THEME_KEY, theme);
    const btn = document.getElementById("theme-toggle");
    if (btn) btn.textContent = theme === "cyber" ? "⚡ サイバー" : "🌿 テーマ";
  }

  function toggleTheme() {
    applyTheme(
      document.body.classList.contains("theme-cyber") ? "default" : "cyber"
    );
  }

  applyTheme(localStorage.getItem(THEME_KEY) || "default");
  const themeToggleBtn = document.getElementById("theme-toggle");
  if (themeToggleBtn) themeToggleBtn.addEventListener("click", toggleTheme);

  /* ------------------------------
    Zone Click Handling
  -------------------------------- */
  document.querySelectorAll('.zone').forEach(zone => {
    zone.addEventListener('click', (e) => {
      const soundKey = e.target.getAttribute('data-sound');
      console.log(`Zone clicked: ${soundKey}`);
      
      if (soundKey && audioObjects[soundKey]) {
        if (audioObjects[soundKey].paused || audioObjects[soundKey].volume === 0) {
          audioObjects[soundKey].play().then(() => {
            fadeTo(audioObjects[soundKey], 0.3, 500);
            
            const slider = document.querySelector(`input[data-sound="${soundKey}"]`);
            if (slider) {
              slider.value = 0.3;
            }
          }).catch(() => {
            audioObjects[soundKey].volume = 0.3;
            const slider = document.querySelector(`input[data-sound="${soundKey}"]`);
            if (slider) {
              slider.value = 0.3;
            }
          });
        } else {
          fadeTo(audioObjects[soundKey], 0, 500);
          
          const slider = document.querySelector(`input[data-sound="${soundKey}"]`);
          if (slider) {
            slider.value = 0;
          }
        }
      }
    });
  });

  isLivelyMode = false;
  console.log("Initial scene switch to:", currentScene);
  switchScene(currentScene, false);

  // Pre-load all sounds in background
  setTimeout(() => {
    console.log("Pre-loading all sounds...");
    Object.keys(soundIDs).forEach(key => {
      loadSound(key).catch((error) => {
        console.log(`Error pre-loading ${key}:`, error);
      });
    });
  }, 1000);
  
  console.log("sounds initialization complete");
});