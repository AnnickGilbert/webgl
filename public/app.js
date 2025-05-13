// Utilisation de Mapbox GL JS au lieu de MapLibre GL JS
mapboxgl.accessToken =
  "pk.eyJ1IjoidHJhbnRoaXYiLCJhIjoiY21hYjB6enkyMjF6azJqc2Jpd3o2M2hsZSJ9.WVK_3gfOJ4JCbc0SF5J8vg";

// Définition de la clé API pour OpenRouteService
const ORS_API_KEY = "5b3ce3597851110001cf6248d46056582f2043e1b9075f45fce4bb57"; // À remplacer par votre clé

// Initialisation de la carte 3D avec les mêmes paramètres que votre exemple
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v11",
  center: [2.3522, 48.8566], // Paris
  zoom: 16,
  pitch: 45, // Inclinaison pour l'effet 3D
  bearing: -17.6, // Rotation de la carte
  antialias: true, // Pour un meilleur rendu des bâtiments 3D
});

// Variables pour stocker les véhicules
let vehicles = [];

// Fonction pour générer un GeoJSON à partir des véhicules
function generateGeoJSON() {
  return {
    type: "FeatureCollection",
    features: vehicles
      .filter((v) => v.lng !== undefined && v.lat !== undefined)
      .map((v) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [v.lng, v.lat],
        },
        properties: {
          id: v.id,
          speed: v.speed,
          power: v.power,
        },
      })),
  };
}

