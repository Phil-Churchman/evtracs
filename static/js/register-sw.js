/* Registers the service worker from the site root so its scope covers every
 * page. Registration is best-effort: the site works perfectly well without
 * it, and browsers refuse outright on insecure origins other than localhost.
 */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("service-worker.js").catch(function (error) {
      console.log("Service worker registration failed", error);
    });
  });
}
