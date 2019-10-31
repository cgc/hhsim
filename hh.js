function HH({
    dt = 0.01,// ms
    total_time = 200,// ms

    // These starting params are the steady state for the below conductances and equilibrium potentials.
    V0 = -65,// mV
    n0 = 0.32,
    h0 = 0.6,
    m0 = 0.05,

    // Current and Voltage Clamp can be a function of time
    I = null,// uA / cm^2
    VoltageClamp=null,

    // Setting up some constants
    gNa = 120,// mS/cm^2
    gK = 36,// mS/cm^2
    gL = 0.3,// mS/cm^2

    VNa = 50,// mV
    VK = -77,// mV
    VL = -54.4,// mV

    C = 1,// uF/cm^2
}={}) {

    let Ifunc = I != null ? I : () => 0;

    // Vars to track state
    let V = V0;
    let n = n0;
    let m = m0;
    let h = h0;

    // Vars to hold history
    let ts = [];
    //let history = {V:[V], t:ts, n:[n], m:[m], h:[h], I:[0], gateI:[0], VoltageClamp:[V]}
    let history = {
        V:[], t:ts, n:[], m:[], h:[], I:[],
        gateI:[], VoltageClamp:[],
        isVoltageClamp: VoltageClamp != null,
        isAddCurrent: I != null,
    };

    // First time is initial values, so skip that...
    for (let t = 0; t <= total_time; t+=dt) {
        ts.push(t);
        // And now we compute! first the gating subvars...
        let alpha_n = 0.01 * (V + 55) / (1 - Math.exp(-(V + 55)/10))
        let alpha_m = 0.1 * (V + 40) / (1 - Math.exp(-(V + 40)/10))
        let alpha_h = 0.07 * Math.exp(-(V + 65)/20)

        let beta_n = 0.125 * Math.exp(-(V + 65)/80)
        let beta_m = 4 * Math.exp(-(V + 65)/18)
        let beta_h = 1 / (1 + Math.exp(-(V + 35)/10))

        // Then our gating vars
        let dn = dt * (alpha_n * (1 - n) - beta_n * n)
        let dm = dt * (alpha_m * (1 - m) - beta_m * m)
        let dh = dt * (alpha_h * (1 - h) - beta_h * h)

        // Finally, we compute next voltage.
        let Ival = Ifunc(t)
        let gateI = (
            gNa * m ** 3 * h * (V - VNa)
            + gK * n ** 4 * (V - VK)
            + gL * (V - VL)
        );
        // Adding voltage clamp
        let vcI = 0;
        if (VoltageClamp != null) {
            let vc = VoltageClamp(t);
            vcI = (vc - V) * C / dt;
            history['VoltageClamp'].push(vc);
        }
        let dV = dt * (Ival - gateI + vcI) / C

        // Add in d*
        n += dn
        m += dm
        h += dh
        V += dV

        // Save to history
        history['n'].push(n)
        history['m'].push(m)
        history['h'].push(h)
        history['V'].push(V)
        history['I'].push(Ival)
        history['gateI'].push(gateI)
    }
    return history;
}

