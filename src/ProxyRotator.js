"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var axios_1 = __importDefault(require("axios"));
var bottleneck_1 = __importDefault(require("bottleneck"));
var ProxyRotator = /** @class */ (function () {
    function ProxyRotator(ops) {
        this.ops = ops;
        this.url = "http://falcon.proxyrotator.com:51337/?apiKey=" + this.ops.apiKey + "&get=true&userAgent=true";
        this.ops = Object.assign({ apiKey: "", fetchProxies: 200, threads: 10, debug: false }, ops);
        this.limiter = new bottleneck_1.default({
            maxConcurrent: ops.threads,
            minTime: 100
        });
    }
    ProxyRotator.prototype.fetchNewList = function () {
        var retryCount = 0;
        if (this.ops.debug)
            console.info("fetching ProxyRotator");
        var fetchProms = [];
        for (var i = 0; i < this.ops.fetchProxies; i++) {
            var reqA = reqLimit.call(this, this.url)
                .then(this.formatData);
            fetchProms.push(reqA);
        }
        return (this.ops.debug ?
            Promise.all(fetchProms).then(function (re) {
                console.info("completed ProxyRotator");
                return re;
            }) :
            Promise.all(fetchProms));
        function reqLimit(url) {
            var _this = this;
            return this.limiter.schedule(request.bind(this, url))
                .catch(function (e) {
                if (_this.ops.debug)
                    console.info("ProxyRotator, request error", e.message);
                if (e.response && e.response.data) {
                    if (e.response.data.error) {
                        //should never be reached due to bottle neck js
                        // if(e.response.data.error === "Concurrent requests limit reached")
                        throw e;
                    }
                }
                if (retryCount < 10) {
                    retryCount++;
                    return reqLimit.call(_this, url);
                }
                return null;
            });
        }
        function request(url) {
            return axios_1.default({
                url: url
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
    };
    ProxyRotator.prototype.formatData = function (data) {
        if (!data)
            return data;
        var port;
        try {
            port = parseInt(data.port, 10);
        }
        catch (e) {
            port = 0;
        }
        return {
            host: data.ip || "",
            port: port
        };
    };
    return ProxyRotator;
}());
exports.default = ProxyRotator;
