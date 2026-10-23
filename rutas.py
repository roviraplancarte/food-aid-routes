"""Rutas de reparto de despensas en La Paz, BCS: reconstrucción del método de 2020 con datos abiertos y hogares simulados.

1. Calles residenciales reales de OpenStreetMap (Overpass) dentro de La Paz.
2. Hogares SIMULADOS sobre esas calles (semilla fija), cada uno con 1 a 3 despensas.
3. Matriz de distancias por calle con OSRM (servidor demo público, una sola consulta, se guarda en caché).
4. Reparto base: sectores por ángulo desde el centro de acopio y vecino más cercano dentro de cada sector.
5. Reparto optimizado: problema de rutas con capacidad (CVRP) resuelto con OR-Tools.
6. Salida: web/resultado.json (rutas, km y trazo por calle de cada ruta) que dibuja web/index.html.
   `datos/` guarda solo la caché de descargas (fuera de git; se regenera).

Uso: .venv/bin/python rutas.py [--hogares 80] [--brigadas 4] [--capacidad 45] [--segundos 30]
"""
import argparse
import json
import math
import random
import urllib.parse
import urllib.request
from pathlib import Path

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

DIR = Path(__file__).resolve().parent
DATOS = DIR / "datos"
UA = {"User-Agent": "rutas-2020/0.1 (portafolio personal; consulta única con caché)"}
CAJA = (24.10, -110.36, 24.17, -110.27)          # sur, oeste, norte, este: zona urbana de La Paz, BCS
ACOPIO = {"nombre": "Centro de acopio (ilustrativo)", "lat": 24.1426, "lon": -110.3128}   # zona centro
SEMILLA = 2020


