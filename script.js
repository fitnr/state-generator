var stateGenerator = (function () {
    'use strict';

    /* jshint esversion: 6 */

    function range(n) {
        return Array.apply(null, Array(n)).map(function (_, i) {
            return i;
        });
    }

    function random(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function stateMaker$1(features, neighbors, options) {
        this.prob = options.prob || function () {
            return Math.random();
        };
        this.neighbors = neighbors;
        this.originalNeighbors = neighbors;
        this.features = features;
        this._states = [];
        this.countyMaps = {
            fips: {},
            index: {}
        };
        this.frozen = new Set();
        // this.noNeighbors = new Set();
        this.unselected = new Set(range(this.features.length));
        return this;
    }

    var __moduleExports = stateMaker$1;

    /**
     * "accessor" is either a field in feature properties or
     * a function that takes the feature's index
     */
    stateMaker$1.prototype.sum = function (countySet, accessor) {
        if (typeof accessor === 'string') {
            var field = accessor;
            accessor = function accessor(i) {
                return this.features[i].properties[field];
            };
        }
        return Array.from(countySet).map(accessor, this).reduce(function (prev, curr) {
            return curr + prev;
        }, 0);
    };

    stateMaker$1.prototype.addState = function (list) {
        var _this = this;

        // add to list
        var i = this._states.push(new Set([])) - 1;
        list.forEach(function (x) {
            return _this.addToState(x, i);
        });
        return i;
    };

    stateMaker$1.prototype.getState = function (i) {
        return this._states[i];
    };

    stateMaker$1.prototype.stateOf = function (county) {
        return this.countyMaps.index[county];
    };

    stateMaker$1.prototype.addToState = function (county, state) {
        // hacky way to avoid adding seeds to new state. seeds just get ignored, i guess?
        if (this.stateOf(county)) return;
        // add to list
        this._states[state].add(county);
        // add to countyMaps
        this.countyMaps.fips[this.features[county].properties.id] = this.countyMaps.index[county] = state;
        // remove from unselected
        this.unselected.delete(county);
    };

    /** Get the states that neighbor a county. Ignores frozen states, but passes 'undefined' */
    stateMaker$1.prototype.getNeighborStates = function (county) {
        var _this2 = this;

        return this.neighbors[county].map(function (neighbor) {
            return _this2.stateOf(neighbor) || -1;
        }).filter(function (state) {
            return !_this2.frozen.has(state);
        });
    };

    stateMaker$1.prototype.assignOrphans = function (county) {
        var neighborStates = this.getNeighborStates(county).filter(function (state) {
            return state > -1;
        });
        if (neighborStates.length) this.addToState(county, random(neighborStates));
    };

    stateMaker$1.prototype.freezeState = function (d) {
        this.frozen.add(d);
    };

    /**
     * divide the country into max <n> states
     */
    stateMaker$1.prototype.divideCountry = function (seeds, options) {
        var _this3 = this;

        seeds.forEach(function (seed) {
            this.addState([seed]);
        }, this);

        var states = seeds.map(this.stateOf, this),
            seedlings = true;

        // removed from the map
        // this is sloow
        // if (x) this.landlockedBy(state)
        //     .forEach(function(c) { this.addToState(c, state); }, this);

        while (seedlings === true) {
            seedlings = states.map(function (state) {
                return _this3.enlargeState(state);
            }).some(function (d) {
                return d;
            });
        }options = options || {};
        // Add unselected counties to neighboring states
        if (!options.noAssignOrphans) while (this.unselected.values().length > 0) {
            this.unselected.values().forEach(this.assignOrphans, this);
        }return this._states;
    };

    stateMaker$1.prototype.enlargeState = function (state) {
        var county = this.pickCounty(this.getState(state));
        if (county === false) return false;
        this.addToState(county, state);
        return true;
    };

    stateMaker$1.prototype.pickCounty = function (countySet) {
        var _this4 = this;

        var self = this;
        var pop = this.sum(countySet, 'pop');
        var probability = this.prob(countySet.size, pop);

        if (Math.random() < probability) {
            // console.log('l: ' + countyList.length + ', pop: ' + pop + ', p: ' + Math.round(probability*100) + '%');
            return false;
        } else {
            var neighborlings = [].concat.apply([], Array.from(countySet).map(function (d) {
                return self.neighbors[d];
            }));
            var currentNeighbors = Array.from(new Set(neighborlings)).filter(function (d) {
                return _this4.unselected.has(d);
            });

            if (currentNeighbors.length === 0) {
                // console.log('no neighbors!');
                // countySet.values()
                //     .forEach(function(d) { this.noNeighbors.add(d); }, this);
                return false;
            }

            var u = random(currentNeighbors);
            return u;
        }
    };

    /**
     * @states a list of populations. 
     * @returns Array of representative count
     */
    function apportion$1(states, options) {
        options = options || {};
        var reps = options.reps || 435,
            allocations = states.map(function () {
            return 1;
        }),
            allocated = 0;

        function priority(d, i) {
            var c = allocations[i];
            return d / Math.pow(c * (c + 1), 0.5);
        }
        function statePriority(d, i) {
            return priorities[i];
        }
        function sum(a, b) {
            return a + b;
        }

        while (allocated < reps) {
            var priorities = states.map(priority),
                top = priorities.indexOf(Math.max.apply(null, priorities));
            allocations[top]++;
            allocated = allocations.reduce(sum);
        }
        return allocations;
    }

    var __moduleExports$1 = apportion$1;

    /* jshint esversion: 6 */

    var stateMaker = __moduleExports;
    var apportion = __moduleExports$1;

    var height = 1000;
    var width = 1900;
    var svg = d3.select("body").append('svg').attr('height', height).attr('width', width);

    var projection = d3.geoAlbersUsa().scale(1900).translate([750, 500]);

    var path = d3.geoPath().projection(projection);

    var candidates = {
        '00': {
            d: 'Gore',
            r: 'Bush'
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

    var lightness = d3.scaleLinear().domain([100, 1e6, 2e6]).range([0.96, 0.4, 0.3]).clamp(1);

    var redblue = d3.scaleLinear().clamp(true).domain([0.3, 0.5, 0.7]).range(['#2166ac', '#bd9cd9', '#e31a1c']);

    // probability functions
    var countScale = d3.scalePow().exponent(2).domain([3, 10, 300]).range([0, 0.001, 1]);

    var populationScale = d3.scalePow().exponent(2).domain([600000, 10e6]).clamp(true).range([0, 1]);

    function prob(count, pop) {
        return (countScale(count) + populationScale(pop)) / 2;
    }

    var fmt = d3.format(',');

    var maker;
    var seeds = ['06009', '08059', 12095, 22127, 36061, 54063, '01073', '04007', 12039, 17031, 30077, 47119, '06073', '06079', 42101, '06041', 48321, 47029, 56025, 16011, 21077, 29187, 45081, 36101, 35049, 24510, 53027, '05035', 20005, 13057, 27123, 48367, 44003, 42073, 50015, 51760, 12011, 55131, 39173, 40017, 23019, 28031, 31021, 41053, 38083, 33005, 18095, 26145];
    seeds = '36031|36033|36035|36037|36039|36041|36043|36045|36047|36049|36051|36053|36055|36057|36059|36061|36063|36065|36067|36069|36071|36073|36075|36077|36079|36081|36083|36085|36087|36089|36091|36093|36095|36097|36099|36101|36103|36105|36107|36109|36111|36113|36115|36117|36119|36121|36123'.split('|');

    function program(error, topo, csv) {
        if (error) throw error;

        var features = topojson.feature(topo, topo.objects.counties).features;
        var mapfeatures = d3.map(features, function (d) {
            return d.properties.id;
        });
        var neighbors = topojson.neighbors(topo.objects.counties.geometries);
        var results = d3.map(csv, function (d) {
            return d.GEOID;
        });
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
            paths.attr('fill', function (d) {
                var x = results.get(d.properties.id);
                var hsl = d3.hsl(redblue(+x['r' + year] / (+x['r' + year] + Number(x['d' + year]))));
                hsl.l = lightness(d.properties.pop);
                // debugger;
                return hsl + "";
            });
        }

        // drawResults('16');

        maker = new stateMaker(features, neighbors, { prob: prob });
        maker.addState([features.indexOf(mapfeatures.get('02'))]);
        maker.addState([features.indexOf(mapfeatures.get('15'))]);
        var dc = maker.addState([features.indexOf(mapfeatures.get('11001'))]);
        maker.freezeState(dc);

        var states = maker.divideCountry(seedindices);

        var statefeatures = states.map(function (state) {
            return topojson.merge(topo, topo.objects.counties.geometries.filter(function (_, i) {
                return state.has(i);
            }));
        });

        // extra rep for D.C.
        var evs = apportion(states.map(function (state) {
            return maker.sum(state, 'pop');
        }), { reps: 436 }).map(function (d) {
            return d + 2;
        });

        // e.g. voteCount('d16') returns state-by-state totals for Dem in '16
        var voteCount = function voteCount(key) {
            return states.map(function (state) {
                return maker.sum(state, function (i) {
                    return +results[features[i].properties.id][key];
                });
            });
        };

        var counts = elections.reduce(function (obj, y) {
            return obj[y] = {
                d: voteCount('d' + y),
                r: voteCount('r' + y)
            }, obj;
        }, {});

        // return the number list of EV total by state for given year, party
        function getEv(year, party) {
            var oppo = party === 'd' ? 'r' : 'd';
            return evs.map(function (ev, i) {
                return counts[year][party][i] > counts[year][oppo][i] ? ev : 0;
            });
        }

        var summary = elections.map(function (year) {
            var dev = getEv(year, 'd'),
                rev = getEv(year, 'r');
            return {
                year: year,
                data: [[candidates[year].d, d3.sum(dev), dev.filter(function (x) {
                    return x > 0;
                }).length], [candidates[year].r, d3.sum(rev), rev.filter(function (x) {
                    return x > 0;
                }).length]] };
        });

        var statePaths = svg.append('g').attr('class', 'states').selectAll('.state').data(statefeatures).enter().append('g').attr('class', 'state');

        statePaths.attr('fill', function (d, i) {
            return counts[16].d[i] > counts[16].r[i] ? redblue.range()[0] : redblue.range()[2];
        });

        statePaths.append('path').attr('d', path).attr('id', function (d, i) {
            return 'state-' + i;
        });

        statePaths.append('text').attr('transform', function (d) {
            return 'translate(' + path.centroid(d) + ')';
        }).text(function (_, i) {
            return evs[i];
        });

        svg.append('g').append('path').datum(topojson.mesh(topo, topo.objects.counties, function (a, b) {
            return maker.countyMaps.fips[a.properties.id] !== maker.countyMaps.fips[b.properties.id];
        })).attr('class', 'boundary').attr('d', path);

        // d3.select('body').append('ul')
        //     .selectAll('li')
        //     .data(states).enter()
        //     .append('li')
        //     .text(function(state) {
        //         return '' + state.size() + ' counties. ' + fmt(maker.sum(state, 'pop'));
        //     });

        var tables = d3.select('.tables').selectAll('table').data(votes).enter().append('table').sort(function (a, b) {
            return b.year - a.year;
        });

        tables.append('thead').append('tr').selectAll('th').data(['candidate', 'popular', 'electoral', 'n']).enter().append('th').text(function (d) {
            return d;
        });

        tables.append('tbody').selectAll('tr').data(function (d) {
            return d.data;
        }).enter().append('tr').attr('class', function (d) {
            return d[2] > 269 ? 'winner' : '';
        }).selectAll('td').data(function (d) {
            return d;
        }).enter().append('td').text(function (d) {
            var x = fmt(d);
            return x === 'NaN' ? d : x;
        });

        var pointer = d3.select('body').append('div').attr('id', 'info');

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

    var q = d3.queue().defer(d3.json, 'data/counties.json').defer(d3.csv, 'data/results.csv').await(program);

    var script = {};

    return script;

}());