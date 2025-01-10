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
var fireWallLogs = [];
var interfaceMap = {};

export default class Jono extends BaseTableWidget {
    constructor(config) {
        super(config);
        // Update time
        this.tickTimeout = 5;
        // Services Widget
        this.locked = false;
    }

    // Images
    ramIcon() { return "/ui/themes/jono/ram.png"; }
    diskIcon() { return "/ui/themes/jono/disk.png"; }
    cpuIcon() { return "/ui/themes/jono/cpu.png"; }


    // custom css for our widget
    getCSS() {
        return $(
            `<style>
                #jono-widget-master-container {
                    width: 100%;
                }

                .clear {
                    clear: both;
                }

                .thirdcol {
                    margin: 0px 4px;
                    width: calc((100% / 3) - 10px);
                    float: left;
                }

                .barChart {
                    width: 100%;
                    height: 20px;
                    display: flex;
                    flex-direction: row;
                    border-radius: 99px;
                    overflow: hidden;
                    color: #fff;
                    text-align: center;
                }

                .iconBar {
                    display: flex;
                    flex-direction: row;

                    img {
                        width: 32px;
                        height: 32px;
                    }

                    .barChart {
                        width: calc(100% - 32px);
                        margin: 5px 5px;
                    }
                }

                #jono-ram-disk-container {
                    text-align: left;
                    width: 100%;
                    min-height: 80px;
                    padding: 10px;
                }

                #jono-firewall-container {
                    text-align: left;
                    width: calc(60% - 20px);
                    padding: 10px;
                    float: left;
                    min-height: 200px;
                    max-width: 750px;
                }

                #gi-container {
                    text-align: left;
                    width: 40%;
                    float: left;
                    min-height: 300px;
                    display: flex;
                flex-direction: row;
                flex-wrap: wrap;
                }

                #jono-if-container, #jono-gateway-container {
                    text-align: left;
                    width: 50%;
                    padding: 10px;
                }

                #services-container-header {
                    text-align: left;
                }

                #jono-services-container {
                    text-align: left;
                    width: 100%;
                    min-height: 100px;
                    padding: 0px 10px;
                }

                #if-data-container {
                    width: 100%;
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                }

                #services-data {
                    width: 100%;
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                }

                #ramData,
                #diskData,
                #cpuData {
                    margin: 0;
                }

                .barUsed {
                    transition: all 0.5s ease-out;
                    background: rgb(62, 62, 62);
                }

                .low {
                    background: rgb(201, 4, 4) !important;
                }

                .barFree {
                    transition: all 0.5s ease-out;
                    background: rgb(227, 227, 227);
                    flex-grow: 1;
                }

                .if-group {
                    height: fit-content;
                    width: 50%;
                    padding: 5px;

                }

                .service-block {
                    display: flex;
                    flex-direction: column;
                    margin: 2px;
                    padding: 2px;
                    width: calc((100% / 7) - 8px);
                    border-radius: 5px;
                    border: solid 1px rgb(227, 227, 227);
                    align-items: center;
                    justify-content: center;
                }

                .service-name {
                    font-size: 12px;
                    width: 100%;
                    text-align: center;
                }

                .service-buttons-group {
                    width: 100%;
                    text-align: center;
                }

                .service-buttons-group .label-success {
                    background-color: rgb(62, 62, 62);
                }

                .if-name .text-success {
                    color: rgb(62, 62, 62);
                }

                #gateway-data {
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                }

                .gw-block {
                    margin: 5px;
                    padding: 2px;
                }

                .gw-block .text-success {
                    color: rgb(62, 62, 62);
                }

            </style>`
        );
    }

    // Utility Functions
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

