

export default class Luminati {
    private options;

    constructor(options) {
        this.options = Object.assign({}, {
            fetchProxies: 200,
            debug: false,

            username: '',
            password: '',
            port: 0
        }, options)
    }

    fetchNewList(){
        let list = [] as any;
        for(let i = 0; i < this.options.fetchProxies; ++i){
            let session_id = Math.floor((1000000 * Math.random()));

            list.push({
                host: 'zproxy.lum-superproxy.io',
                port: this.options.port,
                auth: {
                    username: this.options.username+'-session-'+session_id,
                    password: this.options.password
                }
            });
        };

        return Promise.resolve(list);
    }
}