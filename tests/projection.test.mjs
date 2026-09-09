import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script id="projection-model">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'The deployed page must include the projection calculation');
const context=vm.createContext({});vm.runInContext(script,context);
const P=context.PortfolioProjection;
const row=(ticker,direct,qqq=0,spy=0)=>({ticker,position:ticker,directAllocation:direct,qqqLookThrough:qqq,spyLookThrough:spy});
const data=holdings=>({holdings,debt:{allocation:0}});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('restores whole ETF ownership and combines Alphabet without look-through double counting',()=>{
  const weights=P.deriveWeights(data([row('GOOG',.20,.10,.05),row('GOOGL',.15),row('QQQ ex Top 30',.20),row('SPY ex Top 30',.30)]));
  assert.equal(weights.length,3);
  near(weights.find(r=>r.ticker==='GOOGL').weight,.35);
  near(weights.find(r=>r.ticker==='QQQ').weight,.30);
  near(weights.find(r=>r.ticker==='SPY').weight,.35);
});

test('portfolio IRR is derived from compounded ending wealth, not the weighted average of IRRs',()=>{
  const result=P.project(data([row('NVDA',.5),row('AAPL',.5)]));
  near(result.mom,.5*1.1**10+.5*1.05**10);
  near(result.netIrr,result.mom**.1-1);
  assert.ok(result.netIrr>.075);
  near(result.points[0].netMultiple,1);
  assert.equal(result.points.at(-1).year,10);
});

test('source weight changes recalculate the chart without changing fixed rates',()=>{
  const first=P.project(data([row('NVDA',.2),row('AAPL',.8)]));
  const second=P.project(data([row('NVDA',.8),row('AAPL',.2)]));
  assert.ok(second.netIrr>first.netIrr);
  assert.equal(P.assumptions.NVDA[0],10);
  assert.equal(P.assumptions.AAPL[0],5);
});

test('all four requested nonpositive base overrides are 2%, and bull assumptions are unchanged',()=>{
  const cases={OKLO:14,SPCX:13,TSLA:17,BE:12};
  for(const [ticker,bull] of Object.entries(cases)){
    assert.equal(P.assumptions[ticker][0],2);assert.equal(P.assumptions[ticker][1],bull);
  }
  assert.equal(Object.keys(P.assumptions).length,39);
  assert.ok(Object.isFrozen(P.assumptions));assert.ok(Object.isFrozen(P.assumptions.NVDA));
});

test('cash and unknown holdings are included flat without an invented 2% forecast',()=>{
  const result=P.project(data([row('NVDA',.8),row('CASH',.1),row('NEW',.1)]));
  near(result.unmodeledWeight,.2);near(result.mom,.8*1.1**10+.2);
  assert.equal(result.rows.find(r=>r.ticker==='NEW').modeled,false);
});

test('net capital includes quarterly borrowing cost and terminal principal repayment exactly once',()=>{
  const result=P.project({holdings:[row('CASH',1)],debt:{allocation:.1}});
  near(result.mom,(1-.1*.05*10-.1)/.9);
  near(result.netIrr,result.mom**.1-1);
});

test('invalid or incomplete weights do not produce a plausible-looking portfolio return',()=>{
  assert.throws(()=>P.project(data([row('NVDA',.8)])),/reconcile/);
  assert.throws(()=>P.project(data([row('NVDA',NaN)])),/Invalid/);
  assert.throws(()=>P.project(data([row('NVDA',1.1),row('CASH',-.1)])),/reviewed/);
});

test('current deployed snapshot reconciles and both scenarios render meaningful net results',()=>{
  const snapshot=JSON.parse(html.match(/<script id="dashboard-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const base=P.project(snapshot);const bull=P.project(snapshot,'bull');
  near(base.rows.reduce((sum,r)=>sum+r.weight,0),1);
  assert.ok(bull.netIrr>base.netIrr);
  assert.ok(base.unmodeledWeight>0);
  assert.ok(html.indexOf('id="portfolio-projection"')<html.indexOf('</main>'));
  assert.ok(html.indexOf('id="portfolio-projection"')>html.indexOf('id="spy-table"'));
});