// Calcul de distance en mètres entre deux points
function distanceMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Création d'un véhicule avec son itinéraire
function createVehicleWithRoute(start, end, speed, power) {
  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${start[0]},${start[1]}&end=${end[0]},${end[1]}&avoid_features=ferries|tracks|fords`;

  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      if (!data.features || !data.features[0]) {
        console.error("Pas d'itinéraire trouvé");
        return;
      }

      const path = data.features[0].geometry.coordinates;
      if (!path || path.length < 2) return;

      const newVehicle = {
        id: vehicles.length,
        path,
        pathIndex: 0,
        lng: path[0][0],
        lat: path[0][1],
        speed,
        power,
        stopped: false,
        progress: 0,
        lastUpdate: performance.now(),
      };
      vehicles.push(newVehicle);

      // Si c'est le premier véhicule, on commence l'animation
      if (vehicles.length === 1) {
        requestAnimationFrame(moveVehicles);
      }

      // Mise à jour du tableau de véhicules
      updateVehicleTable();
    })
    .catch((error) => {
      console.error("Erreur lors de la récupération de l'itinéraire:", error);
    });
}

// Déplacement des véhicules
function moveVehicles() {
  vehicles.forEach((vehicle) => {
    if (vehicle.stopped) return;

    const path = vehicle.path;
    let i = vehicle.pathIndex;
    if (!path || i >= path.length - 1) {
      vehicle.stopped = true; // Il est arrivé
      return;
    }

    const now = performance.now();
    const elapsedSec = (now - vehicle.lastUpdate) / 1000;
    vehicle.lastUpdate = now;

    const current = [vehicle.lng, vehicle.lat];
    const target = [path[i + 1][0], path[i + 1][1]];
    const dist = distanceMeters(current, target);
    const moveDist = vehicle.speed * elapsedSec;

    if (moveDist >= dist) {
      vehicle.lng = target[0];
      vehicle.lat = target[1];
      vehicle.pathIndex++;
      if (vehicle.pathIndex >= path.length - 1) {
        vehicle.stopped = true; // On s'arrête
      }
    } else {
      const dx = target[0] - vehicle.lng;
      const dy = target[1] - vehicle.lat;
      const ratio = moveDist / dist;
      vehicle.lng += dx * ratio;
      vehicle.lat += dy * ratio;
    }
  });

  if (map.getSource("vehicles")) {
    map.getSource("vehicles").setData(generateGeoJSON());
  }

  updateVehicleTable();
  requestAnimationFrame(moveVehicles);
}

// Ajout de plusieurs véhicules
function addVehicles() {
  const nb = parseInt(document.getElementById("nbVehicles").value);
  const minSpeed = parseFloat(document.getElementById("minSpeed").value) / 3.6; // km/h vers m/s
  const maxSpeed = parseFloat(document.getElementById("maxSpeed").value) / 3.6;
  const minPower = parseFloat(document.getElementById("minPower").value);
  const maxPower = parseFloat(document.getElementById("maxPower").value);

  for (let i = 0; i < nb; i++) {
    const start = [2.29 + Math.random() * 0.1, 48.83 + Math.random() * 0.06];
    const end = [2.29 + Math.random() * 0.3, 48.83 + Math.random() * 0.1]; // Destination plus adaptée à Paris
    const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
    const power = minPower + Math.random() * (maxPower - minPower);
    createVehicleWithRoute(start, end, speed, power);
  }

  closeControlPanel();
}

// Gestion du panneau de contrôle
function openControlPanel() {
  document.getElementById("controlPanel").style.display = "block";
}

function closeControlPanel() {
  document.getElementById("controlPanel").style.display = "none";
}

// Mise à jour du tableau des véhicules
function updateVehicleTable() {
  const container = document.getElementById("vehicleTable");
  if (!container) return;

  let html = "<h3>Suivi des véhicules</h3>";
  html +=
    "<table><tr><th>ID</th><th>Lat</th><th>Lng</th><th>Vitesse</th><th>Puissance</th><th>Étape suivante</th></tr>";
  vehicles.forEach((v) => {
    const next = v.path && v.path[v.pathIndex + 1];
    html += `<tr>
            <td>${v.id}</td>
            <td>${v.lat.toFixed(4)}</td>
            <td>${v.lng.toFixed(4)}</td>
            <td>${(v.speed * 3.6).toFixed(1)} km/h</td>
            <td>${v.power.toFixed(0)} CV</td>
            <td>${
              next ? `${next[1].toFixed(4)}, ${next[0].toFixed(4)}` : "-"
            }</td>
        </tr>`;
  });
  html += "</table>";
  container.innerHTML = html;
}

// Configuration de la carte au chargement
map.on("load", () => {
  // Ajout du relief (terrain 3D)
  map.addSource("mapbox-dem", {
    type: "raster-dem",
    url: "mapbox://mapbox.mapbox-terrain-dem-v1",
    tileSize: 512,
  });

  map.setTerrain({
    source: "mapbox-dem",
    exaggeration: 1.5,
  });

  // Ajout des bâtiments 3D
  map.addLayer({
    id: "3d-buildings",
    source: "composite",
    "source-layer": "building",
    filter: ["==", "extrude", "true"],
    type: "fill-extrusion",
    minzoom: 13,
    paint: {
      "fill-extrusion-color": "#ddd",
      "fill-extrusion-height": [
        "interpolate",
        ["linear"],
        ["zoom"],
        15,
        0,
        15.05,
        ["get", "height"],
      ],
      "fill-extrusion-base": [
        "interpolate",
        ["linear"],
        ["zoom"],
        15,
        0,
        15.05,
        ["get", "min_height"],
      ],
      "fill-extrusion-opacity": 0.6,
    },
  });

  // Ajout de la source de données pour les véhicules
  map.addSource("vehicles", {
    type: "geojson",
    data: generateGeoJSON(),
  });

  // Ajout d'une couche pour les véhicules
  map.addLayer({
    id: "vehicle-layer",
    type: "circle",
    source: "vehicles",
    paint: {
      "circle-radius": 6,
      "circle-color": "#ff0000",
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
    },
  });

  // Ajout d'une couche pour les trajectoires des véhicules
  map.addSource("routes", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [],
    },
  });

  map.addLayer({
    id: "route-layer",
    type: "line",
    source: "routes",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#3b82f6",
      "line-width": 2,
      "line-opacity": 0.7,
    },
  });

  // Ajout des contrôles de navigation
  map.addControl(new mapboxgl.NavigationControl(), "top-right");

  // Gestion des clics sur les véhicules
  map.on("click", "vehicle-layer", (e) => {
    const props = e.features[0].properties;
    const speedKmh = (parseFloat(props.speed) * 3.6).toFixed(1);

    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(
        `<b>Véhicule ${
          props.id
        }</b><br>Vitesse : ${speedKmh} km/h<br>Puissance : ${parseFloat(
          props.power
        ).toFixed(0)} CV`
      )
      .addTo(map);
  });

  // Ajout d'un véhicule de démonstration
  const demoStart = [2.292, 48.853];
  const demoEnd = [2.352, 48.856]; // Un trajet dans Paris
  createVehicleWithRoute(demoStart, demoEnd, 10, 150); // 10 m/s = 36 km/h

  // Démarrer l'animation si elle n'est pas encore active
  if (vehicles.length > 0) {
    requestAnimationFrame(moveVehicles);
  }
});

// Fonction pour mettre à jour les trajectoires des véhicules
function updateRoutes() {
  const features = vehicles.map((v) => {
    // Créer une ligne pour le chemin parcouru
    return {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: v.path ? v.path.slice(0, v.pathIndex + 1) : [],
      },
      properties: {
        id: v.id,
      },
    };
  });

  if (map.getSource("routes")) {
    map.getSource("routes").setData({
      type: "FeatureCollection",
      features: features,
    });
  }
}

// Assurez-vous que mapboxgl.accessToken est déjà défini
const geocoder = new MapboxGeocoder({
  accessToken: mapboxgl.accessToken,
  mapboxgl: mapboxgl,
  placeholder: "Rechercher une ville…",
  marker: false, // si vous ne voulez pas ajouter automatiquement un marker
});

// Ajout du contrôle de recherche en haut à droite
map.addControl(geocoder, "top-right");

// (Optionnel) recentrer la carte sur la ville choisie
geocoder.on("result", (e) => {
  const coords = e.result.center; // [lng, lat]
  map.flyTo({ center: coords, zoom: 12 });
});

// Mise à jour périodique des trajectoires
setInterval(updateRoutes, 1000);

// Initialisation des écouteurs d'événements pour le panneau de contrôle
document.addEventListener("DOMContentLoaded", () => {
  // S'assurer que les éléments existent
  if (document.getElementById("openControlBtn")) {
    document
      .getElementById("openControlBtn")
      .addEventListener("click", openControlPanel);
  }

  if (document.getElementById("closeControlBtn")) {
    document
      .getElementById("closeControlBtn")
      .addEventListener("click", closeControlPanel);
  }

  if (document.getElementById("addVehiclesBtn")) {
    document
      .getElementById("addVehiclesBtn")
      .addEventListener("click", addVehicles);
  }
});
