/* jshint esversion: 6 */

var stateMaker = require('./statemaker');
var apportion = require('./apportion');

function random(list) {
    return list[Math.floor(Math.random() * list.length)];
}

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

var opacity = d3.scaleLinear()
    .domain([1, 2e5])
    .range([0.15, 1])
    .clamp(true);

var redblue = d3.scaleLinear()
    .clamp(true)
    .domain([0.25, 0.5, 0.75])
    .range(['#2166ac', '#964372', '#e31a1c']);

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

function make(features) {
    var map = d3.map(features, d => d.properties.id);

    var byOriginalState = features.reduce(function(obj, d, i) {
            if (['02', '15', '11001'].indexOf(d.properties.id) > -1)
                return obj;
            var key = d.properties.id.substr(0, 2);
            obj[key] = obj[key] || [];
            obj[key].push(i);
            return obj;
        }, {});

    var seedindices = Object.keys(byOriginalState).map(d => random(byOriginalState[d]));

    var countyPaths = svg.append('g')
        .attr('class', 'counties')
        .selectAll('path')
        .data(features).enter()
        .append("path")
        .attr('d', path);

    var maker = new stateMaker(features, neighbors, {prob: prob});
    maker.addState([features.indexOf(map.get('02'))]);
    maker.addState([features.indexOf(map.get('15'))]);

    var dc = maker.addState([features.indexOf(map.get('11001'))]);

    maker.freezeState(dc)
        .divideCountry(seedindices, {assignOrphans: true});

    return maker;        
}

function program(error, topo, csv) {
    if (error) throw error;

    var features = topojson.feature(topo, topo.objects.counties).features;

    var neighbors = topojson.neighbors(topo.objects.counties.geometries);
    var results = d3.map(csv, function(d) { return d.GEOID; });
    // given seeds
    // var seedindices = d3.shuffle(seeds).map(function(d) { return features.indexOf(mapfeatures.get(d)); });
    // totally random
    // var seedindices = d3.shuffle(d3.range(features.length)).slice(0, 48);
    var elections = Object.keys(candidates);

    var maker = make(features);

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

    var statefeatures = maker.states().map(function(state, j) {
        var feature = topojson.merge(topo,
            topo.objects.counties.geometries.filter((_, i) => state.has(i))
        );
        feature.properties = {
            ev: evs[j],
            name: random(Array.from(state).map(county => features[county].properties.n)),
        };
        return feature;
    });

    var statePaths = svg.append('g')
        .attr('class', 'states')
        .selectAll('.state')
        .data(statefeatures).enter()
        .append('g')
        .attr('class', 'state');

    var countyFill = function(selection) {
        var year = this;
        selection
            .style('fill', function(d) {
                var x = results.get(d.properties.id);
                return redblue(+x['r' + year] / (+x['r' + year] + Number(x['d' + year])));
            })
            .style('fill-opacity', d =>
                opacity(results.get(d.properties.id)['tot' + year])
            );
    };
    var stateFill = function(selection) {
        var year = this;
        selection.style('fill', (d, i) =>
            counts[year].d[i] > counts[year].r[i] ? redblue.range()[0] : redblue.range()[2]
        );
    };
    var votes = elections.map(function(year) {
        var dev = getEv(year, 'd'), rev = getEv(year, 'r');
        return {
            year: year,
            data: [
                [candidates[year].d, d3.sum(dev), dev.filter(x => x > 0).length],
                [candidates[year].r, d3.sum(rev), rev.filter(x => x > 0).length]
        ]};
    });

    statePaths.append('path')
        .attr('d', path)
        .attr('id', function(d, i) { return 'state-' + i; });

    var text = statePaths.append('text')
        .attr('class', 'label')
        .attr('transform', d => 'translate(' + path.centroid(d) + ')')
        .attr('x', 0)
        .attr('y', 0);

    text.append('tspan')
        .attr('x', 0)
        .attr('y', 0)
        .text(d => d.properties.name);

    text.append('tspan')
        .attr('x', 0)
        .attr('y', '1.15em')
        .text(d => d.properties.ev);

    svg.append('g').append('path')
        .datum(topojson.mesh(topo, topo.objects.counties, (a, b) =>
            maker.countyMaps.fips[a.properties.id] !== maker.countyMaps.fips[b.properties.id]
        ))
        .attr('class', 'boundary')
        .attr('d', path);

    var tables = d3.select('.tables').selectAll('table')
        .data(votes).enter()
        .append('table')
        .sort((a, b) => b.year - a.year);

    tables.append('thead').append('tr')
        .selectAll('th')
        .data(['candidate', 'popular', 'electoral', 'n']).enter()
        .append('th')
        .text(d => d);

    tables.append('tbody').selectAll('tr')
        .data(function(d) { return d.data; }).enter()
        .append('tr')
            .attr('class', d => d[1] > 269 ? 'winner' : '')
            .selectAll('td')
            .data(d => d).enter()
            .append('td')
            .text(function(d) {
                var x = fmt(d);
                return x === 'NaN' ? d : x;
            });

    var pointer = d3.select('body').append('div')
        .attr('id', 'info');

    function draw() {
        var geography = document.querySelector('[name=view]:checked').value;
        var year = document.querySelector('[name=year]:checked').value;

        if (geography === 'county') {
            countyPaths.call(countyFill.bind(year));
            statePaths.selectAll('path').style('fill-opacity', 0);

        } else {
            statePaths
                .call(stateFill.bind(year))
                .selectAll('path')
                    .style('fill-opacity', null);

            countyPaths.style('fill-opacity', 0);
        }
    }

    d3.selectAll('[name=view], [name=year]').on('change', draw);

    draw();

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