function rickshawRender(total_time, res) {
    let dt = 0.01;
    let rendered = {};
    let currentHoverDetail;

    function newGraph(el, datas, yUnit) {
        let graph = new Rickshaw.Graph( {
            renderer: 'line',
            min: 'auto',
            element: el,
            series: new Rickshaw.Series.FixedDuration(
                datas,
                undefined,
                {timeInterval:1e3*dt, maxDataPoints:total_time/dt, timeBase: 0}),
        } );
        var hoverDetail = new Rickshaw.Graph.HoverDetail( {
            graph: graph,
            xFormatter: function(x) { return x.toFixed(3) + "ms" },
            yFormatter: function(y) { return y.toFixed(2) + yUnit },
            onShow() {
                if (currentHoverDetail) {
                    return;
                }
                currentHoverDetail = hoverDetail;
                for (let key in rendered) {
                    let value = rendered[key];
                    if (value.hoverDetail !== hoverDetail) {
                        value.hoverDetail.show();
                    }
                }
            },
            onHide() {
                if (currentHoverDetail !== hoverDetail) {
                    return;
                }
                for (let key in rendered) {
                    let value = rendered[key];
                    if (value.hoverDetail !== hoverDetail) {
                        value.hoverDetail.hide();
                    }
                }
                currentHoverDetail = null;
            },
            onRender() {
                if (currentHoverDetail !== hoverDetail) {
                    return;
                }
                for (let key in rendered) {
                    let value = rendered[key];
                    if (value.hoverDetail !== hoverDetail) {
                        value.hoverDetail.update(this.lastEvent);
                    }
                }
            },
        } );
        var yAxis = new Rickshaw.Graph.Axis.Y({
            //orientation: 'right',
            graph: graph,
        });
        var xAxis = new Rickshaw.Graph.Axis.X({
            graph: graph,
        });

        graph.render();
        yAxis.render();
        xAxis.render();

        return {graph,yAxis,xAxis,hoverDetail};
    }

    rendered.voltage = newGraph(document.querySelector('.voltage'), [{name: 'V', color: 'steelblue'}], 'mV');
    rendered.gates = newGraph(document.querySelector('.gates'), [{name: 'm'},{name:'n'},{name:'h'}], '');
    rendered.current = newGraph(document.querySelector('.current'), [{name: 'I'}], ' μA/cm<sup>2</sup>');
    return {
        voltage: rendered.voltage.graph,
        current: rendered.current.graph,
        gates: rendered.gates.graph,
        others:rendered,
    };
}

function rickshawUpdate(graph, res) {
    function makeData(key) {
        let skip = 10;
        let d = res[key];
        return res.t.filter((t, idx) => idx % skip == 0).map((t, idx) => ({x: t, y: d[idx*skip]}))
    }
    graph.voltage.setSeries([
        {name: 'V', color: 'steelblue', data: res.isVoltageClamp ? makeData('VoltageClamp') : makeData('V')},
    ]);
    graph.gates.setSeries([
        {name: 'm', color: 'red', data: makeData('m')},
        {name: 'n', color: 'blue', data: makeData('n')},
        {name: 'h', color: 'green', data: makeData('h')},
    ]);
    graph.current.setSeries([
        {name: 'gateI', color: 'blue', data: makeData('gateI')},
        (res.isAddCurrent ? {name: 'I', color: 'orange', data: makeData('I')} : null),
    ].filter(x => x));
    graph.voltage.render();
    graph.gates.render();
    graph.current.render();
}

function rickshawUpdateFixedSeries(graph, res) {
    //graph.voltage.setSeries([
    //    {name: 'V', color: 'steelblue', data: res['V'].map((v, idx) => ({x:res.t[idx],y:v}))}]);
    res['V'].forEach((v, idx) => {
        graph.voltage.series.addData({V: v});
        graph.gates.series.addData({
            m: res.m[idx],
            h: res.h[idx],
            n: res.n[idx],
        });
        graph.current.series.addData({
            gateI: res.gateI[idx],
            I: res.I[idx],
        });
    });
    graph.voltage.render();
    graph.gates.render();
    graph.current.render();
}

