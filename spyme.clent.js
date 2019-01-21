"use strict";
exports.__esModule = true;
var rp = require("request-promise");
var rxjs_1 = require("rxjs");
var operators_1 = require("rxjs/operators");
var SpymeClient = /** @class */ (function () {
    function SpymeClient() {
        var _this = this;
        this.$ipList = rxjs_1.timer(0, 25 * 60 * 60 * 1000).pipe(operators_1.mergeMap(function () {
            return rp({
                url: "http://spys.me/proxy.txt"
            }).then(_this.parse.bind(_this));
        }));
    }
    SpymeClient.prototype.parse = function (data) {
        return data
            .split(/\n|\r\n/)
            .slice(3, data.length - 2)
            .filter(function (val) { return !!val; })
            .map(function (item) {
            var _a = item.split(" "), ipPort = _a[0], meta = _a[1], googPassed = _a[2];
            var _b = ipPort.split(":"), ip = _b[0], port = _b[1];
            var _c = meta.split("-"), country = _c[0], anon = _c[1], sslSupport = _c[2];
            var tested = googPassed === '+';
            var ssl = (sslSupport || "").indexOf('S') !== -1;
            return {
                ip: ip,
                port: +port,
                country: country,
                anon: anon,
                ssl: ssl,
                tested: tested,
                proto: 'http'
            };
        });
    };
    SpymeClient.prototype.getList = function () {
        return this.$ipList.pipe(operators_1.share());
    };
    return SpymeClient;
}());
exports.SpymeClient = SpymeClient;
