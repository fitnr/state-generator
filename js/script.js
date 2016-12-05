/* jshint esversion: 6 */

var stateMaker = require('./statemaker');

function random(list) {
    return list[Math.floor(Math.random() * list.length)];
}

var height = 860,
    width = 1100;

var margins = {
    left: 30,
    right: 10,
    top: 0,
    bottom: 0,
};

var barheight = 18,
    barbuf = 8;

var legPct = [0.3, 0.4, 0.5, 0.6, 0.7];
var legPop = [1000, 51000, 101000, 151000, 201000];
var legUnit = 18;

var svg = d3.select("#map")
    .attr('height', height)
    .attr('width', width + margins.left + margins.right);

var path = d3.geoPath();

var candidates = {
    1996: {
        d: 'Clinton',
        r: 'Dole'
    },
    2000 : {
        d: 'Gore',
        r: 'Bush',
    },
    2004: {
        r: 'Bush',
        d: 'Kerry'
    },
    2008: {
        d: 'Obama',
        r: 'McCain'
    },
    2012: {
        d: 'Obama',
        r: 'Romney'
    },
    2016: {
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

var commaize = d3.format(',');
var percentize = d3.format('.2%');
var K = d3.formatPrefix(',.0', 1e3);

var opacity = d3.scaleLinear()
    .domain([1, 2e5])
    .range([0.25, 1])
    .clamp(true);

var redblue = d3.scaleLinear()
    .clamp(true)
    .domain([0.25, 0.5, 0.75])
    .range(['#cc3d3d', '#964372', '#1a80c4']);

var darkred = '#b22d2c';
var darkblue = '#215e93';

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

var hawaii = ['15001', '15003', '15005', '15007', '15009'];
var excludes = ['02000', '11001'].concat(hawaii);
var largeCounties = '06037|17031|48201|04013|06073|12086|36047|48113|53033|32003|48439|06085|12011|26163|48029|06001|42101|25017|36103|06067|36005|12099|12057|39035|42003|12095|39049|27053|51059|06013|49035|24031|29189|04019|37119|13121|55079|37183|06019|47157|09001|12103|36029|18097|09003|12031|09009|41051';

var census = (year => Math.floor((+year - 1) / 10) * 10);

function seeds(method, features) {
    var seeds;
    var ids = features.map(d => d.properties.id);

    if (method === 'large') {
        seeds = largeCounties.split('|')
            .map(geoid => ids.indexOf(geoid));
    }
    else if (method === 'state') {
        var byOriginalState = ids.reduce(function(obj, geoid, i) {
            if (excludes.indexOf(geoid) > -1)
                return obj;
            var key = geoid.substr(0, 2);
            obj[key] = obj[key] || [];
            obj[key].push(i);
            return obj;
        }, {});

        seeds = Object.keys(byOriginalState).map(d => random(byOriginalState[d]));
    }
    else {
        var excludeIds = new Set(excludes.map(geoid => ids.indexOf(geoid)));
        seeds = d3.shuffle(
            d3.range(2, features.length)
                .filter(i => !excludeIds.has(i))
            ).slice(0, stateCount);
    }

    return seeds;
}

function getYear() {
    return document.querySelector('[name=year]:checked').value;
}

function make(features, neighbors, options) {
    var seedindices = seeds((options || {}).method, features);
    var maker = new stateMaker(features, neighbors, {prob: prob, popField: '10'});

    var ak = maker.addState(features
        .filter(d => d.properties.id === '02000')
        .map(d => features.indexOf(d))
    );
    var hi = maker.addState(features
        .map((d, i) => hawaii.indexOf(d.properties.id) > -1 ? i : -1)
        .filter(d => d > -1)
    );
    var dc = maker.addState(features
        .filter(d => d.properties.id === '11001')
        .map(d => features.indexOf(d))
    );
 
    return maker.freezeState(dc)
        .freezeState(hi)
        .freezeState(ak)
        .divide(seedindices);
}

function program(error, topo, csv) {
    if (error) throw error;

    var features = topojson.feature(topo, topo.objects.counties).features;
    var neighbors = topojson.neighbors(topo.objects.counties.geometries);
    var results = d3.map(csv, d => d.GEOID);
    var elections = Object.keys(candidates).sort((a, b) => b - a);
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
        win = Math.floor(total / 2) + 1;

    svg.append('g')
        .attr('class', 'sg-counties')
        .selectAll('path')
        .data(features).enter()
        .append("path")
        .attr('class', 'sg-county')
        .attr('d', path);

    // set up SVG and DOM
    var state = svg.append('g').attr('class', 'sg-states');

    var boundary = svg.append('g')
        .append('path')
        .attr('class', 'sg-boundary');

    var tipping = svg.append('g')
        .append('path')
        .classed('sg-tipping', true);

    var labels = svg.append('g').classed('sg-labels', true);
    labels.append('g').classed('stroke', true);
    labels.append('g').classed('fill', true);

    // create bar charts
    var bars = svg.append('g').classed('sg-bars', true)
        .attr('transform', 'translate(' + [margins.left, height - (elections.length * (barheight + barbuf))] + ')');

    bars.append('line')
        .attr('y1', -barbuf)
        .attr('y2', elections.length * (barheight + barbuf))
        .attr('x1', x(win))
        .attr('x2', x(win));

    var transition = d3.transition()
        .duration(250);

    var infobox = d3.select('#infobox');
    infobox.select('table').append('tbody');

    var legend = svg.append('g')
        .classed('legend', true)
        .attr('transform', 'translate(' + (width - margins.right - (legUnit * legPct.length)) + ',480)');

    var countyLegend = legend.append('g')
        .classed('legend-county', true)
        .attr('transform', 'translate(0,' + (legUnit * 3.5) + ')');

    var legRows = countyLegend.selectAll('g')
        .data(legPct)
        .enter().append('g')
        .attr('transform', (_, i) => 'translate(' + (i * legUnit) + ')');

    legRows.selectAll('rect')
        .data(pct => legPop.map(pop => ({pop: pop, pct: pct})))
        .enter().append('rect')
            .attr('y', (_, i) => i * legUnit)
            .style('fill-opacity', d => opacity(d.pop))
            .style('fill', d => redblue(d.pct))
            .attr('height', legUnit)
            .attr('width', legUnit);

    legRows.append('text')
        .classed('pct', true)
        .text(d => percentize(d).slice(0, -4) + '%')
        .attr('transform', 'translate(' + (legUnit/2) + ') rotate(-45)');

    legRows.filter((_, i) => i === 0)
        .selectAll('.pop')
        .data(legPop)
        .enter().append('text')
        .style('text-anchor', 'end')
        .classed('pop', true)
        .text(d => K(d))
        .attr('y', (_, i)=> i * legUnit)
        .attr('dx', '-2')
        .attr('dy', '1.25em');

    countyLegend.append('text')
        .text('Two-party vote')
        .attr('dy', legUnit * -1.5)
        .attr('dx', legPct.length * legUnit / 2)
        .style('text-anchor', 'middle');

    countyLegend.append('text')
        .text('Total vote')
        .style('text-anchor', 'middle')
        .attr('transform', 'translate(' + (legUnit * -1.75) + ',' + (legUnit * 2.5) + ') rotate(-90)');

    // tipping point legend
    var stateLegend = legend.append('g')
        .classed('legend-state', true);

    stateLegend.append('rect')
        .classed('sg-tipping', true)
        .attr('width', legUnit)
        .attr('height', legUnit);

    stateLegend.append('text')
        .attr('x', legUnit)
        .attr('dx', 4)
        .attr('dy', '1.25em')
        .text('Tipping point state');

    var stateFillData = [
        {color: redblue.range().slice(-1), text: 'Democratic win'},
        {color: darkblue, text: '(over 60%)'},
        {color: redblue.range()[0], text: 'Republican win'},
        {color: darkred, text: '(over 60%)'},
    ];

    var stateFillLegend = stateLegend.append('g')
        .classed('legend-state', true)
        .selectAll('g').data(stateFillData)
        .enter().append('g')
        .attr('transform', (_, i) => 'translate(0,' + (1.5 * legUnit + i * legUnit) + ')');

    stateFillLegend.append('rect')
        .style('fill', d => d.color)
        .attr('width', legUnit)
        .attr('height', legUnit);

    stateFillLegend.append('text')
        .attr('x', legUnit)
        .attr('dx', 4)
        .attr('dy', '1.25em')
        .text(d => d.text);

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
                tot: maker.voteCount('t' + year),
            };
            var ev = {
                d: evs[c].map((ev, i) => (vote.d[i] > vote.r[i]) ? ev : 0),
                r: evs[c].map((ev, i) => (vote.r[i] > vote.d[i]) ? ev : 0),
            };
            vote.sum = {
                d: d3.sum(vote.d),
                r: d3.sum(vote.r)
            };
            ev.sum = {
                d: d3.sum(ev.d),
                r: d3.sum(ev.r)
            };
            // tipping point state
            var tippingState = -1;
            var winningParty = ev.sum.d > ev.sum.r ? 'd' : (ev.sum.d === ev.sum.r ? 0 : 'r');
            if (winningParty)
                vote[winningParty]
                    .map((d, i) => [i, d / vote.tot[i]])
                    .sort((a, b) => b[1] - a[1])
                    .map(d => [d[0], ev[winningParty][d[0]]])
                    .reduce(function(sum, d) {
                        sum = sum + d[1];
                        tippingState = (sum > win && tippingState === -1) ? d[0] : tippingState;
                        return sum + d[1];
                    }, 0);

            obj[year] = {
                vote: vote,
                ev: ev,
                tip: tippingState,
            };
            return obj;
        }, {});

        var statefeatures = maker.states().map(function(state, j) {
            var feature = topojson.merge(topo,
                Array.from(state).map(i => topo.objects.counties.geometries[i])
            );
            var names = Array.from(state).map(county => features[county].properties.n);
            feature.properties = {
                ev: {
                    1990: evs[1990][j],
                    2000: evs[2000][j],
                    2010: evs[2010][j],
                },
                dpct: elections.reduce((obj, year) => (obj[year] = counts[year].vote.d[j] / counts[year].vote.tot[j], obj), {}),
                rpct: elections.reduce((obj, year) => (obj[year] = counts[year].vote.r[j] / counts[year].vote.tot[j], obj), {}),
                tip: elections.reduce((obj, year) => (obj[year] = j === counts[year].tip, obj), {}),
                // force Hawaii to be called Hawaii
                name: names.indexOf('Hawaii') === -1 ? random(names) : 'Hawaii',
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
                vote: counts[year].vote.sum[party],
                ev: counts[year].ev.sum[party],
                state: counts[year].ev[party].filter(y => y > 0).length,
            }))
        }));

        var countyFill = function(selection) {
            var year = this;
            selection
                .style('fill', function(d) {
                    var x = results.get(d.properties.id);
                    return redblue(+x['d' + year] / (+x['r' + year] + (+x['d' + year])));
                })
                .style('fill-opacity', d =>
                    opacity(results.get(d.properties.id)['t' + year])
                );
        };

        var stateFill = function(selection) {
            var year = this;
            selection.style('fill', function(d, i) {
                if (d.properties.dpct[year] > 0.60)
                    return darkblue;
                else if (d.properties.rpct[year] > 0.60)
                    return darkred;
                else
                    return counts[year].ev.d[i] > 0 ? redblue.range()[2] : redblue.range()[0];
            });
        };

        var mousemove = function() {
            var mouse = d3.mouse(document.body);
            infobox
                .style('left', function(d) {
                    return (mouse[0] - (this.clientWidth/2)) + 'px';
                })
                .style('top', function(d) {
                    return (mouse[1] + 30) + 'px';
                });
        };

        var mouseover = function(d, i) {
            var year = getYear();
            var data = ['d', 'r'].map(party => ({
                party: party,
                winner: counts[year].ev[party][i] > 0,
                // name, votes, pct, EV
                data: [
                    candidates[year][party],
                    commaize(counts[year].vote[party][i]),
                    percentize(counts[year].vote[party][i] / counts[year].vote.tot[i]),
                    counts[year].ev[party][i]
                ]})
            );

            var rows = infobox.select('tbody')
                .selectAll('tr').data(data);

            rows.exit().remove();

            var enter = rows.enter().append('tr')
                .attr('class', d => d.party);

            var cells = rows.merge(enter)
                .classed('sg-win', d => d.winner)
                .selectAll('td')
                .data(d => d.data);

            cells
                .merge(cells.enter().append('td'))
                .text(d => d || '–');

            infobox
                .style('visibility', 'visible')
                .select('#infobox-name')
                .text(d.properties.name);
        };

        // state paths

        var states = state.selectAll('path')
            .data(statefeatures, (d, i) => d.properties.hash);

        states.exit().remove();

        var enterStates = states.enter()
            .append('path');

        states = states.merge(enterStates)
            .attr('d', path);

        // state label text

        function addLabels(selection) {
            var text = selection.selectAll('text')
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

            // mouse actions

            enterText
                .on('mouseover', mouseover)
                .on('mouseout', _ => infobox.style('visibility', 'hidden'))
                .on('mousemove', mousemove);
        }

        labels.select('.fill')
            .call(addLabels);

        labels.select('.stroke')
            .call(addLabels);

        // mouse actions

        states
            .on('mouseover', mouseover)
            .on('mouseout', _ => infobox.style('visibility', 'hidden'))
            .on('mousemove', mousemove);

        // state boundary

        boundary.datum(
            topojson.mesh(topo, topo.objects.counties, (a, b) =>
                maker.countyMaps.fips[a.properties.id] !== maker.countyMaps.fips[b.properties.id]
            ))
            .attr('d', path);

        // bar charts

        var bar = bars.selectAll('.sg-bar-parent')
            .data(votes);

        var barEnter = bar.enter()
            .append('g')
            .classed('sg-bar-parent', true)
            .attr('transform', (_, i) => 'translate(0,' + (i * (barheight + barbuf)) + ')' );

        // year labels
        barEnter.append('text')
            .text(d => d.year)
            .attr('dx', -margins.left)
            .attr('dy', '1em');

        var rects = bar
            .merge(barEnter)
            .selectAll('.sg-bar')
            .data(d => d.data);

        var newRects = rects.enter()
            .append('g')
            .attr('class', d => 'sg-bar sg-bar-' + d.party)
            .attr('name', d => d.name);
        
        newRects.append('rect')
            .attr('height', barheight);

        // candidate labels
        newRects.append('text')
            .text(d => d.name)
            .attr('dy', '1em')
            .attr('dx', (_, i) => i === 0 ? barbuf : -barbuf)
            .attr('x', (_, i) => i === 0 ? 0 : x(total));

        newRects.append('text')
            .attr('dy', '1em')
            .attr('dx', (_, i) => i === 0 ? -barbuf : barbuf)
            .classed('sg-ev', true);

        rects = rects
            .merge(newRects)
            .classed('sg-win', d => d.ev >= win);

        rects.select('rect')
            .transition(transition)
            .attr('width', d => x(d.ev))
            .filter((d, i) => i === 1)
            .attr('transform', d => 'translate(' + x(total - d.ev) + ')');

        rects.select('.sg-ev')
            .transition(transition)
            .text(d => d.ev)
            .attr('x', (d, i) => i === 0 ? x(d.ev) : x(total - d.ev));

        function draw() {
            var geography = document.querySelector('[name=view]:checked').value;
            var year = getYear();

            var states = d3.select('.sg-states').selectAll('path');
            var cg = d3.selectAll('.sg-counties');

            labels.selectAll('tspan:last-child').text(d => d.properties.ev[census(year)]);

            tipping
                .datum(statefeatures.filter(d => d.properties.tip[year])[0])
                .attr('d', path);

            if (geography === 'county') {
                d3.selectAll('.sg-county')
                    .call(countyFill.bind(year));
                states.style('fill-opacity', 0);
                boundary
                    .style('stroke', '#333')
                    .style('stroke-width', '.5px');

                countyLegend.style('visibility', null);
                cg.style('visibility', null);
                labels.style('visibility', 'hidden');
                stateLegend.style('visibility', 'hidden');
                tipping.style('visibility', 'hidden');

            } else {
                states
                    .call(stateFill.bind(year))
                    .style('fill-opacity', null);
                boundary
                    .style('stroke', null)
                    .style('stroke-width', null);

                countyLegend.style('visibility', 'hidden');
                cg.style('visibility', 'hidden');
                labels.style('visibility', null);
                stateLegend.style('visibility', null);
                tipping.style('visibility', null);
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
    .defer(d3.json, 'files/state-generator-counties.json')
    .defer(d3.csv, 'files/state-generator-results.csv')
    .await(program);
