const CONFIG = {
  BOT_VERSION: '2026-11-03-multilingual-travel-22',
  KB_FILE_NAME: 'kb_index.json',
  AUDIT_FILE_NAME: 'audit_clauses.json',
  CLEARANCE_FILE_NAME: 'clearance_rules.json',
  REFERENCE_FILE_NAME: 'bot_reference_data.json',
  MAX_HITS: 6,
  MIN_ANSWER_SCORE: 8,
  MIN_SUGGEST_SCORE: 3,
  MAX_CONTEXT_CHARS: 9000,
  GEMINI_MODEL: 'gemini-2.5-flash-lite',
};

let KB_RUNTIME_CACHE_ = null;
let AUDIT_RUNTIME_CACHE_ = null;
let CLEARANCE_RUNTIME_CACHE_ = null;
let USER_REQUEST_CACHE_ = {};

let BOT_REFERENCE_RUNTIME_CACHE_ = null;

function doGet(e) {
  return ContentService
    .createTextOutput('LINE Bot Webhook 運作正常！版本：' + CONFIG.BOT_VERSION)
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  console.log('>>> NEW DOPOST REQUEST RECEIVED AT ' + (new Date()).toLocaleString());
  try {
    if (!e) {
      console.log('doPost triggered manually from Editor UI. e is undefined.');
      return json_({ ok: true, message: 'doPost manual execution test OK' });
    }

    const body = e.postData && e.postData.contents ? e.postData.contents : '';
    const payload = JSON.parse(body || '{}');
    const events = payload.events || [];

    if (events.length === 0) {
      console.log('LINE Webhook Verify ping received successfully.');
      return json_({ ok: true, message: 'LINE Webhook Verify Success' });
    }

    events.forEach(function(event) {
      if (event.type === 'follow') {
        const followReplyToken = event.replyToken;
        if (!followReplyToken) return;
        const welcomeObj = finalizeAnswer_({
          text: followWelcomeReply_(),
          diseaseName: '身分設定',
          identityPrompt: true
        }, event, '', '', { skipCount: true });
        replyToLine_(followReplyToken, welcomeObj.text, welcomeObj.diseaseName, welcomeObj);
        return;
      }
      if (event.type !== 'message') return;
      if (!event.message || event.message.type !== 'text') return;
      const replyToken = event.replyToken;
      const question = String(event.message.text || '').trim();
      if (!replyToken || !question) return;

      console.log('Received question from LINE: ' + question);
      const answerObj = answerQuestion_(question, event);
      replyToLine_(replyToken, answerObj.text, answerObj.diseaseName, answerObj);
    });

    return json_({ ok: true });
  } catch (err) {
    console.error('doPost error: ' + err.toString());
    return json_({ ok: true });
  }
}

function answerQuestion_(question, event) {
  USER_REQUEST_CACHE_ = {};
  const originalQuestion = convertFullWidthToHalfWidth_(String(question || '')).trim();
  question = originalQuestion;

  const catheterReply = catheterCareReply_(question, event);
  if (catheterReply) {
    return finalizeAnswer_({
      text: catheterReply.text,
      diseaseName: '導管照護',
      subtopic: 'catheter-care',
      clarification: true,
      catheterPrompt: true
    }, event, originalQuestion, question, { skipCount: true });
  }

  const travelFollowup = isTravelVaccineDestinationFollowup_(question, event);
  const languageReply = travelFollowup && languageChoice_(question) ? null : languageGateReply_(question, event);
  if (languageReply) return finalizeAnswer_(languageReply, event, originalQuestion, question, { skipCount: true });
  if (isTravelVaccineQuery_(originalQuestion) || travelFollowup) {
    const requiredIdentity = getLineUserId_(event) && !getUserIdentity_(event) ? identityPromptAnswer_() : null;
    if (requiredIdentity) return finalizeAnswer_(requiredIdentity, event, originalQuestion, question, { skipCount: true });
    const travel = travelVaccineReply_(originalQuestion, event);
    return finalizeAnswer_(travel, event, originalQuestion, question);
  }
  if (isTravelGeneralHealthQuery_(originalQuestion)) {
    const requiredIdentity = getLineUserId_(event) && !getUserIdentity_(event) ? identityPromptAnswer_() : null;
    if (requiredIdentity) return finalizeAnswer_(requiredIdentity, event, originalQuestion, question, { skipCount: true });
    return finalizeAnswer_(travelGeneralHealthReply_(originalQuestion, event), event, originalQuestion, question);
  }
  question = translateQuestionToChinese_(question, event);

  const identityReply = identitySwitchReply_(question, event);
  if (identityReply) return finalizeAnswer_(identityReply, event, originalQuestion, question, { skipCount: true });

  const requiredIdentityReply = getLineUserId_(event) && !getUserIdentity_(event) ? identityPromptAnswer_() : null;
  if (requiredIdentityReply) return finalizeAnswer_(requiredIdentityReply, event, originalQuestion, question, { skipCount: true });

  if (isTravelVaccineQuery_(question)) {
    return finalizeAnswer_(travelVaccineReply_(question, event), event, originalQuestion, question);
  }

  const visitorReply = visitorReply_(question, event);
  if (visitorReply) return finalizeAnswer_(visitorReply, event, originalQuestion, question, { skipCount: true });

  const modeReply = modeSwitchReply_(question, event);
  if (modeReply) return finalizeAnswer_(modeReply, event, originalQuestion, question, { skipCount: true });

  const staleAuditQuickReply = staleAuditQuickPayloadReply_(question);
  if (staleAuditQuickReply) {
    return finalizeAnswer_({
      text: staleAuditQuickReply,
      diseaseName: '評鑑查核',
      clarification: true,
      staleAuditPrompt: true
    }, event, originalQuestion, question, { skipCount: true });
  }

  const feedbackReply = feedbackResponseReply_(question, event);
  if (feedbackReply) return finalizeAnswer_({
    text: feedbackReply,
    diseaseName: '閒聊',
    qualityPrompt: isSatisfactionPromptCommand_(question) && isSatisfactionEligible_(event)
  }, event, originalQuestion, question, { skipCount: true });

  const suggestionReply = suggestionBoxReply_(question, event);
  if (suggestionReply) return finalizeAnswer_({ text: suggestionReply, diseaseName: '閒聊' }, event, originalQuestion, question, { skipCount: true });

  const needlestickActionReply = needlestickActionPriorityReply_(question, event);
  if (needlestickActionReply) {
    return finalizeAnswer_({
      text: needlestickActionReply.text,
      diseaseName: '針扎與體液暴露',
      subtopic: needlestickActionReply.subtopic
    }, event, originalQuestion, question);
  }

  const actualNeedlestickReply = actualNeedlestickExposurePriorityReply_(question);
  if (actualNeedlestickReply) {
    return finalizeAnswer_({
      text: actualNeedlestickReply,
      diseaseName: '針扎與體液暴露',
      subtopic: 'exposure'
    }, event, originalQuestion, question);
  }

  const maskWasteReply = maskWastePriorityReply_(question);
  if (maskWasteReply) {
    return finalizeAnswer_({
      text: maskWasteReply,
      diseaseName: '感染性廢棄物',
      subtopic: 'waste'
    }, event, originalQuestion, question);
  }

  const diseaseAuditActionReply = diseaseAuditActionPriorityReply_(question, event);
  if (diseaseAuditActionReply) {
    return finalizeAnswer_({
      text: diseaseAuditActionReply.text,
      diseaseName: diseaseAuditActionReply.diseaseName,
      subtopic: 'definition'
    }, event, originalQuestion, question);
  }

  const auditGeneralReply = auditGeneralTopicReply_(question, event);
  if (auditGeneralReply) {
    return finalizeAnswer_({
      text: typeof auditGeneralReply === 'string' ? auditGeneralReply : auditGeneralReply.text,
      diseaseName: '評鑑查核',
      subtopic: 'audit',
      auditClauseId: auditGeneralReply.clauseId || '',
      auditClauseTitle: auditGeneralReply.clauseTitle || '',
      auditClauseMenu: !!auditGeneralReply.auditClauseMenu,
      auditTopicMenu: auditGeneralReply.auditTopicMenu || ''
    }, event, originalQuestion, question);
  }

  if (/^(傳染病通報|法定傳染病通報|疾病通報)$/.test(normalizeIntentText_(question).replace(/\s+/g, ''))) {
    return finalizeAnswer_({
      text: '請輸入「疾病名稱＋查詢項目」，我才能提供正確規定：\n- 通報定義與時限\n- 採檢送驗\n- 隔離與院內處置\n\n例如：「麻疹通報」、「登革熱採檢」、「結核病隔離」。',
      diseaseName: '熱門感控',
      clarification: true,
      reportingPrompt: true
    }, event, originalQuestion, question, { skipCount: true });
  }

  const dialysisDisinfectionReply = dialysisDisinfectionConcentrationReply_(question, event);
  if (dialysisDisinfectionReply) {
    return finalizeAnswer_({
      text: dialysisDisinfectionReply,
      diseaseName: '透析室',
      subtopic: 'sanitization'
    }, event, originalQuestion, question);
  }

  const endoscopeReply = endoscopeReprocessingReply_(question);
  if (endoscopeReply) {
    return finalizeAnswer_({
      text: endoscopeReply,
      diseaseName: '內視鏡',
      subtopic: 'reprocessing'
    }, event, originalQuestion, question);
  }

  const fastReply = fastStaticReply_(question);
  if (fastReply) return finalizeAnswer_({ text: fastReply, diseaseName: '閒聊' }, event, originalQuestion, question, { skipCount: true });
  const symptomReply = symptomReply_(question); if (symptomReply) return finalizeAnswer_({ text: symptomReply, diseaseName: '民眾衛教' }, event, originalQuestion, question, { skipCount: true });

  if (/^(會議檢索|查會議|查詢會議)$/.test(normalizeIntentText_(question))) {
    return finalizeAnswer_({
      text: '請輸入想查的議題，例如「感染月報在哪些週會出現」或「VRE在哪些月會出現」。系統只會顯示出現日期。',
      diseaseName: '會議檢索',
      clarification: true
    }, event, originalQuestion, question, { skipCount: true });
  }

  question = applyTopicCarryover_(question, event);

  const meetingReply = isMeetingRecordQuestion_(question) ? meetingRecordReply_(question) : '';
  if (meetingReply) return finalizeAnswer_({ text: meetingReply, diseaseName: '會議檢索' }, event, originalQuestion, question);

  const cjdOperationalReply = cjdOperationalPriorityReply_(question);
  if (cjdOperationalReply) {
    return finalizeAnswer_({
      text: cjdOperationalReply,
      diseaseName: '庫賈氏病',
      subtopic: 'operational',
      cjdAuditPrompt: true
    }, event, originalQuestion, question);
  }

  const earlyAuditDisease = getUserMode_(event) === 'audit' ? detectDisease_(question) : null;
  const earlyAuditFacetReply = earlyAuditDisease ? auditDiseaseFacetReply_(earlyAuditDisease.name, question) : null;
  if (earlyAuditFacetReply) return finalizeAuditFacet_(earlyAuditFacetReply, earlyAuditDisease.name, event, originalQuestion, question);

  const operationalRule = externalIntentRule_(normalizeIntentText_(question), 'operational');
  if (operationalRule) {
    return finalizeAnswer_({
      text: String(operationalRule.reply || ''),
      diseaseName: String(operationalRule.disease_name || '院內作業'),
      subtopic: 'operational',
      cjdAuditPrompt: String(operationalRule.disease_name || '') === '庫賈氏病'
    }, event, originalQuestion, question);
  }

  question = expandDiseaseAliasForSearch_(question);

  const smallTalk = smallTalkReply_(question, event);
  if (smallTalk) return finalizeAnswer_({ text: smallTalk, diseaseName: '閒聊' }, event, originalQuestion, question, { skipCount: true });

  const discordantInfluenzaReply = influenzaDiscordantTestReply_(question);
  if (discordantInfluenzaReply) {
    const needsRiskClarification = needsInfluenzaDiscordantRiskClarification_(question);
    return finalizeAnswer_({
      text: discordantInfluenzaReply,
      diseaseName: '流感',
      subtopic: 'isolation',
      clarification: needsRiskClarification,
      influenzaRiskPrompt: needsRiskClarification
    }, event, originalQuestion, question, { skipCount: needsRiskClarification });
  }

  if (isSeasonalInfluenzaClearanceQuestion_(question)) {
    return finalizeAnswer_({
      text: influenzaClearanceReply_(),
      diseaseName: '流感',
      subtopic: 'clearance'
    }, event, originalQuestion, question);
  }

  if (/帶狀[疱皰]疹/i.test(question) && /解隔|解除隔離|取消隔離/i.test(question)) {
    return finalizeAnswer_({
      text: zosterClearanceReply_(),
      diseaseName: '帶狀疱疹',
      subtopic: 'clearance'
    }, event, originalQuestion, question);
  }

  if (/瀰漫性帶狀[疱皰]疹/i.test(question) && /定義|什麼是|怎麼判斷|如何判斷/i.test(question)) {
    return finalizeAnswer_({
      text: disseminatedZosterDefinitionReply_(),
      diseaseName: '帶狀疱疹',
      subtopic: 'definition'
    }, event, originalQuestion, question);
  }

  const earlySubtopic = detectSubtopic_(question);
  if (!detectDisease_(question) && isAmbiguousSubtopicOnlyQuestion_(question, earlySubtopic)) {
    return finalizeAnswer_({
      text: genericSubtopicClarificationReply_(earlySubtopic),
      diseaseName: '熱門感控',
      subtopic: earlySubtopic,
      clarification: true
    }, event, originalQuestion, question, { skipCount: true });
  }

  if (isKpLabResultQuery_(question)) {
    return finalizeAnswer_({ text: kpLabResultReply_(), diseaseName: 'MDRO' }, event, originalQuestion, question);
  }
  if (isCdcn0146Query_(question)) {
    return finalizeAnswer_({ text: cdcn0146Reply_(), diseaseName: '百日咳' }, event, originalQuestion, question);
  }
  if (isPostExposurePepQuery_(question)) {
    const dis = detectDisease_(question);
    const dName = dis ? dis.name : '針扎與體液暴露';
    return finalizeAnswer_({ text: postExposurePepReply_(question), diseaseName: dName }, event, originalQuestion, question);
  }

  const disease = detectDisease_(question);
  const testResultIsolationReply = diseaseTestResultIsolationReply_(question, disease);
  if (testResultIsolationReply) {
    return finalizeAnswer_({
      text: testResultIsolationReply,
      diseaseName: disease.name,
      subtopic: 'isolation'
    }, event, originalQuestion, question);
  }
  const countryEpidemicText = countryOrRegionEpidemicReply_(question);
  if (countryEpidemicText) {
    return finalizeAnswer_({ text: countryEpidemicText, diseaseName: '疫情資訊' }, event, originalQuestion, question);
  }
  if (isTravelEpidemicQuery_(question)) {
    const epidemicText = travelEpidemicReply_(question, disease);
    if (epidemicText) {
      return finalizeAnswer_({ text: epidemicText, diseaseName: disease ? disease.name : '熱門感控' }, event, originalQuestion, question);
    }
  }

  if (isTravelGeneralHealthQuery_(question)) {
    return finalizeAnswer_(travelGeneralHealthReply_(question, event), event, originalQuestion, question);
  }

  if (disease) {
    const subtopic = detectSubtopic_(question);
    const isCjdDetailQuery = disease.name === '庫賈氏病' && /勾稽|風險判定|鼻腔|器械|去活化|KM佐證/i.test(question);
    const auditFacetReply = getUserMode_(event) === 'audit'
      ? auditDiseaseFacetReply_(disease.name, question)
      : '';
    if (auditFacetReply) return finalizeAuditFacet_(auditFacetReply, disease.name, event, originalQuestion, question);
    if (getUserMode_(event) === 'audit' && !subtopic && !isCjdDetailQuery) {
      const auditReply = auditDiseaseTopicReply_(disease.name, question);
      if (auditReply) {
        return finalizeAnswer_({
          text: auditReply,
          diseaseName: disease.name,
          subtopic: 'audit',
          cjdAuditPrompt: disease.name === '庫賈氏病'
        }, event, originalQuestion, question);
      }
    }
    if (shouldClarifyDiseaseQuestion_(originalQuestion, disease.name, subtopic) || shouldClarifyDiseaseQuestion_(question, disease.name, subtopic)) {
      return finalizeAnswer_({
        text: diseaseClarificationReply_(disease.name),
        diseaseName: disease.name,
        clarification: true
      }, event, originalQuestion, question, { skipCount: true });
    }
    const plainDef = isPlainDefinitionQuestion_(question) ? diseasePlainDefinitionReply_(disease.name) : '';
    if (plainDef) return finalizeAnswer_({ text: plainDef, diseaseName: disease.name, subtopic: 'plain-definition' }, event, originalQuestion, question);
    if (subtopic === 'definition') {
      const definitionReply = cdcNotificationDefinitionReply_(disease.name);
      if (definitionReply) {
        return finalizeAnswer_({ text: definitionReply, diseaseName: disease.name, subtopic: subtopic }, event, originalQuestion, question);
      }
      return finalizeAnswer_({
        text: safeDiseaseSubtopicFallback_(disease.name, 'definition'),
        diseaseName: disease.name,
        subtopic: subtopic
      }, event, originalQuestion, question);
    }
    if (subtopic === 'specimen') {
      const specimenReply = cdcSpecimenReply_(disease.name);
      if (specimenReply) {
        return finalizeAnswer_({ text: specimenReply, diseaseName: disease.name, subtopic: subtopic }, event, originalQuestion, question);
      }
    }
    if (subtopic === 'clearance') {
      const clearanceReply = mdroClearanceReply_(disease.name) || generalClearanceReply_(disease.name);
      if (clearanceReply) {
        return finalizeAnswer_({ text: clearanceReply, diseaseName: disease.name, subtopic: subtopic }, event, originalQuestion, question);
      }
    }
    const profile = diseaseInfectionControlProfile_(disease.name);
    if (profile) {
      if (subtopic) {
        const subReply = diseaseSubtopicReply_(disease.name, profile, subtopic);
        if (subReply) return finalizeAnswer_({ text: subReply, diseaseName: disease.name, subtopic: subtopic }, event, originalQuestion, question);
      }
      return finalizeAnswer_({ text: diseaseFullOverviewReply_(disease.name, profile), diseaseName: disease.name }, event, originalQuestion, question);
    }
    if (subtopic === 'sanitization') {
      return finalizeAnswer_({
        text: genericDiseaseSanitizationReply_(disease.name),
        diseaseName: disease.name,
        subtopic: subtopic
      }, event, originalQuestion, question);
    }
  }

  const hits = searchKb_(question, CONFIG.MAX_HITS);
  if (!hits.length || Number(hits[0]._score || 0) < CONFIG.MIN_SUGGEST_SCORE) {
    const scopedFallback = disease && detectSubtopic_(question)
      ? safeDiseaseSubtopicFallback_(disease.name, detectSubtopic_(question))
      : '';
    if (scopedFallback) {
      return finalizeAnswer_({
        text: scopedFallback,
        diseaseName: disease.name,
        subtopic: detectSubtopic_(question)
      }, event, originalQuestion, question);
    }
    return finalizeAnswer_({
      text: '目前未檢索到相符規範。請輸入「疾病＋項目」，如：麻疹暴露、百日咳採檢、VRE隔離。',
      diseaseName: disease ? disease.name : '熱門感控'
    }, event, originalQuestion, question, { skipCount: true });
  }

  if (Number(hits[0]._score || 0) < CONFIG.MIN_ANSWER_SCORE) {
    const scopedFallback = disease && detectSubtopic_(question)
      ? safeDiseaseSubtopicFallback_(disease.name, detectSubtopic_(question))
      : '';
    if (scopedFallback) {
      return finalizeAnswer_({
        text: scopedFallback,
        diseaseName: disease.name,
        subtopic: detectSubtopic_(question)
      }, event, originalQuestion, question);
    }
    return finalizeAnswer_({ text: suggestTopics_(question, hits), diseaseName: disease ? disease.name : '熱門感控' }, event, originalQuestion, question, { skipCount: true });
  }

  const context = buildContext_(hits, CONFIG.MAX_CONTEXT_CHARS);
  const geminiAnswer = callGemini_(question, context, getUserLanguage_(event));
  if (geminiAnswer) return finalizeAnswer_({
    text: cleanAnswerText_(geminiAnswer),
    diseaseName: disease ? disease.name : '熱門感控',
    cjdAuditPrompt: !!(disease && disease.name === '庫賈氏病' && getUserMode_(event) === 'audit')
  }, event, originalQuestion, question);

  return finalizeAnswer_({
    text: disease && detectSubtopic_(question)
      ? diseaseScopedExtractiveAnswer_(hits, disease.name, detectSubtopic_(question))
      : extractiveAnswer_(hits, disease ? disease.name : ''),
    diseaseName: disease ? disease.name : '熱門感控',
    cjdAuditPrompt: !!(disease && disease.name === '庫賈氏病' && getUserMode_(event) === 'audit')
  }, event, originalQuestion, question);
}

function cjdOperationalPriorityReply_(question) {
  const q = normalizeIntentText_(question);
  if (!/(cjd|庫賈氏病|庫賈氏症)/i.test(q)) return '';

  if (/KM佐證/i.test(q)) {
    return 'CJD 查核 KM 佐證：\n' +
      '- KM：50300-3-000013「庫賈氏病感染管制措施」。\n' +
      '- 院內系統：CJD 勾稽歷程、手術或檢查排程及列管狀態。\n' +
      '- 跨單位紀錄：手術室、供應室與感染管制中心通知紀錄。\n' +
      '- 器械紀錄：接觸組織風險分類、器械分流及去活化／封存／報廢處理紀錄。';
  }

  if (/手動勾稽/.test(q)) {
    return 'CJD 疾管署手動勾稽：\n' +
      '- 適用情形：臨時排程、排程畫面沒有勾稽紀錄，或臨床已知有 CJD 風險疑慮。\n' +
      '- 使用醫事人員卡及單卡讀卡機；雙卡型讀卡機不適用。\n' +
      '- 院所代碼：0401180014。\n' +
      '- 查得結果後務必執行「儲存」，將結果留存在本院資料庫，作為院內勾稽佐證。\n' +
      '- 操作說明：KM「庫賈氏病單筆勾稽、批次查詢、查看 API 歷程操作方法」。';
  }

  if (/勾稽/.test(q) && /(院內|系統|紀錄|歷程|portal|怎麼查|怎麼看|如何查|如何看)/i.test(q)) {
    return 'CJD 院內系統勾稽紀錄查詢：\n' +
      '- 在 portal 的手術或檢查排程畫面查看最新程式勾稽歷程。\n' +
      '- 顯示「列管中」：啟動相對應的感染管制措施。\n' +
      '- 有勾稽紀錄且皆無列管：仍須依臨床病史、處置部位及醫療團隊評估風險。\n' +
      '- 沒有勾稽紀錄：查看交班單或改做手動查詢；臨時排程或已知有風險時不可只等待批次勾稽。\n' +
      '- 程式勾稽範圍：排程前 6 日至後 2 日。\n' +
      '- KM「庫賈氏病單筆勾稽、批次查詢、查看 API 歷程操作方法」：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=157420';
  }

  if (/(中高感染力組織|中高風險組織|高感染力組織|中感染力組織).*(有哪些|是什麼|包含|分類)?/.test(q)) {
    return 'CJD 中、高感染力組織摘要：\n' +
      '- 高感染力（各型 CJD）：腦、脊髓、顱神經與顱神經節、後眼部及腦下垂體。\n' +
      '- 中感染力（各型 CJD）：脊神經節、嗅覺上皮。\n' +
      '- vCJD／未確定型另注意：扁桃腺、脾、闌尾、胸腺、腎上腺、淋巴結及腸相關淋巴組織。\n' +
      '- 侵入性處置前仍須依病型、部位及院內正式規範判定器械分流。';
  }

  if (/鼻腔/.test(q) && /(手術|內視鏡|侵入性處置|處置)/.test(q)) {
    return 'CJD 病人接受鼻腔手術或侵入性處置：\n' +
      '- 先確認病人是否為 CJD／vCJD 確定、極可能、可能、診斷未定或風險個案，並查閱院內 CJD 勾稽歷程。\n' +
      '- 評估處置是否涉及中或高感染力組織；若有替代檢查或治療，優先評估替代方案。\n' +
      '- 必須手術時，事前通知手術室、供應室、感染管制中心及相關團隊，原則安排當天最後一台。\n' +
      '- 接觸中、高感染力組織的器械須與低感染力器械分流；無法區分時，視為高感染力器械處理。\n' +
      '- 器械送供應室過程保持濕潤；後續去活化方式依院內 CJD 正式規範及器械材質限制辦理。';
  }
  return '';
}

function staleAuditQuickPayloadReply_(question) {
  const q = normalizeIntentText_(question);
  if (!/^熱門感控(?:可出示執行紀錄|KM佐證|評鑑委員可能提問|感染管制處置重點)$/i.test(q)) return '';
  return '這是舊版快捷鈕，訊息中沒有帶入原查核主題，因此無法判定要查哪一項。\n請重新輸入主題，例如「內視鏡」、「導管照護」、「手部衛生」或疾病名稱，再點選相應面向。';
}

function followWelcomeReply_() {
  return '請先選擇身分：\n- 院內員工：查院內流程與查核。\n- 訪客/民眾：查衛教，不提供院內文件、KM 佐證。\n\n不提供疾病診斷、醫師推薦；請用台大醫院 App。';
}

function identitySwitchReply_(question, event) {
  const userId = getLineUserId_(event);
  if (!userId) return null;
  const q = normalizeIntentText_(question);
  const isStaff = /^(院內員工|員工|同仁|醫療同仁|工作人員|staff|我是員工|我是同仁)$/.test(q);
  const isPublic = /^(訪客|民眾|一般民眾|病人|家屬|非員工|public|visitor|我是訪客|我是民眾)$/.test(q);
  if (!isStaff && !isPublic) return /^(切換身分|身分切換|身份切換|重新選身分|重新選身份|我是誰|身分設定|身份設定)$/.test(q) ? identityPromptAnswer_() : null;
  const state = getUserState_(userId);
  state.identity = isStaff ? 'staff' : 'public';
  state.identitySetAt = new Date().toISOString();
  saveUserState_(userId, state);
  saveUserMode_(event, isStaff ? (getUserMode_(event) || 'clinical') : 'clinical');
  return {
    text: isStaff
      ? '已設定為院內員工。可查院內流程、臨床照護與評鑑查核；之後仍可切換。'
      : '已設定為訪客/民眾。以衛教、旅遊疫情與就醫前提醒為主；不提供院內文件、KM 佐證或內部紀錄。',
    diseaseName: '身分設定'
  };
}

function identityPromptAnswer_() {
  return { text: '請先選擇身分：\n- 院內員工：查院內流程與評鑑查核。\n- 訪客/民眾：以衛教為主，不提供院內文件。', diseaseName: '身分設定', identityPrompt: true };
}

function visitorReply_(question, event) {
  if (getUserIdentity_(event) !== 'public') return null;
  const q = normalizeIntentText_(question);
  const boundary = /評鑑|查核|稽核|委員|佐證|km|會議|週會|月會|會議檢索|院內系統|醫囑|ann\d+|執行紀錄|稽核表|文件|sop/i.test(q);
  const disease = detectDisease_(question);
  if (!boundary && (isTravelEpidemicQuery_(question) || (!isLikelyClinicalQuestion_(question) && !disease))) return null;
  return {
    text: publicEducationReply_(question, disease && disease.name ? disease.name : ''),
    diseaseName: disease && disease.name ? disease.name : '民眾衛教',
    publicEducation: true
  };
}

function publicEducationReply_(question, diseaseName) {
  const d = String(diseaseName || '').trim();
  const label = d || '感染預防';
  const lines = [
    label + '衛教提醒：',
    '- 有發燒、咳嗽、腹瀉、皮疹或不適，請戴口罩、洗手，依症狀嚴重度就醫。',
    '- 訪客模式不提供院內文件；個人醫療請走正式醫療管道。'
  ];
  if (/旅遊|疫區|出國|國家|地區/.test(String(question || ''))) {
    lines.splice(1, 0, '- 旅遊前請確認目的地疫情、疫苗與防蚊/飲食衛生建議；旅途中若不適，請戴口罩並及早就醫。');
  }
  return lines.join('\n');
}

function symptomReply_(q) { const s=String(q||''),p=/(我|i\s*(have|am)|saya|tôi|ฉัน)/i.test(s); return !(detectDisease_(s)&&!p)&&!/(掛號|看診|就醫|哪一科|醫師|doctor)/i.test(s)&&/發燒|咳嗽|腹瀉|皮疹|fever|cough|diarrhea|rash|demam|batuk|diare|ruam|sốt|ho|tiêu chảy|phát ban|ไข้|ไอ|ท้องเสีย|ผื่น/i.test(s)?publicEducationReply_(s,'發燒或症狀'):''; }

function isPlainDefinitionQuestion_(q){return /什麼是|是什麼|what\s+is|apa\s+itu|là\s+gì|คืออะไร/i.test(String(q||''));}

function diseasePlainDefinitionReply_(name){return String(name||'')==='VRE'?'VRE 是抗萬古黴素腸球菌，不是 CDC 法定傳染病通報疾病。\n- 可為移生或感染，需看檢體與症狀。\n- 重點是手衛生、接觸防護、清消；若要查醫囑請問「VRE 隔離」。':'';}

function dialysisDisinfectionConcentrationReply_(question, event) {
  const q = normalizeIntentText_(question);
  if (!/(透析室|血液透析室|洗腎室|透析機)/i.test(q)) return '';
  if (!/(消毒|清消|清潔|漂白水|濃度)/i.test(q)) return '';
  const clinicalSummary = '透析室清潔消毒濃度：\n' +
    '- 桌椅、床旁環境表面及地面：1,000 ppm 漂白水（以 5% 原液約 1:50 稀釋）。\n' +
    '- 血液／體液污染小於 10 mL：1,000 ppm 覆蓋 10 分鐘；大於 10 mL：5,000 ppm 覆蓋 10 分鐘，移除髒污後再清潔消毒。\n' +
    '- 透析機表面及器械：每位病人使用後，以設備相容的消毒劑擦拭；內部血液滲漏依機器規範完成內外部清潔及化學消毒。';
  if (getUserMode_(event) !== 'audit') return clinicalSummary;
  return clinicalSummary + '\n\n評鑑查核可出示：\n' +
    '- KM：50300-3-000011「透析室感染管制措施」。\n' +
    '- 現場紀錄：漂白水泡製／濃度與日期標示、每位病人後透析機及環境清消紀錄。\n' +
    '- 設備紀錄：透析機維護、化學消毒及血液滲漏處理紀錄。\n' +
    '- 人員佐證：血液／體液污染清除流程及教育訓練紀錄。';
}