function rickshawRender222(total_time, res) {
    let dt = 0.01;
    let graph = new Rickshaw.Graph( {
        renderer: 'line',
        min: 'auto',
        element: document.querySelector('.plot'),
        series: new Rickshaw.Series.FixedDuration(
            [{name: 'V', color: 'steelblue'}],
            undefined,
            {timeInterval:1e3*dt, maxDataPoints:total_time/dt, timeBase: 0}),
/*
      series: [
        {
          color: 'steelblue',
          data: res['V'].map((v, idx) => ({x: res.t[idx], y: v})),
        //}, {
        //  color: 'lightblue',
        //  data: [ { x: 0, y: 30}, { x: 1, y: 20 }, { x: 2, y: 64 } ]
        }
      ]
        /*

      series: new Rickshaw.Series.FixedDuration(
        {name: 'V', color: 'blue'},
        null,
        {timeInterval:0.01, maxDataPoints:total_time/0.01, timeBase: 0}),
*/
    } );
    var hoverDetail = new Rickshaw.Graph.HoverDetail( {
        graph: graph,
        xFormatter: function(x) { return x.toFixed(3) + "ms" },
        yFormatter: function(y) { return y.toFixed(2) + "mV" },
    } );
    var yAxis = new Rickshaw.Graph.Axis.Y({
        graph: graph,
    });
    var xAxis = new Rickshaw.Graph.Axis.X({
        graph: graph,
    });

    graph.render();
    yAxis.render();
    xAxis.render();
    return graph;
}

function rickshawUpdate222(graph, res) {
    //graph.series.currentIndex = 0;
    res['V'].forEach(v => graph.series.addData({V: v}));
    //graph.series = {color:'blue',data: res['V'].map((v, idx) => ({x: res.t[idx], y: v}))};
    graph.render();
}

function c3Render(res) {
    let chart = c3.generate({
        bindto: '.plot',
        data: {
             x: 'x',
            //  xFormat: '%Y%m%d',
            columns: [
                //['x'].concat(res.t.map((t) => '2019-'+t.toString())),
                ['x'].concat(res.t),
                ['data1'].concat(res.V),
            ]
    }, axis: {
            x: {
                //type: 'timeseries',
                tick: {
                    format: '%s',
                }
    } }
    });
/*
setTimeout(function () {
    chart.load({
        columns: [
            ['data3', 400, 5
] });
                       }, 1000);
*/
}

function formSim(total_time) {
    let form = document.querySelector('.settings');
    let checked = form.querySelector('[name=type]:checked');
    let type = checked ? checked.value : 'add-current';

    // Simulation keywords
    let kw = {
        total_time: total_time,
    };

    let keys = ['gK', 'gNa', 'gL', 'VK', 'VNa', 'VL'];
    for (let key of keys) {
        kw[key] = form.querySelector('[name='+key+']').value;
    }

    // Parsing the command
    let input = form.querySelector('[name='+type+']');
    let text = input.value || input.placeholder;
    let sequence = text.split(',').map(Number);
    let sequenceFn = (t) => sequence[Math.floor(t/total_time*sequence.length)];
    if (type == 'voltage-clamp') {
        kw['VoltageClamp'] = sequenceFn;
    } else if (type == 'add-current') {
        kw['I'] = sequenceFn;
    }

    // Return simulation
    return HH(kw);
}

document.addEventListener('DOMContentLoaded', (event) => {
    let total_time = 100;

    // Initialize first thing.
    let res = formSim(total_time);
    let graph = rickshawRender(total_time, res);
    rickshawUpdate(graph, res);

    let form = document.querySelector('.settings');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        let res = formSim(total_time);
        rickshawUpdate(graph, res);
    });

    // When you click the text box, we want the radio to be selected too!
    for (let key of ['add-current', 'voltage-clamp']) {
        form.querySelector('[name='+key+']').addEventListener('focus', (e) => {
            form.querySelector('[name=type][value='+key+']').checked = true;
        });
    }
/*
    function renderSequence(form, simulate_fn) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            let input = form.querySelector('input');
            let text = input.value || input.placeholder;
            let sequence = text.split(',').map(Number);
            let res = simulate_fn(sequence);
            rickshawUpdate(graph, res);
        });
    }
    renderSequence(
        document.querySelector('.voltage-clamp'),
        sequence => HH({total_time:total_time, VoltageClamp: (t) => sequence[Math.floor(t/total_time*sequence.length)]}),
    );
    renderSequence(
        document.querySelector('.add-current'),
        sequence => HH({total_time:total_time, I: (t) => sequence[Math.floor(t/total_time*sequence.length)]}),
    );
*/
});


