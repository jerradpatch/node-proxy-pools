"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var rxjs_1 = require("rxjs");
var operators_1 = require("rxjs/operators");
var axios_1 = __importDefault(require("axios"));
var ProxyRotator = /** @class */ (function () {
    function ProxyRotator(ops) {
        this.ops = ops;
        this.url = "http://falcon.proxyrotator.com:51337/?apiKey=" + this.ops.apiKey + "&get=true&userAgent=true";
        this.ops = Object.assign({ apiKey: "", fetchProxies: 200, threads: 10, debug: false }, ops);
    }
    ProxyRotator.prototype.fetchNewList = function () {
        var _this = this;
        var retryCount = 0;
        if (this.ops.debug)
            console.log("fetching ProxyRotator");
        return rxjs_1.range(0, (this.ops.fetchProxies / this.ops.threads)).pipe(operators_1.concatMap(function () {
            return rxjs_1.range(0, _this.ops.threads).pipe(operators_1.mergeMap(function () {
                try {
                    return request(_this.url)
                        .then(function (obj) {
                        obj['proto'] = "http";
                        return obj;
                    }).catch(function (e) {
                        console.log('pr error', e.message);
                        return null;
                    });
                }
                catch (e) {
                    return null;
                }
            }), operators_1.tap(function () {
                if (_this.ops.debug)
                    console.log("ProxyRotator fetched 1 more of " + _this.ops.threads);
            }), operators_1.toArray(), operators_1.map(function (proxies) {
                //filter the null values
                return proxies.filter(function (prox) { return !!prox; });
            }));
        }), operators_1.tap(function () {
            if (_this.ops.debug)
                console.log("ProxyRotator fetched " + _this.ops.threads + " more of " + _this.ops.fetchProxies);
        }), operators_1.toArray(), operators_1.map(function (twoDArr) {
            return [].concat.apply([], twoDArr);
        })).toPromise();
        function request(url) {
            try {
                return axios_1.default({
                    url: url
                })
                    .catch(function (e) {
                    if (retryCount < 10) {
                        retryCount++;
                        return new Promise(function (c, e) {
                            setTimeout(function () {
                                return request(url)
                                    .then(c)
                                    .catch(e);
                            }, 1000);
                        });
                    }
                    throw e;
                })
                    .then(function (resp) {
                    if (!resp.data)
                        throw new Error('no data in the return from proxy rotator');
                    if (resp.data.error) {
                        throw new Error(resp.data.error);
                    }
                    return resp.data;
                });
            }
            catch (e) {
                throw e;
            }
        }
    };
    return ProxyRotator;
}());
exports.default = ProxyRotator;
