/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 19800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 19800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 751.0, "minX": 0.0, "maxY": 5326.0, "series": [{"data": [[0.0, 751.0], [0.1, 751.0], [0.2, 751.0], [0.3, 751.0], [0.4, 751.0], [0.5, 751.0], [0.6, 751.0], [0.7, 751.0], [0.8, 751.0], [0.9, 751.0], [1.0, 761.0], [1.1, 761.0], [1.2, 761.0], [1.3, 761.0], [1.4, 761.0], [1.5, 761.0], [1.6, 761.0], [1.7, 761.0], [1.8, 761.0], [1.9, 761.0], [2.0, 766.0], [2.1, 766.0], [2.2, 766.0], [2.3, 766.0], [2.4, 766.0], [2.5, 766.0], [2.6, 766.0], [2.7, 766.0], [2.8, 766.0], [2.9, 766.0], [3.0, 767.0], [3.1, 767.0], [3.2, 767.0], [3.3, 767.0], [3.4, 767.0], [3.5, 767.0], [3.6, 767.0], [3.7, 767.0], [3.8, 767.0], [3.9, 767.0], [4.0, 939.0], [4.1, 939.0], [4.2, 939.0], [4.3, 939.0], [4.4, 939.0], [4.5, 939.0], [4.6, 939.0], [4.7, 939.0], [4.8, 939.0], [4.9, 939.0], [5.0, 1148.0], [5.1, 1148.0], [5.2, 1148.0], [5.3, 1148.0], [5.4, 1148.0], [5.5, 1148.0], [5.6, 1148.0], [5.7, 1148.0], [5.8, 1148.0], [5.9, 1148.0], [6.0, 1163.0], [6.1, 1163.0], [6.2, 1163.0], [6.3, 1163.0], [6.4, 1163.0], [6.5, 1163.0], [6.6, 1163.0], [6.7, 1163.0], [6.8, 1163.0], [6.9, 1163.0], [7.0, 1184.0], [7.1, 1184.0], [7.2, 1184.0], [7.3, 1184.0], [7.4, 1184.0], [7.5, 1184.0], [7.6, 1184.0], [7.7, 1184.0], [7.8, 1184.0], [7.9, 1184.0], [8.0, 1190.0], [8.1, 1190.0], [8.2, 1190.0], [8.3, 1190.0], [8.4, 1190.0], [8.5, 1190.0], [8.6, 1190.0], [8.7, 1190.0], [8.8, 1190.0], [8.9, 1190.0], [9.0, 1193.0], [9.1, 1193.0], [9.2, 1193.0], [9.3, 1193.0], [9.4, 1193.0], [9.5, 1193.0], [9.6, 1193.0], [9.7, 1193.0], [9.8, 1193.0], [9.9, 1193.0], [10.0, 1208.0], [10.1, 1208.0], [10.2, 1208.0], [10.3, 1208.0], [10.4, 1208.0], [10.5, 1208.0], [10.6, 1208.0], [10.7, 1208.0], [10.8, 1208.0], [10.9, 1208.0], [11.0, 1243.0], [11.1, 1243.0], [11.2, 1243.0], [11.3, 1243.0], [11.4, 1243.0], [11.5, 1243.0], [11.6, 1243.0], [11.7, 1243.0], [11.8, 1243.0], [11.9, 1243.0], [12.0, 1265.0], [12.1, 1265.0], [12.2, 1265.0], [12.3, 1265.0], [12.4, 1265.0], [12.5, 1265.0], [12.6, 1265.0], [12.7, 1265.0], [12.8, 1265.0], [12.9, 1265.0], [13.0, 1284.0], [13.1, 1284.0], [13.2, 1284.0], [13.3, 1284.0], [13.4, 1284.0], [13.5, 1284.0], [13.6, 1284.0], [13.7, 1284.0], [13.8, 1284.0], [13.9, 1284.0], [14.0, 1292.0], [14.1, 1292.0], [14.2, 1292.0], [14.3, 1292.0], [14.4, 1292.0], [14.5, 1292.0], [14.6, 1292.0], [14.7, 1292.0], [14.8, 1292.0], [14.9, 1292.0], [15.0, 1294.0], [15.1, 1294.0], [15.2, 1294.0], [15.3, 1294.0], [15.4, 1294.0], [15.5, 1294.0], [15.6, 1294.0], [15.7, 1294.0], [15.8, 1294.0], [15.9, 1294.0], [16.0, 1336.0], [16.1, 1336.0], [16.2, 1336.0], [16.3, 1336.0], [16.4, 1336.0], [16.5, 1336.0], [16.6, 1336.0], [16.7, 1336.0], [16.8, 1336.0], [16.9, 1336.0], [17.0, 1340.0], [17.1, 1340.0], [17.2, 1340.0], [17.3, 1340.0], [17.4, 1340.0], [17.5, 1340.0], [17.6, 1340.0], [17.7, 1340.0], [17.8, 1340.0], [17.9, 1340.0], [18.0, 1341.0], [18.1, 1341.0], [18.2, 1341.0], [18.3, 1341.0], [18.4, 1341.0], [18.5, 1341.0], [18.6, 1341.0], [18.7, 1341.0], [18.8, 1341.0], [18.9, 1341.0], [19.0, 1369.0], [19.1, 1369.0], [19.2, 1369.0], [19.3, 1369.0], [19.4, 1369.0], [19.5, 1369.0], [19.6, 1369.0], [19.7, 1369.0], [19.8, 1369.0], [19.9, 1369.0], [20.0, 1390.0], [20.1, 1390.0], [20.2, 1390.0], [20.3, 1390.0], [20.4, 1390.0], [20.5, 1390.0], [20.6, 1390.0], [20.7, 1390.0], [20.8, 1390.0], [20.9, 1390.0], [21.0, 1394.0], [21.1, 1394.0], [21.2, 1394.0], [21.3, 1394.0], [21.4, 1394.0], [21.5, 1394.0], [21.6, 1394.0], [21.7, 1394.0], [21.8, 1394.0], [21.9, 1394.0], [22.0, 1413.0], [22.1, 1413.0], [22.2, 1413.0], [22.3, 1413.0], [22.4, 1413.0], [22.5, 1413.0], [22.6, 1413.0], [22.7, 1413.0], [22.8, 1413.0], [22.9, 1413.0], [23.0, 1413.0], [23.1, 1413.0], [23.2, 1413.0], [23.3, 1413.0], [23.4, 1413.0], [23.5, 1413.0], [23.6, 1413.0], [23.7, 1413.0], [23.8, 1413.0], [23.9, 1413.0], [24.0, 1420.0], [24.1, 1420.0], [24.2, 1420.0], [24.3, 1420.0], [24.4, 1420.0], [24.5, 1420.0], [24.6, 1420.0], [24.7, 1420.0], [24.8, 1420.0], [24.9, 1420.0], [25.0, 1438.0], [25.1, 1438.0], [25.2, 1438.0], [25.3, 1438.0], [25.4, 1438.0], [25.5, 1438.0], [25.6, 1438.0], [25.7, 1438.0], [25.8, 1438.0], [25.9, 1438.0], [26.0, 1445.0], [26.1, 1445.0], [26.2, 1445.0], [26.3, 1445.0], [26.4, 1445.0], [26.5, 1445.0], [26.6, 1445.0], [26.7, 1445.0], [26.8, 1445.0], [26.9, 1445.0], [27.0, 1464.0], [27.1, 1464.0], [27.2, 1464.0], [27.3, 1464.0], [27.4, 1464.0], [27.5, 1464.0], [27.6, 1464.0], [27.7, 1464.0], [27.8, 1464.0], [27.9, 1464.0], [28.0, 1464.0], [28.1, 1464.0], [28.2, 1464.0], [28.3, 1464.0], [28.4, 1464.0], [28.5, 1464.0], [28.6, 1464.0], [28.7, 1464.0], [28.8, 1464.0], [28.9, 1464.0], [29.0, 1477.0], [29.1, 1477.0], [29.2, 1477.0], [29.3, 1477.0], [29.4, 1477.0], [29.5, 1477.0], [29.6, 1477.0], [29.7, 1477.0], [29.8, 1477.0], [29.9, 1477.0], [30.0, 1503.0], [30.1, 1503.0], [30.2, 1503.0], [30.3, 1503.0], [30.4, 1503.0], [30.5, 1503.0], [30.6, 1503.0], [30.7, 1503.0], [30.8, 1503.0], [30.9, 1503.0], [31.0, 1516.0], [31.1, 1516.0], [31.2, 1516.0], [31.3, 1516.0], [31.4, 1516.0], [31.5, 1516.0], [31.6, 1516.0], [31.7, 1516.0], [31.8, 1516.0], [31.9, 1516.0], [32.0, 1526.0], [32.1, 1526.0], [32.2, 1526.0], [32.3, 1526.0], [32.4, 1526.0], [32.5, 1526.0], [32.6, 1526.0], [32.7, 1526.0], [32.8, 1526.0], [32.9, 1526.0], [33.0, 1530.0], [33.1, 1530.0], [33.2, 1530.0], [33.3, 1530.0], [33.4, 1530.0], [33.5, 1530.0], [33.6, 1530.0], [33.7, 1530.0], [33.8, 1530.0], [33.9, 1530.0], [34.0, 1535.0], [34.1, 1535.0], [34.2, 1535.0], [34.3, 1535.0], [34.4, 1535.0], [34.5, 1535.0], [34.6, 1535.0], [34.7, 1535.0], [34.8, 1535.0], [34.9, 1535.0], [35.0, 1538.0], [35.1, 1538.0], [35.2, 1538.0], [35.3, 1538.0], [35.4, 1538.0], [35.5, 1538.0], [35.6, 1538.0], [35.7, 1538.0], [35.8, 1538.0], [35.9, 1538.0], [36.0, 1575.0], [36.1, 1575.0], [36.2, 1575.0], [36.3, 1575.0], [36.4, 1575.0], [36.5, 1575.0], [36.6, 1575.0], [36.7, 1575.0], [36.8, 1575.0], [36.9, 1575.0], [37.0, 1589.0], [37.1, 1589.0], [37.2, 1589.0], [37.3, 1589.0], [37.4, 1589.0], [37.5, 1589.0], [37.6, 1589.0], [37.7, 1589.0], [37.8, 1589.0], [37.9, 1589.0], [38.0, 1608.0], [38.1, 1608.0], [38.2, 1608.0], [38.3, 1608.0], [38.4, 1608.0], [38.5, 1608.0], [38.6, 1608.0], [38.7, 1608.0], [38.8, 1608.0], [38.9, 1608.0], [39.0, 1640.0], [39.1, 1640.0], [39.2, 1640.0], [39.3, 1640.0], [39.4, 1640.0], [39.5, 1640.0], [39.6, 1640.0], [39.7, 1640.0], [39.8, 1640.0], [39.9, 1640.0], [40.0, 1656.0], [40.1, 1656.0], [40.2, 1656.0], [40.3, 1656.0], [40.4, 1656.0], [40.5, 1656.0], [40.6, 1656.0], [40.7, 1656.0], [40.8, 1656.0], [40.9, 1656.0], [41.0, 1711.0], [41.1, 1711.0], [41.2, 1711.0], [41.3, 1711.0], [41.4, 1711.0], [41.5, 1711.0], [41.6, 1711.0], [41.7, 1711.0], [41.8, 1711.0], [41.9, 1711.0], [42.0, 1809.0], [42.1, 1809.0], [42.2, 1809.0], [42.3, 1809.0], [42.4, 1809.0], [42.5, 1809.0], [42.6, 1809.0], [42.7, 1809.0], [42.8, 1809.0], [42.9, 1809.0], [43.0, 1889.0], [43.1, 1889.0], [43.2, 1889.0], [43.3, 1889.0], [43.4, 1889.0], [43.5, 1889.0], [43.6, 1889.0], [43.7, 1889.0], [43.8, 1889.0], [43.9, 1889.0], [44.0, 2031.0], [44.1, 2031.0], [44.2, 2031.0], [44.3, 2031.0], [44.4, 2031.0], [44.5, 2031.0], [44.6, 2031.0], [44.7, 2031.0], [44.8, 2031.0], [44.9, 2031.0], [45.0, 2043.0], [45.1, 2043.0], [45.2, 2043.0], [45.3, 2043.0], [45.4, 2043.0], [45.5, 2043.0], [45.6, 2043.0], [45.7, 2043.0], [45.8, 2043.0], [45.9, 2043.0], [46.0, 2049.0], [46.1, 2049.0], [46.2, 2049.0], [46.3, 2049.0], [46.4, 2049.0], [46.5, 2049.0], [46.6, 2049.0], [46.7, 2049.0], [46.8, 2049.0], [46.9, 2049.0], [47.0, 2067.0], [47.1, 2067.0], [47.2, 2067.0], [47.3, 2067.0], [47.4, 2067.0], [47.5, 2067.0], [47.6, 2067.0], [47.7, 2067.0], [47.8, 2067.0], [47.9, 2067.0], [48.0, 2271.0], [48.1, 2271.0], [48.2, 2271.0], [48.3, 2271.0], [48.4, 2271.0], [48.5, 2271.0], [48.6, 2271.0], [48.7, 2271.0], [48.8, 2271.0], [48.9, 2271.0], [49.0, 2310.0], [49.1, 2310.0], [49.2, 2310.0], [49.3, 2310.0], [49.4, 2310.0], [49.5, 2310.0], [49.6, 2310.0], [49.7, 2310.0], [49.8, 2310.0], [49.9, 2310.0], [50.0, 2394.0], [50.1, 2394.0], [50.2, 2394.0], [50.3, 2394.0], [50.4, 2394.0], [50.5, 2394.0], [50.6, 2394.0], [50.7, 2394.0], [50.8, 2394.0], [50.9, 2394.0], [51.0, 2528.0], [51.1, 2528.0], [51.2, 2528.0], [51.3, 2528.0], [51.4, 2528.0], [51.5, 2528.0], [51.6, 2528.0], [51.7, 2528.0], [51.8, 2528.0], [51.9, 2528.0], [52.0, 2544.0], [52.1, 2544.0], [52.2, 2544.0], [52.3, 2544.0], [52.4, 2544.0], [52.5, 2544.0], [52.6, 2544.0], [52.7, 2544.0], [52.8, 2544.0], [52.9, 2544.0], [53.0, 2570.0], [53.1, 2570.0], [53.2, 2570.0], [53.3, 2570.0], [53.4, 2570.0], [53.5, 2570.0], [53.6, 2570.0], [53.7, 2570.0], [53.8, 2570.0], [53.9, 2570.0], [54.0, 2612.0], [54.1, 2612.0], [54.2, 2612.0], [54.3, 2612.0], [54.4, 2612.0], [54.5, 2612.0], [54.6, 2612.0], [54.7, 2612.0], [54.8, 2612.0], [54.9, 2612.0], [55.0, 2622.0], [55.1, 2622.0], [55.2, 2622.0], [55.3, 2622.0], [55.4, 2622.0], [55.5, 2622.0], [55.6, 2622.0], [55.7, 2622.0], [55.8, 2622.0], [55.9, 2622.0], [56.0, 2714.0], [56.1, 2714.0], [56.2, 2714.0], [56.3, 2714.0], [56.4, 2714.0], [56.5, 2714.0], [56.6, 2714.0], [56.7, 2714.0], [56.8, 2714.0], [56.9, 2714.0], [57.0, 2823.0], [57.1, 2823.0], [57.2, 2823.0], [57.3, 2823.0], [57.4, 2823.0], [57.5, 2823.0], [57.6, 2823.0], [57.7, 2823.0], [57.8, 2823.0], [57.9, 2823.0], [58.0, 2829.0], [58.1, 2829.0], [58.2, 2829.0], [58.3, 2829.0], [58.4, 2829.0], [58.5, 2829.0], [58.6, 2829.0], [58.7, 2829.0], [58.8, 2829.0], [58.9, 2829.0], [59.0, 2839.0], [59.1, 2839.0], [59.2, 2839.0], [59.3, 2839.0], [59.4, 2839.0], [59.5, 2839.0], [59.6, 2839.0], [59.7, 2839.0], [59.8, 2839.0], [59.9, 2839.0], [60.0, 2870.0], [60.1, 2870.0], [60.2, 2870.0], [60.3, 2870.0], [60.4, 2870.0], [60.5, 2870.0], [60.6, 2870.0], [60.7, 2870.0], [60.8, 2870.0], [60.9, 2870.0], [61.0, 2882.0], [61.1, 2882.0], [61.2, 2882.0], [61.3, 2882.0], [61.4, 2882.0], [61.5, 2882.0], [61.6, 2882.0], [61.7, 2882.0], [61.8, 2882.0], [61.9, 2882.0], [62.0, 2971.0], [62.1, 2971.0], [62.2, 2971.0], [62.3, 2971.0], [62.4, 2971.0], [62.5, 2971.0], [62.6, 2971.0], [62.7, 2971.0], [62.8, 2971.0], [62.9, 2971.0], [63.0, 2986.0], [63.1, 2986.0], [63.2, 2986.0], [63.3, 2986.0], [63.4, 2986.0], [63.5, 2986.0], [63.6, 2986.0], [63.7, 2986.0], [63.8, 2986.0], [63.9, 2986.0], [64.0, 2997.0], [64.1, 2997.0], [64.2, 2997.0], [64.3, 2997.0], [64.4, 2997.0], [64.5, 2997.0], [64.6, 2997.0], [64.7, 2997.0], [64.8, 2997.0], [64.9, 2997.0], [65.0, 3015.0], [65.1, 3015.0], [65.2, 3015.0], [65.3, 3015.0], [65.4, 3015.0], [65.5, 3015.0], [65.6, 3015.0], [65.7, 3015.0], [65.8, 3015.0], [65.9, 3015.0], [66.0, 3092.0], [66.1, 3092.0], [66.2, 3092.0], [66.3, 3092.0], [66.4, 3092.0], [66.5, 3092.0], [66.6, 3092.0], [66.7, 3092.0], [66.8, 3092.0], [66.9, 3092.0], [67.0, 3110.0], [67.1, 3110.0], [67.2, 3110.0], [67.3, 3110.0], [67.4, 3110.0], [67.5, 3110.0], [67.6, 3110.0], [67.7, 3110.0], [67.8, 3110.0], [67.9, 3110.0], [68.0, 3119.0], [68.1, 3119.0], [68.2, 3119.0], [68.3, 3119.0], [68.4, 3119.0], [68.5, 3119.0], [68.6, 3119.0], [68.7, 3119.0], [68.8, 3119.0], [68.9, 3119.0], [69.0, 3138.0], [69.1, 3138.0], [69.2, 3138.0], [69.3, 3138.0], [69.4, 3138.0], [69.5, 3138.0], [69.6, 3138.0], [69.7, 3138.0], [69.8, 3138.0], [69.9, 3138.0], [70.0, 3161.0], [70.1, 3161.0], [70.2, 3161.0], [70.3, 3161.0], [70.4, 3161.0], [70.5, 3161.0], [70.6, 3161.0], [70.7, 3161.0], [70.8, 3161.0], [70.9, 3161.0], [71.0, 3163.0], [71.1, 3163.0], [71.2, 3163.0], [71.3, 3163.0], [71.4, 3163.0], [71.5, 3163.0], [71.6, 3163.0], [71.7, 3163.0], [71.8, 3163.0], [71.9, 3163.0], [72.0, 3164.0], [72.1, 3164.0], [72.2, 3164.0], [72.3, 3164.0], [72.4, 3164.0], [72.5, 3164.0], [72.6, 3164.0], [72.7, 3164.0], [72.8, 3164.0], [72.9, 3164.0], [73.0, 3170.0], [73.1, 3170.0], [73.2, 3170.0], [73.3, 3170.0], [73.4, 3170.0], [73.5, 3170.0], [73.6, 3170.0], [73.7, 3170.0], [73.8, 3170.0], [73.9, 3170.0], [74.0, 3227.0], [74.1, 3227.0], [74.2, 3227.0], [74.3, 3227.0], [74.4, 3227.0], [74.5, 3227.0], [74.6, 3227.0], [74.7, 3227.0], [74.8, 3227.0], [74.9, 3227.0], [75.0, 3243.0], [75.1, 3243.0], [75.2, 3243.0], [75.3, 3243.0], [75.4, 3243.0], [75.5, 3243.0], [75.6, 3243.0], [75.7, 3243.0], [75.8, 3243.0], [75.9, 3243.0], [76.0, 3245.0], [76.1, 3245.0], [76.2, 3245.0], [76.3, 3245.0], [76.4, 3245.0], [76.5, 3245.0], [76.6, 3245.0], [76.7, 3245.0], [76.8, 3245.0], [76.9, 3245.0], [77.0, 3266.0], [77.1, 3266.0], [77.2, 3266.0], [77.3, 3266.0], [77.4, 3266.0], [77.5, 3266.0], [77.6, 3266.0], [77.7, 3266.0], [77.8, 3266.0], [77.9, 3266.0], [78.0, 3266.0], [78.1, 3266.0], [78.2, 3266.0], [78.3, 3266.0], [78.4, 3266.0], [78.5, 3266.0], [78.6, 3266.0], [78.7, 3266.0], [78.8, 3266.0], [78.9, 3266.0], [79.0, 3279.0], [79.1, 3279.0], [79.2, 3279.0], [79.3, 3279.0], [79.4, 3279.0], [79.5, 3279.0], [79.6, 3279.0], [79.7, 3279.0], [79.8, 3279.0], [79.9, 3279.0], [80.0, 3280.0], [80.1, 3280.0], [80.2, 3280.0], [80.3, 3280.0], [80.4, 3280.0], [80.5, 3280.0], [80.6, 3280.0], [80.7, 3280.0], [80.8, 3280.0], [80.9, 3280.0], [81.0, 3282.0], [81.1, 3282.0], [81.2, 3282.0], [81.3, 3282.0], [81.4, 3282.0], [81.5, 3282.0], [81.6, 3282.0], [81.7, 3282.0], [81.8, 3282.0], [81.9, 3282.0], [82.0, 3289.0], [82.1, 3289.0], [82.2, 3289.0], [82.3, 3289.0], [82.4, 3289.0], [82.5, 3289.0], [82.6, 3289.0], [82.7, 3289.0], [82.8, 3289.0], [82.9, 3289.0], [83.0, 3346.0], [83.1, 3346.0], [83.2, 3346.0], [83.3, 3346.0], [83.4, 3346.0], [83.5, 3346.0], [83.6, 3346.0], [83.7, 3346.0], [83.8, 3346.0], [83.9, 3346.0], [84.0, 3380.0], [84.1, 3380.0], [84.2, 3380.0], [84.3, 3380.0], [84.4, 3380.0], [84.5, 3380.0], [84.6, 3380.0], [84.7, 3380.0], [84.8, 3380.0], [84.9, 3380.0], [85.0, 3647.0], [85.1, 3647.0], [85.2, 3647.0], [85.3, 3647.0], [85.4, 3647.0], [85.5, 3647.0], [85.6, 3647.0], [85.7, 3647.0], [85.8, 3647.0], [85.9, 3647.0], [86.0, 3651.0], [86.1, 3651.0], [86.2, 3651.0], [86.3, 3651.0], [86.4, 3651.0], [86.5, 3651.0], [86.6, 3651.0], [86.7, 3651.0], [86.8, 3651.0], [86.9, 3651.0], [87.0, 3669.0], [87.1, 3669.0], [87.2, 3669.0], [87.3, 3669.0], [87.4, 3669.0], [87.5, 3669.0], [87.6, 3669.0], [87.7, 3669.0], [87.8, 3669.0], [87.9, 3669.0], [88.0, 3779.0], [88.1, 3779.0], [88.2, 3779.0], [88.3, 3779.0], [88.4, 3779.0], [88.5, 3779.0], [88.6, 3779.0], [88.7, 3779.0], [88.8, 3779.0], [88.9, 3779.0], [89.0, 3998.0], [89.1, 3998.0], [89.2, 3998.0], [89.3, 3998.0], [89.4, 3998.0], [89.5, 3998.0], [89.6, 3998.0], [89.7, 3998.0], [89.8, 3998.0], [89.9, 3998.0], [90.0, 4051.0], [90.1, 4051.0], [90.2, 4051.0], [90.3, 4051.0], [90.4, 4051.0], [90.5, 4051.0], [90.6, 4051.0], [90.7, 4051.0], [90.8, 4051.0], [90.9, 4051.0], [91.0, 4066.0], [91.1, 4066.0], [91.2, 4066.0], [91.3, 4066.0], [91.4, 4066.0], [91.5, 4066.0], [91.6, 4066.0], [91.7, 4066.0], [91.8, 4066.0], [91.9, 4066.0], [92.0, 4658.0], [92.1, 4658.0], [92.2, 4658.0], [92.3, 4658.0], [92.4, 4658.0], [92.5, 4658.0], [92.6, 4658.0], [92.7, 4658.0], [92.8, 4658.0], [92.9, 4658.0], [93.0, 4712.0], [93.1, 4712.0], [93.2, 4712.0], [93.3, 4712.0], [93.4, 4712.0], [93.5, 4712.0], [93.6, 4712.0], [93.7, 4712.0], [93.8, 4712.0], [93.9, 4712.0], [94.0, 4813.0], [94.1, 4813.0], [94.2, 4813.0], [94.3, 4813.0], [94.4, 4813.0], [94.5, 4813.0], [94.6, 4813.0], [94.7, 4813.0], [94.8, 4813.0], [94.9, 4813.0], [95.0, 4838.0], [95.1, 4838.0], [95.2, 4838.0], [95.3, 4838.0], [95.4, 4838.0], [95.5, 4838.0], [95.6, 4838.0], [95.7, 4838.0], [95.8, 4838.0], [95.9, 4838.0], [96.0, 4846.0], [96.1, 4846.0], [96.2, 4846.0], [96.3, 4846.0], [96.4, 4846.0], [96.5, 4846.0], [96.6, 4846.0], [96.7, 4846.0], [96.8, 4846.0], [96.9, 4846.0], [97.0, 4884.0], [97.1, 4884.0], [97.2, 4884.0], [97.3, 4884.0], [97.4, 4884.0], [97.5, 4884.0], [97.6, 4884.0], [97.7, 4884.0], [97.8, 4884.0], [97.9, 4884.0], [98.0, 5067.0], [98.1, 5067.0], [98.2, 5067.0], [98.3, 5067.0], [98.4, 5067.0], [98.5, 5067.0], [98.6, 5067.0], [98.7, 5067.0], [98.8, 5067.0], [98.9, 5067.0], [99.0, 5326.0], [99.1, 5326.0], [99.2, 5326.0], [99.3, 5326.0], [99.4, 5326.0], [99.5, 5326.0], [99.6, 5326.0], [99.7, 5326.0], [99.8, 5326.0], [99.9, 5326.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 700.0, "maxY": 9.0, "series": [{"data": [[700.0, 4.0], [900.0, 1.0], [1100.0, 5.0], [1200.0, 6.0], [1300.0, 6.0], [1400.0, 8.0], [1500.0, 8.0], [1600.0, 3.0], [1700.0, 1.0], [1800.0, 2.0], [2000.0, 4.0], [2200.0, 1.0], [2300.0, 2.0], [2500.0, 3.0], [2600.0, 2.0], [2800.0, 5.0], [2700.0, 1.0], [2900.0, 3.0], [3000.0, 2.0], [3100.0, 7.0], [3200.0, 9.0], [3300.0, 2.0], [3600.0, 3.0], [3700.0, 1.0], [3900.0, 1.0], [4000.0, 2.0], [4600.0, 1.0], [4800.0, 4.0], [4700.0, 1.0], [5000.0, 1.0], [5300.0, 1.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 5300.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 30.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 70.0, "series": [{"data": [[1.0, 30.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 70.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 36.46999999999998, "minX": 1.53072396E12, "maxY": 36.46999999999998, "series": [{"data": [[1.53072396E12, 36.46999999999998]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53072396E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 751.0, "minX": 1.0, "maxY": 5067.0, "series": [{"data": [[33.0, 3279.0], [32.0, 2725.5], [2.0, 766.0], [37.0, 3161.0], [36.0, 2838.0], [40.0, 3207.0], [43.0, 3289.0], [42.0, 2979.0], [45.0, 3206.5], [47.0, 3138.0], [46.0, 2870.0], [49.0, 3633.0], [48.0, 3092.0], [3.0, 5067.0], [50.0, 1542.844444444444], [4.0, 4884.0], [5.0, 4813.0], [6.0, 1530.0], [7.0, 751.0], [8.0, 4712.0], [9.0, 767.0], [10.0, 3779.0], [11.0, 4662.0], [12.0, 2803.5], [13.0, 2798.5], [14.0, 2997.0], [15.0, 3647.0], [16.0, 3651.0], [1.0, 4838.0], [17.0, 3280.0], [18.0, 3227.0], [19.0, 3015.0], [20.0, 2714.0], [22.0, 3183.0], [23.0, 2971.0], [24.0, 3282.0], [25.0, 3266.0], [26.0, 3346.0], [27.0, 2612.0], [28.0, 3466.5], [29.0, 2570.0], [30.0, 2544.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[36.46999999999998, 2439.6899999999996]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 50.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 205.0, "minX": 1.53072396E12, "maxY": 66892.1, "series": [{"data": [[1.53072396E12, 66892.1]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.53072396E12, 205.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53072396E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 2439.6899999999996, "minX": 1.53072396E12, "maxY": 2439.6899999999996, "series": [{"data": [[1.53072396E12, 2439.6899999999996]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53072396E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1442.1100000000001, "minX": 1.53072396E12, "maxY": 1442.1100000000001, "series": [{"data": [[1.53072396E12, 1442.1100000000001]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53072396E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 182.42, "minX": 1.53072396E12, "maxY": 182.42, "series": [{"data": [[1.53072396E12, 182.42]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53072396E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 751.0, "minX": 1.53072396E12, "maxY": 5326.0, "series": [{"data": [[1.53072396E12, 5326.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.53072396E12, 751.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.53072396E12, 4045.7000000000003]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.53072396E12, 5323.409999999999]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.53072396E12, 4836.75]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53072396E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 2352.0, "minX": 1.0, "maxY": 2352.0, "series": [{"data": [[1.0, 2352.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 1347.5, "minX": 1.0, "maxY": 1347.5, "series": [{"data": [[1.0, 1347.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.53072396E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.53072396E12, 1.6666666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53072396E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.53072396E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.53072396E12, 1.6666666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.53072396E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.53072396E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.53072396E12, 1.6666666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.53072396E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
