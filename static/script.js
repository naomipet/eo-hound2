var bounds
/**
 * Initialize the Google Map and add our custom layer overlay.
 * @param  {string} mapId
 * @param  {string} token
 */
const initialize = () => {
  // The Google Maps API calls getTileUrl() when it tries to display a map
  // tile. This is a good place to swap in the MapID and token we got from
  // the Node.js script. The other values describe other properties of the
  // custom map type.
  const osmMapOptions = {
    getTileUrl: function(coord, zoom) {
        // "Wrap" x (longitude) at 180th meridian properly
        // NB: Don't touch coord.x: because coord param is by reference, and changing its x property breaks something in Google's lib
        var tilesPerGlobe = 1 << zoom
        var x = coord.x % tilesPerGlobe
        if (x < 0) {
            x = tilesPerGlobe+x;
        }
        // Wrap y (latitude) in a like manner if you want to enable vertical infinite scrolling
        return "https://tile.openstreetmap.org/" + zoom + "/" + x + "/" + coord.y + ".png";
    },
    tileSize: new google.maps.Size(256, 256),
    name: "OpenStreetMap",
    maxZoom: 18
  }
  // Create the osm map type.
  const osmMapType = new google.maps.ImageMapType(osmMapOptions)
  const myLatLng = new google.maps.LatLng(23.842523, 54.466968)
  const mapOptions = {
    center: myLatLng,
    zoom: 8,
    maxZoom: 10,
    streetViewControl: false,
  }
  // Create the base osm Map.
  map = new google.maps.Map(document.getElementById('map'), mapOptions)
  map.mapTypes.set('OpenStreetMap', osmMapType)
  map.setMapTypeId('OpenStreetMap')

  var worldBounds = new google.maps.LatLngBounds(new google.maps.LatLng(-50,-90),
                                               new google.maps.LatLng(70,90))
  map.fitBounds(worldBounds)
  // Add the layers to the map.
  map.overlayMapTypes.setAt(0, osmMapType)
  map.overlayMapTypes.push(null)// Placeholder for ee

  //form and general statistic
  var formInput = document.getElementById('form')
  map.controls[google.maps.ControlPosition.LEFT_TOP].push(formInput)

  var divOpen = document.getElementById("formClose")
  map.controls[google.maps.ControlPosition.TOP_LEFT].push(divOpen)

  var statisticDiv = document.getElementById("containerStatGen")
  map.controls[google.maps.ControlPosition.RIGHT_TOP].push(statisticDiv)

}

var clearImageSample = function(){
  map.overlayMapTypes.setAt(1, null)
}

var addLayers = function(mapId, token){
  mapId = mapId.replace(/"/g, '').replace(/\[|\]/g, '')
  token= token.replace(/"/g, '').replace(/\[|\]/g, '')
  ids = mapId.split(",")
  tokens = token.split(",")
  if(ids.length > 0){
    ids.forEach(addEELayers)
    function addEELayers(value, index, array){
      // The Google Maps API calls getTileUrl() when it tries to display a map
      // tile. This is a good place to swap in the MapID and token we got from
      // the Node.js script. The other values describe other properties of the
      // custom map type.
      var eeMapOptions = {
        getTileUrl: (tile, zoom) => {
          const baseUrl = 'https://earthengine.googleapis.com/map';
          const url = [baseUrl, value, zoom, tile.x, tile.y].join('/');
          return `${url}?token=${tokens[index]}`;
        },
        tileSize: new google.maps.Size(256, 256),
        name: "ee"+index.toString()
      }
      // Create the map type.
      var eeMapType = new google.maps.ImageMapType(eeMapOptions);
      // Add the EE layer to the map.
      map.overlayMapTypes.setAt(index+1, eeMapType)
    }
  }
}
var listener1
function loadGeoJsonString(geoString) {
  ClearAllFeatures()
  listener1 = map.data.addListener('addfeature', fitJsonBounds)
  // Define the LatLng coordinates for another inner path.
  var geojson = JSON.parse(geoString)
  map.data.addGeoJson(geojson)
  map.data.setStyle({
    fillColor: 'transparent',
    strokeWeight: 2
  })
  var bounds = new google.maps.LatLngBounds()
  return geojson
}

function gm_authFailure() { alart('aaa')}

var fitJsonBounds = function(e) {
  bounds = new google.maps.LatLngBounds()
  processPoints(e.feature.getGeometry(), bounds.extend, bounds)
  map.fitBounds(bounds);
  var zoom = map.getZoom()
  map.setZoom(zoom - 1)
  google.maps.event.removeListener(listener1)
}

function processPoints(geometry, callback, thisArg) {
  if (geometry instanceof google.maps.LatLng) {
    callback.call(thisArg, geometry)
  } else if (geometry instanceof google.maps.Data.Point) {
    callback.call(thisArg, geometry.get())
  } else {
    geometry.getArray().forEach(function(g) {
      processPoints(g, callback, thisArg)
    })
  }
}

function ClearAllFeatures(){
  map.data.forEach(function(feature) {
    map.data.remove(feature)
  })
}

function ClearGranules(){
  map.data.forEach(function(feature) {
    var name = feature.getProperty('appName')
    if(name != undefined){
      map.data.remove(feature)
    }
  })
}

function addGranulesToMap(geojson, highligtedFeature) {
  if(!isEmpty(geojson)){
  map.data.addGeoJson(geojson)
  setFeatureStyle(highligtedFeature)
  }
}

function setFeatureStyle(highligtedFeature){
  map.data.setStyle(function(feature) {
    var featureName = feature.getProperty('appName')
    var color = "gray"
    var strokeWeight = 2
    if (featureName == highligtedFeature) {
      color = "green"
      var strokeWeight = 4
    }
    return {
      fillColor: 'transparent',
      strokeColor: color,
      strokeWeight: strokeWeight
    }
  })
}

function isEmpty(obj) {
  for(var prop in obj) {
      if(obj.hasOwnProperty(prop))
          return false
  }
  return true
}
