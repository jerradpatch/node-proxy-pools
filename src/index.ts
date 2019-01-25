
var rp = require('request-promise');
import ProxyRotator from './ProxyRotator';

export class NodeProxyPools {

  private failCountLimit = 5;
  private timeout = 5 * 1000;
  private proxyList: Promise<any[]>;

  pr = new ProxyRotator(this.options['roOps']);

  constructor(private options = {}){
    this.proxyList = this.fetchAllProxies();
  }

  fetchAllProxies(){
    this.proxyList = Promise.all([
      this.pr.fetchNewList()
    ]).then((lists: any[][])=>{
      let currentList = {};
      lists.forEach(list=>{
        this.mergeList(currentList, list);
      });
      return Object.keys(currentList).map(key=> currentList[key]);
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
    let thiss = this;
    return this.getReadyProxy().then(proxy=> {

      let ops = Object.assign(options, {
        proxy: proxy.proto+ '://' + proxy.ip + ":" + proxy.port,
        insecure: true,
        rejectUnauthorized: false,
        timeout: this.timeout,
        headers: {
          'User-Agent': proxy.randomUserAgent || ""
        }
      });

      return reqProm.call(this, ops)
        .catch((err) => {
          if(!err.error)
            debugger;
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
          }
          throw err;
        })
      })

    function reqProm(ops){
      return new Promise((c, e)=>{
        let isTimedOut;
        let prom;

        let handle = setTimeout(()=> {
          isTimedOut = true;
          prom && prom['cancel'] && prom['cancel']();
          e({
            error: {
              code: 'ESOCKETTIMEDOUT'
          }})
        }, thiss['timeout']);

        prom = rp(ops).then((res)=>{
          clearTimeout(handle);
          c(res);
          return null;
        }).catch(err=>{
          clearTimeout(handle);
          e(err);
          return null;
        });
        return null;
      })
    }
  }

  position = 0;
  private getReadyProxy(): Promise<any> {
    return this.proxyList.then((pl: any[])=>{
        if(this.position >= pl.length )
          this.position = 0;

        let item = pl[this.position];

        let tries = 0;
        while((item.failCount || 0) > this.failCountLimit) {
          this.position++;
          if(this.position >= pl.length )
            this.position = 0;

          item = pl[this.position];
          if(tries > pl.length) {
            this.position = 0;
            return this.fetchAllProxies().then(this.getReadyProxy.bind(this))
          }

          tries++;
        }

        this.position++;
        return item;
      })
  }

}