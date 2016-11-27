/* jshint esversion: 6 */

var stateMaker = require('./statemaker');

function random(list) {
    return list[Math.floor(Math.random() * list.length)];
}

var height = 1000,
    width = 1900;

var svg = d3.select("body")
    .append('svg')
    .attr('height', height)
    .attr('width', width);

var path = d3.geoPath();

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

// force connection across the mackinac strait
// and chesapeake bay
// and Mass islands
// and Wash Islands
var forceNeighbors = [
    ['26097', '26031'],
    ['26097', '26047'],
    ['51810', '51131'],
    ['25007', '25019'],
    ['25001', '25019'],
    ['25007', '25001'],
    ['53073', '53055'],
];

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
    .domain([3, 10, 250])
    .range([0, 0.001, 1]);

var populationScale = d3.scalePow()
    .exponent(2)
    .domain([100000, 30e6])
    .clamp(true)
    .range([0, 1]);

function prob(count, pop) {
    return (countScale(count) + populationScale(pop)) / 2;
}

var fmt = d3.format(',');

var stateCount = 48,
    reps = 436;

function census(year) {
    return 2000 + (Math.floor((+year - 1) / 10) * 10);
}

function make(features, neighbors) {
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

    var opts = {prob: prob, popField: '10'};
    var maker = new stateMaker(features, neighbors, opts);
    maker.addState([features.indexOf(map.get('02'))]);
    maker.addState([features.indexOf(map.get('15'))]);

    var dc = maker.addState([features.indexOf(map.get('11001'))]);

    // extra rep for D.C.
    maker.freezeState(dc)
        .divideCountry(seedindices, {assignOrphans: true});

    return maker;        
}

