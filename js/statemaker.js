/* jshint esversion: 6 */

function range(n) {
    return Array.apply(null, Array(n)).map(function (_, i) { return i; });
}

function random(list) { return list[Math.floor(Math.random() * list.length)]; }

function stateMaker(features, neighbors, options) {
    this.prob = (options || {}).prob || function() { return Math.random(); };
    this.neighbors = neighbors;
    this.originalNeighbors = neighbors;
    this.features = features;
    this._states = [];
    this.countyMaps = {
        fips: {},
        index: {},
    };
    this.frozen = new Set();
    // this.noNeighbors = new Set();
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
    list.forEach(x => this.addToState(x, i));
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
stateMaker.prototype.getNeighborStates = function(county) {
    return this.neighbors[county]
        .map(neighbor => this.stateOf(neighbor) || -1)
        .filter(state => !this.frozen.has(state));
};

stateMaker.prototype.assignOrphans = function(county) {
    var neighborStates = this.getNeighborStates(county).filter(state => state > -1);
    if (neighborStates.length) this.addToState(county, random(neighborStates));
};

stateMaker.prototype.freezeState = function(d) {
    this.frozen.add(d);
    return this;
};

/**
 * divide the country into max <n> states
 */
stateMaker.prototype.divideCountry = function(seeds, options) {
    options = options || {assignOrphans: true};
    seeds.forEach(function(seed) { this.addState([seed]); }, this);

    var states = seeds.map(this.stateOf, this),
        seedlings = true,
        englarge = (state => this.enlargeState(state, options));

    // removed from the map
    // this is sloow
    // if (x) this.landlockedBy(state)
    //     .forEach(function(c) { this.addToState(c, state); }, this);

    while (seedlings === true)
        seedlings = states.map(englarge).some(d => d);

    // Add unselected counties to neighboring states
    if (options.assignOrphans)
        while (this.unselected.size > 0)
            Array.from(this.unselected).forEach(this.assignOrphans, this);
    else console.debug('not assigning orphans');
    return this._states;
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
    var pop = this.sum(countySet, 'pop');
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
            // countySet.values()
            //     .forEach(function(d) { this.noNeighbors.add(d); }, this);
            return false;
        }

        var u = random(currentNeighbors);
        return u;
    }
};

/*
// find counties landlocked by a particular states
stateMaker.prototype.landlockedBy = function(state) {
    return this.unselected.values().filter(function(county) {
        var set = new Set(this.getNeighborStates(county));
        return set.size === 1 && set.has(state);
    }, this);
};

stateMaker.prototype.generateState = function(seed) {
    // assumes seed already is a state
    var state = this.stateOf(seed) || this.addState([seed]);
    while (true)
        if (this.enlargeState(state) === false) break;
    // find landlocked counties and add them to this state
    this.landlockedBy(state)
        .forEach(function(c) { this.addToState(c, state); }, this);
};
*/
