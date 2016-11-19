/* jshint esversion: 6 */

/**
 * @states a list of populations. 
 * @returns Array of representative count
 */
function apportion(states, options) {
    options = options || {};
    var reps = options.reps || 435,
        allocations = states.map(function() { return 1; }),
        allocated = 0;

    function priority(d, i) {
        var c = allocations[i];
        return d / Math.pow(c * (c + 1), 0.5);
    }
    function statePriority(d, i) { return priorities[i]; }
    function sum(a, b) { return a + b; }

    while (allocated < reps) {
        var priorities = states.map(priority),
            top = priorities.indexOf(Math.max.apply(null, priorities));
        allocations[top]++;
        allocated = allocations.reduce(sum);
    }
    return allocations;
}

module.exports.evCount = function (statemaker, options) {
    options = options || {reps: 436};
    return apportion(statemaker.states().map(state => statemaker.sum(state, 'pop')), options)
        .map(d => d + 2);
};

module.exports.apportion = apportion;