def descargar(url, datos=None):
    req = urllib.request.Request(url, data=datos, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def calles():
    """Nodos de calles residenciales de OSM en la caja (caché en datos/calles.json)."""
    cache = DATOS / "calles.json"
    if cache.exists():
        return json.loads(cache.read_text())
    s, o, n, e = CAJA
    q = f'[out:json][timeout:90];way["highway"="residential"]({s},{o},{n},{e});node(w);out skel;'
    d = descargar("https://overpass-api.de/api/interpreter", urllib.parse.urlencode({"data": q}).encode())
    nodos = [[round(x["lat"], 6), round(x["lon"], 6)] for x in d["elements"] if x["type"] == "node"]
    cache.write_text(json.dumps(nodos))
    return nodos


def hogares(nodos, n):
    """n hogares simulados en nodos de calle distintos, separados al menos ~150 m entre sí."""
    rnd = random.Random(SEMILLA)
    rnd.shuffle(nodos)
    elegidos = []
    for lat, lon in nodos:
        if all(haversine(lat, lon, a["lat"], a["lon"]) > 0.15 for a in elegidos):
            elegidos.append({"lat": lat, "lon": lon, "despensas": rnd.choice([1, 1, 2, 2, 2, 3])})
        if len(elegidos) == n:
            break
    return elegidos


def haversine(la1, lo1, la2, lo2):
    r = 6371.0
    p1, p2 = math.radians(la1), math.radians(la2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def matriz(puntos):
    """Distancias por calle en metros (OSRM table; caché en datos/matriz.json ligada a los puntos)."""
    cache = DATOS / "matriz.json"
    clave = [[p["lat"], p["lon"]] for p in puntos]
    if cache.exists():
        c = json.loads(cache.read_text())
        if c["puntos"] == clave:
            return c["metros"]
    coords = ";".join(f'{p["lon"]},{p["lat"]}' for p in puntos)
    d = descargar(f"https://router.project-osrm.org/table/v1/driving/{coords}?annotations=distance")
    metros = [[int(round(x or 0)) for x in fila] for fila in d["distances"]]
    cache.write_text(json.dumps({"puntos": clave, "metros": metros}))
    return metros


def largo(ruta, m):
    """Metros de una ruta que sale y vuelve al acopio (índice 0)."""
    tramo = [0] + ruta + [0]
    return sum(m[a][b] for a, b in zip(tramo, tramo[1:]))


def reparto_base(puntos, m, brigadas):
    """Lo que se hace sin optimizar: repartir la ciudad en sectores iguales por ángulo y, dentro de cada uno, ir
    siempre al hogar más cercano. Así es fácil de organizar con un mapa impreso."""
    a0 = puntos[0]
    angulo = lambda p: math.atan2(p["lat"] - a0["lat"], p["lon"] - a0["lon"])
    orden = sorted(range(1, len(puntos)), key=lambda i: angulo(puntos[i]))
    tam = math.ceil(len(orden) / brigadas)
    rutas = []
    for k in range(brigadas):
        pendientes, ruta, actual = set(orden[k * tam:(k + 1) * tam]), [], 0
        while pendientes:
            actual = min(pendientes, key=lambda j: m[actual][j])
            ruta.append(actual)
            pendientes.remove(actual)
        rutas.append(ruta)
    return rutas


def reparto_optimo(puntos, m, brigadas, capacidad, segundos):
    """CVRP: todas las brigadas salen y vuelven al acopio, ninguna carga más de `capacidad` despensas."""
    gestor = pywrapcp.RoutingIndexManager(len(puntos), brigadas, 0)
    modelo = pywrapcp.RoutingModel(gestor)
    dist = modelo.RegisterTransitCallback(lambda i, j: m[gestor.IndexToNode(i)][gestor.IndexToNode(j)])
    modelo.SetArcCostEvaluatorOfAllVehicles(dist)
    carga = modelo.RegisterUnaryTransitCallback(lambda i: puntos[gestor.IndexToNode(i)].get("despensas", 0))
    modelo.AddDimensionWithVehicleCapacity(carga, 0, [capacidad] * brigadas, True, "carga")
    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = segundos
    sol = modelo.SolveWithParameters(params)
    if sol is None:
        raise SystemExit("OR-Tools no encontró solución: sube --capacidad o --brigadas")
    rutas = []
    for v in range(brigadas):
        i, ruta = modelo.Start(v), []
        while not modelo.IsEnd(i):
            nodo = gestor.IndexToNode(i)
            if nodo:
                ruta.append(nodo)
            i = sol.Value(modelo.NextVar(i))
        rutas.append(ruta)
    return rutas


def simplificar(linea, tol=0.00004):
    """Douglas-Peucker sobre (lon, lat): ~4 m de tolerancia. Reduce el JSON del mapa sin cambiar cómo se ve."""
    if len(linea) < 3:
        return linea
    (x1, y1), (x2, y2) = linea[0], linea[-1]
    dx, dy = x2 - x1, y2 - y1
    norma = (dx * dx + dy * dy) ** 0.5
    if norma < 1e-9:   # circuito que empieza y termina en el mismo punto: distancia al punto
        dist = [((x - x1) ** 2 + (y - y1) ** 2) ** 0.5 for x, y in linea[1:-1]]
    else:
        dist = [abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norma for x, y in linea[1:-1]]
    i = max(range(len(dist)), key=dist.__getitem__)
    if dist[i] <= tol:
        return [linea[0], linea[-1]]
    return simplificar(linea[:i + 2], tol)[:-1] + simplificar(linea[i + 1:], tol)


def trazo(ruta, puntos):
    """Trazo por calle (lon, lat) de una ruta completa desde y hacia el acopio, con OSRM route."""
    tramo = [0] + ruta + [0]
    coords = ";".join(f'{puntos[i]["lon"]},{puntos[i]["lat"]}' for i in tramo)
    d = descargar(f"https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson")
    return [[round(x, 5), round(y, 5)] for x, y in simplificar(d["routes"][0]["geometry"]["coordinates"])]


def resumen(nombre, rutas, puntos, m):
    filas = [{"paradas": len(r), "despensas": sum(puntos[i]["despensas"] for i in r), "km": round(largo(r, m) / 1000, 1),
              "puntos": r, "trazo": trazo(r, puntos)} for r in rutas]
    total = round(sum(f["km"] for f in filas), 1)
    print(f"{nombre}: {total} km · " + " | ".join(f'{f["paradas"]} paradas, {f["despensas"]} desp., {f["km"]} km' for f in filas))
    return {"km_total": total, "rutas": filas}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hogares", type=int, default=80)
    ap.add_argument("--brigadas", type=int, default=4)
    ap.add_argument("--capacidad", type=int, default=45)
    ap.add_argument("--segundos", type=int, default=30)
    a = ap.parse_args()
    DATOS.mkdir(exist_ok=True)
    casas = hogares(calles(), a.hogares)
    puntos = [ACOPIO] + casas
    m = matriz(puntos)
    base = resumen("Sectores", reparto_base(puntos, m, a.brigadas), puntos, m)
    opt = resumen("Optimizado", reparto_optimo(puntos, m, a.brigadas, a.capacidad, a.segundos), puntos, m)
    ahorro = round(100 * (1 - opt["km_total"] / base["km_total"]), 1)
    print(f"Ahorro: {ahorro}% de kilómetros")
    (DIR / "web").mkdir(exist_ok=True)
    (DIR / "web" / "resultado.json").write_text(json.dumps({
        "parametros": vars(a), "acopio": ACOPIO, "hogares": casas, "sectores": base, "optimizado": opt,
        "ahorro_pct": ahorro,
        "fuentes": ["Calles: © colaboradores de OpenStreetMap (ODbL)", "Distancias: OSRM sobre datos de OpenStreetMap",
                    "Hogares y despensas: simulados (semilla 2020)"]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
