'use strict';

const assert = require('assert');
const { issueEntitlement } = require('./exchange/p2p-wallet-binding');
const {
  PROTECTED_ACTIONS,
  cleanAction,
  cleanPayload,
  enforceAndForward
} = require('./exchange/p2p-enforcement-gateway');

const SECRET='gateway-test-secret-long-enough-for-jwt';
const WALLET='0xaa000000000000000000000000000000000000bb';
const SESSION='signed-p2p-session-token-12345678901234567890';
const EDGE='https://example.test/p2p';

function entitlement(){
  return issueEntitlement({secret:SECRET,userId:'user-123',wallet:WALLET,kycStatus:'VERIFIED',kycLevel:2});
}

function accessVerified(){
  return Promise.resolve({ok:true,status:200,decision:{eligible:true,status:'VERIFIED',level:2,reason:'KYC_VERIFIED'}});
}

function fakeEdge(log,{wallet=WALLET,upstreamOk=true}={}){
  return async (url,options)=>{
    const body=JSON.parse(options.body);
    log.push({url,options,body});
    if(body.action==='me')return{ok:true,status:200,json:async()=>({ok:true,profile:{wallet}})};
    if(!upstreamOk)return{ok:false,status:409,json:async()=>({ok:false,error:'risk_review_required'})};
    return{ok:true,status:200,json:async()=>({ok:true,status:'active',echo:body})};
  };
}

(async()=>{
  assert.deepStrictEqual([...PROTECTED_ACTIONS].sort(),['cancel','create_offer','dispute','mark_paid','release','take_offer']);
  assert.strictEqual(cleanAction(' CREATE_OFFER '),'create_offer');
  assert.throws(()=>cleanAction('offers'),/P2P_GATEWAY_ACTION_NOT_ALLOWED/);
  assert.deepStrictEqual(cleanPayload({action:'create_offer',p2p_session_token:'forbidden',entitlement:'forbidden',price:123}),{price:123});

  const log=[];
  const result=await enforceAndForward({
    entitlementToken:entitlement(),
    p2pSessionToken:SESSION,
    body:{action:'create_offer',side:'sell',price:999,p2p_session_token:'must-not-forward'},
    entitlementSecret:SECRET,
    getCurrentAccess:accessVerified,
    fetchImpl:fakeEdge(log),
    edgeUrl:EDGE
  });
  assert.strictEqual(log.length,2,'gateway must attest session before forwarding');
  assert.strictEqual(log[0].body.action,'me');
  assert.strictEqual(log[1].body.action,'create_offer');
  assert.strictEqual(log[1].body.p2p_session_token,undefined);
  assert.strictEqual(log[1].options.headers.authorization,`Bearer ${SESSION}`);
  assert.strictEqual(result.wallet,WALLET);
  assert.strictEqual(result.identity_rechecked,true);
  assert.strictEqual(result.wallet_rechecked,true);
  assert.strictEqual(result.database_mutation_by_gateway,false);
  assert.strictEqual(result.supabase_configuration_mutation,false);
  assert.strictEqual(result.real_money_enabled,false);
  assert.strictEqual(result.upstream.ok,true);

  await assert.rejects(()=>enforceAndForward({
    entitlementToken:entitlement(),p2pSessionToken:SESSION,body:{action:'offers'},entitlementSecret:SECRET,getCurrentAccess:accessVerified,fetchImpl:fakeEdge([]),edgeUrl:EDGE
  }),/P2P_GATEWAY_ACTION_NOT_ALLOWED/);

  await assert.rejects(()=>enforceAndForward({
    entitlementToken:entitlement(),p2pSessionToken:SESSION,body:{action:'take_offer',offer_id:'1'},entitlementSecret:SECRET,
    getCurrentAccess:async()=>({ok:true,status:403,decision:{eligible:false,status:'BLOCKED',reason:'P2P_BLOCKED'}}),fetchImpl:fakeEdge([]),edgeUrl:EDGE
  }),/P2P_BLOCKED/);

  await assert.rejects(()=>enforceAndForward({
    entitlementToken:entitlement(),p2pSessionToken:SESSION,body:{action:'release',trade_id:'1'},entitlementSecret:SECRET,getCurrentAccess:accessVerified,
    fetchImpl:fakeEdge([],{wallet:'0xcc000000000000000000000000000000000000dd'}),edgeUrl:EDGE
  }),/P2P_SESSION_WALLET_MISMATCH/);

  await assert.rejects(()=>enforceAndForward({
    entitlementToken:entitlement(),p2pSessionToken:SESSION,body:{action:'dispute',trade_id:'1'},entitlementSecret:SECRET,getCurrentAccess:accessVerified,
    fetchImpl:fakeEdge([],{upstreamOk:false}),edgeUrl:EDGE
  }),/risk_review_required/);

  console.log('MASTERLAW P2P ENFORCEMENT GATEWAY PASS');
})().catch(e=>{console.error(e);process.exit(1)});
