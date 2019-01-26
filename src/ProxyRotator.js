"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var rxjs_1 = require("rxjs");
var operators_1 = require("rxjs/operators");
var rp = require('request-promise');
var ProxyRotator = /** @class */ (function () {
    function ProxyRotator(ops) {
        this.ops = ops;
        this.url = "http://falcon.proxyrotator.com:51337/?apiKey=" + this.ops.apiKey + "&get=true&userAgent=true";
        this.ops = Object.assign({ apiKey: "", fetchProxies: 200, threads: 10, debug: false }, ops);
    }
    ProxyRotator.prototype.fetchNewList = function () {
        var _this = this;
        if (this.ops.debug)
            console.log("fetching ProxyRotator");
        return rxjs_1.range(0, (this.ops.fetchProxies / this.ops.threads)).pipe(operators_1.concatMap(function () {
            return rxjs_1.range(0, _this.ops.threads).pipe(operators_1.mergeMap(function () {
                return request(_this.url)
                    .then(function (obj) {
                    obj.proto = "http";
                    return obj;
                });
            }), operators_1.tap(function () {
                if (_this.ops.debug)
                    console.log("ProxyRotator fetched more\"+ " + _this.ops.threads + " of " + _this.ops.fetchProxies);
            }));
        }), operators_1.toArray()).toPromise();
        function request(url) {
            return fromProrp({
                url: url,
                json: true
            })
            .then(function (resp) {
                if (resp.error)
                    return request(url);
                return resp;
            });
        }
    };
    return ProxyRotator;
}());
exports.default = ProxyRotator;
