let Dataset; /* injected */

import { each } from '../../utils/each';
import { flatten } from '../utils/flatten';
import { valueAtDeepKey } from '../utils/object';
import { createExtractionKeys } from '../utils/create-extraction-keys';

export default function initialize(lib){
  Dataset = lib;
  return function(name){
    var options = Array.prototype.slice.call(arguments, 1);

    if (!parsers[name]) {
      throw 'Requested parser does not exist';
    }
    else {
      return parsers[name].apply(this, options);
    }
  };
}

function parseMetric(){
  return function(res){
    return new Dataset()
      .set(['Value', 'Result'], res.result)
      .type('metric');
  }
}

//var myParser = Dataset.parser('interval', 'timeframe.end');
function parseInterval(){
  var options = Array.prototype.slice.call(arguments);
  return function(res){
    var dataset = new Dataset()
      .type('interval');
    each(res.result, function(record, i){
      var index = options[0] && options[0] === 'timeframe.end' ? record.timeframe.end : record.timeframe.start;
      dataset.set(['Result', index], record.value);
    });
    return dataset;
  }
}

function parseGroupedMetric(){
  return function(res){
    var dataset = new Dataset()
      .type('grouped-metric');
    each(res.result, function(record, i){
      var label;
      each(record, function(value, key){
        if (key !== 'result') {
          label = key;
        }
      });
      dataset.set(['Result', String(record[label])], record.result);
    });
    return dataset;
  }
}

//var myParser = Dataset.parser('grouped-interval', 'timeframe.end');
function parseGroupedInterval(){
  var options = Array.prototype.slice.call(arguments);
  return function(res){
    var dataset = new Dataset()
      .type('grouped-interval');
    each(res.result, function(record, i){
      var index = options[0] && options[0] === 'timeframe.end' ? record.timeframe.end : record.timeframe.start;
      if (record.value.length) {
        each(record.value, function(group, j){
          var label;
          each(group, function(value, key){
            if (key !== 'result') {
              label = key;
            }
          });
          dataset.set([ String(group[label]), index ], group.result);
        });
      }
      else {
        dataset.appendRow(index);
      }
    });
    return dataset;
  }
}

//var myParser = Dataset.parser('double-grouped-metric', ['first', 'second']);
function parseDoubleGroupedMetric(){
  var options = Array.prototype.slice.call(arguments);
  if (!options[0]) throw 'Requested parser requires a sequential list (array) of properties to target as a second argument';
  return function(res){
    var dataset = new Dataset()
      .type('double-grouped-metric');
    each(res.result, function(record, i){
      var rowLabel = record[options[0][0]] + ' ' + record[options[0][1]];
      dataset.set([ 'Result', rowLabel ], record.result);
    });
    return dataset;
  }
}

//var myParser = Dataset.parser('double-grouped-interval', ['first', 'second'], 'timeframe.end');
function parseDoubleGroupedInterval(){
  var options = Array.prototype.slice.call(arguments);
  if (!options[0]) throw 'Requested parser requires a sequential list (array) of properties to target as a second argument';
  return function(res){
    var dataset = new Dataset()
      .type('double-grouped-interval');
    each(res.result, function(record, i){
      var index = options[1] && options[1] === 'timeframe.end' ? record.timeframe.end : record.timeframe.start;
      each(record['value'], function(value, j){
        var label = value[options[0][0]] + ' ' + value[options[0][1]];
        dataset.set([ label, index ], value.result);
      });
    });
    return dataset;
  }
}

function parseFunnel(){
  return function(res){
    var result, steps, dataset;
    if (typeof res.steps !== 'undefined'
        && typeof res.result !== 'undefined'
          && res.result instanceof Array) {
            // Ad-hoc funnel response
            result = res.result;
            steps = res.steps;
    }
    else if (typeof res.result.steps !== 'undefined'
        && typeof res.result.result !== 'undefined'
          && res.result.result instanceof Array) {
            // Saved funnel response
            result = res.result.result;
            steps = res.result.steps;
    }
    dataset = new Dataset().type('funnel');
    dataset.appendColumn('Step Value');
    each(result, function(value, i){
      if (typeof steps !== 'undefined' && steps[i]) {
        dataset.appendRow(String(steps[i].event_collection), [value]);
      }
    });
    return dataset;
  }
}

function parseList(){
  return function(res){
    var dataset = new Dataset()
      .type('list');
    each(res.result, function(value, i){
      dataset.set( [ 'Result', String(i+1) ], value );
    });
    return dataset;
  }
}

function parseExtraction(){
  let config = this.config;
  return function(res){
    const datasetExtraction = new Dataset()
      .type('extraction');

    const datasetKeys = createExtractionKeys(res.result);
    let names = Array.from(datasetKeys);

    const tableConfig = config && config.table;
    if (tableConfig && tableConfig.schema === 'dynamic') {
      const results = datas;
      const keys = {};
      results.forEach(resultItem => {
        const resultKeys = Object.keys(flatten(resultItem));
        if (resultKeys && resultKeys.length) {
          resultKeys.forEach(keyName => {
            if (!keys[keyName]) {
              keys[keyName] = true;
            }
          });
        }
      });
      names = Object.keys(keys);
    }

    let nameI = 0;
    names.forEach(value => {
      datasetExtraction.set([ value, '0' ], value);
      nameI++;
    });

    if (Dataset) {
      if (config
        && config.table
        && config.table.columns) {
        names = config.table.columns;
      }
    }

    for (let i=0; i<res.result.length; i++){
      let record = [i+1];
      for (let iNames=0; iNames<names.length; iNames++){
        record.push(valueAtDeepKey(res.result[i], names[iNames]));
      }
      datasetExtraction.matrix[String(i+1)] = record;
    }

    datasetExtraction.deleteColumn(0);

    return datasetExtraction;
  }
}

function parseHeatmapAxis() {
  return function(res) {
    const heatmapDataset = new Dataset()
      .type('heatmap');

    each(res.result, function(value, i){
      const objKeys = Object.keys(value);
      const x = value[objKeys[0]];
      const y = value[objKeys[1]];
      heatmapDataset.appendRow([ String(x), String(y), value.result]);
    });
    return heatmapDataset;
  }
}

// Parser definitions
const parsers = {
  metric: parseMetric,
  interval: parseInterval,
  'grouped-metric': parseGroupedMetric,
  'grouped-interval': parseGroupedInterval,
  'double-grouped-metric': parseDoubleGroupedMetric,
  'double-grouped-interval': parseDoubleGroupedInterval,
  funnel: parseFunnel,
  list: parseList,
  extraction: parseExtraction,
  'heatmap-axis': parseHeatmapAxis,
};
