/**
 * server.js
 *
 * Works in the local development environment and when deployed. If successful,
 * shows a single web page with the SRTM DEM displayed in a Google Map. See
 * accompanying README file for instructions on how to set up authentication.
 */
const ee = require('@google/earthengine');
const express = require('express');
const handlebars  = require('express-handlebars');
var bodyParser = require('body-parser');
var moment = require('moment');

const app = express();


app.engine ('hbs', handlebars( {
  extname: 'hbs',
  defaultView: 'default',
  layoutsDir: __dirname + '/views/',
  partialsDir: __dirname + '/views/partials/'
} ) );
app.set('view engine', '.hbs');
app.use('/static', express.static('static'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json())

app.get('/', (request, response) => {
  response.render('index')
})

app.get('/filter', (request, response) => {
  //input validation
  var params = GetCollectionParams(request.query.imageCollection)
  var dates = ValidateDates(request.query.dateStart, request.query.dateEnd, response)
  if(dates.isError == true)
    return
  var cloudFilter = ValidatePrecentNumber(request.query.cloudFilter, 'cloud cover', response)
  if(cloudFilter.isError == true)
    return
  var bbox = ValidateGeometry(request.query.coordinates, response)
  if(bbox.isError == true)
    return
  var loadImage = false
  if(request.query.showImage == 'true'){
    loadImage = true
  }

  //collection of images including all granules related to bbox, for statistics
  var collection = ee.ImageCollection(params.collectionSource).filterBounds(bbox.featureCollection).filterDate(dates.start,dates.end).filter(ee.Filter.lt(params.cloudDescriptor, cloudFilter.number))

  var count = collection.size().getInfo()
  var output = {} // empty Object
  AddFieldToJson(output, 'count', count)
  //check if any images exist
  if(count == '0'){
    Error('No images for required dates',response)
  }
  else {
    var bboxArea = bbox.featureCollection.geometry().area(10).getInfo()
    var footprintData = GetFootpringData(params.footprintSource, bbox.featureCollection, bboxArea, params.nameDescriptor, response)
    if(footprintData.isError == true)
      return
    //calc statistics on images
    var cloudsStat = GetCloudStat(collection, params.cloudDescriptor)

    // Get the date range of images in the collection.
    var range = collection.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
    var minDate = ee.Date(range.get('min'))
    var maxDate = ee.Date(range.get('max'))
    var downloadNames = collection.aggregate_array(params.idDescriptor).getInfo()
    //output data
    AddFieldToJson(output, 'cloudsAvg', cloudsStat.mean.getInfo().toFixed(2))
    AddFieldToJson(output, 'minDate', minDate.format('d-M-Y').getInfo())
    AddFieldToJson(output, 'maxDate', maxDate.format('d-M-Y').getInfo())
    AddFieldToJson(output, 'granulesDescending', footprintData.covarageDescending)
    AddFieldToJson(output, 'granulesAscending', footprintData.covarageAscending)
    AddFieldToJson(output, 'names', footprintData.names)
    AddFieldToJson(output, 'aream2', bboxArea.toFixed(2))
    AddFieldToJson(output, 'downloadNames', downloadNames)

    var mapid1 =[]
    var token1 =[]
    if(loadImage == true){
      //collection of images clipped to bbox, for image sample
      var filteredCollection = collection.map(function(im){return im.clip(bbox.featureCollection)})

      var rgbVis = {
        min: 0.0,
        max: 3000
      };
      //get maps tokens and respond
      var min = filteredCollection.min().select('B4', 'B3', 'B2');
      min.getMap(rgbVis, ({mapid, token}) => {
        mapid1.push(mapid.toString())
        token1.push(token.toString())
        AddFieldToJson(output, 'mapid', mapid1)
        AddFieldToJson(output, 'token', token1)
        response.send(output);
      })
    }
    else {
      response.send(output);
    }
  }
})

app.get('/granule', (request, response) => {
  //validate input
  var params = GetCollectionParams(request.query.imageCollection)
  var cloudFilter = ValidatePrecentNumber(request.query.cloudFilter, 'cloud cover', response)
  if(cloudFilter.isError == true)
    return
  var dates = ValidateDates(request.query.dateStart, request.query.dateEnd, response)
  if(dates.isError == true)
    return
  var granule = ValidateGranuleName(request.query.name, params.collectionName, response)
  if(granule.isError == true)
    return
  //collection of images including all granules related to bbox, for statistics
  var granuleImages, orbitDirection

  if(params.collectionName == 'Landsat'){
    var path = Number(granule.name.slice(0, 3));
    var row = Number(granule.name.slice(3, 6));
    granuleImages = ee.ImageCollection(params.collectionSource).filterMetadata('WRS_PATH','equals', path).filterMetadata('WRS_ROW','equals', row).filterDate(dates.start,dates.end).filter(ee.Filter.lt(params.cloudDescriptor, cloudFilter.number))
  }
  else {
    granuleImages = ee.ImageCollection(params.collectionSource).filterMetadata('MGRS_TILE', 'equals', granule.name).filterDate(dates.start,dates.end).filter(ee.Filter.lt(params.cloudDescriptor, cloudFilter.number))
  }
  var count = granuleImages.size().getInfo();
  if(count > 0){
    var orbitDirection = GetOrbitDirection(granuleImages.first(), params.collectionName, params.orbitDirDescriptor)
    var clouds = granuleImages.aggregate_array(params.cloudDescriptor)

    // Get the date range of images in the collection.
    var range = granuleImages.reduceColumns(ee.Reducer.minMax(), ["system:time_start"])
    //var minDate = ee.Date(range.get('min'))
    //var maxDate = ee.Date(range.get('max'))
    var dates = GetImageDates(granuleImages)
    var datesList = dates.getInfo().map(date => new Date(date))
    var cloudList = clouds.getInfo().map(cloud => parseFloat(cloud))
    var maxDate=new Date(Math.max.apply(null,datesList));
    var minDate=new Date(Math.min.apply(null,datesList));
    var revisitTime = (((maxDate-minDate)/86400000)/(count-1)).toFixed(2)
    var histLists = GetHistogramLists(datesList, cloudList);
    var downloadNames = granuleImages.aggregate_array(params.idDescriptor).getInfo()
    response.render('statistic', {name: granule.name, orbitDirection: orbitDirection, start: minDate.toLocaleDateString("en-US"), end: maxDate.toLocaleDateString("en-US"), numOfImages: count, revisitTime: revisitTime, labels: histLists.labels, dataCloud:histLists.data, dataCount:histLists.numOfImages, downloadNames: downloadNames});
  }
  else{
    Error('No images for the required tile', response)
  }
})

//documentation page
app.get('/about', (request, response) => {
  response.render('about')
})

//render 404 error page
app.use(function(req, res, next) {
  var error = res.status(404)
  res.render('404')
})

//render 500 error page
app.use(function(req, res, next) {
  var error = res.status(500)
  res.render('500')
})



// Private key, in `.json` format, for an Earth Engine service account.
const PRIVATE_KEY = require('./privatekey.json');
const PORT = process.env.PORT || 3000;

ee.data.authenticateViaPrivateKey(PRIVATE_KEY, () => {
  ee.initialize(null, null, () => {
    app.listen(PORT);
    console.log(`Listening on port ${PORT}`);
  });
});

//utils

GetFootpringData = function(footprintSource, bbox, bboxArea, nameDescriptor,response){
  var footprint, names
  var covarageDescending ={}
  var  covarageAscending = {}
  try{
    //feature collection of all granules partially covering the bbox
    footprint = ee.FeatureCollection(footprintSource).filterBounds(bbox)
    covarageDescending = GetCoverage(footprint, bbox, bboxArea, nameDescriptor).getInfo()
    names = footprint.aggregate_array(nameDescriptor).getInfo()

    return {
        isError: false,
        names: names,
        covarageDescending: covarageDescending,
        covarageAscending: covarageAscending
    };
  }
  catch(e){
    Error('Error in current query, try using smaller area or shorter period')
    return{
      isError: true
    }
  }
}



GetCoverage = function(geomeries, bbox, bboxArea, nameDescriptor) {
  /*gets the coverage precentage of a bbox in a feature*/
  return ee.FeatureCollection(geomeries.map(function(feature) {
    var inter = feature.intersection(bbox.geometry(), 5)
    var featureInt = ee.Feature(inter)
    var name = feature.get(nameDescriptor)
    feature = feature.set({appName: name})
    return feature.set({areaPrecent: featureInt.geometry().area().divide(bboxArea).multiply(100)})
  }))
}

GetCloudStat = function(collection, cloudDescriptor){
  var mean = collection.reduceColumns({
        reducer: ee.Reducer.mean(),
        selectors: [cloudDescriptor],
      })
  return {
      mean: mean.get('mean'),
  };
}


RemoveZerosFromList = function(list){
  var mappingFunc = function(item, newlist) {
    newlist = ee.List(newlist)
    return ee.List(ee.Algorithms.If(item, newlist.add(item), newlist))
  }
  return ee.List(list.iterate(mappingFunc, ee.List([])))
}

GetImageDates = function(collection) {
  return ee.List(collection.toList(collection.size()).map(function(img){
    return ee.Image(img).date().format()
  }))
}

ValidatePrecentNumber = function(val, name, response){
    try{
      var number = Number(val);
      if(isNaN(number) || number<0 || number>100)
        throw 1
      return{
        isError: false,
        number: number
      }
    }
    catch(e){
      Error('Error in inserted ' + name + ' precent', response)
      return{
        isError: true
      }
    }
}

ValidateGranuleName = function(name, collection, response){
    try{
      if(name == undefined || name == '')
        throw 'aaa'
      if(collection == 'Landsat'){
        var number = Number(name);
        if(isNaN(number) || number<100000)
          throw 1
      }
      return{
        isError: false,
        name: name
      }
    }
    catch(e){
      Error('Error in tile id', response)
      return{
        isError: true
      }
    }
}

ValidateDates = function(start, end, response){

  try{
    if(!moment(start, 'YYYY-MM-DD',true).isValid() || !moment(end, 'YYYY-MM-DD',true).isValid())
      throw 1
    dateStart = new Date(start)
    dateEnd = new Date(end)
    if(dateStart>dateEnd)
      throw 1
    else {
      return{
        isError: false,
        start: start,
        end: end
      }
    }
  }
  catch(e){
    Error('Error in inserted dates', response)
    return{
      isError: true
    }
  }
}

ValidateGeometry = function(coordinates, response){
  try{
  var coordList = coordinates.split(",")
    var geo =[]
    var numOfCoord = coordList.length / 2
    if(numOfCoord <= 2)
      throw 1
    for (var i = 0; i < numOfCoord; i++){
      var e = parseFloat(coordList[2*i])
      var n = parseFloat(coordList[2*i+1])
      if(isNaN(e) || isNaN(e))
        throw 1
      geo.push([e, n])
    }
    var poly = ee.Geometry.Polygon(geo, null, false)
    var bbox = ee.FeatureCollection(poly)
    return {
      isError: false,
      featureCollection: bbox
    }
  }
  catch(e){
    Error('Invalid geometry', response)
    return{
      isError: true
    }
  }
}

GetOrbitDirection = function(image, collectionName, orbitDirDescriptor){
  var direction = '';
  if(collectionName == 'Landsat')
    direction = 'DESCENDING'
  else{
    direction = image.get(orbitDirDescriptor).getInfo()
  }
  return direction
}

GetCollectionParams = function(name){
  switch(name) {
    case 'Landsat': //not operational!
      collectionSource = 'LANDSAT/LC08/C01/T1_SR'
      collectionName = 'Landsat'
      cloudDescriptor = 'CLOUD_COVER'
      nameDescriptor = 'WRSPR'
      orbitDirDescriptor = 'MODE'
      idDescriptor = 'LANDSAT_ID'
      footprintSource = 'users/naomipet/landsat_descending'
      break
    case 'Sentinel2A':
      collectionSource = 'COPERNICUS/S2_SR'
      collectionName = 'Sentinel2A'
      cloudDescriptor = 'CLOUDY_PIXEL_PERCENTAGE'
      nameDescriptor = 'Name'
      orbitDirDescriptor = 'SENSING_ORBIT_DIRECTION'
      idDescriptor = 'PRODUCT_ID'
      footprintSource = 'users/naomipet/sentinel2_tiles_world'
      break
    default:
      collectionSource = 'COPERNICUS/S2'
      collectionName = 'Sentinel1C'
      cloudDescriptor = 'CLOUDY_PIXEL_PERCENTAGE'
      nameDescriptor = 'Name'
      orbitDirDescriptor = 'SENSING_ORBIT_DIRECTION'
      idDescriptor = 'PRODUCT_ID'
      footprintSource = 'users/naomipet/sentinel2_tiles_world'
  }
  return {
      collectionSource: collectionSource,
      collectionName: collectionName,
      cloudDescriptor: cloudDescriptor,
      nameDescriptor: nameDescriptor,
      orbitDirDescriptor: orbitDirDescriptor,
      idDescriptor: idDescriptor,
      footprintSource: footprintSource
  };
}

AddFieldToJson = function(base, key, value){
  base[key] = []; // empty Array, which you can push() values into
  base[key]=value;
}

GetHistogramLists = function(datesList, cloudList){
  //var datesStrList = dates.split(',')
  //var cloudsStrList = clouds.split(',')

  var firstYear = datesList[0].getYear();
  var lastYear = datesList[datesList.length-1].getYear();
  var years = lastYear - firstYear + 1;
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var labels = []
  var data = []
  var numOfImages = []
  if(years == 1){
    var firstMonth = datesList[0].getMonth();
    var lastMonth = datesList[datesList.length-1].getMonth()
    var months = lastMonth - firstMonth + 1;
    for(var i = 0; i < months; i++){
      var month = firstMonth + i;
      labels[i] = monthNames[month]
      var avg = 0;
      var count = 0;
      numOfImages[i] = 0;
      for(j = 0; j < cloudList.length; j++){
        if(datesList[j].getMonth() == month){
          avg += cloudList[j]
          count ++;
        }
      }
      data[i] = avg/count;
      numOfImages[i] = count;
    }
  }
  else {
    for(var i = 0; i < years; i++){
      var year = firstYear + i
      labels[i] = year + 1900;
      var avg = 0;
      var count = 0;
      numOfImages[i] = 0;
      for(j = 0; j < cloudList.length; j++){
        if(datesList[j].getYear() == year){
          avg += cloudList[j]
          numOfImages[i]++;
          count ++;
        }
      }
      data[i] = avg/count;
    }
  }
  return {
      labels: labels,
      data: data,
      numOfImages: numOfImages
  };
}

var Error = function(message, response){
  response.render('errorNoData', {error: message});
}
