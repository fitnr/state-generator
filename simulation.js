/* jshint esversion: 6 */

var ArgumentParser = require('argparse').ArgumentParser;
var fs = require('fs');
var csv = require('csv');
var topojson = require('topojson-client');
var d3 = require('d3');
var stateMaker = require('./js/statemaker');

function list(x) { return x.split(','); }
function random(list) { return list[Math.floor(Math.random() * list.length)]; }

var elections = '2000,2004,2008,2012,2016';
var hawaii = ['15001', '15003', '15005', '15007', '15009'];
var forceNeighbors = [
    ['26097', '26031'],
    ['26097', '26047'],
    ['51810', '51131'],
    ['25007', '25019'],
    ['25001', '25019'],
    ['25007', '25001'],
    ['53073', '53055'],
];

var parser = new ArgumentParser({version: '0.1'});

parser.addArgument(['topojson']);
parser.addArgument(['csv']);
parser.addArgument(['-e', '--seeds'], {help: 'list of seed counties'});
parser.addArgument(['--states'], {help: 'number of states (not including DC)', type: parseInt, defaultValue: 50});
parser.addArgument(['--reps'], {help: 'number of representatives', type: parseInt, defaultValue: 435});
parser.addArgument(['-c', '--one-per-state'], {action: 'storeTrue', help: 'Use one random county per state'});
parser.addArgument(['-s', '--sims'], {help: 'number of simulations', type: parseInt, defaultValue: 100});
parser.addArgument(['-l', '--elections'], {help: 'elections', type: list, defaultValue: elections});

var program = parser.parseArgs();

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

function censusYear(year) {
    return ((Math.floor((+year - 1) / 10) * 10) + '').substr(-2);
}

function simulate(results, features, neighbors) {
    var seedIndices,
        mapfeatures = d3.map(features, d => d.properties.id);

    var stateCount = program.states > 2 ? program.states - 2 : program.states;

    if (program.seeds) {
        seedIndices = program.seeds.split(',').map(d => features.indexOf(mapfeatures.get(d)));

        var i = seedIndices.indexOf(-1);
        while (i > -1) {
            console.error("Couldn't find", program.seeds.split(',')[i]);
            seedIndices.splice(i, 1);
            i = seedIndices.indexOf(-1);
        }
        seedIndices = d3.shuffle(seedIndices);
    }
    // totally random seeds
    else if (program.one_per_state) {
        var byOriginalState = features.reduce(function(obj, d, i) {
                if (['02000', '11001'].concat(hawaii).indexOf(d.properties.id) > -1)
                    return obj;
                var key = d.properties.id.substr(0, 2);
                obj[key] = obj[key] || [];
                obj[key].push(i);
                return obj;
            }, {});
        seedIndices = Object.keys(byOriginalState).map(d => random(byOriginalState[d]));
    }
    // pick one random county from each state
    else {
        seedIndices = d3.shuffle(d3.range(2, features.length)).slice(0, stateCount);
    }

    maker = new stateMaker(features, neighbors, {prob: prob});
    var ak = maker.addState([features.indexOf(mapfeatures.get('02000'))]);
    var hi = maker.addState(hawaii.map(function(id) { return features.indexOf(mapfeatures.get(id)); }));
    var dc = maker.addState([features.indexOf(mapfeatures.get('11001'))]);

    maker.freezeState(dc)
        .freezeState(hi)
        .freezeState(ak)
        .divide(seedIndices);

    // e.g. voteCount('d16') returns state-by-state totals for Dem in '16
    var voteCount = function(key) {
        return maker.states()
            .map(state => maker.sum(state, i => +results[features[i].properties.id][key]));
    };

    var counts = program.elections.reduce((obj, y) => (
        obj[y] = {
            d: voteCount('d' + y),
            r: voteCount('r' + y)
        }, obj
    ), {});

    var evs;
    var censuses = program.elections.map(censusYear)
        .filter((d, i, array) => array.indexOf(d) === i);

    if (program.reps <= 435) {
        evs = new Map(
            censuses.map(year =>
                [year, maker.ev(program.reps + 1, year)]
            )
        );
    }
    else {
        var provisionalEVs = censuses.map(year => (
            {year: year, ev: maker.ev(program.reps, year)}
        ));

        evs = new Map(provisionalEVs.map(function(d) {
            var min = Math.min.apply(Math, d.ev) - 2;
            return [d.year, maker.ev(program.reps + min, d.year)];
        }));
    }

    // return the number list of EV total by state for given year, party
    function getEv(year, party) {
        var oppo = party === 'd' ? 'r' : 'd';
        return evs.get(censusYear(year)).map((ev, i) => (counts[year][party][i] > counts[year][oppo][i]) ? ev : 0);
    }

    return program.elections.map(function(year) {
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
    return program.elections.map(function(year) {
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
    var ids = features.map(d => d.properties.id);

    forceNeighbors.forEach(function(d) {
        var idx1 = ids.indexOf(d[0]);
        var idx2 = ids.indexOf(d[1]);

        if (idx1 === -1 || idx2 === -1) {
            console.error(id1, id2);
            return;
        }
 
        neighbors[idx2].push(idx1);
        neighbors[idx1].push(idx2);
    });

    var parser = csv.parse({delimiter: ',', columns: true}, function(err, data) {
        if (err) throw err;

        var results = data.reduce((obj, d) => (obj[d.GEOID] = d, obj), {}),
            sims = [],
            simCount = program.sims || 10;

        console.error('states:', stateCount, 'reps:', program.reps);

        for (var i = 0; i < simCount; i++)
            sims.push(simulate(results, features, neighbors));

        console.error('sims', simCount);
        summary(sims).forEach(x => console.log(JSON.stringify(x)));
    });
    fs.createReadStream(__dirname + '/' + program.csv).pipe(parser);
}

d3.queue()
    .defer(fs.readFile, __dirname + '/' + program.topojson)
    .await(run);
