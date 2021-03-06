/* jshint esversion: 6 */

var apportion = require('./apportion');

function range(n) {
    return Array.apply(null, Array(n)).map(function (_, i) { return i; });
}

function random(list) { return list[Math.floor(Math.random() * list.length)]; }

function stateMaker(features, neighbors, options) {
    options = options || {};
    this.prob = options.prob || function() { return Math.random(); };
    this.popField = options.popField || 'pop';
    this.neighbors = neighbors;
    this.features = features;
    this._states = [];
    this.countyMaps = {
        fips: {},
        index: {},
    };
    this.frozen = new Set();
    this.unselected = new Set(range(this.features.length));
    return this;
}

module.exports = stateMaker;

stateMaker.prototype.states = function() { return this._states; };

/**
 * "accessor" is either a field in feature properties or
 * a function that takes the feature's index
 */
stateMaker.prototype.sum = function(countySet, accessor) {
    if (typeof(accessor) === 'string') {
        var field = accessor;
        accessor = function(i) { return this.features[i].properties[field]; };
    }
    return Array.from(countySet).map(accessor, this)
        .reduce((prev, curr) => (curr + prev), 0);
};

stateMaker.prototype.addState = function(list) {
    // add to list
    var i = this._states.push(new Set([])) - 1;
    (Array.isArray(list) ? list : [list]).forEach(x => this.addToState(x, i));
    return i;
};

stateMaker.prototype.getState = function(i) { return this._states[i]; };

stateMaker.prototype.stateOf = function(county) { return this.countyMaps.index[county]; };

stateMaker.prototype.addToState = function(county, state) {
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
stateMaker.prototype.getNeighbors = function(county) {
    return this.neighbors[county]
        .map(neighbor => this.stateOf(neighbor) || -1)
        .filter(state => !this.frozen.has(state));
};

stateMaker.prototype.assign = function(county) {
    var neighborStates = this.getNeighbors(county).filter(state => state > -1);
    if (neighborStates.length) this.addToState(county, random(neighborStates));
};

stateMaker.prototype.freezeState = function(d) {
    this.frozen.add(d);
    return this;
};

/**
 * divide the country into max <n> states
 */
stateMaker.prototype.divide = function(seeds, options) {
    options = options || {assign: true};
    var states = seeds.map(function(seed) { return this.addState(seed); }, this),
        active = true,
        statuses = states.map(function(_, i) { return this.frozen.has(i) ? false : true; }, this);

    function enlarge(state, i) {
        return statuses[i] ? this.enlargeState(state, options) : false;
    }

    while (active === true) {
        statuses = states.map(enlarge, this);
        active = statuses.some(d => d);
    }

    // Add unselected counties to neighboring states
    if (options.assign)
        while (this.unselected.size > 0)
            Array.from(this.unselected).forEach(this.assign, this);

    return this;
};

stateMaker.prototype.enlargeState = function(state, options) {
    var county = this.pickCounty(this.getState(state), options);
    if (county === false) return false;
    this.addToState(county, state);
    return true;
};

stateMaker.prototype.pickCounty = function(countySet, options) {
    var prob = (options || {}).prob || this.prob;
    var self = this;
    var pop = this.sum(countySet, this.popField);
    var probability = prob(countySet.size, pop);

    if (Math.random() < probability) {
        // console.log('l: ' + countyList.length + ', pop: ' + pop + ', p: ' + Math.round(probability*100) + '%');
        return false;
    }
    else {
        var neighborlings = [].concat.apply([], Array.from(countySet).map(d => self.neighbors[d]));
        // put neighborlings into a Set to get a unique list.
        // Or don't to prefer counties that neighbor multiple times
        var currentNeighbors = neighborlings.filter(d => this.unselected.has(d));

        if (currentNeighbors.length === 0) {
            // console.log('no neighbors!');
            return false;
        }
        else return random(currentNeighbors);
    }
};

stateMaker.prototype.ev = function(reps, key) {
    reps = reps || 436;
    return apportion(this.states().map(state => this.sum(state, key)), {reps: reps})
        .map(d => d + 2);
};
