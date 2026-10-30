//+------------------------------------------------------------------+
//|                                                 LicenseCheck.mqh |
//|                                  Copyright 2026, investmentsview |
//|                                        https://investmentsview.com |
//+------------------------------------------------------------------+
#property strict

//+------------------------------------------------------------------+
//| Lightweight flat JSON field extractor for MQL5                   |
//+------------------------------------------------------------------+
string ExtractJsonValue(string json, string fieldName) {
   int pos = StringFind(json, "\"" + fieldName + "\"");
   if(pos < 0) return "";
   
   pos = StringFind(json, ":", pos);
   if(pos < 0) return "";
   pos++;
   
   // Skip whitespace
   while(pos < StringLen(json) && StringGetCharacter(json, pos) <= 32) pos++;
   
   // String value
   if(StringSubstr(json, pos, 1) == "\"") {
      int endPos = StringFind(json, "\"", pos + 1);
      if(endPos < 0) return "";
      return StringSubstr(json, pos + 1, endPos - pos - 1);
   }
   
   // Boolean / numeric / raw value
   int endPos = pos;
   while(endPos < StringLen(json) && 
         StringSubstr(json, endPos, 1) != "," && 
         StringSubstr(json, endPos, 1) != "}" && 
         StringSubstr(json, endPos, 1) != "\r" && 
         StringSubstr(json, endPos, 1) != "\n") {
      endPos++;
   }
   
   string val = StringSubstr(json, pos, endPos - pos);
   StringTrimRight(val);
   return val;
}

//+------------------------------------------------------------------+
//| Check EA License against investmentsview.com                     |
//| Returns: true if valid, false if invalid or expired              |
//+------------------------------------------------------------------+
bool VerifyEALicense(string licenseKey, string serverUrl, string &outMessage) {
   if(StringLen(licenseKey) == 0) {
      outMessage = "License key is missing! Please enter your license key in the EA inputs.";
      return false;
   }
   
   // 1. Get current MT5 account ID
   long accountLogin = AccountInfoInteger(ACCOUNT_LOGIN);
   
   // 2. Prepare JSON Payload matching exact API contract
   string payload = StringFormat("{\"license_key\":\"%s\",\"account_number\":%I64d}", licenseKey, accountLogin);
   
   char postData[], responseData[];
   string responseHeaders;
   StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1); // safely remove null terminator
   
   string requestHeaders = "Content-Type: application/json\r\n";
   string endpoint = serverUrl + "/api/verify";
   
   ResetLastError();
   int timeoutMs = 5000;
   int httpCode = WebRequest("POST", endpoint, requestHeaders, timeoutMs, postData, responseData, responseHeaders);
   
   // Handle WebRequest Errors
   if(httpCode == -1) {
      int err = GetLastError();
      if(err == 4060) {
         outMessage = "WebRequest error 4060: Please add '" + serverUrl + "' to Tools -> Options -> Expert Advisors -> 'Allow WebRequest for listed URL'.";
      } else {
         outMessage = StringFormat("Network error connecting to licensing server (Error %d).", err);
      }
      return false;
   }
   
   string response = CharArrayToString(responseData, 0, WHOLE_ARRAY, CP_UTF8);
   string status = ExtractJsonValue(response, "status");
   string validStr = ExtractJsonValue(response, "valid");
   string msgStr = ExtractJsonValue(response, "message");
   string errStr = ExtractJsonValue(response, "error");
   
   if(status == "success" || validStr == "true") {
      outMessage = (StringLen(msgStr) > 0) ? msgStr : "License active";
      Print("EA License OK: ", outMessage);
      return true;
   }
   
   outMessage = (StringLen(errStr) > 0) ? errStr : ((StringLen(msgStr) > 0) ? msgStr : "License verification failed");
   Print("EA License Rejected: ", outMessage);
   return false;
}
