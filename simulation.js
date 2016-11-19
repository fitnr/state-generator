/* jshint esversion: 6 */

var ArgumentParser = require('argparse').ArgumentParser;
var fs = require('fs');
var csv = require('csv');
var topojson = require('topojson-client');
var d3 = require('d3');
var stateMaker = require('./js/statemaker');
var apportion = require('./js/apportion');

function list(x) { return x.split(','); }

var parser = new ArgumentParser({version: '0.1'});

parser.addArgument(['topojson']);
parser.addArgument(['csv']);
parser.addArgument(['-e', '--seeds'], {help: 'list of seed counties'});
parser.addArgument(['-s', '--sims'], {help: 'number of simulations', type: parseInt, defaultValue: 100});

var program = parser.parseArgs();

/*
var seeds = ['06009', '08059', 12095, 22127, 36061,
    54063, '01073', '04007', 12039, 17031, 30077,
    47119, '06073', '06079', 42101, '06041', 48321,
    47029, 56025, 16011, 21077, 29187, 45081, 36101,
    35049, 24510, 53027, '05035', 20005, 13057, 27123,
    48367, 44003, 42073, 50015, 51760, 12011, 55131,
    39173, 40017, 23019, 28031, 31021, 41053,
    38083, 33005, 18095, 26145
];
*/
debugger;

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

    if (program.seeds)
        seedIndices = d3.shuffle(seeds).map(d => features.indexOf(mapfeatures.get(d)));
    else
        seedIndices = d3.shuffle(d3.range(features.length)).slice(0, 48);

    maker = new stateMaker(features, neighbors, {prob: prob});
    maker.addState([features.indexOf(mapfeatures.get('02'))]);
    maker.addState([features.indexOf(mapfeatures.get('15'))]);
    var dc = maker.addState([features.indexOf(mapfeatures.get('11001'))]);
    maker.freezeState(dc)
        .divideCountry(seedIndices);

    var evs = apportion.evCount(maker, {reps: 436});

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

    // return the number list of EV total by state for given year, party
    function getEv(year, party) {
        var oppo = party === 'd' ? 'r' : 'd';
        return evs.map((ev, i) => (counts[year][party][i] > counts[year][oppo][i]) ? ev : 0);
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
            dwin: rows.filter(row => row.dev > row.rev).length,
            ties: rows.filter(row => row.dev === row.rev).length,
            davg: d3.sum(rows.map(row => row.dcount)) / rows.length,
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
        summary(sims).forEach(x => console.log(x));
    });
    fs.createReadStream(__dirname + '/' + program.csv).pipe(parser);
}

d3.queue()
    .defer(fs.readFile, __dirname + '/' + program.topojson)
    .await(run);
