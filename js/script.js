/* jshint esversion: 6 */

var stateMaker = require('./statemaker');
var apportion = require('./apportion');

var height = 1000,
    width = 1900;

var svg = d3.select("body")
    .append('svg')
    .attr('height', height)
    .attr('width', width);

var projection = d3.geoAlbersUsa()
    .scale(1900)
    .translate([750, 500]);

var path = d3.geoPath()
    .projection(projection);

var candidates = {
    '00' : {
        d: 'Gore',
        r: 'Bush',
    },
    '04': {
        r: 'Bush',
        d: 'Kerry'
    },
    '08': {
        d: 'Obama',
        r: 'McCain'
    },
    12: {
        d: 'Obama',
        r: 'Romney'
    },
    16: {
        d: 'Clinton',
        r: 'Trump'
    }
};

var lightness = d3.scaleLinear()
    .domain([100, 1e6, 2e6])
    .range([0.96, 0.4, 0.3])
    .clamp(1);

var redblue = d3.scaleLinear()
    .clamp(true)
    .domain([0.3, 0.5, 0.7])
    .range(['#2166ac', '#bd9cd9', '#e31a1c']);

// probability functions
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

var fmt = d3.format(',');

var maker;
// centers of metros
// var seeds = ['06009', '08059', 12095, 22127, 36061,
//     54063, '01073', '04007', 12039, 17031, 30077,
//     47119, '06073', '06079', 42101, '06041', 48321,
//     47029, 56025, 16011, 21077, 29187, 45081, 36101,
//     35049, 24510, 53027, '05035', 20005, 13057, 27123,
//     48367, 44003, 42073, 50015, 51760, 12011, 55131,
//     39173, 40017, 23019, 28031, 31021, 41053,
//     38083, 33005, 18095, 26145
// ];
// NYS
// var seeds = '36031|36033|36035|36037|36039|36041|36043|36045|36047|36049|36051|36053|36055|36057|36059|36061|36063|36065|36067|36069|36071|36073|36075|36077|36079|36081|36083|36085|36087|36089|36091|36093|36095|36097|36099|36101|36103|36105|36107|36109|36111|36113|36115|36117|36119|36121|36123'.split('|');
// highest democratic vote 2016
// var seeds = '06037|17031|48201|12086|36047|42101|12011|04013|26163|36061|25017|53033|36081|48113|27053|32003|06059|06073|39035|12099|42003|51059|26125|39049|12095|48029|36005|24033|06085|24031|36059|48453|12057|06001|37183|37119|55079|48439|13121|29189|36103|41051|11001|42091|36119|25025|13089|12103'.split('|');

function program(error, topo, csv) {
    if (error) throw error;

    var features = topojson.feature(topo, topo.objects.counties).features;
    var mapfeatures = d3.map(features, function(d) {
        return d.properties.id;
    });
    var neighbors = topojson.neighbors(topo.objects.counties.geometries);
    var results = d3.map(csv, function(d) { return d.GEOID; });
    // given seeds
    // var seedindices = d3.shuffle(seeds).map(function(d) { return features.indexOf(mapfeatures.get(d)); });
    // totally random
    var seedindices = d3.shuffle(d3.range(features.length)).slice(0, 48);
    var elections = Object.keys(candidates);

    // var paths = svg.append('g')
    //     .attr('class', 'counties')
    //     .selectAll('path')
    //     .data(features).enter()
    //     .append("path")
    //     .attr('d', path)
    //     .attr('id', function(d) { return 'geoid-' + d.properties.id; });

    function drawResults(year) {
        paths.attr('fill', function(d) {
            var x = results.get(d.properties.id);
            var hsl = d3.hsl(redblue( +x['r'+year] / (+x['r'+year] + Number(x['d'+year]))));
            hsl.l = lightness(d.properties.pop);
            // debugger;
            return hsl+"";
        });
    }

    // drawResults('16');

    maker = new stateMaker(features, neighbors, {prob: prob});
    maker.addState([features.indexOf(mapfeatures.get('02'))]);
    maker.addState([features.indexOf(mapfeatures.get('15'))]);
    var dc = maker.addState([features.indexOf(mapfeatures.get('11001'))]);

    maker.freezeState(dc)
        .divideCountry(seedindices, {assignOrphans: true});

    var statefeatures = maker.states().map(function(state) {
        return topojson.merge(
            topo,
            topo.objects.counties.geometries
                .filter(function(_, i) { return state.has(i); })
        );
    });

    // extra rep for D.C.
    var evs = apportion.evCount(maker, {reps: 436});

    // e.g. voteCount('d16') returns state-by-state totals for Dem in '16
    var voteCount = function(key) {
        return maker.states().map(state => maker.sum(state, function(i) {
            return +results.get(features[i].properties.id)[key];
        } ));
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

    var votes = elections.map(function(year) {
        var dev = getEv(year, 'd'), rev = getEv(year, 'r');
        return {
            year: year,
            data: [
                [candidates[year].d, d3.sum(dev), dev.filter(x => x > 0).length],
                [candidates[year].r, d3.sum(rev), rev.filter(x => x > 0).length]
        ]};
    });

    var statePaths = svg.append('g')
        .attr('class', 'states')
        .selectAll('.state')
        .data(statefeatures).enter()
        .append('g')
        .attr('class', 'state');

    statePaths.attr('fill', function(d, i) {
        return counts[16].d[i] > counts[16].r[i] ? redblue.range()[0] : redblue.range()[2];
    });

    statePaths
        .append('path')
        .attr('d', path)
        .attr('id', function(d, i) { return 'state-' + i; });

    statePaths.append('text')
        .attr('transform', function(d) { return 'translate(' + path.centroid(d) + ')'; })
        .text(function(_, i) { return evs[i]; });

    svg.append('g').append('path')
        .datum(topojson.mesh(topo, topo.objects.counties, function(a, b) {
            return maker.countyMaps.fips[a.properties.id] !== maker.countyMaps.fips[b.properties.id];
        }))
        .attr('class', 'boundary')
        .attr('d', path);

    // d3.select('body').append('ul')
    //     .selectAll('li')
    //     .data(maker.states()).enter()
    //     .append('li')
    //     .text(function(state) {
    //         return '' + state.size() + ' counties. ' + fmt(maker.sum(state, 'pop'));
    //     });

    var tables = d3.select('.tables').selectAll('table')
        .data(votes).enter()
        .append('table')
        .sort(function(a, b) { return b.year - a.year; });

    tables.append('thead').append('tr')
        .selectAll('th')
        .data(['candidate', 'popular', 'electoral', 'n']).enter()
        .append('th')
        .text(function(d) { return d; });

    tables.append('tbody').selectAll('tr')
        .data(function(d) { return d.data; }).enter()
        .append('tr')
            .attr('class', function(d) { return d[1] > 269 ? 'winner' : ''; })
            .selectAll('td')
            .data(function(d) { return d; }).enter()
            .append('td')
            .text(function(d) {
                var x = fmt(d);
                return x === 'NaN' ? d : x;
            });

    var pointer = d3.select('body').append('div')
        .attr('id', 'info');

    // d3.selectAll('.states')
    //     .on('mousemove', function(d) {
    //         pointer.style('display', 'block')
    //             .style('left', d3.event.pageX + 'px')
    //             .style('top', d3.event.pageY + 'px');

    //     })
    //     .on('mouseout', function(d) {
    //         pointer.style('display', 'none');
    //     });
}

var q = d3.queue()
    .defer(d3.json, 'data/counties.json')
    .defer(d3.csv, 'data/results.csv')
    .await(program);
