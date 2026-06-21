"use strict";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "PUMP_CLOSE_CURRENT_TAB") {
    return false;
  }

  const tabId = sender && sender.tab && sender.tab.id;

  if (typeof tabId !== "number") {
    sendResponse({ ok: false, error: "No sender tab was available." });
    return false;
  }

  chrome.tabs.remove(tabId, () => {
    const lastError = chrome.runtime.lastError;
    sendResponse({
      ok: !lastError,
      error: lastError ? lastError.message : ""
    });
  });

  return true;
});