function endoscopeReprocessingReply_(question) {
  const q = normalizeIntentText_(question);
  if (!/內視鏡/i.test(q) || /庫賈氏|CJD|鼻腔手術/i.test(q)) return '';

  if (/執行紀錄|可出示紀錄|查核紀錄/i.test(q)) {
    return '內視鏡再處理可出示執行紀錄：\n' +
      '- 每支內視鏡：前置清洗、測漏、手工清洗、高層次消毒、漂清、乾燥及儲存紀錄。\n' +
      '- 消毒管理：消毒劑有效濃度、溫度、接觸時間及更換紀錄。\n' +
      '- 設備與品質：自動化再處理機保養、微生物監測、異常處理及複檢結果。\n' +
      '- 可追溯性：內視鏡編號、處理人員、處理時間及使用病人之對應紀錄。\n' +
      '- KM：50300-2-000010「內視鏡再處理作業管理要點」及相關技術稽核表。';
  }
  if (/委員提問/i.test(q)) {
    return '內視鏡查核委員可能提問：\n' +
      '- 如何確認每支內視鏡完成測漏、手工清洗及高層次消毒？\n' +
      '- 消毒劑濃度、溫度與接觸時間如何監測？\n' +
      '- 如何維持乾燥、儲存及病人與內視鏡的可追溯性？\n' +
      '- 微生物監測異常時，何時停用、改善及恢復使用？';
  }
  if (/KM佐證/i.test(q)) {
    return '內視鏡查核 KM 佐證：\n' +
      '- 50300-2-000010「內視鏡再處理作業管理要點」。\n' +
      '- 附件：再處理流程、技術稽核表、微生物監測及異常處理相關表單。';
  }

  if (/微生物.*(監測|異常)|監測.*異常/i.test(q)) {
    return '內視鏡微生物監測異常處理：\n' +
      '- 該內視鏡先暫停使用，完成原因分析與改善。\n' +
      '- 查核採檢步驟、再處理流程、消毒劑有效濃度、自動化再處理機功能及環境清潔。\n' +
      '- 依流程執行雙重高層次消毒或滅菌後複檢；仍不合格則送原廠處理，至複檢合格才可恢復使用。\n' +
      '- 同步依感染管制中心流程追蹤曾使用該鏡之病人及相關紀錄。\n' +
      'KM：50300-2-000010「內視鏡再處理作業管理要點」及其微生物監測異常處理附件。';
  }
  if (/乾燥|儲存|存放/i.test(q)) {
    return '內視鏡乾燥與儲存重點：\n' +
      '- 最後漂清後執行 Alcohol flush，並以自動化再處理機 Air purge 或手動乾燥 10 分鐘加強乾燥。\n' +
      '- 依儲存櫃規範水平或垂直存放，避免鏡身互相碰撞；垂直懸掛時不可接觸櫃底。\n' +
      '- 一般內視鏡儲存超過 7 日須重新高層次消毒；十二指腸鏡及線性超音波內視鏡超過 3 日須重新處理。\n' +
      'KM：50300-2-000010「內視鏡再處理作業管理要點」附件二、三及相關技術稽核表。';
  }
  if (/手工清洗|刷洗/i.test(q)) {
    return '內視鏡手工清洗重點：\n' +
      '- 檢查後先完成前置清洗及安全覆蓋運送，再依型號與廠商說明書執行測漏。\n' +
      '- 在流動水下刷洗吸引管路、處置管路及所有管腔；管路刷至少通過 3 次，直到刷毛無可見殘渣，雙頭刷不回抽。\n' +
      '- 刷洗後完整漂清，再進入高層次消毒；清洗不完整時不可直接以消毒取代。\n' +
      'KM：50300-2-000010「內視鏡再處理作業管理要點」及內視鏡再處理技術稽核表。';
  }
  if (/高層次消毒/i.test(q)) {
    return '內視鏡高層次消毒重點：\n' +
      '- 原則上使用自動化內視鏡再處理機；實務上無法採自動化處理時，才依核定流程執行手工高層次消毒。\n' +
      '- 消毒前必須完成測漏、手工清洗及漂清；內視鏡與所有管路均須完整接觸消毒劑。\n' +
      '- 消毒劑濃度、溫度與接觸時間依院內核定流程及產品說明執行，並留下高層次消毒日期紀錄。\n' +
      'KM：50300-2-000010「內視鏡再處理作業管理要點」附件二、三。';
  }
  if (/^(內視鏡|內視鏡再處理|內視鏡再處理流程)$/i.test(q)) {
    return '內視鏡再處理流程重點：\n' +
      '- 依序完成檢查後前置清洗、安全覆蓋運送、測漏、手工清洗、漂清、高層次消毒、最後漂清、乾燥及專用儲存櫃儲存。\n' +
      '- 再處理區須張貼適用流程；操作人員穿戴適當 PPE，新進人員完成訓練及技術查核後才可執行。\n' +
      '- 每次使用均應留下可追溯紀錄，並確認消毒劑有效濃度及容器最低有效濃度檢測。\n' +
      'KM：50300-2-000010「內視鏡再處理作業管理要點」及附件二至八。';
  }
  return '';
}

function fastStaticReply_(question) {
  const q = normalizeIntentText_(question);
  if (/^(可以查什麼|可以問什麼|你能做什麼|你能查什麼|你能回答什麼|你能答什麼|你可以做什麼|你可以回答什麼|你可以答什麼|你會做什麼|你能幫我什麼|你提供什麼服務|有什麼功能|你現在有什麼在執行的事|你現在在執行什麼|你目前在執行什麼|你現在在做什麼|你目前在做什麼|選單|主選單|目錄|說明|幫助|功能|你是誰|help|menu|whatcanthisbotdo|whatcanyoudo|whatcanidowiththisbot|whoareyou|whatsyourname|what'syourname|\?|？)$/.test(q)) {
    return '您好，我是台大感管 LINE 查詢助手。可查感染管制、法定傳染病通報、隔離/解隔、檢體送驗、疫區、清消濃度、查核重點，也可查週會/月會議題曾在哪些日期出現。\n\n提問範例：VRE 解隔、登革熱通報、伊波拉疫區、感染月報在哪些週會出現。';
  }
  return '';
}

function modeSwitchReply_(question, event) {
  if (getUserIdentity_(event) === 'public') {
    const q0 = String(question || '').trim();
    if (/^(評鑑查核|評鑑查核模式|查核模式|評鑑模式|委員查核|臨床照護|臨床照護模式|臨床模式|照護模式|第一線照護)$/i.test(q0)) {
      return {
        text: '您目前是訪客/民眾身分，回答會以衛教、旅遊疫情與就醫前提醒為主，不提供院內評鑑查核、KM 佐證或內部流程文件。\n\n若您是院內員工，請點「院內員工」重新設定身分。',
        diseaseName: '身分設定',
        identityPrompt: true
      };
    }
  }
  const q = String(question || '').trim();
  if (/^(評鑑查核|評鑑查核模式|查核模式|評鑑模式|委員查核)$/i.test(q)) {
    saveUserMode_(event, 'audit');
    return {
      text: '已切換為評鑑查核模式。\n\n之後回答會優先提醒：查核委員可能追問什麼、現場同仁怎麼回答、需要準備哪些紀錄或佐證。若要回到第一線處置，請點「臨床照護」。',
      diseaseName: '模式切換'
    };
  }
  if (/^(臨床照護|臨床照護模式|臨床模式|照護模式|第一線照護)$/i.test(q)) {
    saveUserMode_(event, 'clinical');
    return {
      text: '已切換為臨床照護模式。\n\n之後回答會優先整理：病人安置、隔離醫囑、PPE、採檢送驗、清消與現場可執行步驟。若遇到查核或委員提問，請點「評鑑查核」。',
      diseaseName: '模式切換'
    };
  }
  return null;
}

function modeAwareAnswer_(answerObj, event) {
  const mode = getUserMode_(event);
  const obj = answerObj || { text: '', diseaseName: '' };
  obj.text = String(obj.text || '').trim();
  obj.mode = mode;
  obj.modeExplicit = hasExplicitUserMode_(event);
  obj.identity = getUserIdentity_(event);
  return obj;
}

function finalizeAnswer_(answerObj, event, originalQuestion, effectiveQuestion, options) {
  const opts = options || {};
  const obj = modeAwareAnswer_(answerObj, event);
  obj.originalQuestion = String(originalQuestion || '');
  obj.effectiveQuestion = String(effectiveQuestion || originalQuestion || '');
  const shouldCount = !opts.skipCount && isCountableAnswer_(obj, originalQuestion, effectiveQuestion);
  const prompt = updateConversationState_(event, originalQuestion, effectiveQuestion, obj, shouldCount);
  if (prompt && obj.text.indexOf(prompt) < 0) {
    obj.text = String(obj.text || '').trim() + '\n\n' + prompt;
    obj.qualityPrompt = true;
  }
  obj.satisfactionEligible = isSatisfactionEligible_(event);
  if (obj.travelVaccine && !obj.text.trim()) obj.text = '旅遊疫苗摘要目前無法產生，請稍後重試或洽旅遊醫學門診。';
  obj.text = appendPolicySummaryReminder_(obj.text, obj, effectiveQuestion);
  obj.text = appendPrivacyReminder_(obj.text, event);
  obj.text = translateAnswerForUserLanguage_(obj.text, event, obj);
  if (obj.travelVaccine) {
    obj.text += '\n\nCDC Travelers’ Health: ' + obj.travelSourceUrl;
    obj.text += '\nTaiwan CDC: https://www.cdc.gov.tw/Category/MPage/6786';
    if (obj.travelCheckedAt) obj.text += '\nCDC retrieved (UTC): ' + obj.travelCheckedAt;
  }
  return obj;
}

function finalizeAuditFacet_(reply, diseaseName, event, originalQuestion, question) {
  return finalizeAnswer_({ text: reply.text, diseaseName: diseaseName, subtopic: reply.facet }, event, originalQuestion, question);
}

function appendPolicySummaryReminder_(text, answerObj, question) {
  const body = String(text || '').trim();
  const obj = answerObj || {};
  const reminder = '如與正式公告不一致，以正式公告為準。';
  if (!body || body.indexOf(reminder) >= 0) return body;
  if (obj.clarification || obj.diseaseName === '會議檢索' || obj.diseaseName === '閒聊' || obj.diseaseName === '語言切換') return body;
  return body + '\n\n' + reminder;
}

function appendPrivacyReminder_(text, event) {
  const body = String(text || '').trim();
  const reminder = '請勿輸入病人姓名、病歷號、床號等個資。';
  const policyReminder = '如與正式公告不一致，以正式公告為準。';
  if (!body || body.indexOf(reminder) >= 0) return body;
  if (!shouldShowPrivacyReminder_(event)) return body;
  return body + (body.endsWith(policyReminder) ? ' ' : '\n\n') + reminder;
}

function shouldShowPrivacyReminder_(event) {
  const userId = getLineUserId_(event);
  if (!userId) return true;
  try {
    const state = getUserState_(userId);
    const index = Number(state.privacyNoticeReplyCount || 0) + 1;
    state.privacyNoticeReplyCount = index;
    saveUserState_(userId, state);
    return index === 1 || (index - 1) % 5 === 0;
  } catch (err) {
    console.error('shouldShowPrivacyReminder_ skipped: ' + err.toString());
    return true;
  }
}

function getUserLanguage_(event) {
  const userId = getLineUserId_(event);
  if (!userId) return 'zh-TW';
  const state = getUserState_(userId);
  return state.language || 'zh-TW';
}

function translateQuestionToChinese_(q,e){const l=getUserLanguage_(e),s=String(q||'');if(l==='zh-TW'||/[\u4e00-\u9fff]/.test(s))return s;const g=callGeminiTranslate_(s,'zh');if(g)return g;try{const f={en:'en',id:'id',vi:'vi',th:'th'}[l]||'';return f?LanguageApp.translate(s.slice(0,800),f,'zh-TW'):s;}catch(err){return s;}}

function languagePromptText_(detectedLanguage) {
  return '請選擇您偏好的語言 / Please select your preferred language:';
}

function isLanguageResetKeyword_(question) {
  const q = normalizeIntentText_(question);
  if (/^(切換|換|重設|選擇|多)?語言$/.test(q)) return true;
  if (/^(language|changelanguage|switchlanguage|resetlanguage|selectlanguage|lang)$/i.test(q)) return true;
  if (/^(bahasa|gantibahasa|ubahbahasa|pilihbahasa)$/i.test(q)) return true;
  if (/^(ngônngữ|ngonngu|đổingônngữ|doingonngu|chọnngônngữ|chonngonngu)$/i.test(q)) return true;
  return false;
}

function languageChoice_(question) {
  const q = String(question || '').trim().toLowerCase();
  if (/^(繁體中文|中文|國語|華語|zh-tw|zh_tw|chinese|traditional chinese|🇹🇼)$/i.test(q)) return 'zh-TW';
  if (/^(english|eng|en|英文|英語|🇺🇸|🇬🇧)$/i.test(q)) return 'en';
  if (/^(bahasa indonesia|bahasa|indonesia|indonesian|印尼文|印尼語|🇮🇩)$/i.test(q)) return 'id';
  if (/^(tiếng việt|tieng viet|vietnamese|vietnam|越南文|越南語|🇻🇳)$/i.test(q)) return 'vi'; if (/^(ไทย|thai|th|泰文|泰語|🇹🇭)$/i.test(q)) return 'th';
  return '';
}

function languageSetReplyText_(language) {
  const map={en:'English set.',id:'Bahasa Indonesia set.',vi:'Tiếng Việt set.',th:'ตั้งค่าภาษาไทยแล้ว'};
  return map[language] || '語言已設定為繁體中文。';
}

function detectForeignLanguageForPrompt_(question) {
  const raw = String(question || '').trim();
  if (!raw) return '';
  if (/[\u4e00-\u9fff]/.test(raw)) return '';
  if (/[\u0E00-\u0E7F]/.test(raw)) return 'Thai';
  const lower = raw.toLowerCase();
  const compact = lower.replace(/[^a-z0-9]+/g, '');
  if (!compact) return '';
  if (/^(vre|cre|mrsa|mrse|crab|crpa|mdro|mdroe|kp|tb|hiv|hbv|hcv|covid|cjd|ppe|jev|hib|ipd)$/.test(compact)) return '';
  if (/^(influenzaa|influenzab|flu|ebola|mpox|malaria|measles|rubella|mumps|scabies|dengue|chikungunya|zika|cholera)$/.test(compact)) return '';
  if (/\b(apa|bagaimana|saya|anda|rumah sakit|infeksi|isolasi|bahasa|kepuasan|puas|vaksin|vaksinasi|imunisasi|bepergian|perjalanan)\b/i.test(lower)) return 'Bahasa Indonesia';
  if (/tôi|bạn|bệnh|cách|hiểm|ngôn ngữ|hài lòng|phản hồi|đánh giá|tiêm|vắc.?xin|du lịch/i.test(lower) ||
      /\b(toi|ban|benh|cach|nguy|hiem|ngon ngu|hai long|phan hoi|danh gia|tiem|vac xin|du lich)\b/i.test(lower)) return 'Tiếng Việt';
  if (/\b(what|how|when|where|why|can|should|need|report|isolation|specimen|infection|travel|hospital|patient|fever|cough|satisfaction|feedback|rating|vaccines?|vaccinations?|shots?|jabs?|immunization|immunisation)\b/i.test(lower)) return 'English';
  return '';
}

function languageGateReply_(question, event) {
  const userId = getLineUserId_(event);
  if (!userId) return null;
  const q = String(question || '').trim();
  const state = getUserState_(userId);

  if (isLanguageResetKeyword_(q)) {
    return { text: languagePromptText_(''), diseaseName: '語言切換', languagePrompt: true };
  }

  const selected = languageChoice_(q);
  if (selected) {
    state.language = selected; state.languageManual = true; delete state.languageAuto;
    saveUserState_(userId, state);
    return { text: languageSetReplyText_(selected), diseaseName: '語言切換', languagePrompt: true };
  }

  if (/[\u4e00-\u9fff]/.test(q) && state.language !== 'zh-TW') { state.language = 'zh-TW'; delete state.languageAuto; saveUserState_(userId, state); }
  const detected = detectForeignLanguageForPrompt_(q);
  const autoLang = detected === 'English' ? 'en' : detected === 'Bahasa Indonesia' ? 'id' : detected === 'Tiếng Việt' ? 'vi' : detected === 'Thai' ? 'th' : '';
  if (autoLang) {
    state.language = autoLang; state.languageAuto = true; saveUserState_(userId, state);
    return null;
  }

  return null;
}

function isCountableAnswer_(answerObj, originalQuestion, effectiveQuestion) {
  const d = String(answerObj && answerObj.diseaseName || '');
  if (!d || d === '閒聊' || d === '模式切換') return false;
  const q = String(originalQuestion || effectiveQuestion || '');
  if (isLowValueOrMetaQuestion_(q)) return false;
  return true;
}

function applyTopicCarryover_(question, event) {
  const q = convertFullWidthToHalfWidth_(String(question || '')).trim();
  const userId = getLineUserId_(event);
  if (!q || !userId) return q;
  const state = getUserState_(userId);
  const lastTopic = String(state.lastTopic || '').trim();
  if (!lastTopic || Number(state.topicChainCount || 0) >= 5) return q;
  if (isExplicitDifferentTopic_(q, state)) return q;
  if (!isTopicFollowupQuestion_(q)) return q;
  if (isStyleOnlyFollowup_(q) && state.lastSubtopic) {
    return lastTopic + ' ' + subtopicLabel_(state.lastSubtopic) + ' ' + q;
  }
  return lastTopic + ' ' + q;
}

function isTopicFollowupQuestion_(question) {
  const q = normalizeIntentText_(question);
  if (!q) return false;
  if (/^(白話一點|白話|講人話|說人話|簡單講|回答短一點|只回答重點|只列流程|只列醫囑|用查核口吻|用臨床流程回答|補檢體|請補檢體|補診斷條件|補通報定義|補臨床流程|補院內系統操作)$/.test(q)) return true;
  if (/^(通報定義|通報要件|通報條件|通報標準|病例定義|病例要件|病例條件|診斷要件|診斷條件|診斷定義|診斷標準|通報|採檢|送驗|檢體|採檢送驗|隔離|隔離醫囑|解隔|解除隔離|解隔標準|取消隔離|ppe|防護|病人安置|床位|病房|清消|消毒|漂白水|暴露|造冊|預防用藥|抗病毒|抗蟲藥|用藥|醫令|開方|診斷碼|流程|系統操作|轉送|檢查)$/.test(q)) return true;
  return q.length <= 8 && /定義|要件|條件|流程|醫囑|檢體|安置|床位|防護|清消|解隔|隔離|造冊|暴露|疫區/.test(q);
}

function isAmbiguousSubtopicOnlyQuestion_(question, subtopic) {
  if (!subtopic) return false;
  const q = normalizeIntentText_(question);
  if (!q) return false;
  if (detectDisease_(q)) return false;
  return /^(通報定義|通報要件|通報條件|通報標準|病例定義|病例要件|病例條件|診斷要件|診斷條件|診斷定義|診斷標準|通報|採檢|送驗|檢體|採檢送驗|隔離|隔離醫囑|解隔|解除隔離|解隔標準|取消隔離|ppe|防護|病人安置|床位|病房|清消|消毒|漂白水|暴露|造冊|預防用藥|抗病毒|抗蟲藥|用藥|醫令|開方|診斷碼|流程|系統操作|轉送|檢查)$/.test(q);
}

function genericSubtopicClarificationReply_(subtopic) {
  const label = subtopicLabel_(subtopic) || '查詢項目';
  if (subtopic === 'clearance') {
    return '請問您要查哪一種疾病或菌株的解隔標準？\n\n' +
      '不同疾病差很多，例如 VRE 要看原部位與肛門/直腸篩檢，流感看症狀與院內解隔規範，水痘看水泡是否全數結痂。\n\n' +
      '可直接點下方快捷鈕，或輸入「VRE解隔」、「流感解隔」、「水痘解隔」。';
  }
  if (subtopic === 'definition') {
    return '請問您要查哪一個疾病的通報定義？\n\n' +
      '請用「疾病名稱 + 通報定義」詢問，例如「麻疹通報定義」、「未定型肝炎通報定義」、「新型A型流感通報定義」。';
  }
  if (subtopic === 'specimen') {
    return '請問您要查哪一個疾病的採檢送驗？\n\n' +
      '請用「疾病名稱 + 採檢」詢問，例如「日腦採檢」、「流腦採檢」、「登革熱採檢」。MDRO 類則通常是送本院檢醫部，不是送 CDC。';
  }
  return '請問您要查哪一個疾病或情境的「' + label + '」？\n\n' +
    '請用「疾病名稱 + 想問項目」詢問，例如「登革熱隔離醫囑」、「VRE病人安置」、「麻疹暴露」、「透析室清消」。';
}

function shouldClarifyDiseaseQuestion_(question, diseaseName, subtopic) {
  const q = normalizeIntentText_(question);
  if (!diseaseName || subtopic) return false;
  if (/疫區|旅遊疫情|有何疫情|有哪些疫情|特殊傳染病/.test(q)) return false;
  if (/檢驗出|培養出|報告出|陽性|篩檢陽性/.test(q)) return false;
  if (isAliasOnlyDiseaseQuestion_(question, diseaseName)) return true;
  const compactDisease = normalizeIntentText_(diseaseName);
  if (q === compactDisease) return true;
  if (q.replace(compactDisease, '') === '') return true;
  if (/感染管制|感控|sop|處置|流程|怎麼辦|注意事項|照護重點|臨床處置|標準流程/.test(q)) return true;
  return false;
}

function isAliasOnlyDiseaseQuestion_(question, diseaseName) {
  const q = compactAliasText_(question);
  if (!q || q.length > 18) return false;
  const terms = [diseaseName];
  try {
    const kb = loadKb_();
    const synonyms = kb.synonyms || {};
    const list = synonyms[diseaseName] || synonyms[String(diseaseName || '').trim()] || [];
    list.forEach(function(item) { terms.push(item); });
  } catch (err) {}
  for (let i = 0; i < terms.length; i++) {
    const term = compactAliasText_(terms[i]);
    if (term && q === term) return true;
  }
  return false;
}

function diseaseClarificationReply_(diseaseName) {
  const d = String(diseaseName || '這個疾病').trim();
  if (d === '疥瘡') {
    return '疥瘡請先選擇情境：\n' +
      '- 同住家人感染：員工健康流程、用藥與辦公室注意事項。\n' +
      '- 同仁本人有症狀：就醫、上班與接觸者處理。\n' +
      '- 辦公室接觸：環境與物品處理、同事健康監測。\n' +
      '- 病人照護：隔離、安置、PPE、清消與解隔。\n\n' +
      '請點選下方快捷鈕。';
  }
  return d + '可以查的範圍很多，我先幫您釐清方向，避免一次回答太散。\n\n' +
    '請點下方快捷鈕，或直接輸入：\n' +
    '- ' + d + '通報定義\n' +
    '- ' + d + '隔離醫囑\n' +
    '- ' + d + '病人安置\n' +
    '- ' + d + '採檢送驗\n' +
    '- ' + d + 'PPE\n' +
    '- ' + d + '清消\n' +
    '- ' + d + '解隔標準';
}

function isStyleOnlyFollowup_(question) {
  const q = normalizeIntentText_(question);
  return /^(白話一點|白話|講人話|說人話|簡單講|回答短一點|只回答重點|只列流程|只列醫囑|用查核口吻|用臨床流程回答)$/.test(q);
}

function subtopicLabel_(subtopic) {
  const map = loadBotReferenceData_().subtopicLabels || {};
  return map[subtopic] || '';
}

function expandDiseaseAliasForSearch_(question) {
  const q = convertFullWidthToHalfWidth_(String(question || '')).trim();
  if (!q) return q;
  try {
    const kb = loadKb_();
    const synonyms = kb && kb.synonyms ? kb.synonyms : {};
    const compact = compactAliasText_(q);
    const keys = Object.keys(synonyms || {});
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!isDiseaseSynonymKey_(key)) continue;
      const terms = [key].concat(synonyms[key] || []);
      for (let j = 0; j < terms.length; j++) {
        if (aliasTermMatches_(compact, terms[j]) && compact.indexOf(compactAliasText_(key)) < 0) {
          return key + ' ' + q;
        }
      }
    }
    const fuzzyKey = fuzzyDiseaseAliasKey_(q, synonyms);
    if (fuzzyKey && compact.indexOf(compactAliasText_(fuzzyKey)) < 0) {
      return fuzzyKey + ' ' + q;
    }
  } catch (err) {
    console.error('expandDiseaseAliasForSearch_ skipped: ' + err.toString());
  }
  return q;
}

function fuzzyDiseaseAliasKey_(question, synonyms) {
  const candidate = compactAliasText_(question)
    .replace(/^(請問|想問|查詢|幫我|麻煩)/, '')
    .replace(/(通報定義|通報要件|通報條件|通報標準|病例定義|病例要件|病例條件|診斷要件|診斷條件|診斷定義|診斷標準|通報|隔離醫囑|隔離|解隔標準|解隔|採檢送驗|採檢|送驗|檢體|疫區|清消|消毒|ppe|防護|病人安置|怎麼辦|是什麼)$/i, '');
  if (!candidate) return '';
  const isCjk = /^[\u4e00-\u9fff]{3,12}$/.test(candidate);
  const isLatin = /^[a-z]{5,24}$/.test(candidate);
  if (!isCjk && !isLatin) return '';

  const maxDistance = isCjk ? 1 : (candidate.length >= 7 ? 2 : 1);
  let bestKey = '';
  let bestDistance = maxDistance + 1;
  let tied = false;
  const keys = Object.keys(synonyms || {});
  keys.forEach(function(key) {
    if (!isDiseaseSynonymKey_(key)) return;
    const terms = [key].concat(synonyms[key] || []);
    terms.forEach(function(term) {
      const t = compactAliasText_(term);
      if ((isCjk && !/^[\u4e00-\u9fff]{3,12}$/.test(t)) || (isLatin && !/^[a-z]{5,24}$/.test(t))) return;
      if (Math.abs(t.length - candidate.length) > maxDistance) return;
      const distance = levenshteinDistance_(candidate, t, maxDistance);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestKey = key;
        tied = false;
      } else if (distance === bestDistance && key !== bestKey) {
        tied = true;
      }
    });
  });
  return bestDistance <= maxDistance && !tied ? bestKey : '';
}

function levenshteinDistance_(a, b, stopAfter) {
  const left = String(a || '');
  const right = String(b || '');
  let previous = [];
  for (let j = 0; j <= right.length; j++) previous[j] = j;
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left.charAt(i - 1) === right.charAt(j - 1) ? 0 : 1)
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > stopAfter) return stopAfter + 1;
    previous = current;
  }
  return previous[right.length];
}

