(function () {
  'use strict';

  var DATA_URL = '../../../assets/data/omnichannel-dashboard.json';
  var colors = ['#557f70', '#9ab31d', '#d18b32', '#6d78ae', '#a85f5f', '#388c9a', '#7b6654', '#8b6da0'];
  var state = { data: null, year: 'all', channel: 'all', view: 'overview' };
  var money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  var compactMoney = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 });
  var number = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 });
  var decimal = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 });

  function byId(id) { return document.getElementById(id); }
  function titleCase(value) { return value.replace(/(^|\s)\S/g, function (letter) { return letter.toUpperCase(); }); }
  function percent(numerator, denominator) { return denominator ? (100 * numerator / denominator) : 0; }
  function formatPercent(value) { return decimal.format(value) + '%'; }
  function formatMonth(value) { return new Date(value + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }); }
  function formatShortMonth(value) { return new Date(value + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', year: '2-digit' }); }
  function matches(row) {
    var yearMatches = state.year === 'all' || row.month.slice(0, 4) === state.year;
    var channelMatches = state.channel === 'all' || row.channel === state.channel;
    return yearMatches && channelMatches;
  }
  function sum(rows, field) { return rows.reduce(function (total, row) { return total + Number(row[field] || 0); }, 0); }

  function aggregate(rows, keyField, numericFields, weightedField, weightField) {
    var groups = new Map();
    rows.forEach(function (row) {
      var key = row[keyField];
      if (!groups.has(key)) groups.set(key, { label: key, weight: 0, weightedTotal: 0 });
      var group = groups.get(key);
      numericFields.forEach(function (field) { group[field] = (group[field] || 0) + Number(row[field] || 0); });
      if (weightedField && weightField) {
        var weight = Number(row[weightField] || 0);
        group.weight += weight;
        group.weightedTotal += Number(row[weightedField] || 0) * weight;
      }
    });
    return Array.from(groups.values()).map(function (group) {
      if (weightedField) group[weightedField] = group.weight ? group.weightedTotal / group.weight : 0;
      return group;
    });
  }

  function aggregateMonths(rows) {
    return aggregate(rows, 'month', ['orders', 'units', 'net_sales', 'gross_margin', 'on_time_deliveries', 'delivered_orders'], 'average_delivery_cycle_minutes', 'delivered_orders')
      .sort(function (a, b) { return a.label.localeCompare(b.label); });
  }

  function setText(id, value) { var element = byId(id); if (element) element.textContent = value; }

  function renderTable(bodyId, rows) {
    var body = byId(bodyId);
    var fragment = document.createDocumentFragment();
    rows.forEach(function (cells) {
      var row = document.createElement('tr');
      cells.forEach(function (value) {
        var cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    body.replaceChildren(fragment);
  }

  function canvasContext(canvas) {
    var ratio = window.devicePixelRatio || 1;
    var width = Math.max(canvas.clientWidth, 280);
    var height = Math.max(canvas.clientHeight, 220);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.font = '12px Inter, Arial, sans-serif';
    context.fillStyle = '#4f5d57';
    context.strokeStyle = 'rgba(16,42,36,.16)';
    return { context: context, width: width, height: height };
  }

  function emptyChart(canvas, message) {
    var prepared = canvasContext(canvas);
    prepared.context.textAlign = 'center';
    prepared.context.fillText(message || 'No data for the selected filters', prepared.width / 2, prepared.height / 2);
  }

  function drawLineChart(canvas, entries) {
    if (!entries.length) { emptyChart(canvas); return; }
    var prepared = canvasContext(canvas);
    var context = prepared.context;
    var width = prepared.width;
    var height = prepared.height;
    var pad = { left: 62, right: 18, top: 18, bottom: 36 };
    var plotWidth = width - pad.left - pad.right;
    var plotHeight = height - pad.top - pad.bottom;
    var maximum = Math.max.apply(null, entries.map(function (entry) { return entry.value; })) * 1.08 || 1;

    for (var grid = 0; grid <= 4; grid += 1) {
      var y = pad.top + plotHeight * grid / 4;
      context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
      context.textAlign = 'right'; context.fillText(compactMoney.format(maximum * (1 - grid / 4)), pad.left - 8, y + 4);
    }

    context.strokeStyle = '#718e13';
    context.lineWidth = 3;
    context.beginPath();
    entries.forEach(function (entry, index) {
      var x = pad.left + (entries.length === 1 ? plotWidth / 2 : plotWidth * index / (entries.length - 1));
      var y = pad.top + plotHeight * (1 - entry.value / maximum);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();

    context.fillStyle = '#102a24';
    entries.forEach(function (entry, index) {
      var x = pad.left + (entries.length === 1 ? plotWidth / 2 : plotWidth * index / (entries.length - 1));
      var y = pad.top + plotHeight * (1 - entry.value / maximum);
      context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fill();
    });

    var labelEvery = Math.max(1, Math.ceil(entries.length / 6));
    context.fillStyle = '#4f5d57';
    context.textAlign = 'center';
    entries.forEach(function (entry, index) {
      if (index % labelEvery === 0 || index === entries.length - 1) {
        var x = pad.left + (entries.length === 1 ? plotWidth / 2 : plotWidth * index / (entries.length - 1));
        context.fillText(entry.shortLabel, x, height - 12);
      }
    });
  }

  function drawBars(canvas, entries, valueFormatter) {
    if (!entries.length) { emptyChart(canvas); return; }
    var prepared = canvasContext(canvas);
    var context = prepared.context;
    var width = prepared.width;
    var height = prepared.height;
    var labelWidth = Math.min(132, width * .34);
    var valueWidth = 72;
    var maximum = Math.max.apply(null, entries.map(function (entry) { return entry.value; })) || 1;
    var rowHeight = height / entries.length;
    entries.forEach(function (entry, index) {
      var y = rowHeight * index + rowHeight * .25;
      var barHeight = Math.max(8, rowHeight * .42);
      var available = width - labelWidth - valueWidth - 18;
      context.fillStyle = '#e3e7df';
      context.fillRect(labelWidth, y, available, barHeight);
      context.fillStyle = colors[index % colors.length];
      context.fillRect(labelWidth, y, available * entry.value / maximum, barHeight);
      context.fillStyle = '#33423c';
      context.textAlign = 'left';
      var label = entry.label.length > 18 ? entry.label.slice(0, 17) + '…' : entry.label;
      context.fillText(label, 0, y + barHeight - 1);
      context.textAlign = 'right';
      context.fillText(valueFormatter(entry.value), width - 2, y + barHeight - 1);
    });
  }

  function renderOverview() {
    var filtered = state.data.monthly_channel.filter(matches);
    var months = aggregateMonths(filtered);
    var channels = aggregate(filtered, 'channel', ['net_sales']).sort(function (a, b) { return b.net_sales - a.net_sales; });
    var netSales = sum(filtered, 'net_sales');
    var grossMargin = sum(filtered, 'gross_margin');
    var orders = sum(filtered, 'orders');
    var delivered = sum(filtered, 'delivered_orders');
    var onTime = sum(filtered, 'on_time_deliveries');
    var weightedCycle = filtered.reduce(function (total, row) { return total + row.average_delivery_cycle_minutes * row.delivered_orders; }, 0);
    var averageCycle = delivered ? weightedCycle / delivered : 0;

    setText('kpi-sales', compactMoney.format(netSales));
    setText('kpi-sales-note', months.length + ' month' + (months.length === 1 ? '' : 's') + ' selected');
    setText('kpi-margin', compactMoney.format(grossMargin));
    setText('kpi-margin-note', formatPercent(percent(grossMargin, netSales)) + ' margin rate');
    setText('kpi-orders', number.format(orders));
    setText('kpi-orders-note', decimal.format(percent(sum(filtered, 'discount'), sum(filtered, 'gross_sales'))) + '% discount rate');
    setText('kpi-ontime', formatPercent(percent(onTime, delivered)));
    setText('kpi-ontime-note', number.format(delivered) + ' delivered orders');
    setText('kpi-cycle', decimal.format(averageCycle));

    drawLineChart(byId('sales-trend'), months.map(function (row) { return { label: row.label, shortLabel: formatShortMonth(row.label), value: row.net_sales }; }));
    var peak = months.slice().sort(function (a, b) { return b.net_sales - a.net_sales; })[0];
    setText('sales-trend-summary', peak ? 'Peak filtered month: ' + formatMonth(peak.label) + ' at ' + money.format(peak.net_sales) + '.' : 'No matching months.');
    drawBars(byId('channel-mix'), channels.map(function (row) { return { label: titleCase(row.label), value: row.net_sales }; }), function (value) { return compactMoney.format(value); });
    setText('channel-mix-summary', channels[0] ? titleCase(channels[0].label) + ' leads the selected view with ' + formatPercent(percent(channels[0].net_sales, netSales)) + ' of net sales.' : 'No matching channels.');
    renderTable('monthly-table-body', months.slice(-8).reverse().map(function (row) { return [formatMonth(row.label), number.format(row.orders), money.format(row.net_sales), money.format(row.gross_margin)]; }));
  }

  function renderDelivery() {
    var filtered = state.data.monthly_channel.filter(matches);
    var channels = aggregate(filtered, 'channel', ['delivered_orders', 'on_time_deliveries'], 'average_delivery_cycle_minutes', 'delivered_orders')
      .map(function (row) { row.on_time_rate = percent(row.on_time_deliveries, row.delivered_orders); return row; });
    var onTimeSorted = channels.slice().sort(function (a, b) { return b.on_time_rate - a.on_time_rate; });
    var cycleSorted = channels.slice().sort(function (a, b) { return a.average_delivery_cycle_minutes - b.average_delivery_cycle_minutes; });
    drawBars(byId('ontime-channel'), onTimeSorted.map(function (row) { return { label: titleCase(row.label), value: row.on_time_rate }; }), formatPercent);
    drawBars(byId('cycle-channel'), cycleSorted.map(function (row) { return { label: titleCase(row.label), value: row.average_delivery_cycle_minutes }; }), function (value) { return decimal.format(value) + ' min'; });
    setText('ontime-summary', onTimeSorted[0] ? titleCase(onTimeSorted[0].label) + ' has the highest selected on-time rate at ' + formatPercent(onTimeSorted[0].on_time_rate) + '.' : 'No matching delivery records.');
    setText('cycle-summary', cycleSorted[0] ? titleCase(cycleSorted[0].label) + ' has the shortest selected average cycle at ' + decimal.format(cycleSorted[0].average_delivery_cycle_minutes) + ' minutes.' : 'No matching delivery records.');

    var stores = aggregate(state.data.store_delivery.filter(matches), 'store', ['delivered_orders', 'on_time_deliveries'], 'average_delivery_cycle_minutes', 'delivered_orders')
      .map(function (row) { row.on_time_rate = percent(row.on_time_deliveries, row.delivered_orders); return row; })
      .filter(function (row) { return row.delivered_orders >= 100; })
      .sort(function (a, b) { return b.on_time_rate - a.on_time_rate; })
      .slice(0, 10);
    drawBars(byId('store-performance'), stores.map(function (row) { return { label: row.label, value: row.on_time_rate }; }), formatPercent);
    renderTable('store-table-body', stores.map(function (row) { return [row.label, number.format(row.delivered_orders), number.format(row.on_time_deliveries), formatPercent(row.on_time_rate), decimal.format(row.average_delivery_cycle_minutes) + ' min']; }));
  }

  function renderCustomer() {
    var segments = aggregate(state.data.customer_segment.filter(matches), 'segment', ['orders', 'units', 'net_sales', 'gross_margin'])
      .sort(function (a, b) { return b.net_sales - a.net_sales; });
    var categories = aggregate(state.data.product_category.filter(matches), 'category', ['orders', 'units', 'net_sales', 'gross_margin'])
      .sort(function (a, b) { return b.gross_margin - a.gross_margin; });
    drawBars(byId('segment-sales'), segments.map(function (row) { return { label: row.label, value: row.net_sales }; }), function (value) { return compactMoney.format(value); });
    drawBars(byId('category-margin'), categories.map(function (row) { return { label: row.label, value: row.gross_margin }; }), function (value) { return compactMoney.format(value); });
    setText('segment-summary', segments[0] ? segments[0].label + ' is the largest selected synthetic segment at ' + compactMoney.format(segments[0].net_sales) + ' in net sales.' : 'No matching segments.');
    setText('category-summary', categories[0] ? categories[0].label + ' produces the highest selected gross margin at ' + compactMoney.format(categories[0].gross_margin) + '.' : 'No matching categories.');
    renderTable('category-table-body', categories.map(function (row) { return [row.label, number.format(row.orders), number.format(row.units), money.format(row.net_sales), money.format(row.gross_margin)]; }));
  }

  function renderAudit() {
    var pipeline = state.data.pipeline;
    var reconciliation = percent(pipeline.loaded_physical_rows, pipeline.expected_physical_rows);
    setText('audit-status', titleCase(pipeline.status));
    setText('audit-rows', number.format(pipeline.loaded_physical_rows));
    setText('audit-entities', number.format(pipeline.loaded_entity_count));
    setText('audit-duration', decimal.format(pipeline.load_duration_seconds) + ' sec');
    byId('reconciliation-fill').style.width = Math.min(100, reconciliation) + '%';
    setText('reconciliation-summary', number.format(pipeline.loaded_physical_rows) + ' of ' + number.format(pipeline.expected_physical_rows) + ' expected physical rows reconciled (' + formatPercent(reconciliation) + ').');
  }

  function render() {
    if (!state.data) return;
    var selectedRows = state.data.monthly_channel.filter(matches);
    var months = Array.from(new Set(selectedRows.map(function (row) { return row.month; })));
    var status = (state.year === 'all' ? 'All years' : state.year) + ' · ' + (state.channel === 'all' ? 'All channels' : titleCase(state.channel)) + ' · ' + months.length + ' month' + (months.length === 1 ? '' : 's');
    setText('dashboard-status', status);
    if (state.view === 'overview') renderOverview();
    if (state.view === 'delivery') renderDelivery();
    if (state.view === 'customer') renderCustomer();
    if (state.view === 'audit') renderAudit();
  }

  function activateView(view, focusButton) {
    state.view = view;
    document.querySelectorAll('[role="tab"]').forEach(function (button) {
      var selected = button.dataset.view === view;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      if (selected && focusButton) button.focus();
    });
    document.querySelectorAll('.dashboard-view').forEach(function (panel) { panel.hidden = panel.id !== 'view-' + view; });
    window.requestAnimationFrame(render);
  }

  function populateFilters() {
    var years = Array.from(new Set(state.data.monthly_channel.map(function (row) { return row.month.slice(0, 4); }))).sort();
    var channels = Array.from(new Set(state.data.monthly_channel.map(function (row) { return row.channel; }))).sort();
    years.forEach(function (year) { var option = new Option(year, year); byId('year-filter').add(option); });
    channels.forEach(function (channel) { var option = new Option(titleCase(channel), channel); byId('channel-filter').add(option); });
  }

  function bindEvents() {
    byId('year-filter').addEventListener('change', function (event) { state.year = event.target.value; render(); });
    byId('channel-filter').addEventListener('change', function (event) { state.channel = event.target.value; render(); });
    byId('reset-filters').addEventListener('click', function () {
      state.year = 'all'; state.channel = 'all';
      byId('year-filter').value = 'all'; byId('channel-filter').value = 'all'; render();
    });
    document.querySelectorAll('[role="tab"]').forEach(function (button) {
      button.addEventListener('click', function () { activateView(button.dataset.view, false); });
      button.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        var tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        var direction = event.key === 'ArrowRight' ? 1 : -1;
        var next = (tabs.indexOf(button) + direction + tabs.length) % tabs.length;
        event.preventDefault(); activateView(tabs[next].dataset.view, true);
      });
    });
    var resizeTimer;
    window.addEventListener('resize', function () { window.clearTimeout(resizeTimer); resizeTimer = window.setTimeout(render, 120); });
  }

  function normalizeData(raw) {
    return {
      metadata: raw.metadata,
      pipeline: raw.pipeline,
      monthly_channel: raw.monthly_channel.map(function (row) {
        return { month: row[0], channel: row[1], orders: row[2], active_customers: row[3], units: row[4], gross_sales: row[5], discount: row[6], net_sales: row[7], gross_margin: row[8], average_order_value: row[9], on_time_deliveries: row[10], delivered_orders: row[11], average_delivery_cycle_minutes: row[12] };
      }),
      customer_segment: raw.customer_segment.map(function (row) {
        return { month: row[0] + '-01-01', channel: row[1], segment: row[2], orders: row[3], units: row[4], net_sales: row[5], gross_margin: row[6] };
      }),
      product_category: raw.product_category.map(function (row) {
        return { month: row[0] + '-01-01', channel: row[1], category: row[2], orders: row[3], units: row[4], net_sales: row[5], gross_margin: row[6] };
      }),
      store_delivery: raw.store_delivery.map(function (row) {
        return { month: row[0] + '-01-01', channel: row[1], store: row[2], delivered_orders: row[3], on_time_deliveries: row[4], average_delivery_cycle_minutes: row[5] };
      })
    };
  }

  async function initialize() {
    try {
      var response = await fetch(DATA_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Dashboard data request failed with status ' + response.status + '.');
      state.data = normalizeData(await response.json());
      if (!state.data.metadata || state.data.metadata.synthetic !== true || state.data.metadata.aggregation_only !== true) throw new Error('Dashboard data boundary metadata is missing.');
      populateFilters();
      bindEvents();
      byId('dashboard-loading').hidden = true;
      activateView('overview', false);
    } catch (error) {
      var loading = byId('dashboard-loading');
      loading.classList.add('dashboard-error');
      loading.textContent = 'The dashboard data could not be loaded. Please use the case-study link and try again later.';
      console.error(error);
    }
  }

  initialize();
}());
