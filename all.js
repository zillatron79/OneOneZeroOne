(function () {
  "use strict";

  var timer = setInterval(function () {
    if (typeof Lampa !== "undefined") {
      clearInterval(timer);

      Lampa.Utils.putScriptAsync(
        [

          "http://wtch.ch/m", //Онлайн без преміум
          "https://lampame.github.io/main/bo.js", // Бандера Онлайн
          
          "http://z01.online/live",
          "http://smotret24.com/online.js",
          "https://adultjs.onrender.com",
          "https://ko31k.github.io/LMP/plugins/interface+.js",
          "https://ko31k.github.io/LMP/plugins/UA-Finder+Mod.js",
          "https://ko31k.github.io/LMP/plugins/rtg.js",
          "http://lampaua.mooo.com/online/js/z0a4ctmt", / / BazarNetUA Online
          "https://ipavlin98.github.io/lmp-plugins/series-progress-fix.js",
          "https://bennington111.github.io/plug/collections.js",
          "https://zillatron79.github.io/OneOneZeroOne/bat-parser.js", / / Parser

          "https://вашепосилання",

          // "https://вашепосилання",
          // "https://вашепосилання",
          // "https://вашепосилання,

          "https://вашепосилання",

          "http://вашепосилання",

          "https://вашепосилання",

          "https://icantrytodo.github.io/lampa/torrent_styles_v2.js", //стиль торентів може конфліктувати з іншими стилями
          "https://darkestclouds.github.io/plugins/easytorrent/easytorrent.min.js", //рекомендація торрентів
          "https://вашепосилання",

          
        ],
        function () {},
      );
    }
  }, 200);
})();
