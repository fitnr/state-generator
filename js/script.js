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
    .range([0, width - margins.left - margins.right]);

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

function drawCountyLegend(countyLegend, legUnit) {
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
}

function drawStateLegend(stateLegend, legUnit) {
    var stateFillData = [
        {color: redblue.range().slice(-1), text: 'Democratic win'},
        {color: darkblue, text: '(over 60%)'},
        {color: redblue.range()[0], text: 'Republican win'},
        {color: darkred, text: '(over 60%)'},
    ];
 
    stateLegend.append('rect')
        .classed('sg-tipping', true)
        .attr('width', legUnit)
        .attr('height', legUnit);

    stateLegend.append('text')
        .attr('x', legUnit)
        .attr('dx', 4)
        .attr('dy', '1.25em')
        .text('Tipping point state');

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
}

var hawaii = ['15001', '15003', '15005', '15007', '15009'];
var excludes = ['02000', '11001'].concat(hawaii);
var largeCounties = '06037|17031|48201|04013|06073|12086|36047|48113|53033|32003|48439|06085|12011|26163|48029|06001|42101|25017|36103|06067|36005|12099|12057|39035|42003|12095|39049|27053|51059|06013|49035|24031|29189|04019|37119|13121|55079|37183|06019|47157|09001|12103|36029|18097|09003|12031|09009|41051';

var metros = '36027,36079,36059,36103,34013,34019,34027,34035,34037,34039,42103,34003,34017,34023,34025,34029,34031,36005,36047,36061,36071,36081,36085,36087,36119|06059,06037|17031,17043,17063,17093,17111,17197,17037,17089,18073,18089,18111,18127,17097,55059|48085,48113,48121,48139,48231,48257,48397,48221,48251,48367,48425,48439,48497|48015,48039,48071,48157,48167,48201,48291,48339,48473|24021,24031,11001,24009,24017,24033,51013,51043,51047,51059,51061,51107,51153,51157,51177,51179,51187,51510,51600,51610,51630,51683,51685,54037|34005,34007,34015,42017,42029,42091,42045,42101,10003,24015,34033|12011,12086,12099|13013,13015,13035,13045,13057,13063,13067,13077,13085,13089,13097,13113,13117,13121,13135,13143,13149,13151,13159,13171,13199,13211,13217,13223,13227,13231,13247,13255,13297|25021,25023,25025,25009,25017,33015,33017|06001,06013,06075,06081,06041|04013,04021|06065,06071|26163,26087,26093,26099,26125,26147|53033,53061,53053|27003,27019,27025,27037,27053,27059,27079,27095,27123,27139,27141,27143,27163,27171,55093,55109|06073|12053,12057,12101,12103|08001,08005,08014,08019,08031,08035,08039,08047,08059,08093|17005,17013,17027,17083,17117,17119,17133,17163,29071,29099,29113,29183,29189,29219,29510|24003,24005,24013,24025,24027,24035,24510|37025,37071,37097,37109,37119,37159,37179,45023,45057,45091|41005,41009,41051,41067,41071,53011,53059|12069,12095,12097,12117|48013,48019,48029,48091,48187,48259,48325,48493|42003,42005,42007,42019,42051,42125,42129|06017,06061,06067,06113|18029,18115,18161,21015,21023,21037,21077,21081,21117,21191,39015,39017,39025,39061,39165|32003|20091,20103,20107,20121,20209,29013,29025,29037,29047,29049,29095,29107,29165,29177|39035,39055,39085,39093,39103|39041,39045,39049,39073,39089,39097,39117,39127,39129,39159|48021,48055,48209,48453,48491|18011,18013,18057,18059,18063,18081,18095,18097,18109,18133,18145|06069,06085|47015,47021,47037,47043,47081,47111,47119,47147,47149,47159,47165,47169,47187,47189|37053,37073,51073,51093,51095,51115,51199,51550,51650,51700,51710,51735,51740,51800,51810,51830|25005,44001,44003,44005,44007,44009|55079,55089,55131,55133|12003,12019,12031,12089,12109|40017,40027,40051,40081,40083,40087,40109|05035,28009,28033,28093,28137,28143,47047,47157,47167|18019,18043,18061,18143,18175,21029,21103,21111,21185,21211,21215,21223|37069,37101,37183|51007,51033,51036,51041,51053,51075,51085,51087,51101,51127,51145,51149,51183,51570,51670,51730,51760|22051,22071,22075,22087,22089,22093,22095,22103|09003,09007,09013|49035,49045';

