# bixel - BI external element


## Usage

1. Download `bixel.js` or install with bower
- Create html file (index.html)
- Attach bixel.js as script or through require.js
- add event handlers (`loading`, `load`, `no-data`, etc)
- execute ```bixel.init()``` with options described below

## Direct
- include ```<script src="https://rawgit.com/rcslabs/bixel/master/bixel.js"></script>``` in your html file

## Using Bower
- run ```bower install git://github.com/rcslabs/bixel```
- include ```<script src="bower_components/bixel/bixel.js"></script>``` in your html file

## Using require.js
TODO

# API
## bixel.init

```
bixel.init({optional config})
```

Must execute this function when frame is ready to receive message

Config (optional):
- locationsCount - number of requested locations
- metricsCount - number of requested metrics
- periodsCount - number of requested periods

If none expliced then all selected will be provided

`bixel.init` returns promise object to ensure that everything is working
```javascript
bixel.init({periodsCount:1})
    .then(function() {
      // succeeded
    }, function() {
      // error
    });
```

## bixel.on
subscribe on event
```
bixel.on(eventName, callbackFunction)
```
eventName is string and can be one of:
- `loading` - will receive this event when data is loading. A callback will
  have `Axis` object as the only argument
- `load` - will receive this event when data is loading. A callback will
  have `Data` and `Axis` object as two arguments
- `no-data`- will receive this event when the data is empty if either there is
   no selection in ui panes or no data on server side. A callback will have
   `Axis` object as the only argument

## Axis object
provides methods:
- `axis.getMetrics()` - returns javascript array of `Metric` objects. This array
  will be maximum of `metricsCount` length if specified in `bixel.init` method
- `axis.getLocations()` - returns javascript array of `Location` objects. This array
  will be maximum of `locationsCount` length if specified in `bixel.init` method
- `axis.getPeriods()` - returns javascript array of `Period` objects. This array
  will be maximum of `periodsCount` length if specified in `bixel.init` method
- `axis.getUnits()` returns javascript array of `Unit` objects. It will
  contain all the units linked with metrics

## Data object
provides methods:
- `data.getValue(z, y, x)` - returns `DataItem` object. Arguments `z`, `y` and
   `x` are  `Metric`, `Location` and `Period`  objects from Axis in any order.

## DataItem
Generally a javascript `Number` object with overridden `toString` method.
`toString` will return formatted value according to measure unit.

example:
```javascript
bixel.on('load', function(data, axis) {
  var metric = axis.getMetrics()[0];     // only the first metric of provided
  var location = axis.getLocations()[0]; // and first location
  var period = axis.getPeriods()[0];     // and first period

  var dataValue = data.getValue(metric, location, period);

  var numValue = dataValue.valueOf();    // ex: number, 1000000
  var strValue = dataValue.toString()    // ex: string, '$ 1 000 000 us dollars'
});
```


## Metric object
javascript object, has fields:
- `id`:string - unique id of metric
- `title`:string - title of metric
- `color`:string - color for this metric according to dash configuration
- `unit_id`: string - the id of unit linked to the metric

## Location object
javascript object, has fields:
- `id`:string - unique id of location
- `title`:string - title of location
- `color`:string - color for this location according to dash configuration

## Period object
javascript object, has fields:
- `id`:string - unique id of period
- `title`:string - title of period
- `color`:string - color for this period according to dash configuration
