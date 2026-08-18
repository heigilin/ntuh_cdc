/**
 * 台大醫院 感染管制中心「台大感管 LINE 官方帳號」Google Apps Script Webhook 核心控制碼 (code.gs)
 * 
 * 整合功能：
 * 1. 加入好友自動發送招呼語 + 身分選擇引導 (Quick Reply 快速回應按鈕)
 * 2. 處理常見提問「你可以問什麼」、「你能做什麼」專用友善回答
 * 3. 智慧分流回應（員工模式 / 民眾模式 / 清消 / TOCC / 探病 / 疫苗 / 問卷）
 * 4. 每一則回應末端均自動附上最新疫情訊息週報網頁連結 (簡化版)
 */

// 請將您的 LINE Channel Access Token 貼在下方
const CHANNEL_ACCESS_TOKEN = 'YOUR_LINE_CHANNEL_ACCESS_TOKEN';
const WEEKLY_DIGEST_URL = '👉 https://heigilin.github.io/ntuh_cdc/web-preview.html?v=20260818';

/**
 * 接收 LINE Webhook POST 請求
 */
function doPost(e) {
  try {
    const json = JSON.parse(e.postData.contents);
    const events = json.events;

    if (!events || events.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
    }

    events.forEach(function(event) {
      const replyToken = event.replyToken;
      
      // 1. 使用者加入好友或解除封鎖 (follow 事件)
      if (event.type === 'follow') {
        sendFollowGreeting(replyToken);
      }
      
      // 2. 使用者傳送文字訊息 (message 事件)
      else if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text.trim();
        handleTextMessage(replyToken, userMessage);
      }
    });

  } catch (error) {
    Logger.log('doPost Error: ' + error.toString());
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 處理加入好友 / 解除封鎖 (Follow Event)
 * 一次性發送：親切招呼 + 身分選擇與資安提醒 (帶 Quick Reply 按鈕)
 */
function sendFollowGreeting(replyToken) {
  const message1 = {
    type: 'text',
    text: '您好！我是「台大感管LINE起來」小編 🤖\n\n感謝您加入好友！此官方帳號將協助您快速查詢各類感染管制、清消隔離、旅遊疫情及衛教資訊，知無不言喔 ✨'
  };

  const message2 = {
    type: 'text',
    text: '第一次使用前，請先點選您的身分，讓我用最適合的方式為您服務：\n\n1️⃣ 員工 / 院內同仁\n2️⃣ 民眾 / 病人或家屬\n\n🔒 資安提醒：本機器人為衛教與感管諮詢輔助工具，嚴禁於對話框內輸入任何病人姓名、病歷號、床號或具可識別性之醫療個資。',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'message',
            label: '1. 員工/院內同仁',
            text: '員工'
          }
        },
        {
          type: 'action',
          action: {
            type: 'message',
            label: '2. 民眾/病人或家屬',
            text: '民眾'
          }
        }
      ]
    }
  };

  replyMessage(replyToken, [message1, message2]);
}

/**
 * 處理文字訊息對話邏輯
 */