function compactAliasText_(text) {
  return convertFullWidthToHalfWidth_(String(text || ''))
    .replace(/\s+/g, '')
    .replace(/[，。！？?！、；;：:「」『』"'`]/g, '')
    .toLowerCase();
}

function aliasTermMatches_(compactQuestion, term) {
  const t = compactAliasText_(term);
  if (!t || t.length < 2) return false;
  return compactQuestion.indexOf(t) >= 0;
}

function isDiseaseSynonymKey_(key) {
  const k = String(key || '');
  if (!k) return false;
  return !/^(通報|診斷要件|診斷碼|檢體|疫區|隔離|解隔|外出檢查|清消|透析室|內視鏡|員工健康|標示|標記註記|藥物|抗藥菌|民眾衛教|查核|會議檢索)$/i.test(k);
}

function isExplicitDifferentTopic_(question, state) {
  const q = String(question || '');
  const lastDisease = String(state.lastDiseaseName || '');
  const currentDisease = detectDisease_(q);
  if (currentDisease && currentDisease.name && currentDisease.name !== lastDisease) return true;
  if (isMeetingRecordQuestion_(q) && String(state.lastDiseaseName || '') !== '會議檢索') return true;
  if (isTravelEpidemicQuery_(q) && !isTopicFollowupQuestion_(q)) return true;
  if (/內視鏡|透析|洗腎|手部衛生|乾洗手|酒精|感管中心|辦公室|意見箱|滿意度|可以查什麼|可以問什麼/.test(q)) return true;
  return false;
}

function updateConversationState_(event, originalQuestion, effectiveQuestion, answerObj, shouldCount) {
  const userId = getLineUserId_(event);
  if (!userId) return '';
  const state = getUserState_(userId);
  const now = new Date().toISOString();
  const topicInfo = inferAnswerTopic_(effectiveQuestion, answerObj);

  if (topicInfo.topic) {
    if (state.lastTopic === topicInfo.topic) {
      state.topicChainCount = Math.min(5, Number(state.topicChainCount || 0) + 1);
    } else {
      state.lastTopic = topicInfo.topic;
      state.topicChainCount = 1;
    }
    state.lastDiseaseName = topicInfo.diseaseName || '';
  }

  state.lastQuestion = String(originalQuestion || '').slice(0, 160);
  state.lastEffectiveQuestion = String(effectiveQuestion || '').slice(0, 180);
  state.lastAnswerDiseaseName = String(answerObj && answerObj.diseaseName || '').slice(0, 60);
  state.lastSubtopic = detectSubtopic_(effectiveQuestion) || state.lastSubtopic || '';
  state.lastQuestionAt = now;

  let prompt = '';
  if (shouldCount) {
    state.validQuestionCount = Number(state.validQuestionCount || 0) + 1;
    if (!state.qualityPrompted && state.validQuestionCount >= 5) {
      state.qualityPrompted = true;
      state.qualityPromptedAt = now;
      prompt = qualityPromptText_();
    }
  }

  saveUserState_(userId, state);
  return prompt;
}

function inferAnswerTopic_(question, answerObj) {
  const d = String(answerObj && answerObj.diseaseName || '').trim();
  if (d && d !== '熱門感控' && d !== '本疾病' && d !== '閒聊' && d !== '模式切換') {
    return { topic: d, diseaseName: d === '會議檢索' ? '會議檢索' : d };
  }
  const disease = detectDisease_(question);
  if (disease && disease.name) return { topic: disease.name, diseaseName: disease.name };
  const meetingTopic = isMeetingRecordQuestion_(question) ? extractMeetingTopic_(question) : '';
  if (meetingTopic) return { topic: meetingTopic, diseaseName: '會議檢索' };
  return { topic: '', diseaseName: '' };
}

function qualityPromptText_() {
  return '【滿意度調查｜非醫療處置選項】\n以下 1-5 分是評估剛才的回答是否有幫助，不是病人處置選項。請點下方「滿意度」按鈕評分；也可輸入「感管意見箱」留下建議。';
}

function isMeetingRecordQuestion_(question) {
  const q = normalizeIntentText_(question);
  const meetingTerm = /會議|會報|週會|月會|委員會|感管會|會議紀錄|會議記錄|會議討論|會報紀錄/;
  const queryTerm = /在哪|哪個|哪次|哪一次|曾在哪|何時|有無|討論過|紀錄|記錄|日期|時間|出現/;
  return meetingTerm.test(q) && queryTerm.test(q);
}

function meetingRecordReply_(question) {
  const q = String(question || '');
  const topic = extractMeetingTopic_(q);
  if (!topic) {
    return '請用「議題 + 週會/月會」查詢會議紀錄，例如：感染月報在哪些週會出現、空調檢測在哪些週會出現、VRE在哪些月會出現。';
  }

  const scope = /週會/.test(q) && !/月會/.test(q) ? 'weekly' : (/月會|委員會|感管會/.test(q) && !/週會/.test(q) ? 'monthly' : 'all');
  const cacheKey = 'meeting_dates_only_v2_' + scope + '_' + topic.replace(/[^\w\u4e00-\u9fff]/g, '').slice(0, 28);
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const docs = loadMeetingDocTexts_(scope);
  const hits = searchMeetingDocs_(docs, topic, q);
  let answer = '';

  if (!hits.length) {
    answer = '目前在週會/月會檢索檔沒有找到「' + topic + '」的明確命中。\n\n' +
      '可以換較短或較常見的關鍵字再查一次，例如「感染月報」、「空調」、「VRE」、「內視鏡」、「手部衛生」。';
  } else {
    const dateSet = {};
    hits.forEach(function(hit) {
      hit.dates.forEach(function(date) { dateSet[date] = true; });
    });
    const dates = Object.keys(dateSet).sort();
    answer = dates.length
      ? '「' + topic + '」查得日期：\n' + dates.slice(0, 30).join('、') + (dates.length > 30 ? ' 等' + dates.length + '筆' : '')
      : '目前找到「' + topic + '」相關紀錄，但檢索資料沒有可供顯示的明確日期。';
  }

  if (answer.length < 90000) cache.put(cacheKey, answer, 600);
  return answer;
}

function extractMeetingTopic_(question) {
  let q = normalizeIntentText_(question);
  q = q
    .replace(/請問|想問|查詢|幫我|可以|麻煩|一下|一下子/g, '')
    .replace(/在哪些|在哪個|在哪|哪個|哪次|哪一次|曾經|曾在|曾|何時|什麼時候|有無|是否|有沒有/g, '')
    .replace(/週會|月會|會議紀錄|會議記錄|會議|會報|委員會|感管會|紀錄|記錄|日期|時間|出現|討論過|討論|議題|清單|相關/g, '')
    .replace(/[?？,，.。:：;；\s]/g, '');
  if (q.length >= 2) return q.slice(0, 30);
  return '';
}

function loadMeetingDocTexts_(scope) {
  const folderId = getProp_('KB_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFiles();
  const docs = [];
  while (files.hasNext() && docs.length < 180) {
    const file = files.next();
    const name = file.getName();
    if (!/\.md$/i.test(name)) continue;
    const isWeekly = /^週會紀錄_檢索記事本/.test(name);
    const isMonthly = /^月會議題_民國/.test(name);
    if (scope === 'weekly' && !isWeekly) continue;
    if (scope === 'monthly' && !isMonthly) continue;
    if (scope === 'all' && !isWeekly && !isMonthly) continue;
    docs.push({ name: name, text: file.getBlob().getDataAsString('UTF-8') });
  }
  return docs;
}

function searchMeetingDocs_(docs, topic, originalQuestion) {
  const topicTokens = meetingTopicTokens_(topic);
  const exactTopic = String(topic || '').replace(/\s+/g, '').toLowerCase();
  const yearMatch = String(originalQuestion || '').match(/(?:民國)?(\d{2,3})年|20\d{2}/);
  const yearFilter = yearMatch ? yearMatch[0].replace(/民國|年/g, '') : '';
  const hits = [];
  const seen = {};

  (docs || []).forEach(function(doc) {
    const kind = /^週會/.test(doc.name) ? '週會' : '月會';
    const lines = String(doc.text || '').split(/\r?\n/);
    lines.forEach(function(raw) {
      const line = cleanMeetingLine_(raw);
      if (!line) return;
      if (yearFilter && line.indexOf(yearFilter) < 0 && doc.name.indexOf(yearFilter) < 0) return;
      const compact = line.replace(/\s+/g, '').toLowerCase();
      const matched = topicTokens.some(function(token) { return compact.indexOf(token) >= 0; });
      if (!matched) return;
      const key = doc.name + '|' + line;
      if (seen[key]) return;
      seen[key] = true;
      const dates = extractIsoDates_(line);
      hits.push({
        kind: kind,
        fileName: doc.name,
        dates: dates,
        summary: summarizeMeetingLine_(line),
        _score: meetingLineScore_(line, compact, exactTopic, dates)
      });
    });
  });
  hits.sort(function(a, b) {
    if (b._score !== a._score) return b._score - a._score;
    return String(a.fileName).localeCompare(String(b.fileName), 'zh-Hant');
  });
  return hits.slice(0, 16);
}

function meetingLineScore_(line, compact, exactTopic, dates) {
  let score = 0;
  if (exactTopic && compact.indexOf(exactTopic) >= 0) score += 80;
  if (exactTopic && compact.indexOf(exactTopic) === 0) score += 80;
  if (dates && dates.length) score += 50 + Math.min(dates.length, 10);
  if (/日期[:：]|月會[:：]/.test(line)) score += 45;
  if (/^20\d{2}-\d{2}-\d{2}/.test(line)) score += 60;
  if (/（\d+筆；日期[:：]/.test(line)) score += 70;
  if (/；特別字眼[:：]/.test(line)) score -= 45;
  if (/分類關鍵詞[:：]/.test(line)) score -= 35;
  if (/主席裁示|已key-in|核章|簽文/.test(line)) score -= 15;
  return score;
}

function meetingTopicTokens_(topic) {
  const compact = String(topic || '').replace(/\s+/g, '').toLowerCase();
  const tokens = {};
  if (compact) tokens[compact] = true;
  tokenize_(topic).forEach(function(token) {
    if (token.length >= 2) tokens[token.replace(/\s+/g, '').toLowerCase()] = true;
  });
  return Object.keys(tokens).slice(0, 20);
}

function cleanMeetingLine_(raw) {
  let line = String(raw || '').trim();
  line = line.replace(/^[-*]\s*/, '').replace(/^#+\s*/, '').trim();
  if (!line) return '';
  if (/分卷|檔案索引|本檔因|請上傳|產生時間|週會紀錄筆數|命中分類數|明細筆數|不重複議題數|命中分類；概略描述/.test(line)) return '';
  if (line.length < 4) return '';
  return line;
}

function extractIsoDates_(text) {
  const seen = {};
  const matches = String(text || '').match(/20\d{2}-\d{2}-\d{2}/g) || [];
  return matches.filter(function(date) {
    if (seen[date]) return false;
    seen[date] = true;
    return true;
  });
}

function summarizeMeetingLine_(line) {
  let s = String(line || '').trim();
  s = s.replace(/；分類關鍵詞：[^；]+/g, '');
  s = s.replace(/；特別字眼：/g, '；特別字眼：');
  s = s.replace(/\s+/g, ' ');
  return s.length > 180 ? s.slice(0, 177) + '...' : s;
}

function smallTalkReply_(question, event) {
  const q = normalizeIntentText_(question);
  if (!q) return '';

  const externalRuleReply = externalIntentRuleReply_(q);
  if (externalRuleReply) return externalRuleReply;

  if (/^(可以查什麼|可以問什麼|你能做什麼|你能查什麼|你能回答什麼|你能答什麼|你可以做什麼|你可以回答什麼|你可以答什麼|你會做什麼|你能幫我什麼|你提供什麼服務|有什麼功能|你現在有什麼在執行的事|你現在在執行什麼|你目前在執行什麼|你現在在做什麼|你目前在做什麼|選單|主選單|目錄|說明|幫助|功能|help|menu|\?|？)$/.test(q)) {
    return '您好，我是台大感管 LINE 查詢助手。可查感染管制、法定傳染病通報、隔離/解隔、檢體送驗、疫區、清消濃度、查核重點，也可查週會/月會議題曾在哪些日期出現。\n\n提問範例：VRE 解隔、登革熱通報、伊波拉疫區、感染月報在哪些週會出現。';
  }
  if (/^(hi|hello|hey|哈囉|嗨|你好|您好|早安|午安|晚安|安安|在嗎|你在嗎|收到嗎)$/.test(q)) {
    return '您好，我在。可以直接問疾病或情境，例如「VRE 解隔」、「登革熱通報」、「透析室清消濃度」，也可以問「感染月報在哪些週會出現」。';
  }
  if (/^(謝謝|謝謝你|感謝|感謝你|謝啦|謝囉|thanks|thankyou|thx|辛苦了|麻煩你了|中秋愉快|新年快樂|過年好)$/.test(q) || /台大感管好棒|你.*(真好|很好|好好|聰明|很棒|不錯|厲害|貼心|親切)/.test(q)) {
    return '謝謝您，我會盡量把資料整理得準確、好讀、可執行。需要時可以直接問通報、隔離/解隔、採檢、清消、疫區或會議紀錄。';
  }
  if (/你不好聊|你難聊|問不出滿意答案|聽不懂|講人話|牛頭馬嘴|亂回答|很笨|答非所問|不滿意/.test(q)) {
    return '抱歉，剛剛沒有切中重點。您可以直接補一句想要的格式，例如「白話一點」、「只列流程」、「補檢體」、「用查核口吻」或「回答短一點」。\n\n也可以用「疾病/議題 + 想問項目」重問，例如：VRE 解隔標準、登革熱隔離醫囑、感染月報在哪些週會出現。';
  }
  if (/你是誰|你會什麼|怎麼用|使用方式/.test(q)) {
    return '我是台大感管 LINE 查詢助手，主要協助查感染管制知識庫、通報流程、隔離醫囑、檢體送驗、清消濃度、國際疫情，以及週會/月會議題檢索。';
  }
  if (/你是男生|你是女生|你男生|你女生|性別|男生嗎|女生嗎|你是帥哥|你是美女|你漂亮嗎|你帥嗎|你長怎樣|外貌/.test(q)) {
    return '我沒有性別或外貌，是台大感管 LINE 查詢助手。比較擅長協助查通報、隔離解隔、清消、疫區、檢體送驗和會議紀錄。';
  }
  if (/你會睡覺|你是24小時|你會死嗎|你吃什麼|你喜歡吃什麼|你喜歡什麼顏色|你會生氣|放屁|上廁所|生寶寶|男朋友|女朋友|交朋友|陪我聊天/.test(q)) {
    return '我不是人，沒有身體、睡眠、食物或感情生活；我是用來查資料和簡單回覆的 LINE 助手。可以簡單聊幾句，但主要任務還是協助感染管制查詢。';
  }
  if (/感管中心.*(辦公室|在哪|位置|怎麼去)|感染管制中心.*(辦公室|在哪|位置|怎麼去)/.test(q)) {
    return '感管中心辦公室在東址研究大樓 7 樓 710 辦公室；可從 7C 病房往 722 病室走廊的防火門進入。';
  }
  if (/(感管中心|感染管制中心).*(幾個人|主任|主管|負責人|人員名單)|王振泰.*(感管|主任|主管)/.test(q)) {
    return '這類人員編制、主任或主管資訊可能異動，我不會從舊文件推測。請以院內通訊錄、正式公告或感管中心最新資訊為準。';
  }
  if (/你們院長|院長好嗎|主任好嗎|主管好嗎|賴清德|蔣萬安|獎萬安|投票|投給誰|政治|政黨|綠色|藍色/.test(q)) {
    return '我不評論個人好壞、政治立場或選舉偏好。這個帳號主要協助感染管制、通報、隔離解隔、清消、疫區與查核重點。';
  }
  if (/[\u4e00-\u9fff]{1,6}.*(很壞|很爛|機車|綠茶婊|討厭|很差)/.test(q)) {
    return '我不評論或附和對特定個人、單位或團體的負面評價。若是具體事件讓您困擾，建議整理時間、地點、發生經過與希望改善的事項，透過正式管道反映。';
  }
  if (/個管師.*(漂亮|親切|很好|很棒)|同仁.*(親切|很好|很棒)/.test(q)) {
    return '謝謝您對院內同仁的肯定。若要回饋服務經驗，建議聚焦在具體協助內容；若有感染管制問題，也可以直接問我。';
  }
  if (/投訴|申訴|抱怨|檢舉|我建議|建議/.test(q)) {
    return '若要反映意見，建議留下不含病人個資的事件重點、時間、地點、流程與希望改善的事項，再依院內正式管道反映。若是感染管制相關問題，也可以把情境簡述給我，我協助整理可確認的流程。';
  }
  if (/想自殺|不想活|想死|撐不下去|撐不住|結束生命|傷害自己/.test(q)) {
    return '聽起來您現在很辛苦。請先不要一個人承受，立刻找身邊可信任的人、主管、同事或醫療人員陪您；若有立即危險，請直接就近急診或撥打當地緊急電話。若在院內，請請同仁或護理站協助您取得即時支持。';
  }
  if (/心情不好|心情低落|低落|難過|想哭|哭泣|哭哭|流淚|沮喪|焦慮|好無聊|想家|想爸媽|過年不想上班/.test(q)) {
    return '辛苦了。可以先讓自己離開壓力現場一下、喝水、深呼吸，或找可信任的人說幾句。若情緒持續影響睡眠、工作或安全，建議主動尋求主管、員工協助資源或醫療協助。';
  }
  if (/台大醫院.*(怎麼去|地址|在哪)|地址|掛哪一科|看哪一科|找哪一科|哪一科|哪位醫師|哪一位醫師|找.*醫師|看.*醫師|醫師推薦|推薦醫師|掛號|看診|就醫|台大醫院app/.test(q)) {
    return '本帳號不提供疾病診斷、醫師推薦、就醫科別、掛號或個案治療建議。請使用台大醫院 App、官方網站或正式掛號諮詢查詢合適科別與醫師。若有呼吸困難、意識改變、持續胸痛、嘴唇發紫或其他急重症警訊，請立即就近急診或撥 119。';
  }
  if (/今天.*(買什麼菜|點飲料|穿外套|塞車)|天氣如何|現在熱|台北房租|房子貴|該買房|我該離職|會戰爭嗎/.test(q)) {
    return '這個問題不屬於感染管制知識庫範圍，我不適合替您判斷。若您想問旅遊疫情、發燒、腹瀉、食物中毒、隔離或通報，請補充情境，我再協助整理。';
  }
  if (/糖尿病.*吃|高血壓.*吃|可以吃|能吃多少|營養|飲食/.test(q)) {
    return '這屬於個人醫療或營養照護問題，我不能只靠 LINE 訊息判斷能不能吃、能吃多少或怎麼調整飲食。\n\n建議請教您的主治醫師、衛教師或營養師，依血糖、血壓、用藥、腎功能與個人狀況評估。若您想問的是感染管制相關問題，例如發燒、腹瀉、食物中毒、隔離或通報，請再補充情境。';
  }
  if (/^(香蕉芭樂|綠茶婊|人死後去哪)$/.test(q)) {
    return '這個問題不屬於感染管制知識庫範圍。若您想查感染管制、通報、隔離解隔、清消、疫區、檢體送驗或會議紀錄，請直接輸入關鍵字。';
  }
  return '';
}

function externalIntentRuleReply_(normalizedQuestion) {
  const rule = externalIntentRule_(normalizedQuestion);
  return rule ? String(rule.reply || '').trim() : '';
}

function externalIntentRule_(normalizedQuestion, category) {
  let rules = [];
  try {
    const kb = loadKb_();
    rules = kb && kb.intent_rules && kb.intent_rules.rules ? kb.intent_rules.rules : [];
  } catch (err) {
    return '';
  }
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] || {};
    if (!rule.pattern || !rule.reply) continue;
    if (category && String(rule.category || '') !== String(category)) continue;
    try {
      const re = new RegExp(String(rule.pattern), rule.flags || '');
      if (re.test(normalizedQuestion)) return rule;
    } catch (err2) {
      console.error('Bad intent rule ' + String(rule.id || i) + ': ' + err2.toString());
    }
  }
  return null;
}

function normalizeIntentText_(text) {
  return convertFullWidthToHalfWidth_(String(text || ''))
    .replace(/\s+/g, '')
    .replace(/[，。！？?！～~、；;：:「」『』"'`]/g, '')
    .toLowerCase();
}

function getLineUserId_(event) {
  return event && event.source && event.source.userId ? String(event.source.userId) : '';
}

function userModeKey_(userId) {
  return 'mode_' + userId;
}

function getUserMode_(event) {
  const userId = getLineUserId_(event);
  if (!userId) return 'clinical';
  try {
    const raw = getUserModeProperty_(userId);
    return raw === 'audit' ? 'audit' : 'clinical';
  } catch (err) {
    console.error('getUserMode_ skipped: ' + err.toString());
    return 'clinical';
  }
}

function hasExplicitUserMode_(event) {
  const userId = getLineUserId_(event);
  if (!userId) return false;
  try {
    const raw = getUserModeProperty_(userId);
    return raw === 'audit' || raw === 'clinical';
  } catch (err) {
    return false;
  }
}

function getUserModeProperty_(userId) {
  const key = userModeKey_(userId);
  if (Object.prototype.hasOwnProperty.call(USER_REQUEST_CACHE_, key)) return USER_REQUEST_CACHE_[key];
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  USER_REQUEST_CACHE_[key] = raw || '';
  return USER_REQUEST_CACHE_[key];
}

function saveUserMode_(event, mode) {
  const userId = getLineUserId_(event);
  if (!userId) return;
  try {
    const key = userModeKey_(userId);
    const savedMode = mode === 'audit' ? 'audit' : 'clinical';
    PropertiesService.getScriptProperties().setProperty(key, savedMode);
    USER_REQUEST_CACHE_[key] = savedMode;
  } catch (err) {
    console.error('saveUserMode_ skipped: ' + err.toString());
  }
}

function getUserIdentity_(event) {
  const userId = getLineUserId_(event);
  if (!userId) return '';
  const state = getUserState_(userId);
  return state && (state.identity === 'staff' || state.identity === 'public') ? state.identity : '';
}

function userStateKey_(userId) {
  return 'user_state_' + String(userId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

function getUserState_(userId) {
  if (!userId) return {};
  try {
    const cacheKey = userStateKey_(userId);
    if (Object.prototype.hasOwnProperty.call(USER_REQUEST_CACHE_, cacheKey)) return USER_REQUEST_CACHE_[cacheKey];
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty(cacheKey) || props.getProperty('state_' + userId) || '';
    if (!raw) {
      USER_REQUEST_CACHE_[cacheKey] = {};
      return USER_REQUEST_CACHE_[cacheKey];
    }
    const state = JSON.parse(raw);
    USER_REQUEST_CACHE_[cacheKey] = state && typeof state === 'object' ? state : {};
    return USER_REQUEST_CACHE_[cacheKey];
  } catch (err) {
    console.error('getUserState_ skipped: ' + err.toString());
    return {};
  }
}

function saveUserState_(userId, state) {
  if (!userId) return;
  try {
    const cacheKey = userStateKey_(userId);
    const savedState = state || {};
    PropertiesService.getScriptProperties().setProperty(cacheKey, JSON.stringify(savedState));
    USER_REQUEST_CACHE_[cacheKey] = savedState;
  } catch (err) {
    console.error('saveUserState_ skipped: ' + err.toString());
  }
}

function feedbackResponseReply_(question, event) {
  const userId = getLineUserId_(event);
  if (!userId) return '';
  const q = normalizeIntentText_(question);
  if (isSatisfactionPromptCommand_(q)) {
    const state = getUserState_(userId);
    if (Number(state.validQuestionCount || 0) < 5) {
      const count = Math.max(0, Math.min(5, Number(state.validQuestionCount || 0)));
      return '完成 5 次有效問答後，才會開放滿意度評分與抽獎資格。目前已完成 ' + count + '/5 次。';
    }
    state.qualityPrompted = true;
    state.qualityPromptedAt = new Date().toISOString();
    saveUserState_(userId, state);
    return satisfactionPromptText_();
  }

  const state = getUserState_(userId);
  if (!state.qualityPrompted && !/^(1|2|3|4|5|一|二|三|四|五|非常有幫助|有幫助|部分有幫助|幫助不大|沒有幫助|沒幫助|不滿意|滿意)$/.test(q)) {
    return '';
  }
  const score = detectSatisfactionChoice_(q);
  if (!score) return '';

  state.lastFeedback = score;
  state.lastFeedbackAt = new Date().toISOString();
  state.feedbackCount = Number(state.feedbackCount || 0) + 1;
  state.qualityPrompted = false;
  state.validQuestionCount = 0;
  saveUserState_(userId, state);

  if (score === 'very_good' || score === 'good') {
    const rating = score === 'very_good' ? '滿意度 1 分：非常有幫助' : '滿意度 2 分：有幫助';
    return '已記錄「' + rating + '」。謝謝您的回饋；若之後想補充建議，也可以輸入「感管意見箱」。';
  }
  if (score === 'partial') {
    return '已記錄「滿意度 3 分：部分有幫助」。您也可以直接告訴我希望怎麼改，例如「回答短一點」、「白話一點」或輸入「感管意見箱」。';
  }
  const rating = score === 'slightly_bad' ? '滿意度 4 分：幫助不大' : '滿意度 5 分：沒有幫助';
  return '已記錄「' + rating + '」。謝謝您提醒；您可以補一句希望的方向，或輸入「感管意見箱」留下具體建議。';
}

function isSatisfactionPromptCommand_(question) {
  const q = normalizeIntentText_(question);
  return /^(🔒滿意度|滿意度|我要回饋|回饋|意見回饋|填滿意度|品質回饋|品質蒐集|問卷|評分)$/.test(q);
}

function isSatisfactionEligible_(event) {
  const userId = getLineUserId_(event);
  if (!userId) return false;
  const state = getUserState_(userId);
  return Number(state.validQuestionCount || 0) >= 5;
}

function detectSatisfactionChoice_(normalizedQuestion) {
  const q = String(normalizedQuestion || '').trim().replace(/^滿意度/, '');
  if (/^(1|一|非常有幫助|非常滿意|非常有用|很好|非常好)$/.test(q)) return 'very_good';
  if (/^(2|二|有幫助|有用|滿意|不錯|ok|good)$/.test(q)) return 'good';
  if (/^(3|三|部分有幫助|部分有用|普通|還好|一半)$/.test(q)) return 'partial';
  if (/^(4|四|幫助不大|不太有用|不太滿意)$/.test(q)) return 'slightly_bad';
  if (/^(5|五|沒有幫助|沒幫助|沒用|不滿意|答非所問|完全沒用)$/.test(q)) return 'bad';
  return '';
}

function satisfactionPromptText_() {
  return '【滿意度調查｜非醫療處置選項】\n以下評分是針對問答工具，不是病人處置選項：\n1 非常有幫助\n2 有幫助\n3 部分有幫助\n4 幫助不大\n5 沒有幫助\n\n請點下方「滿意度」按鈕，或輸入「感管意見箱」留下建議。';
}

function suggestionBoxReply_(question, event) {
  const userId = getLineUserId_(event);
  if (!userId) return '';
  const q = String(question || '').trim();
  const compact = normalizeIntentText_(q);
  const state = getUserState_(userId);

  if (/^(查意見箱|意見箱紀錄|最新意見|看意見|意見紀錄|意見列表)$/.test(compact)) {
    return 'LINE 意見箱僅供投稿；意見內容不會透過 LINE 對話提供。';
  }

  if (state.inSuggestionBox) {
    const setAt = new Date(state.inSuggestionBoxAt || 0).getTime();
    const expired = Date.now() - setAt > 5 * 60 * 1000;
    if (expired || isLikelyClinicalQuestion_(q)) {
      state.inSuggestionBox = false;
      saveUserState_(userId, state);
      return '';
    }
    if (/^(取消|退出|算了|返回|不寫了)$/.test(compact)) {
      state.inSuggestionBox = false;
      saveUserState_(userId, state);
      return '已取消意見投遞。若有感染管制問題，可以直接輸入疾病或情境查詢。';
    }
    saveSuggestionRecord_(q, userId, state.identity || getUserIdentity_(event) || '未設定');
    state.inSuggestionBox = false;
    state.suggestionCount = Number(state.suggestionCount || 0) + 1;
    saveUserState_(userId, state);
    return '已收到您的意見，謝謝協助改善感管 LINE 問答。若還有要補充的內容，可以再輸入「感管意見箱」。';
  }

  if (/^(感管意見箱|意見箱|寫意見|反映意見|感管建議|提供建議|投遞意見|我要反映|我要建議)$/.test(compact)) {
    state.inSuggestionBox = true;
    state.inSuggestionBoxAt = new Date().toISOString();
    saveUserState_(userId, state);
    return '請直接輸入想反映的建議或問題，不要包含病人姓名、病歷號、床號或可識別個資。\n\n若要取消，請輸入「取消」。';
  }

  return '';
}

function isLikelyClinicalQuestion_(question) {
  const q = String(question || '');
  return /疫區|旅遊疫情|通報|診斷|醫囑|採檢|送驗|檢體|隔離|解隔|清消|消毒|漂白水|PPE|防護|病人安置|床位|病房|造冊|暴露|發燒|咳嗽|腹瀉|皮疹|VRE|CRE|MRSA|MRSE|CRAB|CRPA|MDRO|KP|Klebsiella|麻疹|德麻|德國麻疹|腮腺炎|百日咳|登革熱|伊波拉|伊坡拉|流感|新冠|疥瘡|結核|立百|退伍軍人|兔熱病|日腦|日本腦炎|流腦|流行性腦脊髓膜炎|Hib|IPD|M痘|猴痘|SFTS|A肝|B肝|C肝|E肝|梅毒|淋病|恙蟲|萊姆|內視鏡|透析|report|criteria|definition|diagnos|isolat|specimen|sample|collect|test|ppe|protect|placement|room|bed|disinfect|clean|bleach|exposure|contact|fever|cough|diarrhea|rash|travel|outbreak|infection/i.test(q);
}

function getSuggestionRecords_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty('SUGGESTION_RECORDS') || '[]';
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('getSuggestionRecords_ skipped: ' + err.toString());
    return [];
  }
}

function saveSuggestionRecord_(text, userId, identity) {
  try {
    const list = getSuggestionRecords_();
    list.unshift({
      time: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd HH:mm'),
      userHash: Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(userId || ''))).slice(0, 16),
      identity: identity || '未設定',
      text: String(text || '').slice(0, 800)
    });
    PropertiesService.getScriptProperties().setProperty('SUGGESTION_RECORDS', JSON.stringify(list.slice(0, 100)));
  } catch (err) {
    console.error('saveSuggestionRecord_ skipped: ' + err.toString());
  }
}

function isLowValueOrMetaQuestion_(question) {
  const q = normalizeIntentText_(question);
  if (!q) return true;
  if (/^(可以查什麼|可以問什麼|你能做什麼|你能查什麼|你能回答什麼|你能答什麼|你可以做什麼|你可以回答什麼|你可以答什麼|你會做什麼|你能幫我什麼|你提供什麼服務|有什麼功能|你現在有什麼在執行的事|你現在在執行什麼|你目前在執行什麼|你現在在做什麼|你目前在做什麼|選單|主選單|目錄|說明|幫助|功能|help|menu)$/.test(q)) return true;
  if (/你是男生|你是女生|你會睡覺|你吃什麼|你喜歡|你不好聊|你難聊|講人話|問不出滿意答案|香蕉芭樂|綠茶婊|投票|政治/.test(q)) return true;
  if (/今天.*(買什麼菜|點飲料|穿外套|塞車)|天氣如何|現在熱|台北房租|房子貴|該買房|我該離職|會戰爭嗎/.test(q)) return true;
  return false;
}

function isCdcn0146Query_(question) {
  const q = convertFullWidthToHalfWidth_(String(question || ''));
  return /CDCN0146|接觸者醫令|接觸者採檢醫令|接觸者送驗醫令|接觸者篩檢醫令/i.test(q);
}

function isKpLabResultQuery_(question) {
  const q = convertFullWidthToHalfWidth_(String(question || ''));
  const hasKp = /\bK\.?\s*P\.?\b|Klebsiella\s*pneumoniae|肺炎克雷伯|肺炎克雷白|肺克|克雷伯菌/i.test(q);
  if (!hasKp) return false;
  return /檢驗|檢出|驗出|培養|報告|長出|分離出|菌|痰|尿|血|傷口|引流|移生|感染|隔離|醫囑|處置/i.test(q);
}

function kpLabResultReply_() {
  return '檢驗出 KP 時，先不要直接等同於 CRE 或一定要接觸隔離。\n\n' +
    'KP 通常指 Klebsiella pneumoniae，也就是肺炎克雷伯菌。處理時請先看檢驗報告的抗生素感受性與是否被標示為 CRKP、CRE、CPE、KPC、NDM，或 carbapenem 類抗生素抗藥。\n\n' +
    '臨床可先這樣判斷：\n' +
    '- 若只是一般 KP，未顯示重要抗藥性：依標準防護與病人感染部位照護，不要自行貼抗藥菌標籤。\n' +
    '- 若報告為 CRKP、CRE、CPE、KPC、NDM 或 carbapenem-resistant：依 CRE/抗藥菌接觸隔離流程處理，確認隔離醫囑、病人安置、檢查轉送通知與終期清潔。\n' +
    '- 若不確定是不是抗藥菌：請先查藥敏結果，或詢問檢驗醫學部/感染管制中心，不要只憑 KP 三個字判定。\n\n' +
    '院內提醒：MDRO/CRE 這類抗藥菌檢體是送本院檢醫部，不是送 CDC 防疫檢體。若需主動篩檢或解隔評估，診療醫令可走主分類「細菌」、次分類「感管篩選」，再依菌種與採檢部位選擇醫令。';
}

function cdcn0146Reply_() {
  return '⚠️ **【重點強調】HIS 防疫檢體醫令：`CDCN0146`（百日咳接觸者專用採檢醫令）**：\n\n' +
    '1. **使用對象與開單說明**：\n' +
    '   · **`CDCN0146`** 為專用於**「百日咳接觸者 (Contacts) / 匡列暴露人員 / 暴露同仁」**之採檢送驗醫令。\n' +
    '   · **與指標個案分流**：若為百日咳指標個案/確診通報者，請開立 **`CDCN0038`**；若為**匡列接觸者/暴露同仁**，特別強調務必開立 **`CDCN0146`**，切勿誤開為指標個案通報醫令！\n\n' +
    '2. **HIS 系統開單路徑**：\n' +
    '   · 登入 HIS 系統 ➔ 進入「診療醫令」 ➔ 主分類「檢驗」 ➔ 次分類「CDC防疫檢體」 ➔ 搜尋並選擇 **`CDCN0146 接觸者採檢`**。' +
    nextSubtopicPrompt_('百日咳');
}

function isPostExposurePepQuery_(question) {
  const q = convertFullWidthToHalfWidth_(String(question || ''));
  return /暴露.*(造冊|預防|投藥|PEP|用藥|追蹤|處置)|(造冊原則|預防用藥|預防性投藥|PEP|暴露處置|接觸者造冊|接觸者名單|暴露後)/i.test(q);
}

function isActualNeedlestickExposureQuery_(question) {
  const q = normalizeIntentText_(question).replace(/\s+/g, '');
  const hasNeedlestickTerm = /針[扎紮刺]|針頭.*(?:扎|紮|刺)|尖銳物.*(?:扎傷|紮傷|刺傷)|血液體液暴露|血體液暴露|不明血體液接觸/i.test(q);
  if (!hasNeedlestickTerm) return false;
  if (/評鑑|查核|委員|條文|佐證|KM|稽核|統計|改善方案|教育訓練|拒絕針扎運動/i.test(q)) return false;
  return /我|自己|同仁|員工|護理師|醫師|醫檢師|學生|志工|被|刺到|扎到|紮到|受傷|流血|怎麼辦|怎麼處理|如何處理|處理|通報|就醫|PEP/i.test(q);
}

function actualNeedlestickExposurePriorityReply_(question) {
  if (!isActualNeedlestickExposureQuery_(question)) return '';
  return '針扎／血液體液暴露後請先做立即處置：\n' +
    '- 皮膚或傷口：立即以流動清水和肥皂清洗；不要用漂白水，不要刷洗或擠壓傷口。\n' +
    '- 眼睛或黏膜：立即以大量清水或生理食鹽水沖洗。\n' +
    '- 立即通知單位主管，依院內流程完成暴露通報、風險評估及感染源／暴露者檢驗。\n' +
    '- 若可能需要 HIV PEP，應立即轉介評估；不要等待全部檢驗結果才處理。\n' +
    '- 後續依院內針扎／血液體液暴露流程完成追蹤與結案。' +
    nextSubtopicPrompt_('針扎與體液暴露');
}

function maskWastePriorityReply_(question) {
  const q = normalizeIntentText_(question);
  const hasMask = /n95|口罩|呼吸防護具|防護面罩/i.test(q);
  const asksDisposal = /丟|垃圾|廢棄|廢棄物|分類|處理|回收/i.test(q);
  if (!hasMask || !asksDisposal) return '';
  return 'N95／口罩廢棄處理重點：\n' +
    '- 臨床照護、隔離區或可能污染血液體液／呼吸道分泌物後使用的 N95 或口罩，勿丟一般生活垃圾，請依院內感染性廢棄物流程丟棄。\n' +
    '- 脫除時避免碰觸口罩外層，丟棄後立即執行手部衛生。\n' +
    '- 若為未使用、過期或庫存報廢的口罩／N95，依院內物資、總務或職安管理流程辦理，不要自行混入臨床感染性垃圾。\n' +
    '- 如單位張貼分類圖示或院內公告有更細規定，以現行公告與單位流程為準。';
}

function postExposurePepReply_(question) {
  const q = convertFullWidthToHalfWidth_(String(question || ''));

  if (/百日咳/i.test(q)) {
    return '🧪 **百日咳 暴露後接觸者造冊原則與預防用藥 (PEP)**：\n\n' +
      '1. **接觸者匡列與造冊原則**：\n' +
      '   · **匡列對象**：確診個案發病前 21 天至接受有效抗生素治療滿 5 天（或發病後 21 天）內之同住家人、同班同學、同病室/同車空間長時間近距離接觸者、及無適當防護照顧之醫護同仁。\n' +
      '   · **健康監測**：匡列對象須進行自主健康監測 **21 天**（自最後接觸日起算）。\n\n' +
      '2. **預防性投藥 (PEP)**：\n' +
      '   · **給藥時機**：無論有無症狀，密集接觸者均建議儘速給予預防性投藥（於最後接觸 21 天內給予）。\n' +
      '   · **建議用藥**：口服 **Azithromycin** (成人 500mg Day 1，250mg Day 2-5) 或 **Erythromycin** (500mg QID 共 7-14 天)。\n\n' +
      '3. ⚠️ **【關鍵強調】百日咳接觸者採檢醫令 `CDCN0146`**：\n' +
      '   · 匡列接觸者與暴露同仁進行鼻咽拭子/抽吸液採檢時，**特別強調務必開立 `CDCN0146`（接觸者採檢醫令）**，切勿與指標個案 (Index Case) 通報醫令 (`CDCN0038`) 混淆！\n' +
      nextSubtopicPrompt_('百日咳');
  }

  if (/麻疹/i.test(q)) {
    return '🔴 **麻疹 暴露後接觸者造冊原則與預防處置 (PEP)**：\n\n' +
      '1. **接觸者匡列與造冊原則**：\n' +
      '   · **匡列時段**：指標個案 **出疹前 4 天至出疹後 4 天**（可傳染期）。\n' +
      '   · **匡列對象**：同住家人、同病室/同車/共處一室或同動線之接觸者，及無適當防護近距離照護之醫護同仁。\n' +
      '   · **自主健康管理**：匡列對象須進行健康監測 **18 至 21 天**（自最後接觸日起算，每日量測體溫與發疹監測）。\n\n' +
      '2. **預防性處置 (PEP)**：\n' +
      '   · **MMR 疫苗**：暴露後 **72 小時內** 接種 1 劑 MMR 疫苗（適用 6 個月以上無麻疹免疫力者）。\n' +
      '   · **免疫球蛋白 (IVIG/IMIG)**：暴露後 **6 天內** 給予肌肉/靜脈注射免疫球蛋白（適用 6 個月以下嬰兒、孕婦及免疫功能障礙者）。\n\n' +
      '3. **採檢與通報醫令**：\n' +
      '   · 匡列接觸者與暴露同仁採檢請開立 HIS「`CDCN0122` 麻疹檢體送驗醫令」送檢。\n' +
      nextSubtopicPrompt_('麻疹');
  }

  return '💉 **針扎與血液體液暴露 (HIV/HBV/HCV) 處置與 PEP**：\n\n' +
    '1. **現場立即處置**：\n' +
    '   · 傷口：立即以流動清水與肥皂沖洗洗淨；不要刷洗或擠壓傷口。\n' +
    '   · 黏膜：以大量生理食鹽水沖洗。\n\n' +
    '2. **開單採檢與通報**：\n' +
    '   · 開立 HIS「針扎/血液體液暴露檢驗套單」（含 HIV, Anti-HBs, HBsAg, Anti-HCV, VDRL）。\n' +
    '   · 24 小時內登入院內系統完成針扎通報。\n\n' +
    '3. **預防性投藥 (PEP)**：\n' +
    '   · **HIV PEP**：高風險暴露需於 **2 小時內（最遲 72 小時內）** 啟動 PEP 3 藥聯用，連續服用 28 天。\n' +
    '   · **HBV PEP**：依 Source 與暴露者抗體狀態，必要時於 24 小時內施打 HBIG 免疫球蛋白及補打 HBV 疫苗。\n' +
    nextSubtopicPrompt_('針扎與體液暴露');
}

function detectDisease_(question) {
  const q = String(question || '').toLowerCase();

  if (/vre|抗萬古黴素腸球菌/i.test(q)) return { name: 'VRE', key: 'VRE' };
  if (/cre|cpe|抗藥性腸桿菌/i.test(q)) return { name: 'CRE', key: 'CRE' };
  if (/mrse|抗藥性表皮葡萄球菌|表皮葡萄球菌/i.test(q)) return { name: 'MRSE', key: 'MRSE' };
  if (/mrsa|抗藥性金黃色葡萄球菌/i.test(q)) return { name: 'MRSA', key: 'MRSA' };
  if (/crab|mdrab/i.test(q)) return { name: 'CRAB', key: 'CRAB' };
  if (/crpa|mdrpa/i.test(q)) return { name: 'CRPA', key: 'CRPA' };
  if (/耳念珠菌|candida\s*auris/i.test(q)) return { name: '耳念珠菌', key: '耳念珠菌' };
  if (/mdro|多重抗藥菌|抗藥菌/i.test(q)) return { name: 'MDRO', key: 'MDRO' };

  if (/兔熱/i.test(q)) return { name: '兔熱病', key: '兔熱病' };
  if (/黃熱/i.test(q)) return { name: '黃熱病', key: '黃熱病' };
  if (/q熱/i.test(q)) return { name: 'Q熱', key: 'Q熱' };
  if (/日腦|日本腦炎|jev\b|japanese\s+encephalitis/i.test(q)) return { name: '日本腦炎', key: '日本腦炎' };
  if (/德麻|德國麻疹|rubella/i.test(q)) return { name: '德國麻疹', key: '德國麻疹' };
  if (/麻疹/i.test(q)) return { name: '麻疹', key: '麻疹' };
  if (/腮腺炎|mumps/i.test(q)) return { name: '流行性腮腺炎', key: '流行性腮腺炎' };
  if (/百日咳/i.test(q)) return { name: '百日咳', key: '百日咳' };
  if (/登革/i.test(q)) return { name: '登革熱', key: '登革熱' };
  if (/新型\s*a\s*型流感|新\s*a\s*流感|禽流感|h5n1|h7n9|h5n6|h9n2/i.test(q)) return { name: '新型A型流感', key: '新型A型流感' };
  if (/(^|[^新型])(?:a流|b流|a型流感|b型流感|流感a|流感b|influenza\s*a|influenza\s*b)/i.test(q)) return { name: '流感', key: '流感' };
  if (/流感/i.test(q)) return { name: '流感', key: '流感' };
  if (/新冠|covid/i.test(q)) return { name: '新冠', key: '新冠' };
  if (/帶狀[疱皰]疹/i.test(q)) return { name: '帶狀疱疹', key: '帶狀疱疹' };
  if (/水痘/i.test(q)) return { name: '水痘', key: '水痘' };
  if (/結核|tb/i.test(q)) return { name: '結核', key: '結核' };
  if (/困難梭菌|c\.?\s*diff/i.test(q)) return { name: 'C. difficile', key: 'C. difficile' };
  if (/庫賈氏|cjd/i.test(q)) return { name: '庫賈氏病', key: '庫賈氏病' };
  if (/伊波拉|伊坡拉|ebola/i.test(q)) return { name: '伊波拉', key: '伊波拉' };
  if (/腸病毒/i.test(q)) return { name: '腸病毒', key: '腸病毒' };
  if (/疥瘡/i.test(q)) return { name: '疥瘡', key: '疥瘡' };
  if (/瘧疾/i.test(q)) return { name: '瘧疾', key: '瘧疾' };
  if (/狂犬/i.test(q)) return { name: '狂犬病', key: '狂犬病' };
  if (/破傷風/i.test(q)) return { name: '破傷風', key: '破傷風' };
  if (/白喉/i.test(q)) return { name: '白喉', key: '白喉' };
  if (/屈公/i.test(q)) return { name: '屈公病', key: '屈公病' };
  if (/茲卡/i.test(q)) return { name: '茲卡', key: '茲卡' };
  if (/傷寒/i.test(q) && !/副傷寒|斑疹傷寒/.test(q)) return { name: '傷寒', key: '傷寒' };
  if (/副傷寒/i.test(q)) return { name: '副傷寒', key: '副傷寒' };
  if (/斑疹傷寒/i.test(q)) return { name: '斑疹傷寒', key: '斑疹傷寒' };
  if (/桿菌性痢疾/i.test(q)) return { name: '桿菌性痢疾', key: '桿菌性痢疾' };
  if (/阿米巴/i.test(q)) return { name: '阿米巴痢疾', key: '阿米巴痢疾' };
  if (/霍亂/i.test(q)) return { name: '霍亂', key: '霍亂' };
  if (/流行性腦脊髓膜炎|流行性腦膜炎|流腦|meningococcal|meningitis/i.test(q)) return { name: '流行性腦脊髓膜炎', key: '流行性腦脊髓膜炎' };
  if (/\bhib\b|侵襲性\s*b\s*型嗜血|b型嗜血桿菌/i.test(q)) return { name: '侵襲性b型嗜血桿菌感染症', key: '侵襲性b型嗜血桿菌感染症' };
  if (/\bipd\b|侵襲性肺炎鏈球菌|肺炎鏈球菌感染症/i.test(q)) return { name: '侵襲性肺炎鏈球菌感染症', key: '侵襲性肺炎鏈球菌感染症' };
  if (/\bafp\b|acute\s+flaccid\s+(?:paralysis|myelitis)|polio(?:myelitis)?|小兒麻痺|急性無力肢體麻痺|急性肢體無力麻痺/i.test(q)) return { name: '小兒麻痺症/急性無力肢體麻痺', key: '小兒麻痺症/急性無力肢體麻痺' };
  if (/炭疽/i.test(q)) return { name: '炭疽', key: '炭疽' };
  if (/鼠疫/i.test(q)) return { name: '鼠疫', key: '鼠疫' };
  if (/天花/i.test(q)) return { name: '天花', key: '天花' };
  if (/類鼻疽/i.test(q)) return { name: '類鼻疽', key: '類鼻疽' };
  if (/鉤端螺旋體|鉤端/i.test(q)) return { name: '鉤端螺旋體', key: '鉤端螺旋體' };
  if (/立百/i.test(q)) return { name: '立百病毒', key: '立百病毒' };
  if (/馬堡/i.test(q)) return { name: '馬堡病毒', key: '馬堡病毒' };
  if (/拉薩/i.test(q)) return { name: '拉薩熱', key: '拉薩熱' };
  if (/漢他/i.test(q)) return { name: '漢他病毒', key: '漢他病毒' };
  if (/退伍軍人/i.test(q)) return { name: '退伍軍人病', key: '退伍軍人病' };
  if (/猴痘|m痘|mpox/i.test(q)) return { name: 'M痘', key: 'M痘' };
  if (/sfts|發熱伴血小板減少/i.test(q)) return { name: '發熱伴血小板減少綜合症', key: '發熱伴血小板減少綜合症' };
  if (/a肝|hav|a型肝炎/i.test(q)) return { name: '急性A型肝炎', key: '急性A型肝炎' };
  if (/b肝|hbv|b型肝炎/i.test(q)) return { name: '急性B型肝炎', key: '急性B型肝炎' };
  if (/c肝|hcv|c型肝炎/i.test(q)) return { name: '急性病毒性C型肝炎', key: '急性病毒性C型肝炎' };
  if (/e肝|hev|e型肝炎/i.test(q)) return { name: '急性E型肝炎', key: '急性E型肝炎' };
  if (/未定型肝炎|肝炎未定型|未定型.*肝炎|急性病毒性肝炎未定型/i.test(q)) return { name: '急性病毒性肝炎未定型', key: '急性病毒性肝炎未定型' };
  if (/梅毒|syphilis/i.test(q)) return { name: '梅毒', key: '梅毒' };
  if (/淋病|gonorrhea/i.test(q)) return { name: '淋病', key: '淋病' };
  if (/恙蟲|tsutsugamushi|scrub\s+typhus/i.test(q)) return { name: '恙蟲病', key: '恙蟲病' };
  if (/萊姆|lyme/i.test(q)) return { name: '萊姆病', key: '萊姆病' };
  if (/hiv|愛滋/i.test(q)) return { name: 'HIV', key: 'HIV' };

  const fromSynonyms = detectDiseaseFromSynonyms_(q);
  if (fromSynonyms) return fromSynonyms;

  return null;
}

function detectDiseaseFromSynonyms_(question) {
  try {
    const kb = loadKb_();
    const synonyms = kb && kb.synonyms ? kb.synonyms : {};
    const compact = compactAliasText_(question);
    const keys = Object.keys(synonyms || {});
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!isDiseaseSynonymKey_(key)) continue;
      const terms = [key].concat(synonyms[key] || []);
      for (let j = 0; j < terms.length; j++) {
        if (aliasTermMatches_(compact, terms[j])) return { name: key, key: key };
      }
    }
  } catch (err) {
    console.error('detectDiseaseFromSynonyms_ skipped: ' + err.toString());
  }
  return null;
}

