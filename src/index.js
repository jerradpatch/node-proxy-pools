"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var rp = require('request-promise');
var ProxyRotator_1 = __importDefault(require("./ProxyRotator"));
var NodeProxyPools = /** @class */ (function () {
    function NodeProxyPools(options) {
        if (options === void 0) { options = {
            roOps: {
                apiKey: ""
            },
            failFn: function (inp) { return false; },
            //depends on options passed to request function
            passFn: function (resp) { return false; }
        }; }
        this.options = options;
        this.failCountLimit = 5;
        this.timeout = 5 * 1000;
        this.proxyList = Promise.resolve([]);
        this.pr = new ProxyRotator_1.default(this.options['roOps']);
        this.position = 0;
        this.fetchAllProxies();
    }
    NodeProxyPools.prototype.fetchAllProxies = function () {
        var _this = this;
        if (this.fetching)
            return this.proxyList;
        else {
            this.fetching = true;
            this.proxyList = Promise.all([
                this.pr.fetchNewList()
            ]).then(function (lists) {
                var currentList = {};
                lists.forEach(function (list) {
                    _this.mergeList(currentList, list);
                });
                _this.fetching = false;
                return Object.keys(currentList).map(function (key) { return currentList[key]; });
            });
            return this.proxyList;
        }
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
        if (typeof options !== 'object' || options === null)
            throw new Error('the input to the request function should have been an object type');
        var thiss = this;
        return this.getReadyProxy().then(function (proxy) {
            var ops = Object.assign({}, options, {
                proxy: proxy.proto + '://' + proxy.ip + ":" + proxy.port,
                insecure: true,
                rejectUnauthorized: false,
                timeout: _this.timeout,
                headers: {
                    'User-Agent': proxy.randomUserAgent || ""
                }
            });
            return reqProm.call(_this, ops)
                .then(function (resp) {
                if (_this.options.passFn && !_this.options.passFn(resp)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                else if (ops.nppOps && ops.nppOps.passFn && !ops.nppOps.passFn(resp)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                return resp;
            })
                .catch(function (err) {
                var code = err.error.code;
                if (code === 'ECONNRESET' ||
                    code === 'ESOCKETTIMEDOUT' ||
                    code === 'EPROTO' ||
                    code === 'ECONNREFUSED' ||
                    code === 'HPE_INVALID_CONSTANT') {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                else if (err.statusCode === 403 && (err.error.indexOf('https://block.opendns.com/') !== -1 ||
                    err.error.indexOf('This site has been blocked by the network administrator.') !== -1)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                else if (_this.options.failFn && !_this.options.failFn(err)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                else if (ops.nppOps && ops.nppOps.failFn && !ops.nppOps.failFn(err)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                throw err;
            });
        });
        function reqProm(ops) {
            return new Promise(function (c, e) {
                var prom;
                var handle = setTimeout(function () {
                    prom && prom['cancel'] && prom['cancel']();
                    e({
                        error: {
                            code: 'ESOCKETTIMEDOUT'
                        }
                    });
                }, thiss['timeout']);
                prom = rp(ops).then(function (res) {
                    clearTimeout(handle);
                    c(res);
                }).catch(function (err) {
                    clearTimeout(handle);
                    e(err);
                });
                return null;
            });
        }
    };
    NodeProxyPools.prototype.getReadyProxy = function () {
        var _this = this;
        return this.proxyList.then(function (pl) {
            if (_this.position >= pl.length)
                _this.position = 0;
            var item = pl[_this.position];
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