function handleTextMessage(replyToken, text) {
  let replyText = '';

  // 0. 常見熱門發問：你可以問什麼 / 你能做什麼 / 幫助 / 說明 / 功能
  if (text.includes('可以問什麼') || text.includes('能做什麼') || text.includes('你可以問') || text.includes('你能做') || text.includes('幫助') || text.includes('功能') || text === '說明') {
    replyText = '您好！我是「台大感管LINE起來」AI 助手 🤖\n我能為您解答感染管制政策、傳染病防護、隔離解隔、清消規範與衛教查詢！\n\n📌 常見熱門問題範例：\n\n🏥 1. 隔離與解隔規定\n• 「VRE 解隔要採哪裡？要停什麼藥？」\n• 「以前有 CRE 紀錄，這次住院可以解隔嗎？」\n• 「MDRO 病人可以去做 CT 或心導管檢查嗎？」\n\n🧼 2. 環境清消與防護裝備\n• 「漂白水清消濃度要泡多少？」\n• 「進出呼吸道照護區要戴什麼口罩？」\n\n📋 3. 法定傳染病與通報\n• 「登革熱 通報流程？」\n• 「流感 採檢送驗注意事項？」\n\n👨‍👩‍👧 4. 民眾與家屬衛教\n• 「探病與陪病時間規定？」\n• 「流感疫苗與新冠疫苗去哪裡打？」\n\n💡 提問小撇步：您可以直接用完整對話發問，或輸入關鍵字組合（例如：VRE 解隔、登革熱 通報）。\n\n🔒 資安提醒：嚴禁於對話框內輸入任何病人姓名、病歷號、床號或具可識別性之醫療個資。\n\n' + WEEKLY_DIGEST_URL;
  }

  // 1. 選擇身分：員工
  else if (text.includes('員工') || text === '1') {
    replyText = '收到！已為您啟用 【院內同仁感管助手模式】 🏥\n\n您可以直接打字發問（如：流感要隔離幾天？），或輸入以下關鍵字快速查詢：\n• 隔離 ➔ 查看各類傳染病隔離防護措施\n• 清消 ➔ 查看環境與設備清消規範\n• TOCC ➔ 檢視感管通報與篩檢重點\n\n' + WEEKLY_DIGEST_URL;
  }
  
  // 2. 選擇身分：民眾
  else if (text.includes('民眾') || text === '2') {
    replyText = '收到！已為您啟用 【民眾衛教諮詢模式】 🌸\n\n您可以直接打字發問（如：發燒要看哪一科？），或輸入以下關鍵字快速查詢：\n• 探病 ➔ 查詢最新探病與陪病規定\n• 疫苗 ➔ 查詢疫苗接種資訊與地點\n• 衛教 ➔ 瀏覽常見傳染病防護知識\n\n' + WEEKLY_DIGEST_URL;
  }

  // 3. 關鍵字：清消 / 隔離
  else if (text.includes('清消') || text.includes('隔離')) {
    replyText = '收到！以下為最新清消與隔離防護重點指引：\n1. 飛沫與接觸防護：出入照護區域請佩戴口罩並落實手部衛生。\n2. 環境清消：使用 500ppm 漂白水進行常規病室環境擦拭；經特殊病原體污染請提升至 1000ppm。\n\n' + WEEKLY_DIGEST_URL;
  }

  // 4. 關鍵字：TOCC / 通報
  else if (text.includes('TOCC') || text.includes('tocc') || text.includes('通報')) {
    replyText = '收到！以下為 TOCC 詢問與通報重點：\n1. 詢問 TOCC：旅遊史 (Travel)、職業 (Occupation)、接觸史 (Contact) 及群聚史 (Cluster)。\n2. 法定傳染病請於規定時限內至院內通報系統完成通報。\n\n' + WEEKLY_DIGEST_URL;
  }

  // 5. 關鍵字：探病 / 陪病
  else if (text.includes('探病') || text.includes('陪病')) {
    replyText = '收到！以下為本院最新探病與陪病規定：\n1. 探病時段：每日固定探病時段，每床限 2 名訪客。\n2. 陪病限制：每床限 1 名陪病者（需佩戴陪病證）。\n3. 防護提醒：有發燒或呼吸道症狀者請暫緩探病。\n\n' + WEEKLY_DIGEST_URL;
  }

  // 6. 關鍵字：疫苗
  else if (text.includes('疫苗')) {
    replyText = '收到！以下為最新疫苗接種資訊：\n1. 本季新冠疫苗已全數撥配至合約院所，高風險族群請儘速接種。\n2. 流感疫苗與新冠疫苗可同時接種於不同部位。\n\n' + WEEKLY_DIGEST_URL;
  }

  // 7. 測試好友專用秘密關鍵字：問卷
  else if (text.includes('問卷')) {
    replyText = '🎉 感謝幫忙測試體驗！體驗問卷活動已經開始囉！\n請點擊連結填寫滿意度問卷即可獲得 150 元電子禮券抽獎資格：\n(請在此貼上問卷網址)\n\n' + WEEKLY_DIGEST_URL;
  }

  // 8. 預設預備回應 (Fallback)
  else {
    replyText = '您好！我是「台大感管LINE起來」AI 助手 🤖\n您可以直接發問感管、清消、隔離、通報、探病等問題，或輸入「你可以問什麼」查看熱門問題範例！\n\n' + WEEKLY_DIGEST_URL;
  }

  const message = {
    type: 'text',
    text: replyText
  };

  replyMessage(replyToken, [message]);
}

/**
 * 呼叫 LINE Messaging API 回應訊息
 */
function replyMessage(replyToken, messages) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken: replyToken,
    messages: messages
  };

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}