function detectSubtopic_(question) {
  const q = String(question || '');
  if (/通報定義|通報要件|通報條件|通報標準|通報資格|病例定義|病例要件|病例條件|診斷要件|診斷條件|診斷定義|診斷標準|符合通報|要不要通報|要通報嗎|需要通報嗎|需不需要通報|何時(?:要)?通報|什麼(?:時候|情況|狀況)(?:要|需|需要)?通報|report.*(criteria|definition|condition|requirement)|case\s*definition|diagnos|when\s+to\s+report/i.test(q)) return 'definition';
  if (/解隔|解除隔離|取消隔離|何時解隔|什麼時候解隔|停止隔離|discharge\s+from\s+isolation|de-?isolation|stop\s+isolation|end\s+isolation/i.test(q)) return 'clearance';
  if (/暴露|造冊|接觸者|PEP|預防用藥|預防性投藥|exposure|contact\s*(tracing|list|person)|post-?exposure|prophylaxis/i.test(q)) return 'exposure';
  if (/住院安排|收住|安置|床位|病房|病室|負壓|單人|收治|placement|room|bed|ward|negative\s*pressure|single\s*room|admission/i.test(q)) return 'placement';
  if (/通報|醫令|開單|代碼|診斷碼|report|order|code|icd|diagnosis\s*code/i.test(q)) return 'order';
  if (/採檢|送驗|檢體|拭子|抽吸|specimen|sample|collect|swab|testing|test/i.test(q)) return 'specimen';
  if (/隔離|接觸隔離|空氣隔離|飛沫隔離|isolation|airborne|droplet|contact\s*precaution/i.test(q)) return 'isolation';
  if (/清消|消毒|清潔|漂白水|環境|disinfect|clean|environment|bleach|chlorine|ppm/i.test(q)) return 'sanitization';
  if (/照護|處置|防護|怎麼辦|怎麼處理|如何處理|ppe|care|management|precaution|protection/i.test(q)) return 'care';
  return null;
}

function influenzaDiscordantTestReply_(question) {
  const q = String(question || '').replace(/\s+/g, '');
  const isInfluenza = /流感|influenza|flu/i.test(q);
  const rapidPositive = /(?:快篩|抗原)(?:檢驗)?(?:為|呈現?|結果)?陽性|陽性(?:的)?(?:流感)?(?:快篩|抗原)/i.test(q);
  const pcrNegative = /(?:pcr|核酸)(?:檢驗)?(?:為|呈現?|結果)?陰性|陰性(?:的)?(?:流感)?(?:pcr|核酸)/i.test(q);
  if (!isInfluenza || !rapidPositive || !pcrNegative) return '';

  const hasSymptoms = /有類流感症狀|有症狀|發燒|咳嗽|喉嚨痛|肌肉痠痛/i.test(q) && !/無症狀|沒有症狀|無類流感症狀/i.test(q);
  const noSymptoms = /無症狀|沒有症狀|無類流感症狀/i.test(q);
  const hasCovidContact = /新冠(?:的)?接觸者|有新冠接觸|有接觸/i.test(q) && !/不是新冠接觸者|無新冠接觸|沒有新冠接觸|無接觸/i.test(q);
  const noCovidContact = /不是新冠接觸者|無新冠接觸|沒有新冠接觸|無接觸/i.test(q);

  if (!(hasSymptoms || noSymptoms) || !(hasCovidContact || noCovidContact)) {
    return '流感快篩陽性、PCR 陰性，需再確認兩項風險：\n' +
      '1. 是否有發燒、咳嗽、喉嚨痛或肌肉痠痛等類流感症狀？\n' +
      '2. 是否為新冠接觸者？\n' +
      '請點選下方符合的組合；新冠接觸者即使無症狀，仍先採較高規格因應。';
  }

  if (hasCovidContact) {
    if (hasSymptoms) {
      return '有類流感症狀且為新冠接觸者：\n' +
        '- 採較高規格呼吸道隔離防護；優先單人安置（或 cohorting 同室隔離），僅可與相同暴露風險者同室，不得與無風險者同室。\n' +
        '- 同步依院內 COVID-19 風險情境流程安排 PPE、新冠及其他呼吸道病原採檢與症狀監測。\n' +
        '- 未完成新冠風險評估前，不因流感 PCR 陰性直接解隔。';
    }
    return '無症狀但為新冠接觸者：仍屬高風險，先採較高規格因應。\n' +
      '- 優先單人安置（或 cohorting 同室隔離），僅可與相同暴露風險的接觸者同室，不得與無風險者同室，以避免後續發病造成第二波散播。\n' +
      '- 依院內 COVID-19 風險情境流程執行 PPE、健康監測及適時採檢；若出現症狀，立即提升為症狀個案處置。\n' +
      '- 未完成新冠風險評估前，不因流感 PCR 陰性直接解隔。';
  }
  if (hasSymptoms) {
    return '有類流感症狀、無新冠接觸史：\n' +
      '- 先維持 ANN00039 飛沫＋接觸隔離。\n' +
      '- 依症狀、採檢時機與檢體品質評估是否重採；確認不支持流感後，再評估以 ANN10039 取消隔離。';
  }
  return '無類流感症狀、無新冠接觸史：\n' +
    '- 若 PCR 採檢時機與檢體品質可信，可由醫療團隊評估不再維持流感隔離；需要取消時開立 ANN10039。\n' +
    '- 若涉及群聚或採檢品質有疑慮，仍先維持防護並洽感管中心／檢驗醫學部評估。';
}

function needsInfluenzaDiscordantRiskClarification_(question) {
  const q = String(question || '').replace(/\s+/g, '');
  const hasSymptomStatus = /有類流感症狀|有症狀|發燒|咳嗽|喉嚨痛|肌肉痠痛|無症狀|沒有症狀|無類流感症狀/i.test(q);
  const hasContactStatus = /新冠(?:的)?接觸者|有新冠接觸|有接觸|不是新冠接觸者|無新冠接觸|沒有新冠接觸|無接觸/i.test(q);
  return !(hasSymptomStatus && hasContactStatus);
}

function isSeasonalInfluenzaClearanceQuestion_(question) {
  const q = String(question || '');
  if (!/流感/i.test(q) || /新型\s*A|禽流感|H5N1|H7N9/i.test(q)) return false;
  return /解隔|解除隔離|取消隔離|解隔天數|是否要陰性|要不要陰性|需不需要陰性/i.test(q);
}

function influenzaClearanceReply_() {
  return '流感解除隔離重點：\n' +
    '- 不建議只用固定天數判斷，也不要求一律驗到陰性；應綜合評估症狀是否改善及是否退燒。\n' +
    '- 同時確認咳嗽與呼吸道分泌物是否可控制、病人能否全程戴口罩，以及是否仍需插管、開放式抽痰、噴霧或 NIV 等氣膠處置。\n' +
    '- 兒童、免疫功能低下、症狀仍明顯或同室病人屬高風險者，可能排病毒較久，先維持飛沫＋接觸隔離並由醫療團隊／感管中心評估。\n' +
    '- 符合解隔條件後開立 ANN10039 取消流感隔離註記；不是終止原本的 ANN00039。';
}

function zosterClearanceReply_() {
  return '帶狀疱疹解除隔離重點：\n' +
    '- 侷限性且免疫功能正常：病灶應完整覆蓋並採接觸防護，維持至所有水泡乾燥結痂。\n' +
    '- 瀰漫性帶狀疱疹，或免疫功能低下且尚未排除瀰漫性感染：採空氣＋接觸隔離，維持至所有病灶乾燥結痂且沒有新病灶。\n' +
    '- 符合條件後開立 ANN10042 取消隔離註記；不是終止原本的隔離醫囑。';
}

function disseminatedZosterDefinitionReply_() {
  return '瀰漫性帶狀疱疹定義：\n' +
    '- 院內定義：帶狀疱疹病灶侵犯 3 個神經節（含）以上。\n' +
    '- 符合院內定義，或免疫功能低下且尚無法排除瀰漫性感染時，先採空氣＋接觸隔離，優先單人負壓病室，至所有病灶乾燥結痂。\n' +
    '- 若病灶分布不典型，需由醫療團隊依全身皮膚檢查、免疫狀態及必要的 VZV 檢驗確認。';
}

function diseaseTestResultIsolationReply_(question, disease) {
  if (!disease) return '';
  const q = String(question || '').replace(/\s+/g, '');
  const hasPositiveResult = /陽性|檢出|驗出|培養出|positive/i.test(q);
  const asksIsolation = /要不要隔離|是否隔離|需要隔離|需不需要隔離|隔離嗎|怎麼隔離|隔離/i.test(q);
  if (!hasPositiveResult || (!asksIsolation && !/(快篩|抗原|pcr|核酸|培養)/i.test(q))) return '';

  const profile = diseaseInfectionControlProfile_(disease.name);
  if (!profile) return '';
  const placement = String(profile.placement || '').trim();
  const order = String(profile.order || '').trim();
  if (!placement && !order) return '';

  let text = disease.name + '檢驗陽性：';
  if (placement) text += '\n- 隔離判斷：' + placement;
  if (order) text += '\n- 院內醫囑：' + order;
  text += '\n- 若後續確認檢驗陰性、結果互相矛盾，或臨床認為可能是假陽性，不要直接沿用本回答；應依確認檢驗、症狀、採檢品質及群聚風險重新評估。';
  return text;
}

function loadBotReferenceData_() {
  if (BOT_REFERENCE_RUNTIME_CACHE_) return BOT_REFERENCE_RUNTIME_CACHE_;
  if (USER_REQUEST_CACHE_.referenceUnavailable) return {};
  const cache = CacheService.getScriptCache();
  const key = 'bot_reference_data_v4';
  try {
    let text = cache.get(key);
    const cacheHit = !!text;
    if (!text) {
      const files = DriveApp.getFolderById(getProp_('KB_FOLDER_ID')).getFilesByName(CONFIG.REFERENCE_FILE_NAME);
      if (!files.hasNext()) throw new Error('Reference data not uploaded');
      text = files.next().getBlob().getDataAsString('UTF-8');
    }
    const data = JSON.parse(text);
    if (data.schemaVersion !== 2 || data.destinations.length < 200 || !data.clinicalProfiles || !data.travelRegions || !data.epidemicPlaces || !data.epidemicText || !data.generalHealth || !data.travelText.askDestination || !data.travelText.replyTitle || !data.travelSnapshot.countries || !data.travelSnapshot.profiles || !data.vaccineLabels) throw new Error('Invalid reference data');
    BOT_REFERENCE_RUNTIME_CACHE_ = data;
    try { if (!cacheHit) cache.put(key, text, 300); } catch (err) { console.error('Reference cache unavailable'); }
    return data;
  } catch (err) {
    USER_REQUEST_CACHE_.referenceUnavailable = true;
    console.error('Bot reference data unavailable; check Drive upload');
    return {};
  }
}

function travelDestinations_() { return loadBotReferenceData_().destinations || []; }
function travelText_(key) { return (loadBotReferenceData_().travelText || {})[key] || ''; }

