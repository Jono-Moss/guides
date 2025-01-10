/*
 * Copyright (C) 2024 Deciso B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
 * OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

export default class Jono extends BaseTableWidget {
    constructor(config) {
        super(config);
        // Interface Widget
        this.ifMap = {};
        this.counters = {};
        this.chart = null;
        this.rotation = 5;
        this.resizeHandles = "all";
        // Services Widget
        this.locked = false;
        // CPU Widget
        this.cpuGraphs = ['total', 'intr', 'user', 'sys'];
        this.configurable = true;
        // Disk Widget
        this.tickTimeout = 300;
    }


    // custom css for our widget
    getCSS() {
        return $(
            `<style>
#jono-widget-master-container {
    width: 100%;
}

.container-box {
    border: 1px solid #dadada;
    border-radius: 5px;
    width: calc(50% - 10px);
    margin: 4px;
    height: fit-content;
}

#right-container {
    height: fit-content;
    float: left;
    width: calc(25% - 10px);
}

#jono-if-container,
#jono-cpu-container,
#jono-disk-container {
    width: 100%;
}

#jono-services-container {
    width: calc(25% - 10px);
    float: left;
}

#jono-firewall-container {
    width: calc(50% - 10px);
    float: left;
}

#jono-if-container .flex-cell {
    width: 100% !important;
}

.fw-chart-container canvas{
    max-height: 150px !important;
}

#jono-fw-top-table {
    min-height: 250px;
}

#header_jono-fw-top-table .grid-item.grid-header {
    max-width: calc(100% / 6) !important;
}

#header_jono-fw-top-table {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    text-align: left;
}

#jono-fw-top-table .grid-row {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    text-align: left;

    .grid-item:nth-of-type(1) {
        max-width: 20px;
    }

    .grid-item {
        overflow: hidden;
        max-width: calc(100% / 6);
        text-wrap: wrap;
        word-break: break-all;
    }
}

#header_jono-fw-rule-table {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
}

#jono-fw-rule-table .grid-row {

    .grid-item:first-of-type {
        text-align: left;
        padding-left: 10px;
    }

    .grid-item {
        overflow: hidden;
        text-wrap: wrap;
        word-break: break-all;
    }
}

#jono-if-table {
    margin: 0;
}

#jono-cpu-canvas-container {
    flex-direction: column;
}

#clear {
    clear: both;
}

@media only screen and (max-width: 750px) {

    #jono-firewall-container,
    #jono-if-container,
    #jono-services-container,
    #right-container  {
        width: calc(100% - 10px);
    }

    #jono-if-container,
    #jono-cpu-container,
    #jono-disk-container {
        width: calc(33% - 10px);
        float: left;
    }
}
            </style>`
        );
    }

    // Firewall widget
    createFireWallWidget() {
        // Firewall Widget
        // Main Firewall Widget Container
        let $fireWallContainer = $(`<div id="jono-firewall-container" class="container-box"></div>`);
        // Firewall Live logs table
        let $tableContainer = $(`<div id="fw-table-container"><b>${this.translations.livelog}</b></div>`);
        $fireWallContainer.append($fireWallContainer);
        let $top_table = this.createTable('jono-fw-top-table', {
            headerPosition: 'top',
            rotation: this.rotation,
            headers: [
                this.translations.action,
                this.translations.time,
                this.translations.interface,
                this.translations.source,
                this.translations.destination,
                this.translations.port
            ],
        });

        let $rule_table = this.createTable('jono-fw-rule-table', {
            headerPosition: 'top',
            rotation: this.rotation,
            headers: [
                this.translations.label,
                this.translations.count
            ],
            sortIndex: 1,
            sortOrder: 'desc'
        });

        $tableContainer.append($top_table);
        $tableContainer.append(`<div style="margin-top: 2em"><b>${this.translations.events}</b><div>`);
        $tableContainer.append($rule_table);
        // Append Live Logs to firewall container
        $fireWallContainer.append($tableContainer);

        // Append firewall chart to firewall container
        $fireWallContainer.append($(`
            <div class="fw-chart-container">
                <div class="canvas-container">
                    <canvas id="fw-chart"></canvas>
                </div>
            </div>
        `));

        return $fireWallContainer;
    }
    async updateFireWallWidget() {
        const data = await this.ajaxCall('/api/diagnostics/interface/getInterfaceNames');
        this.ifMap = data;

        super.openEventSource('/api/diagnostics/firewall/streamLog', this._onMessage.bind(this));

        let context = document.getElementById('fw-chart').getContext('2d');
        let config = {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [
                    {
                        data: [],
                        rids: [],
                    }
                ]
            },
            options: {
                cutout: '40%',
                maintainAspectRatio: true,
                responsive: true,
                aspectRatio: 2,
                layout: {
                    padding: 10
                },
                normalized: true,
                parsing: false,
                onClick: (event, elements, chart) => {
                    const i = elements[0].index;
                    const rid = chart.data.datasets[0].rids[i];
                    window.open(`/ui/diagnostics/firewall/log?rid=${rid}`);
                },
                onHover: (event, elements) => {
                    event.native.target.style.cursor = elements[0] ? 'pointer' : 'grab';
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'left',
                        onHover: (event, legendItem) => {
                            const activeElement = {
                                datasetIndex: 0,
                                index: legendItem.index
                            };
                            this.chart.setActiveElements([activeElement]);
                            this.chart.tooltip.setActiveElements([activeElement]);
                        },
                        labels: {
                            filter: (ds, data) => {
                                /* clamp amount of legend labels to a max of 10 (sorted) */
                                const sortable = [];
                                data.labels.forEach((l, i) => {
                                    sortable.push([l, data.datasets[0].data[i]]);
                                });
                                sortable.sort((a, b) => (b[1] - a[1]));
                                const sorted = sortable.slice(0, 10).map(e => (e[0]));

                                return sorted.includes(ds.text)
                            },
                        }
                    },
                    tooltip: {
                        callbacks: {
                            labels: (tooltipItem) => {
                                let obj = this.counters[tooltipItem.label];
                                return `${obj.label} (${obj.count})`;
                            }
                        }
                    },
                }
            },
            plugins: [
                {
                    // display a placeholder if no data is available
                    id: 'nodata_placeholder',
                    afterDraw: (chart, args, options) => {
                        if (chart.data.datasets[0].data.length === 0) {
                            let ctx = chart.ctx;
                            let width = chart.width;
                            let height = chart.height;

                            chart.clear();
                            ctx.save();
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(this.translations.nodata + '...', width / 2, height / 2);
                            ctx.restore();
                        }
                    }
                }
            ]
        }

        this.chart = new Chart(context, config);
    }

    // Interfaces widget
    createInterfacesWidget() {

        let $container = $(`<div id="jono-if-container" class="container-box"></div>`)
        let $tableheader = $(`<div id="fw-table-container"><b>${this.translations.interfaces}</b></div>`);
        let $if_table = this.createTable('jono-if-table', {
            headerPosition: 'none'
        });

        $container.append($tableheader);
        $container.append($if_table);
        return $container;
    }
    async updateInterfaceWidget() {
        const data = await this.ajaxCall('/api/interfaces/overview/interfacesInfo');
        if (!this.dataChanged('interfaces', data)) {
            return;
        }

        $('.if-status-icon').tooltip('hide');

        let rows = [];
        data.rows.map((intf_data) => {
            if (!intf_data.hasOwnProperty('config') || intf_data.enabled == false) {
                return;
            }

            if (intf_data.config.hasOwnProperty('virtual') && intf_data.config.virtual == '1') {
                return;
            }

            let row = [];

            let searchdomain = ('ifctl.searchdomain' in intf_data ? ('(' + intf_data["ifctl.searchdomain"][0] + ')') : '') ?? '';

            row.push($(`
                <div class="interface-info if-name">
                    <i class="fa fa-plug text-${intf_data.status === 'up' ? 'success' : 'danger'} if-status-icon" title="" data-toggle="tooltip" data-original-title="${intf_data.status}"></i>
                    <b class="interface-descr" onclick="location.href='/interfaces.php?if=${intf_data.identifier}'">
                        ${intf_data.description}
                    </b>
                    <p class="interface-descr">
                       ${searchdomain}
                    </p>
                </div>
            `).prop('outerHTML'));

            let media = (!'media' in intf_data ? intf_data.cell_mode : intf_data.media) ?? '';
            row.push($(`
                <div class="interface-info-detail">
                    <div>${media}</div>
                </div>
            `).prop('outerHTML'));

            let ipv4 = '';
            let ipv6 = '';
            if ('ipv4' in intf_data && intf_data.ipv4.length > 0) {
                ipv4 = intf_data.ipv4[0].ipaddr;
            }

            if ('ipv6' in intf_data && intf_data.ipv6.length > 0) {
                ipv6 = intf_data.ipv6[0].ipaddr;
            }

            row.push($(`
                <div class="interface-info">
                    ${ipv4}
                    <div style="flex-basis: 100%; height: 0;"></div>
                    <div style="color:#333;">
                        ${ipv6}
                    </div>
                </div>
            `).prop('outerHTML'));

            rows.push(row);
        });

        super.updateTable('jono-if-table', rows);

        $('.if-status-icon').tooltip({ container: 'body' });
    }

    // Services Widget
    createServicesWidget() {
        let $container = $(`<div id="jono-services-container" class="container-box"></div>`)
        let $tableheader = $(`<div id="services-table-container"><b>${this.translations.services}</b></div>`);
        let $table = this.createTable('jono-services-table', {
            headerPosition: 'left',
            headerBreakpoint: 270
        });
        $container.append($tableheader);
        $container.append($table);
        return $container;
    }
    async updateServiceWidget() {
        const data = await this.ajaxCall(`/api/core/service/${'search'}`);

        if (!data || !data.rows || data.rows.length === 0) {
            this.displayError(this.translations.noservices);
            return;
        }

        $('.service-status').tooltip('hide');
        $('.srv_status_act2').tooltip('hide');

        for (const service of data.rows) {
            let name = service.name;
            let $description = $(`<div style="font-size: 12px;">${service.description}</div>`);

            let actions = [];
            if (service.locked) {
                actions.push({ action: 'restart', id: service.id, title: this.translations.restart, icon: 'refresh' });
            } else if (service.running) {
                actions.push({ action: 'restart', id: service.id, title: this.translations.restart, icon: 'refresh' });
                actions.push({ action: 'stop', id: service.id, title: this.translations.stop, icon: 'stop' });
            } else {
                actions.push({ action: 'start', id: service.id, title: this.translations.start, icon: 'play' });
            }

            let $buttonContainer = $(`
                <div style="margin-left: 45%">
                <span class="label label-opnsense label-opnsense-xs
                             label-${service.running ? 'success' : 'danger'}
                             service-status"
                             data-toggle="tooltip" title="${service.running ? this.translations.running : this.translations.stopped}"
                             style="font-size: 10px;">
                    <i class="fa fa-${service.running ? 'play' : 'stop'} fa-fw"></i>
                </span>
                </div>
            `);

            $buttonContainer.append(this.serviceControl(actions));

            super.updateTable('jono-services-table', [[$description.prop('outerHTML'), $buttonContainer.prop('outerHTML')]], service.id);
        }

        $('.service-status').tooltip({ container: 'body' });
        $('.srv_status_act2').tooltip({ container: 'body' });

        $('.srv_status_act2').on('click', async (event) => {
            this.locked = true;
            event.preventDefault();
            event.currentTarget.blur();
            let $elem = $(event.currentTarget);
            let $icon = $elem.children(0);
            this.startCommandTransition($elem.data('service'), $icon);
            const result = await this.ajaxCall(`/api/core/service/${$elem.data('service_action')}/${$elem.data('service')}`, {}, 'POST');
            await this.endCommandTransition($elem.data('service'), $icon, true, false);
            await this.updateServiceWidget();
            this.locked = false;
        });

        return;
    }
    serviceControl(actions) {
        return actions.map(({ action, id, title, icon }) => `
            <button data-service_action="${action}" data-service="${id}"
                  class="btn btn-xs btn-default srv_status_act2" style="font-size: 10px;" title="${title}" data-toggle="tooltip">
                <i class="fa fa-fw fa-${icon}"></i>
            </button>
        `).join('');
    }

    // CPU Widget
    createCpuWidget() {
        let $container = $(`
            <div id="jono-cpu-container" class="container-box">
                <div class="cpu-type"></div>
                <div id="jono-cpu-canvas-container">
                    <div id="cpu-total" class="smoothie-container">
                        <b>${this.translations.total}</b>
                        <div><canvas id="cpu-usage-total" style="width: 100%; height: 50px;"></canvas></div>
                    </div>
                    <div id="cpu-intr" class="smoothie-container">
                        <b>${this.translations.intr}</b>
                        <div><canvas id="cpu-usage-intr" style="width: 100%; height: 50px;"></canvas></div>
                    </div>
                    <div id="cpu-user" class="smoothie-container">
                        <b>${this.translations.user}</b>
                        <div><canvas id="cpu-usage-user" style="width: 100%; height: 50px;"></canvas></div>
                    </div>
                    <div id="cpu-sys" class="smoothie-container">
                        <b>${this.translations.sys}</b>
                        <div><canvas id="cpu-usage-sys" style="width: 100%; height: 50px;"></canvas></div>
                    </div>
                </div>
            </div>`);

        return $container;
    }
    async updateCpuWidget() {
        const data = await this.ajaxCall(`/api/diagnostics/cpu_usage/${'getcputype'}`);
        $('.cpu-type').text(data);

        const config = await this.getCpuWidgetOptions();

        let ts = {};
        this.cpuGraphs.forEach((graph) => {
            let timeSeries = new TimeSeries();
            this._createCpuChart(`cpu-usage-${graph}`, timeSeries);
            ts[graph] = timeSeries;
        });

        super.openEventSource(`/api/diagnostics/cpu_usage/${'stream'}`, (event) => {
            if (!event) {
                super.closeEventSource();
            }
            const data = JSON.parse(event.data);
            let date = Date.now();
            this.cpuGraphs.forEach((graph) => {
                ts[graph].append(date, data[graph]);
            });
        });
    }
    _createCpuChart(selector, timeSeries) {
        let smoothie = new SmoothieChart({
            responsive: true,
            millisPerPixel:50,
            tooltip: true,
            labels: {
                fillStyle: Chart.defaults.color,
                precision: 0,
                fontSize: 11
            },
            grid: {
                strokeStyle:'rgba(119,119,119,0.12)',
                verticalSections:4,
                millisPerLine:1000,
                fillStyle: 'transparent'
            }
        });

        smoothie.streamTo(document.getElementById(selector), 1000);
        smoothie.addTimeSeries(timeSeries, {
            lineWidth: 3,
            strokeStyle: '#d94f00'
        });
    }
    async getCpuWidgetOptions() {
        return {
            cpuGraphs: {
                title: this.translations.graphs,
                type: 'select_multiple',
                options: ['total', 'intr', 'user', 'sys'].map((value) => {
                    return {
                        value: value,
                        label: this.translations[value]
                    }
                }),
                default: ['total']
            }
        }
    }
    async onCpuWidgetOptionsChanged(options) {
        this.cpuGraphs.filter(x => !options.cpuGraphs.includes(x)).forEach(graph => $(`#cpu-${graph}`).hide());
        const config = await this.getCpuWidgetOptions();
        this.cpuGraphs = config.cpuGraphs
        this.cpuGraphs.forEach(graph => $(`#cpu-${graph}`).show());
    }

    // Disk Widget
    _convertToBytes(sizeString) {
        // intentionally multiply by 1000 to retain original data format
        const units = {
            'B': 1,
            'K': 1000,
            'M': 1000 * 1000,
            'G': 1000 * 1000 * 1000,
            'T': 1000 * 1000 * 1000 * 1000
        };

        const match = sizeString.match(/^(\d+(?:\.\d+)?)([BKMGT])$/i);

        if (!match) {
            throw new Error("Invalid size format");
        }

        const size = parseFloat(match[1]);
        const unit = match[2].toUpperCase();

        if (!units[unit]) {
            throw new Error("Invalid unit");
        }

        return size * units[unit];
    }
    createDiskWidget(){
        let $container = $('<div id="jono-disk-container" class="container-box"></div>');
        let $tableheader = $(`<div id="services-table-container"><b>${this.translations.disk}</b></div>`);
        $container.append($tableheader);
        let $graphcontainer = $('<div class="canvas-container"><canvas id="jono-detailed-chart"></canvas></div>');
        $container.append($graphcontainer);
        return $container;
    }
    createDiskChart(){
        let context_detailed = document.getElementById(`jono-detailed-chart`).getContext("2d");
        let config = {
            type: 'bar',
            data: {
                labels: [],
                types: [],
                datasets: [
                    {
                        // used
                        data: [],
                        backgroundColor: ['#D94F00'],
                        hoverBackgroundColor: [this._setAlpha('#D94F00', 0.5)],
                        hoveroffset: 50,
                        fill: false,
                        descr: this.translations.used
                    },
                    {
                        // free
                        data: [],
                        backgroundColor: ['#E5E5E5'],
                        hoverBackgroundColor: [this._setAlpha('#E5E5E5', 0.5)],
                        hoveroffset: 50,
                        fill: false,
                        descr: this.translations.free
                    },
              ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                layout: {
                    padding: 10
                },
                scales: {
                    x: {
                        stacked: true,
                        display: false,
                    },
                    y: {
                        stacked: true,
                    }
                },
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            title: (tooltipItem) => {
                                let type = this.detailed_chart.config.data.types[tooltipItem[0].dataIndex];
                                return `${tooltipItem[0].label} [${type}]`;
                            },
                            label: (tooltipItem) => {
                                return `${tooltipItem.dataset.descr}: ${this._formatBytes(tooltipItem.raw)}`;
                            }
                        }
                    }
                }
            },
        }

        this.detailed_chart = new Chart(context_detailed, config);
    }
    async updateDiskWidget(){
        const data = await this.ajaxCall('/api/diagnostics/system/systemDisk');
        if (data.devices !== undefined) {
            let set = this.detailed_chart.config.data;
            let init = set.labels.length === 0;
            this.detailed_chart.config.data.datasets[0].data = [];
            this.detailed_chart.config.data.datasets[1].data = [];
            let totals = [];
            for (const device of data.devices) {
                let used = this._convertToBytes(device.used);
                let total = this._convertToBytes(device.blocks);
                let free = total - used;
                if (device.mountpoint === '/') {
                    this.chart.config.data.datasets[0].pct = [device.used_pct, (100 - device.used_pct)];
                    this.updateChart([used, free]);
                }
                totals.push(total);

                if (init) {
                    this.detailed_chart.config.data.types.push(device.type);
                    this.detailed_chart.config.data.labels.push(device.mountpoint);
                }
                this.detailed_chart.config.data.datasets[0].data.push(used);
                this.detailed_chart.config.data.datasets[1].data.push(free);
            }

            this.detailed_chart.config.options.scales.x.max = Math.max(...totals);
            this.detailed_chart.update();
        }
    }
    updateChart(data) {
        if (this.chart) {
            this.chart.data.datasets[0].data = data;
            this.chart.update();
        }
    }

    // Initiates and builds main Widget UIs
    getMarkup() {
        // Container to hold all the widgets
        let $container = $('<div id="jono-widget-master-container"></div>');

        // Append Firewall widget to Master Container
        let $fireWallContainer = this.createFireWallWidget();
        $container.append($fireWallContainer);

        // Append Services widget to Master Container
        let $servicesContainer = this.createServicesWidget();
        $container.append($servicesContainer);

        // A Container to house Interface, CPU and Disk Widget
        let $rightContainer = $('<div id="right-container"></div>');

        // Append Interface widget to Right Container
        let $interfaceContainer = this.createInterfacesWidget();
        $rightContainer.append($interfaceContainer);

        // Append CPU widget to Right Container
        let $cpuContainer = this.createCpuWidget();
        $rightContainer.append($cpuContainer);

        // Append Disk widget to Right Container
        let $diskContainer = this.createDiskWidget();
        $rightContainer.append($diskContainer);

        // Append Right Container to Master Container
        $container.append($rightContainer);

        // Append a "clear" div to Master Container
        $container.append($('<div id="clear"></div>'));

        // Add CSS to Widget
        let $css = this.getCSS();
        $container.append($css);

        return $container;
    }

    _onMessage(event) {
        if (!event) {
            super.closeEventSource();
        }

        let actIcons = {
            'pass': '<i class="fa fa-play text-success"></i>',
            'block': '<i class="fa fa-minus-circle text-danger"></i>',
            'rdr': '<i class="fa fa-exchange text-info"></i>',
            'nat': '<i class="fa fa-exchange text-info"></i>',
        }

        const data = JSON.parse(event.data);

        // increase counters
        if (!this.counters[data.rid]) {
            this.counters[data.rid] = {
                count: 1,
                label: data.label ?? ''
            }
        } else {
            this.counters[data.rid].count++;
        }

        let popContent = $(`
            <p>
                @${data.rulenr}
                ${data.label.length > 0 ? 'Label: ' + data.label : ''}
                <br>
                <sub>${this.translations.click}</sub>
            </p>
        `).prop('outerHTML');
        let popover = $(`
            <a target="_blank" href="/ui/diagnostics/firewall/log?rid=${data.rid}" type="button"
                data-toggle="popover" data-trigger="hover" data-html="true" data-title="${this.translations.matchedrule}"
                data-content="${popContent}">
                ${actIcons[data.action]}
            </a>
        `);

        super.updateTable('jono-fw-top-table', [
            [
                popover.prop('outerHTML'),
                /* Format time based on client browser locale */
                (new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric' })).format(new Date(data.__timestamp__)),
                this.ifMap[data.interface] ?? data.interface,
                data.src,
                data.dst,
                data.dstport ?? ''
            ]
        ]);

        super.updateTable('jono-fw-rule-table', [
            [
                popover.html($(`<div">${this.counters[data.rid].label}</div>`)).prop('outerHTML'),
                this.counters[data.rid].count
            ]
        ], data.rid);

        $('[data-toggle="popover"]').popover('hide');
        $('[data-toggle="popover"]').popover({
            container: 'body'
        }).on('show.bs.popover', function () {
            $(this).data("bs.popover").tip().css("max-width", "100%")
        });

        this._updateChart(data.rid, this.counters[data.rid].label, this.counters[data.rid].count);

        if (Object.keys(this.counters).length < this.rotation) {
            this.config.callbacks.updateGrid();
        }
    }

    _updateChart(rid, label, count) {
        let labels = this.chart.data.labels;
        let data = this.chart.data.datasets[0].data;
        let rids = this.chart.data.datasets[0].rids;

        let idx = rids.findIndex(x => x === rid);
        if (idx === -1) {
            labels.push(label);
            data.push(count);
            rids.push(rid);
        } else {
            data[idx] = count;
        }

        this.chart.update();
    }

    async onWidgetTick() {
        // update Interface Widget
        this.updateInterfaceWidget();

        // Update Services Widget
        if (!this.locked) {
            await this.updateServiceWidget();
        }

        // Update Disk Widget
        this.updateDiskWidget();
    }

    async onMarkupRendered() {
        // Create / start FireWall Widget
        this.updateFireWallWidget();

        // Create / Start CPU Widget
        this.updateCpuWidget();

        // Create / Start Disk Widget
        this.createDiskChart();
    }

    onWidgetClose() {

        if (this.chart !== null) {
            this.chart.destroy();
        }

        if (this.detailed_chart !== null) {
            this.detailed_chart.destroy();
        }

        super.onWidgetClose();
    }
}
