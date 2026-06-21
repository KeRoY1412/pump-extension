(function initializePumpPopup() {
  "use strict";

  const form = document.getElementById("rule-form");
  const websiteInput = document.getElementById("website-input");
  const limitInput = document.getElementById("limit-input");
  const message = document.getElementById("form-message");
  const rulesList = document.getElementById("rules-list");
  const ruleCount = document.getElementById("rule-count");
  const soundEnabledInput = document.getElementById("sound-enabled-input");
  const soundVolumeInput = document.getElementById("sound-volume-input");
  const soundVolumeLabel = document.getElementById("sound-volume-label");
  const soundFileLabel = document.getElementById("sound-file-label");
  const soundFileInput = document.getElementById("sound-file-input");
  const soundImportButton = document.getElementById("sound-import-button");
  const soundTestButton = document.getElementById("sound-test-button");
  const soundClearButton = document.getElementById("sound-clear-button");
  const gifUrlInput = document.getElementById("gif-url-input");
  const gifPreview = document.getElementById("gif-preview");
  const gifPreviewLabel = document.getElementById("gif-preview-label");
  const gifSaveButton = document.getElementById("gif-save-button");
  const gifClearButton = document.getElementById("gif-clear-button");

  let rules = [];
  let soundSettings = { enabled: true, volume: 0.35, fileName: "", audioMimeType: "", audioDataUrl: "", importedAt: 0 };
  let visualSettings = { backgroundGifUrl: "", updatedAt: 0 };
  let soundSaveTimer = 0;
  let previewAudio = null;
  const MAX_AUDIO_IMPORT_BYTES = 50 * 1024 * 1024;

  function trashIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h16"></path>
        <path d="M9 7V5h6v2"></path>
        <path d="M7 7l1 13h8l1-13"></path>
        <path d="M10 11v5"></path>
        <path d="M14 11v5"></path>
      </svg>
    `;
  }

  function formatLimit(minutes) {
    const rounded = Number(minutes);
    const label = rounded === 1 ? "minute" : "minutes";
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${label}`;
  }

  function showMessage(text, isError) {
    message.textContent = text;
    message.hidden = !text;
    message.classList.toggle("is-error", Boolean(isError));
  }

  function formatVolume(volume) {
    return `${Math.round(Number(volume) * 100)}%`;
  }

  function cssUrl(value) {
    return `url("${String(value || "").replace(/["\\\n\r\f]/g, "\\$&")}")`;
  }

  function renderSoundSettings() {
    soundEnabledInput.checked = soundSettings.enabled;
    soundVolumeInput.value = String(Math.round(soundSettings.volume * 100));
    soundVolumeLabel.textContent = formatVolume(soundSettings.volume);
    soundFileLabel.textContent = soundSettings.fileName
      ? `Imported: ${soundSettings.fileName}`
      : "Using packaged default audio.";
    soundClearButton.disabled = !soundSettings.audioDataUrl;
  }

  function renderVisualSettings() {
    const backgroundGifUrl = visualSettings.backgroundGifUrl || "";
    const hasGif = Boolean(backgroundGifUrl);

    if (document.activeElement !== gifUrlInput) {
      gifUrlInput.value = backgroundGifUrl;
    }

    gifPreview.classList.toggle("has-gif", hasGif);
    gifPreview.style.backgroundImage = hasGif ? cssUrl(backgroundGifUrl) : "";
    gifPreviewLabel.textContent = hasGif ? "GIF ready." : "No GIF set.";
    gifClearButton.disabled = !hasGif;
  }

  function createRuleRow(rule) {
    const row = document.createElement("article");
    row.className = `rule-card${rule.enabled ? "" : " is-disabled"}`;
    row.dataset.id = rule.id;

    const switchLabel = document.createElement("label");
    switchLabel.className = "switch";
    switchLabel.title = rule.enabled ? "Disable timer for this site" : "Enable timer for this site";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = rule.enabled;
    checkbox.dataset.action = "toggle";
    checkbox.setAttribute("aria-label", `${rule.enabled ? "Disable" : "Enable"} ${rule.hostname}`);

    const track = document.createElement("span");
    track.className = "switch-track";

    switchLabel.append(checkbox, track);

    const copy = document.createElement("div");
    copy.className = "rule-copy";

    const host = document.createElement("strong");
    host.className = "rule-host";
    host.textContent = rule.hostname;

    const meta = document.createElement("span");
    meta.className = "rule-meta";
    meta.textContent = `${formatLimit(rule.limitMinutes)} max pump`;

    copy.append(host, meta);

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.setAttribute("aria-label", `Delete ${rule.hostname}`);
    deleteButton.innerHTML = trashIcon();

    row.append(switchLabel, copy, deleteButton);
    return row;
  }

  function renderRules() {
    ruleCount.textContent = String(rules.length);
    rulesList.textContent = "";

    if (!rules.length) {
      const emptyState = document.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "No pumps yet. Add a site and the timer will keep things visible when you visit it.";
      rulesList.append(emptyState);
      return;
    }

    const fragment = document.createDocumentFragment();
    rules.forEach((rule) => {
      fragment.append(createRuleRow(rule));
    });
    rulesList.append(fragment);
  }

  async function refreshRules() {
    try {
      rules = await PumpStorage.getRules();
      renderRules();
    } catch (error) {
      showMessage(error.message || "Could not read saved rules.", true);
    }
  }

  async function refreshSoundSettings() {
    try {
      soundSettings = await PumpStorage.getSoundSettings();
      renderSoundSettings();
    } catch (error) {
      showMessage(error.message || "Could not read sound settings.", true);
    }
  }

  async function refreshVisualSettings() {
    try {
      visualSettings = await PumpStorage.getVisualSettings();
      renderVisualSettings();
    } catch (error) {
      showMessage(error.message || "Could not read GIF settings.", true);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    showMessage("", false);

    try {
      const result = await PumpStorage.upsertRuleFromInput(websiteInput.value, limitInput.value);
      rules = result.rules;
      renderRules();
      websiteInput.value = "";
      websiteInput.focus();
      showMessage(
        result.updatedExisting
          ? `${result.rule.hostname} is updated and ready to pump.`
          : `${result.rule.hostname} is ready to pump.`,
        false
      );
    } catch (error) {
      showMessage(error.message || "Could not save that rule.", true);
    }
  }

  async function handleListChange(event) {
    const target = event.target;

    if (!target.matches("[data-action='toggle']")) {
      return;
    }

    const row = target.closest(".rule-card");
    const id = row ? row.dataset.id : "";

    try {
      rules = await PumpStorage.updateRule(id, { enabled: target.checked });
      renderRules();
      showMessage(target.checked ? "Pump restored. Flex responsibly." : "Pump paused for that site.", false);
    } catch (error) {
      target.checked = !target.checked;
      showMessage(error.message || "Could not update that rule.", true);
    }
  }

  async function handleListClick(event) {
    const button = event.target.closest("[data-action='delete']");

    if (!button) {
      return;
    }

    const row = button.closest(".rule-card");
    const id = row ? row.dataset.id : "";
    const rule = rules.find((item) => item.id === id);

    try {
      rules = await PumpStorage.deleteRule(id);
      renderRules();
      showMessage(rule ? `${rule.hostname} has left the pump zone.` : "Rule deleted.", false);
    } catch (error) {
      showMessage(error.message || "Could not delete that rule.", true);
    }
  }

  function stopPreviewAudio() {
    if (!previewAudio) {
      return;
    }

    previewAudio.pause();
    previewAudio.removeAttribute("src");
    previewAudio.load();
    previewAudio = null;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener("load", () => resolve(String(reader.result || "")), { once: true });
      reader.addEventListener("error", () => reject(new Error("Could not read that audio file.")), { once: true });
      reader.readAsDataURL(file);
    });
  }

  async function saveSoundSettings(patch, successMessage) {
    try {
      soundSettings = await PumpStorage.updateSoundSettings(patch);
      renderSoundSettings();
      if (successMessage) {
        showMessage(successMessage, false);
      }
    } catch (error) {
      showMessage(error.message || "Could not save sound settings.", true);
    }
  }

  async function saveVisualSettings(patch, successMessage) {
    try {
      visualSettings = await PumpStorage.updateVisualSettings(patch);
      renderVisualSettings();
      if (successMessage) {
        showMessage(successMessage, false);
      }
    } catch (error) {
      showMessage(error.message || "Could not save GIF settings.", true);
    }
  }

  function scheduleVolumeSave() {
    const volume = PumpStorage.normalizeVolume(Number(soundVolumeInput.value) / 100);
    soundSettings = { ...soundSettings, volume };
    soundVolumeLabel.textContent = formatVolume(volume);

    if (previewAudio) {
      previewAudio.volume = volume;
    }

    window.clearTimeout(soundSaveTimer);
    soundSaveTimer = window.setTimeout(() => {
      saveSoundSettings({ volume }, "");
    }, 120);
  }

  function handleSoundEnabledChange() {
    const enabled = soundEnabledInput.checked;

    if (!enabled) {
      stopPreviewAudio();
    }

    saveSoundSettings(
      { enabled },
      enabled ? "Launch sound is on." : "Launch sound is off."
    );
  }

  function getPreviewSoundUrl() {
    if (soundSettings.audioDataUrl) {
      return soundSettings.audioDataUrl;
    }

    if (!globalThis.chrome || !chrome.runtime || !chrome.runtime.getURL) {
      return "";
    }

    return chrome.runtime.getURL("assets/mountains.mp3");
  }

  function handleSoundImportClick() {
    soundFileInput.click();
  }

  async function handleSoundFileChange() {
    const file = soundFileInput.files && soundFileInput.files[0];

    soundFileInput.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("audio/")) {
      showMessage("Choose an audio file for the launch sound.", true);
      return;
    }

    if (file.size > MAX_AUDIO_IMPORT_BYTES) {
      showMessage("That audio file is too large. Use a licensed MP3 under 50 MB.", true);
      return;
    }

    try {
      const audioDataUrl = await readFileAsDataUrl(file);
      soundSettings = await PumpStorage.saveSoundSettings({
        ...soundSettings,
        enabled: true,
        fileName: file.name,
        audioMimeType: file.type,
        audioDataUrl,
        importedAt: Date.now()
      });
      renderSoundSettings();
      showMessage(`${file.name} is imported for the launch sound.`, false);
    } catch (error) {
      showMessage(error.message || "Could not import that audio file.", true);
    }
  }

  async function handleSoundClearClick() {
    stopPreviewAudio();
    await saveSoundSettings({
      enabled: true,
      fileName: "",
      audioMimeType: "",
      audioDataUrl: "",
      importedAt: 0
    }, "Imported launch sound cleared. Default audio is active.");
  }

  async function handleSoundTestClick() {
    showMessage("", false);

    const volume = PumpStorage.normalizeVolume(Number(soundVolumeInput.value) / 100);
    const enabled = soundEnabledInput.checked;

    await saveSoundSettings({ enabled, volume }, "");

    if (!enabled || volume <= 0) {
      showMessage("Launch sound is muted for now.", false);
      return;
    }

    const previewUrl = getPreviewSoundUrl();

    if (!previewUrl) {
      showMessage("The packaged default audio could not be found.", true);
      return;
    }

    try {
      stopPreviewAudio();
      previewAudio = new Audio(previewUrl);
      previewAudio.volume = volume;
      previewAudio.addEventListener("ended", () => {
        previewAudio = null;
      }, { once: true });
      await previewAudio.play();
      showMessage("Launch sound preview is pumping.", false);
    } catch (_error) {
      stopPreviewAudio();
      showMessage("The launch sound could not be played.", true);
    }
  }

  async function handleGifSaveClick() {
    const rawUrl = gifUrlInput.value.trim();
    const backgroundGifUrl = PumpStorage.normalizeBackgroundGifUrl(rawUrl);

    showMessage("", false);

    if (rawUrl && !backgroundGifUrl) {
      showMessage("Paste a valid http or https GIF URL.", true);
      return;
    }

    await saveVisualSettings(
      { backgroundGifUrl },
      backgroundGifUrl ? "Bubble GIF background saved." : "Bubble GIF background cleared."
    );
  }

  async function handleGifClearClick() {
    gifUrlInput.value = "";
    await saveVisualSettings({ backgroundGifUrl: "" }, "Bubble GIF background cleared.");
  }

  function handleGifUrlKeydown(event) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    handleGifSaveClick();
  }

  form.addEventListener("submit", handleSubmit);
  rulesList.addEventListener("change", handleListChange);
  rulesList.addEventListener("click", handleListClick);
  soundEnabledInput.addEventListener("change", handleSoundEnabledChange);
  soundVolumeInput.addEventListener("input", scheduleVolumeSave);
  soundImportButton.addEventListener("click", handleSoundImportClick);
  soundFileInput.addEventListener("change", handleSoundFileChange);
  soundTestButton.addEventListener("click", handleSoundTestClick);
  soundClearButton.addEventListener("click", handleSoundClearClick);
  gifSaveButton.addEventListener("click", handleGifSaveClick);
  gifClearButton.addEventListener("click", handleGifClearClick);
  gifUrlInput.addEventListener("keydown", handleGifUrlKeydown);

  refreshRules();
  refreshSoundSettings();
  refreshVisualSettings();
})();