    // Ram, Disk and CPU Widget
    createRamDiskWidget() {
        let $container = $(`<div id="jono-ram-disk-container" class="container-box"></div>`);

        let $ramCon = $(`<div class="thirdcol"></div>`);
        let $ramHeader = $(`<div class=""><p id="ramData"></p>`);
        let $ramBar = $(`<div class="iconBar"><img src="${this.ramIcon()}"/><div class="barChart"><div id="ramBarUsed" class="barUsed"></div><div class="barFree"></div></div></div>`);
        $ramCon.append($ramHeader);
        $ramCon.append($ramBar);

        let $diskCon = $(`<div class="thirdcol"></div>`);
        let $diskHeader = $(`<p id="diskData"></p>`);
        let $diskBar = $(`<div class="iconBar"><img src="${this.diskIcon()}"/><div class="barChart"><div id="diskBarUsed" class="barUsed"></div><div class="barFree"></div></div></div></div>`);
        $diskCon.append($diskHeader);
        $diskCon.append($diskBar);

        let $cpuCon = $(`<div class="thirdcol"></div>`);
        let $cpuHeader = $(`<p id="cpuData"></p>`);
        let $cpuBar = $(`<div class="iconBar"><img src="${this.cpuIcon()}"/><div class="barChart"><div id="cpuBarUsed" class="barUsed"></div><div class="barFree"></div></div></div>`);
        $cpuCon.append($cpuHeader);
        $cpuCon.append($cpuBar);

        $container.append($cpuCon);
        $container.append($ramCon);
        $container.append($diskCon);

        // Append a "clear" div to Master Container
        $container.append($('<div class="clear"></div>'));

        return $container;
    }
    async updateRamDiskWidget() {
        const ramApiData = await this.ajaxCall('/api/diagnostics/system/systemResources');
        const diskApiData = await this.ajaxCall('/api/diagnostics/system/systemDisk');
        const cpuTypeApiData = await this.ajaxCall(`/api/diagnostics/cpu_usage/${'getcputype'}`);

        // Ram Update / controller
        if (ramApiData.memory.total !== undefined) {
            let used = parseInt(ramApiData.memory.used_frmt);
            let arc = ramApiData.memory.hasOwnProperty('arc') ? parseInt(ramApiData.memory.arc_frmt) : 0;
            let total = parseInt(ramApiData.memory.total_frmt);
            let percentage = ((used - arc) / total) * 100;

            let ramBar = document.getElementById('ramBarUsed');
            ramBar.style.width = percentage + '%';
            // if percentage is higher than 85%, set to low
            if (percentage > 85) {
                ramBar.setAttribute("class", "barUsed low");
            } else {
                ramBar.setAttribute("class", "barUsed");
            }
            ramBar.innerHTML = percentage.toFixed(0) + '%';
            let ramData = document.getElementById('ramData');
            ramData.innerHTML = '<b>RAM:</b> Total ' + total + 'MB Used ' + (used - arc) + 'MB Free ' + (total - (used - arc) + 'MB');
        }

        // Disk Update / controller
        if (diskApiData.devices !== undefined) {

            let diskBar = document.getElementById('diskBarUsed');
            let diskData = document.getElementById('diskData');

            for (const device of diskApiData.devices) {
                // Im only interested in the "/" main disk
                if (device.mountpoint === '/') {

                    let used = this._convertToBytes(device.used);
                    let total = this._convertToBytes(device.blocks);

                    let percentage = (used / total) * 100;
                    diskBar.style.width = percentage + '%';
                    // if percentage is higher than 80%, set to low
                    if (percentage > 80) {
                        diskBar.setAttribute("class", "barUsed low");
                    } else {
                        diskBar.setAttribute("class", "barUsed");
                    }
                    diskBar.innerHTML = percentage.toFixed(0) + '%';
                    diskData.innerHTML = '<b>Disk:</b> (' + device.type + ') ' + device.mountpoint + '-' + ' Total ' + device.blocks + ' Used ' + device.used + ' Free ' + device.available;
                }
            }
        }

        // CPU Update / controller
        if (cpuTypeApiData != "") {
            let cpuData = document.getElementById('cpuData');
            cpuData.innerHTML = '<b>CPU:</b> ' + cpuTypeApiData;
        }
        super.openEventSource(`/api/diagnostics/cpu_usage/${'stream'}`, (event) => {
            if (!event) {
                super.closeEventSource();
            }

            let cpuBar = document.getElementById('cpuBarUsed');

            const data = JSON.parse(event.data);
            let total = data["total"];
            cpuBar.style.width = total + '%';
            if (total > 80) {
                cpuBar.setAttribute("class", "barUsed low");
            } else {
                cpuBar.setAttribute("class", "barUsed");
            }
            cpuBar.innerHTML = total.toFixed(0) + '%';

        });
    }

