"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var axios_https_proxy_fix_1 = __importDefault(require("axios-https-proxy-fix"));
var bottleneck_1 = __importDefault(require("bottleneck"));
var ProxyRotator_1 = __importDefault(require("./ProxyRotator"));
var NodeProxyPools = /** @class */ (function () {
    function NodeProxyPools(options) {
        if (options === void 0) { options = {}; }
        this.failCountLimit = 5;
        this.proxyList = Promise.resolve([]);
        this.position = 0;
        this.options = Object.assign({}, {
            roOps: {
                apiKey: "",
                fetchProxies: 200
            },
            debug: false,
            failFn: function (inp) { return true; },
            //depends on options passed to request function
            passFn: function (resp) { return true; },
            maxConcurrent: 15,
            minTime: 100
        }, options);
        this.pr = new ProxyRotator_1.default(this.options['roOps']);
        this.timeout = options.maxTime || 5 * 1000;
        this.limiter = new bottleneck_1.default({
            maxConcurrent: options.maxConcurrent,
            minTime: options.minTime
        });
        this.fetchAllProxies();
    }
    NodeProxyPools.prototype.fetchAllProxies = function () {
        var _this = this;
        if (this.fetching)
            return this.proxyList;
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
        return this.getReadyProxy(this.proxyList).then(function (proxy) {
            var ops = Object.assign({}, options, {
                proxy: {
                    host: proxy.ip,
                    port: parseInt(proxy.port, 10)
                },
                headers: {
                    'User-Agent': proxy.randomUserAgent || ""
                }
            });
            return _this.scheduleProm.call(_this, ops)
                .then(function (resp) {
                if (_this.options.passFn && !_this.options.passFn(resp.data)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    if (_this.options.debug)
                        console.info('node-proy-pools:request success', 'proxy pass function failed');
                    return _this.request(options);
                }
                else if (ops['nppOps'] && ops['nppOps'].passFn && !ops['nppOps'].passFn(resp.data)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    if (_this.options.debug)
                        console.info('node-proy-pools:request success', 'options pass function failed');
                    return _this.request(options);
                }
                if (_this.options.debug)
                    console.info('node-proy-pools:request success');
                return resp;
            })
                .catch(function (err) {
                if (_this.options.debug)
                    console.info('node-proy-pools:request error', err.message, 'fail count', proxy.failCount);
                var code = err.code;
                if (code === 'ECONNRESET' ||
                    code === 'ESOCKETTIMEDOUT' ||
                    code === 'EPROTO' ||
                    code === 'ECONNREFUSED' ||
                    code === 'HPE_INVALID_CONSTANT' ||
                    code === 'EHOSTUNREACH' ||
                    code === 'ENETUNREACH' ||
                    code === 'ECONNABORTED' ||
                    code === 'SELF_SIGNED_CERT_IN_CHAIN') {
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
                else if (ops['nppOps'] && ops['nppOps'].failFn && !ops['nppOps'].failFn(err)) {
                    (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
                    return _this.request(options);
                }
                throw err;
            });
        });
    };
    NodeProxyPools.prototype.scheduleProm = function (ops) {
        return this.limiter.schedule(this.reqProm.bind(this, ops));
    };
    NodeProxyPools.prototype.reqProm = function (ops) {
        var _this = this;
        return new Promise(function (c, e) {
            var prom;
            var CancelToken = axios_https_proxy_fix_1.default.CancelToken;
            var source = CancelToken.source();
            var handle = setTimeout(function () {
                source.cancel();
                e({ code: 'ESOCKETTIMEDOUT', message: 'ESOCKETTIMEDOUT' });
            }, _this.timeout);
            return axios_https_proxy_fix_1.default(ops)
                .then(function (res) {
                clearTimeout(handle);
                c(res);
            }).catch(function (err) {
                clearTimeout(handle);
                e(err);
            });
        });
    };
    /**
     * takes in the current global proxy list promise
     * returns a promise that waits until a valid proxy is found
     * or errors because it cant find a valid proxy
     * @param {Promise<any[]>} currentGlobalProxyList
     * @returns {Promise<any>}
     */
    NodeProxyPools.prototype.getReadyProxy = function (currentGlobalProxyList) {
        var _this = this;
        return new Promise(function (c) {
            recurseUntilValidProxy.call(_this, 0, currentGlobalProxyList)
                .then(c);
        });
        //fetchProxyRetryCurrent the amount of times to fetch new proxies before
        function recurseUntilValidProxy(fetchProxyRetryCurrent, proxyList) {
            var _this = this;
            //if we tried to fetch 20 proxy lists and none were successful, then quit, there is a serious error
            if (fetchProxyRetryCurrent > 20)
                throw new Error('no proxy list fetches returned valid proxies');
            return proxyList.then(function (proxyList) {
                try {
                    return findFirstValidProxy.call(_this, proxyList, _this.failCountLimit);
                }
                catch (e) {
                    return recurseUntilValidProxy.call(_this, ++fetchProxyRetryCurrent, _this.fetchAllProxies());
                }
            });
        }
        function findFirstValidProxy(proxyList, failLimit) {
            var loopCounter = 0;
            while (loopCounter < proxyList.length) {
                var prox = nextProxy.call(this, proxyList);
                var failCount = prox.failCount || 0;
                if (failCount < failLimit)
                    return prox;
                loopCounter++;
            }
            throw new Error("no more vaild proxies");
        }
        function nextProxy(proxyList) {
            var position = nextPosition.call(this, proxyList.length);
            return proxyList[position];
        }
        function nextPosition(max) {
            if (this.position >= max)
                this.position = -1;
            return this.position++;
        }
    };
    return NodeProxyPools;
}());
exports.NodeProxyPools = NodeProxyPools;
