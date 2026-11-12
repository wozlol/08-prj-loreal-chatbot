// App features: the service worker and the Install App button.
// This file only adds the app features. The chat itself lives in script.js.

const installRow = document.getElementById("installRow");
const installBtn = document.getElementById("installBtn");
const installNote = document.getElementById("installNote");

// ----- 1. Register the service worker (it makes the app open offline) -----
if ("serviceWorker" in navigator) {
  // Wait for the page to finish loading so the first visit is not slowed down
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .catch((error) => console.error("Service worker could not start:", error));
  });
}

// ----- 2. Install App button -----
// True when the app is already running from the home screen or desktop (no browser around it)
const runningStandalone =
  window.matchMedia?.("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

// iPhones and iPads never send the install event, so we show steps for them instead
const onIos =
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

let deferredInstallPrompt = null;

if (!runningStandalone) {
  // Chrome and Edge send this when the app can be installed. We hold it back
  // and show our own button at the bottom of the page instead.
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installRow.hidden = false;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt(); // opens the real install window
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null; // each event can only be used once
    installRow.hidden = true;
  });

  // Once the app is installed, the button is not needed
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installRow.hidden = true;
  });

  // iPhone and iPad: Safari has no install button we can open, so show the steps
  if (onIos) {
    installNote.textContent =
      "To install: tap the Share button in Safari, then choose Add to Home Screen.";
    installNote.hidden = false;
    installRow.hidden = false;
  }
}
