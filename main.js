require([
  "esri/renderers/visualVariables/SizeVariable",
  "esri/renderers/visualVariables/ColorVariable",
  "esri/Map",
  "esri/views/SceneView",
  "esri/request",
  "esri/Graphic",
  "esri/geometry/Point",
  "esri/geometry/SpatialReference",
  "esri/layers/FeatureLayer",
  "esri/symbols/PointSymbol3D",
  "esri/symbols/IconSymbol3DLayer",
  "esri/symbols/ObjectSymbol3DLayer",
  "esri/renderers/SimpleRenderer",
  "esri/widgets/Expand",
  "esri/widgets/Legend",
  "esri/geometry/Extent",
  "esri/renderers/visualVariables/RotationVariable",
], function (
  SizeVariable,
  ColorVariable,
  Map,
  SceneView,
  esriRequest,
  Graphic,
  Point,
  SpatialReference,
  FeatureLayer,
  PointSymbol3D,
  IconSymbol3DLayer,
  ObjectSymbol3DLayer,
  SimpleRenderer,
  Expand,
  Legend,
  Extent,
  RotationVariable
) {
  const exaggeratedHeight = 10;

  /**
   * Symbol and Renderer
   */
  // 2D Icon Symbol
  const renderer2DIcon = new SimpleRenderer({
    symbol: new PointSymbol3D({
      symbolLayers: [
        new IconSymbol3DLayer({
          size: 18, // points
          resource: {
            href: "https://static.arcgis.com/arcgis/styleItems/Icons/web/resource/Airport.svg",
          },
          material: { color: [0, 122, 194] },
        }),
      ],
    }),
  });

  // 3D Object Symbol
  const renderer3DObject = new SimpleRenderer({
    symbol: new PointSymbol3D({
      symbolLayers: [
        new ObjectSymbol3DLayer({
          width: 20000,
          anchor: "origin",
          heading: 0,
          resource: {
            href: "https://static.arcgis.com/arcgis/styleItems/RealisticTransportation/web/resource/Airplane_Large_Passenger.json",
          },
        }),
      ],
    }),
    visualVariables: [
      new RotationVariable({
        valueExpression: "$feature.true_track",
        axis: "heading",
      }),
      new RotationVariable({
        valueExpression: "Constrain( $feature.vertical_rate, -45, 45 )",
        axis: "tilt",
      }),
      new ColorVariable({
        valueExpression: "$feature.baro_altitude",
        stops: [
          { value: 1000, color: "#ef8a62" }, // red
          { value: 5000, color: "#FFFFFF" }, // white
          { value: 10000, color: "#67a9cf" }, // blue
        ],
      }),
      new SizeVariable({
        valueExpression: "$feature.baro_altitude",
        axis: "height",
        stops: [
          { value: 1000, size: 1000 },
          { value: 5000, size: 5000 },
          { value: 10000, size: 10000 },
        ],
      }),
    ],
  });

  const extentEurope = new Extent({
    xmin: -20.742622364010256,
    ymin: 24.153343808447573,
    xmax: 46.80132294847179,
    ymax: 58.942399387376156,
    spatialReference: SpatialReference.WGS84,
  });

  const extentUSCalifornia = new Extent({
    xmin: -124.10235616657884,
    ymin: 30.712100073109436,
    xmax: -110.77125411090869,
    ymax: 39.17797761764379,
    spatialReference: SpatialReference.WGS84,
  });

  const extentUS = new Extent({
    xmin: -125.70380611335234,
    ymin: 24.44527672704987,
    xmax: -70.89720874907256,
    ymax: 47.87318512511266,
    spatialReference: SpatialReference.WGS84,
  });

  // Japan Extent
  const extentJP = new Extent({
    xmin: 112.50000000,
    ymin: 21.94304553,
    xmax: 157.50000000,
    ymax: 55.77657302,
    spatialReference: SpatialReference.WGS84,
  });

  const extent = extentJP; //extentUS; 

  /**
   * -- 1 --
   * Set the elevationInfoMode to "absolute-heigh"
   * Points are renderer at their z position
   */
  const elevationInfoMode = "absolute-height"; //"on-the-ground"; // "absolute-height", "on-the-ground"

  const map = new Map({
    basemap: "topo-vector",
    ground: "world-elevation",
  });

  const view = new SceneView({
    container: "viewDiv",
    map: map,
    viewingMode: "global",
    //clippingArea: extent,
    camera: {
      position: {
        spatialReference: { wkid: 4326 },  // 3857
        x: 135, //jp: 135, //us: -120, //eu: 8
        y: 30,   //jp: 30, //us: 27,  //eu: 40
        z: 1000000,
      },
      heading: 20,
      tilt: 40,
    },
  });

  view.popup.defaultPopupTemplateEnabled = true;

  // Create expanded information tab
  let titleContent = document.createElement("div");
  titleContent.style.padding = "15px";
  titleContent.style.backgroundColor = "white";
  titleContent.style.width = "500px";
  titleContent.innerHTML = [
    "<div id='title' class='esri-widget'>",
    "Next update in <span id='next-update'>0</span> seconds. TOTAL planes in this area: <span id='num-plane-in-the-air-total'>0</span>.  <span id='updated' style='color:red; font-weight: bold; visibility: hidden;'>-updated-</span>",
    "</div>",
  ].join(" ");
  const titleExpand = new Expand({
    expandIconClass: "esri-icon-dashboard",
    expandTooltip: "Summary stats",
    view: view,
    content: titleContent,
    expanded: false,
  });
  view.ui.add(titleExpand, "bottom-right");

  const template = {
    // autocasts as new PopupTemplate()
    title: "{callsign}",
    content: [
      {
        type: "fields",
        fieldInfos: [
          {
            fieldName: "origin_country",
            label: "Origin country",
          },
          {
            fieldName: "baro_altitude",
            label: "Altitude (meters)",
          },
          {
            fieldName: "true_track",
            label: "Direction (°) (true_track)",
          },
          {
            fieldName: "velocity",
            label: "Speed (m/s)",
          },
          {
            fieldName: "vertical_rate",
            label: "Vertical Rate (m/s)",
          },
        ],
      },
    ],
  };

  /** -- 2 --
   *  Create a client-side featureLayer
   *  - defining the fields needed to store the flight data
   **/
  const featureLayer = new FeatureLayer({
    outFields: ["*"],
    fields: [
      {
        name: "ObjectID",
        alias: "ObjectID",
        type: "oid",
      },
      {
        name: "state",
        alias: "State",
        type: "string",
      },
      {
        name: "icao24",
        alias: "ICAO24",
        type: "string",
      },
      {
        name: "callsign",
        alias: "Call Sign",
        type: "string",
      },
      {
        name: "origin_country",
        alias: "Origin country",
        type: "string",
      },
      {
        name: "last_contact",
        alias: "Last contact (UNIX)",
        type: "integer",
      },
      {
        name: "baro_altitude",
        alias: "Barometric Altitude",
        type: "double",
      },
      {
        name: "on_ground",
        alias: "On the ground",
        type: "string",
      },
      {
        name: "velocity",
        alias: "Speed (m/s)",
        type: "double",
      },
      {
        name: "true_track",
        alias: "Direction",
        type: "double",
      },
      {
        name: "vertical_rate",
        alias: "Vertical Rate (m/s)",
        type: "double",
      },
      {
        name: "geo_altitude",
        alias: "Geometric Altitude",
        type: "double",
      },
      {
        name: "squawk",
        alias: "Squawk",
        type: "string",
      },
      {
        name: "position_source",
        alias: "Position Source",
        type: "integer",
      },
    ],
    popupTemplate: template,
    objectIdField: "ObjectID",
    geometryType: "point",
    hasZ: true,
    spatialReference: { wkid: 4326 },
    source: [],
    /** -- 3 -- ElevationInfo
     * referencing `elevationInfoMode` to be used
     */
    elevationInfo: { mode: elevationInfoMode },
    
    /** -- 4 -- Renderer
     * Swapping the renderer form 2D icons to 3D objects
     */
    renderer: renderer3DObject,   // renderer2DIcon, renderer3DObject
  });
  map.add(featureLayer);


  // Update the total number planes
  function updateTotal(total) {
    document.getElementById("num-plane-in-the-air-total").innerHTML =
      String(total);
    document.getElementById("updated").style.visibility = "visible";
  }

  // Create the features graphic with the geometry and attributes
  function createGraphics(flightInfo, state, objectId) {
    return new Graphic({
      geometry: new Point({
        x: flightInfo[5] ? flightInfo[5] : 0,
        y: flightInfo[6] ? flightInfo[6] : 0,
        z: exaggeratedHeight * (flightInfo[7] ? flightInfo[7] : 0),
        spatialReference: SpatialReference.WGS84,
      }),
      attributes: {
        ObjectID: objectId,
        state: state,
        icao24: flightInfo[0],
        callsign: flightInfo[1],
        origin_country: flightInfo[2] ? flightInfo[2] : "",
        last_contact: flightInfo[4],
        baro_altitude: flightInfo[7] ? flightInfo[7] : 0,
        on_ground: flightInfo[8] ? flightInfo[8] : "false",
        velocity: flightInfo[9] ? flightInfo[9] : 0,
        true_track: flightInfo[10] ? flightInfo[10] : 0,
        vertical_rate: flightInfo[11] ? flightInfo[11] : 0,
        geo_altitude: flightInfo[13] ? flightInfo[13] : 0,
        squawk: flightInfo[14] ? flightInfo[14] : "",
        position_source: flightInfo[16] ? flightInfo[16] : "",
      },
    });
  }

  // Get the flight position form the https://opensky-network.org API
  function getFlightPosition() {
    /*
    let url =
      "https://opensky-network.org/api/states/all?lamin=" +
      extent.ymin +
      "&lomin=" +
      extent.xmin +
      "&lamax=" +
      extent.ymax +
      "&lomax=" +
      extent.xmax;*/
    // add no real-time data,
    //let url = "./data/opensky_us-all-20230228-0146.json";
    let url = "./data/opensky-jp-all-20230319-2323.json";
    esriRequest(url, {
      responseType: "json",
    }).then(function (response) {
      // The requested data
      const flightInfos = response.data.states;
      featureLayer.queryFeatures().then(function (currentFeatures) {
        updateTotal(currentFeatures.features.length);
        let addFeatures = [];
        let updateFeatures = [];
        let deleteFeatures = [];
        let matchedObjectIdFeatures = [];
        for (const flightInfo of flightInfos) {
          // only show flight that are in the air
          if (!flightInfo[8]) {
            let matched = false;
            let matchedObjectId = null;
            for (let currentFeature of currentFeatures.features) {
              if (flightInfo[0] === currentFeature.attributes.icao24) {
                matchedObjectId = currentFeature.attributes.ObjectID;
                matchedObjectIdFeatures.push(matchedObjectId);
                matched = true;
                break;
              }
            }
            if (!matched) {
              addFeatures.push(createGraphics(flightInfo, "new", ""));
            } else {
              updateFeatures.push(
                createGraphics(flightInfo, "update", matchedObjectId)
              );
            }
            //console.log("longitude: " + flightInfo[5] + " - latitude: " + flightInfo[6] + " - geo_altitude: " + flightInfo[13] +" - baro_altitude: " + flightInfo[7] + " - vertical_rate: " + flightInfo[11]);
          }
        }
        for (let currentFeature of currentFeatures.features) {
          if (
            !matchedObjectIdFeatures.includes(
              currentFeature.attributes.ObjectID
            )
          ) {
            deleteFeatures.push(currentFeature);
          }
        }
        //console.log("add features: " + addFeatures.length + " - update features: " + updateFeatures.length + " - delete features: " + deleteFeatures.length);
        featureLayer
          .applyEdits({
            addFeatures: addFeatures,
            updateFeatures: updateFeatures,
            deleteFeatures: deleteFeatures,
          })
          .then(function (result) {
            updateTotal(
              result.addFeatureResults.length +
              result.updateFeatureResults.length
            );
          });
      });
    });
  }

  // Setup an Interval to get the flight data
  // Limitations (https://opensky-network.org/apidoc/rest.html#limitations)
  // Anonymous users can only retrieve data with a time resultion of 10 seconds
  // Anonymous users get 400 API credits per day
  let counter = 1;
  setInterval(function () {
    counter = counter - 1;
    document.getElementById("next-update").innerHTML = counter.toString();
    document.getElementById("updated").style.visibility = "hidden";
    if (counter == 0) {
      getFlightPosition();
      counter = 20; // 12 (s)next update interval
    }
  }, 1000);

  const legend = new Legend({
    view: view,
    layerInfos: [
      {
        layer: featureLayer,
        title: "Flight Data - Feb 28 - 2.38 am"
      }
    ]
  })
  //view.ui.add(legend, "top-right");

});