function normalizeTravelPlace_(text) {
  return String(text || '').normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function extractTravelDestinations_(question) {
  const q = normalizeTravelPlace_(question);
  const matches = [];
  travelDestinations_().forEach(function(row) {
    row.slice(2).forEach(function(alias) {
      if (alias === 'US' && !/\bUS\b/.test(String(question || ''))) return;
      const term = normalizeTravelPlace_(alias);
      let offset = q.indexOf(term);
      while (offset >= 0) {
        const end = offset + term.length;
        if (!/^[a-z]/.test(term) || (!/[a-z]/.test(q.charAt(offset - 1)) && !/[a-z]/.test(q.charAt(end)))) {
          matches.push({ slug: row[0], label: row[1], start: offset, end: end });
        }
        offset = q.indexOf(term, offset + 1);
      }
    });
  });
  const seen = {};
  return matches.filter(function(match) {
    return !matches.some(function(other) {
      return other.start <= match.start && other.end >= match.end && other.end - other.start > match.end - match.start;
    });
  }).filter(function(match) {
    if (seen[match.slug]) return false;
    seen[match.slug] = true;
    return true;
  });
}

function isTravelVaccineQuery_(question) {
  const q = String(question || '');
  if (!/疫苗|預防針|打針|vaccin|immuniz|immunis|\bshots?\b|\bjabs?\b|vaksin|imunisasi|tiêm|tiem|vắc.?xin|vac.?xin|วัคซีน|ฉีดยา/i.test(q)) return false;
  if (/旅遊|旅行|出國|出境|前往|去|到|飛|拜訪|travel|trip|visit|bepergian|perjalanan|du lịch|เดินทาง|ท่องเที่ยว/i.test(q)) return true;
  const places = q.replace(/日本腦炎|日本脑炎|Japanese encephalitis|ensefalitis Jepang|viêm não Nhật Bản|ไข้สมองอักเสบญี่ปุ่น/ig, '');
  return extractTravelDestinations_(places).length > 0;
}

function isTravelVaccineDestinationFollowup_(question, event) {
  const userId = getLineUserId_(event);
  if (!userId || !getUserState_(userId).travelVaccinePending) return false;
  const q = normalizeTravelPlace_(String(question || '').trim());
  if (/\d|天|週|days?|weeks?|hari|ngay|วัน|amazon|亞馬遜/i.test(q) && !/通報|隔離|採檢|清消|疫情|report|isolat|outbreak/i.test(q)) return extractTravelDestinations_(q).length > 0;
  return travelDestinations_().some(function(row) {
    return row.slice(2).some(function(alias) { return normalizeTravelPlace_(alias) === q; });
  });
}

function travelHtmlText_(html) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(?:p|li|div|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&#x([0-9a-f]+);/gi, function(_, n) { return String.fromCodePoint(parseInt(n, 16)); })
    .replace(/&#(\d+);/g, function(_, n) { return String.fromCodePoint(Number(n)); })
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&(?:apos|#39);/gi, "'").replace(/[ \t\r]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function parseCdcTravelVaccines_(html) {
  const table = String(html || '').match(/<table\b[^>]*\bid=["']dest-vm-a["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return [];
  const rows = [];
  const tr = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = tr.exec(table[1]))) {
    const cells = match[1].match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 2) continue;
    const name = travelHtmlText_(cells[0]);
    const recommendation = travelHtmlText_(cells[1]);
    if (name && recommendation) rows.push({ name: name, recommendation: recommendation });
  }
  return rows.some(function(row) { return row.name === 'Routine vaccines'; }) && rows.length >= 2 ? rows : [];
}

function loadCdcTravelVaccines_(slug) {
  if (!travelDestinations_().some(function(row) { return row[0] === slug; })) return null;
  const key = 'cdc_travel_vaccines_v1_' + slug;
  const cache = CacheService.getScriptCache();
  try {
    const cached = cache.get(key);
    if (cached) {
      const data = JSON.parse(cached);
      const age = Date.now() - Date.parse(data.checkedAt);
      if (data.slug === slug && age >= 0 && age < 21600000 && data.rows && data.rows.length) return data;
    }
  } catch (err) { console.error('CDC travel cache read failed'); }
  const url = 'https://wwwnc.cdc.gov/travel/destinations/traveler/none/' + slug;
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: false });
    if (res.getResponseCode() !== 200) return null;
    const rows = parseCdcTravelVaccines_(res.getContentText());
    if (!rows.length) return null;
    const data = { slug: slug, rows: rows, checkedAt: new Date().toISOString() };
    try { cache.put(key, JSON.stringify(data), 21600); } catch (err) { console.error('CDC travel cache write failed'); }
    return data;
  } catch (err) {
    console.error('CDC travel source unavailable');
    return null;
  }
}

function travelVaccineRowSummary_(row) {
  const labels = loadBotReferenceData_().vaccineLabels || {};
  const label = labels[row.name] || row.name;
  const source = String(row.recommendation || '').replace(/\s+/g, ' ').trim();
  if (row.name === 'Malaria') return travelText_('malaria');
  if (row.name === 'Routine vaccines') return travelText_('routine');
  if (row.name === 'COVID-19') return travelText_('covid');
  if (row.name === 'Measles') return travelText_('measles');
  if (row.name === 'Yellow Fever') {
    const recommendation = source.split(/Country entry requirements\s*:/i)[0];
    const status = /^CDC recommendations:\s*Vaccine is not recommended\s*[.;]/i.test(recommendation)
      ? travelText_('yellowNotRoutine')
      : travelText_('yellowAssess');
    return '- 黃熱病：' + status + travelText_('yellowEntryNotice');
  }
  if (/vaccine is required for/i.test(source) && /Hajj|Umrah/i.test(source)) {
    return '- ' + label + travelText_('hajjRequired');
  }
  if (row.name === 'Polio' && /single lifetime booster/i.test(source)) {
    return travelText_('polio');
  }
  if (/^(?:\w+ )?(?:vaccine|vaccination) is (?:generally )?not recommended\b/i.test(source) ||
      /^All travelers should take steps to prevent mosquito bites\.\s*Chikungunya vaccination is generally not recommended\./i.test(source)) {
    return '- ' + label + travelText_('notRoutine');
  }
  if (/recommended for most travelers/i.test(source)) return '- ' + label + travelText_('mostTravelers');
  if (/recommended for unvaccinated/i.test(source)) return '- ' + label + travelText_('unvaccinated');
  if (/pre-exposure|consider|recommended for|vaccination is recommended/i.test(source)) {
    return '- ' + label + travelText_('conditional');
  }
  return '- ' + label + travelText_('unclassified');
}

function travelVaccineReply_(question, event) {
  const destinations = extractTravelDestinations_(question);
  const indexUrl = 'https://wwwnc.cdc.gov/travel/destinations/list';
  const base = { diseaseName: '旅遊疫苗', subtopic: 'travel-vaccines', travelVaccine: true, travelSourceUrl: indexUrl };
  if (!loadBotReferenceData_().destinations) {
    base.text = '旅遊疫苗資料目前無法讀取，請稍後再試或查閱下方官方連結。';
    base.clarification = true;
    return base;
  }
  const userId = getLineUserId_(event);
  if (userId) {
    const state = getUserState_(userId);
    state.travelVaccinePending = destinations.length !== 1;
    if (languageChoice_(question)) state.language = languageChoice_(question);
    saveUserState_(userId, state);
  }
  if (destinations.length !== 1) {
    const region = !destinations.length && (loadBotReferenceData_().travelRegions || []).find(function(r) {
      return r.aliases.some(function(a) { return normalizeTravelPlace_(question).indexOf(normalizeTravelPlace_(a)) >= 0; });
    });
    if (region) { base.text = region.text; base.clarification = true; return base; }
    base.text = destinations.length > 1
      ? travelText_('multipleDestinations')
      : travelText_('askDestination');
    base.clarification = true;
    return base;
  }
  const place = destinations[0];
  base.travelSourceUrl = 'https://wwwnc.cdc.gov/travel/destinations/traveler/none/' + place.slug;
  let data = loadCdcTravelVaccines_(place.slug);
  if (!data) {
    const s = loadBotReferenceData_().travelSnapshot, hit = s.countries[place.slug];
    const age = hit && Date.now() - Date.parse(hit[1]);
    if (!hit || !Number.isFinite(age) || age < 0 || age > 2592000000 || !Array.isArray(s.profiles[hit[0]])) {
      base.text = place.label + travelText_('sourceUnavailable');
      base.clarification = true;
      return base;
    }
    data = { summary: s.profiles[hit[0]].map(function(i) { return s.texts[i]; }), checkedAt: hit[1] };
  }
  base.travelCheckedAt = data.checkedAt;
  base.text = place.label + travelText_('replyTitle') +
    travelText_('replyScope') +
    (data.summary ? travelText_('snapshotNotice') : '') +
    (data.summary || data.rows.map(travelVaccineRowSummary_)).join('\n') +
    travelText_('clinicAdvice') +
    travelText_('localAvailability');
  return base;
}

function isTravelEpidemicQuery_(question) {
  const q = String(question || '');
  return /疫區|旅遊疫情|疫情建議|哪些國家|哪些地區|哪裡流行|有何疫情|有何特殊傳染病|有哪些疫情/i.test(q);
}

function travelEpidemicReply_(question, disease) {
  if (!disease) return '';
  const diseaseName = disease.name;
  const epidemicName = epidemicDiseaseName_(diseaseName);
  if (!epidemicName) return '';

  try {
    const kb = loadKb_();
    const entries = kb.entries || [];
    const relevant = entries.filter(function(entry) {
      return String(entry.source || '') === 'CDC目前國際旅遊疫情建議等級_疾病疫區.md' &&
        String(entry.title || '').indexOf(epidemicName) >= 0;
    });
    const summary = relevant.filter(function(entry) {
      return /疫區摘要/.test(String(entry.title || ''));
    })[0];
    const detail = relevant.filter(function(entry) {
      return /第[一二三]級|警告|警示|注意|Warning|Alert|Watch/.test(String(entry.title || ''));
    })[0];
    const header = relevant.filter(function(entry) {
      return /目前疫區/.test(String(entry.title || ''));
    })[0];

    if (!summary && !detail && !header) return '';

    const lines = [];
    lines.push(epidemicName + '目前疫區：');
    if (header) {
      cleanEpidemicLines_(header.text).forEach(function(line) { lines.push(line); });
    }
    if (summary) {
      cleanEpidemicLines_(summary.text).forEach(function(line) { lines.push(line); });
    }
    if (detail) {
      cleanEpidemicLines_(detail.text).forEach(function(line) { lines.push(line); });
    }
    lines.push('疫區與旅遊建議會變動；出國前、TOCC 判讀或個案處置時，仍請再確認疾管署最新公告。');
    return normalizeTravelLevelText_(dedupeLines_(lines).join('\n'));
  } catch (err) {
    console.error('travelEpidemicReply_ skipped: ' + err.toString());
    return '';
  }
}

function countryOrRegionEpidemicReply_(question) {
  const q = String(question || '').trim();
  if (!isTravelEpidemicQuery_(q) && !/疫情|疫區/.test(q)) return '';
  const target = extractEpidemicPlace_(q);
  if (!target) return '';

  try {
    const kb = loadKb_();
    const entries = kb.entries || [];
    const hits = [];
    const seen = {};
    entries.forEach(function(entry) {
      if (String(entry.source || '') !== 'CDC目前國際旅遊疫情建議等級_疾病疫區.md') return;
      const title = String(entry.title || '');
      const text = String(entry.text || '');
      if (/疫區摘要/.test(title)) return;
      if (!/第[一二三]級|警告|警示|注意|Warning|Alert|Watch/.test(title)) return;
      if (!epidemicPlaceMatches_(title + '\n' + text, target)) return;

      const diseaseName = title.replace(/\s+(疫區摘要|第[一二三]級[:：].*)$/, '').trim();
      const level = epidemicLevelFromText_(title + '\n' + text);
      const date = epidemicDateForPlace_(text, target);
      const key = diseaseName + '|' + level;
      if (!diseaseName || seen[key]) return;
      seen[key] = true;
      hits.push({ diseaseName: diseaseName, level: level, date: date });
    });

    if (!hits.length) return (loadBotReferenceData_().epidemicText.noHits || '').replace(/\{place\}/g, target.label);
    hits.sort(function(a, b) {
      return epidemicLevelRank_(b.level) - epidemicLevelRank_(a.level) ||
        String(a.diseaseName).localeCompare(String(b.diseaseName), 'zh-Hant');
    });
    const lines = [];
    lines.push(target.label + '目前列示的旅遊疫情建議：');
    hits.slice(0, 12).forEach(function(hit) {
      lines.push('- ' + hit.diseaseName + '：' + (hit.level || '旅遊疫情建議') + (hit.date ? '；發布日期：' + hit.date : ''));
    });
    lines.push(loadBotReferenceData_().epidemicText.footer);
    return normalizeTravelLevelText_(lines.join('\n'));
  } catch (err) {
    console.error('countryOrRegionEpidemicReply_ skipped: ' + err.toString());
    return '';
  }
}

function extractEpidemicPlace_(question) {
  const q = String(question || '');
  const places = loadBotReferenceData_().epidemicPlaces || [];
  for (let i = 0; i < places.length; i++) {
    if (places[i].terms.some(function(term) { return q.indexOf(term) >= 0; })) return places[i];
  }
  const m = q.match(/([\u4e00-\u9fa5]{2,6})(?:有什麼疫情|有何疫情|有哪些疫情|疫情|疫區)/);
  if (m && !/目前|國際|國內|旅遊|出國|請問|醫院/.test(m[1])) {
    return { label: m[1], terms: [m[1]] };
  }
  return null;
}

function epidemicPlaceMatches_(text, target) {
  const hay = String(text || '');
  const terms = (target.terms || []).concat(target.region || []);
  return terms.some(function(term) { return hay.indexOf(term) >= 0; });
}

function epidemicLevelFromText_(text) {
  const t = normalizeTravelLevelText_(String(text || ''));
  if (/🔴\s*第三級：警告|第三級[:：]警告/.test(t)) return '🔴 第三級：警告';
  if (/🟠\s*第二級：警示|第二級[:：]警示/.test(t)) return '🟠 第二級：警示';
  if (/🟡\s*第一級：注意|第一級[:：]注意/.test(t)) return '🟡 第一級：注意';
  return '';
}

function epidemicLevelRank_(level) {
  if (/第三級/.test(level)) return 3;
  if (/第二級/.test(level)) return 2;
  if (/第一級/.test(level)) return 1;
  return 0;
}

