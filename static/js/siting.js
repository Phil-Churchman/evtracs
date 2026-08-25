/* Station siting page. Like the tracking page, the description is static
 * markup; the only thing worth wiring up is the walkthrough link, which comes
 * from the same video catalogue the overview uses so there is one record of
 * that url.
 */
(function () {
  "use strict";

  var E = window.EVTRACS;

  var STEPS_URL = "data/model_steps.json";
  var VIDEO_ID = "facility-location";

  /* The catalogue stores /embed/ urls, which play bare; a link should open the
     real page. Same rewrite the overview and global pages do. */
  function watchUrl(embedUrl) {
    var match = /youtube\.com\/embed\/([\w-]+)/.exec(embedUrl || "");
    return match ? "https://www.youtube.com/watch?v=" + match[1] : embedUrl;
  }

  E.boot("siting.html", function () {
    return E.fetchJson(STEPS_URL)
      .then(function (catalogue) {
        var video = (catalogue.videos || {})[VIDEO_ID];
        if (!video) {
          return;
        }
        var link = document.getElementById("sitingVideo");
        link.href = watchUrl(video.youtube);
        link.hidden = false;
      })
      .catch(function (error) {
        // The page reads perfectly well without the video button.
        console.warn("Could not load " + STEPS_URL, error);
      });
  });
})();
