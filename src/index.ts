
var rp = require('request-promise');
import ProxyRotator from './ProxyRotator';

export class NodeProxyPools {

  private failCountLimit = 5;
  private timeout = 5 * 1000;
  private proxyList: Promise<any[]> = Promise.resolve([]);

  pr = new ProxyRotator(this.options['roOps']);

  constructor(private options: {
    roOps: {
      apiKey: string,
      fetchProxies: number,
      debug?: boolean
    }
    failFn?: (inp: any)=>boolean,
    passFn?: (inp: any)=>boolean
  } = {
    roOps: {
      apiKey: "",
      fetchProxies: 200
    },
    failFn: (inp)=>false,
    //depends on options passed to request function
    passFn: (resp)=>false
  }){
    this.fetchAllProxies();
  }

  private fetching;

  fetchAllProxies(){
    if(this.fetching)
      return this.proxyList;

    this.fetching = true;

    this.proxyList = Promise.all([
      this.pr.fetchNewList()
    ]).then((lists: any[][]) => {
      let currentList = {};
      lists.forEach(list => {
        this.mergeList(currentList, list);
      });

      this.fetching = false;
      return Object.keys(currentList).map(key => currentList[key]);
    });
    return this.proxyList;
  }

  private mergeList(a: {[protIpPort: string]: any}, b: {proto: string, ip: string, port: number}[]) {
    b.forEach((bItem)=>{
      let key = bItem.proto+" "+bItem.ip+' '+bItem.port;
      if(!a[key])
        a[key] = bItem;
    })
  }

  request(options): Promise<any> {
    if (typeof options !== 'object' || options === null)
      throw new Error('the input to the request function should have been an object type');


    return this.getReadyProxy(this.proxyList).then(proxy=> {

      let ops = Object.assign({}, options, {
        proxy: proxy.proto+ '://' + proxy.ip + ":" + proxy.port,
        insecure: true,
        rejectUnauthorized: false,
        timeout: this.timeout,
        headers: {
          'User-Agent': proxy.randomUserAgent || ""
        }
      });

      return this.reqProm.call(this, ops)
        .then(resp=>{
          if(this.options.passFn && !this.options.passFn(resp)) {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(options);

          } else if(ops['nppOps'] && ops['nppOps'].passFn && !ops['nppOps'].passFn(resp)){
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(options);
          }
          return resp;
        })
        .catch((err) => {

          let code = err.error.code;
          if(code === 'ECONNRESET' ||
            code === 'ESOCKETTIMEDOUT' ||
            code === 'EPROTO' ||
            code === 'ECONNREFUSED' ||
            code === 'HPE_INVALID_CONSTANT') {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(options);

          } else if(err.statusCode === 403 && (
            err.error.indexOf('https://block.opendns.com/') !== -1 ||
            err.error.indexOf('This site has been blocked by the network administrator.') !== -1)) {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(options);

          } else if(this.options.failFn && !this.options.failFn(err)){
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(options);

          } else if(ops['nppOps'] && ops['nppOps'].failFn && !ops['nppOps'].failFn(err)){
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(options);
          }

          console.log('req error', err)
          throw err;
        })
      });
  }

  private reqProm(ops){
    return new Promise((c, e)=>{
      let prom;

      let handle = setTimeout(()=> {
        prom && prom['cancel'] && prom['cancel']();
        e({
          error: {
            code: 'ESOCKETTIMEDOUT'
          }})
      }, this['timeout']);

      try {
        prom = rp(ops).then((res) => {
          clearTimeout(handle);
          c(res);
        }).catch(err => {
          clearTimeout(handle);
          e(err);
        });
      } catch (err) {
        clearTimeout(handle);
        e(err);
      }
    })
  }

  position = 0;

  /**
   * takes in the current global proxy list promise
   * returns a promise that waits until a valid proxy is found
   * or errors because it cant find a valid proxy
   * @param {Promise<any[]>} currentGlobalProxyList
   * @returns {Promise<any>}
   */
  private getReadyProxy(currentGlobalProxyList: Promise<any[]>): Promise<any> {

    return new Promise((c)=> {
      recurseUntilValidProxy.call(this,0, currentGlobalProxyList)
        .then(c);
    });

    //fetchProxyRetryCurrent the amount of times to fetch new proxies before
    function recurseUntilValidProxy(fetchProxyRetryCurrent: number, proxyList: Promise<any[]>) {
      //if we tried to fetch 20 proxy lists and none were successful, then quit, there is a serious error
      if(fetchProxyRetryCurrent > 20)
        throw new Error('no proxy list fetches returned valid proxies');

      return proxyList.then((proxyList: any[]) => {
        try {
          return findFirstValidProxy.call(this, proxyList, this.failCountLimit);
        } catch (e) {

          return recurseUntilValidProxy.call(this, ++fetchProxyRetryCurrent, this.fetchAllProxies());
        }
      });
    }

    function findFirstValidProxy(proxyList: {failCount: number}[], failLimit: number){
      let loopCounter = 0;
      while(loopCounter < proxyList.length) {
        let prox = nextProxy.call(this, proxyList);
        let failCount = prox.failCount || 0;
        if(failCount < failLimit)
          return prox;

        loopCounter++;
      }
      throw new Error("no more vaild proxies");
    }
    function nextProxy(proxyList: {failCount: number}[]): {failCount: number} {
      let position = nextPosition.call(this, proxyList.length);
      return proxyList[position];
    }
    function nextPosition(max): number {
      if(this.position >= max )
        this.position = -1;
      return this.position++;
    }
  }

}