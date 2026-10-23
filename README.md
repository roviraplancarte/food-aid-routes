# Food-aid routes, La Paz 2020

In the first weeks of COVID-19, Alianza Comunitaria BCS (a coalition of businesses and nonprofits) organized
food-aid deliveries for families in Baja California Sur who could not go out to work. As the data analyst of
CIENCIASBCS, one of its members, I planned the delivery routes for the brigades in La Paz.

The 2020 household data is not public, so this project rebuilds the method from scratch on real streets with
simulated households.

## What it does
1. Downloads residential streets of La Paz from OpenStreetMap (Overpass API).
2. Places 80 **simulated** households on those streets (fixed seed), each needing 1 to 3 food packages.
3. Gets road distances between every pair of points from OSRM.
4. Plans the deliveries two ways for 4 brigades that start and end at one collection point:
   - **By sector:** four equal slices around the collection point, nearest pending house first. This is how you
     plan with a printed map.
   - **Optimized:** a capacitated vehicle routing problem (CVRP) solved with Google OR-Tools, at most 45 packages
     per brigade.
5. Writes `web/resultado.json`, which `web/index.html` draws on a map.

With the default settings the optimized plan drives **93.5 km instead of 139.8 km (33% less)** for the same
houses. The number depends on the simulated households; the point is the method.

## Run it
```
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python rutas.py            # options: --hogares 80 --brigadas 4 --capacidad 45 --segundos 30
cd web && python3 -m http.server     # open http://localhost:8000
```
Downloads are cached in `datos/`, so later runs don't hit the public APIs again.

## Data and credits
- Streets and map tiles: © OpenStreetMap contributors, ODbL.
- Road distances and route shapes: OSRM demo server (one table request and one route request per brigade).
- Households, package counts and the collection point are simulated or illustrative. Nothing here describes real
  people or the real 2020 deliveries.
- Coalition background: [Cómo Vamos La Paz](https://comovamoslapaz.org/acbcs/).

## About `web/`
`web/` is the page as it appears on the author's personal site. Opened on its own it works the same, but it falls back
to system fonts and its menu links point to the rest of that site.

## License
Code: MIT (see `LICENSE`). Map data and tiles: © OpenStreetMap contributors, ODbL.
