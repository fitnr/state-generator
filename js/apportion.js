/* jshint esversion: 6 */

/**
 * @states a list of populations. 
 * @returns Array of representative count
 */
module.exports = function(states, options) {
    options = options || {};
    var reps = options.reps || 435,
        allocations = states.map(function() { return 1; }),
        allocated = 0;

    function priority(d, i) {
        var c = allocations[i];
        return d / Math.pow(c * (c + 1), 0.5);
    }
    function sum(a, b) { return a + b; }

    while (allocated < reps) {
        var priorities = states.map(priority),
            top = priorities.indexOf(Math.max.apply(null, priorities));
        allocations[top]++;
        allocated = allocations.reduce(sum);
    }
    return allocations;
};
