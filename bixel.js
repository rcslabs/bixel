;
(function (name, definition) {
	var theModule = definition();

	if (typeof define === 'function' && define.amd) {    // AMD
		define(theModule);
	} else if (typeof module !== 'undefined' && module.exports) {  // CommonJS
		module.exports = theModule
	} else if (typeof window !== 'undefined') {
		window[name] = theModule;
	}

})('bixel', function (undefined) {
	"use strict";

	var _msg_counter = 0;           // guid counter
	var _events = {};               // user events by type
	var _server = new Server();

	var Utils = {
		genUid: function () {
			return String(_msg_counter++);
		}
	};


	/**
	 * @constructor
	 * @struct
	 */
	function Server() {
		/**
		 * Message listeners grouped by type
		 * @type {{string, Function[]}}
		 */
		var _listeners = {};

		/**
		 * Listener to call when received ACK from server (fullfill and error)
		 * grouped by message uid
		 * @type {{string, [Function,Function}}
		 */
		var _replyListeners = {};


		if ((window !== undefined) && (window.parent !== window)) {
			if (window.addEventListener) {
				window.addEventListener('message', _onCrossFrameMessage);
			} else {
				window.attachEvent('onmessage', _onCrossFrameMessage);
			}
		}

		function _onCrossFrameMessage(event) {
			try {
				var srcWindow = event.source;
				if (srcWindow !== window.parent) {
					return;                           // accept only messages from parent window
				}
				_onMessage(event.data);

			} catch (err) {
				// ignore
			}
		}

		function _crossFrameSend(strMsg) {
			window.parent.postMessage(strMsg, '*');
		}

		function _send(msg) {
			var strMsg = JSON.stringify(msg);
			_crossFrameSend(strMsg);
		}

		/**
		 * Parse message and run handlers
		 * @param {string} msgStr JSON serialized message
		 */
		function _onMessage(msgStr) {
			try {
				var msg = JSON.parse(msgStr);
				if (!('type' in msg)) {
					return;
				}
				var type = msg.type;
				var uid = msg.uid;
				var payload = msg.payload;

				var isResponseOk = !!type.match(/^.*_OK$/);
				var isResponseFailed = !!type.match(/^.*_FAILED$/);

				if (isResponseOk || isResponseFailed) {                   // got response
					if (uid in _replyListeners) {
						try {
							var listenersPair = _replyListeners[uid];
							var listener = (isResponseOk) ? listenersPair[0] : listenersPair[1];
							if (typeof listener === 'function') {
								listener(payload);
							}
						} catch (err) {
							console.log(err.stack);
						}
						delete _replyListeners[uid];
					}

				} else {                                                  // got command
					var succeeded = false;
					if (type in _listeners) {
						_listeners[type].forEach(function (callback) {            // notify all command listeners
							try {
								msg.payload = callback(payload);
								succeeded = true;                                     // if at least one handler is ok: send _OK
							} catch (err) {
								if (!succeeded) {
									msg.payload = {
										message: err.message
									};
								}
							}
						});
					} else {
						msg.payload = {
							message: 'no handler'
						};
					}
					msg.type += succeeded ? '_OK' : '_FAILED';
					_send(msg);                                                 // send response
				}

			} catch (err) {
				console.log(err.stack);
			}
		}

		/**
		 * saves message listener
		 * @param {string} type Message type on which subscribed to
		 * @param {Function} listener A handler to call when message is received
		 */
		this.addMessageListener = function (type, listener) {
			if (!_listeners.hasOwnProperty(type)) {
				_listeners[type] = [];
			}
			_listeners[type].push(listener);
		};

		/**
		 * send message
		 * @param {string} type Message type
		 * @param {Object?} payload data to send
		 */
		this.send = function (type, payload) {
			return new Promise(function (fulfill, reject) {
				var uid = Utils.genUid();
				var msg = {
					type: type,
					payload: payload,
					uid: uid
				};
				_replyListeners[uid] = [fulfill, reject];
				_send(msg);
			});
		}
	}

	//
	// register handlers
	//
	_server.addMessageListener('LOAD', function (payload) {
		_onLoad(payload.data, payload.axis); // TODO: + norms
	});
	_server.addMessageListener('LOADING', function (payload) {
		_onLoading(payload.axis);
	});
	_server.addMessageListener('NO_DATA', function (payload) {
		_onNoData(payload.axis);
	});


	function _notifyClient(evtName) {
		var args = Array.prototype.slice.call(arguments, 1);
		var evtList = _events[evtName];
		if (evtList) {
			for (var i = 0; i < evtList.length; i++) {
				try {
					evtList[i].apply(window, args);
				} catch (err) {
					// ???
					console.log(err.stack);
				}
			}
		}
	}


	function formatNum(value, precision) {
		if (undefined === null || value === null || value === '' || !isFinite(value)) return '';
		if (precision === undefined) precision = 2;
		var separator = ' ';
		if (precision != -1) {
			value = value.toFixed(precision);
		}
		var a = ('' + value).split('.');
		a[0] = a[0]
				.split('').reverse().join('')
				.replace(/\d{3}(?=\d)/g, '$&' + separator)
				.split('').reverse().join('');
		if (a.length == 1) {
			return a[0];
		} else {
			return (0 == parseInt(a[1], 10) ? a[0] : a.join('.'));
		}
	}


	function makeValue(v, unit, digits) {
		if (v == null) return '-';
		if (typeof v === 'string') return v;
		if (v instanceof String) return v.valueOf();
		if (v instanceof Number) v = v.valueOf();
		if (isNaN(v)) return '-';
		if (digits == null) digits = 2;
		var strValue = (unit && unit.config && unit.config.valueMap && (v in unit.config.valueMap))
				? unit.config.valueMap[v]
				: formatNum(v, digits);
		if (unit) {
			if (unit.value_prefix) strValue = unit.value_prefix + ' ' + strValue;
			if (unit.value_suffix) strValue = strValue + ' ' + unit.value_suffix;
		}
		return strValue;
	}


	function _createAxis(axis) {
		var metrics   = axis.metrics;
		var locations = axis.locations;
		var periods   = axis.periods;
		var units     = axis.units || axis.dimensions;
		var axisOrder = axis.axisOrder;     // 'MLP', 'LMP', 'PML' ...

		var mh = {}, lh = {}, ph = {}, uh = {};
		metrics  .forEach(function (m) { mh[m.id] = m });
		locations.forEach(function (l) { lh[l.id] = l });
		periods  .forEach(function (p) { ph[p.id] = p });
		units    .forEach(function (u) { uh[u.id] = u });

		var result = {};

		result.getMetrics    = function ()   { return metrics;        };
		result.getLocations  = function ()   { return locations;      };
		result.getPeriods    = function ()   { return periods;        };
		result.getUnits      = function ()   { return units;          };

		result.getMetric     = function (id) { return mh[id] || null; };
		result.getLocation   = function (id) { return lh[id] || null; };
		result.getPeriod     = function (id) { return ph[id] || null; };
		result.getUnit       = function (id) { return uh[id] || null; };

		var _getUnitIdByM = function (m) { return ('unit_id' in m) ? m.unit_id : m.dim_id };
		result.getUnitByMetric = function (m) { return result.getUnit(_getUnitIdByM(m)) };

		var byLetter = {
			'M': metrics,
			'L': locations,
			'P': periods
		};

		result.getZs = function () { return byLetter[axisOrder[0]] };
		result.getYs = function () { return byLetter[axisOrder[1]] };
		result.getXs = function () { return byLetter[axisOrder[2]] };

		return result;
	}


	var _nalToString = function () {
		var val = this.valueOf();
		if (isNaN(val)) {
			return '-';
		}
		return makeValue(val, this.u);    // u - unit
	};


	//
	// server event listeners
	//
	function _onLoad(data, axis) {
		axis = _createAxis(axis);
		var ms = axis.getMetrics();
		var ls = axis.getLocations();
		var ps = axis.getPeriods();

		function _createNAL(v, m, l, p) {
			var nal = (typeof v === "string") ? new String(v) : new Number(v !== null ? v : NaN);
			nal.m = m;
			nal.l = l;
			nal.p = p;
			nal.d = axis.getUnitByMetric(m);
			nal.toString = _nalToString;
			return nal;
		}

		var mlpHash = {};
		data.forEach(function (dataItem) {
			var h = mlpHash, mid = dataItem.metric_id, lid = dataItem.loc_id, pid = dataItem.period_id;
			h = (mid in h) ? h[mid] : (h[mid] = {});
			h = (lid in h) ? h[lid] : (h[lid] = {});
			h[pid] = _createNAL(dataItem.value, axis.getMetric(mid),  axis.getLocation(lid), axis.getPeriod(pid));
		});

		var _getItemByMLP = function (m, l, p) {
			var h = mlpHash;
			h = (m.id in h) ? h[m.id] : {};
			h = (l.id in h) ? h[l.id] : {};
			h = (p.id in h) ? h[p.id] : null;
			return h;
		};

		var mlpCube = ms.map(function (m) {
			return ls.map(function (l) {
				return ps.map(function (p) {
					var nal = _getItemByMLP(m, l, p) ;
					if (nal === null) {
						nal = _createNAL(null, m, l, p);
					}
					return nal;
				});
			});
		});

		var _isM = function (e) {	return ms.indexOf(e) !== -1	};
		var _isL = function (e) {	return ls.indexOf(e) !== -1	};
		var _isP = function (e) {	return ps.indexOf(e) !== -1	};

		var _findE = function (isE, z, y, x) { return isE(z) && z || isE(y) && y || isE(x) && x || null };

		var _findM = function (z, y, x) { return _findE(_isM, z, y, x) };
		var _findL = function (z, y, x) { return _findE(_isL, z, y, x) };
		var _findP = function (z, y, x) { return _findE(_isP, z, y, x) };

		// TODO: skip some values
		mlpCube.getValue = function (z, y, x) {
			var m = _findM(z, y, x);
			var l = _findL(z, y, x);
			var p = _findP(z, y, x);

			if (!m || !l || !p) {
				throw 'Unknown axis';
			}

			var mi = ms.indexOf(m);
			var li = ls.indexOf(l);
			var pi = ps.indexOf(p);

			if (mi === -1 || li == -1 || pi == -1) {
				throw 'Unknown axis';
			}

			return mlpCube[mi][li][pi];
		};

		_notifyClient('load', mlpCube, axis);
	}

	function _onLoading(axis) {
		_notifyClient('loading', _createAxis(axis));
	}

	function _onNoData(axis) {
		_notifyClient('no-data', _createAxis(axis));
	}


	//
	// bixel object
	//

	var bixel = {
		invoke: function(messageType, opt) {
			return _server.send(messageType, opt);
		},
		on: function on(evtType, fn) {
			var evtList = _events[evtType] || (_events[evtType] = []);
			evtList.push(fn);
			return bixel;
		},
		// helpers
		init: function init(opt) {
			return this.invoke('INIT', opt);
		}
	};

	return bixel;
});
