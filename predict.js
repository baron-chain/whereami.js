const fs = require("fs"),
  RandomForestClassifier = require("random-forest-classifier")
    .RandomForestClassifier;
const util = require("util");
let labels = [];
let features = [];
let classes = [];
const readdir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);
let filenames;

var rf = new RandomForestClassifier({
  n_estimators: 10,
});

// Get training data from JSON files
const getData = async () => {
  try {
    filenames = await readdir(`./whereamijs-data`);
  } catch (err) {
    console.log(err);
  }
  if (filenames === undefined) {
    console.log("undefined");
  }
  return Promise.all(
    filenames.map(async (name) => {
      classes.push(name.split(".")[0]);
      return await readFile(`./whereamijs-data/${name}`);
    })
  );
};

let networks = [];

const predict = async (liveData) => {
  const allData = await getData();
  allData.map((data) => {
    const arrayData = JSON.parse(data);
    features.push(arrayData);
  });

  classes.map((c, i) => features[0].map((s) => labels.push(i)));
  features = features.flat();

  /* 
    For each network in the training data, network names might not all be the same as networks are not constant.
    To make sure we optimise the prediction, we look at the networks in the live data and compare it to our training set
    to only keep the values present in all objects. 
  */
  const liveDataNetworks = Object.keys(liveData[0]);
  const trainingDataNetworks = features.map((feature) =>
    Object.keys(feature).filter((element) => liveDataNetworks.includes(element))
  );

  /*
    The array is flattened so we can extract the network names that are present in all training samples.
    If a network name is found as many times as there are objects in the training set, we know this network was 
    found every time we sampled wifi data so we should keep it.
  */
  var networksOccurences = trainingDataNetworks
    .flat()
    .reduce(function (acc, curr) {
      if (typeof acc[curr] == "undefined") {
        acc[curr] = 1;
      } else {
        acc[curr] += 1;
      }
      return acc;
    }, {});

  const commonNetworks = Object.entries(networksOccurences).reduce(
    (acc, input) => {
      if (networksOccurences[input[0]] === trainingDataNetworks.length) {
        acc.push(input[0]);
      }
      return acc;
    },
    []
  );

  if (!commonNetworks.length) {
    console.error(
      "\x1b[31m",
      `
    There does not seem to be any common wifi network name in your training data. 
    For the prediction to work, there has to be at least 1 wifi network name common to all training files. 
    A network name is made of its SSID & BSSID.
    You might need to delete some training files and re-record data.`
    );
    process.exit(0);
  }

  // Sort network names alphabetically so we can be sure all data will be used in the same order.
  const sortedNames = commonNetworks.sort();
  networks = sortedNames;

  // Keep networks objects
  const networksValues = features.map((feature) => {
    const networkObject = {};
    return Object.keys(feature)
      .sort()
      .map((f, i) => {
        if (sortedNames.includes(f)) {
          networkObject[`${f}`] = feature[f];
          return networkObject;
        }
      })
      .filter(Boolean);
  });

  // The array outputs too many objects so we just keep the 1st one
  const outputNetworksData = networksValues.map((network) => network[0]);

  // Insert the room as a key/value pair in each object
  outputNetworksData.map((data, i) => (data["room"] = labels[i]));

  // Shuffle the data so we don't have any overfitting
  shuffle(outputNetworksData);

  const trainingData = outputNetworksData;

  // Format the live data the same way as the training data
  const formattedLiveData = formatLiveData(liveData);

  // Fit the random forest classifier and predict
  rf.fit(trainingData, null, "room", function (err, trees) {
    //console.log(JSON.stringify(trees, null, 4));
    var pred = rf.predict([formattedLiveData], trees);
    console.log(classes[pred[0]]);
    return classes[pred[0]];
  });
};

const shuffle = (array) => {
  var currentIndex = array.length,
    temporaryValue,
    randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
};

const formatLiveData = (data) => {
  // Sort live data by network name
  const sortedData = Object.keys(data[0])
    .sort()
    .reduce((obj, key) => {
      obj[key] = data[0][key];
      return obj;
    }, {});

  // Keep only the same networks as the ones found in the training data and return the values
  const values = Object.keys(sortedData)
    .map((network) => {
      const netObject = {};
      if (networks.includes(network)) {
        const key = network;
        const value = sortedData[key];
        netObject[key] = value;
        return netObject;
      }
    })
    .filter(Boolean);

  let merged = Object.assign(...values);

  return merged;
};

module.exports = predict;
