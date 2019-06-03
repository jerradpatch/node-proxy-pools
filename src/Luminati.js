"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Luminati = /** @class */ (function () {
    function Luminati(options) {
        this.options = Object.assign({}, {
            fetchProxies: 200,
            debug: false,
            username: '',
            password: '',
            port: 0
        }, options);
    }
    Luminati.prototype.fetchNewList = function () {
        var list = [];
        for (var i = 0; i < this.options.fetchProxies; ++i) {
            var session_id = Math.floor((1000000 * Math.random()));
            list.push({
                host: 'zproxy.lum-superproxy.io',
                port: this.options.port,
                auth: {
                    username: this.options.username + '-session-' + session_id,
                    password: this.options.password
                }
            });
        }
        ;
        return Promise.resolve(list);
    };
    return Luminati;
}());
exports.default = Luminati;
