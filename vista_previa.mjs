// Captura la imagen fija del mapa (clara y oscura) que web/index.html muestra mientras carga Leaflet.
// Uso: node vista_previa.mjs <URL de la página servida>   (p. ej. http://localhost:8000/ con `python3 -m http.server` en web/)
// Requiere puppeteer-core instalado en ~/.local/qa y Chromium en /usr/bin/chromium.
// Volver a correrlo si cambian las rutas o el estilo del mapa.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(join(homedir(), ".local/qa/package.json"));
const puppeteer = require("puppeteer-core");
const URL = process.argv[2];
if (!URL) { console.error("Uso: node vista_previa.mjs <URL de la página>"); process.exit(1); }
const WEB = join(dirname(fileURLToPath(import.meta.url)), "web");

const browser = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const VARIANTES = [
  ["light", "mapa-claro.webp", { width: 1432, height: 800 }],        // escritorio: el mapa queda en 1000 × 800
  ["dark", "mapa-oscuro.webp", { width: 1432, height: 800 }],
  ["light", "mapa-claro-movil.webp", { width: 390, height: 844, deviceScaleFactor: 2.6 }],   // móvil: alta densidad
  ["dark", "mapa-oscuro-movil.webp", { width: 390, height: 844, deviceScaleFactor: 2.6 }],
];
for (const [tema, archivo, vista] of VARIANTES) {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: tema }]);
  await page.setViewport(vista);
  await page.goto(URL, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => document.getElementById("preview").hidden, { timeout: 30000 });
  await new Promise((ok) => setTimeout(ok, 800));
  await page.addStyleTag({ content: ".leaflet-control-zoom, .leaflet-control-attribution { display: none }" });   // the credits are in the page text
  const caja = await page.$(".mapwrap");
  await caja.screenshot({ path: join(WEB, archivo), type: "webp", quality: 72 });
  await page.close();
  console.log(archivo);
}
await browser.close();
