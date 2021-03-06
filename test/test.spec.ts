import * as chai from 'chai';
import chaiHttp = require('chai-http');
import 'mocha';
import {NodeProxyPools} from "../src/index";
import {concatMap, mergeMap, take, toArray} from "rxjs/operators";
import {range} from "rxjs";
import ProxyRotator from "../src/ProxyRotator";
import Luminati from "../src/Luminati";
import * as loadJsonFile from 'load-json-file';
// import * as random_useragent from 'random-useragent';

declare var Promise;

chai.use(chaiHttp);
const expect = chai.expect;

let confJson = loadJsonFile.sync('config.json') as any;
let roApiKey = confJson.proxyRotatorApiKey;

let url = 'https://pusher.com';

describe('All features should work', () => {

  describe('Compare Proxies', () => {
/*
    it('a single request should pass', function (done) {

      let passFn = function(data){
        return data.indexOf('Pusher | Leader In Realtime Technologies') !== -1;
      }
      let failFn = function(){
        return false;
      }

      let lumNpl = new NodeProxyPools({
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj),
        debug: false,
        passFn,
        failFn
      });

      let prNpl = new NodeProxyPools({
        roOps: {apiKey: roApiKey, fetchProxies: 30},
        debug: true,
        passFn,
        failFn
      });

      let roReq = [] as any;
      let luReq = [] as any;

      Promise.all([prNpl['proxyList'], lumNpl['proxyList']]).then(()=>{
        for(let i = 0; i < 100; ++i){
          roReq.push(prNpl.request({url}));
          luReq.push(lumNpl.request({url}));
        }

        let startTime = Date.now();
        Promise.all(roReq).then(()=>{
          console.log('proxy rotator finish time', Math.floor((Date.now() - startTime) / 1000))
        })

        Promise.all(luReq).then(()=>{
          console.log('luminati finish time', Math.floor((Date.now() - startTime) / 1000))
        })

        Promise.all([].concat(roReq, luReq)).then(()=>{
          done();
        })
      });
    })
    */
  });

  describe('ProxyRotator tests', () => {
    it('fetchNewList should return a new list every time', function (done) {
      this.timeout(30 * 1000);

      let pr = new ProxyRotator({apiKey: roApiKey, debug: true, fetchProxies: 30});
      range(0, 3).pipe(
        concatMap(() => {
          return pr.fetchNewList()
        }),
        toArray(),
        take(1))
        .subscribe(lists => {
          expect(lists).to.have.length(3);
          done();
        })
    })
  });

  describe('Luminati tests', () => {
    it('fetchNewList should return a new list every time', function (done) {
      this.timeout(30 * 1000);

      // @ts-ignore
      let luConfig = Object.assign({fetchProxies: 30}, confJson.luminatiObj)
      let lum = new Luminati(luConfig);
      range(0, 3).pipe(
          concatMap(() => {
            return lum.fetchNewList()
          }),
          toArray(),
          take(1))
          .subscribe(lists => {
            expect(lists).to.have.length(3);
            done();
          })
    })

    it('a single request should pass', function (done) {
      let npl = new NodeProxyPools({
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj),
        debug: true
      });

      npl.request({
        method: 'GET',
        url
      }).then((list) => {
        expect(list.status).to.equal(200);
        done();
      })
    })
  });
  
  describe('The proxies work as expected, actual', () => {
    it('when starting up it should return a list of proxies', (done) => {
      let npl = new NodeProxyPools({
       // roOps: {apiKey: roApiKey, debug: true, fetchProxies: 30},
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj)
      });
      npl.fetchAllProxies().then((list) => {
        expect(list.length).to.be.gt(0);
        done();
      })
    })

    it('when there is a large pool size there fetch rate should not be exceeded', (done) => {
      let npl = new NodeProxyPools({
     //   roOps: {apiKey: roApiKey, debug: true, fetchProxies: 300},
        luOps: Object['assign']({fetchProxies: 300}, confJson.luminatiObj),
        debug: true,
        failFn() {
          return false
        }
      });

      range(0, 2).pipe(
        mergeMap(() => npl.request({
          gzip: true,
          method: 'GET',
          url,
          timeout: 30 * 1000,
          maxRedirects: '10',
          followRedirect: true,
          rejectUnauthorized: false,
          insecure: true,
          headers: {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) snap Chromium/71.0.3578.98 Chrome/71.0.3578.98 Safari/537.36'
          }
        })),
        toArray())
        .subscribe((arr) => {
          expect(arr).to.have.lengthOf(2);
          done();
        }, err =>
          done(new Error(err)))
    })

    it('when all proxies have been invalidated new proxies should be fetched', function (done) {
      this.timeout(30 * 1000)
      let npl = new NodeProxyPools({
      //  roOps: {apiKey: roApiKey, debug: true, fetchProxies: 30}, debug: true,
        luOps: Object['assign']({fetchProxies: 1000}, confJson.luminatiObj),
        failFn() {
          return false
        }
      });

      npl['proxyList'].then((list) => {
        invalidateAllProxies(list, npl['failCountLimit']);

        range(0, 3).pipe(
          concatMap(() => {
            //request and invalidate
            return npl['proxyList'].then((list) => {

              invalidateAllProxies(list, npl['failCountLimit']);

              return npl.request({
                gzip: true,
                method: 'GET',
                url,
                timeout: 30 * 1000,
                maxRedirects: '10',
                followRedirect: true,
                rejectUnauthorized: false,
                insecure: true,
                headers: {
                  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) snap Chromium/71.0.3578.98 Chrome/71.0.3578.98 Safari/537.36'
                }
              })
            })
          }),
          toArray())
          .subscribe(() => {
            done();
          });
      })

      function invalidateAllProxies(proxyList, limit) {
        proxyList.forEach(proxy => {
          proxy.failCount = limit + 1;
        })
      }
    })

    it('getReadyProxy should return a single proxy', (done) => {
      let npl = new NodeProxyPools({
        roOps: {apiKey: roApiKey, fetchProxies: 30},
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj),
      });
      npl['getReadyProxy'](npl['proxyList']).then((prox) => {
        expect(prox).to.not.be.undefined;
        done();
      })
    })

    //seq test
    // it('getReadyProxy should return different proxy every time', (done) => {
    //   let npl = new NodeProxyPools({roOps: {apiKey: roApiKey, fetchProxies: 30}});
    //   let proms: any[] = [];
    //   for (let i = 0; i < 20; i++) {
    //     proms.push(npl['getReadyProxy'](npl['proxyList']));
    //   }
    //   Promise.all(proms).then((proms) => {
    //     let distinct = proms.reduce((acc, c) => {
    //       acc[c.proto + " " + c.ip + " " + c.port] = null;
    //       return acc;
    //     }, {});
    //     expect(Object.keys(distinct)).to.have.length(20);
    //     done();
    //   })
    // })
  })

  describe('The request function', () => {
/*
    it('requests should all be made with a different ip address', (done) => {
      let npl = new NodeProxyPools({roOps: {apiKey: roApiKey, fetchProxies: 100, debug: true}, debug: true});
      let ipPRoms: any[] = [];
      for (let i = 0; i < 20; ++i) {
        ipPRoms.push(npl.request({
          url
        }).then(resp => {
          console.log('ret', i);
          return i;
        }).catch(e => {
          console.log(e.message)
          return null;
        }));
      }
      Promise.all(ipPRoms).then(ips => {
        let unq = ips.reduce((acc, c) => {
          acc[c] = null;
          return acc;
        }, {});

        expect(Object.keys(unq)).to.have.lengthOf.gt(10);
        done();

      });
    });
*/

    it('requests should all be made in parallel', (done) => {
      let npl = new NodeProxyPools({
//        roOps: {apiKey: roApiKey, fetchProxies: 100, debug: false},
        luOps: Object['assign']({fetchProxies: 100}, confJson.luminatiObj),
        minTime: 0, debug: true});
      let ipPRoms: any[] = [];
      let ops = [] as any;
      let numReq = 30;

      for (let i = 0; i < numReq; ++i) {
        let op = {url};
        ops.push(op);
        ipPRoms.push(npl.request(op).catch(e=>{}))
      }

      Promise.all(ipPRoms).then(ips => {

        ops.reduce((p, c)=>{
          let ps = p.stats, cs = c.stats;
          expect(ps.requestStart).to.be.lte(cs.requestStart);
          expect(cs.requestStart).to.be.lte(ps.requestStop);

          return c;
        });

        //time
        let minStart = Math.min(...ops.map(op=>op.stats.requestStart));
        let maxStart = Math.max(...ops.map(op=>op.stats.requestStart));

        expect((maxStart - minStart)).to.be.lessThan(200);

        //time between start and stop should take longer then 20mills
        ops.forEach(op=>{
          let cs = op.stats;
          expect((cs.requestStop - cs.requestStart)).to.be.gt(20)
        });

        done();
      }).catch(e=>{
        done(new Error(e));
      })
    });

    it('requests should not be completed until proxies are returned', function(done){
      let returnedBeforeComplete = true;

      let npl = new NodeProxyPools({
 //       roOps: {apiKey: roApiKey, fetchProxies: 100, debug: true},
        luOps: Object['assign']({fetchProxies: 100}, confJson.luminatiObj),
        debug: true,
        passFn(){
          //if fetch returned before fetch completed, fail test
          expect(returnedBeforeComplete).to.be.false;
          return true;
        },
        failFn(){
          //if fail before fetch completed, fail test
          expect(returnedBeforeComplete).to.be.false;
          return false;
        },
        maxTime: 10*1000
      });


      //make proxy take 20 seconds
      let oldFn = npl['getReadyProxy'].bind(npl);
      npl['getReadyProxy'] = function(item){

        let time = new Promise((c)=>{
          setTimeout(()=>{
            c();
            returnedBeforeComplete = false;
          }, 20 * 1000);
        });

        return Promise.all([oldFn(item), time]).then(items=>items[0]);
      };

      let req = [] as any;
      for(var i = 0; i < 10; ++i){
        req.push(npl.request({url}));
      }
      Promise.all(req).then(()=>{
        done();
      }).catch(e=>{
        done(new Error(e));
      })
    });

    it('if failing the passFn then the request should be tried again', (done) => {
      let timesPassFnCalled = 0;

      let npl = new NodeProxyPools({
        debug: true,
        // roOps: {
        //   apiKey: roApiKey,
        //   fetchProxies: 30,
        //   debug: true
        // },
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj),
        passFn(resp) {
          timesPassFnCalled++;
          return timesPassFnCalled > 2
        }
      });

      npl.request({
        url,
        resolveWithFullResponse: true
      }).then(resp => {
        expect(timesPassFnCalled).to.be.gt(1);
        done();
      }).catch(e=>{
        done(new Error(e));
      })
    })

    it('if failing the passFn from the request then the request should be tried again', (done) => {
      let timesPassFnCalled = 0;

      let npl = new NodeProxyPools({
        debug: true,
        // roOps: {
        //   apiKey: roApiKey,
        //   fetchProxies: 30,
        //   debug: true
        // },
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj)
      });

      npl.request({
        url,
        resolveWithFullResponse: true,
        nppOps: {
          passFn(resp) {
            timesPassFnCalled++;
            return timesPassFnCalled > 2
          }
        }
      }).then(resp => {
        expect(timesPassFnCalled).to.be.gt(1);
        done();
      }).catch(e=>{
        done(new Error(e));
      })
    })

    it('if the failFn returns true then the request should be tried again', (done) => {
      let timesFnCalled = 0;

      let npl = new NodeProxyPools({
        debug: true,
        // roOps: {
        //   apiKey: roApiKey,
        //   fetchProxies: 30,
        //   debug: true
        // },
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj),
        passFn() {
          return false;
        },
        failFn(resp) {
          timesFnCalled++;
          return timesFnCalled > 2
        }
      });

      npl.request({
        url: 'falseProto://www.falsePlace123$$.com',
        resolveWithFullResponse: true
      }).then(resp => {
        done(new Error('a response should not have been delivered'));
      }).catch(e => {
        expect(timesFnCalled).to.be.gt(1);
        done();
      })
    })

    it('if the failFn returns on the request true then the request should be tried again', (done) => {
      let timesFnCalled = 0;

      let npl = new NodeProxyPools({
        debug: true,
        // roOps: {
        //   apiKey: roApiKey,
        //   fetchProxies: 30,
        //   debug: true
        // },
        luOps: Object['assign']({fetchProxies: 30}, confJson.luminatiObj)
      });

      npl.request({
        url: 'falseProto://www.falsePlace123$$.com',
        resolveWithFullResponse: true,
        nppOps: {
          failFn(resp) {
            timesFnCalled++;
            return timesFnCalled > 2
          }
        }
      }).then(resp => {
        done(new Error('a response should not have been delivered'));
      }).catch(e => {
        expect(timesFnCalled).to.be.gt(1);
        done();
      })
    })
  })

  describe('instance tests', () => {

    it('it should complete the test 1', (done) => {
      let expectedImgs = [
        'https://static.zerochan.net/Gripen.%28Girly.Air.Force%29.full.2330547.png',
        'https://static.zerochan.net/Toshokan.Sensou.full.1186015.jpg',
        'https://static.zerochan.net/Hello.Happy.World%21.full.2317915.png',
        'https://static.zerochan.net/Yu-Gi-Oh%21.full.2094760.jpg',
        'https://static.zerochan.net/Gilgamesh.full.1554634.jpg',
        'https://static.zerochan.net/Doujima.Daisuke.full.2443045.jpg',
        'https://static.zerochan.net/Izumi.Kyouka.(Meikoi).full.2451591.jpg',
        'https://static.zerochan.net/Rina.%28Kemurikusa%29.full.2501227.png',
        "https://static.zerochan.net/Aisare.Roommate.full.1670536.jpg",
        'https://static.zerochan.net/Yakusoku.no.Neverland.full.2515227.jpg'
      ];

      let npl = new NodeProxyPools({
        // roOps: {apiKey: roApiKey, fetchProxies: 100, debug: true},
        luOps: Object['assign']({fetchProxies: 100}, confJson.luminatiObj),
        debug: true,
        maxTime: 20*1000,
        failFn(){return false;}
      });

      let mapProms = expectedImgs.map(url=>npl.request({url}))

      Promise.all(mapProms).then(()=>{
        done()
      }).catch((e)=>{
        done(new Error(e));
      })
    })
    // it('example site test should pass', (done)=>{
    //
    //   process.on('uncaughtException', function (err) {
    //     debugger;
    //     console.log(err);
    //   });
    //
    //   try {
    //
    //     let npl = new NodeProxyPools({
    //       roOps: {
    //         apiKey: roApiKey,
    //         fetchProxies: 30,
    //         debug: true
    //       },
    //       debug: true,
    //       passFn(resp: string) {
    //         console.log('nyaa pass');
    //         return resp.indexOf('<meta property="og:site_name" content="Nyaa">') !== -1;
    //       },
    //       failFn(err) {
    //         console.log('nyaa fail', err.statusCode, err.options && err.options.url);
    //         //if dns resolution error, try again
    //
    //         return false;
    //       }
    //     });
    //
    //     let allTests: any = [];
    //     for (let i = 0; i < 2000; ++i) {
    //       let userAStr = random_useragent.getRandom();
    //       let req = npl.request({
    //         gzip: true,
    //         method: 'GET',
    //         url: 'https://nyaa.si/view/1116270',
    //         timeout: 30 * 1000,
    //         maxRedirects: '10',
    //         followRedirect: true,
    //         rejectUnauthorized: false,
    //         insecure: true,
    //         headers: {
    //           'user-agent': userAStr
    //         }
    //       }).catch(e => {
    //         if (e.statusCode !== 404)
    //           debugger;
    //       });
    //
    //       allTests.push(req);
    //     }
    //
    //     Promise.all(allTests).then(all => {
    //       debugger;
    //     })
    // });

  })

  // describe('Performance tests', () => {
  //   it('preforming requests with a proxy in parallel should be faster then requests without proxy in series', (done)=>{
  //     let testRang = 5;
  //     let throttle = 1 * 1000;
  //     let date: any = new Date();
  //     let npl = new NodeProxyPools({roOps:{apiKey: roApiKey, fetchProxies: 30, debug: true}, debug:true});
  //     npl['proxyList'].then(()=> {
  //       return forkJoin(
  //         range(0, testRang).pipe(
  //           mergeMap(() => {
  //             return npl.request({
  //               url
  //             })
  //           }),
  //           toArray(),
  //           map(()=> new Date()),
  //           tap((time: any)=>{
  //             console.log(`proxy completed: ${(time - date)}`)
  //           })),
  //         range(0, testRang).pipe(
  //           concatMap((num) => {
  //             return fromPromise(rp({
  //               url
  //             }).then(res=>{
  //               console.log('completed', num);
  //               return res;
  //             })).pipe(delay(throttle))
  //           }),
  //           toArray(),
  //           map(()=> new Date()),
  //           tap((time: any)=>{
  //             console.log(`non-proxy completed: ${(time - date)}`)
  //           })))
  //         .subscribe(([proxCom, com]) => {
  //           console.log(`time to complete, diff prox vs non-prox: ${(proxCom - com) / (1000 * 60)}`);
  //           done();
  //         })
  //       })
  //   }).timeout(30 * 1000)
  // });

});