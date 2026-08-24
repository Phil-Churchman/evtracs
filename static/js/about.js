/* About page. The content is static markup; the only thing worth wiring up is
 * the project link, which comes from app.js so the logo and this button can
 * never drift apart. */
(function () {
  "use strict";

  var E = window.EVTRACS;

  E.boot("about.html", function () {
    document.getElementById("projectLink").href = E.movingImpactUrl;
  });
})();
