type FailureCode = 'DB_URL_MISSING'|'DB_URL_INVALID'|'DB_TOKEN_MISSING'|'DB_AUTH_REJECTED'|'DB_READ_ONLY'|'DB_ENDPOINT_MISMATCH'|'DB_UNREACHABLE'|'DB_INITIALIZATION_FAILED';
const messages:Record<FailureCode,string> = {
  DB_URL_MISSING:'雲端資料庫尚未設定，請在 Production 連接 Turso 資料庫',
  DB_URL_INVALID:'Turso 連線網址格式不正確，請確認 TURSO_DATABASE_URL 是資料庫的連線網址',
  DB_TOKEN_MISSING:'資料庫網址已設定，但缺少 Turso Token，請重新連接此專案的 Production 環境',
  DB_AUTH_REJECTED:'Turso 拒絕目前的資料庫憑證，請確認資料庫與 Token 屬於同一個連接設定',
  DB_READ_ONLY:'目前的資料庫憑證只有讀取權限，網站需要可寫入的連接設定',
  DB_ENDPOINT_MISMATCH:'資料庫端點未接受連線，請確認連接的是 Turso 資料庫網址',
  DB_UNREACHABLE:'目前無法連接 Turso 資料庫，請稍後重試',
  DB_INITIALIZATION_FAILED:'資料庫初始化失敗，請將下方錯誤代碼提供給網站管理者',
};
export class DatabaseFailure extends Error {
  readonly status=503;
  readonly code:FailureCode;
  readonly driverCode?:string;
  readonly remoteStatus?:number;
  constructor(code:FailureCode, driverCode?:string, remoteStatus?:number) {
    super(messages[code]+' ['+code+']'); this.name='DatabaseFailure';
    this.code=code;this.driverCode=driverCode;this.remoteStatus=remoteStatus;
  }
}
export function databaseFailure(error:unknown):DatabaseFailure {
  if(error instanceof DatabaseFailure)return error;
  const known = new Set(['URL_INVALID','URL_PARAM_NOT_SUPPORTED','URL_SCHEME_NOT_SUPPORTED','SQLITE_ERROR','SQLITE_AUTH','SQLITE_READONLY','SQLITE_CANTOPEN','SQLITE_BUSY','SQLITE_LOCKED','SQLITE_SCHEMA','SERVER_ERROR','UNKNOWN','HRANA_PROTO_ERROR','HRANA_CLOSED_ERROR','PROTOCOL_VERSION_ERROR','AUTH_FAILED','AUTH_EXPIRED','TOKEN_EXPIRED','UNAUTHORIZED','ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET']);
  const codes:string[]=[];let remoteStatus:number|undefined;const visited=new Set();let current=error;
  for(let i=0;i<8&&current&&typeof current==='object'&&!visited.has(current);i++) {
    visited.add(current);const e=current as {code?:unknown;status?:unknown;cause?:unknown};
    if(typeof e.code==='string'&&known.has(e.code))codes.push(e.code);
    if(typeof e.status==='number'&&Number.isInteger(e.status)&&e.status>=400&&e.status<=599)remoteStatus=e.status;
    current=e.cause;
  }
  const has=(...list:string[])=>list.some(code=>codes.includes(code));
  const code:FailureCode = has('URL_INVALID','URL_PARAM_NOT_SUPPORTED','URL_SCHEME_NOT_SUPPORTED')?'DB_URL_INVALID':
    has('SQLITE_READONLY')?'DB_READ_ONLY':remoteStatus===401||remoteStatus===403||has('SQLITE_AUTH','AUTH_FAILED','AUTH_EXPIRED','TOKEN_EXPIRED','UNAUTHORIZED')?'DB_AUTH_REJECTED':
    remoteStatus===404?'DB_ENDPOINT_MISMATCH':remoteStatus!==undefined&&remoteStatus>=500||has('ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET')?'DB_UNREACHABLE':'DB_INITIALIZATION_FAILED';
  return new DatabaseFailure(code,codes[0],remoteStatus);
}
export function databaseConfiguration(env:Record<string,string|undefined>) {
  const url=env.TURSO_DATABASE_URL?.trim()||'';
  let tokenInUrl=false;try{tokenInUrl=!!new URL(url).searchParams.get('authToken');}catch{}
  return {
    urlConfigured:!!url,
    tokenConfigured:!!(env.TURSO_AUTH_TOKEN?.trim()||env.TURSO_DATABASE_AUTH_TOKEN?.trim()||env.TURSO_DATABASE_TURSO_AUTH_TOKEN?.trim())||tokenInUrl,
    tokenInUrl,
    variableNames:Object.keys(env).filter(name=>/^TURSO[A-Z0-9_]{0,80}$/.test(name)&&!!env[name]).slice(0,16),
  };
}
