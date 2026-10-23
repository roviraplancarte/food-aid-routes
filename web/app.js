// Food-aid routes demo. Numbers and tables come straight from resultado.json; the interactive map (Leaflet +
// OpenStreetMap tiles) loads after the page is ready, and until then a still image of the same map holds its place.
// The page's <html lang> picks the strings below; data files are resolved next to this script, so the same code
// serves /rutas-2020/ and /es/rutas-2020/.
(function () {
  var BASE = document.currentScript.src.replace(/[^/]*$/, "");
  var LANG = (document.documentElement.lang || "en").slice(0, 2) === "es" ? "es" : "en";
  var T = {
    en: {
      fewer: function (pct, km) { return pct + "% fewer kilometers than planning by sector (" + km + " km)."; },
      same: function (km) { return "The optimized plan covers the same houses in " + km + " km."; },
      mapFailed: "The interactive map couldn't be loaded. The numbers on this page are for the plan you chose.",
      mapLoading: "Loading the interactive map…",
      packages: function (n) { return n + (n > 1 ? " packages" : " package"); },
      depot: "Collection point (illustrative)",
      attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
      noData: "The route data couldn't be loaded, so there is no map to show.",
      noDataPanel: "The route data couldn't be loaded. Reload the page; if it keeps happening, let me know.",
      zoomIn: "Zoom in", zoomOut: "Zoom out", leaflet: "A JavaScript library for interactive maps",
    },
    es: {
      fewer: function (pct, km) { return pct + "% menos kilómetros que repartiendo por sectores (" + km + " km)."; },
      same: function (km) { return "El plan optimizado cubre las mismas casas en " + km + " km."; },
      mapFailed: "El mapa interactivo no se pudo cargar. Las cifras de esta página corresponden al plan que elegiste.",
      mapLoading: "Cargando el mapa interactivo…",
      packages: function (n) { return n + (n > 1 ? " despensas" : " despensa"); },
      depot: "Centro de acopio (ilustrativo)",
      attribution: "© colaboradores de <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>",
      noData: "Los datos de las rutas no se pudieron cargar, así que no hay mapa que mostrar.",
      noDataPanel: "Los datos de las rutas no se pudieron cargar. Recarga la página; si el problema sigue, avísame.",
      zoomIn: "Acercar", zoomOut: "Alejar", leaflet: "Una biblioteca de JavaScript para mapas interactivos",
    },
  }[LANG];

  var $ = function (id) { return document.getElementById(id); };
  var css = function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); };
  var dark = function () { return css("--paper") === "#0f1a1f"; };
  var colors = function () { return ["--b1", "--b2", "--b3", "--b4"].map(css); };
  var data, plan = "optimizado", map, tiles, layer, leafletFailed = false;

  function render() {
    var res = data[plan], c = colors(), rows = "";
    res.rutas.forEach(function (r, k) {
      rows += "<tr><td><span class='sw' style='background:" + c[k % c.length] + "'></span>" + (k + 1) + "</td><td>" + r.paradas +
              "</td><td>" + r.despensas + "</td><td>" + r.km.toFixed(1) + "</td></tr>";
    });
    $("rows").innerHTML = rows;
    $("km").textContent = res.km_total.toFixed(1);
    $("saving").textContent = plan === "optimizado"
      ? T.fewer(data.ahorro_pct, data.sectores.km_total.toFixed(1))
      : T.same(data.optimizado.km_total.toFixed(1));
    $("b-sectores").setAttribute("aria-pressed", plan === "sectores");
    $("b-optimizado").setAttribute("aria-pressed", plan === "optimizado");
    if ($("stops-details").open) stopsTable();
    if (!map) {   // the still image shows the optimized plan only
      var fija = plan === "optimizado", msg = $("mapmsg");
      $("preview").hidden = !fija;
      msg.hidden = fija;
      msg.textContent = leafletFailed ? T.mapFailed : T.mapLoading;
    }
    drawMap();
  }
  function stopsTable() {
    $("stops").innerHTML = data[plan].rutas.map(function (r, k) {
      return r.puntos.map(function (i, n) {
        var h = data.hogares[i - 1];
        return "<tr><td>" + (k + 1) + "</td><td>" + (n + 1) + "</td><td>" + h.despensas + "</td></tr>";
      }).join("");
    }).join("");
  }
  $("stops-details").addEventListener("toggle", function () { if (this.open && data) stopsTable(); });
  $("b-sectores").onclick = function () { plan = "sectores"; if (data) render(); };
  $("b-optimizado").onclick = function () { plan = "optimizado"; if (data) render(); };

  function base() {
    if (tiles) map.removeLayer(tiles);
    tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 18, className: dark() ? "tiles-dark" : "tiles-light", attribution: T.attribution }).addTo(map);
    tiles.once("load", function () { $("preview").hidden = true; });
  }
  function drawMap() {
    if (!map || !data) return;
    if (layer) map.removeLayer(layer);
    layer = L.layerGroup().addTo(map);
    var c = colors();
    data[plan].rutas.forEach(function (r, k) {
      var col = c[k % c.length];
      L.polyline(r.trazo.map(function (p) { return [p[1], p[0]]; }), { color: col, weight: 4, opacity: .85, interactive: false }).addTo(layer);
      r.puntos.forEach(function (i) {
        var h = data.hogares[i - 1];
        L.circleMarker([h.lat, h.lon], { radius: 3 + h.despensas, color: col, weight: 2, fillColor: css("--paper"), fillOpacity: 1 })
          .bindTooltip(T.packages(h.despensas)).addTo(layer);
      });
    });
    L.circleMarker([data.acopio.lat, data.acopio.lon], { radius: 8, color: css("--stop"), weight: 3,
      fillColor: css("--stop"), fillOpacity: 1 }).bindTooltip(T.depot).addTo(layer);
    // Stops answer to the mouse only; with the keyboard the same data is in the stops table.
    document.querySelectorAll("#map path.leaflet-interactive").forEach(function (e) { e.setAttribute("tabindex", "-1"); });
  }
  function startMap() {
    var lc = document.createElement("link");   // Leaflet's stylesheet loads with Leaflet, so it doesn't block the first paint
    lc.rel = "stylesheet"; lc.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(lc);
    var sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    sc.onload = function () {
      map = L.map("map", { zoomControl: false, scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false });
      L.control.zoom({ zoomInTitle: T.zoomIn, zoomOutTitle: T.zoomOut }).addTo(map);
      map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="' + T.leaflet + '">Leaflet</a>');
      map.fitBounds(data.hogares.map(function (h) { return [h.lat, h.lon]; }), { padding: [24, 24] });
      $("mapmsg").hidden = true;
      base(); drawMap();
      // The panel beside the map can grow (the stops table); keep Leaflet's size in step with its box.
      if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); }).observe($("map"));
    };
    sc.onerror = function () { leafletFailed = true; if (data) render(); };   // the numbers keep working
    document.head.appendChild(sc);
  }

  fetch(BASE + "resultado.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    data = d;
    $("cap").textContent = d.parametros.capacidad;
    render();
    var later = function () { (window.requestIdleCallback || setTimeout)(startMap, { timeout: 1500 }); };
    document.readyState === "complete" ? later() : addEventListener("load", later);
  }).catch(function () {
    $("preview").hidden = true;   // don't show routes the page couldn't load
    $("mapmsg").textContent = T.noData; $("mapmsg").hidden = false;
    $("saving").textContent = T.noDataPanel;
    $("stops-details").hidden = true;   // no empty table
  });

  // The language switch keeps the section the reader is on (#step-3 → #step-3 in the other language)
  var keepHash = function () { document.querySelectorAll(".lang a").forEach(function (a) { a.hash = location.hash; }); };
  keepHash(); addEventListener("hashchange", keepHash);


  if (window.matchMedia) {
    var mq = matchMedia("(prefers-color-scheme: dark)");
    var redo = function () { if (data) render(); if (map) base(); };
    mq.addEventListener ? mq.addEventListener("change", redo) : mq.addListener(redo);
  }
})();
