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
        data: {"result": {"minY": 618.0, "minX": 0.0, "maxY": 3763.0, "series": [{"data": [[0.0, 618.0], [0.1, 618.0], [0.2, 618.0], [0.3, 618.0], [0.4, 618.0], [0.5, 618.0], [0.6, 618.0], [0.7, 618.0], [0.8, 618.0], [0.9, 618.0], [1.0, 630.0], [1.1, 630.0], [1.2, 630.0], [1.3, 630.0], [1.4, 630.0], [1.5, 630.0], [1.6, 630.0], [1.7, 630.0], [1.8, 630.0], [1.9, 630.0], [2.0, 654.0], [2.1, 654.0], [2.2, 654.0], [2.3, 654.0], [2.4, 654.0], [2.5, 654.0], [2.6, 654.0], [2.7, 654.0], [2.8, 654.0], [2.9, 654.0], [3.0, 715.0], [3.1, 715.0], [3.2, 715.0], [3.3, 715.0], [3.4, 715.0], [3.5, 715.0], [3.6, 715.0], [3.7, 715.0], [3.8, 715.0], [3.9, 715.0], [4.0, 718.0], [4.1, 718.0], [4.2, 718.0], [4.3, 718.0], [4.4, 718.0], [4.5, 718.0], [4.6, 718.0], [4.7, 718.0], [4.8, 718.0], [4.9, 718.0], [5.0, 743.0], [5.1, 743.0], [5.2, 743.0], [5.3, 743.0], [5.4, 743.0], [5.5, 743.0], [5.6, 743.0], [5.7, 743.0], [5.8, 743.0], [5.9, 743.0], [6.0, 750.0], [6.1, 750.0], [6.2, 750.0], [6.3, 750.0], [6.4, 750.0], [6.5, 750.0], [6.6, 750.0], [6.7, 750.0], [6.8, 750.0], [6.9, 750.0], [7.0, 759.0], [7.1, 759.0], [7.2, 759.0], [7.3, 759.0], [7.4, 759.0], [7.5, 759.0], [7.6, 759.0], [7.7, 759.0], [7.8, 759.0], [7.9, 759.0], [8.0, 763.0], [8.1, 763.0], [8.2, 763.0], [8.3, 763.0], [8.4, 763.0], [8.5, 763.0], [8.6, 763.0], [8.7, 763.0], [8.8, 763.0], [8.9, 763.0], [9.0, 805.0], [9.1, 805.0], [9.2, 805.0], [9.3, 805.0], [9.4, 805.0], [9.5, 805.0], [9.6, 805.0], [9.7, 805.0], [9.8, 805.0], [9.9, 805.0], [10.0, 828.0], [10.1, 828.0], [10.2, 828.0], [10.3, 828.0], [10.4, 828.0], [10.5, 828.0], [10.6, 828.0], [10.7, 828.0], [10.8, 828.0], [10.9, 828.0], [11.0, 867.0], [11.1, 867.0], [11.2, 867.0], [11.3, 867.0], [11.4, 867.0], [11.5, 867.0], [11.6, 867.0], [11.7, 867.0], [11.8, 867.0], [11.9, 867.0], [12.0, 920.0], [12.1, 920.0], [12.2, 920.0], [12.3, 920.0], [12.4, 920.0], [12.5, 920.0], [12.6, 920.0], [12.7, 920.0], [12.8, 920.0], [12.9, 920.0], [13.0, 943.0], [13.1, 943.0], [13.2, 943.0], [13.3, 943.0], [13.4, 943.0], [13.5, 943.0], [13.6, 943.0], [13.7, 943.0], [13.8, 943.0], [13.9, 943.0], [14.0, 1025.0], [14.1, 1025.0], [14.2, 1025.0], [14.3, 1025.0], [14.4, 1025.0], [14.5, 1025.0], [14.6, 1025.0], [14.7, 1025.0], [14.8, 1025.0], [14.9, 1025.0], [15.0, 1054.0], [15.1, 1054.0], [15.2, 1054.0], [15.3, 1054.0], [15.4, 1054.0], [15.5, 1054.0], [15.6, 1054.0], [15.7, 1054.0], [15.8, 1054.0], [15.9, 1054.0], [16.0, 1159.0], [16.1, 1159.0], [16.2, 1159.0], [16.3, 1159.0], [16.4, 1159.0], [16.5, 1159.0], [16.6, 1159.0], [16.7, 1159.0], [16.8, 1159.0], [16.9, 1159.0], [17.0, 1165.0], [17.1, 1165.0], [17.2, 1165.0], [17.3, 1165.0], [17.4, 1165.0], [17.5, 1165.0], [17.6, 1165.0], [17.7, 1165.0], [17.8, 1165.0], [17.9, 1165.0], [18.0, 1185.0], [18.1, 1185.0], [18.2, 1185.0], [18.3, 1185.0], [18.4, 1185.0], [18.5, 1185.0], [18.6, 1185.0], [18.7, 1185.0], [18.8, 1185.0], [18.9, 1185.0], [19.0, 1190.0], [19.1, 1190.0], [19.2, 1190.0], [19.3, 1190.0], [19.4, 1190.0], [19.5, 1190.0], [19.6, 1190.0], [19.7, 1190.0], [19.8, 1190.0], [19.9, 1190.0], [20.0, 1190.0], [20.1, 1190.0], [20.2, 1190.0], [20.3, 1190.0], [20.4, 1190.0], [20.5, 1190.0], [20.6, 1190.0], [20.7, 1190.0], [20.8, 1190.0], [20.9, 1190.0], [21.0, 1210.0], [21.1, 1210.0], [21.2, 1210.0], [21.3, 1210.0], [21.4, 1210.0], [21.5, 1210.0], [21.6, 1210.0], [21.7, 1210.0], [21.8, 1210.0], [21.9, 1210.0], [22.0, 1211.0], [22.1, 1211.0], [22.2, 1211.0], [22.3, 1211.0], [22.4, 1211.0], [22.5, 1211.0], [22.6, 1211.0], [22.7, 1211.0], [22.8, 1211.0], [22.9, 1211.0], [23.0, 1213.0], [23.1, 1213.0], [23.2, 1213.0], [23.3, 1213.0], [23.4, 1213.0], [23.5, 1213.0], [23.6, 1213.0], [23.7, 1213.0], [23.8, 1213.0], [23.9, 1213.0], [24.0, 1214.0], [24.1, 1214.0], [24.2, 1214.0], [24.3, 1214.0], [24.4, 1214.0], [24.5, 1214.0], [24.6, 1214.0], [24.7, 1214.0], [24.8, 1214.0], [24.9, 1214.0], [25.0, 1215.0], [25.1, 1215.0], [25.2, 1215.0], [25.3, 1215.0], [25.4, 1215.0], [25.5, 1215.0], [25.6, 1215.0], [25.7, 1215.0], [25.8, 1215.0], [25.9, 1215.0], [26.0, 1217.0], [26.1, 1217.0], [26.2, 1217.0], [26.3, 1217.0], [26.4, 1217.0], [26.5, 1217.0], [26.6, 1217.0], [26.7, 1217.0], [26.8, 1217.0], [26.9, 1217.0], [27.0, 1225.0], [27.1, 1225.0], [27.2, 1225.0], [27.3, 1225.0], [27.4, 1225.0], [27.5, 1225.0], [27.6, 1225.0], [27.7, 1225.0], [27.8, 1225.0], [27.9, 1225.0], [28.0, 1233.0], [28.1, 1233.0], [28.2, 1233.0], [28.3, 1233.0], [28.4, 1233.0], [28.5, 1233.0], [28.6, 1233.0], [28.7, 1233.0], [28.8, 1233.0], [28.9, 1233.0], [29.0, 1240.0], [29.1, 1240.0], [29.2, 1240.0], [29.3, 1240.0], [29.4, 1240.0], [29.5, 1240.0], [29.6, 1240.0], [29.7, 1240.0], [29.8, 1240.0], [29.9, 1240.0], [30.0, 1242.0], [30.1, 1242.0], [30.2, 1242.0], [30.3, 1242.0], [30.4, 1242.0], [30.5, 1242.0], [30.6, 1242.0], [30.7, 1242.0], [30.8, 1242.0], [30.9, 1242.0], [31.0, 1254.0], [31.1, 1254.0], [31.2, 1254.0], [31.3, 1254.0], [31.4, 1254.0], [31.5, 1254.0], [31.6, 1254.0], [31.7, 1254.0], [31.8, 1254.0], [31.9, 1254.0], [32.0, 1262.0], [32.1, 1262.0], [32.2, 1262.0], [32.3, 1262.0], [32.4, 1262.0], [32.5, 1262.0], [32.6, 1262.0], [32.7, 1262.0], [32.8, 1262.0], [32.9, 1262.0], [33.0, 1280.0], [33.1, 1280.0], [33.2, 1280.0], [33.3, 1280.0], [33.4, 1280.0], [33.5, 1280.0], [33.6, 1280.0], [33.7, 1280.0], [33.8, 1280.0], [33.9, 1280.0], [34.0, 1291.0], [34.1, 1291.0], [34.2, 1291.0], [34.3, 1291.0], [34.4, 1291.0], [34.5, 1291.0], [34.6, 1291.0], [34.7, 1291.0], [34.8, 1291.0], [34.9, 1291.0], [35.0, 1307.0], [35.1, 1307.0], [35.2, 1307.0], [35.3, 1307.0], [35.4, 1307.0], [35.5, 1307.0], [35.6, 1307.0], [35.7, 1307.0], [35.8, 1307.0], [35.9, 1307.0], [36.0, 1325.0], [36.1, 1325.0], [36.2, 1325.0], [36.3, 1325.0], [36.4, 1325.0], [36.5, 1325.0], [36.6, 1325.0], [36.7, 1325.0], [36.8, 1325.0], [36.9, 1325.0], [37.0, 1336.0], [37.1, 1336.0], [37.2, 1336.0], [37.3, 1336.0], [37.4, 1336.0], [37.5, 1336.0], [37.6, 1336.0], [37.7, 1336.0], [37.8, 1336.0], [37.9, 1336.0], [38.0, 1337.0], [38.1, 1337.0], [38.2, 1337.0], [38.3, 1337.0], [38.4, 1337.0], [38.5, 1337.0], [38.6, 1337.0], [38.7, 1337.0], [38.8, 1337.0], [38.9, 1337.0], [39.0, 1340.0], [39.1, 1340.0], [39.2, 1340.0], [39.3, 1340.0], [39.4, 1340.0], [39.5, 1340.0], [39.6, 1340.0], [39.7, 1340.0], [39.8, 1340.0], [39.9, 1340.0], [40.0, 1354.0], [40.1, 1354.0], [40.2, 1354.0], [40.3, 1354.0], [40.4, 1354.0], [40.5, 1354.0], [40.6, 1354.0], [40.7, 1354.0], [40.8, 1354.0], [40.9, 1354.0], [41.0, 1355.0], [41.1, 1355.0], [41.2, 1355.0], [41.3, 1355.0], [41.4, 1355.0], [41.5, 1355.0], [41.6, 1355.0], [41.7, 1355.0], [41.8, 1355.0], [41.9, 1355.0], [42.0, 1373.0], [42.1, 1373.0], [42.2, 1373.0], [42.3, 1373.0], [42.4, 1373.0], [42.5, 1373.0], [42.6, 1373.0], [42.7, 1373.0], [42.8, 1373.0], [42.9, 1373.0], [43.0, 1376.0], [43.1, 1376.0], [43.2, 1376.0], [43.3, 1376.0], [43.4, 1376.0], [43.5, 1376.0], [43.6, 1376.0], [43.7, 1376.0], [43.8, 1376.0], [43.9, 1376.0], [44.0, 1383.0], [44.1, 1383.0], [44.2, 1383.0], [44.3, 1383.0], [44.4, 1383.0], [44.5, 1383.0], [44.6, 1383.0], [44.7, 1383.0], [44.8, 1383.0], [44.9, 1383.0], [45.0, 1384.0], [45.1, 1384.0], [45.2, 1384.0], [45.3, 1384.0], [45.4, 1384.0], [45.5, 1384.0], [45.6, 1384.0], [45.7, 1384.0], [45.8, 1384.0], [45.9, 1384.0], [46.0, 1387.0], [46.1, 1387.0], [46.2, 1387.0], [46.3, 1387.0], [46.4, 1387.0], [46.5, 1387.0], [46.6, 1387.0], [46.7, 1387.0], [46.8, 1387.0], [46.9, 1387.0], [47.0, 1390.0], [47.1, 1390.0], [47.2, 1390.0], [47.3, 1390.0], [47.4, 1390.0], [47.5, 1390.0], [47.6, 1390.0], [47.7, 1390.0], [47.8, 1390.0], [47.9, 1390.0], [48.0, 1390.0], [48.1, 1390.0], [48.2, 1390.0], [48.3, 1390.0], [48.4, 1390.0], [48.5, 1390.0], [48.6, 1390.0], [48.7, 1390.0], [48.8, 1390.0], [48.9, 1390.0], [49.0, 1404.0], [49.1, 1404.0], [49.2, 1404.0], [49.3, 1404.0], [49.4, 1404.0], [49.5, 1404.0], [49.6, 1404.0], [49.7, 1404.0], [49.8, 1404.0], [49.9, 1404.0], [50.0, 1416.0], [50.1, 1416.0], [50.2, 1416.0], [50.3, 1416.0], [50.4, 1416.0], [50.5, 1416.0], [50.6, 1416.0], [50.7, 1416.0], [50.8, 1416.0], [50.9, 1416.0], [51.0, 1419.0], [51.1, 1419.0], [51.2, 1419.0], [51.3, 1419.0], [51.4, 1419.0], [51.5, 1419.0], [51.6, 1419.0], [51.7, 1419.0], [51.8, 1419.0], [51.9, 1419.0], [52.0, 1438.0], [52.1, 1438.0], [52.2, 1438.0], [52.3, 1438.0], [52.4, 1438.0], [52.5, 1438.0], [52.6, 1438.0], [52.7, 1438.0], [52.8, 1438.0], [52.9, 1438.0], [53.0, 1439.0], [53.1, 1439.0], [53.2, 1439.0], [53.3, 1439.0], [53.4, 1439.0], [53.5, 1439.0], [53.6, 1439.0], [53.7, 1439.0], [53.8, 1439.0], [53.9, 1439.0], [54.0, 1446.0], [54.1, 1446.0], [54.2, 1446.0], [54.3, 1446.0], [54.4, 1446.0], [54.5, 1446.0], [54.6, 1446.0], [54.7, 1446.0], [54.8, 1446.0], [54.9, 1446.0], [55.0, 1452.0], [55.1, 1452.0], [55.2, 1452.0], [55.3, 1452.0], [55.4, 1452.0], [55.5, 1452.0], [55.6, 1452.0], [55.7, 1452.0], [55.8, 1452.0], [55.9, 1452.0], [56.0, 1461.0], [56.1, 1461.0], [56.2, 1461.0], [56.3, 1461.0], [56.4, 1461.0], [56.5, 1461.0], [56.6, 1461.0], [56.7, 1461.0], [56.8, 1461.0], [56.9, 1461.0], [57.0, 1473.0], [57.1, 1473.0], [57.2, 1473.0], [57.3, 1473.0], [57.4, 1473.0], [57.5, 1473.0], [57.6, 1473.0], [57.7, 1473.0], [57.8, 1473.0], [57.9, 1473.0], [58.0, 1494.0], [58.1, 1494.0], [58.2, 1494.0], [58.3, 1494.0], [58.4, 1494.0], [58.5, 1494.0], [58.6, 1494.0], [58.7, 1494.0], [58.8, 1494.0], [58.9, 1494.0], [59.0, 1512.0], [59.1, 1512.0], [59.2, 1512.0], [59.3, 1512.0], [59.4, 1512.0], [59.5, 1512.0], [59.6, 1512.0], [59.7, 1512.0], [59.8, 1512.0], [59.9, 1512.0], [60.0, 1513.0], [60.1, 1513.0], [60.2, 1513.0], [60.3, 1513.0], [60.4, 1513.0], [60.5, 1513.0], [60.6, 1513.0], [60.7, 1513.0], [60.8, 1513.0], [60.9, 1513.0], [61.0, 1521.0], [61.1, 1521.0], [61.2, 1521.0], [61.3, 1521.0], [61.4, 1521.0], [61.5, 1521.0], [61.6, 1521.0], [61.7, 1521.0], [61.8, 1521.0], [61.9, 1521.0], [62.0, 1521.0], [62.1, 1521.0], [62.2, 1521.0], [62.3, 1521.0], [62.4, 1521.0], [62.5, 1521.0], [62.6, 1521.0], [62.7, 1521.0], [62.8, 1521.0], [62.9, 1521.0], [63.0, 1547.0], [63.1, 1547.0], [63.2, 1547.0], [63.3, 1547.0], [63.4, 1547.0], [63.5, 1547.0], [63.6, 1547.0], [63.7, 1547.0], [63.8, 1547.0], [63.9, 1547.0], [64.0, 1560.0], [64.1, 1560.0], [64.2, 1560.0], [64.3, 1560.0], [64.4, 1560.0], [64.5, 1560.0], [64.6, 1560.0], [64.7, 1560.0], [64.8, 1560.0], [64.9, 1560.0], [65.0, 1579.0], [65.1, 1579.0], [65.2, 1579.0], [65.3, 1579.0], [65.4, 1579.0], [65.5, 1579.0], [65.6, 1579.0], [65.7, 1579.0], [65.8, 1579.0], [65.9, 1579.0], [66.0, 1597.0], [66.1, 1597.0], [66.2, 1597.0], [66.3, 1597.0], [66.4, 1597.0], [66.5, 1597.0], [66.6, 1597.0], [66.7, 1597.0], [66.8, 1597.0], [66.9, 1597.0], [67.0, 1601.0], [67.1, 1601.0], [67.2, 1601.0], [67.3, 1601.0], [67.4, 1601.0], [67.5, 1601.0], [67.6, 1601.0], [67.7, 1601.0], [67.8, 1601.0], [67.9, 1601.0], [68.0, 1619.0], [68.1, 1619.0], [68.2, 1619.0], [68.3, 1619.0], [68.4, 1619.0], [68.5, 1619.0], [68.6, 1619.0], [68.7, 1619.0], [68.8, 1619.0], [68.9, 1619.0], [69.0, 1667.0], [69.1, 1667.0], [69.2, 1667.0], [69.3, 1667.0], [69.4, 1667.0], [69.5, 1667.0], [69.6, 1667.0], [69.7, 1667.0], [69.8, 1667.0], [69.9, 1667.0], [70.0, 1667.0], [70.1, 1667.0], [70.2, 1667.0], [70.3, 1667.0], [70.4, 1667.0], [70.5, 1667.0], [70.6, 1667.0], [70.7, 1667.0], [70.8, 1667.0], [70.9, 1667.0], [71.0, 1709.0], [71.1, 1709.0], [71.2, 1709.0], [71.3, 1709.0], [71.4, 1709.0], [71.5, 1709.0], [71.6, 1709.0], [71.7, 1709.0], [71.8, 1709.0], [71.9, 1709.0], [72.0, 1718.0], [72.1, 1718.0], [72.2, 1718.0], [72.3, 1718.0], [72.4, 1718.0], [72.5, 1718.0], [72.6, 1718.0], [72.7, 1718.0], [72.8, 1718.0], [72.9, 1718.0], [73.0, 1813.0], [73.1, 1813.0], [73.2, 1813.0], [73.3, 1813.0], [73.4, 1813.0], [73.5, 1813.0], [73.6, 1813.0], [73.7, 1813.0], [73.8, 1813.0], [73.9, 1813.0], [74.0, 1828.0], [74.1, 1828.0], [74.2, 1828.0], [74.3, 1828.0], [74.4, 1828.0], [74.5, 1828.0], [74.6, 1828.0], [74.7, 1828.0], [74.8, 1828.0], [74.9, 1828.0], [75.0, 1833.0], [75.1, 1833.0], [75.2, 1833.0], [75.3, 1833.0], [75.4, 1833.0], [75.5, 1833.0], [75.6, 1833.0], [75.7, 1833.0], [75.8, 1833.0], [75.9, 1833.0], [76.0, 1903.0], [76.1, 1903.0], [76.2, 1903.0], [76.3, 1903.0], [76.4, 1903.0], [76.5, 1903.0], [76.6, 1903.0], [76.7, 1903.0], [76.8, 1903.0], [76.9, 1903.0], [77.0, 1923.0], [77.1, 1923.0], [77.2, 1923.0], [77.3, 1923.0], [77.4, 1923.0], [77.5, 1923.0], [77.6, 1923.0], [77.7, 1923.0], [77.8, 1923.0], [77.9, 1923.0], [78.0, 1931.0], [78.1, 1931.0], [78.2, 1931.0], [78.3, 1931.0], [78.4, 1931.0], [78.5, 1931.0], [78.6, 1931.0], [78.7, 1931.0], [78.8, 1931.0], [78.9, 1931.0], [79.0, 2038.0], [79.1, 2038.0], [79.2, 2038.0], [79.3, 2038.0], [79.4, 2038.0], [79.5, 2038.0], [79.6, 2038.0], [79.7, 2038.0], [79.8, 2038.0], [79.9, 2038.0], [80.0, 2053.0], [80.1, 2053.0], [80.2, 2053.0], [80.3, 2053.0], [80.4, 2053.0], [80.5, 2053.0], [80.6, 2053.0], [80.7, 2053.0], [80.8, 2053.0], [80.9, 2053.0], [81.0, 2054.0], [81.1, 2054.0], [81.2, 2054.0], [81.3, 2054.0], [81.4, 2054.0], [81.5, 2054.0], [81.6, 2054.0], [81.7, 2054.0], [81.8, 2054.0], [81.9, 2054.0], [82.0, 2098.0], [82.1, 2098.0], [82.2, 2098.0], [82.3, 2098.0], [82.4, 2098.0], [82.5, 2098.0], [82.6, 2098.0], [82.7, 2098.0], [82.8, 2098.0], [82.9, 2098.0], [83.0, 2114.0], [83.1, 2114.0], [83.2, 2114.0], [83.3, 2114.0], [83.4, 2114.0], [83.5, 2114.0], [83.6, 2114.0], [83.7, 2114.0], [83.8, 2114.0], [83.9, 2114.0], [84.0, 2120.0], [84.1, 2120.0], [84.2, 2120.0], [84.3, 2120.0], [84.4, 2120.0], [84.5, 2120.0], [84.6, 2120.0], [84.7, 2120.0], [84.8, 2120.0], [84.9, 2120.0], [85.0, 2127.0], [85.1, 2127.0], [85.2, 2127.0], [85.3, 2127.0], [85.4, 2127.0], [85.5, 2127.0], [85.6, 2127.0], [85.7, 2127.0], [85.8, 2127.0], [85.9, 2127.0], [86.0, 2143.0], [86.1, 2143.0], [86.2, 2143.0], [86.3, 2143.0], [86.4, 2143.0], [86.5, 2143.0], [86.6, 2143.0], [86.7, 2143.0], [86.8, 2143.0], [86.9, 2143.0], [87.0, 2210.0], [87.1, 2210.0], [87.2, 2210.0], [87.3, 2210.0], [87.4, 2210.0], [87.5, 2210.0], [87.6, 2210.0], [87.7, 2210.0], [87.8, 2210.0], [87.9, 2210.0], [88.0, 2316.0], [88.1, 2316.0], [88.2, 2316.0], [88.3, 2316.0], [88.4, 2316.0], [88.5, 2316.0], [88.6, 2316.0], [88.7, 2316.0], [88.8, 2316.0], [88.9, 2316.0], [89.0, 2350.0], [89.1, 2350.0], [89.2, 2350.0], [89.3, 2350.0], [89.4, 2350.0], [89.5, 2350.0], [89.6, 2350.0], [89.7, 2350.0], [89.8, 2350.0], [89.9, 2350.0], [90.0, 2351.0], [90.1, 2351.0], [90.2, 2351.0], [90.3, 2351.0], [90.4, 2351.0], [90.5, 2351.0], [90.6, 2351.0], [90.7, 2351.0], [90.8, 2351.0], [90.9, 2351.0], [91.0, 2380.0], [91.1, 2380.0], [91.2, 2380.0], [91.3, 2380.0], [91.4, 2380.0], [91.5, 2380.0], [91.6, 2380.0], [91.7, 2380.0], [91.8, 2380.0], [91.9, 2380.0], [92.0, 2381.0], [92.1, 2381.0], [92.2, 2381.0], [92.3, 2381.0], [92.4, 2381.0], [92.5, 2381.0], [92.6, 2381.0], [92.7, 2381.0], [92.8, 2381.0], [92.9, 2381.0], [93.0, 2389.0], [93.1, 2389.0], [93.2, 2389.0], [93.3, 2389.0], [93.4, 2389.0], [93.5, 2389.0], [93.6, 2389.0], [93.7, 2389.0], [93.8, 2389.0], [93.9, 2389.0], [94.0, 2540.0], [94.1, 2540.0], [94.2, 2540.0], [94.3, 2540.0], [94.4, 2540.0], [94.5, 2540.0], [94.6, 2540.0], [94.7, 2540.0], [94.8, 2540.0], [94.9, 2540.0], [95.0, 2557.0], [95.1, 2557.0], [95.2, 2557.0], [95.3, 2557.0], [95.4, 2557.0], [95.5, 2557.0], [95.6, 2557.0], [95.7, 2557.0], [95.8, 2557.0], [95.9, 2557.0], [96.0, 2577.0], [96.1, 2577.0], [96.2, 2577.0], [96.3, 2577.0], [96.4, 2577.0], [96.5, 2577.0], [96.6, 2577.0], [96.7, 2577.0], [96.8, 2577.0], [96.9, 2577.0], [97.0, 2955.0], [97.1, 2955.0], [97.2, 2955.0], [97.3, 2955.0], [97.4, 2955.0], [97.5, 2955.0], [97.6, 2955.0], [97.7, 2955.0], [97.8, 2955.0], [97.9, 2955.0], [98.0, 3032.0], [98.1, 3032.0], [98.2, 3032.0], [98.3, 3032.0], [98.4, 3032.0], [98.5, 3032.0], [98.6, 3032.0], [98.7, 3032.0], [98.8, 3032.0], [98.9, 3032.0], [99.0, 3763.0], [99.1, 3763.0], [99.2, 3763.0], [99.3, 3763.0], [99.4, 3763.0], [99.5, 3763.0], [99.6, 3763.0], [99.7, 3763.0], [99.8, 3763.0], [99.9, 3763.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 600.0, "maxY": 14.0, "series": [{"data": [[2100.0, 4.0], [2300.0, 6.0], [2200.0, 1.0], [600.0, 3.0], [2500.0, 3.0], [700.0, 6.0], [2900.0, 1.0], [3000.0, 1.0], [800.0, 3.0], [900.0, 2.0], [3700.0, 1.0], [1000.0, 2.0], [1100.0, 5.0], [1200.0, 14.0], [1300.0, 14.0], [1400.0, 10.0], [1500.0, 8.0], [1600.0, 4.0], [1700.0, 2.0], [1800.0, 3.0], [1900.0, 3.0], [2000.0, 4.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 3700.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 41.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 59.0, "series": [{"data": [[1.0, 59.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 41.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 36.32, "minX": 1.5307125E12, "maxY": 36.32, "series": [{"data": [[1.5307125E12, 36.32]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5307125E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 618.0, "minX": 1.0, "maxY": 2635.5, "series": [{"data": [[33.0, 1702.5], [32.0, 1054.0], [2.0, 715.0], [35.0, 1667.0], [34.0, 1597.0], [37.0, 618.0], [36.0, 1262.0], [39.0, 943.0], [38.0, 654.0], [41.0, 1494.0], [40.0, 1337.0], [43.0, 1373.0], [42.0, 743.0], [45.0, 1233.0], [44.0, 1610.0], [47.0, 1265.5], [46.0, 759.0], [49.0, 1314.5], [48.0, 630.0], [3.0, 2263.0], [50.0, 1372.9545454545455], [4.0, 2143.0], [5.0, 2114.0], [6.0, 2389.0], [7.0, 2557.0], [8.0, 1903.0], [9.0, 2540.0], [10.0, 2577.0], [11.0, 1891.0], [12.0, 2381.0], [13.0, 2350.0], [14.0, 1931.0], [15.0, 2351.0], [1.0, 805.0], [17.0, 1938.5], [18.0, 2635.5], [19.0, 2038.0], [21.0, 2123.5], [22.0, 2054.0], [23.0, 2098.0], [24.0, 828.0], [25.0, 2053.0], [26.0, 1211.0], [27.0, 1225.0], [28.0, 1923.0], [29.0, 1439.0], [30.0, 1473.0], [31.0, 1217.0]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[36.32, 1535.77]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 50.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 205.0, "minX": 1.5307125E12, "maxY": 66892.23333333334, "series": [{"data": [[1.5307125E12, 66892.23333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5307125E12, 205.0]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5307125E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 1535.77, "minX": 1.5307125E12, "maxY": 1535.77, "series": [{"data": [[1.5307125E12, 1535.77]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5307125E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 1175.7799999999995, "minX": 1.5307125E12, "maxY": 1175.7799999999995, "series": [{"data": [[1.5307125E12, 1175.7799999999995]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5307125E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 113.89000000000001, "minX": 1.5307125E12, "maxY": 113.89000000000001, "series": [{"data": [[1.5307125E12, 113.89000000000001]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5307125E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 618.0, "minX": 1.5307125E12, "maxY": 3763.0, "series": [{"data": [[1.5307125E12, 3763.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5307125E12, 618.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5307125E12, 2350.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5307125E12, 3755.6899999999964]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5307125E12, 2556.1499999999996]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5307125E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 1410.0, "minX": 1.0, "maxY": 1410.0, "series": [{"data": [[1.0, 1410.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 1173.0, "minX": 1.0, "maxY": 1173.0, "series": [{"data": [[1.0, 1173.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.5307125E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.5307125E12, 1.6666666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5307125E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.5307125E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.5307125E12, 1.6666666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5307125E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 1.6666666666666667, "minX": 1.5307125E12, "maxY": 1.6666666666666667, "series": [{"data": [[1.5307125E12, 1.6666666666666667]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5307125E12, "title": "Transactions Per Second"}},
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
