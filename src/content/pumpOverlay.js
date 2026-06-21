(function bootPumpOverlay() {
  "use strict";

  const HOST_ID = "pump-extension-overlay-root";
  const CSS_PATH = "src/content/pumpOverlay.css";
  const LAUNCH_SOUND_PATH = "assets/mountains.mp3";
  const FINAL_SOUND_PROGRESS = 0.95;
  const SOUND_STOP_AT_SECONDS = (3 * 60) + 28;
  const BASE_OVERLAY_DIAMETER = 286;
  const MIN_OVERLAY_DIAMETER = 180;
  const OVERLAY_EDGE_GUTTER = 16;
  const OVERLAY_FINAL_OVERSCAN = 36;
  const BUBBLE_MIN_SPEED_PX_PER_SECOND = 115;
  const BUBBLE_MAX_SPEED_PX_PER_SECOND = 190;
  const BUBBLE_MAX_MOTION_STEP_MS = 80;
  const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
  const AUTO_CLOSE_DELAY_MS = 450;
  const EXIT_FALLBACK_URL = "about:blank";
  const SESSION_STATE_KEY = "pump.overlay.session.v1";
  const SESSION_LAUNCH_COUNTER_KEY = "pump.overlay.launchCounter.v1";
  const SESSION_STATE_VERSION = 4;
  const SESSION_RESUME_MAX_AGE_MS = 2 * 60 * 1000;
  const SOUND_LOOP_SEGMENTS = [
    { id: "opening", minProgress: 0, start: 0, end: 10 },
    { id: "first-pulse", minProgress: 0.15, start: 10, end: 32 },
    { id: "quiet-reset", minProgress: 0.3, start: 32, end: 81 },
    { id: "build", minProgress: 0.45, start: 81, end: 108.5 },
    { id: "takeoff", minProgress: 0.6, start: 108.5, end: 135 },
    { id: "impact", minProgress: 0.72, start: 135, end: 151 },
    { id: "climax", minProgress: 0.84, start: 151, end: 190 }
  ];
  const GIF_TONE_CLASSES = ["gif-tone-light", "gif-tone-dark", "gif-tone-unknown"];
  const GIF_TONE_SAMPLE_SIZE = 28;
  const GIF_TONE_SAMPLE_TIMEOUT_MS = 2500;
  const GIF_TONE_LIGHT_THRESHOLD = 145;
  const DEFAULT_PROGRESS_GRADIENT = "linear-gradient(90deg, #13c2b3, #ffe45e 45%, #ff4fa3 100%)";
  const GIF_PROGRESS_FALLBACK_GRADIENT = "linear-gradient(90deg, rgba(255,255,255,.18), rgba(255,255,255,.62) 50%, rgba(255,255,255,.2)), var(--pump-background-gif)";
  const FALLBACK_CSS = `
    .pump-size { width: 100%; height: 100%; font-family: system-ui, sans-serif; pointer-events: none; }
    .pump-card { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 50%; background: #fff8c7; color: #211a32; box-shadow: 0 18px 36px rgba(0,0,0,.24); padding: var(--pump-card-padding, 12px); pointer-events: auto; }
    .pump-card.has-background-gif { background-image: var(--pump-background-gif); background-position: center; background-size: cover; }
    .pump-card.has-background-gif { color: #fff; }
    .pump-card.has-background-gif::before { position: absolute; inset: 0; background: rgba(0,0,0,.48); content: ""; }
    .pump-stack, .pump-actions { display: flex; align-items: center; }
    .pump-stack { flex-direction: column; justify-content: center; gap: var(--pump-content-gap, 8px); width: min(var(--pump-stack-width, 180px), calc(100vw - 28px)); max-width: calc(var(--pump-bubble-diameter, 286px) * .74); }
    .pump-card.has-background-gif .pump-time, .pump-card.has-background-gif .pump-message { background: rgba(0,0,0,.58); color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.72); }
    .pump-actions { justify-content: center; width: min(var(--pump-close-width, 148px), 100%); }
    .pump-close-button { width: 100%; border: 0; border-radius: 999px; background: #fff; padding: 7px 14px; cursor: pointer; font: 800 12px system-ui, sans-serif; white-space: nowrap; }
    .pump-card.has-background-gif .pump-close-button { background: rgba(0,0,0,.68); color: #fff; }
    .pump-elapsed { font-size: 25px; font-weight: 900; }
    .pump-progress { position: relative; height: 20px; overflow: hidden; border-radius: 999px; background: rgba(0,0,0,.12); }
    .pump-progress-fill { height: 100%; background: var(--pump-progress-gradient, ${DEFAULT_PROGRESS_GRADIENT}); background-position: var(--pump-progress-background-position, center); background-size: var(--pump-progress-background-size, 100% 100%); }
    .pump-progress-percent { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font: 900 11px system-ui, sans-serif; text-shadow: 0 1px 4px rgba(0,0,0,.8); }
  `;

  const MESSAGE_BUCKETS = {
    chill: [
      "Just vibing.",
      "The pump is sleeping.",
      "Tiny timer, tiny problems.",
      "No panic. Only pixels."
    ],
    warming: [
      "The pump has begun.",
      "Warming up the goblin.",
      "Time is doing push-ups.",
      "Getting mildly swole."
    ],
    bulking: [
      "The timer is bulking.",
      "Okay, we are pumping now.",
      "The internet snack is getting spicy.",
      "Halfway to maximum balloon."
    ],
    goofy: [
      "Almost fully pumped.",
      "This timer has entered beast mode.",
      "The goblin is pacing.",
      "You are approaching peak pump."
    ],
    dramatic: [
      "Extremely pumped behavior detected.",
      "The timer is enormous emotionally.",
      "Final pump stretch.",
      "The pixels are sweating."
    ],
    done: [
      "Time's up.",
      "Go drink water. The internet will survive.",
      "Maximum pump achieved.",
      "The goblin recommends touching grass.",
      "You did it. Or maybe the website did you."
    ]
  };

  if (window.__pumpExtensionBooted) {
    return;
  }

  window.__pumpExtensionBooted = true;

  if (!globalThis.PumpUrl || !globalThis.PumpStorage || !window.location.hostname) {
    return;
  }

  const state = {
    activeController: null,
    activeFingerprint: "",
    lastHref: window.location.href,
    cssPromise: null,
    storageCleanup: null,
    soundCleanup: null,
    visualCleanup: null,
    soundSettings: null,
    visualSettings: null,
    currentAudio: null,
    currentAudioSource: "",
    currentSoundSegment: null,
    navigationInterval: 0
  };

  let randomSeed = 0;
  let randomCounter = 0;

  function getEntropySeed() {
    randomCounter += 1;

    let entropy = (Math.floor(Math.random() * 0x100000000) ^ Date.now()) >>> 0;

    try {
      if (globalThis.performance && typeof performance.now === "function") {
        entropy ^= Math.floor(performance.now() * 1000) >>> 0;
      }
    } catch (_error) {
      // Some pages restrict performance APIs; the other entropy sources are enough.
    }

    try {
      if (globalThis.crypto && typeof crypto.getRandomValues === "function") {
        const values = new Uint32Array(1);
        crypto.getRandomValues(values);
        entropy ^= values[0] >>> 0;
      }
    } catch (_error) {
      // Keep Math.random/time entropy if the page blocks crypto access.
    }

    return (entropy ^ Math.imul(randomCounter, 0x9e3779b9)) >>> 0;
  }

  function nextSeededRandom(entropy) {
    randomSeed = (randomSeed + 0x6d2b79f5 + entropy) >>> 0;

    let value = randomSeed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  }

  function randomUnit() {
    return nextSeededRandom(getEntropySeed());
  }

  function randomItem(items) {
    return items[Math.floor(randomUnit() * items.length)];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function interpolate(start, end, progress) {
    return start + ((end - start) * progress);
  }

  function randomBetween(min, max) {
    return min + (randomUnit() * (max - min));
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia(REDUCED_MOTION_QUERY).matches);
    } catch (_error) {
      return false;
    }
  }

  function getSessionStore() {
    try {
      return window.sessionStorage || null;
    } catch (_error) {
      return null;
    }
  }

  function nextOverlayLaunchIndex() {
    const store = getSessionStore();
    const fallbackSeed = Math.max(0, Math.floor(Date.now() + (randomUnit() * 1000)));

    if (!store) {
      return fallbackSeed;
    }

    try {
      const previousValue = Number(store.getItem(SESSION_LAUNCH_COUNTER_KEY));
      const nextValue = Number.isFinite(previousValue)
        ? previousValue + 1
        : fallbackSeed;

      store.setItem(SESSION_LAUNCH_COUNTER_KEY, String(nextValue));
      return nextValue;
    } catch (_error) {
      return fallbackSeed;
    }
  }

  async function getFreshOverlayLaunchIndex() {
    try {
      if (globalThis.PumpStorage && typeof PumpStorage.nextOverlayLaunchIndex === "function") {
        const launchIndex = Number(await PumpStorage.nextOverlayLaunchIndex());

        if (Number.isFinite(launchIndex)) {
          return launchIndex;
        }
      }
    } catch (_error) {
      // Fall back to a local best-effort counter if extension storage is unavailable.
    }

    return nextOverlayLaunchIndex();
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.floor(totalMinutes / 60);
    const pad = (value) => String(value).padStart(2, "0");

    if (hours > 0) {
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    }

    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function bucketForProgress(progress) {
    if (progress >= 1) {
      return "done";
    }

    if (progress >= 0.9) {
      return "dramatic";
    }

    if (progress >= 0.75) {
      return "goofy";
    }

    if (progress >= 0.5) {
      return "bulking";
    }

    if (progress >= 0.25) {
      return "warming";
    }

    return "chill";
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function getWebsiteDisplayName(rule) {
    return PumpUrl.stripWww(rule && rule.hostname) || PumpUrl.stripWww(window.location.hostname) || "this website";
  }

  function cssUrl(value) {
    return `url("${String(value || "").replace(/["\\\n\r\f]/g, "\\$&")}")`;
  }

  function applyProgressGradient(card, gradient, size = "100% 100%", position = "center") {
    card.style.setProperty("--pump-progress-gradient", gradient || DEFAULT_PROGRESS_GRADIENT);
    card.style.setProperty("--pump-progress-background-size", size);
    card.style.setProperty("--pump-progress-background-position", position);
  }

  function clearProgressGradient(card) {
    card.style.removeProperty("--pump-progress-gradient");
    card.style.removeProperty("--pump-progress-background-size");
    card.style.removeProperty("--pump-progress-background-position");
  }

  function applyGifTone(card, tone) {
    GIF_TONE_CLASSES.forEach((className) => card.classList.remove(className));
    card.classList.add(`gif-tone-${tone || "unknown"}`);
  }

  function clearGifTone(card) {
    GIF_TONE_CLASSES.forEach((className) => card.classList.remove(className));
  }

  function resolveGifToneFromPixels(pixels) {
    let luminanceTotal = 0;
    let sampleCount = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;

      if (alpha <= 0.05) {
        continue;
      }

      const red = (pixels[index] * alpha) + (255 * (1 - alpha));
      const green = (pixels[index + 1] * alpha) + (255 * (1 - alpha));
      const blue = (pixels[index + 2] * alpha) + (255 * (1 - alpha));
      luminanceTotal += (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
      sampleCount += 1;
    }

    if (!sampleCount) {
      return "unknown";
    }

    return luminanceTotal / sampleCount >= GIF_TONE_LIGHT_THRESHOLD ? "light" : "dark";
  }

  function channelToHex(value) {
    return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
  }

  function colorToHex(color) {
    return `#${channelToHex(color.red)}${channelToHex(color.green)}${channelToHex(color.blue)}`;
  }

  function getVisiblePixelColors(pixels) {
    const colors = [];

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;

      if (alpha <= 0.05) {
        continue;
      }

      const red = (pixels[index] * alpha) + (255 * (1 - alpha));
      const green = (pixels[index + 1] * alpha) + (255 * (1 - alpha));
      const blue = (pixels[index + 2] * alpha) + (255 * (1 - alpha));
      const luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);

      colors.push({ red, green, blue, luminance });
    }

    return colors.sort((a, b) => a.luminance - b.luminance);
  }

  function colorAtLuminanceRank(colors, rank) {
    if (!colors.length) {
      return null;
    }

    return colors[Math.round(clamp(rank, 0, 1) * (colors.length - 1))];
  }

  function resolveGifProgressGradientFromPixels(pixels) {
    const colors = getVisiblePixelColors(pixels);

    if (colors.length < 3) {
      return "";
    }

    const shadowColor = colorAtLuminanceRank(colors, 0.1);
    const midColor = colorAtLuminanceRank(colors, 0.56);
    const highlightColor = colorAtLuminanceRank(colors, 0.92);

    if (!shadowColor || !midColor || !highlightColor) {
      return "";
    }

    return `linear-gradient(90deg, ${colorToHex(shadowColor)} 0%, ${colorToHex(midColor)} 52%, ${colorToHex(highlightColor)} 100%)`;
  }

  function sampleBackgroundImage(imageUrl) {
    if (!imageUrl || typeof Image !== "function" || typeof document === "undefined") {
      return Promise.resolve({ tone: "unknown", progressGradient: "" });
    }

    return new Promise((resolve) => {
      const image = new Image();
      let settled = false;
      const settle = (sample) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timeoutId);
          resolve({
            tone: sample && sample.tone ? sample.tone : "unknown",
            progressGradient: sample && sample.progressGradient ? sample.progressGradient : ""
          });
        }
      };
      const timeoutId = window.setTimeout(() => settle(null), GIF_TONE_SAMPLE_TIMEOUT_MS);

      image.crossOrigin = "anonymous";

      try {
        image.referrerPolicy = "no-referrer";
      } catch (_error) {
        // Older Chromium builds ignore referrerPolicy on image elements.
      }

      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d", { willReadFrequently: true });

          if (!context) {
            settle("unknown");
            return;
          }

          canvas.width = GIF_TONE_SAMPLE_SIZE;
          canvas.height = GIF_TONE_SAMPLE_SIZE;
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

          settle({
            tone: resolveGifToneFromPixels(pixels),
            progressGradient: resolveGifProgressGradientFromPixels(pixels)
          });
        } catch (_error) {
          settle(null);
        }
      };
      image.onerror = () => settle(null);
      image.src = imageUrl;
    });
  }

  async function loadOverlayCss() {
    if (state.cssPromise) {
      return state.cssPromise;
    }

    state.cssPromise = fetch(chrome.runtime.getURL(CSS_PATH))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load Pump! overlay CSS: ${response.status}`);
        }

        return response.text();
      })
      .catch(() => FALLBACK_CSS);

    return state.cssPromise;
  }

  function findMatchingRule(rules) {
    const currentHostname = PumpUrl.normalizeHostname(window.location.hostname);

    if (!currentHostname) {
      return null;
    }

    return [...rules]
      .filter((rule) => rule.enabled)
      .sort((a, b) => b.hostname.length - a.hostname.length)
      .find((rule) => PumpUrl.hostnameMatchesRule(currentHostname, rule.hostname)) || null;
  }

  function fingerprintForRule(rule) {
    return rule ? `${rule.id}:${rule.hostname}:${rule.limitMinutes}:${rule.enabled}` : "";
  }

  function getAudioDuration(audio) {
    return Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : 0;
  }

  function getSoundEndTime(audio) {
    const duration = getAudioDuration(audio);
    return duration ? Math.min(duration, SOUND_STOP_AT_SECONDS) : SOUND_STOP_AT_SECONDS;
  }

  function clampAudioTime(audio, seconds) {
    const maxTime = Math.max(0, getSoundEndTime(audio) - 0.2);
    return Math.min(maxTime, Math.max(0, seconds));
  }

  function seekAudio(audio, seconds) {
    const nextTime = clampAudioTime(audio, seconds);

    try {
      audio.currentTime = nextTime;
    } catch (_error) {
      audio.addEventListener("loadedmetadata", () => {
        try {
          audio.currentTime = clampAudioTime(audio, seconds);
        } catch (_nestedError) {
          // Some pages or codecs reject early seeks; playback can continue naturally.
        }
      }, { once: true });
    }
  }

  function getLoopSegmentForProgress(progress) {
    return SOUND_LOOP_SEGMENTS.reduce((currentSegment, segment) => (
      progress >= segment.minProgress ? segment : currentSegment
    ), SOUND_LOOP_SEGMENTS[0]);
  }

  function getViewportSize() {
    const width = window.innerWidth || document.documentElement.clientWidth || BASE_OVERLAY_DIAMETER;
    const height = window.innerHeight || document.documentElement.clientHeight || BASE_OVERLAY_DIAMETER;

    return {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
  }

  function getCompactDiameter(viewport) {
    const availableDiameter = Math.min(viewport.width, viewport.height) - (OVERLAY_EDGE_GUTTER * 2);
    return Math.round(clamp(availableDiameter, MIN_OVERLAY_DIAMETER, BASE_OVERLAY_DIAMETER));
  }

  function getFullscreenCoverDiameter(viewport) {
    return Math.ceil(Math.hypot(viewport.width, viewport.height) + OVERLAY_FINAL_OVERSCAN);
  }

  function getOverlayDiameter(viewport, progress = 0) {
    const growth = clamp(progress, 0, 1);
    return Math.round(interpolate(
      getCompactDiameter(viewport),
      getFullscreenCoverDiameter(viewport),
      growth
    ));
  }

  function createRandomVelocity() {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(BUBBLE_MIN_SPEED_PX_PER_SECOND, BUBBLE_MAX_SPEED_PX_PER_SECOND);

    return {
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed
    };
  }

  function getUsableMotionBounds(viewport, progress = 0) {
    const diameter = getOverlayDiameter(viewport, progress);
    const radius = diameter / 2;
    const minX = radius + OVERLAY_EDGE_GUTTER;
    const maxX = viewport.width - radius - OVERLAY_EDGE_GUTTER;
    const minY = radius + OVERLAY_EDGE_GUTTER;
    const maxY = viewport.height - radius - OVERLAY_EDGE_GUTTER;

    return {
      minX,
      maxX,
      minY,
      maxY,
      centerX: maxX <= minX ? viewport.width / 2 : null,
      centerY: maxY <= minY ? viewport.height / 2 : null
    };
  }

  function clampMotionRatio(value, size, min, max, fallbackRatio = 0.5) {
    if (!Number.isFinite(value)) {
      return fallbackRatio;
    }

    if (max <= min) {
      return 0.5;
    }

    return clamp(value, min / size, max / size);
  }

  function randomPositionRatio(size, min, max) {
    if (max <= min) {
      return 0.5;
    }

    return (min + (layoutRandomUnit() * (max - min))) / size;
  }

  function layoutRandomUnit() {
    let value = Math.random();

    try {
      if (globalThis.performance && typeof performance.now === "function") {
        value += (performance.now() % 997) / 997;
      }
    } catch (_error) {
      // Keep Math.random and Date-based entropy.
    }

    value += (Date.now() % 991) / 991;
    return value % 1;
  }

  function getRandomStartZone(zoneCount, launchIndex) {
    return (launchIndex + Math.floor(layoutRandomUnit() * zoneCount)) % zoneCount;
  }

  function createRandomStartRatios(viewport, bounds, launchIndex) {
    const columns = 4;
    const rows = 3;
    const zoneCount = columns * rows;
    const zoneIndex = getRandomStartZone(zoneCount, launchIndex);
    const column = zoneIndex % columns;
    const row = Math.floor(zoneIndex / columns);
    const usableWidth = Math.max(0, bounds.maxX - bounds.minX);
    const usableHeight = Math.max(0, bounds.maxY - bounds.minY);
    const cellWidth = usableWidth / columns;
    const cellHeight = usableHeight / rows;
    const minX = bounds.minX + (cellWidth * column);
    const maxX = column === columns - 1 ? bounds.maxX : minX + cellWidth;
    const minY = bounds.minY + (cellHeight * row);
    const maxY = row === rows - 1 ? bounds.maxY : minY + cellHeight;

    return {
      startXRatio: randomPositionRatio(viewport.width, minX, maxX),
      startYRatio: randomPositionRatio(viewport.height, minY, maxY),
      zoneIndex
    };
  }

  function getUsefulVelocity(layout) {
    const velocityX = Number(layout && layout.velocityX);
    const velocityY = Number(layout && layout.velocityY);
    const speed = Math.hypot(velocityX, velocityY);

    if (!Number.isFinite(speed) || speed < BUBBLE_MIN_SPEED_PX_PER_SECOND * 0.8) {
      return createRandomVelocity();
    }

    if (speed > BUBBLE_MAX_SPEED_PX_PER_SECOND) {
      const scale = BUBBLE_MAX_SPEED_PX_PER_SECOND / speed;
      return {
        velocityX: velocityX * scale,
        velocityY: velocityY * scale
      };
    }

    return {
      velocityX,
      velocityY
    };
  }

  function normalizeOverlayLayout(layout) {
    const viewport = getViewportSize();
    const bounds = getUsableMotionBounds(viewport, 0);
    const rawStartXRatio = Number(layout && layout.startXRatio);
    const rawStartYRatio = Number(layout && layout.startYRatio);
    const rawMotionXRatio = Number(layout && layout.motionXRatio);
    const rawMotionYRatio = Number(layout && layout.motionYRatio);
    const rawLaunchIndex = Number(layout && layout.launchIndex);
    const rawZoneIndex = Number(layout && layout.zoneIndex);
    const baseXRatio = Number.isFinite(rawStartXRatio) ? rawStartXRatio : rawMotionXRatio;
    const baseYRatio = Number.isFinite(rawStartYRatio) ? rawStartYRatio : rawMotionYRatio;

    if (!Number.isFinite(baseXRatio) || !Number.isFinite(baseYRatio)) {
      return null;
    }

    const velocity = getUsefulVelocity(layout);
    const startXRatio = clampMotionRatio(baseXRatio, viewport.width, bounds.minX, bounds.maxX);
    const startYRatio = clampMotionRatio(baseYRatio, viewport.height, bounds.minY, bounds.maxY);

    return {
      startXRatio,
      startYRatio,
      motionXRatio: Number.isFinite(rawMotionXRatio)
        ? clampMotionRatio(rawMotionXRatio, viewport.width, bounds.minX, bounds.maxX, startXRatio)
        : startXRatio,
      motionYRatio: Number.isFinite(rawMotionYRatio)
        ? clampMotionRatio(rawMotionYRatio, viewport.height, bounds.minY, bounds.maxY, startYRatio)
        : startYRatio,
      velocityX: velocity.velocityX,
      velocityY: velocity.velocityY,
      launchIndex: Number.isFinite(rawLaunchIndex) ? rawLaunchIndex : null,
      zoneIndex: Number.isFinite(rawZoneIndex) ? rawZoneIndex : null
    };
  }

  function createOverlayLayout(savedLayout, launchIndex) {
    const normalizedLayout = normalizeOverlayLayout(savedLayout);

    if (normalizedLayout) {
      return normalizedLayout;
    }

    const viewport = getViewportSize();
    const bounds = getUsableMotionBounds(viewport, 0);
    const usefulLaunchIndex = Number.isFinite(Number(launchIndex))
      ? Number(launchIndex)
      : nextOverlayLaunchIndex();
    const { startXRatio, startYRatio, zoneIndex } = createRandomStartRatios(viewport, bounds, usefulLaunchIndex);

    return {
      startXRatio,
      startYRatio,
      motionXRatio: startXRatio,
      motionYRatio: startYRatio,
      launchIndex: usefulLaunchIndex,
      zoneIndex,
      ...createRandomVelocity()
    };
  }

  function readSessionState(fingerprint) {
    const store = getSessionStore();

    if (!store) {
      return null;
    }

    try {
      const rawState = store.getItem(SESSION_STATE_KEY);
      const stateSnapshot = rawState ? JSON.parse(rawState) : null;

      if (
        !stateSnapshot ||
        stateSnapshot.fingerprint !== fingerprint ||
        stateSnapshot.version !== SESSION_STATE_VERSION
      ) {
        if (stateSnapshot && stateSnapshot.fingerprint === fingerprint) {
          store.removeItem(SESSION_STATE_KEY);
        }

        return null;
      }

      const elapsedMs = Number(stateSnapshot.elapsedMs);
      const updatedAt = Number(stateSnapshot.updatedAt);
      if (
        !Number.isFinite(elapsedMs) ||
        elapsedMs < 0 ||
        !Number.isFinite(updatedAt) ||
        Date.now() - updatedAt > SESSION_RESUME_MAX_AGE_MS
      ) {
        store.removeItem(SESSION_STATE_KEY);
        return null;
      }

      return {
        elapsedMs,
        layout: normalizeOverlayLayout(stateSnapshot.layout)
      };
    } catch (_error) {
      return null;
    }
  }

  function writeSessionState(fingerprint, elapsedMs, layout) {
    const store = getSessionStore();
    const normalizedLayout = normalizeOverlayLayout(layout);

    if (!store || !fingerprint || !Number.isFinite(elapsedMs) || !normalizedLayout) {
      return;
    }

    try {
      store.setItem(SESSION_STATE_KEY, JSON.stringify({
        version: SESSION_STATE_VERSION,
        fingerprint,
        elapsedMs: Math.max(0, Math.round(elapsedMs)),
        layout: normalizedLayout,
        updatedAt: Date.now()
      }));
    } catch (_error) {
      // sessionStorage can be unavailable on locked-down pages; the live overlay still works.
    }
  }

  function clearSessionState(fingerprint) {
    const store = getSessionStore();

    if (!store) {
      return;
    }

    try {
      const rawState = store.getItem(SESSION_STATE_KEY);

      if (!fingerprint || !rawState) {
        store.removeItem(SESSION_STATE_KEY);
        return;
      }

      const stateSnapshot = JSON.parse(rawState);

      if (!stateSnapshot || stateSnapshot.fingerprint === fingerprint) {
        store.removeItem(SESSION_STATE_KEY);
      }
    } catch (_error) {
      store.removeItem(SESSION_STATE_KEY);
    }
  }

  function clampBubbleCenter(value, radius, size) {
    const min = radius + OVERLAY_EDGE_GUTTER;
    const max = size - radius - OVERLAY_EDGE_GUTTER;

    if (max <= min) {
      return size / 2;
    }

    return clamp(value, min, max);
  }

  function bounceMotionAxis(position, velocity, min, max, deltaSeconds) {
    if (max <= min) {
      return {
        position: (min + max) / 2,
        velocity
      };
    }

    let nextPosition = clamp(position, min, max) + (velocity * deltaSeconds);
    let nextVelocity = velocity;

    if (nextPosition < min) {
      nextPosition = min + (min - nextPosition);
      nextVelocity = Math.abs(nextVelocity);
    }

    if (nextPosition > max) {
      nextPosition = max - (nextPosition - max);
      nextVelocity = -Math.abs(nextVelocity);
    }

    return {
      position: clamp(nextPosition, min, max),
      velocity: nextVelocity
    };
  }

  function advanceOverlayMotion(layout, deltaMs, progress) {
    if (!deltaMs || progress >= 1) {
      return;
    }

    const viewport = getViewportSize();
    const bounds = getUsableMotionBounds(viewport, progress);
    const deltaSeconds = Math.min(BUBBLE_MAX_MOTION_STEP_MS, Math.max(0, deltaMs)) / 1000;
    const x = Number.isFinite(layout.motionXRatio)
      ? layout.motionXRatio * viewport.width
      : layout.startXRatio * viewport.width;
    const y = Number.isFinite(layout.motionYRatio)
      ? layout.motionYRatio * viewport.height
      : layout.startYRatio * viewport.height;
    const nextX = bounceMotionAxis(x, layout.velocityX, bounds.minX, bounds.maxX, deltaSeconds);
    const nextY = bounceMotionAxis(y, layout.velocityY, bounds.minY, bounds.maxY, deltaSeconds);

    layout.motionXRatio = clamp(nextX.position / viewport.width, 0, 1);
    layout.motionYRatio = clamp(nextY.position / viewport.height, 0, 1);
    layout.velocityX = nextX.velocity;
    layout.velocityY = nextY.velocity;
  }

  function getOverlayFrame(layout, progress = 0) {
    const growth = clamp(progress, 0, 1);
    const viewport = getViewportSize();
    const diameter = getOverlayDiameter(viewport, progress);
    const radius = diameter / 2;
    const movingCenterX = clampBubbleCenter(
      viewport.width * (Number.isFinite(layout.motionXRatio) ? layout.motionXRatio : layout.startXRatio),
      radius,
      viewport.width
    );
    const movingCenterY = clampBubbleCenter(
      viewport.height * (Number.isFinite(layout.motionYRatio) ? layout.motionYRatio : layout.startYRatio),
      radius,
      viewport.height
    );
    const centerX = interpolate(movingCenterX, viewport.width / 2, growth);
    const centerY = interpolate(movingCenterY, viewport.height / 2, growth);

    return {
      diameter,
      growth,
      left: Math.round(centerX - (diameter / 2)),
      top: Math.round(centerY - (diameter / 2)),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height
    };
  }

  function getFinalSoundStart(audio, remainingMs) {
    const endTime = getSoundEndTime(audio);

    if (!endTime) {
      return SOUND_LOOP_SEGMENTS[SOUND_LOOP_SEGMENTS.length - 1].end;
    }

    const remainingSeconds = Math.max(0, remainingMs / 1000);
    return Math.max(0, endTime - remainingSeconds);
  }

  function enforceCurrentSoundSegment() {
    const audio = state.currentAudio;

    if (!audio) {
      return;
    }

    if (audio.currentTime >= getSoundEndTime(audio)) {
      stopLaunchSound();
      return;
    }

    const segment = state.currentSoundSegment;

    if (!segment || !segment.loop) {
      return;
    }

    const segmentStart = clampAudioTime(audio, segment.start);
    const segmentEnd = clampAudioTime(audio, segment.end);

    if (segmentEnd <= segmentStart + 0.25) {
      return;
    }

    if (audio.currentTime >= segmentEnd || audio.currentTime < segmentStart - 0.5) {
      seekAudio(audio, segmentStart);
      const playPromise = audio.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }
  }

  function stopLaunchSound() {
    const audio = state.currentAudio;

    state.currentAudio = null;
    state.currentAudioSource = "";
    state.currentSoundSegment = null;

    if (!audio) {
      return;
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }

  function applySoundSettings(settings) {
    state.soundSettings = settings;

    if (!state.currentAudio) {
      return;
    }

    state.currentAudio.volume = settings.volume;

    if (!settings.enabled || settings.volume <= 0) {
      stopLaunchSound();
    }
  }

  function applyVisualSettings(settings) {
    state.visualSettings = settings;

    if (
      state.activeController &&
      typeof state.activeController.updateVisualSettings === "function"
    ) {
      state.activeController.updateVisualSettings(settings);
    }
  }

  async function refreshSoundSettings() {
    try {
      applySoundSettings(await PumpStorage.getSoundSettings());
    } catch (_error) {
      applySoundSettings({ enabled: true, volume: 0.35 });
    }
  }

  async function refreshVisualSettings() {
    try {
      applyVisualSettings(await PumpStorage.getVisualSettings());
    } catch (_error) {
      applyVisualSettings({ backgroundGifUrl: "", updatedAt: 0 });
    }
  }

  function getLaunchSoundUrl(settings) {
    if (settings.audioDataUrl) {
      return settings.audioDataUrl;
    }

    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.getURL) {
      return "";
    }

    return chrome.runtime.getURL(LAUNCH_SOUND_PATH);
  }

  function playLaunchSound() {
    const settings = state.soundSettings || { enabled: true, volume: 0.35 };

    if (
      !settings.enabled ||
      settings.volume <= 0 ||
      (!settings.audioDataUrl && (!globalThis.chrome || !chrome.runtime || !chrome.runtime.getURL))
    ) {
      return;
    }

    const audioUrl = getLaunchSoundUrl(settings);

    if (!audioUrl) {
      return;
    }

    stopLaunchSound();

    const audio = new Audio(audioUrl);
    audio.volume = settings.volume;
    audio.preload = "auto";

    audio.addEventListener("ended", () => {
      if (state.currentAudio === audio) {
        state.currentAudio = null;
      }
    }, { once: true });

    audio.addEventListener("error", () => {
      if (state.currentAudio === audio) {
        state.currentAudio = null;
      }
    }, { once: true });

    state.currentAudio = audio;
    state.currentAudioSource = audioUrl;
    state.currentSoundSegment = {
      ...SOUND_LOOP_SEGMENTS[0],
      loop: true
    };
    seekAudio(audio, SOUND_LOOP_SEGMENTS[0].start);
    audio.addEventListener("timeupdate", enforceCurrentSoundSegment);

    const playPromise = audio.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        if (state.currentAudio === audio) {
          state.currentAudio = null;
        }
      });
    }
  }

  function updateLaunchSoundProgress(progress, remainingMs) {
    const audio = state.currentAudio;

    if (!audio) {
      return;
    }

    if (progress >= FINAL_SOUND_PROGRESS) {
      if (!state.currentSoundSegment || state.currentSoundSegment.id !== "finale") {
        const start = getFinalSoundStart(audio, remainingMs);
        state.currentSoundSegment = {
          id: "finale",
          start,
          end: getSoundEndTime(audio),
          loop: false
        };
        seekAudio(audio, start);
      }

      return;
    }

    const loopSegment = getLoopSegmentForProgress(progress);

    if (!state.currentSoundSegment || state.currentSoundSegment.id !== loopSegment.id) {
      state.currentSoundSegment = {
        ...loopSegment,
        loop: true
      };
      seekAudio(audio, loopSegment.start);
    }

    enforceCurrentSoundSegment();
  }

  function navigateToExitFallback() {
    try {
      window.location.replace(EXIT_FALLBACK_URL);
    } catch (_error) {
      window.location.href = EXIT_FALLBACK_URL;
    }
  }

  function requestCurrentTabClose() {
    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };

      try {
        chrome.runtime.sendMessage({ type: "PUMP_CLOSE_CURRENT_TAB" }, (response) => {
          if (chrome.runtime.lastError) {
            settle(false);
            return;
          }

          settle(Boolean(response && response.ok));
        });
      } catch (_error) {
        settle(false);
      }

      window.setTimeout(() => settle(false), 250);
    });
  }

  function exitCurrentScreen() {
    stopLaunchSound();

    requestCurrentTabClose().then((closed) => {
      if (!closed) {
        navigateToExitFallback();
      }
    });
  }

  function setHostFrame(host, layout, progress = 0) {
    const frame = getOverlayFrame(layout, progress);

    host.dataset.pumpMotionX = Number(layout.motionXRatio).toFixed(4);
    host.dataset.pumpMotionY = Number(layout.motionYRatio).toFixed(4);
    host.dataset.pumpStartX = Number(layout.startXRatio).toFixed(4);
    host.dataset.pumpStartY = Number(layout.startYRatio).toFixed(4);
    host.dataset.pumpPlacementVersion = "grid-v2";
    host.dataset.pumpZone = Number.isFinite(Number(layout.zoneIndex)) ? String(layout.zoneIndex) : "";
    host.dataset.pumpLaunchIndex = Number.isFinite(Number(layout.launchIndex)) ? String(layout.launchIndex) : "";

    Object.assign(host.style, {
      position: "fixed",
      left: `${frame.left}px`,
      top: `${frame.top}px`,
      right: "auto",
      bottom: "auto",
      zIndex: "2147483647",
      pointerEvents: "none",
      width: `${frame.diameter}px`,
      height: `${frame.diameter}px`,
      maxWidth: "none",
      maxHeight: "none",
      transition: "width 320ms ease, height 320ms ease"
    });

    return frame;
  }

  function createOverlayMarkup(rule) {
    const wrapper = document.createElement("div");
    const websiteName = getWebsiteDisplayName(rule);
    const escapedWebsiteName = escapeHtml(websiteName);
    wrapper.className = "pump-size";
    wrapper.innerHTML = `
      <section class="pump-card" role="timer" aria-live="polite" aria-label="Timer for ${escapedWebsiteName}">
        <div class="pump-stack">
          <div class="pump-time">
            <strong class="pump-elapsed" data-pump-elapsed>00:00</strong>
            <span class="pump-divider">/</span>
            <span class="pump-limit" data-pump-limit>00:00</span>
          </div>
          <div class="pump-progress" role="progressbar" aria-label="Timer progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="pump-progress-fill" data-pump-progress aria-hidden="true"></div>
            <span class="pump-progress-percent" data-pump-percent>0%</span>
          </div>
          <p class="pump-message" data-pump-message>Just vibing.</p>
          <div class="pump-actions">
            <button class="pump-close-button" type="button" data-action="close" aria-label="Close everything">
              Close everything
            </button>
          </div>
        </div>
      </section>
    `;

    return wrapper;
  }

  function buildController(host, shadow, rule, fingerprint, layout, sessionState, onCloseAndExit) {
    const wrapper = shadow.querySelector(".pump-size");
    const card = shadow.querySelector(".pump-card");
    const elapsedEl = shadow.querySelector("[data-pump-elapsed]");
    const limitEl = shadow.querySelector("[data-pump-limit]");
    const percentEl = shadow.querySelector("[data-pump-percent]");
    const progressBarEl = shadow.querySelector(".pump-progress");
    const messageEl = shadow.querySelector("[data-pump-message]");
    const progressEl = shadow.querySelector("[data-pump-progress]");
    const closeButton = shadow.querySelector("[data-action='close']");
    const limitMs = Math.max(1000, Number(rule.limitMinutes) * 60 * 1000);

    let elapsedMs = Number(sessionState && sessionState.elapsedMs) || 0;
    let animationFrameId = 0;
    let autoCloseTimeoutId = 0;
    let lastVisibleAt = null;
    let lastMotionAt = 0;
    let lastPumpSecond = Math.floor(elapsedMs / 1000);
    let lastSessionWriteAt = 0;
    let disposed = false;
    let closing = false;
    let currentBucket = "";
    let currentMessage = "";
    let lastMessageTick = -1;
    let visibleTicks = 0;
    let backgroundToneRequestId = 0;

    function chooseMessage(progress) {
      const bucket = bucketForProgress(progress);

      if (
        bucket !== currentBucket ||
        !currentMessage ||
        (visibleTicks > 0 && visibleTicks % 8 === 0 && visibleTicks !== lastMessageTick)
      ) {
        currentBucket = bucket;
        currentMessage = randomItem(MESSAGE_BUCKETS[bucket]);
        lastMessageTick = visibleTicks;
      }

      return currentMessage;
    }

    function updateVisualSettings(settings) {
      const backgroundGifUrl = settings && settings.backgroundGifUrl ? settings.backgroundGifUrl : "";
      const requestId = backgroundToneRequestId + 1;

      backgroundToneRequestId = requestId;

      card.classList.toggle("has-background-gif", Boolean(backgroundGifUrl));

      if (backgroundGifUrl) {
        card.style.setProperty("--pump-background-gif", cssUrl(backgroundGifUrl));
        applyGifTone(card, "unknown");
        applyProgressGradient(card, GIF_PROGRESS_FALLBACK_GRADIENT, "100% 100%, cover", "center, center");
        sampleBackgroundImage(backgroundGifUrl)
          .then((sample) => {
            if (!disposed && backgroundToneRequestId === requestId) {
              applyGifTone(card, sample.tone);

              if (sample.progressGradient) {
                applyProgressGradient(card, sample.progressGradient);
              }
            }
          })
          .catch(() => {
            if (!disposed && backgroundToneRequestId === requestId) {
              applyGifTone(card, "unknown");
            }
          });
      } else {
        card.style.removeProperty("--pump-background-gif");
        clearGifTone(card);
        clearProgressGradient(card);
      }
    }

    function setIntensity(progress, frame) {
      const capped = clamp(progress, 0, 1.25);
      const growth = clamp(progress, 0, 1);
      const viewport = frame
        ? { width: frame.viewportWidth, height: frame.viewportHeight }
        : getViewportSize();
      const diameter = frame ? frame.diameter : getCompactDiameter(viewport);
      const contentMax = Math.max(112, Math.min(560, viewport.width - 28, viewport.height - 28));
      const stackWidth = Math.round(clamp(diameter * 0.68, 118, contentMax));
      const popScaleTarget = progress >= 1
        ? 1.35
        : progress >= 0.9
          ? 1.28
          : progress >= 0.75
            ? 1.22
            : progress >= 0.5
              ? 1.14
              : progress >= 0.25
                ? 1.08
                : 1.03;
      const popScale = 1 + ((popScaleTarget - 1) * (1 - growth));
      const duration = Math.round(260 + clamp(progress, 0, 1) * 230);
      const fontSize = Math.round(clamp(stackWidth * 0.18, 21, 88));
      const cardPadding = Math.round(clamp(diameter * 0.045, 8, 58));
      const contentGap = Math.round(clamp(diameter * 0.025, 5, 22));
      const contentWidth = stackWidth;
      const closeWidth = Math.round(clamp(stackWidth * 0.62, 108, 240));
      const shadowAlpha = 0.22 + clamp(progress, 0, 1) * 0.16;

      wrapper.style.setProperty("--pump-growth", growth.toFixed(3));
      wrapper.style.setProperty("--pump-bubble-diameter", `${diameter}px`);
      wrapper.style.setProperty("--pump-pop-scale", popScale.toFixed(3));
      wrapper.style.setProperty("--pump-duration", `${duration}ms`);
      wrapper.style.setProperty("--pump-intensity", (clamp(progress, 0, 1) * 2.8).toFixed(2));
      wrapper.style.setProperty("--pump-tilt-negative", `${(clamp(progress, 0, 1) * -2.8).toFixed(2)}deg`);
      wrapper.style.setProperty("--pump-tilt-positive", `${(clamp(progress, 0, 1) * 1.68).toFixed(2)}deg`);
      wrapper.style.setProperty("--pump-font-size", `${fontSize}px`);
      wrapper.style.setProperty("--pump-card-padding", `${cardPadding}px`);
      wrapper.style.setProperty("--pump-content-gap", `${contentGap}px`);
      wrapper.style.setProperty("--pump-content-width", `${contentWidth}px`);
      wrapper.style.setProperty("--pump-stack-width", `${stackWidth}px`);
      wrapper.style.setProperty("--pump-message-font-size", `${Math.round(clamp(stackWidth * 0.085, 10, 26))}px`);
      wrapper.style.setProperty("--pump-secondary-font-size", `${Math.round(clamp(stackWidth * 0.07, 10, 23))}px`);
      wrapper.style.setProperty("--pump-close-font-size", `${Math.round(clamp(stackWidth * 0.078, 10, 20))}px`);
      wrapper.style.setProperty("--pump-close-width", `${closeWidth}px`);
      wrapper.style.setProperty("--pump-button-size", `${Math.round(clamp(stackWidth * 0.21, 26, 58))}px`);
      wrapper.style.setProperty("--pump-progress-height", `${Math.round(clamp(stackWidth * 0.085, 14, 30))}px`);
      wrapper.style.setProperty("--pump-body-offset", "0px");
      wrapper.style.setProperty("--pump-shadow", `0 ${Math.round(18 + capped * 12)}px ${Math.round(36 + capped * 18)}px rgba(28, 17, 50, ${shadowAlpha.toFixed(2)})`);
    }

    function triggerPump() {
      card.classList.remove("is-pumping");
      void card.offsetWidth;
      card.classList.add("is-pumping");
    }

    function render(shouldPump, shouldPersist = true) {
      const progress = elapsedMs / limitMs;
      const progressPercent = clamp(progress * 100, 0, 100);
      const percent = Math.floor(progressPercent);
      const clampedPercent = Math.round(progressPercent);

      elapsedEl.textContent = formatTime(elapsedMs);
      limitEl.textContent = formatTime(limitMs);
      percentEl.textContent = `${percent}%`;
      progressEl.style.width = `${progressPercent}%`;
      progressBarEl.setAttribute("aria-valuenow", String(clampedPercent));
      progressBarEl.setAttribute("aria-valuetext", `${clampedPercent}% elapsed`);
      messageEl.textContent = chooseMessage(progress);

      const frame = setHostFrame(host, layout, progress);
      setIntensity(progress, frame);
      updateLaunchSoundProgress(progress, Math.max(0, limitMs - elapsedMs));

      if (shouldPersist) {
        writeSessionState(fingerprint, elapsedMs, layout);
      }

      if (shouldPump) {
        triggerPump();
      }
    }

    function scheduleAnimation() {
      if (!animationFrameId) {
        animationFrameId = window.requestAnimationFrame(animate);
      }
    }

    function startAutoClose() {
      if (closing || autoCloseTimeoutId) {
        return;
      }

      elapsedMs = Math.max(elapsedMs, limitMs);
      render(true, true);
      autoCloseTimeoutId = window.setTimeout(closeAndExit, AUTO_CLOSE_DELAY_MS);
    }

    function animate(timestamp) {
      animationFrameId = 0;

      if (disposed || closing) {
        return;
      }

      if (document.visibilityState !== "visible") {
        lastVisibleAt = null;
        lastMotionAt = 0;
        scheduleAnimation();
        return;
      }

      if (lastVisibleAt === null) {
        lastVisibleAt = timestamp;
      }

      if (!lastMotionAt) {
        lastMotionAt = timestamp;
      }

      elapsedMs += Math.max(0, timestamp - lastVisibleAt);
      lastVisibleAt = timestamp;

      const progress = elapsedMs / limitMs;
      const motionDeltaMs = Math.min(BUBBLE_MAX_MOTION_STEP_MS, Math.max(0, timestamp - lastMotionAt));
      lastMotionAt = timestamp;

      if (!prefersReducedMotion()) {
        advanceOverlayMotion(layout, motionDeltaMs, progress);
      }

      const currentPumpSecond = Math.floor(elapsedMs / 1000);
      const shouldPump = currentPumpSecond !== lastPumpSecond;
      const shouldPersist = !lastSessionWriteAt || timestamp - lastSessionWriteAt >= 750 || progress >= 1;

      if (shouldPump) {
        visibleTicks += Math.max(1, currentPumpSecond - lastPumpSecond);
        lastPumpSecond = currentPumpSecond;
      }

      render(shouldPump, shouldPersist);

      if (shouldPersist) {
        lastSessionWriteAt = timestamp;
      }

      if (elapsedMs >= limitMs) {
        startAutoClose();
        return;
      }

      scheduleAnimation();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        lastVisibleAt = null;
        lastMotionAt = 0;
        scheduleAnimation();
      } else {
        lastVisibleAt = null;
        lastMotionAt = 0;
      }
    }

    function handleResize() {
      render(false);
    }

    function destroy() {
      if (disposed) {
        return;
      }

      disposed = true;
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(autoCloseTimeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("resize", handleResize);
      closeButton.removeEventListener("click", closeAndExit);
      host.remove();
    }

    function closeAndExit() {
      if (closing) {
        return;
      }

      closing = true;
      window.clearTimeout(autoCloseTimeoutId);
      clearSessionState(fingerprint);
      onCloseAndExit();
      destroy();
    }

    function start() {
      updateVisualSettings(state.visualSettings || { backgroundGifUrl: "" });
      render(false);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("resize", handleResize);
      closeButton.addEventListener("click", closeAndExit);
      scheduleAnimation();
    }

    return {
      start,
      destroy,
      updateVisualSettings,
      syncSound() {
        updateLaunchSoundProgress(elapsedMs / limitMs, Math.max(0, limitMs - elapsedMs));
      }
    };
  }

  async function createPumpOverlay(rule, fingerprint, sessionState) {
    const existingHost = document.getElementById(HOST_ID);

    if (existingHost) {
      existingHost.remove();
    }

    const host = document.createElement("div");
    const savedLayout = sessionState && sessionState.layout;
    const layout = createOverlayLayout(
      savedLayout,
      savedLayout ? null : await getFreshOverlayLaunchIndex()
    );
    host.id = HOST_ID;
    setHostFrame(host, layout, 0);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = await loadOverlayCss();
    shadow.append(style, createOverlayMarkup(rule));

    (document.body || document.documentElement).append(host);

    return buildController(host, shadow, rule, fingerprint, layout, sessionState, () => {
      state.activeController = null;
      state.activeFingerprint = "";
      exitCurrentScreen();
    });
  }

  function destroyActiveOverlay() {
    if (state.activeController) {
      state.activeController.destroy();
      state.activeController = null;
      state.activeFingerprint = "";
    }

    stopLaunchSound();
  }

  async function evaluateRules(providedRules) {
    try {
      const rules = providedRules || await PumpStorage.getRules();
      const matchingRule = findMatchingRule(rules);

      if (!matchingRule) {
        destroyActiveOverlay();
        return;
      }

      const fingerprint = fingerprintForRule(matchingRule);

      if (state.activeController && state.activeFingerprint === fingerprint) {
        return;
      }

      destroyActiveOverlay();
      await refreshSoundSettings();
      await refreshVisualSettings();
      state.activeController = await createPumpOverlay(matchingRule, fingerprint, readSessionState(fingerprint));
      state.activeFingerprint = fingerprint;
      state.activeController.start();
      playLaunchSound();

      if (state.activeController && typeof state.activeController.syncSound === "function") {
        state.activeController.syncSound();
      }
    } catch (error) {
      destroyActiveOverlay();
      console.warn("Pump! could not start on this page.", error);
    }
  }

  function handleNavigationChange() {
    if (window.location.href === state.lastHref) {
      return;
    }

    state.lastHref = window.location.href;
    evaluateRules();
  }

  function cleanup() {
    destroyActiveOverlay();

    if (state.storageCleanup) {
      state.storageCleanup();
      state.storageCleanup = null;
    }

    if (state.soundCleanup) {
      state.soundCleanup();
      state.soundCleanup = null;
    }

    if (state.visualCleanup) {
      state.visualCleanup();
      state.visualCleanup = null;
    }

    stopLaunchSound();
    window.clearInterval(state.navigationInterval);
  }

  state.storageCleanup = PumpStorage.onRulesChanged((rules) => {
    evaluateRules(rules);
  });
  state.soundCleanup = PumpStorage.onSoundSettingsChanged((settings) => {
    applySoundSettings(settings);
  });
  state.visualCleanup = PumpStorage.onVisualSettingsChanged((settings) => {
    applyVisualSettings(settings);
  });
  state.navigationInterval = window.setInterval(handleNavigationChange, 1000);
  window.addEventListener("beforeunload", cleanup, { once: true });

  evaluateRules();
})();