var census = (year => Math.floor((+year - 1) / 10) * 10);

function seeds(features, options) {
    options = options || {};
    var seeds;
    var ids = features.map(d => d.properties.id);
    var method = options.method || 'random';
    var stateCount = options.stateCount || 50;
    var sliceEnd = stateCount > 2 ? stateCount - 2 : stateCount;

    if (method === 'large') {
        seeds = largeCounties.split('|')
            .map(geoid => ids.indexOf(geoid))
            .slice(0, sliceEnd);
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
        seeds = Object.keys(byOriginalState).map(d => random(byOriginalState[d])).slice(0, sliceEnd);
    }
    else if (method === 'metro') {
        seeds = metros.split('|')
            .map(d => d.split(',').map(geoid => ids.indexOf(geoid))
        );
    }
    else {
        var excludeIds = new Set(excludes.map(geoid => ids.indexOf(geoid)));
        seeds = d3.shuffle(
            d3.range(2, features.length)
                .filter(i => !excludeIds.has(i))
            ).slice(0, sliceEnd);
    }

    return seeds;
}

function getYear() {
    return document.querySelector('[name=year]:checked').value;
}

function make(features, neighbors, options) {
    var seedindices = seeds(features, options);
    var maker = new stateMaker(features, neighbors, {prob: prob, popField: '10'});
    var stateCount = (options||{}).stateCount || 3;

    if (stateCount > 2) {
        var ak = maker.addState(features
            .filter(d => d.properties.id === '02000')
            .map(d => features.indexOf(d))
        );
        maker.freezeState(ak);
    }
    if (stateCount > 1) {
        var hi = maker.addState(features
            .map((d, i) => hawaii.indexOf(d.properties.id) > -1 ? i : -1)
            .filter(d => d > -1)
        );
        maker.freezeState(hi);
    }
    var dc = maker.addState(features
        .filter(d => d.properties.id === '11001')
        .map(d => features.indexOf(d))
    );
 
    return maker.freezeState(dc)
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
        .attr('y2', elections.length * (barheight + barbuf));

    var transition = d3.transition()
        .duration(250);

    var infobox = d3.select('#infobox');
    infobox.select('table').append('tbody');

    var legend = svg.append('g')
        .classed('legend', true)
        .attr('transform', 'translate(' + (width - margins.right - (legUnit * legPct.length)) + ',480)');

    var countyLegend = legend.append('g')
        .classed('legend-county', true)
        .attr('transform', 'translate(0,' + (legUnit * 3.5) + ')')
        .call(drawCountyLegend, legUnit);

    // tipping point legend
    var stateLegend = legend.append('g')
        .classed('legend-state', true)
        .call(drawStateLegend, legUnit);

    /**
     * Run the map
     */
    function run() {
        if (d3.event) d3.event.preventDefault();

        var method = document.querySelector('[name=method]:checked').value,
            reps = +document.getElementById('count-rep').value + 1,
            stateCount = +document.getElementById('count-state').value;

        var maker = make(features, neighbors, {method: method, stateCount: stateCount});

        // 2 => dc "senators"
        var total = reps + 2 + stateCount * 2,
            win = Math.floor(total / 2) + 1;

        x.domain([0, total]);

        console.log('reps ' + reps + ' states: ' + stateCount);
        console.log('total ' + total + '. win ' + win);

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
        bars.select('line')
            .attr('x1', x(win))
            .attr('x2', x(win));

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

    d3.selectAll('[type=range]').on('change', function(){
        document.getElementById(this.id + '-output').value = this.value;
    });

    run();
}

d3.queue()
    .defer(d3.json, 'files/state-generator-counties.json')
    .defer(d3.csv, 'files/state-generator-results.csv')
    .await(program);