function program(error, topo, csv) {
    if (error) throw error;

    var features = topojson.feature(topo, topo.objects.counties).features;
    var neighbors = topojson.neighbors(topo.objects.counties.geometries);
    var results = d3.map(csv, function(d) { return d.GEOID; });
    var elections = Object.keys(candidates);
    var ids = features.map(d => d.properties.id);

    function add_connection(id1, id2) {
        var idx1 = ids.indexOf(id1);
        var idx2 = ids.indexOf(id2);
        if (idx1 === -1 || idx2 === -1) {
            console.log(id1, id2);
            return;
        }
        neighbors[idx2].push(idx1);
        neighbors[idx1].push(idx2);
    }

    forceNeighbors.forEach(pair => add_connection.apply(null, pair));

    // e.g. voteCount('d16') returns state-by-state totals for Dem in '16
    stateMaker.prototype.voteCount = function(key) {
        return this.states().map(state => this.sum(state, i =>
            +results.get(this.features[i].properties.id)[key]
        ));
    };

    svg.append('g')
        .attr('class', 'counties')
        .selectAll('path')
        .data(features).enter()
        .append("path")
        .attr('class', 'county')
        .attr('d', path);

    // set up SVG and DOM
    var state = svg.append('g').attr('class', 'states');

    var boundary = svg.append('g')
        .append('path')
        .attr('class', 'boundary');

    var labels = svg.append('g').attr('class', 'labels');

    // create tables
    var tables = d3.select('.tables').selectAll('table')
        .data(elections).enter()
        .append('table')
        .sort((a, b) => b - a);

    tables.append('thead').append('tr')
            .selectAll('th')
            .data(['candidate', 'popular', 'electoral', 'states']).enter()
            .append('th')
            .text(d => d);

    var tbodies = tables.append('tbody');

    var win = Math.ceil(3 + stateCount + reps/2);

    /**
     * Run the map
     */
    function run() {
        if (d3.event) d3.event.preventDefault();

        var maker = make(features, neighbors);

        var counts = elections.reduce((obj, y) => (
            obj[y] = {
                d: maker.voteCount('d' + y),
                r: maker.voteCount('r' + y)
            }, obj
        ), {});

        var evs = {
            1990: maker.ev(reps, '90'),
            2000: maker.ev(reps, '00'),
            2010: maker.ev(reps, '10'),
        };

        // return the number list of EV total by state for given year, party
        function getEv(year, party) {
            var oppo = party === 'd' ? 'r' : 'd';
            var c = census(year);
            return evs[c].map((ev, i) => (counts[year][party][i] > counts[year][oppo][i]) ? ev : 0);
        }

        var statefeatures = maker.states().map(function(state, j) {
            var feature = topojson.merge(topo,
                topo.objects.counties.geometries.filter((_, i) => state.has(i))
            );
            feature.properties = {
                ev: {
                    1990: evs[1990][j],
                    2000: evs[2000][j],
                    2010: evs[2010][j],
                },
                name: random(Array.from(state).map(county => features[county].properties.n)),
                // not really a hash, but a string representation of the counties,
                // for uniqueness purposes
                hash: Array.from(state).join('|'),
            };
            return feature;
        });

        // state paths

        var states = state.selectAll('path')
            .data(statefeatures, (d, i) => d.properties.hash);

        states.exit().remove();

        var enterStates = states.enter()
            .append('path');

        states.merge(enterStates)
            .attr('d', path)
            .attr('id', (d, i) => 'state-' + i);

        // state label text

        var text = labels.selectAll('text')
            .data(statefeatures, (d, i) => d.properties.hash);

        text.exit().remove();

        var enterText = text.enter()
            .append('text')
            .attr('x', 0)
            .attr('y', 0);

        enterText.append('tspan')
            .attr('x', 0)
            .attr('y', 0);

        enterText.append('tspan')
            .attr('x', 0)
            .attr('y', '1.15em');

        text = text.merge(enterText)
            .attr('transform', d => 'translate(' + path.centroid(d) + ')');

        text.selectAll('tspan:first-child').text(d => d.properties.name);

        // state boundary

        boundary.datum(
            topojson.mesh(topo, topo.objects.counties, (a, b) =>
                maker.countyMaps.fips[a.properties.id] !== maker.countyMaps.fips[b.properties.id]
            ))
            .attr('d', path);

        var countyFill = function(selection) {
            var year = this;
            selection
                .style('fill', function(d) {
                    var x = results.get(d.properties.id);
                    return redblue(+x['r' + year] / (+x['r' + year] + (+x['d' + year])));
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
                    [candidates[year].d, d3.sum(counts[year].d), d3.sum(dev), dev.filter(x => x > 0).length],
                    [candidates[year].r, d3.sum(counts[year].r), d3.sum(rev), rev.filter(x => x > 0).length]
            ]};
        });

        // data tables
        var tb = tbodies.data(votes, d => d.year || d);

        var tr = tb.selectAll('tr')
            .data(d => d.data, d => d[0]);

        var td = tr.merge(tr.enter().append('tr'))
            .attr('class', d => d[2] >= win ? 'winner' : '')
            .selectAll('td')
            .data(d => d);

        td.merge(td.enter().append('td'))
            .text(function(d) {
                var x = fmt(d);
                return x === 'NaN' ? d : x;
            });

        function draw() {
            var geography = document.querySelector('[name=view]:checked').value;
            var year = document.querySelector('[name=year]:checked').value;

            var states = d3.select('.states').selectAll('path');
            var cg = d3.selectAll('.counties');

            text.selectAll('tspan:last-child').text(d => d.properties.ev[census(year)]);

            if (geography === 'county') {
                d3.selectAll('.county')
                    .call(countyFill.bind(year));
                cg.style('display', 'inherit');
                states.style('fill-opacity', 0);

            } else {
                states
                    .call(stateFill.bind(year))
                    .style('fill-opacity', null);

                cg.style('display', 'none');
            }
        }

        d3.selectAll('[name=view], [name=year]')
            .on('change', null)
            .on('change', draw);
        draw();
    }

    d3.selectAll('#button-run').on('click', run);
    run();
}

d3.queue()
    .defer(d3.json, 'data/counties.json')
    .defer(d3.csv, 'data/results.csv')
    .await(program);