function epidemicDateForPlace_(text, target) {
  const terms = (target.terms || []).concat(target.region || []);
  const lines = String(text || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!terms.some(function(term) { return lines[i].indexOf(term) >= 0; })) continue;
    const m = lines[i].match(/發布日期[:：]\s*(20\d{2}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return '';
}

function epidemicDiseaseName_(diseaseName) {
  const d = String(diseaseName || '');
  const map = loadBotReferenceData_().epidemicDiseaseNames || {};
  return map[d] || d;
}

function cleanEpidemicLines_(text) {
  const out = [];
  String(text || '').split('\n').forEach(function(raw) {
    let line = cleanKnowledgeLine_(raw);
    if (!line) return;
    line = normalizeTravelLevelText_(line.replace(/^\s*-\s*/, ''));
    if (/^疾病：/.test(line)) return;
    if (/^地區清單：?$/.test(line)) return;
    if (/目前疫區$|疫區摘要$/.test(line)) return;
    if (/^[^：\n]+[🔴🟠🟡]\s*第[一二三]級：(警告|警示|注意)$/.test(line)) return;
    out.push(line);
  });
  return out;
}

function dedupeLines_(lines) {
  const seen = {};
  return (lines || []).filter(function(line) {
    line = String(line || '').trim();
    if (!line || seen[line]) return false;
    seen[line] = true;
    return true;
  });
}

function diseaseInfectionControlProfile_(name) {
  const profiles = loadBotReferenceData_().clinicalProfiles || {};

  return profiles[name] || null;
}

function diseaseFullOverviewReply_(diseaseName, profile) {
  const hisCodePart = extractHisOrderCode_(profile.specimen, diseaseName);

  return '🛡️ **' + diseaseName + ' 感染管制與臨床處置標準 SOP 總覽**：\n\n' +
    '【📋 1. 法定通報與時限】\n   · ' + profile.category + '\n\n' +
    '【🏥 2. 床位安置與隔離醫囑】\n   · 安置原則：' + profile.placement + '\n   · 隔離醫囑：' + profile.order + '\n\n' +
    '【🛡️ 3. 防護裝備 (PPE)】\n   · ' + profile.ppe + '\n\n' +
    '【🧪 4. 採檢送驗與 HIS 醫令】\n   · 檢體種類：' + profile.specimen + '\n   · HIS 醫令：' + hisCodePart + '\n\n' +
    '【🧹 5. 環境清消與感控重點】\n   · 環境消毒：' + profile.sanitization + '\n   · 照護重點：' + profile.care + '\n' +
    nextSubtopicPrompt_(diseaseName);
}

function diseaseSubtopicReply_(diseaseName, profile, subtopic) {
  if (!profile) return null;

  if (subtopic === 'definition') {
    const definitionReply = cdcNotificationDefinitionReply_(diseaseName);
    if (definitionReply) return definitionReply;
    return diseaseName + '通報定義目前在本地知識庫沒有完整條件。\n\n' +
      '- 請先確認疾管署「病例定義暨防疫檢體採檢送驗事項」最新公告。\n' +
      '- 若符合或疑似符合法定傳染病通報條件，仍應依通報時限與院內流程辦理。\n' +
      '- 疾管署病例定義頁：https://www.cdc.gov.tw/Category/DiseaseDefine/ZW54U0FpVVhpVGR3UkViWm8rQkNwUT09';
  }

  if (subtopic === 'clearance') {
    const mdroClearance = mdroClearanceReply_(diseaseName);
    if (mdroClearance) return mdroClearance;
    return safeDiseaseSubtopicFallback_(diseaseName, 'clearance');
  }

  if (subtopic === 'exposure') {
    if (/^(麻疹|百日咳|HIV|針扎與體液暴露)$/.test(diseaseName)) {
      return postExposurePepReply_(diseaseName + ' 暴露處置');
    }
    return diseaseName + '目前未設定常規「暴露造冊/預防用藥」快捷流程。\n\n' +
      '- 若為法定傳染病疑似或確定個案，請先完成通報與院內感染管制通知。\n' +
      '- 是否匡列接觸者、造冊、追蹤或預防用藥，需依疾病別傳播途徑與感染管制中心指示判斷。\n' +
      '- 若只是一般照護暴露疑慮，請補充是同住、同病室、照護、檢查轉送或血液體液暴露。';
  }

  if (subtopic === 'placement') {
    return '🛌 **' + diseaseName + ' 病房安排與收治建議**：\n\n' +
      '【🏥 1. 床位與安置原則】\n   · ' + profile.placement + '\n\n' +
      '【🛑 2. 對應隔離醫囑】\n   · ' + profile.order + '\n\n' +
      '【🛡️ 3. 建議防護裝備 (PPE)】\n   · ' + profile.ppe + '\n' +
      nextSubtopicPrompt_(diseaseName);
  }

  if (subtopic === 'order') {
    return '📝 **' + diseaseName + ' 通報與隔離醫囑處置**：\n\n' +
      '【📋 1. 法傳通報類別】\n   · ' + profile.category + '\n\n' +
      '【🛑 2. 院內隔離醫囑】\n   · ' + profile.order + '\n\n' +
      '【🛡️ 3. 建議防護裝備 (PPE)】\n   · ' + profile.ppe + '\n' +
      nextSubtopicPrompt_(diseaseName);
  }

  if (subtopic === 'specimen') {
    const hisCodePart = extractHisOrderCode_(profile.specimen, diseaseName);
    const sendFlow = isMdroTerm_(diseaseName)
      ? 'MDRO/MRSE 等抗藥菌原則送本院檢醫部檢驗，不是送驗 CDC；若需院內篩檢，診療醫令 → 主分類「細菌」→ 次分類「感管篩選」，依菌種與採檢部位選擇醫令。'
      : '總院目前無須列印紙本送驗單；開立醫令碼後由院內採檢與檢醫部流程銜接，防疫檢體由感染管制中心依規定送疾病管制署。若 CDC 需附病情摘要或照片，請先完成電子病歷。';
    return '🧪 **' + diseaseName + ' 採檢醫令與送驗重點**：\n\n' +
      '【🧪 1. HIS 檢驗醫令碼】\n   · ' + hisCodePart + '\n\n' +
      '【🧫 2. 檢體種類與專用容器】\n   · ' + profile.specimen + '\n\n' +
      '【🛑 3. 對應隔離醫囑】\n   · ' + profile.order + '\n\n' +
      '【🚚 4. 總院送驗流程】\n   · ' + sendFlow + '\n' +
      nextSubtopicPrompt_(diseaseName);
  }

  if (subtopic === 'isolation') {
    return '🛑 **' + diseaseName + ' 隔離醫囑與病房處置**：\n\n' +
      '【🛑 1. 院內隔離醫囑】\n   · ' + profile.order + '\n\n' +
      '【🏥 2. 床位與安置原則】\n   · ' + profile.placement + '\n\n' +
      '【🛡️ 3. 建議防護裝備 (PPE)】\n   · ' + profile.ppe + '\n\n' +
      '【🧹 4. 環境與高頻表面消毒】\n   · ' + profile.sanitization + '\n' +
      nextSubtopicPrompt_(diseaseName);
  }

  if (subtopic === 'sanitization') {
    return '🧹 **' + diseaseName + ' 環境清消與終末消毒重點**：\n\n' +
      '【🧹 1. 環境消毒重點】\n   · ' + profile.sanitization + '\n\n' +
      '【🛑 2. 病房隔離醫囑】\n   · ' + profile.order + '\n' +
      nextSubtopicPrompt_(diseaseName);
  }

  if (subtopic === 'care') {
    return '🩺 **' + diseaseName + ' 臨床照護與感控重點**：\n\n' +
      '【🩺 1. 臨床照護措施】\n   · ' + profile.care + '\n\n' +
      '【🛑 2. 院內隔離醫囑】\n   · ' + profile.order + '\n' +
      nextSubtopicPrompt_(diseaseName);
  }

  return null;
}

function genericDiseaseSanitizationReply_(diseaseName) {
  const d = String(diseaseName || '本疾病').trim();
  return d + '環境清消重點：\n' +
    '- 目前院內資料未見此疾病的專屬消毒濃度；不引用其他疾病或特殊單位的清消數字。\n' +
    '- 先清除可見髒污，再依一般或特殊感染症環境清潔流程，以院內核准且適合表面／設備材質的消毒劑處理高頻接觸面。\n' +
    '- 病人用品儘量專用，共用設備於每次使用後清消；轉床、出院或解隔後執行終期清潔。\n' +
    '- 若有血液、體液大量污染、特殊病原或疫情專案規定，依疾病別措施與感管中心最新指示提高濃度或調整流程。';
}

function safeDiseaseSubtopicFallback_(diseaseName, subtopic) {
  const d = String(diseaseName || '').trim();
  if (!d) return '';
  const replies = {
    definition: d + '通報定義：目前知識庫未載明可直接引用的完整疾病別病例條件，因此不以其他疾病或通用通報文字代替。\n- 請依疾管署最新病例定義確認臨床條件、檢驗條件與通報時限。\n- 疑似符合時，先依院內通報流程聯繫感染管制中心確認。',
    order: d + '隔離醫囑：目前知識庫未載明經確認的疾病別院內醫囑代碼，因此不套用其他疾病的 ANN 醫囑。\n- 先依傳播途徑採取必要防護。\n- 請由院內現行隔離醫囑清單或感染管制中心確認正式醫囑名稱與取消方式。',
    isolation: d + '隔離處置：目前知識庫未載明經確認的疾病別隔離醫囑，因此不套用呼吸道病毒或其他疾病模板。\n- 先維持標準防護並依已知傳播途徑加強防護。\n- 病室、PPE及醫囑請依院內現行疾病別規範確認。',
    placement: d + '病人安置：目前知識庫未載明經確認的疾病別床位條件，因此不引用「隔壁床」衛教或其他疾病安置方式。\n- 安置前確認傳播途徑、是否能控制分泌物或排泄物，以及是否有氣霧處置。\n- 單人房、負壓或集中照護需求請依院內現行疾病別規範確認。',
    specimen: d + '採檢送驗：目前知識庫未載明可確認的疾病別檢體、容器或醫令，因此不引用其他疾病的採檢內容。\n- 請依疾管署最新「病例定義暨防疫檢體採檢送驗事項」及院內檢驗醫令確認。\n- 防疫檢體送驗前請聯繫感染管制中心。',
    care: d + 'PPE與照護：目前知識庫未載明經確認的疾病別 PPE 組合，因此不套用其他疾病的防護裝備。\n- 以標準防護為基礎，再依接觸、飛沫、空氣或血液體液暴露風險加強。\n- 執行氣霧處置或可能噴濺作業前，請依院內現行規範完成風險評估。',
    clearance: d + '解除隔離：目前知識庫未載明經確認的疾病別解除條件，因此不提供推測的固定天數、陰性次數或取消醫囑。\n- 在確認正式條件前維持原防護措施，不自行解隔。\n- 請依院內現行疾病別規範及感染管制中心確認症狀、時間、檢驗與取消醫囑條件。'
  };
  return replies[subtopic] || '';
}

function auditDiseaseTopicReply_(diseaseName, question) {
  const d = String(diseaseName || '').trim();
  if (!d) return '';
  const profile = diseaseInfectionControlProfile_(d);
  const q = normalizeIntentText_(question || '');
  const asksQuestions = /委員.*(?:問|提問)|可能提問/i.test(q);
  const asksEvidence = /(?:km|佐證|紀錄|資料位置)/i.test(q);
  if (asksQuestions) return auditDiseaseQuestionsReply_(d, profile);
  if (asksEvidence) return auditDiseaseEvidenceReply_(d, profile);
  if (d !== '庫賈氏病') {
    return d + '對應查核面向：通報、隔離標示、PPE、病人安置、採檢送驗、環境清消及相關紀錄。\n請點選下方想查詢的面向。';
  }
  const lines = [d + '評鑑查核重點：'];

  if (d === '麻疹') {
    lines.push('- 對應查核面向：法定傳染病通報時效、空氣隔離與病人安置、N95/PPE、接觸者造冊及員工暴露後健康監測。');
    lines.push('- 委員可能詢問：疑似麻疹如何辨識與通報、病人安置在哪裡、接觸者如何匡列、同仁暴露後如何追蹤。');
    lines.push('- KM 可查閱佐證：麻疹感染管制措施、法定傳染病通報流程、接觸者處置及相關表單。');
    lines.push('- 現場／系統執行紀錄：通報紀錄、隔離醫囑、接觸者名冊、員工健康監測及暴露追蹤紀錄。');
  } else if (d === '庫賈氏病') {
    lines.push('- 查核面向：風險辨識與勾稽、侵入性處置前通知、器械分流及去活化。');
    lines.push('- 委員可能詢問：列管狀態怎麼查？臨時排程怎麼補查？中高感染力組織器械怎麼處理？');
    lines.push('- 可出示紀錄：CJD 勾稽、排程、跨單位通知及器械處理紀錄。');
    lines.push('- KM：50300-3-000013「庫賈氏病感染管制措施」。');
  } else if (profile) {
    lines.push('- 對應查核面向：' + profile.category + '；隔離與安置、PPE、採檢送驗、環境清消及完成紀錄須能相互勾稽。');
    lines.push('- 委員可能詢問：何時啟動通報與隔離？隔離醫囑如何開立及取消？採什麼檢體？照護人員如何防護？');
    lines.push('- KM 可查閱佐證：核定之「' + d + '感染管制措施」、法定傳染病通報流程及相關表單。');
    lines.push('- 現場／系統執行紀錄：檢驗結果、通報紀錄、隔離與取消隔離醫囑、床位安排、清消及必要的接觸者／暴露追蹤紀錄。');
    lines.push('- 採檢送驗：' + profile.specimen);
    lines.push('- 清消重點：' + profile.sanitization);
  } else {
    lines.push('- 對應查核面向：通報、隔離標示、PPE、病人安置、採檢送驗、環境清消及相關紀錄。');
    lines.push('- 委員可能詢問：第一線如何辨識、啟動流程、留下紀錄並確認措施已完成。');
    lines.push('- KM 可查閱佐證：現行核定感染管制措施、通報流程、相關表單及教育訓練資料。');
    lines.push('- 現場／系統執行紀錄：依該疾病實際流程產生的醫囑、通報、採檢、隔離、清消或追蹤紀錄。');
  }

  if (profile && d !== '庫賈氏病') {
    const placement = String(profile.placement || '').replace(/[。；;]+$/, '');
    lines.push('- 現場回答重點：' + placement + '；' + profile.ppe);
  }
  if (d !== '庫賈氏病') {
    lines.push('- KM 位置：登入院內 KM 系統，搜尋單位「50300 感染管制中心」，查詢「' + d + '感染管制措施」或相關通報流程。');
  }
  return lines.join('\n');
}

function auditDiseaseFacetReply_(diseaseName, question) {
  const d = String(diseaseName || '').trim();
  const profile = diseaseInfectionControlProfile_(d);
  if (!d) return null;
  const q = normalizeIntentText_(question || '');
  if (/感染管制處置重點/.test(q)) {
    const lines = [d + '感染管制處置重點：'];
    if (profile) {
      lines.push('- 通報與時限：' + profile.category);
      lines.push('- 隔離與安置：' + profile.placement + '；' + profile.order);
      lines.push('- PPE：' + profile.ppe);
      lines.push('- 採檢送驗：' + profile.specimen);
      lines.push('- 清消：' + profile.sanitization);
      lines.push('- 查核佐證：通報、醫囑、床位安排、PPE/清消及採檢紀錄需能互相勾稽。');
    } else {
      lines.push('- 依疾病別通報、隔離標示、PPE、病人安置、採檢送驗、環境清消及追蹤紀錄整理。');
      lines.push('- 查核時重點是現場做法、正式規範與執行紀錄是否一致。');
    }
    return { facet: 'audit-care', text: lines.join('\n') };
  }
  if (/通報與時限查核|通報時限查核/.test(q)) {
    const reporting = profile
      ? d + '通報與時限查核：\n- ' + profile.category
      : (cdcNotificationDefinitionReply_(d) || safeDiseaseSubtopicFallback_(d, 'definition'));
    return { facet: 'audit-reporting', text: reporting + '\n- 可出示通報完成時間、退補件與追蹤完成紀錄；委員會勾稽辨識時間、通報時間及規定時限。' };
  }
  if (/隔離標示查核/.test(q)) {
    const isolation = profile ? profile.order : safeDiseaseSubtopicFallback_(d, 'isolation');
    return { facet: 'audit-isolation', text: d + '隔離標示查核：\n- ' + isolation + '\n- 可出示隔離與取消隔離醫囑、病室或床旁標示及啟動時間，確認醫囑、標示與實際執行一致。' };
  }
  if (/ppe防護查核|防護裝備查核/i.test(q)) {
    const ppe = profile ? profile.ppe : safeDiseaseSubtopicFallback_(d, 'care');
    return { facet: 'audit-ppe', text: d + ' PPE防護查核：\n- ' + ppe + '\n- 可出示 PPE 配置、效期巡查、教育訓練或穿脫技術查核紀錄。' };
  }
  if (/病人安置查核/.test(q)) {
    const placement = profile ? profile.placement : safeDiseaseSubtopicFallback_(d, 'placement');
    return { facet: 'audit-placement', text: d + '病人安置查核：\n- ' + placement + '\n- 可出示床位安排、同類集中照護或轉床紀錄，確認未與不適合的病人同室。' };
  }
  if (/採檢送驗查核/.test(q)) {
    const specimen = profile ? profile.specimen : (cdcSpecimenReply_(d) || safeDiseaseSubtopicFallback_(d, 'specimen'));
    return { facet: 'audit-specimen', text: d + '採檢送驗查核：\n- ' + specimen + '\n- 可出示醫令、採檢時間、檢體種類、檢驗結果及適用的防疫檢體送驗紀錄。' };
  }
  if (/環境清消查核/.test(q)) {
    const sanitization = profile ? profile.sanitization : genericDiseaseSanitizationReply_(d);
    return { facet: 'audit-sanitization', text: d + '環境清消查核：\n- ' + sanitization + '\n- 可出示每日與終期清消紀錄、消毒劑濃度／泡製日期標示及共用設備清消紀錄。' };
  }
  if (/相關紀錄查核/.test(q)) {
    return { facet: 'audit-records', text: auditDiseaseEvidenceReply_(d, profile) };
  }
  return null;
}

function auditDiseaseQuestionsReply_(diseaseName, profile) {
  const d = String(diseaseName || '').trim();
  if (!profile) {
    return d + '評鑑委員可能提問：\n' +
      '- 第一線如何辨識並啟動疾病別通報與感染管制流程？\n' +
      '- 病人如何安置、使用哪些 PPE，採檢與清消如何完成？\n' +
      '- 回答時應同時指出對應的核定規範及實際執行紀錄。';
  }
  return d + '評鑑委員可能提問與現場答案：\n' +
    '- 問：什麼情況會啟動處置？\n  答：先依疾病定義與臨床／檢驗結果辨識；通報規定為「' + profile.category + '」。\n' +
    '- 問：病人如何隔離及安置？\n  答：' + profile.placement + ' 隔離醫囑為「' + profile.order + '」\n' +
    '- 問：照護人員使用哪些 PPE？\n  答：' + profile.ppe + '\n' +
    '- 問：如何證明流程確實完成？\n  答：出示檢驗結果、通報紀錄、隔離與取消隔離醫囑、床位安排、清消及必要的接觸者／暴露追蹤紀錄。';
}

function auditDiseaseEvidenceReply_(diseaseName, profile) {
  const d = String(diseaseName || '').trim();
  const lines = [d + '評鑑查核 KM 佐證與勾稽紀錄：'];
  lines.push('- 核定規範：登入院內 KM 系統，搜尋單位「50300 感染管制中心」，查詢「' + d + '感染管制措施」及相關通報流程。');
  if (profile) {
    const specimen = String(profile.specimen || '').replace(/[。；;]+$/, '');
    lines.push('- 醫囑與安置：隔離醫囑及取消隔離醫囑紀錄、床位或集中照護安排；本疾病對應醫囑為「' + profile.order + '」');
    lines.push('- 檢驗與通報：' + specimen + '；並備妥檢驗結果及適用的法定傳染病通報完成紀錄。');
    lines.push('- 防護與清消：PPE 教育或技術查核、病室每日及終期清消紀錄；清消原則為「' + profile.sanitization + '」');
  } else {
    lines.push('- 執行紀錄：通報、採檢、隔離、病人安置、PPE、清消及追蹤紀錄，依實際個案流程相互勾稽。');
  }
  lines.push('- 委員勾稽方式：從一筆實際紀錄確認「辨識／檢驗 → 通報 → 隔離安置 → 防護清消 → 解除或追蹤」均有時間與完成紀錄。');
  return lines.join('\n');
}

function diseaseAuditActionPriorityReply_(question, event) {
  if (getUserMode_(event) !== 'audit') return null;
  const q = normalizeIntentText_(question);
  if (!/通報(?:委員提問|km佐證)$/i.test(q.replace(/\s+/g, ''))) return null;
  const disease = detectDisease_(q);
  if (!disease) return null;
  const profile = diseaseInfectionControlProfile_(disease.name);
  return {
    diseaseName: disease.name,
    text: /(?:委員提問)$/i.test(q.replace(/\s+/g, ''))
      ? auditDiseaseQuestionsReply_(disease.name, profile)
      : auditDiseaseEvidenceReply_(disease.name, profile)
  };
}

function needlestickActionPriorityReply_(question, event) {
  if (getUserMode_(event) !== 'audit') return null;
  const q = normalizeIntentText_(question).replace(/\s+/g, '');
  if (/^針扎暴露後立即處理$/.test(q)) {
    return {
      subtopic: 'needle-immediate',
      text: '針扎／血液體液暴露後立即處理：\n' +
        '- 皮膚或傷口：立即以流動清水和肥皂清洗；不用漂白水、不刷洗或擠壓傷口。\n' +
        '- 眼睛或黏膜：立即以大量清水或生理食鹽水沖洗。\n' +
        '- 立即通知單位主管並依院內流程完成暴露通報、風險評估及感染源／暴露者檢驗。\n' +
        '- 若可能需要 HIV PEP，應立即轉介評估，不要等待全部檢驗結果才處理。'
    };
  }
  if (/^針扎(?:hiv)?pep$/i.test(q)) {
    return {
      subtopic: 'needle-pep',
      text: '針扎暴露後 HIV PEP 重點：\n' +
        '- 先評估暴露途徑、傷口深度、污染量及感染源 HIV 狀態。\n' +
        '- 符合適應症時應盡快啟動；即使感染源檢驗尚未完成，也先由負責醫師依風險決定是否用藥。\n' +
        '- 同步留存基礎檢驗、用藥評估、處方、衛教及後續追蹤紀錄。\n' +
        '- 實際藥物組合、時限與療程依院內現行暴露後處置流程辦理。'
    };
  }
  if (/^針扎檢驗與追蹤$/.test(q)) {
    return {
      subtopic: 'needle-followup',
      text: '針扎暴露後檢驗與追蹤：\n' +
        '- 留存感染源與暴露者的基礎檢驗，依暴露類型評估 HIV、HBV 及 HCV 風險。\n' +
        '- 依院內時程完成後續抽血、結果通知與健康追蹤；若使用 PEP，並追蹤服藥與不良反應。\n' +
        '- 可供查核的紀錄包括：暴露通報、風險評估、基礎與追蹤檢驗、PEP 評估／處方及結案紀錄。'
    };
  }
  return null;
}

function auditGeneralTopicReply_(question, event) {
  if (getUserMode_(event) !== 'audit') return '';
  const q = normalizeIntentText_(question);
  if (/內視鏡/i.test(q) && !/(?:庫賈氏|cjd|鼻腔手術)/i.test(q)) return '';
  const detectedDisease = detectDisease_(q);
  if (detectedDisease && /(?:評鑑委員可能提問|委員提問|km佐證|可出示執行紀錄|感染管制處置重點|通報與時限查核|通報時限查核|隔離標示查核|ppe防護查核|防護裝備查核|病人安置查核|採檢送驗查核|環境清消查核|相關紀錄查核)/i.test(q)) return '';
  if (/^(傳染病通報|法定傳染病通報|通報機制|疾病通報)$/.test(q.replace(/\s+/g, ''))) {
    return officialAuditClauseReply_('查核條文 4.1');
  }
  if (/^(感染率監測|感染率|HAI監測|醫療照護相關感染監測|院內感染監測)$/.test(q.replace(/\s+/g, ''))) {
    return officialAuditClauseReply_('查核條文 1.6');
  }
  const menuReply = auditBroadTopicMenuReply_(q);
  if (menuReply) return menuReply;
  const officialReply = officialAuditClauseReply_(q);
  if (officialReply) return officialReply;
  const explicitClause = q.match(/(?:查核)?(?:條文)?\s*([1-5]\.[1-7])/i);
  if (explicitClause) {
    return {
      text: '查核條文 ' + explicitClause[1] + ' 的正式資料目前尚未同步完成，暫不提供未經確認的內容。請更新評鑑查核知識庫後再查詢；佐證資料僅提供 KM 系統文件。',
      clauseId: explicitClause[1],
      clauseTitle: '評鑑查核'
    };
  }
  const topics = auditClauseTopics_();
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    if (!topic.pattern.test(q)) continue;
    if (detectedDisease && topic.title === '感染管制教育訓練') continue;
    return topic.title + '查核重點：\n' +
      '- 查核要求：' + topic.requirement + '\n' +
      '- 委員可能的提問：' + topic.questions + '\n' +
      '- 可出示紀錄：' + topic.evidence + '\n' +
      '- KM：' + topic.km;
  }
  return '';
}

function catheterCareReply_(question, event) {
  const q = normalizeIntentText_(question).replace(/\s+/g, '');
  if (!/^(導管照護|管路照護|侵入性導管照護)$/.test(q)) return null;
  if (getUserMode_(event) === 'audit') return null;
  return {
    text: '導管種類不同，照護與更換原則不能混用。請選擇：\n' +
      '- 中心靜脈導管照護\n' +
      '- 導尿管照護\n' +
      '- 呼吸器管路照護'
  };
}

function auditBroadTopicMenuReply_(question) {
  const q = normalizeIntentText_(question).replace(/\s+/g, '');
  if (/^(抗生素管制|抗生素管理|抗菌藥物管理|抗微生物製劑管理)$/.test(q)) {
    return {
      text: '抗生素管理涉及三項查核條文，請選擇要詳查的方向：\n' +
        '- 計畫與權責：管理小組、領導支持、跨專業分工及年度目標。\n' +
        '- 使用監測：抗生素用量、處方適當性、管制藥審核、去升階及手術預防性用藥。\n' +
        '- 抗藥性防治：抗藥性趨勢、檢驗警示、隔離措施、群聚調查及改善。',
      auditTopicMenu: 'antibiotic'
    };
  }
  if (/^(防疫|防疫政策|疫情政策|防疫查核|疫情應變政策)$/.test(q)) {
    return {
      text: '防疫政策涉及數項查核條文，請選擇要詳查的方向：\n' +
        '- 手冊與疫情資訊：政策更新、教育訓練及國際疫情傳達。\n' +
        '- 隔離與應變：檢傷分流、隔離動線、PPE及大規模感染事件應變。\n' +
        '- 傳染病通報：通報時效、專責人員及衛生機關聯繫。\n' +
        '- 防疫物資：PPE安全庫存、規格、效期、盤點及緊急調度。\n' +
        '- 員工保護：疫苗、健康監測、胸部X光及暴露後處置。',
      auditTopicMenu: 'epidemic-policy'
    };
  }
  return null;
}

function officialAuditClauseReply_(question) {
  const q = normalizeIntentText_(question);
  const explicitMatch = q.match(/(?:查核)?(?:條文)?\s*([1-5]\.[1-7])(?:\s*(?:重點|委員提問|佐證|km|符合|優良))?/i);
  const auditData = loadAuditClauses_();
  const clauses = auditData.clauses || [];
  if (!clauses.length) return null;

  let selected = explicitMatch ? clauses.filter(function(item) { return item.id === explicitMatch[1]; })[0] : null;
  if (!selected) {
    const compact = q.replace(/\s+/g, '').toLowerCase();
    let bestScore = 0;
    clauses.forEach(function(item) {
      const terms = (item.aliases || []).concat([item.title || '']);
      terms.forEach(function(term) {
        const normalized = String(term || '').replace(/\s+/g, '').toLowerCase();
        if (!normalized || compact.indexOf(normalized) < 0) return;
        const score = normalized.length * 10 + (compact === normalized ? 1000 : 0);
        if (score > bestScore) {
          bestScore = score;
          selected = item;
        }
      });
    });
  }
  if (!selected) return null;

  const asksRecords = /(?:執行紀錄|現場紀錄|系統紀錄|相關紀錄)/i.test(q);
  const asksEvidence = !asksRecords && /(?:km|佐證|資料位置)/i.test(q);
  const asksQuestions = /委員.*(?:問|提問)|可能提問/i.test(q);
  const asksFocus = /(?:條文重點|重點|符合|優良)/i.test(q);
  if (!asksEvidence && !asksQuestions && !asksFocus && !asksRecords) {
    return {
      text: selected.title + '（查核條文 ' + selected.id + '）對應查核面向：條文重點、委員提問、KM佐證及執行紀錄。\n請點選下方想查詢的面向。',
      clauseId: selected.id,
      clauseTitle: selected.title,
      auditClauseMenu: true
    };
  }
  if (asksRecords) {
    const recordNames = (selected.evidence || []).slice(0, 6).map(function(item) {
      return String(item.name || '').trim();
    }).filter(Boolean);
    return {
      text: selected.title + '（查核條文 ' + selected.id + '）執行紀錄：\n' +
        '- 現場應能從一筆實際紀錄勾稽制度要求、執行時間、負責人、異常處理、改善措施及追蹤結果。\n' +
        '- 建議備妥：' + recordNames.join('、') + '。\n' +
        '- 委員會確認文件內容與現場作法一致，且缺失有完成複查或成效追蹤。',
      clauseId: selected.id,
      clauseTitle: selected.title
    };
  }
  const specialText = officialAuditClauseSpecialReply_(selected, asksEvidence, asksQuestions);
  if (specialText) return { text: specialText, clauseId: selected.id, clauseTitle: selected.title };
  const allEvidence = (selected.evidence || []).slice().sort(function(a, b) {
    const aKm = /^https:\/\/km\.ntuh\.gov\.tw\//i.test(String(a.url || '')) ? 0 : 1;
    const bKm = /^https:\/\/km\.ntuh\.gov\.tw\//i.test(String(b.url || '')) ? 0 : 1;
    return aKm - bKm;
  });
  const kmEvidence = allEvidence.filter(function(item) {
    return /^https:\/\/km\.ntuh\.gov\.tw\//i.test(String(item.url || ''));
  });
  const evidence = kmEvidence.slice(0, asksEvidence ? 10 : 4);
  const evidenceLines = evidence.map(function(item) {
    const name = String(item.name || '').trim();
    const url = String(item.url || '').trim();
    return '- ' + name + (url ? '：' + url : '');
  });
  let text;
  if (asksEvidence) {
    text = selected.title + '（查核條文 ' + selected.id + '）KM佐證：\n' + evidenceLines.join('\n');
  } else if (asksQuestions) {
    text = selected.title + '（查核條文 ' + selected.id + '）委員可能的提問：\n' +
      '- ' + selected.questions + '\n' +
      '- 回答方向：' + selected.focus + '\n' +
      '- 建議先備妥的 KM 佐證：' + evidence.map(function(item) { return item.name; }).join('、') + '。';
  } else {
    text = selected.title + '（查核條文 ' + selected.id + '）重點：\n' +
      '- 條文重點：' + selected.focus + '\n' +
      '- 委員可能的提問：' + selected.questions + '\n' +
      '- KM 可出示佐證：' + evidence.map(function(item) { return item.name; }).join('、') + '。';
  }
  const availableEvidenceCount = kmEvidence.length;
  if (availableEvidenceCount > evidence.length) {
    text += '\n- 其餘佐證請依1150726最新版條文佐證清單查閱。';
  }
  return { text: text, clauseId: selected.id, clauseTitle: selected.title };
}

function officialAuditClauseSpecialReply_(clause, asksEvidence, asksQuestions) {
  if (!clause) return '';
  if (clause.id === '1.6') {
    const title16 = '感染率監測與改善（查核條文 1.6）';
    if (asksEvidence) {
      return title16 + ' KM佐證：\n' +
        '【監測資料】\n' +
        '- THAS醫療照護相關感染通報統計表：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=22728\n' +
        '- 醫療照護相關感染月報摘要：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=19270\n' +
        '- 醫療照護相關感染年報：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=9412\n' +
        '【會議檢討】\n' +
        '- 感染管制委員會115年第2次HAI檢討紀錄：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=171103\n' +
        '- 品質暨病人安全委員會HAI檢討紀錄：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=15165&pi=5\n' +
        '【改善與成效】\n' +
        '- CLABSI改善計畫及成果：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=171126\n' +
        '- CAUTI改善計畫及報告：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=144976\n' +
        '- HAI異常事件調查報告：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=20190&pi=2';
    }
    if (asksQuestions) {
      return title16 + ' 委員可能的提問與回答方向：\n' +
        '- 問：監測哪些感染？\n  答：依單位風險監測HAI、侵入性裝置相關感染、重要菌株及群聚事件，並呈現分母、感染率與趨勢。\n' +
        '- 問：數據多久檢討、回饋給誰？\n  答：定期彙整月報或年報，回饋臨床單位並提送感染管制委員會或相關會議檢討。\n' +
        '- 問：怎麼知道是異常？\n  答：與單位歷史趨勢、院內警示值或適用基準比較；上升或群聚時啟動個案複核與現場調查。\n' +
        '- 問：改善是否有效？\n  答：提出原因、措施、負責人與完成期限，再以改善前後感染率、bundle執行率或再稽核結果驗證。\n' +
        '- 建議先備妥的 KM 佐證：THAS統計、月年報、會議檢討紀錄、異常調查及CLABSI／CAUTI改善成果。';
    }
    return title16 + ' 查核重點：\n' +
      '- 監測：依單位風險追蹤HAI、侵入性裝置相關感染、重要菌株及群聚事件，數據須有分母、感染率與趨勢。\n' +
      '- 回饋：定期將月報或年報回饋臨床單位，並提送感染管制委員會或相關會議檢討。\n' +
      '- 異常處理：感染率上升或出現群聚時，須複核個案、調查原因並提出改善計畫。\n' +
      '- 成效驗證：以改善前後感染率、bundle執行率或再稽核結果確認措施有效。\n' +
      '- 委員常問：目前主要風險與趨勢是什麼？異常如何啟動？改善後如何證明有效？\n' +
      '- KM 可出示佐證：THAS統計、HAI月年報、會議檢討紀錄、異常調查報告及CLABSI／CAUTI改善成果。';
  }
  if (clause.id === '4.1') {
    const title41 = clause.title + '（查核條文 4.1）';
    if (asksEvidence) {
      return title41 + ' KM佐證：\n' +
        '- 傳染病監視通報機制：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=87870\n' +
        '- 傳染病通報統計報表：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=157825\n' +
        '- 定期檢討通報機制紀錄：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=91204\n' +
        '- 院內傳染病檢體包裝及運送流程：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=87871\n' +
        '- 檢驗室檢體採集、傳送及接收規範：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=171109';
    }
    if (asksQuestions) {
      return title41 + ' 委員可能的提問與回答方向：\n' +
        '- 問：疑似法定傳染病如何啟動？\n  答：依疾病定義辨識後，於規定時限完成通報、必要採檢及隔離，並由專責人員複核。\n' +
        '- 問：夜間或假日由誰處理？\n  答：須有值班通報與代理機制，不能等到上班日才處理。\n' +
        '- 問：如何避免逾時或漏報？\n  答：以通報統計或系統紀錄追蹤時效、退補件與完成情形，定期檢討異常。\n' +
        '- 問：衛生機關要求補件怎麼辦？\n  答：由專責人員追蹤補件、檢體及後續防疫處置至完成。\n' +
        '- 建議先備妥的 KM 佐證：傳染病監視通報機制、通報統計報表、定期檢討紀錄、檢體包裝運送流程。';
    }
    return '傳染病通報（查核條文 4.1）查核重點：\n' +
      '- 委員要確認：疑似個案能依疾病別時限完成通報、採檢及隔離；夜間、假日也不中斷。\n' +
      '- 現場回答：由專責或代理人員通報並複核，持續追蹤退補件、檢體及衛生機關後續要求至完成。\n' +
      '- 委員常問：誰負責？夜間假日怎麼辦？如何證明沒有逾時、漏報或未完成補件？\n' +
      '- KM 可出示佐證：傳染病監視通報機制、通報統計報表、定期檢討紀錄、院內檢體包裝及運送流程。';
  }
  if (clause.id !== '5.1') return '';
  const title = clause.title + '（查核條文 5.1）';
  if (asksEvidence) {
    return title + ' KM佐證：\n' +
      '【預防接種】\n' +
      '- 員工預防接種措施：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=54430\n' +
      '- 醫療照護人員預防接種紀錄與資料庫：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=20370\n' +
      '- 流感及 COVID-19 疫苗接種成果：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=29190\n' +
      '【健康監測】\n' +
      '- 健康監測通報規範：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=117071\n' +
      '- 健康監測通報系統：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=91353\n' +
      '- 體溫異常追蹤及處理紀錄：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=20151\n' +
      '【胸部 X 光與暴露處置】\n' +
      '- 員工胸部 X 光檢查計畫、流程及異常追蹤：https://km.ntuh.gov.tw/km/readdocument.aspx?documentId=67831\n' +
      '- 員工暴露傳染性疾病調查與處理紀錄：https://km.ntuh.gov.tw/km/listfolders.aspx?uid=19220';
  }
  if (asksQuestions) {
    return title + ' 委員可能的提問與回答方向：\n' +
      '- 問：哪些人納入員工保護？\n  答：依工作與暴露風險涵蓋醫事、非醫事、適用之外包、實習及志工，並有名冊及完成情形。\n' +
      '- 問：疫苗如何管理？\n  答：依職別與風險訂定流感、MMR、B肝、水痘、Tdap及 COVID-19 等接種或免疫力評估；未完成、抗體陰性或禁忌者須追蹤。\n' +
      '- 問：員工出現症狀如何處理？\n  答：由健康監測系統通報，完成風險評估、工作限制、採檢或就醫安排及異常追蹤。\n' +
      '- 問：胸部 X 光如何落實？\n  答：依計畫追蹤應檢、已檢、異常結果、後續處理及達成率。\n' +
      '- 問：發生傳染病暴露怎麼辦？\n  答：完成接觸者調查、暴露風險分級、必要採檢或預防措施及追蹤結案。\n' +
      '- 建議先備妥的 KM 佐證：員工預防接種措施、接種紀錄與成果、健康監測通報規範與系統、胸部 X 光計畫及異常追蹤、員工暴露調查紀錄。';
  }
  return title + ' 重點：\n' +
    '- 條文重點：醫院須建立工作人員預防接種、健康監測、胸部 X 光及傳染病暴露後處置制度，並能提出執行率與異常追蹤結果。\n' +
    '- 預防接種：依職別與暴露風險管理流感、MMR、B肝、水痘、Tdap及 COVID-19 等接種或免疫力紀錄；追蹤未完成、抗體陰性與接種禁忌者。\n' +
    '- 健康監測：員工有發燒或傳染病相關症狀時，須完成通報、風險評估、工作限制及後續追蹤。\n' +
    '- 胸部 X 光：須有應檢名冊、完成率、異常結果通知、複檢或轉介紀錄。\n' +
    '- 暴露處置：遭遇傳染性疾病暴露時，須完成接觸者調查、採檢或預防措施及追蹤結案。\n' +
    '- 委員可能的提問：各類疫苗對象與完成率為何？未接種或抗體陰性如何追蹤？健康異常、胸部 X 光異常及暴露事件如何處理？\n' +
    '- KM 可出示佐證：員工預防接種措施、接種紀錄與成果、健康監測通報規範與系統、胸部 X 光檢查計畫及異常追蹤、員工暴露調查紀錄。';
}

function auditClauseTopics_() {
  const r = function(p, t, req, q, e, km) { return { pattern: p, title: t, requirement: req, questions: q, evidence: e, km: km }; };
  return [
    r(/疫苗|預防接種|抗體/, '員工疫苗與預防接種', '依工作人員職別、暴露風險及政府建議訂定疫苗與抗體評估政策，涵蓋專任人員、實習學生及適用的外包人員；禁忌、未接種及後續追蹤均須有紀錄。', '哪些職別或高風險單位需要哪些疫苗或抗體檢測？新進人員如何評估？未接種、抗體陰性或有接種禁忌時如何追蹤？', '員工疫苗政策、風險評估、接種與抗體名冊、接種統計、未完成追蹤、禁忌或不接種文件、實習生通知及外包契約相關條款。', '50300-2-000013「員工保健感染管制規範」；50300-2-100007「員工預防接種措施」；8.4「水痘抗體監測及接種實施流程」。'),
    r(/教育|訓練/, '感染管制教育訓練', '依新進、在職及不同職別安排必要課程。新進人員職前 1 小時並於到院半年內完成 5 小時；在職人員每年至少 3 小時；指定醫事職類須包含抗生素使用 1 小時。', '各類人員應完成多少時數？未完訓如何催訓及追蹤？高風險作業是否另有實作訓練與能力查核？', '年度教育計畫、教材、簽到或 TMS 完訓紀錄、各職別完訓率、補訓追蹤、測驗或技術查核及缺失改善紀錄。', '50300-2-000009「感染管制教育訓練辦法」；50300-2-100060「感染管制教育及宣導施行細則」。'),
    r(/手部衛生|洗手|乾洗手/, '手部衛生', '設備、用品、五時機執行、稽核回饋與改善均須落實；手套不可取代手部衛生。', '何時乾洗手、何時濕洗手？單位遵從率如何？缺失如何回饋與改善？', '手部衛生稽核表、遵從率與正確率、回饋及改善追蹤、教育紀錄、乾洗手液與洗手設備巡查紀錄。', '50300-2-000008「手部衛生要點」；50300-2-100027「醫療人員手部衛生實施細則」。'),
    r(/PPE|防護裝備|隔離標示|隔離病室|負壓/, '個人防護裝備與隔離', '依傳播途徑配置病室、標示及 PPE，確保人員會正確穿脫，並維持隔離病室與負壓設備管理。', '不同隔離類型使用哪些 PPE？穿脫順序為何？負壓異常或床位不足時如何處理？', '隔離醫囑與標示、PPE配置與效期、穿脫技術查核、負壓監測、異常維修、隔離病室巡查及教育紀錄。', '50300-2-000005「感染管制隔離防護規範」；50300-2-000004「隔離病室管理辦法」及相關施行細則。'),
    r(/導尿|中心導管|呼吸器|侵入性裝置|bundle/i, '侵入性裝置感染預防', '落實適應症、置放與維護 bundle、每日必要性評估、感染監測及適時移除。', '為何仍需留置？每日如何評估？bundle缺失及感染事件如何改善？', '置放適應症、bundle照護表、每日必要性與移除紀錄、感染率、稽核結果及改善追蹤。', '感染管制中心相關導尿管、中心導管及呼吸器組合式照護規範與技術稽核表。'),
    r(/抗生素|抗菌藥|抗微生物|ASP/i, '抗微生物製劑管理', '建立抗菌藥物管理機制，追蹤適應症、培養、管制藥申請、去升階或停藥，以及手術預防性抗生素。', '管制性抗生素如何審核？如何依培養結果調整？超過建議期間如何說明？', '抗生素管理計畫、申請與審核紀錄、用量及抗藥性趨勢、處方稽核回饋、手術預防性抗生素指標。', '50300-6-000002「抗微生物製劑管理計畫」及相關用藥管理規範。'),
    r(/(?:MDRO|抗藥菌|多重抗藥).*(?:管理|查核)|(?:管理|查核).*(?:MDRO|抗藥菌|多重抗藥)/i, '多重抗藥性菌株管理', '檢驗提示、接觸隔離、床位安排、器材清消、轉送通知、終期清潔及再入院追蹤須形成完整流程。', '陽性後如何通知與隔離？再入院如何辨識？何時可解隔？', '微生物報告、隔離醫囑、系統警示、轉送通知、清消紀錄、篩檢與解隔紀錄、群聚調查及改善資料。', '50300-2-100034「抗藥菌感染管制措施」及各菌株篩檢、解隔相關規範。'),
    r(/環境清潔|環境消毒|終期清潔|清消/, '環境清潔與消毒', '依區域、疾病與污染風險訂定清潔頻率、消毒劑濃度及接觸時間，並管理共用器材與終期清潔。', '高頻表面有哪些？消毒劑如何泡製與標示？隔離病人轉出後如何驗證完成？', '清潔排程與紀錄、消毒劑泡製及濃度標示、終期清潔查核、共用器材清消、缺失改善及教育紀錄。', '50300-2-100005「環境清潔作業規定」；50300-2-100028「消毒劑使用規範」。'),
    r(/器械|醫材|供應室|消毒滅菌|高層次消毒/, '醫材清洗消毒與滅菌', '依醫材用途及風險完成清洗、消毒或滅菌，維持分流、包裝、監測、儲存、運送與可追溯性。', '如何選擇消毒或滅菌？如何確認滅菌成效？異常批次如何召回？', '清洗消毒流程、化學及生物監測、設備保養、滅菌批次、效期與儲存巡查、異常召回及改善紀錄。', '50300-2-000011「清潔與消毒滅菌管理要點」及供應室相關作業規範。'),
    r(/針扎|尖銳物|血液體液暴露|注射安全/, '注射、尖銳物與職業暴露', '落實安全針具、尖銳物容器及標準防護，並建立暴露後立即處理、通報、評估、預防用藥與追蹤流程。', '針扎後第一步做什麼？去哪裡通報與評估？追蹤是否完成？', '安全針具教育與稽核、尖銳物巡查、暴露通報單、檢驗與用藥、追蹤完成率、事件分析及改善紀錄。', '50300-3-000009「尖銳物傷害與血體液暴露之預防及暴露後處理措施」。'),
    r(/員工健康|健康監測|員工症狀|群聚/, '員工健康與健康監測', '涵蓋各類工作人員，依症狀與群聚門檻完成通報、就醫、工作限制、追蹤及疫情期間頻率調整。', '哪些症狀需通報？兩人以上類似症狀如何處理？不適合照護病人時如何安排？', '健康監測通報、單位窗口與代理人名冊、就醫及工作限制、群聚通知、調查追蹤與改善紀錄。', '50300-2-000013「員工保健感染管制規範」；50300-2-000015「健康監測通報規範」。'),
    r(/法定傳染病|疫情通報|TOCC|通報流程/i, '法定傳染病與疫情通報', '能及早辨識疑似病例，依時限完成通報、採檢、隔離、動線與接觸者處置；不應等確診才啟動。', '疑似個案如何啟動？誰負責通報及確認完成？逾時或群聚如何處理？', 'TOCC紀錄、法傳通報資料、採檢醫令、隔離與轉送紀錄、接觸者名冊、群聚調查及改善追蹤。', '法定傳染病通報作業流程、疾病別感染管制措施及群突發異常事件處理規範。'),
    r(/HAI|感染監測|感染率|THAS/i, '醫療照護相關感染監測', '持續監測 HAI、裝置使用及抗藥菌趨勢，定期回饋臨床單位並對異常執行改善與成效追蹤。', '單位目前主要感染風險為何？數據如何回饋？改善後如何確認有效？', '感染率與裝置使用資料、THAS通報、單位回饋、會議紀錄、異常調查、改善計畫及成效追蹤。', '感染管制中心 HAI 監測計畫、定義、通報及單位回饋相關規範。'),
    r(/病人安置|床位|動線|轉送|外出檢查/, '病人安置與動線', '依傳播風險完成分流、床位、候診及檢查轉送安排，轉送前通知接收單位並完成相應防護與清消。', '床位不足如何風險分層？外出檢查如何通知？轉送後設備與動線如何清消？', '床位與隔離醫囑、轉送通知、病人防護、接收單位交班、設備與動線清消及異常處理紀錄。', '感染管制隔離防護規範、隔離病室管理辦法及疾病別轉送檢查流程。'),
    r(/廢棄物|污衣|布服|垃圾/, '感染性廢棄物與布服', '依感染風險分類、包裝、加蓋及運送，避免滲漏、飛散、刺傷與污染公共動線。', '污染布服與感染性廢棄物如何分流？尖銳物及外袋破損如何處理？', '分類與運送流程、容器及標示巡查、布服處理、外包教育、異常事件及改善紀錄。', '50300-2-1000026「醫療布服處理感染管制措施」及感染性廢棄物相關院內規範。'),
    r(/文件|現場回答|SOP|佐證|缺失改善/, '文件、佐證與現場作答', '正式 SOP、現場執行、紀錄、稽核、缺失改善及追蹤結果應可相互勾稽。', '平常怎麼做？SOP在哪裡？異常通知誰？缺失如何改善並確認完成？', '最新版 SOP、現場紀錄、稽核表、缺失通知、原因分析、改善措施及複查結果。', '依查核主題至 KM「50300 感染管制中心」查詢現行核定規範與相關表單。')
  ];
}

function cdcNotificationDefinitionReply_(diseaseName) {
  const d = String(diseaseName || '').trim();
  if (!d || isMdroTerm_(d)) return '';
  try {
    const exact = findNotifiableDiseaseEntry_(d);
    if (!exact) return '';

    const lines = cleanKnowledgeLinesForDefinition_(exact.text);
    const linkLine = lines.filter(function(line) { return /https?:\/\//.test(line); })[0] || '';
    const body = [];
    body.push(d + '通報定義查詢重點：');
    lines.forEach(function(line) {
      if (/^CDC 通報定義連結/.test(line)) {
        body.push('- CDC 病例定義連結：' + line.replace(/^CDC 通報定義連結[:：]\s*/, ''));
      } else {
        body.push('- ' + line);
      }
    });
    if (!linkLine) {
      body.push('- 疾管署病例定義頁：https://www.cdc.gov.tw/Category/DiseaseDefine/ZW54U0FpVVhpVGR3UkViWm8rQkNwUT09');
    }
    return body.join('\n');
  } catch (err) {
    console.error('cdcNotificationDefinitionReply_ skipped: ' + err.toString());
    return '';
  }
}

function findNotifiableDiseaseEntry_(diseaseName) {
  const d = normalizeNotifiableDiseaseName_(diseaseName);
  if (!d) return null;
  const kb = loadKb_();
  const entries = kb.entries || [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] || {};
    if (String(entry.source || '') !== '法定傳染病_依疾病通報檢索.md') continue;
    if (String(entry.title || '').trim() === d) return entry;
  }
  for (let j = 0; j < entries.length; j++) {
    const entry2 = entries[j] || {};
    if (String(entry2.source || '') !== '法定傳染病_依疾病通報檢索.md') continue;
    const text = String(entry2.text || '');
    if (text.indexOf('### ' + d) >= 0) return entry2;
  }
  return null;
}

function normalizeNotifiableDiseaseName_(name) {
  const d = String(name || '').trim();
  const map = loadBotReferenceData_().notifiableDiseaseNames || {};
  return map[d] || d;
}

function cdcSpecimenReply_(diseaseName) {
  const d = String(diseaseName || '').trim();
  if (!d) return '';
  if (isMdroTerm_(d)) {
    return d + '採檢送驗重點：\n' +
      '- MDRO/MRSE 等抗藥菌原則送本院檢醫部，不是送驗 CDC。\n' +
      '- 若要開立院內篩檢，路徑為：診療醫令 → 主分類「細菌」→ 次分類「感管篩選」，再依菌種與採檢部位選擇醫令。\n' +
      '- 採檢部位請依臨床感染/移生部位、院內抗藥菌篩檢流程與感染管制中心指示。';
  }

  try {
    const exact = findNotifiableDiseaseEntry_(d);
    if (!exact) return '';
    const lines = cleanKnowledgeLinesForDefinition_(exact.text);
    const specimenLine = lines.filter(function(line) { return /^院內檢驗醫令\/檢體：/.test(line); })[0] || '';
    const linkLine = lines.filter(function(line) { return /^CDC 通報定義連結：/.test(line); })[0] || '';
    const extraLines = [];
    String(exact.text || '').split(/\r?\n/).forEach(function(raw) {
      const line = cleanKnowledgeLine_(raw);
      if (/^送驗補充[:：]/.test(line)) extraLines.push(line.replace(/^送驗補充[:：]\s*/, ''));
    });

    const title = String(exact.title || normalizeNotifiableDiseaseName_(d)).trim();
    const body = [title + '採檢送驗重點：'];
    if (specimenLine) {
      body.push('- ' + specimenLine);
    } else {
      body.push('- 本地索引未列出明確院內醫令，請依疾管署病例定義下方「檢體種類」對應院內 CDC 其他檢體醫令。');
    }
    extraLines.slice(0, 2).forEach(function(line) { body.push('- 送驗補充：' + line); });
    if (linkLine) {
      body.push('- CDC 病例定義連結：' + linkLine.replace(/^CDC 通報定義連結[:：]\s*/, ''));
    }
    body.push('- 總院目前無須列印紙本送驗單；開立醫令碼後由院內採檢與檢醫部流程銜接，防疫檢體由感染管制中心依規定送疾病管制署。');
    body.push('- 若 CDC 需附病情摘要或照片，請先完成電子病歷，感染管制中心依法由電子病歷資料上傳。');
    return body.join('\n');
  } catch (err) {
    console.error('cdcSpecimenReply_ skipped: ' + err.toString());
    return '';
  }
}

function cleanKnowledgeLinesForDefinition_(text) {
  const out = [];
  const seen = {};
  String(text || '').split(/\r?\n/).forEach(function(raw) {
    let line = cleanKnowledgeLine_(raw);
    if (!line) return;
    line = line.replace(/^分類[:：]/, '分類：')
      .replace(/^通報時限[:：]/, '通報時限：')
      .replace(/^院內檢驗醫令\/檢體[:：]/, '院內檢驗醫令/檢體：')
      .replace(/^ICD 參考[:：]/, 'ICD 參考：');
    if (!/^(分類：|通報時限：|CDC 通報定義連結：|院內檢驗醫令\/檢體：|ICD 參考：)/.test(line)) return;
    if (seen[line]) return;
    seen[line] = true;
    out.push(line);
  });
  return out;
}

function mdroClearanceReply_(diseaseName) {
  const d = String(diseaseName || '').trim();
  if (!isMdroTerm_(d)) return '';
  const stopDrug = '採檢前需先停用對該抗藥菌有效、或可能影響培養結果的抗生素/抗黴菌藥物；停藥天數與藥物範圍依院內抗藥菌解隔流程與醫療團隊判斷。';
  const common = [
    d + '解除接觸隔離重點：',
    '- 先確認原感染病灶已改善，沒有持續發燒或感染症狀，原感染/移生部位也已處理完成。',
    '- 若有導管、引流管、傷口或造口，原則上需移除或確認原部位培養陰性，才進入解隔評估。',
    '- ' + stopDrug,
    '- 符合解隔條件後，需開立對應「取消隔離」醫囑來取消特殊註記，不是終止原本那張隔離醫囑。'
  ];
  if (d === 'VRE') {
    const rule = officialClearanceRule_('VRE');
    return rule && rule.reply ? rule.reply : '';
  } else if (/^(CRE|CRAB|CRPA|MRSA|MDROE|MDRO|耳念珠菌|Candida auris)$/i.test(d)) {
    common.splice(3, 0, '- 依菌種與院內規範採指定部位篩檢，並達到規定陰性次數後，才可評估解除接觸隔離。');
  } else if (d === 'MRSE') {
    return 'MRSE 通常不是院內重點 MDRO 解隔流程主體。\n\n' +
      '- 請先判斷是污染、移生或真正感染，並確認是否曾依感染管制中心建議開立隔離或特殊註記。\n' +
      '- 若沒有正式隔離醫囑或特殊註記，通常不是用 VRE/CRE 那套解隔篩檢流程。\n' +
      '- 若確曾因特殊情境採接觸防護，解除方式請依原開立原因、臨床狀況與感管中心判斷。';
  }
  return common.join('\n');
}

function generalClearanceReply_(diseaseName) {
  const d = String(diseaseName || '').trim();
  if (!d || isMdroTerm_(d)) return '';
  const normalized = normalizeNotifiableDiseaseName_(d);
  if (/水痘|水痘併發症|帶狀疱疹/.test(normalized)) {
    return d + '解除隔離重點：\n' +
      '- 水痘採空氣＋接觸隔離，維持至所有水泡病灶乾燥結痂、沒有新病灶，且臨床狀況穩定。\n' +
      '- 一般不要求常規檢驗陰性；解隔以病灶狀態為主。\n' +
      '- 若病人免疫功能低下、病灶持續出現或仍有未結痂水泡，先維持隔離並由醫療團隊／感管中心評估。\n' +
      '- 符合條件後開立 ANN10042 取消水痘隔離註記；不是終止原本的 ANN00042。';
  }
  if (/^(流感|季節性流感)$/.test(normalized) || /^(流感|季節性流感)$/.test(d)) {
    return influenzaClearanceReply_();
  }
  if (/德國麻疹/.test(normalized) || /德國麻疹/.test(d)) {
    return '德國麻疹解除隔離重點：\n' +
      '- 一般疑似或確診德國麻疹個案：維持飛沫隔離至出疹後 7 天；期滿且臨床狀況穩定後，才可評估解除隔離。\n' +
      '- 一般後天感染不要求常規檢驗陰性才解隔；如出疹日不明、診斷仍有疑義或涉及群聚，先洽醫療團隊／感管中心確認。\n' +
      '- 先天性德國麻疹症候群病嬰可能長期排毒，不能套用出疹後 7 天；原則上隔離至 1 歲，除非出生滿 3 個月後咽喉及尿液病毒檢驗符合解除條件。\n' +
      '- 符合條件後開立院內現行「取消德國麻疹隔離」醫囑；代碼請以院內系統最新版為準。';
  }
  const officialRule = officialClearanceRule_(d) || officialClearanceRule_(normalized);
  if (officialRule) {
    return d + '解除隔離重點：\n' +
      '- 防護類型：' + officialRule.precautions + '。\n' +
      '- 解除判定：' + officialRule.criteria + '\n' +
      '- 資料依據：' + (officialRule.source_title || '疾管署「依感染原及感染情形建議之防護措施及執行期間」及疾病別最新指引') + '。';
  }
  return safeDiseaseSubtopicFallback_(d, 'clearance');
}

function officialClearanceRule_(diseaseName) {
  const name = String(diseaseName || '').trim();
  if (!name) return null;
  const data = loadClearanceRules_();
  const rule = data.rules && data.rules[name];
  if (!rule) return null;
  return {
    precautions: String(rule.precautions || '依疾病別規範'),
    criteria: String(rule.criteria || ''),
    reply: String(rule.reply || ''),
    source: String(rule.source || data.primary_source || ''),
    source_title: String(rule.source_title || data.primary_source_title || '')
  };
}

function extractHisOrderCode_(specimenText, diseaseName) {
  const text = String(specimenText || '');
  const dis = String(diseaseName || '');
  if (isMdroTerm_(dis)) {
    return '非 CDC 防疫檢體。請開立本院細菌培養/藥敏或感管篩選醫令；路徑：診療醫令 → 主分類「細菌」→ 次分類「感管篩選」，依菌種與採檢部位選擇。';
  }

  const matches = text.match(/CDCN\d+|CDFI/gi);
  const otherOrderHint = cdcOtherSpecimenOrderHint_(text, dis);
  let baseCodeText = '';

  if (matches && matches.length > 0) {
    const uniqueCodes = Array.from(new Set(matches.map(function(c) { return c.toUpperCase(); })));
    baseCodeText = '**`' + uniqueCodes.join(' / ') + '`**（HIS 系統 ➔ 診療醫令 ➔ 主分類「檢驗」 ➔ 次分類「CDC防疫檢體」）';
  } else {
    baseCodeText = '**院內專用檢驗醫令 / CDC防疫檢體醫令**（HIS 系統 ➔ 診斷/採檢 ➔ 主分類「檢驗」 ➔ 次分類「CDC防疫檢體」）';
  }

  if (otherOrderHint) {
    baseCodeText += '\n   · 若院內法傳檢驗醫令 PDF 未列專屬 CDCN，可依 CDC 通報定義下方「檢體種類」選用：' + otherOrderHint;
  }

  if (/百日咳/i.test(dis) || /百日咳/i.test(text) || /CDCN0146/i.test(text)) {
    return baseCodeText + '\n   · ⚠️ **【關鍵強調】百日咳接觸者採檢醫令 `CDCN0146`**：若採檢對象為「百日咳匡列接觸者 / 暴露同仁」，請務必特別改開立 **`CDCN0146`（接觸者採檢醫令）**，切勿與指標個案 (Index Case) 通報醫令混淆！';
  }

  return baseCodeText;
}

function isMdroTerm_(diseaseName) {
  return /^(MDRO|VRE|CRE|MRSA|MRSE|CRAB|CRPA|MDROE|耳念珠菌|Candida auris)$/i.test(String(diseaseName || '').trim());
}

function cdcOtherSpecimenOrderHint_(specimenText, diseaseName) {
  if (isMdroTerm_(diseaseName)) return '';
  const text = String(specimenText || '').replace(/\s+/g, '');
  if (!text) return '';
  const orderMap = [
    { code: 'CDCN0153', name: 'CDC其他--糞便拭子 總院', re: /糞便拭子|肛門拭子|直腸拭子|肛拭子/ },
    { code: 'CDCN0159', name: 'CDC其他--肝膿瘍 總院', re: /肝膿瘍/ },
    { code: 'CDCN0154', name: 'CDC其他--咽喉拭子 總院', re: /咽喉拭子|咽喉擦拭|喉拭子|咽拭子|鼻咽拭子|鼻咽擦拭|鼻咽擦拭液|鼻腔拭子/ },
    { code: 'CDCN0160', name: 'CDC其他--引流傷口 總院', re: /引流傷口|傷口引流|傷口拭子|傷口|膿液/ },
    { code: 'CDCN0149', name: 'CDC其他--血 總院', re: /全血|血液(?!培養)|血(?!清|液培養)/ },
    { code: 'CDCN0155', name: 'CDC其他--痰 總院', re: /痰液|痰|下呼吸道檢體|呼吸道抽吸液|氣管抽吸液|BAL|支氣管肺泡沖洗液/ },
    { code: 'CDCN0161', name: 'CDC其他--口水 總院', re: /口水|唾液/ },
    { code: 'CDCN0150', name: 'CDC其他--血清 總院', re: /血清/ },
    { code: 'CDCN0156', name: 'CDC其他--嘔吐物 總院', re: /嘔吐物|嘔吐/ },
    { code: 'CDCN0162', name: 'CDC其他--水泡 總院', re: /水泡|水疱|疱液|水疱液/ },
    { code: 'CDCN0151', name: 'CDC其他--腦脊髓液 總院', re: /腦脊髓液|腦脊液|CSF/ },
    { code: 'CDCN0157', name: 'CDC其他--尿 總院', re: /尿液|尿/ },
    { code: 'CDCN0163', name: 'CDC其他--其他液狀檢體 總院', re: /其他液狀檢體|胸水|腹水|體液/ },
    { code: 'CDCN0152', name: 'CDC其他--糞 總院', re: /糞便|糞|大便|stool/i },
    { code: 'CDCN0158', name: 'CDC其他--關節液 總院', re: /關節液/ },
    { code: 'CDCN0164', name: 'CDC其他--組織 總院', re: /組織|切片|病理組織/ }
  ];
  const hits = [];
  const seen = {};
  orderMap.forEach(function(item) {
    if (item.code === 'CDCN0152' && /糞便拭子|肛門拭子|直腸拭子|肛拭子/.test(text)) return;
    if (item.re.test(text) && !seen[item.code]) {
      seen[item.code] = true;
      hits.push(item.code + ' ' + item.name);
    }
  });
  return hits.slice(0, 6).join('；');
}

function nextSubtopicPrompt_(diseaseName) {
  return '';
}

function searchKb_(question, limit) {
  const kb = loadKb_();
  const synonyms = kb.synonyms || {};
  const qTokens = expandTokens_(tokenize_(question), synonyms);
  const compactQuestion = question.replace(/\s+/g, '').toLowerCase();
  const detectedDisease = detectDisease_(question);
  const diseaseTerms = detectedDisease ? diseaseSearchTerms_(detectedDisease.name, synonyms) : [];
  const scored = [];

  kb.entries.forEach(function(entry) {
    if (isInternalPlanningSource_(entry.source) || isInternalPlanningSource_(entry.title)) return;
    const haystack = (entry.source + '\n' + entry.title + '\n' + entry.text).toLowerCase();
    const compactHaystack = haystack.replace(/\s+/g, '');
    if (diseaseTerms.length && !diseaseTerms.some(function(term) { return compactHaystack.indexOf(term) >= 0; })) return;

    if (/兔熱/i.test(compactQuestion) && !/黃熱/i.test(compactQuestion) && /黃熱/i.test(haystack) && !/兔熱/i.test(haystack)) {
      return;
    }
    if (/黃熱/i.test(compactQuestion) && !/兔熱/i.test(compactQuestion) && /兔熱/i.test(haystack) && !/黃熱/i.test(haystack)) {
      return;
    }

    let score = 0;
    qTokens.forEach(function(token) {
      if (haystack.indexOf(token) >= 0) score += token.length >= 3 ? 3 : 1;
      if (String(entry.title).toLowerCase().indexOf(token) >= 0) score += 5;
      if (String(entry.source).toLowerCase().indexOf(token) >= 0) score += 4;
    });
    if (compactQuestion && compactHaystack.indexOf(compactQuestion) >= 0) score += 20;
    if (score > 0) scored.push({ score: score, entry: entry });
  });

  scored.sort(function(a, b) { return b.score - a.score; });
  return scored.slice(0, limit).map(function(item) {
    const copied = {};
    Object.keys(item.entry).forEach(function(key) { copied[key] = item.entry[key]; });
    copied._score = item.score;
    return copied;
  });
}

function expandTokens_(tokens, synonyms) {
  const expanded = tokens.slice();
  const compact = tokens.join('');
  Object.keys(synonyms || {}).forEach(function(key) {
    const values = synonyms[key] || [];
    const keyLower = String(key).toLowerCase();
    const allTerms = [key].concat(values).map(function(v) { return String(v).toLowerCase(); });
    const matched = allTerms.some(function(term) {
      return compact.indexOf(term.replace(/\s+/g, '')) >= 0 || tokens.indexOf(term) >= 0;
    });
    if (!matched) return;
    tokenize_(keyLower + ' ' + values.join(' ')).forEach(function(token) {
      expanded.push(token);
    });
  });
  const seen = {};
  return expanded.filter(function(token) {
    if (seen[token]) return false;
    seen[token] = true;
    return true;
  }).slice(0, 180);
}

function suggestTopics_(question, hits) {
  const seen = {};
  const lines = [];
  hits.slice(0, 5).forEach(function(entry) {
    const title = String(entry.title || '').replace(/^#+\s*/, '');
    const source = String(entry.source || '');
    const key = title + source;
    if (seen[key]) return;
    seen[key] = true;
    lines.push('- ' + title);
  });
  return '您好！目前的關鍵字檢索命中度較低，為避免誤答，請嘗試補充更具體的項目（例如：通報流程、送驗檢體、隔離/解隔、疫區、清消濃度）。\n\n📌 可能相關主題：\n' +
    lines.join('\n') +
    '\n\n💡 提問範例：「VRE 隔離」、「麻疹 暴露」、「兔熱病 通報」';
}

function loadKb_() {
  if (KB_RUNTIME_CACHE_) return KB_RUNTIME_CACHE_;
  const cached = CacheService.getScriptCache().get('kb_index_v1');
  if (cached) {
    KB_RUNTIME_CACHE_ = JSON.parse(cached);
    return KB_RUNTIME_CACHE_;
  }

  const folderId = getProp_('KB_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByName(CONFIG.KB_FILE_NAME);
  if (!files.hasNext()) throw new Error('Cannot find ' + CONFIG.KB_FILE_NAME);
  const text = files.next().getBlob().getDataAsString('UTF-8');
  const parsed = JSON.parse(text);
  KB_RUNTIME_CACHE_ = parsed;

  const slim = JSON.stringify(parsed);
  if (slim.length < 90000) {
    CacheService.getScriptCache().put('kb_index_v1', slim, 300);
  }
  return KB_RUNTIME_CACHE_;
}

function diseaseSearchTerms_(diseaseName, synonyms) {
  const canonical = String(diseaseName || '').replace(/\s+/g, '').toLowerCase();
  const values = (synonyms && synonyms[diseaseName]) || [];
  const terms = [canonical];
  values.forEach(function(value) {
    const term = String(value || '').replace(/\s+/g, '').toLowerCase();
    if (!term) return;
    const hasLatin = /[a-z]/i.test(term);
    if ((hasLatin && term.length >= 3) || (!hasLatin && term.length >= 3)) terms.push(term);
  });
  return terms.filter(function(term, index, all) { return term && all.indexOf(term) === index; });
}

function diseaseScopedExtractiveAnswer_(hits, diseaseName, subtopic) {
  const kb = loadKb_();
  const terms = diseaseSearchTerms_(diseaseName, kb.synonyms || {});
  const selected = [];
  const seen = {};
  (hits || []).forEach(function(entry) {
    const rawLines = [entry.title || ''].concat(String(entry.text || '').split('\n'));
    rawLines.forEach(function(raw, index) {
      const compact = String(raw || '').replace(/\s+/g, '').toLowerCase();
      if (!terms.some(function(term) { return compact.indexOf(term) >= 0; })) return;
      for (let offset = 0; offset < 4 && index + offset < rawLines.length; offset++) {
        const line = cleanKnowledgeLine_(rawLines[index + offset]);
        if (!line || seen[line]) continue;
        if (/\.md\b|問[「\"]|回答提醒|回答重點|不要主動|不要直接|優先查詢|知識庫中|本檔供|本文件|來源提示/i.test(line)) continue;
        seen[line] = true;
        selected.push(line);
      }
    });
  });
  if (subtopic === 'placement' && selected.some(function(line) { return /隔壁床住了隔離病人|同病室有隔離病人/.test(line); })) {
    return safeDiseaseSubtopicFallback_(diseaseName, subtopic);
  }
  if (!selected.length) return safeDiseaseSubtopicFallback_(diseaseName, subtopic);
  return diseaseName + '查詢重點：\n' + selected.slice(0, 7).map(function(line) { return '- ' + line; }).join('\n');
}

function loadAuditClauses_() {
  if (AUDIT_RUNTIME_CACHE_) return AUDIT_RUNTIME_CACHE_;
  const folderId = getProp_('KB_FOLDER_ID');
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByName(CONFIG.AUDIT_FILE_NAME);
  if (!files.hasNext()) return { clauses: [] };
  AUDIT_RUNTIME_CACHE_ = JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
  return AUDIT_RUNTIME_CACHE_;
}

function loadClearanceRules_() {
  if (CLEARANCE_RUNTIME_CACHE_) return CLEARANCE_RUNTIME_CACHE_;
  try {
    const folderId = getProp_('KB_FOLDER_ID');
    const folder = DriveApp.getFolderById(folderId);
    const files = folder.getFilesByName(CONFIG.CLEARANCE_FILE_NAME);
    if (!files.hasNext()) return { rules: {} };
    CLEARANCE_RUNTIME_CACHE_ = JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
    return CLEARANCE_RUNTIME_CACHE_;
  } catch (err) {
    console.error('loadClearanceRules_ error: ' + err.toString());
    return { rules: {} };
  }
}

function buildContext_(hits, maxChars) {
  let context = '';
  hits.forEach(function(entry, index) {
    const block = '[' + (index + 1) + '] ' + entry.title + '\n來源：' + entry.source + '\n' + entry.text + '\n\n';
    if ((context + block).length <= maxChars) context += block;
  });
  return context;
}

function callGemini_(question, context, language) {
  const apiKey = getProp_('GEMINI_API_KEY', true);
  if (!apiKey) return '';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);
  const lang = String(language || 'zh-TW');
  let languageRule = '請以繁體中文回答。';
  if (lang === 'en') languageRule = 'Answer in English. Use only the KB.';
  if (lang === 'id') languageRule = 'Jawab dalam Bahasa Indonesia. Pakai KB saja.';
  if (lang === 'vi') languageRule = 'Trả lời bằng Tiếng Việt. Chỉ dùng KB.';
  if (lang === 'th') languageRule = 'ตอบเป็นภาษาไทย ใช้เฉพาะ KB';
  const prompt =
    '你是台大感管中心的 LINE 問答助手。請用專業、簡明、精準、親切的語氣回答。\n' +
    '語言規則：' + languageRule + '\n' +
    '【絕對禁止】：嚴禁輸出任何文件名稱、文件標題（如「全傳染病衛教與臨床處置大典」）、前言介紹（如「本文件為...」）或章節標題（如「第X部分...」）！\n' +
    '每一項醫療、隔離、清消、醫令、濃度、期限或操作事實，都必須能由下方知識庫內容直接支持；不得靠常識補寫、推測或混合不同疾病、單位、設備的內容。\n' +
    '若知識庫不足以回答問題，請明確回答「目前資料不足，無法確認」，並指出缺少哪一類正式資料；不要以相近主題代答。\n' +
    '嚴禁輸出 Markdown 標題符號（如 ### 或 ##），只輸出純粹可執行的臨床感控 SOP 內容。\n' +
    '控制在 4-8 行短條列內回答。\n' +
    '使用者問題：' + question + '\n\n知識庫內容：\n' + context;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    console.error(res.getContentText());
    return '';
  }
  const data = JSON.parse(res.getContentText());
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  return parts && parts.length ? String(parts[0].text || '').trim() : '';
}

function isInternalPlanningSource_(value) {
  return /全傳染病線上互動平台|GitHubPages規格|串接規格|聊天機器人回答行為規則|9千列版回補/i.test(String(value || ''));
}

function translateAnswerForUserLanguage_(text, event, answerObj) {
  const lang = getUserLanguage_(event);
  if (!lang || lang === 'zh-TW') return text;
  if (answerObj && answerObj.languagePrompt) return text;
  const translated = callGeminiTranslate_(text, lang) || callLanguageAppTranslate_(text, lang);
  return translated || translationFallbackNotice_(lang) + '\n\n' + text;
}

function translationFallbackNotice_(lang) {
  return lang==='id'?'Terjemahan gagal. Isi asli:':lang==='vi'?'Chưa dịch được. Nội dung gốc:':lang==='th'?'ไม่สามารถแปลได้ในขณะนี้ โปรดดูข้อความต้นฉบับ:':'Translation failed. Original:';
}

function callGeminiTranslate_(text, language) {
  try {
  const apiKey = getProp_('GEMINI_API_KEY', true);
  if (!apiKey) return '';
  const lang = String(language || 'zh-TW');
  const labels={en:'English',id:'Bahasa Indonesia',vi:'Tiếng Việt',th:'Thai',zh:'zh-TW'};
  const target=labels[lang]||'';
  if (!target) return '';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + CONFIG.GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);
  const prompt='Translate to '+target+'. Only translate; keep codes, URLs, %, ppm, ANN/CDCN.\nText:\n'+String(text||'');
  const payload = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    console.error(res.getContentText());
    return '';
  }
  const data = JSON.parse(res.getContentText());
  if (data.candidates && data.candidates[0] && data.candidates[0].finishReason === 'MAX_TOKENS') return '';
  const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  return parts && parts.length ? cleanAnswerText_(String(parts[0].text || '').trim()) : '';
  } catch (err) {
    console.error('Gemini translation unavailable');
    return '';
  }
}

function callLanguageAppTranslate_(text, lang) {
  try { const to={id:'id',vi:'vi',en:'en',th:'th'}[lang]||''; return to?cleanAnswerText_(LanguageApp.translate(String(text||'').slice(0,4200),'zh-TW',to)):''; }
  catch (err) { console.error('LanguageApp translate failed: ' + err.toString()); return ''; }
}

function extractiveAnswer_(hits, targetDiseaseName) {
  const qContext = typeof USER_REQUEST_CACHE_ !== 'undefined' ? (USER_REQUEST_CACHE_.question || '') : '';
  if (/(出國|旅遊|旅行|目的地|疫苗|預防針|瓜地馬拉|泰國|日本|美國|去.*要打)/.test(qContext)) {
    return travelText_('extractionTravelAdvice');
  }
  const lines = [];
  const seen = {};

  (hits || []).slice(0, 3).forEach(function(entry) {
    const text = String(entry.text || '');
    text.split('\n').forEach(function(raw) {
      const line = cleanKnowledgeLine_(raw);
      if (!line || seen[line]) return;
      seen[line] = true;
      lines.push('   · ' + line);
    });
  });

  const content = lines.slice(0, 6).join('\n') || '   · 相關感管規範請依疾管署與院內最新 SOP 辦理。';
  return '📋 **感染管制處置與規範重點整理**：\n\n' + content + nextSubtopicPrompt_(targetDiseaseName || '本疾病');
}

function cleanAnswerText_(text) {
  let s = String(text || '');
  s = s.replace(/Coze\/LINE/gi, 'LINE');
  s = s.replace(/Coze/gi, '');
  s = s.replace(/\S+\.md/g, '');
  s = s.replace(/.*台大醫院感管中心\s*-\s*全傳染病衛教.*/gi, '');
  s = s.replace(/.*本文件為台大醫院感管中心.*/gi, '');
  s = s.replace(/.*權威核心文檔.*/gi, '');
  s = s.replace(/.*kb_index\.json.*/gi, '');
  s = s.replace(/.*第[一二三四五六七八九十]+部分[:：].*/gi, '');
  s = s.replace(/^#{1,6}\s*/gm, '');
  s = s.replace(/^\s*[-*]+\s*/gm, '- ');
  s = s.replace(/## 民眾版.*$/gm, '');
  s = s.replace(/【民眾版.*?】/g, '');
  s = s.split('\n').filter(function(line) {
    const cleaned = String(line || '').replace(/^\s*[-·•*]\s*/, '').trim();
    if (/[A-Z]:\\/i.test(cleaned)) return false;
    return !/(?:^|[；;。])\s*(?:民眾版|員工版|同仁版|回答重點|回答方向|建議回答|LINE 回答關鍵字|LINE 回答範例|若使用者問|若同仁問|只在使用者明確詢問|以下路徑只在|一般病人照護或民眾衛教回答不要|不要主動列出|查核佐證路徑與用途|你可以先做這幾件事|請用以下)/.test(cleaned);
  }).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return normalizeTravelLevelText_(s).trim();
}

function cleanKnowledgeLine_(raw) {
  const rawStr = String(raw || '').trim();
  if ((rawStr.indexOf('注意：') >= 0 || rawStr.indexOf('警示：') >= 0 || rawStr.indexOf('警告：') >= 0) && rawStr.split('、').length > 5) {
    return '';
  }
  let line = String(raw || '').trim();
  line = line
    .replace(/<a\b[^>]*>\s*<\/a>/gi, '')
    .replace(/＜a\b[^＞]*＞\s*＜\/a＞/gi, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*[-*]+\s*/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/Coze/gi, '')
    .trim();
  if (!line) return '';

  if (/全傳染病台大感管線上互動|全傳染病線上互動平台|GitHub Pages|GitHubPages|串接規格|本規劃案建立|互動式漂白水清消線上計算器|Web Calculator/.test(line)) return '';
  if (/台大醫院感管中心\s*-\s*全傳染病衛教|全傳染病衛教與臨床處置大典|權威核心文檔|kb_index\.json|Gemini RAG|第一線醫護決策支援/.test(line)) return '';
  if (/^(本文件為|本檔依|本檔供|整理時間|整理規則|排除項目|資料最新發布日期|資料來源|檢索關鍵字|LINE 查詢建議|LINE 問答關鍵字|查核佐證路徑與用途|地區清單：?$|請上傳所有同名前綴|適用情境：?|核心原則：?|回答重點：?|回答方向：?|建議回答：?|建議回答臨床同仁：?|回答時：?|若使用者問|若同仁問|只在使用者明確詢問|以下路徑只在|民眾版：?|員工版：?|同仁版：?|你可以先做這幾件事：?|請用以下|可給外籍病人的英文說法：?|LINE 回答範例：?)/.test(line)) return '';
  if (/一般病人照護或民眾衛教回答不要|不要主動列出|[A-Z]:\\/i.test(line)) return '';
  if (/(?:回答重點|回答方向|建議回答|LINE 回答關鍵字|LINE 回答範例|若使用者問|若同仁問)[:：]?/.test(line)) return '';
  if (/^(提醒：)?請不要在 LINE 輸入|^提醒不要在 LINE 輸入|^LINE 不可輸入個資|避免在 LINE 輸入個資/.test(line)) return '';
  if (/(第[一二三四五六七八九十]+部分[:：]|權威連結|大典|文檔之權威核心)/.test(line)) return '';
  if (/^(外籍病人、旅客或即將出境病人的法定傳染病通報|複合型問題：)/.test(line)) return '';
  if (/^本檔提供|^問[:：]|^答[:：]/.test(line)) return '';
  return normalizeTravelLevelText_(line);
}

function replyToLine_(replyToken, text, diseaseName, answerObj) {
  const token = getProp_('LINE_CHANNEL_ACCESS_TOKEN');
  const cleaned = sanitizeLineText_(normalizeTravelLevelText_(text));
  const messages = answerObj && answerObj.travelVaccine
    ? splitTravelLineMessages_(cleaned, answerObj)
    : [{ type: 'text', text: truncateLine_(cleaned) }];

  const quickReply = buildQuickReplyForDisease_(diseaseName, answerObj);
  if (quickReply) {
    messages[messages.length - 1].quickReply = quickReply;
  }
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages,
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    console.error('LINE Reply Error: ' + res.getContentText());
  }
}

function splitTravelLineMessages_(text, answerObj) {
  const messages = [];
  let remaining = String(text || '');
  while (remaining.length > 4500 && messages.length < 4) {
    let end = remaining.lastIndexOf('\n', 4500);
    if (end < 1) end = 4400;
    messages.push({ type: 'text', text: remaining.slice(0, end) });
    remaining = remaining.slice(end).replace(/^\n/, '');
  }
  if (remaining.length > 4500) {
    return [{ type: 'text', text: 'This travel-vaccine answer is too long to display safely. Please consult CDC / 請查閱 CDC 官方目的地建議：\n' + answerObj.travelSourceUrl }];
  }
  messages.push({ type: 'text', text: remaining });
  return messages;
}

function sanitizeLineText_(text) {
  return String(text || '')
    .split('\n')
    .filter(function(line) {
      const value = String(line || '');
      if (/[A-Z]:\\/i.test(value)) return false;
      if (/以下路徑只在使用者明確詢問|查核佐證路徑與用途|院內磁碟路徑/.test(value)) return false;
      if (/我是感染管制檢索助手|知無不言/.test(value)) return false;
      return true;
    })
    .join('\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/__([^_\n]+)__/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function buildQuickReplyForDisease_(diseaseName, answerObj) {
  const d = String(diseaseName || '').trim();
  const isStaff = answerObj && answerObj.identity === 'staff';
  let items = [];
  if (answerObj && answerObj.identityPrompt) {
    items = [qrm_('院內員工', '院內員工'), qrm_('訪客民眾', '訪客')];
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (answerObj && answerObj.reportingPrompt) {
    items = [
      qrm_('麻疹通報', '麻疹通報定義'),
      qrm_('登革熱通報', '登革熱通報定義'),
      qrm_('結核病通報', '結核病通報定義'),
      qrm_('採檢送驗', '麻疹採檢送驗')
    ];
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (answerObj && answerObj.influenzaRiskPrompt) {
    items = [
      qrm_('有症狀＋有接觸', '流感快篩陽性、PCR陰性；有類流感症狀；是新冠接觸者'),
      qrm_('有症狀＋無接觸', '流感快篩陽性、PCR陰性；有類流感症狀；不是新冠接觸者'),
      qrm_('無症狀＋有接觸', '流感快篩陽性、PCR陰性；無症狀；是新冠接觸者'),
      qrm_('無症狀＋無接觸', '流感快篩陽性、PCR陰性；無症狀；不是新冠接觸者')
    ];
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (answerObj && answerObj.catheterPrompt) {
    items = [
      qrm_('中心導管', '中心導管照護'),
      qrm_('導尿管', '導尿管照護'),
      qrm_('呼吸器', '呼吸器管路照護')
    ];
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (answerObj && answerObj.languagePrompt) {
    items = [
      qrm_('繁體中文', '繁體中文'),
      qrm_('English', 'English'),
      qrm_('Bahasa', 'Bahasa Indonesia'), qrm_('Tiếng Việt', 'Tiếng Việt'), qrm_('ไทย', 'ไทย')
    ].concat(items);
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (answerObj && answerObj.qualityPrompt) {
    items = items.concat([
      qrm_('非常有幫助', '滿意度1'),
      qrm_('有幫助', '滿意度2'),
      qrm_('部分有幫助', '滿意度3'),
      qrm_('幫助不大', '滿意度4'),
      qrm_('沒有幫助', '滿意度5')
    ]);
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (d === '疥瘡' && (!answerObj || answerObj.mode !== 'audit')) {
    const scabiesText = String(answerObj && answerObj.text || '');
    const scabiesCurrent = String(answerObj && answerObj.subtopic || '');
    const scabiesOptions = [
      { key: 'household', active: /^同事的同住家人感染疥瘡時/.test(scabiesText), item: qrm_('同住家人感染', '同事同住家人感染疥瘡，要通報嗎？那辦公室接觸等有什麼需要注意的？') },
      { key: 'symptomatic', active: /^同事本人已有症狀或確診疥瘡時/.test(scabiesText), item: qrm_('同仁本人有症狀', '同事本人有症狀，是疥瘡感染者，辦公室和上班怎麼處理？') },
      { key: 'office', active: /^疥瘡辦公室接觸注意/.test(scabiesText), item: qrm_('辦公室接觸', '疥瘡感染者在辦公室，附近同事和開會接觸要注意什麼？') },
      { key: 'isolation', active: scabiesCurrent === 'isolation', item: qrm_('病人隔離', '疥瘡隔離醫囑') },
      { key: 'placement', active: scabiesCurrent === 'placement', item: qrm_('病人安置', '疥瘡病人安置') },
      { key: 'care', active: scabiesCurrent === 'care', item: qrm_('PPE防護', '疥瘡PPE') },
      { key: 'sanitization', active: scabiesCurrent === 'sanitization', item: qrm_('清消', '疥瘡清消') },
      { key: 'clearance', active: scabiesCurrent === 'clearance', item: qrm_('解隔標準', '疥瘡解隔標準') }
    ];
    items = scabiesOptions.filter(function(row) { return !row.active; }).map(function(row) { return row.item; });
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (d === '針扎與體液暴露') {
    const q = String(answerObj && (answerObj.effectiveQuestion || answerObj.originalQuestion || answerObj.text) || '');
    const needlestickItems = [
      { pattern: /立即處理|請先做立即處置/i, item: qrm_('立即處理', '針扎暴露後立即處理') },
      { pattern: /HIV\s*PEP/i, item: qrm_('HIV PEP', '針扎 HIV PEP') },
      { pattern: /檢驗與追蹤/i, item: qrm_('檢驗追蹤', '針扎檢驗與追蹤') },
      { pattern: /委員.*(?:問|提問)|可能提問/i, item: qrm_('委員提問', '查核條文 5.2 委員提問') },
      { pattern: /(?:km|佐證|資料位置)/i, item: qrm_('KM佐證', '查核條文 5.2 KM佐證') }
    ];
    items = needlestickItems.filter(function(row) { return !row.pattern.test(q); }).map(function(row) { return row.item; });
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  const contextualItems = contextualQuickReplyItems_(answerObj);
  if (contextualItems.length) {
    return { items: appendGlobalQuickReplies_(contextualItems, answerObj) };
  }
  if (d === '會議檢索') {
    if (isStaff) {
      items = items.concat([
        qrm_('週會議題', '感染月報在哪些週會出現'),
        qrm_('月會議題', 'VRE在哪些月會出現'),
        qrm_('查核佐證', '手部衛生查核佐證')
      ]);
    } else {
      items = items.concat([
        qrm_('可以查什麼', '可以查什麼'),
        qrm_('疫情資訊', '伊波拉疫區'),
        qrm_('感染管制', '登革熱感染管制')
      ]);
    }
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (d === '閒聊') {
    items = items.concat([
      qrm_('可以查什麼', '可以查什麼'),
      qrm_('VRE解隔', 'VRE解隔')
    ]);
    if (isStaff) items.push(qrm_('會議檢索', '會議檢索'));
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }
  if (!d || d === '熱門感控' || d === '本疾病' || d === '模式切換') {
    if (answerObj && answerObj.clarification) {
      const sub = String(answerObj.subtopic || '');
      let clarifyItems = [];
      if (sub === 'clearance') {
        clarifyItems = [
          qrm_('VRE解隔', 'VRE解隔'),
          qrm_('CRE解隔', 'CRE解隔'),
          qrm_('流感解隔', '流感解隔'),
          qrm_('水痘解隔', '水痘解隔')
        ];
      } else if (sub === 'definition') {
        clarifyItems = [
          qrm_('麻疹通報定義', '麻疹通報定義'),
          qrm_('未定型肝炎', '未定型肝炎通報定義'),
          qrm_('新型A流通報', '新型A型流感通報定義'),
          qrm_('百日咳定義', '百日咳通報定義')
        ];
      } else if (sub === 'specimen') {
        clarifyItems = [
          qrm_('日腦採檢', '日腦採檢'),
          qrm_('流腦採檢', '流腦採檢'),
          qrm_('登革熱採檢', '登革熱採檢'),
          qrm_('MDRO採檢', 'MDRO採檢')
        ];
      } else {
        clarifyItems = [
          qrm_('登革熱隔離', '登革熱隔離醫囑'),
          qrm_('VRE安置', 'VRE病人安置'),
          qrm_('麻疹暴露', '麻疹暴露'),
          qrm_('透析室清消', '透析室清消')
        ];
      }
      return { items: appendGlobalQuickReplies_(items.concat(clarifyItems), answerObj) };
    }
    return { items: appendGlobalQuickReplies_(items, answerObj) };
  }

  const currentSubtopic = answerObj && answerObj.subtopic ? String(answerObj.subtopic) : '';
  const candidates = [
    { key: 'definition', item: qrm_('通報定義', d + '通報定義') },
    { key: 'isolation', item: qrm_('隔離醫囑', d + '隔離醫囑') },
    { key: 'placement', item: qrm_('病人安置', d + '病人安置') },
    { key: 'specimen', item: qrm_('採檢送驗', d + '採檢送驗') },
    { key: 'care', item: qrm_('PPE防護', d + 'PPE') },
    { key: 'sanitization', item: qrm_('清消', d + '清消') },
    { key: 'clearance', item: qrm_('解隔標準', d + '解隔標準') }
  ];
  const diseaseItems = candidates
    .filter(function(row) { return row.key !== currentSubtopic; })
    .map(function(row) { return row.item; });
  if (/^(麻疹|百日咳|HIV|針扎與體液暴露)$/.test(d)) {
    if (currentSubtopic !== 'exposure') diseaseItems.push(qrm_('暴露處置', d + '暴露'));
  }
  return { items: appendGlobalQuickReplies_(items.concat(diseaseItems), answerObj) };
}

function contextualQuickReplyItems_(answerObj) {
  const q = String(answerObj && (answerObj.effectiveQuestion || answerObj.originalQuestion) || '');
  if (answerObj && answerObj.staleAuditPrompt) {
    return [
      qrm_('內視鏡', '內視鏡'),
      qrm_('導管照護', '導管照護'),
      qrm_('手部衛生', '手部衛生'),
      qrm_('傳染病通報', '傳染病通報')
    ];
  }
  if (answerObj && answerObj.cjdAuditPrompt) {
    const cjdItems = [
      { pattern: /院內.*勾稽|系統.*勾稽/i, item: qrm_('院內勾稽紀錄', 'CJD 院內系統勾稽紀錄怎麼查') },
      { pattern: /手動勾稽/i, item: qrm_('手動勾稽', 'CJD 疾管署手動勾稽怎麼查') },
      { pattern: /鼻腔手術|風險判定/i, item: qrm_('風險判定', 'CJD 病人要做鼻腔手術怎麼辦') },
      { pattern: /器械.*處理|鼻腔內視鏡/i, item: qrm_('器械處理', 'CJD 病人鼻腔內視鏡或手術器械要怎麼處理') },
      { pattern: /中高感染力組織|中高風險組織/i, item: qrm_('中高感染力組織', 'CJD 中高感染力組織有哪些') },
      { pattern: /KM佐證/i, item: qrm_('KM佐證', 'CJD KM佐證') }
    ];
    return cjdItems.filter(function(row) { return !row.pattern.test(q); }).map(function(row) { return row.item; });
  }
  if (answerObj && answerObj.auditTopicMenu === 'antibiotic') {
    return [
      qrm_('計畫與權責', '查核條文 3.1 重點'),
      qrm_('使用監測', '查核條文 3.2 重點'),
      qrm_('抗藥性防治', '查核條文 3.3 重點'),
      qrm_('手術預防用藥', '查核條文 3.2 手術預防性抗生素')
    ];
  }
  if (answerObj && answerObj.auditTopicMenu === 'epidemic-policy') {
    return [
      qrm_('手冊與疫情', '查核條文 1.3 重點'),
      qrm_('隔離與應變', '查核條文 1.5 重點'),
      qrm_('傳染病通報', '查核條文 4.1 重點'),
      qrm_('防疫物資', '查核條文 4.6 重點'),
      qrm_('員工保護', '查核條文 5.1 重點')
    ];
  }
  const isNeedlestickAudit = answerObj && answerObj.mode === 'audit' && (
    String(answerObj.diseaseName || '') === '針扎與體液暴露' ||
    /針扎|針刺|尖銳物|血液體液暴露|職業暴露|HIV\s*PEP/i.test(q)
  );
  if (isNeedlestickAudit) {
    const needlestickItems = [
      { pattern: /暴露後立即處理/i, item: qrm_('立即處理', '針扎暴露後立即處理') },
      { pattern: /HIV\s*PEP/i, item: qrm_('HIV PEP', '針扎 HIV PEP') },
      { pattern: /檢驗與追蹤/i, item: qrm_('檢驗追蹤', '針扎檢驗與追蹤') },
      { pattern: /委員.*(?:問|提問)|可能提問/i, item: qrm_('委員提問', '查核條文 5.2 委員提問') },
      { pattern: /(?:km|佐證|資料位置)/i, item: qrm_('KM佐證', '查核條文 5.2 KM佐證') }
    ];
    return needlestickItems.filter(function(row) { return !row.pattern.test(q); }).map(function(row) { return row.item; });
  }
  if (answerObj && answerObj.auditClauseId) {
    const clauseId = String(answerObj.auditClauseId);
    const clauseFacets = [
      { pattern: /(?:條文)?重點/i, item: qrm_('條文重點', '查核條文 ' + clauseId + ' 重點') },
      { pattern: /委員.*(?:問|提問)|可能提問/i, item: qrm_('委員提問', '查核條文 ' + clauseId + ' 委員提問') },
      { pattern: /(?:km|佐證|資料位置)/i, item: qrm_('KM佐證', '查核條文 ' + clauseId + ' KM佐證') },
      { pattern: /(?:執行紀錄|現場紀錄|系統紀錄|相關紀錄)/i, item: qrm_('執行紀錄', '查核條文 ' + clauseId + ' 執行紀錄') }
    ];
    return clauseFacets
      .filter(function(row) { return !row.pattern.test(q); })
      .map(function(row) { return row.item; });
  }
  if (answerObj && answerObj.mode === 'audit' && /內視鏡/i.test(q)) {
    const endoscopeAuditItems = [
      { pattern: /再處理流程|^內視鏡$/i, item: qrm_('再處理流程', '內視鏡再處理流程') },
      { pattern: /委員提問/i, item: qrm_('委員提問', '內視鏡委員提問') },
      { pattern: /執行紀錄|可出示紀錄/i, item: qrm_('執行紀錄', '內視鏡執行紀錄') },
      { pattern: /KM佐證/i, item: qrm_('KM佐證', '內視鏡KM佐證') },
      { pattern: /微生物監測異常/i, item: qrm_('異常監測', '內視鏡微生物監測異常') }
    ];
    return endoscopeAuditItems.filter(function(row) { return !row.pattern.test(q); }).map(function(row) { return row.item; });
  }
  if (answerObj && answerObj.mode === 'audit' && answerObj.diseaseName && !/^(評鑑查核|熱門感控|閒聊)$/.test(String(answerObj.diseaseName))) {
    const topic = String(answerObj.diseaseName);
    const subtopic = String(answerObj.subtopic || '');
    if (topic === '透析室') {
      const dialysisItems = [
        { pattern: /消毒濃度/i, item: qrm_('清消標準', '透析室消毒濃度') },
        { pattern: /委員提問/i, item: qrm_('委員提問', '透析室清消委員提問') },
        { pattern: /可出示紀錄/i, item: qrm_('執行紀錄', '透析室清消可出示紀錄') },
        { pattern: /KM佐證/i, item: qrm_('KM佐證', '透析室清消KM佐證') }
      ];
      return dialysisItems.filter(function(row) { return !row.pattern.test(q); }).map(function(row) { return row.item; });
    }
    if (subtopic === 'definition') {
      const definitionItems = [
        { pattern: /通報定義|通報要件|通報條件|通報標準|病例定義|病例要件|診斷要件|診斷條件/i, item: qrm_('通報重點', topic + '通報定義') },
        { pattern: /採檢送驗/i, item: qrm_('採檢佐證', topic + '採檢送驗') },
        { pattern: /委員提問/i, item: qrm_('委員提問', topic + '通報委員提問') },
        { pattern: /KM佐證/i, item: qrm_('KM佐證', topic + '通報KM佐證') }
      ];
      return definitionItems.filter(function(row) { return !row.pattern.test(q); }).map(function(row) { return row.item; });
    }
    if (subtopic !== 'audit' && subtopic.indexOf('audit-') !== 0) {
      return [
        qrm_('委員提問', topic + '評鑑委員可能提問'),
        qrm_('KM佐證', topic + 'KM佐證'),
        qrm_('執行紀錄', topic + '可出示執行紀錄'),
        qrm_('處置重點', topic + '感染管制處置重點')
      ];
    }
    const auditFacets = [
      { key: 'audit-reporting', item: qrm_('通報與時限', topic + '通報與時限查核') },
      { key: 'audit-isolation', item: qrm_('隔離標示', topic + '隔離標示查核') },
      { key: 'audit-ppe', item: qrm_('PPE防護', topic + 'PPE防護查核') },
      { key: 'audit-placement', item: qrm_('病人安置', topic + '病人安置查核') },
      { key: 'audit-specimen', item: qrm_('採檢送驗', topic + '採檢送驗查核') },
      { key: 'audit-sanitization', item: qrm_('環境清消', topic + '環境清消查核') },
      { key: 'audit-records', item: qrm_('相關紀錄', topic + '相關紀錄查核') }
    ];
    return auditFacets
      .filter(function(row) { return row.key !== subtopic; })
      .map(function(row) { return row.item; });
  }
  if (/教育|訓練/i.test(q) && answerObj && answerObj.mode === 'audit') {
    return [
      qrm_('教育時數', '感染管制教育時數'),
      qrm_('完訓紀錄', '感染管制教育完訓紀錄佐證'),
      qrm_('新進人員', '新進人員感染管制教育查核'),
      qrm_('高風險作業', '高風險作業人員教育與技術查核')
    ];
  }
  if (/疫苗|預防接種|抗體/i.test(q) && answerObj && answerObj.mode === 'audit') {
    return [
      qrm_('適用對象', '疫苗政策適用對象'),
      qrm_('接種與抗體', '疫苗接種與抗體紀錄佐證'),
      qrm_('未接種追蹤', '疫苗未接種與禁忌追蹤'),
      qrm_('外包實習', '外包與實習人員疫苗政策')
    ];
  }
  if (/內視鏡/i.test(q)) {
    return [
      qrm_('再處理流程', '內視鏡再處理流程'),
      qrm_('手工清洗', '內視鏡手工清洗'),
      qrm_('高層次消毒', '內視鏡高層次消毒'),
      qrm_('乾燥與儲存', '內視鏡乾燥與儲存'),
      qrm_('異常監測', '內視鏡微生物監測異常')
    ];
  }
  return [];
}

function globalQuickReplyItems_(showSatisfaction, activeMode, identity) {
  const items = [qrm_('Language','語言'), quickReplyUri_('疫情訊息', latestEpidemicInfoUrl_())];
  if (!identity) {
    items.push(qrm_('院內員工', '院內員工'), qrm_('訪客民眾', '訪客'));
  } else if (identity === 'staff') {
    if (activeMode !== 'audit') items.push(qrm_('評鑑查核', '評鑑查核'));
    if (activeMode !== 'clinical') items.push(qrm_('臨床照護', '臨床照護'));
  } else if (identity === 'public') {
    items.push(qrm_('院內員工', '院內員工'));
  }
  if(showSatisfaction) items.push(qrm_('滿意度','滿意度')); items.push(qrm_('感管意見箱','感管意見箱'));
  return items;
}

function appendGlobalQuickReplies_(items, answerObj) {
  const showSatisfaction = Boolean(answerObj && (answerObj.qualityPrompt || answerObj.satisfactionEligible));
  const activeMode = answerObj && answerObj.modeExplicit ? String(answerObj.mode || '') : '';
  const identity = answerObj && answerObj.identityPrompt ? 'prompting' : (answerObj && answerObj.identity ? String(answerObj.identity || '') : '');
  const base = globalQuickReplyItems_(showSatisfaction, activeMode, identity);
  return base.slice(0,1).concat((items||[]).slice(0,13-base.length)).concat(base.slice(1));
}

function quickReplyUri_(label, uri) {
  return {
    type: 'action',
    action: {
      type: 'uri',
      label: String(label || '').slice(0, 20),
      uri: String(uri || '')
    }
  };
}

const qrm_ = quickReplyMessage_;
function quickReplyMessage_(label, text) {
  return {
    type: 'action',
    action: {
      type: 'message',
      label: String(label || '').slice(0, 20),
      text: String(text || '').slice(0, 300)
    }
  };
}

function latestEpidemicInfoUrl_() {
  return 'https://heigilin.github.io/ntuh_cdc/web-preview.html';
}

function normalizeTravelLevelText_(text) {
  let s = String(text || '');
  s = s.replace(/第三級[:：]\s*警告\s*[（(]\s*Warning\s*[）)]/gi, '🔴 第三級：警告');
  s = s.replace(/第二級[:：]\s*警示\s*[（(]\s*Alert\s*[）)]/gi, '🟠 第二級：警示');
  s = s.replace(/第一級[:：]\s*注意\s*[（(]\s*Watch\s*[）)]/gi, '🟡 第一級：注意');
  s = s.replace(/第三級[:：]\s*警告/gi, '🔴 第三級：警告');
  s = s.replace(/第二級[:：]\s*警示/gi, '🟠 第二級：警示');
  s = s.replace(/第一級[:：]\s*注意/gi, '🟡 第一級：注意');
  s = s.replace(/（Warning）|\(Warning\)/gi, '');
  s = s.replace(/（Alert）|\(Alert\)/gi, '');
  s = s.replace(/（Watch）|\(Watch\)/gi, '');
  s = s.replace(/🔴\s*🔴/g, '🔴');
  s = s.replace(/🟠\s*🟠/g, '🟠');
  s = s.replace(/🟡\s*🟡/g, '🟡');
  return s;
}

function convertFullWidthToHalfWidth_(str) {
  if (!str) return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code >= 0xFF01 && code <= 0xFF5E) {
      result += String.fromCharCode(code - 65248);
    } else if (code === 0x3000) {
      result += ' ';
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

function tokenize_(text) {
  const lower = String(text || '').toLowerCase();
  const tokens = [];
  const latin = lower.match(/[a-z0-9][a-z0-9_\-\.\/\+%]*/g) || [];
  latin.forEach(function(t) { tokens.push(t); });
  const cjk = lower.match(/[\u4e00-\u9fff]{2,}/g) || [];
  cjk.forEach(function(chunk) {
    if (chunk.length <= 12) tokens.push(chunk);
    [2, 3, 4].forEach(function(size) {
      for (let i = 0; i <= chunk.length - size; i++) tokens.push(chunk.slice(i, i + size));
    });
  });
  const seen = {};
  return tokens.filter(function(t) {
    if (seen[t]) return false;
    seen[t] = true;
    return true;
  }).slice(0, 80);
}

function getProp_(name, optional) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value && !optional) throw new Error('Missing script property: ' + name);
  return (value || '').trim().replace(/^[\x22\x27]|[\x22\x27]$/g, '');
}

function truncateLine_(text) {
  const limit = 4500;
  text = String(text || '').trim();
  return text.length <= limit ? text : text.slice(0, limit - 20) + '\n\n（內容較長，已截短）';
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function testSendLineMessage() {
  const resultObj = answerQuestion_("兔熱病");
  console.log("=== 測試生成的兔熱病答覆 ===");
  console.log(resultObj.text);
  const quickReply = buildQuickReplyForDisease_(resultObj.diseaseName);
  console.log("=== 測試生成的 LINE 浮動快捷導覽按鈕 (Quick Reply) ===");
  console.log(JSON.stringify(quickReply));
  const token = getProp_('LINE_CHANNEL_ACCESS_TOKEN', true);
  console.log("LINE_CHANNEL_ACCESS_TOKEN status: " + (token ? "Configured len " + token.length : "Missing"));
}

function testSendRealLineMessageToMe() {
  const token = getProp_('LINE_CHANNEL_ACCESS_TOKEN');
  console.log('Testing direct API connection to LINE Messaging API...');
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  console.log('LINE Bot Info API HTTP Status: ' + res.getResponseCode());
  console.log('LINE Bot Info Response: ' + res.getContentText());
}

function isTravelGeneralHealthQuery_(question) {
  const q = String(question || '').trim();
  const isTravel = /(出國|旅遊|旅行|探親|出境|去|到|飛|前往|拜訪|遊玩|玩|travel|trip|visit|go to|going to|flight|bepergian|perjalanan|wisata|du lịch|đi|chuyến đi|เดินทาง|ท่องเที่ยว|ไป|เที่ยว)/i.test(q);
  const isPrecaution = /(注意|須知|建議|準備|提醒|防護|帶什麼|帶甚麼|要帶|防範|必備|指南|帶啥|預防|預防措施|小心|留意|precaution|careful|prepare|preparation|requirement|advice|tip|guideline|what to know|what should i|perhati|persiapan|hati-hati|pencegahan|lưu ý|chuẩn bị|cẩn thận|phòng ngừa|ระวัง|เตรียมตัว|ข้อควรระวัง|ข้อแนะนำ|ต้องทำอะไร)/i.test(q);

  if (!isTravel && !/(注意事項|健康須知|防疫須知|出國注意)/.test(q)) return false;
  if (!isPrecaution) return false;

  const dests = extractTravelDestinations_(q);
  if (dests.length > 0) return true;
  return /(出國|旅遊|旅行|出境|travel|trip|bepergian|du lịch|เดินทาง)/i.test(q);
}

function travelGeneralHealthReply_(question, event) {
  const info = loadBotReferenceData_().generalHealth;
  const target = extractTravelDestinations_(question)[0];
  const reply = { diseaseName: '出國健康須知', subtopic: 'travel-general-health' };
  if (!target) { reply.text = info.generic; reply.clarification = true; return reply; }
  let epidemic = countryOrRegionEpidemicReply_(target.label + '疫情');
  if (/目前未列示任何特殊的旅遊疫情建議等級/.test(epidemic)) epidemic = '';
  epidemic = epidemic.replace(/\n🔗.*/s, '').trim();
  const climate = info.climates.find(function(rule) { return new RegExp(rule.pattern).test(target.label); });
  const lines = [info.title, epidemic ? info.epidemicHeading + epidemic + '\n' : info.epidemicUnknown]
    .concat(info.vaccination, info.protectionHeading, climate ? climate.text : info.defaultClimate, info.preparation);
  reply.text = lines.join('\n').replace(/\{place\}/g, target.label);
  return reply;
}
