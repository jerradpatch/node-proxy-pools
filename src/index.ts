import Axios from 'axios-https-proxy-fix';

import Bottleneck from "bottleneck";
import ProxyRotator from './ProxyRotator';
import Luminati from './Luminati';

export class NodeProxyPools {

  private failCountLimit = 5;
  private timeout;
  private proxyList: Promise<any[]> = Promise.resolve([]);

  private limiter;
  private options: any;

  pr;
  lum;

  constructor(options: {
    roOps?: {
      apiKey: string,
      fetchProxies: number,
      debug?: boolean
    },
    luOps?: {
      username: string,
      password: string,
      port: number
    },
    debug?: boolean,
    failFn?: (inp: any) => boolean,
    passFn?: (inp: any) => boolean,
    maxConcurrent?: number,
    minTime?: number,
    maxTime?: number
  } = {} as any) {

    this.options = Object.assign({}, {
        debug: false,
        failFn: (inp) => true,
        //depends on options passed to request function
        passFn: (resp) => true,
        maxConcurrent: 15,
        minTime: 100,
        maxTime: 5 * 1000
      },
      options);


    if(this.options['roOps'])
      this.pr = new ProxyRotator(this.options['roOps']);
    if(this.options['luOps'])
      this.lum = new Luminati(this.options['luOps']);

    this.limiter = new Bottleneck({
      maxConcurrent: options.maxConcurrent,
      minTime: options.minTime
    });
    this.fetchAllProxies();
  }

  private fetching;

  fetchAllProxies() {
    if (this.fetching)
      return this.proxyList;
    this.fetching = true;

    let fetchList = [] as any[];

    if(this.pr)
      fetchList.push(this.pr.fetchNewList());
    if(this.lum)
      fetchList.push(this.lum.fetchNewList());

    this.proxyList = Promise.all(fetchList)
        .then((lists: any) => {

      let list: any = [].concat(...lists);
      // let filteredList = list.filter(al=>!!al);
      // let currentList = {};
      // this.mergeList(currentList, filteredList);

      this.fetching = false;
      //return Object.keys(currentList).map(key => currentList[key]);
      return list;
    });
    return this.proxyList;
  }

  private mergeList(a: { [protIpPort: string]: any }, b: { proto: string, ip: string, port: number }[]) {
    b.forEach((bItem) => {
      let key = bItem.proto + " " + bItem.ip + ' ' + bItem.port;
      if (!a[key])
        a[key] = bItem;
    })
  }

  request(options): Promise<any> {
    if (typeof options !== 'object' || !options)
      throw new Error('the input to the request function should have been an object type');

    if(this.options.debug && !options['stats'])
      options['stats'] = {};

    return this.getReadyProxy(this.proxyList).then(proxy => {
      let ops = Object.assign({}, options, {
        proxy,
        headers: {
          'User-Agent': proxy.randomUserAgent || ""
        }
      });

      return this.scheduleProm.call(this, ops)
        .then(resp => {
          if (this.options.passFn && !this.options.passFn(resp.data)) {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);

            if(this.options.debug)
              console.info('node-proy-pools:request success', 'proxy pass function failed');

            return this.request(ops);

          } else if (ops['nppOps'] && ops['nppOps'].passFn && !ops['nppOps'].passFn(resp.data)) {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);

            if(this.options.debug)
              console.info('node-proy-pools:request success', 'options pass function failed');

            return this.request(ops);
          }
          if(this.options.debug)
            console.info('node-proy-pools:request success');

          return resp;
        })
        .catch((err) => {
          if(this.options.debug)
            console.info('node-proy-pools:request error', err.message, 'fail count', proxy.failCount);

          let code = err.code;
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
            return this.request(ops);

          } else if (err.statusCode === 403 && (
            err.error.indexOf('https://block.opendns.com/') !== -1 ||
            err.error.indexOf('This site has been blocked by the network administrator.') !== -1)) {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(ops);

          } else if (this.options.failFn && !this.options.failFn(err)) {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(ops);

          } else if (ops['nppOps'] && ops['nppOps'].failFn && !ops['nppOps'].failFn(err)) {
            (proxy.failCount ? proxy.failCount++ : proxy.failCount = 1);
            return this.request(ops);
          }

          throw err;
        })
    });
  }

  private scheduleProm(ops) {
    return this.limiter.schedule(this.reqProm.bind(this, ops))
  }

  kk = 0;

  private reqProm(ops) {
    return new Promise((c, e) => {
      let prom, requestTime;

      const CancelToken = Axios.CancelToken;
      const source = CancelToken.source();

      ops.cancelToken = source.token;

      let handle = setTimeout(() => {
        source.cancel("ESOCKETTIMEDOUT");
        e({code: 'ESOCKETTIMEDOUT', message: 'ESOCKETTIMEDOUT'})
      }, this.options.maxTime);

      if(this.options.debug && !ops.stats.requestStart) {
        ops.stats.requestStart = Date.now();
      }

      return Axios(ops)
        .then((res) => {
          clearTimeout(handle);
          setStopTime.call(this);
          c(res);
        }).catch(err => {
          clearTimeout(handle);
          setStopTime.call(this);
          e(err);
        });
    })

    function setStopTime(){
      if(this.options.debug)
        ops.stats.requestStop = Date.now();
    }
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

    return new Promise((c) => {
      recurseUntilValidProxy.call(this, 0, currentGlobalProxyList)
        .then(c);
    });

    //fetchProxyRetryCurrent the amount of times to fetch new proxies before
    function recurseUntilValidProxy(fetchProxyRetryCurrent: number, proxyList: Promise<any[]>) {
      //if we tried to fetch 20 proxy lists and none were successful, then quit, there is a serious error
      if (fetchProxyRetryCurrent > 20)
        throw new Error('no proxy list fetches returned valid proxies');

      return proxyList.then((proxyList: any[]) => {
        try {
          return findFirstValidProxy.call(this, proxyList, this.failCountLimit);
        } catch (e) {

          return recurseUntilValidProxy.call(this, ++fetchProxyRetryCurrent, this.fetchAllProxies());
        }
      });
    }

    function findFirstValidProxy(proxyList: { failCount: number }[], failLimit: number) {
      let loopCounter = 0;
      while (loopCounter < proxyList.length) {
        let prox = nextProxy.call(this, proxyList);
        let failCount = prox.failCount || 0;
        if (failCount < failLimit)
          return prox;

        loopCounter++;
      }
      throw new Error("no more vaild proxies");
    }

    function nextProxy(proxyList: { failCount: number }[]): { failCount: number } {
      let position = nextPosition.call(this, proxyList.length);
      return proxyList[position];
    }

    function nextPosition(max): number {
      if (this.position >= max)
        this.position = -1;
      return this.position++;
    }
  }

}