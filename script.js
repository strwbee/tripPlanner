// firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBeVe7-AUo_pNDO3SeLVyHq_XMB7qrwmBs",
    authDomain: "planningmap-fadf9.firebaseapp.com",
    projectId: "planningmap-fadf9",
    storageBucket: "planningmap-fadf9.firebasestorage.app",
    messagingSenderId: "620504074401",
    appId: "1:620504074401:web:ac7411364b178dc9d988e0"
  };

// firebase initialisation (v8)
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const locationsDB = database.ref("locations");

// leaflet map, created in map html element
var map = L.map("map", {
    zoomControl: true, 
    scrollWheelZoom: false, // disable scroll wheel zooming
    doubleClickZoom: true, // disable zooming on double click
    touchZoom: true, // disable zooming on touch
    dragging: true // allow panning
}).setView([51.512, -0.125], 13);
// load map tiles from OpenStreetMap (free map data yay)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// location list container
var locationList = document.getElementById("locations");
// markers stored so can be removed
var markers = {}; 
var visibleMarkers = {};
var selectedCategory = "all";
var locationIndex = 1;

// avoiding duplicates: check if location alr exists
function locationExists(name) {
    //filter results. if a match exists w name return true
    return locationsDB.orderByChild("name").equalTo(name).once("value")
        .then(snapshot => snapshot.exists());
}

// extract coordinates from google map link. idk how this works chatgpt wrote it lmao
function extractCoordinates(link) {
    const match = link.match(/@([-\d.]+),([-\d.]+)/);
    return match ? { lat: parseFloat(match[1]), lng: parseFloat(match[2]) } : null;
}

// add location to firebase database
// async bc function waits to hear back if it's a duplicate or not
async function addLocation(name, lat, lng, category, link) {
    if (!name.trim()) {
        alert("enter a valid location name");
        return;
    }

    if (await locationExists(name)) {
        alert("location already exists");
        return;
    }

    const newLocation = locationsDB.push();
    newLocation.set({name, lat, lng, category, link, key: newLocation.key, index: locationIndex++});
}

// add from google maps link
async function addLocationFromLink() {
    var link = prompt("enter google maps link pls:");
    if (!link) return;

    var coordinates = extractCoordinates(link);
    if (!coordinates) {
        alert("invalid link soz");
        return;
    }

    var placeName = prompt("enter name of place:");
    if (!placeName) return;

    var categoryInput = prompt("enter category (attraction (A), market (M), cafe (C), dinner (D)): ").toLowerCase();
    const categoryMap = { "a": "attraction", "m": "market", "c": "cafe", "d": "dinner" };
    var category = categoryMap[categoryInput] || "other";

    addLocation(placeName, coordinates.lat, coordinates.lng, category, link);
}

// handle new location for frontend
// snapshot: object represetning the new entry
function handleNewLocation(snapshot) {
    var data = snapshot.val();
    var locationCount = Object.keys(markers).length + 1;

    // food categories have pink marker
    const isPink = ["cafe", "dinner", "market"].includes(data.category.toLowerCase());
    const markerColor = isPink? "#f09c9c" : "#4c95d4";
    const borderColor = isPink ? "#a34f4f" : "#2b6597";

    // custom marker with a location index inside
    var marker = L.marker([data.lat, data.lng], {
        icon: L.divIcon({
            className: "custom-marker",
            html: `
                <div style="position: relative; width: 25px; height: 25px; background-color:${markerColor};
                            border-radius: 50%; display: flex; align-items: center; justify-content: center;
                            color: white; font-weight: bold; font-size: 12px; border: 2px solid ${borderColor};">
                    ${locationCount}
                </div>`,
            iconSize: [25, 25],
            iconAnchor: [12, 25]
        })
    }).addTo(map).bindPopup(
        `<div style="font-size: 12px; line-height: 1.0;">
            <a href="${data.link}" target="_blank">${data.name}</a>
        </div>`,
        { autoPan: true, offset: [0, -20] } // moves popup above marker
    );

    markers[data.key] = {marker, category: data.category, index: locationCount}; // store for later removal

    if (selectedCategory === "all" || selectedCategory === data.category) {
        marker.addTo(map);
        visibleMarkers[data.key] = marker;
    }

    updateLocations();
}

// update saved locations list
function updateLocations() {
    // clear
    locationList.innerHTML = "";

    Object.keys(markers).forEach(key => {
        if (selectedCategory === "all" || markers[key].category === selectedCategory) {
            var data = markers[key];
            locationList.insertAdjacentHTML('beforeend', `
                <div class="locationItem" id="loc-${key}" style="display: flex; align-items: center; gap: 10px;">
                    <span class="location-index">${data.index}.</span>
                    <a href="${data.marker.getPopup().getContent().match(/href="(.*?)"/)[1]}" target="_blank">
                        ${data.marker.getPopup().getContent().replace(/<.*?>/g, '')}
                    </a>
                    <button onclick="removeLocation('${key}')" style="margin-left: auto;">Remove</button>
                </div>
            `);
        }
    });
}

// remove from DB
function removeLocation(key) {
    locationsDB.child(key).remove();
}

// handle removed for frontend
function handleRemoval(snapshot) {
    var data = snapshot.val();
    // loc acts as location prefix. can't start with -
    var locationElement = document.getElementById(`loc-${data.key}`);

    // check if location even exists to remove
    if (locationElement) {
        locationElement.remove();
    }
    else {
        alert("no location to remove");
    }

    if (markers[data.key]) {
        map.removeLayer(markers[data.key]); // delete from leaflet map
        delete markers[data.key]; // delete from markers storage
        delete visibleMarkers[data.key];
    }

    updateLocations();
}

// filter visible markers based on selected category
function filterMarkers(category) {
    const categoryMap = { "a": "attraction", "m": "market", "c": "cafe", "d": "dinner", "all": "all", "other": "other" };
    selectedCategory = categoryMap[category] || category;

    Object.keys(markers).forEach(key => {
        if (selectedCategory === "all" || markers[key].category === selectedCategory) {
            if (!visibleMarkers[key]) {
                markers[key].marker.addTo(map);
                visibleMarkers[key] = markers[key].marker;
            }
        } else {
            if (visibleMarkers[key]) {
                map.removeLayer(visibleMarkers[key]);
                delete visibleMarkers[key];
            }
        }
    });
}

// .on : DB is listening for events. child added/removed are firebase listeners
locationsDB.on("child_added", handleNewLocation);
locationsDB.on("child_removed", handleRemoval);

// users add from link
document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("addLocationButton").addEventListener("click", addLocationFromLink);

    //filter selection buttons
    const filterButtons = document.querySelectorAll("#filterContainer button");

    filterButtons.forEach(button => {
        button.addEventListener("click", function () {
            filterButtons.forEach(btn => btn.classList.remove("active"));

            // add active class to the clicked button
            this.classList.add("active");

            const categoryMap = {
                "allFilter": "all",
                "attractionFilter": "a",
                "marketFilter": "m",
                "cafeFilter": "c",
                "dinnerFilter": "d",
                "otherFilter": "other"
            };

            filterMarkers(categoryMap[this.id]);
            updateLocations();
        });
    });
});
