/* Home. Mostly static markup about the project; the only thing worth wiring up
 * are the links out to it, which come from app.js so the logo and these can
 * never drift apart. */
(function () {
  "use strict";

  var E = window.EVTRACS;

  E.boot("index.html", function () {
    ["projectHeaderLink", "projectLink"].forEach(function (id) {
      var link = document.getElementById(id);
      if (link) {
        link.href = E.movingImpactUrl;
      }
    });
  });
})();
