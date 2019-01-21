"use strict";
exports.__esModule = true;
var rp = require("request-promise");
var ProxyRotator_1 = require("./ProxyRotator");
var NodeProxyPools = /** @class */ (function () {
    function NodeProxyPools(options) {
        if (options === void 0) { options = {}; }
        this.options = options;
        this.failCountLimit = 5;
        this.timeout = 5 * 1000;
        this.position = 0;
        this.fetchAllProxies();
    }
    NodeProxyPools.prototype.fetchAllProxies = function () {
        var _this = this;
        var pr = new ProxyRotator_1["default"](this.options['roOps']);
        this.proxyList = Promise.all([
            pr.fetchNewList()
        ]).then(function (lists) {
            var currentList = {};
            lists.forEach(function (list) {
                _this.mergeList(currentList, list);
            });
            return Object.keys(currentList).map(function (key) { return currentList[key]; });
        });
        return this.proxyList;
    };
    NodeProxyPools.prototype.mergeList = function (a, b) {
        b.forEach(function (bItem) {
            var key = bItem.proto + " " + bItem.ip + ' ' + bItem.port;
            if (!a[key])
                a[key] = bItem;
        });
    };
    NodeProxyPools.prototype.request = function (options) {
        var _this = this;
        return this.getReadyProxy().then(function (proxy) {
            var ops = Object.assign(options, {
                proxy: proxy.proto + '://' + proxy.ip + ":" + proxy.port,
                insecure: true,
                rejectUnauthorized: false,
                timeout: _this.timeout,
                headers: {
                    'User-Agent': proxy.randomUserAgent || ""
                }
            });
            return reqProm.call(_this, ops)["catch"](function (err) {
                var code = err.error.code;
                if (code === 'ECONNRESET' ||
                    code === 'ESOCKETTIMEDOUT' ||
                    code === 'EPROTO') {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                throw err;
            });
        });
        function reqProm(ops) {
            var _this = this;
            return new Promise(function (c, e) {
                var isTimedOut;
                var prom = Promise.resolve();
                var handle = setTimeout(function () {
                    isTimedOut = true;
                    prom['cancel'] && prom['cancel']();
                    e({
                        error: {
                            code: 'ESOCKETTIMEDOUT'
                        }
                    });
                }, _this.timeout);
                prom = rp(ops).then(function (res) {
                    clearTimeout(handle);
                    c(res);
                })["catch"](function (err) {
                    clearTimeout(handle);
                    e(err);
                });
            });
        }
    };
    NodeProxyPools.prototype.getReadyProxy = function () {
        var _this = this;
        return this.proxyList.then(function (pl) {
            if (_this.position >= pl.length)
                _this.position = 0;
            var item = pl[_this.position];
            if (!item)
                debugger;
            var tries = 0;
            while ((item.failCount || 0) > _this.failCountLimit) {
                _this.position++;
                if (_this.position >= pl.length)
                    _this.position = 0;
                item = pl[_this.position];
                if (tries > pl.length) {
                    _this.position = 0;
                    return _this.fetchAllProxies().then(_this.getReadyProxy.bind(_this));
                }
                tries++;
            }
            _this.position++;
            return item;
        });
    };
    return NodeProxyPools;
}());
exports.NodeProxyPools = NodeProxyPools;
