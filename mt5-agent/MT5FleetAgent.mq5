// MT5 Fleet Dashboard — monitoring only. No trading functions or DLL imports.
#property strict
#property version "1.02"
#property description "Read-only account telemetry over HTTPS. Pair with your MT5 Fleet Dashboard."
input string ServerURL = "";
input string PairingCode = "";
input int HeartbeatSeconds = 5;
input int SnapshotSeconds = 5;
input int RequestTimeoutMs = 2500;
input int BrokerUTCOffsetMinutes = 9999; // 9999 = estimate current server offset

string base, installation, credential, agent_id, state_file, context_key, state="NOT PAIRED";
string previous_positions="", previous_orders="";
datetime last_heartbeat=0,last_snapshot=0,last_sync=0,retry_at=0;
int failures=0,hb_seconds=5,snap_seconds=5;
bool force_sync=true;

string N(double x) { return MathIsValidNumber(x) ? DoubleToString(x,8) : "0"; }
string I(long x) { return IntegerToString(x); }
string U(ulong x) { return StringFormat("%I64u",x); }
string B(bool x) { return x ? "true" : "false"; }
string Q(string x) {
  string out="\"";
  for(int i=0;i<StringLen(x);i++) {
    ushort c=StringGetCharacter(x,i);
    if(c==34) out+="\\\"";
    else if(c==92) out+="\\\\";
    else if(c<32) out+=StringFormat("\\u%04x",(int)c);
    else out+=ShortToString(c);
  }
  return out+"\"";
}
string Hash(string text) {
  uchar data[],key[],result[];
  StringToCharArray(text,data,0,WHOLE_ARRAY,CP_UTF8);
  if(ArraySize(data)>0) ArrayResize(data,ArraySize(data)-1);
  if(CryptEncode(CRYPT_HASH_SHA256,data,key,result)<=0) return "";
  string out=""; for(int i=0;i<ArraySize(result);i++) out+=StringFormat("%02x",(int)result[i]);
  return out;
}
string UUID() {
  string h=Hash(TerminalInfoString(TERMINAL_DATA_PATH)+I((long)TimeLocal())+U(GetMicrosecondCount())+I(MathRand())+I(AccountInfoInteger(ACCOUNT_LOGIN)));
  return StringSubstr(h,0,8)+"-"+StringSubstr(h,8,4)+"-4"+StringSubstr(h,13,3)+"-a"+StringSubstr(h,17,3)+"-"+StringSubstr(h,20,12);
}
// Responses contain flat string/integer/boolean fields; never evaluate server text.
string Field(string json,string name) {
  int p=StringFind(json,"\""+name+"\""); if(p<0) return "";
  p=StringFind(json,":",p); if(p<0) return ""; p++;
  while(p<StringLen(json) && StringGetCharacter(json,p)<=32) p++;
  if(StringSubstr(json,p,1)=="\"") { int e=StringFind(json,"\"",p+1); return e<0 ? "" : StringSubstr(json,p+1,e-p-1); }
  int e=p; while(e<StringLen(json) && StringSubstr(json,e,1)!="," && StringSubstr(json,e,1)!="}") e++;
  string v=StringSubstr(json,p,e-p); StringTrimRight(v); return v;
}
long UTC(long broker_time) {
  long offset=BrokerUTCOffsetMinutes==9999 ? (long)MathRound((double)(TimeTradeServer()-TimeGMT())/900.0)*900 : (long)BrokerUTCOffsetMinutes*60;
  return broker_time>0 ? MathMax(0,broker_time-offset) : 0;
}
string Login() { return I(AccountInfoInteger(ACCOUNT_LOGIN)); }
string Identity() { return "\"v\":1,\"accountLogin\":"+Q(Login())+",\"server\":"+Q(AccountInfoString(ACCOUNT_SERVER)); }
bool Algo() { return TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_EXPERT); }
void Save() {
  int f=FileOpen(state_file+".tmp",FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
  if(f==INVALID_HANDLE) { state="LOCAL SAVE FAILED"; Print("Fleet: cannot save credential. Check MQL5/Files permissions."); return; }
  FileWrite(f,installation); FileWrite(f,credential); FileWrite(f,agent_id);
  FileFlush(f); FileClose(f);
  if(!FileMove(state_file+".tmp",0,state_file,FILE_REWRITE)) Print("Fleet: credential state rename failed ",GetLastError());
}
void LoadAccount() {
  context_key=Login()+"@"+AccountInfoString(ACCOUNT_SERVER);
  state_file="MT5Fleet-"+StringSubstr(Hash(base+context_key),0,24)+".dat";
  installation=""; credential=""; agent_id="";
  int f=FileOpen(state_file,FILE_READ|FILE_TXT|FILE_ANSI,0,CP_UTF8);
  if(f!=INVALID_HANDLE) {
    installation=FileReadString(f); credential=FileReadString(f); agent_id=FileReadString(f);
    FileClose(f);
  }
  if(installation=="") { installation=UUID(); Save(); }
  force_sync=true; previous_positions=""; previous_orders="";
  last_heartbeat=0; last_snapshot=0; failures=0; retry_at=0;
}
bool Post(string endpoint,string body,string &response,bool pairing=false) {
  if(TimeLocal()<retry_at) return false;
  char data[],result[]; string headers;
  StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8); ArrayResize(data,ArraySize(data)-1);
  string request_headers="Content-Type: application/json\r\n";
  if(!pairing) request_headers+="Authorization: Bearer "+credential+"\r\n";
  ResetLastError();
  int code=WebRequest("POST",base+"/api/agent/"+endpoint,request_headers,MathMax(500,RequestTimeoutMs),data,result,headers);
  response=CharArrayToString(result,0,WHOLE_ARRAY,CP_UTF8);
  if(code>=200 && code<300 && Field(response,"ok")=="true") {
    failures=0; retry_at=0; last_sync=TimeLocal(); state="CONNECTED"; return true;
  }
  force_sync=true;
  failures++;
  retry_at=TimeLocal()+(int)MathMin(60,MathPow(2,MathMin(6,failures)))+MathRand()%3;
  state=code==401 ? "CREDENTIAL REVOKED — RE-PAIR" : code==-1 ? "WEBREQUEST / NETWORK ERROR" : "HTTP "+I(code);
  if(code==401) { credential=""; installation=UUID(); Save(); }
  if(code==409) force_sync=true;
  Print("Fleet: ",endpoint," ",state," terminal error ",GetLastError());
  return false;
}
bool Pair() {
  if(PairingCode=="") { state="ENTER PAIRING CODE"; return false; }
  string response;
  string body="{\"v\":1,\"pairingCode\":"+Q(PairingCode)+",\"installationId\":"+Q(installation)+",\"platform\":\"windows\",\"terminalBuild\":"+I(TerminalInfoInteger(TERMINAL_BUILD))+",\"terminalCompany\":"+Q(TerminalInfoString(TERMINAL_COMPANY))+",\"terminalName\":"+Q(TerminalInfoString(TERMINAL_NAME))+",\"eaVersion\":\"1.02\"}";
  if(!Post("register",body,response,true)) return false;
  credential=Field(response,"credential"); agent_id=Field(response,"agentId");
  if(credential=="" || agent_id=="") return false;
  Save(); force_sync=true; return true;
}
bool Heartbeat() {
  string response;
  string body="{"+Identity()+",\"broker\":"+Q(AccountInfoString(ACCOUNT_COMPANY))+",\"terminalConnected\":"+B(TerminalInfoInteger(TERMINAL_CONNECTED))+",\"algoTrading\":"+B(Algo())+",\"eaLoaded\":true,\"build\":"+I(TerminalInfoInteger(TERMINAL_BUILD))+"}";
  if(!Post("heartbeat",body,response)) return false;
  if(Field(response,"fullSync")=="true") force_sync=true;
  int h=(int)StringToInteger(Field(response,"heartbeatSeconds")),s=(int)StringToInteger(Field(response,"snapshotSeconds"));
  if(h>0) hb_seconds=MathMax(2,h); if(s>0) snap_seconds=MathMax(2,s);
  last_heartbeat=TimeLocal(); return true;
}
// Sum booked trading profit and fees locally; never upload individual deals.
bool DailyRealized(double &profit,string &day) {
  long utc=(long)TimeGMT();
  long day_start=((utc+18000)/86400)*86400-18000;
  MqlDateTime parts; TimeToStruct((datetime)(utc+18000),parts);
  day=StringFormat("%04d-%02d-%02d",parts.year,parts.mon,parts.day);
  long offset=BrokerUTCOffsetMinutes==9999 ? (long)MathRound((double)(TimeTradeServer()-TimeGMT())/900.0)*900 : (long)BrokerUTCOffsetMinutes*60;
  if(!TerminalInfoInteger(TERMINAL_CONNECTED) || !HistorySelect((datetime)(day_start+offset),TimeTradeServer())) return false;
  profit=0;
  for(int i=0;i<HistoryDealsTotal();i++) {
    ulong ticket=HistoryDealGetTicket(i);
    if(ticket==0) return false;
    long kind=HistoryDealGetInteger(ticket,DEAL_TYPE);
    if(kind!=DEAL_TYPE_BUY && kind!=DEAL_TYPE_SELL) continue;
    profit+=HistoryDealGetDouble(ticket,DEAL_PROFIT)+HistoryDealGetDouble(ticket,DEAL_SWAP)+HistoryDealGetDouble(ticket,DEAL_COMMISSION)+HistoryDealGetDouble(ticket,DEAL_FEE);
  }
  return true;
}
bool Snapshot() {
  string response;
  string a="\"login\":"+Q(Login())+",\"broker\":"+Q(AccountInfoString(ACCOUNT_COMPANY))+",\"server\":"+Q(AccountInfoString(ACCOUNT_SERVER))+",\"currency\":"+Q(AccountInfoString(ACCOUNT_CURRENCY));
  a+=",\"balance\":"+N(AccountInfoDouble(ACCOUNT_BALANCE))+",\"equity\":"+N(AccountInfoDouble(ACCOUNT_EQUITY))+",\"credit\":"+N(AccountInfoDouble(ACCOUNT_CREDIT));
  a+=",\"margin\":"+N(AccountInfoDouble(ACCOUNT_MARGIN))+",\"freeMargin\":"+N(AccountInfoDouble(ACCOUNT_MARGIN_FREE))+",\"marginLevel\":"+N(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL));
  a+=",\"leverage\":"+I(AccountInfoInteger(ACCOUNT_LEVERAGE))+",\"mode\":"+Q(AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO ? "DEMO" : "LIVE");
  a+=",\"tradeAllowed\":"+B(AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))+",\"algoTrading\":"+B(Algo())+",\"terminalConnected\":"+B(TerminalInfoInteger(TERMINAL_CONNECTED));
  double realized=0; string day;
  if(DailyRealized(realized,day)) a+=",\"todayRealizedPl\":"+N(realized)+",\"realizedPlDay\":"+Q(day);
  if(!Post("snapshot","{\"v\":1,\"account\":{"+a+"}}",response)) return false;
  last_snapshot=TimeLocal(); return true;
}
double PositionCommission(ulong identifier) {
  if(!HistorySelectByPosition(identifier)) return 0;
  double fees=0,opened=0,closed=0;
  for(int i=0;i<HistoryDealsTotal();i++) {
    ulong t=HistoryDealGetTicket(i); long entry=HistoryDealGetInteger(t,DEAL_ENTRY);
    if(entry==DEAL_ENTRY_IN) { fees+=HistoryDealGetDouble(t,DEAL_COMMISSION)+HistoryDealGetDouble(t,DEAL_FEE); opened+=HistoryDealGetDouble(t,DEAL_VOLUME); }
    else if(entry==DEAL_ENTRY_OUT || entry==DEAL_ENTRY_OUT_BY) closed+=HistoryDealGetDouble(t,DEAL_VOLUME);
  }
  return opened>0 ? fees*MathMax(0,opened-closed)/opened : 0;
}
bool Positions() {
  string rows="";
  for(int i=0;i<PositionsTotal();i++) {
    ulong t=PositionGetTicket(i); if(t==0) continue;
    if(rows!="") rows+=",";
    rows+="{\"ticket\":"+Q(U(t))+",\"symbol\":"+Q(PositionGetString(POSITION_SYMBOL))+",\"type\":"+Q(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY?"BUY":"SELL");
    rows+=",\"volume\":"+N(PositionGetDouble(POSITION_VOLUME))+",\"openPrice\":"+N(PositionGetDouble(POSITION_PRICE_OPEN))+",\"currentPrice\":"+N(PositionGetDouble(POSITION_PRICE_CURRENT));
    rows+=",\"sl\":"+N(PositionGetDouble(POSITION_SL))+",\"tp\":"+N(PositionGetDouble(POSITION_TP))+",\"swap\":"+N(PositionGetDouble(POSITION_SWAP))+",\"profit\":"+N(PositionGetDouble(POSITION_PROFIT));
    rows+=",\"magic\":"+Q(I(PositionGetInteger(POSITION_MAGIC)))+",\"comment\":"+Q(PositionGetString(POSITION_COMMENT))+",\"openTime\":"+I(UTC(PositionGetInteger(POSITION_TIME)));
    rows+=",\"commission\":"+N(PositionCommission((ulong)PositionGetInteger(POSITION_IDENTIFIER)))+"}";
  }
  if(!force_sync && rows==previous_positions) return true;
  string response;
  if(!Post("positions","{"+Identity()+",\"full\":true,\"positions\":["+rows+"]}",response)) return false;
  previous_positions=rows; return true;
}
bool Orders() {
  string rows="";
  for(int i=0;i<OrdersTotal();i++) {
    ulong t=OrderGetTicket(i); if(t==0) continue;
    if(rows!="") rows+=",";
    rows+="{\"ticket\":"+Q(U(t))+",\"symbol\":"+Q(OrderGetString(ORDER_SYMBOL))+",\"type\":"+Q(EnumToString((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE)));
    rows+=",\"volume\":"+N(OrderGetDouble(ORDER_VOLUME_CURRENT))+",\"price\":"+N(OrderGetDouble(ORDER_PRICE_OPEN))+",\"sl\":"+N(OrderGetDouble(ORDER_SL))+",\"tp\":"+N(OrderGetDouble(ORDER_TP));
    rows+=",\"magic\":"+Q(I(OrderGetInteger(ORDER_MAGIC)))+",\"comment\":"+Q(OrderGetString(ORDER_COMMENT))+",\"createTime\":"+I(UTC(OrderGetInteger(ORDER_TIME_SETUP)))+"}";
  }
  if(!force_sync && rows==previous_orders) return true;
  string response;
  if(!Post("orders","{"+Identity()+",\"full\":true,\"orders\":["+rows+"]}",response)) return false;
  previous_orders=rows; return true;
}
void Display() {
  Comment("MT5 Fleet Agent\nStatus: ",state,"\nAccount: ",Login(),"\nBroker: ",AccountInfoString(ACCOUNT_COMPANY),"\nServer: ",AccountInfoString(ACCOUNT_SERVER),"\nLast Sync: ",last_sync>0?I((long)(TimeLocal()-last_sync))+" sec":"never","\nAgent ID: ",agent_id,"\nMonitoring only — no trading operations");
}
int OnInit() {
  base=ServerURL; while(StringLen(base)>0 && StringSubstr(base,StringLen(base)-1)=="/") base=StringSubstr(base,0,StringLen(base)-1);
  if(StringFind(base,"https://")!=0 || StringFind(base,"?")>=0 || StringFind(base,"#")>=0 || StringFind(base,"@")>=0) { Print("Fleet: enter your HTTPS dashboard origin in ServerURL"); return INIT_PARAMETERS_INCORRECT; }
  MathSrand((int)GetTickCount()); hb_seconds=MathMax(2,HeartbeatSeconds); snap_seconds=MathMax(2,SnapshotSeconds);
  LoadAccount(); EventSetTimer(1); Display(); return INIT_SUCCEEDED;
}
void OnTimer() {
  if(context_key!=Login()+"@"+AccountInfoString(ACCOUNT_SERVER)) LoadAccount();
  Display(); if(TimeLocal()<retry_at) return;
  if(credential=="" && !Pair()) { Display(); return; }
  if(TimeLocal()-last_heartbeat>=hb_seconds && !Heartbeat()) { Display(); return; }
  if(TimeLocal()-last_snapshot>=snap_seconds || force_sync) {
    if(!Snapshot() || !Positions() || !Orders()) { Display(); return; }
    force_sync=false;
  }
  Display();
}
void OnDeinit(const int reason) { EventKillTimer(); Comment(""); }