    // Firewall Widget
    createFireWallWidget() {
        let $container = $(`<div id="jono-firewall-container" class="container-box"></div>`);
        let $title = $(`<a class="" href="/ui/diagnostics/firewall/log"><b>${this.translations.firewall}</b></a>`);
        let $tableHeader = $(`<table>
            <tr>
                <td style="width:50px;">${this.translations.action}</td>
                <td style="width:90px;">${this.translations.time}</td>
                <td style="width:60px;">${this.translations.interface}</td>
                <td style="width:100px;">${this.translations.source}</td>
                <td style="width:100px;">${this.translations.destination}</td>
                <td style="width:50px;">${this.translations.port}</td>
            </tr>
        </table>
        <div id="fireWallRows"></div>`)

        $container.append($title);
        $container.append($tableHeader);

        // Append a "clear" div to Master Container
        $container.append($('<div class="clear"></div>'));

        return $container;

    }
    async setupFireWallWidget() {
        const data = await this.ajaxCall('/api/diagnostics/interface/getInterfaceNames');
        interfaceMap = data;
    }
    async updateFireWallWidget() {
        super.openEventSource('/api/diagnostics/firewall/streamLog', (event) => {
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

            let fireWallRows = document.getElementById('fireWallRows');
            let rid = data["rid"];
            let action = data["action"];
            let interfaceN = data["interface"];
            let src = data["src"];
            let dst = data["dst"];
            let dstport = data["dstport"] ?? '';
            let label = data["label"];
            let time = Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: 'numeric', second: 'numeric' }).format(new Date(data["__timestamp__"]));
            var log = { "rid": rid, "action": action, "interface": interfaceN, "src": src, "dst": dst, "dstport": dstport, "time": time };

            // if more than 8, remove last
            if (fireWallLogs.length > 8) {
                fireWallLogs.pop()
            }
            fireWallLogs.unshift(log);

            var firewallRowsString = "";
            for (const log of fireWallLogs) {
                firewallRowsString += '<tr><td style="width:50px;">' + actIcons[data.action] + '</td><td style="width:90px;">' + log.time + '</td><td style="width:60px;">' + interfaceMap[log.interface] + '</td><td style="width:100px;">' + log.src + '</td><td style="width:100px;">' + log.dst + '</td><td style="width:50px;">' + log.dstport + '</td></tr>';
            }

            fireWallRows.innerHTML = `<table>${firewallRowsString}</table>`;
        });
    }

    // Interfaces widget
    createInterfacesWidget() {

        let $container = $(`<div id="jono-if-container" class="container-box"></div>`)
        let $header = $(`<div id="if-table-container"><b>${this.translations.interfaces}</b></div>`);
        let $data = $(`<div id="if-data-container"></div>`);

        $container.append($header);
        $container.append($data);
        return $container;
    }
    async updateInterfaceWidget() {
        const data = await this.ajaxCall('/api/interfaces/overview/interfacesInfo');
        if (!this.dataChanged('interfaces', data)) {
            return;
        }

        let rows = "";
        data.rows.map((intf_data) => {
            if (!intf_data.hasOwnProperty('config') || intf_data.enabled == false) {
                return;
            }

            if (intf_data.config.hasOwnProperty('virtual') && intf_data.config.virtual == '1') {
                return;
            }

            let row = "";

            row += ($(`
                <div class="interface-info if-name">
                    <i class="fa fa-plug text-${intf_data.status === 'up' ? 'success' : 'danger'} if-status-icon" title="" data-toggle="tooltip" data-original-title="${intf_data.status}"></i>
                    <b class="interface-descr" onclick="location.href='/interfaces.php?if=${intf_data.identifier}'">
                        ${intf_data.description}
                    </b>
                </div>
            `).prop('outerHTML'));

            let media = (!'media' in intf_data ? intf_data.cell_mode : intf_data.media) ?? '';
            row += ($(`
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

            row += ($(`
                <div class="interface-info">
                    ${ipv4}
                    <div style="flex-basis: 100%; height: 0;"></div>
                    <div style="color:#333;">
                        ${ipv6}
                    </div>
                </div>
            `).prop('outerHTML'));

            rows += '<div class="if-group">' + row + '</div>';
        });

        $("#if-data-container").append(rows)

    }

    // Services Widget
    createServicesWidget() {
        let $container = $(`<div id="jono-services-container" class="container-box"></div>`)
        let $header = $(`<div id="services-container-header"><b>${this.translations.services}</b></div>`);
        let $data = $(`<div id="services-data"></div>`);

        $container.append($header);
        $container.append($data);
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

        // Remove old data
        $("#services-data").html("");

        for (const service of data.rows) {
            let name = service.name;
            let $description = $(`<div class="service-name">${service.description}</div>`);

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
                <div class="service-buttons-group">
                ${service.running ? "" :
                    `<span class="label label-opnsense label-opnsense-xs
                             label-danger
                             service-status"
                             data-toggle="tooltip" title="${this.translations.stopped}"
                             style="font-size: 10px;">
                    <i class="fa fa-stop fa-fw"></i>
                </span>`
                }
                </div>
            `);

            $buttonContainer.append(this.serviceControl(actions));

            let $serviceBlock = $(`<div class="service-block">${$description.prop('outerHTML')}${$buttonContainer.prop('outerHTML')}</div>`);
            $("#services-data").append($serviceBlock);
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

    // Gateways Widgets
    createGatewayWidget() {
        let $container = $(`<div id="jono-gateway-container" class="container-box"></div>`)
        let $header = $(`<div id="gateway-container-header"><b>${this.translations.gateway}</b></div>`);
        let $data = $(`<div id="gateway-data"></div>`);

        $container.append($header);
        $container.append($data);
        return $container;
    }
    async updateGatewaysWidget() {
        $('.gateways-status-icon').tooltip('hide');

        const gateways = await this.ajaxCall('/api/routes/gateway/status');
        if (!gateways.items || !gateways.items.length) {
            return false;
        }

        $("#gateway-data").html("");

        let data = [];
        gateways.items.forEach(({ name, address, status, loss, delay, stddev, status_translated }) => {

            let color = "text-success";
            switch (status) {
                case "force_down":
                case "down":
                    color = "text-danger";
                    break;
                case "loss":
                case "delay":
                case "delay+loss":
                    color = "text-warning";
                    break;
            }

            let gw = `<div class="gw-block">
                <i class="fa fa-circle text-muted ${color} gateways-status-icon" style="font-size: 11px; cursor: pointer;"
                    data-toggle="tooltip" title="${status_translated}">
                </i>
                &nbsp;
                <a href="/ui/routing/configuration">${name}</a>
                &nbsp;
                <br/>
                <div style="margin-top: 5px; margin-bottom: 5px; font-size: 15px;">${address}</div>
                ${delay === '~' ? '' : `<div><b>${this.translations.rtt}</b>: ${delay}</div>`}
                ${delay === '~' ? '' : `<div><b>${this.translations.rttd}</b>: ${stddev}</div>`}
                ${delay === '~' ? '' : `<div><b>${this.translations.loss}</b>: ${loss}</div>`}
            </div>`

            data.push([gw]);
        });

        $("#gateway-data").append(data);

        $('.gateways-status-icon').tooltip({ container: 'body' });
    }

    // Initiates and builds main Widget UIs
    getMarkup() {
        // Container to hold all the widgets
        let $container = $('<div id="jono-widget-master-container"></div>');

        // Append Ram Disk CPU widget to Master Container
        let $ramDiskContainer = this.createRamDiskWidget();
        $container.append($ramDiskContainer);

        // Append Services widget to Master Container
        let $servicesContainer = this.createServicesWidget();
        $container.append($servicesContainer);

        // Append Firewall widget to Master Container
        let $fireWallContainer = this.createFireWallWidget();
        $container.append($fireWallContainer);

        // Container to hold Gateway and interface Widgets
        let $giContainer = $('<div id="gi-container"></div>');
        $container.append($giContainer);

        // Append Gateway widget to Gateway and interface Container
        let $gatewayContainer = this.createGatewayWidget();
        $giContainer.append($gatewayContainer);

        // Append Interfaces widget to Gateway and interface Container
        let $interfacesContainer = this.createInterfacesWidget();
        $giContainer.append($interfacesContainer);

        // Append a "clear" div to Master Container
        $container.append($('<div class="clear"></div>'));

        // Add CSS to Widget
        let $css = this.getCSS();
        $container.append($css);

        return $container;
    }

    // Updates widgets every "Tick"
    async onWidgetTick() {
        this.updateRamDiskWidget();
        this.updateFireWallWidget();
        this.updateInterfaceWidget();
        this.updateGatewaysWidget();
        // Update Services Widget
        if (!this.locked) {
            await this.updateServiceWidget();
        }
    }

    // Called after Markup is created
    async onMarkupRendered() {
        // Sett up Firewall Widget
        this.setupFireWallWidget();
    }

    // Destructor
    onWidgetClose() {

        super.onWidgetClose();
    }

}
