import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseFailure,databaseConfiguration,DatabaseFailure} from '../lib/database-errors.ts';
test('database errors distinguish credentials, network, endpoint and schema failures',()=>{
 for(const [error,code] of [
  [{code:'SERVER_ERROR',cause:{status:401}},'DB_AUTH_REJECTED'],
  [{code:'SERVER_ERROR',cause:{status:403}},'DB_AUTH_REJECTED'],
  [{code:'SQLITE_READONLY'},'DB_READ_ONLY'],
  [{code:'SERVER_ERROR',cause:{status:404}},'DB_ENDPOINT_MISMATCH'],
  [{code:'UNKNOWN',cause:{code:'ENOTFOUND'}},'DB_UNREACHABLE'],
  [{code:'SQLITE_ERROR'},'DB_INITIALIZATION_FAILED'],
  [{code:'URL_PARAM_NOT_SUPPORTED'},'DB_URL_INVALID'],
 ])assert.equal(databaseFailure(error).code,code);
 const typed=new DatabaseFailure('DB_TOKEN_MISSING');assert.equal(databaseFailure(typed),typed);
});
test('public diagnostics never include URLs, token values, SQL or arbitrary error codes',()=>{
 const secret='private-test-token-keep-in-memory';
 const failure=databaseFailure({code:secret,message:'libsql://private.example?authToken='+secret,sql:'SELECT private_data',cause:{code:'SERVER_ERROR',status:401}});
 const setup=databaseConfiguration({TURSO_DATABASE_URL:'libsql://private.example?authToken='+secret,TURSO_AUTH_TOKEN:secret,OTHER_SECRET:secret});
 const result=JSON.stringify({failure:{message:failure.message,code:failure.code,driverCode:failure.driverCode,remoteStatus:failure.remoteStatus},setup});
 for(const value of [secret,'private.example','SELECT','OTHER_SECRET'])assert.equal(result.includes(value),false);
 assert.equal(setup.tokenConfigured,true);assert.equal(setup.tokenInUrl,true);
 assert.deepEqual(setup.variableNames,['TURSO_DATABASE_URL','TURSO_AUTH_TOKEN']);
});
test('configuration accepts integration token names and embedded auth tokens',()=>{
 assert.equal(databaseConfiguration({TURSO_DATABASE_URL:'libsql://test'}).tokenConfigured,false);
 assert.equal(databaseConfiguration({TURSO_DATABASE_AUTH_TOKEN:'test'}).tokenConfigured,true);
 assert.equal(databaseConfiguration({TURSO_DATABASE_TURSO_AUTH_TOKEN:'test'}).tokenConfigured,true);
 assert.equal(databaseConfiguration({TURSO_DATABASE_URL:'https://test?authToken=test'}).tokenConfigured,true);
});
