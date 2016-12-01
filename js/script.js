/* jshint esversion: 6 */

var stateMaker = require('./statemaker');

function random(list) {
    return list[Math.floor(Math.random() * list.length)];
}

var height = 825,
    width = 1050;

var margins = {
    left: 30,
    right: 0,
    top: 0,
    bottom: 0,
};

var barheight = 18,
    barbuf = 8;

var svg = d3.select("#map")
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
    .range([0.25, 1])
    .clamp(true);

var redblue = d3.scaleLinear()
    .clamp(true)
    .domain([0.25, 0.5, 0.75])
    .range(['#2166ac', '#964372', '#e31a1c']);

var x = d3.scaleLinear()
    .range([0, width - margins.left - margins.right])
    .domain([0, 538]);

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

var stateCount = 48,
    reps = 436;

function census(year) {
    return 2000 + (Math.floor((+year - 1) / 10) * 10);
}

function seeds(method, features) {
    var seeds;
    var ids;

    if (method === 'large' || method === 'state')
        ids = features.map(d => d.properties.id);

    if (method === 'large') {
        seeds = '06037|17031|48201|04013|06073|12086|36047|48113|53033|32003|48439|06085|12011|26163|48029|06001|42101|25017|36103|06067|36005|12099|12057|39035|42003|12095|39049|27053|51059|06013|49035|24031|29189|04019|37119|13121|55079|37183|06019|47157|09001|12103|36029|18097|09003|12031|09009|41051'
            .split('|')
            .map(geoid => ids.indexOf(geoid));
    }
    else if (method === 'state') {
        var byOriginalState = ids.reduce(function(obj, geoid, i) {
                if (['02', '15', '11001'].indexOf(geoid) > -1)
                    return obj;
                var key = geoid.substr(0, 2);
                obj[key] = obj[key] || [];
                obj[key].push(i);
                return obj;
            }, {});

        seeds = Object.keys(byOriginalState).map(d => random(byOriginalState[d]));
    }
    else {
        seeds = d3.shuffle(d3.range(2, features.length)).slice(0, stateCount);
    }

    return seeds;
}

function getYear() {
    return document.querySelector('[name=year]:checked').value;
}

function make(features, neighbors, options) {
    var map = d3.map(features, d => d.properties.id);
    var seedindices = seeds((options || {}).method, features);

    var opts = {prob: prob, popField: '10'};
    var maker = new stateMaker(features, neighbors, opts);
    maker.addState([features.indexOf(map.get('02'))]);
    maker.addState([features.indexOf(map.get('15'))]);

    var dc = maker.addState([features.indexOf(map.get('11001'))]);

    // extra rep for D.C.
    maker.freezeState(dc)
        .divideCountry(seedindices);

    return maker;        
}

function program(error, topo, csv) {
    if (error) throw error;

    var features = topojson.feature(topo, topo.objects.counties).features;
    var neighbors = topojson.neighbors(topo.objects.counties.geometries);
    var results = d3.map(csv, d => d.GEOID);
    var elections = Object.keys(candidates).sort((a, b) => a - b);
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

    var total = reps + (3 + stateCount) * 2,
        win = Math.ceil(total/2);

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

    // create bar charts
    var bars = svg.append('g').classed('bars', true)
        .attr('transform', 'translate(' + [margins.left, height - (elections.length * (barheight + barbuf))] + ')');

    bars.append('line')
        .attr('y1', -barbuf)
        .attr('y2', height - (elections.length * (barheight + barbuf)))
        .attr('x1', x(win))
        .attr('x2', x(win));

    var transition = d3.transition()
        .duration(250);

    var infobox = d3.select(document.append('div'));

    /**
     * Run the map
     */
    function run() {
        if (d3.event) d3.event.preventDefault();

        var method = document.querySelector('[name=method]:checked').value;
        var maker = make(features, neighbors, {method: method});

        var evs = {
            1990: maker.ev(reps, '90'),
            2000: maker.ev(reps, '00'),
            2010: maker.ev(reps, '10'),
        };

        var counts = elections.reduce(function(obj, year) {
            var c = census(year);
            var vote = {
                d: maker.voteCount('d' + year),
                r: maker.voteCount('r' + year),
                tot: maker.voteCount('tot' + year),
            };
            var ev = {
                d: evs[c].map((ev, i) => (vote.d[i] > vote.r[i]) ? ev : 0),
                r: evs[c].map((ev, i) => (vote.r[i] > vote.d[i]) ? ev : 0),
            };
            obj[year] = {
                vote: vote,
                ev: ev
            };
            return obj;
        }, {});

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

        var votes = elections.map(year => ({
            year: year,
            data: ['d', 'r'].map(party => ({
                    name: candidates[year][party],
                    party: party,
                    vote: d3.sum(counts[year].vote[party]),
                    ev: d3.sum(counts[year].ev[party]),
                    state: counts[year].ev[party].filter(y => y > 0).length,
            }))
        }));

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
                counts[year].ev.d[i] > 0 ? redblue.range()[0] : redblue.range()[2]
            );
        };

        // state paths

        var states = state.selectAll('path')
            .data(statefeatures, (d, i) => d.properties.hash);

        states.exit().remove();

        var enterStates = states.enter()
            .append('path');

        states.merge(enterStates)
            .attr('d', path)
            .attr('id', (d, i) => 'state-' + i)
            .on('mouseover', function(d){

            });

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

        // bar charts

        var bar = bars.selectAll('g')
            .data(votes, d => d.year);

        var barEnter = bar.enter()
            .append('g')
            .attr('transform', (_, i) => 'translate(0,' + (i * (barheight + barbuf)) + ')' );

        var rects = bar
            .merge(barEnter)
            .selectAll('.bar')
            .data(d => d.data, d => d.name);

        var newRects = rects.enter()
            .append('g')
            .attr('class', d => 'bar bar-' + d.party)
            .attr('name', d => d.name);
        
        newRects.append('rect')
            .attr('height', barheight);

        newRects.append('text')
            .text(d => d.name)
            .attr('dx', (_, i) => i === 0 ? 4 : -4)
            .attr('x', (_, i) => i === 0 ? 0 : x(total));

        newRects.append('text')
            .text(d => d.ev)
            .attr('x', (d, i) => i === 0 ? x(d.ev) : x(total - d.ev))
            .attr('dx', (d, i) => i === 0 ? -2 : 2)
            .attr('class', 'ev');

        newRects.selectAll('text')
            .attr('dy', '1em');

        rects = rects
            .merge(newRects)
            .classed('win', d => d.ev >= win)
            .select('rect')
            .transition(transition)
            .attr('width', d => x(d.ev))
            .filter((d, i) => i === 1)
            .attr('transform', d => 'translate(' + x(total - d.ev) + ')');

        barEnter.append('text')
            .text(d => '20' + d.year)
            .attr('dx', -margins.left)
            .attr('dy', '1em');

        function draw() {
            var geography = document.querySelector('[name=view]:checked').value;
            var year = getYear();

            var states = d3.select('.states').selectAll('path');
            var cg = d3.selectAll('.counties');

            text.selectAll('tspan:last-child').text(d => d.properties.ev[census(year)]);

            if (geography === 'county') {
                d3.selectAll('.county')
                    .call(countyFill.bind(year));
                cg.style('display', 'inherit');
                states.style('fill-opacity', 0);
                text.style('display', 'none');

            } else {
                states
                    .call(stateFill.bind(year))
                    .style('fill-opacity', null);

                cg.style('display', 'none');
                text.style('display', null);
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
