/* jshint esversion: 6 */

function graph(error, data) {
    var height = 100,
        width = 300,
        sims = 10000;

    var x = d3.scaleLinear()
        .domain([0, 538])
        .range([0, width]);

    var y = d3.scaleLinear()
        .range([height, 0]);

    var axis = {
        x: d3.axisBottom(x),
        y: d3.axisLeft(y)
    };

    var blop = [].concat.apply([], [].concat.apply([], data
        .map(d => d.results
            .map(r =>
                Object.keys(r.devs).map(k => r.devs[k])
            )
        )
    ));

    y.domain([0, d3.max(blop)/10000]);

    var svg = d3.select('body').append('svg')
        .attr('height', height * data.length)
        .attr('width', width * data[0].results.length)
        .append('g')
        .attr('transform', 'translate(' + 10 + ',' + 10 + ')');

    var methods = svg.selectAll('g')
        .data(data)
      .enter().append('g')
        .attr('transform', (_, i) => 'translate(0,' + (i * height) + ')');

    methods.append('text').text(d => d.method);

    var graphs = methods.selectAll('g')
        .data(d => d.results)
      .enter().append('g')
        .attr('transform', (d, i) => 'translate(' + (i * width) + ')');

    graphs.append('g')
        .call(axis.y)
        .call(axis.x);

    graphs.selectAll('rect')
        .data(d =>
            Object.keys(d.devs).map(k => ({
                ev: +k,
                n: d.devs[k] / sims
            })
        ))
      .enter().append('rect')
        .attr('x', d => x(d.ev))
        .attr('y', d => y(d.n))
        .attr('height', d => height - y(d.n))
        .attr('width', 2)
        .attr('class', (d => (d.ev < 269) ? 'd' : (d.ev == 269 ? 't' : 'r')));
}

d3.queue()
    .defer(d3.json, 'simulations-10000.json')
    .await(graph);
