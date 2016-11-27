/* jshint esversion: 6 */

var ArgumentParser = require('argparse').ArgumentParser;
var fs = require('fs');
var csv = require('csv');
var topojson = require('topojson-client');
var d3 = require('d3');
var stateMaker = require('./js/statemaker');

function list(x) { return x.split(','); }
function random(list) { return list[Math.floor(Math.random() * list.length)]; }

var parser = new ArgumentParser({version: '0.1'});

parser.addArgument(['topojson']);
parser.addArgument(['csv']);
parser.addArgument(['-e', '--seeds'], {help: 'list of seed counties'});
parser.addArgument(['--random-seeds'], {action: 'storeTrue', help: 'Use completely random seed list'});
parser.addArgument(['-s', '--sims'], {help: 'number of simulations', type: parseInt, defaultValue: 100});

var program = parser.parseArgs();

var elections = ['00', '04', '08', '12', '16'];

var countScale = d3.scalePow()
    .exponent(2)
    .domain([3, 10, 300])
    .range([0, 0.001, 1]);

var populationScale = d3.scalePow()
    .exponent(2)
    .domain([100000, 10e6])
    .clamp(true)
    .range([0, 1]);

function prob(count, pop) {
    return (countScale(count) + populationScale(pop)) / 2;
}

function simulate(results, features, neighbors) {
    var seedIndices,
        mapfeatures = d3.map(features, d => d.properties.id);

    if (program.seeds) {
        seedIndices = program.seeds.split(',').map(d => features.indexOf(mapfeatures.get(d)));

        var i = seedIndices.indexOf(-1);
        while (i > -1) {
            console.log("Couldn't find", program.seeds.split(',')[i]);
            seedIndices.splice(i, 1);
            i = seedIndices.indexOf(-1);
        }

        seedIndices = d3.shuffle(seedIndices);
    }

    // totally random seeds
    else if (program.random_seeds)
        seedIndices = d3.shuffle(d3.range(2, features.length)).slice(0, 48);

    // pick one random county from each state
    else {
        var byOriginalState = features.reduce(function(obj, d, i) {
                if (['02', '15', '11001'].indexOf(d.properties.id) > -1)
                    return obj;
                var key = d.properties.id.substr(0, 2);
                obj[key] = obj[key] || [];
                obj[key].push(i);
                return obj;
            }, {});

        seedIndices = Object.keys(byOriginalState).map(d => random(byOriginalState[d]));
    }

    maker = new stateMaker(features, neighbors, {prob: prob});
    maker.addState([features.indexOf(mapfeatures.get('02'))]);
    maker.addState([features.indexOf(mapfeatures.get('15'))]);
    var dc = maker.addState([features.indexOf(mapfeatures.get('11001'))]);
    maker.freezeState(dc)
        .divideCountry(seedIndices, {reps: 436});

    // e.g. voteCount('d16') returns state-by-state totals for Dem in '16
    var voteCount = function(key) {
        return maker.states()
            .map(state => maker.sum(state, i => +results[features[i].properties.id][key]));
    };

    var counts = elections.reduce((obj, y) => (
        obj[y] = {
            d: voteCount('d' + y),
            r: voteCount('r' + y)
        }, obj
    ), {});

    var evs = {
        1990: maker.ev(436, '90'),
        2000: maker.ev(436, '00'),
        2010: maker.ev(436, '10'),
    };

    // return the number list of EV total by state for given year, party
    function getEv(year, party) {
        var oppo = party === 'd' ? 'r' : 'd';
        var census = 2000 + (Math.floor((+year - 1) / 10) * 10);
        return evs[census].map((ev, i) => (counts[year][party][i] > counts[year][oppo][i]) ? ev : 0);
    }

    return elections.map(function(year) {
        var d = getEv(year, 'd'), r = getEv(year, 'r');
        return {
            year: year,
            dev: d.reduce((a, b) => a + b, 0),
            dcount: d.filter(x => x > 0).length,
            rev: r.reduce((a, b) => a + b, 0),
            rcount: r.filter(x => x > 0).length
        };
    });
}

function summary(data) {
    return elections.map(function(year) {
        var rows = [].concat.apply([], data).filter(d => d.year == year);
        return {
            year: year,
            dWin: rows.filter(row => row.dev > row.rev).length,
            ties: rows.filter(row => row.dev === row.rev).length,
            dStateAvg: d3.sum(rows.map(row => row.dcount)) / rows.length,
            dEvAvg: d3.sum(rows.map(row => row.dev)) / rows.length,
            devs: rows.reduce((obj, row) => (obj[row.dev] = (obj[row.dev] + 1) || 1, obj), {}),
        };
    });
}

function run(error, json, csvData) {
    if (error) throw error;

    var topology = JSON.parse(json);
    var features = topojson.feature(topology, topology.objects.counties).features;
    var neighbors = topojson.neighbors(topology.objects.counties.geometries);

    var parser = csv.parse({delimiter: ',', columns: true}, function(err, data) {
        if (err) throw err;

        var results = data.reduce((obj, d) => (obj[d.GEOID] = d, obj), {}),
            sims = [],
            simCount = program.sims || 10;

        for (var i = 0; i < simCount; i++)
            sims.push(simulate(results, features, neighbors));

        console.log('sims', simCount);
        console.log('averages');
        summary(sims).forEach(x => console.log(JSON.stringify(x)));
    });
    fs.createReadStream(__dirname + '/' + program.csv).pipe(parser);
}

d3.queue()
    .defer(fs.readFile, __dirname + '/' + program.topojson)
    .await(run);
