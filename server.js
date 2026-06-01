const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const content = require("./data/ds160-content.js");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const rootDir = __dirname;
const reportStorePath = path.join(rootDir, "data", "pro-reports.json");
const reportStoreLimit = 30;
let memoryReportStore = [];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendNotFound(res) {
  sendJson(res, 404, { error: "Not Found" });
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function fieldMatchesProfile(field, profile) {
  return (
    !profile ||
    profile === "all" ||
    field.appliesTo.includes("all") ||
    field.appliesTo.includes(profile)
  );
}

function filterFields(searchParams) {
  const profile = searchParams.get("profile") || "all";
  const section = searchParams.get("section") || "all";
  const query = normalizeText(searchParams.get("q"));

  return content.fields
    .filter((field) => {
      const inProfile = fieldMatchesProfile(field, profile);
      const inSection = section === "all" || field.sectionId === section;
      const haystack = normalizeText(
        [
          field.id,
          field.name,
          field.part,
          field.condition,
          field.format,
          field.meaning,
          field.examples.join(" "),
          field.mistakes.join(" "),
        ].join(" "),
      );

      return inProfile && inSection && (!query || haystack.includes(query));
    })
    .sort((a, b) => (a.order || 99999) - (b.order || 99999));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function yes(value) {
  return value === true || String(value || "").toLowerCase() === "yes";
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValue(value) {
  return String(value || "").trim().length > 0;
}

function addUnique(list, item) {
  if (!list.includes(item)) list.push(item);
}

function createReportId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `B2-${date}-${random}`;
}

function readReportStore() {
  if (memoryReportStore.length) return memoryReportStore;

  try {
    const body = fs.readFileSync(reportStorePath, "utf8");
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return memoryReportStore;
  }
}

function writeReportStore(reports) {
  const limited = reports.slice(0, reportStoreLimit);
  memoryReportStore = limited;
  fs.writeFileSync(reportStorePath, JSON.stringify(limited, null, 2));
}

function reportSummary(record) {
  return {
    reportId: record.reportId,
    generatedAt: record.generatedAt,
    product: record.product,
    summary: record.summary,
    riskCount: record.riskCount,
    fixCount: record.fixCount,
  };
}

function hasProAccess(req, url) {
  return url.searchParams.get("access") === "pro" || req.headers["x-ds160-pro"] === "demo";
}

function fullReportView(report) {
  return {
    ...report,
    access: "pro",
    locked: false,
    riskCount: report.risks.length,
    fixCount: report.fixes.length,
    passCount: report.passed.length,
    documentCount: report.documents.length,
  };
}

function freeReportView(report) {
  return {
    reportId: report.reportId,
    product: report.product,
    generatedAt: report.generatedAt,
    access: "free",
    locked: true,
    summary: report.summary,
    riskCount: report.risks.length,
    fixCount: report.fixes.length,
    passCount: report.passed.length,
    documentCount: report.documents.length,
    documents: report.documents.slice(0, 3),
    preview: {
      risk:
        report.risks.length > 0
          ? "发现高风险项。完整说明、对应 DS-160 核对点和建议材料属于 Pro 报告内容。"
          : "未发现必须立即暂停的高风险项。完整逐项核对属于 Pro 报告内容。",
      fixes:
        report.fixes.length > 0
          ? `发现 ${report.fixes.length} 项需要补充或统一口径。`
          : "当前输入未发现明显需要补充的基础信息。",
    },
    lockedSections: ["完整通过项", "完整修改建议", "完整高风险解释", "完整材料清单", "历史记录", "打印 / PDF"],
    upgradeMessage: "升级 Pro 后可查看完整报告、保存历史并打印导出 PDF。",
    disclaimer: report.disclaimer,
  };
}

function saveReport(report, isPro = false) {
  const storedReport = {
    ...report,
    reportId: createReportId(),
  };
  const record = {
    reportId: storedReport.reportId,
    generatedAt: storedReport.generatedAt,
    product: storedReport.product,
    summary: storedReport.summary,
    riskCount: storedReport.risks.length,
    fixCount: storedReport.fixes.length,
    report: storedReport,
  };
  const reports = readReportStore().filter((item) => item.reportId !== record.reportId);
  reports.unshift(record);
  writeReportStore(reports);
  return isPro ? fullReportView(storedReport) : freeReportView(storedReport);
}

function getStoredReport(reportId) {
  return readReportStore().find((record) => record.reportId === reportId);
}

function buildB1B2Report(input) {
  const passed = [];
  const fixes = [];
  const risks = [];
  const documents = ["护照个人信息页", "DS-160 确认页和签证预约信息"];
  const stayDays = numberValue(input.stayDays);
  const passportValidMonths = numberValue(input.passportValidMonths);
  const income = numberValue(input.monthlyIncome);

  if (hasValue(input.travelPurpose)) {
    passed.push("已选择 B1/B2 访问目的，可继续核对 Travel Information 与 Purpose of Trip 口径是否一致。");
  } else {
    fixes.push("补充访问目的：旅游、商务、探亲访友、医疗或其他短期访问目的需要和 DS-160 选择项一致。");
  }

  if (input.travelPurpose === "tourism") {
    addUnique(documents, "城市行程、活动安排或旅行计划");
    if (input.usContactRelationship && input.usContactRelationship !== "none") {
      fixes.push("旅游目的下如填写美国联系人，需解释联系人角色，避免 U.S. Contact 与访问目的看起来不一致。");
    }
  }

  if (input.travelPurpose === "business") {
    addUnique(documents, "商务邀请函、会议/展会信息或公司派遣说明");
    if (input.payer && input.payer !== "employer" && input.payer !== "self") {
      fixes.push("短期商务访问通常需要核对费用承担人与公司派遣、邀请方或本人支付口径是否一致。");
    }
    if (input.usContactRelationship && input.usContactRelationship !== "business") {
      fixes.push("商务目的下，美国联系人建议与邀请公司、会议方或商务联系人口径一致。");
    }
  }

  if (input.travelPurpose === "family_visit") {
    addUnique(documents, "邀请信、邀请人身份证明或亲属/朋友关系说明");
    if (input.hasUSContact === "no" || input.usContactRelationship === "none") {
      fixes.push("探亲访友目的通常应核对 U.S. Contact 与邀请人/住宿地址是否一致。");
    }
  }

  if (input.travelPurpose === "medical") {
    addUnique(documents, "美国医疗机构预约/诊断材料、治疗费用估算和资金证明");
    if (input.usContactRelationship && input.usContactRelationship !== "medical") {
      fixes.push("医疗目的下，美国联系人通常应与医院、医生或医疗机构信息相互对应。");
    }
    if (input.payer === "us_contact") {
      risks.push("医疗访问由美国联系人支付费用时，需要非常清楚的资金承担和治疗安排说明，建议先咨询专业人士。");
    }
  }

  if (hasValue(input.intendedArrival)) {
    passed.push("已填写预计抵达日期。DS-160 日期建议按 DD-MMM-YYYY 准备，例如 15-AUG-2026。");
  } else {
    fixes.push("补充预计抵达日期；如果尚未订票，可填写合理计划日期，不建议先购买不可退机票。");
  }

  if (stayDays > 0 && stayDays <= 45) {
    passed.push("停留天数看起来符合常见短期访问口径。");
  } else if (stayDays > 45 && stayDays <= 180) {
    fixes.push("停留时间偏长，需要准备清楚的行程、资金来源和回国约束说明。");
  } else if (stayDays > 180) {
    risks.push("B1/B2 填写超过 180 天停留计划属于高风险口径，建议先咨询移民律师或领事馆。");
  } else {
    fixes.push("补充预计停留天数，避免 Travel Information 与面签回答不一致。");
  }

  if (input.usStayAddressType === "hotel") {
    passed.push("住宿类型为酒店/临时住宿，需保持酒店城市与行程城市一致。");
    addUnique(documents, "酒店预订或可解释的住宿计划");
  } else if (input.usStayAddressType === "relative_friend") {
    fixes.push("住亲友家时，需核对 U.S. Contact、在美地址、关系说明是否一致。");
    addUnique(documents, "邀请人信息、邀请信或关系说明");
  } else if (input.usStayAddressType === "unknown") {
    fixes.push("住宿地址尚不明确。DS-160 常见做法是填写计划住宿地址或临时地址，并保持真实可解释。");
  } else {
    fixes.push("补充在美停留地址类型，便于核对 Address Where You Will Stay in the U.S.");
  }

  if (input.hasUSContact === "yes") {
    passed.push("已标记有美国联系人，需核对 U.S. Contact、在美地址、邀请/关系材料是否一致。");
    if (!input.usContactRelationship) {
      fixes.push("补充美国联系人关系，便于判断是亲属、朋友、商务方还是医疗机构。");
    }
  } else if (input.hasUSContact === "no") {
    if (input.usStayAddressType === "relative_friend" || input.travelPurpose === "family_visit") {
      fixes.push("住亲友家或探亲访友但没有美国联系人，容易产生口径冲突；需重新核对 U.S. Contact 页面。");
    } else {
      passed.push("没有特定美国联系人时，需准备酒店、行程或可解释的临时联系信息。");
    }
  } else {
    fixes.push("补充是否有美国联系人，用于核对 U.S. Contact Information 页面。");
  }

  if (input.invitationStatus === "ready") {
    passed.push("已准备邀请/证明材料，需核对姓名、地址、日期和访问目的。");
  } else if (input.invitationStatus === "pending") {
    fixes.push("邀请/证明材料准备中，提交前需确认信息与 DS-160 完全一致。");
  } else if (input.invitationStatus === "none") {
    if (["business", "family_visit", "medical"].includes(input.travelPurpose)) {
      risks.push("商务、探亲访友或医疗目的缺少邀请/证明材料会增加解释压力，建议先补齐材料。");
    } else {
      fixes.push("如无邀请材料，需确保行程、住宿和资金材料足以解释短期访问目的。");
    }
  }

  if (input.tripSpecificity === "specific") {
    passed.push("行程城市和日期较明确，需与预计抵达日期、停留天数和住宿城市一致。");
  } else if (input.tripSpecificity === "rough") {
    fixes.push("行程仍较粗略，建议至少准备主要城市、停留天数和住宿安排，避免面签口径松散。");
  } else if (input.tripSpecificity === "unclear") {
    risks.push("行程目的和安排不清楚会削弱 B1/B2 短期访问解释，建议先完善计划再提交。");
  } else {
    fixes.push("补充行程确定度，便于核对 Travel Information 和面签回答。");
  }

  if (input.payer === "self") {
    passed.push("费用承担人为本人，需和收入、存款、职业信息互相支撑。");
    addUnique(documents, "个人资金证明或银行流水");
  } else if (input.payer === "parents") {
    fixes.push("父母资助时，需核对 Person/Entity Paying for Your Trip 与亲属关系、资金材料一致。");
    addUnique(documents, "父母资金证明和亲属关系材料");
  } else if (input.payer === "employer") {
    fixes.push("雇主支付时，需确认是否属于真实商务访问，并准备派遣函或费用承担说明。");
    addUnique(documents, "雇主派遣函或费用承担说明");
  } else if (input.payer === "us_contact") {
    risks.push("由美国联系人承担费用可能触发更强的访问目的、关系和资金来源核对，建议准备充分说明。");
    addUnique(documents, "美国联系人邀请信、关系说明和费用承担说明");
  } else {
    fixes.push("补充旅行费用承担人，避免与收入、邀请人或行程安排冲突。");
  }

  if (input.employmentStatus === "employed" || input.employmentStatus === "self_employed") {
    passed.push("已填写工作状态，需和 Present Work/Education/Training Information 保持一致。");
    addUnique(documents, "在职证明、营业材料或收入证明");
  } else if (input.employmentStatus === "student") {
    passed.push("已填写学生状态，需和学校信息、假期/请假安排一致。");
    addUnique(documents, "在读证明、学生证或准假材料");
  } else if (input.employmentStatus === "retired") {
    passed.push("已填写退休状态，需准备退休或养老金相关材料。");
    addUnique(documents, "退休证明或养老金材料");
  } else if (input.employmentStatus === "unemployed") {
    fixes.push("无业/待业状态需要更谨慎核对资金来源、旅行目的和回国约束材料。");
  } else {
    fixes.push("补充当前工作/学习状态，便于核对 Present Work/Education/Training 页面。");
  }

  if (input.homeTies === "strong") {
    passed.push("国内工作/学习/家庭/资产等约束材料较完整，可支撑短期访问后返回的口径。");
  } else if (input.homeTies === "some") {
    fixes.push("国内约束材料只有部分准备，建议补充工作/学习、家庭、资产或长期居住证明等材料。");
  } else if (input.homeTies === "weak") {
    risks.push("国内约束材料较少时，B1/B2 短期访问解释压力会更高，建议先完善支持材料。");
  } else {
    fixes.push("补充国内约束材料情况，用于核对 B1/B2 短期访问后返回的合理性。");
  }

  if (input.travelCompanions === "family") {
    addUnique(documents, "同行家人的护照/签证信息和关系材料");
    passed.push("与家人同行时，需核对同行人信息、关系和行程是否一致。");
  } else if (input.travelCompanions === "business") {
    addUnique(documents, "同行同事/商务团队说明");
    fixes.push("商务团队同行时，需核对公司派遣、会议安排和同行人关系。");
  } else if (input.travelCompanions === "group") {
    addUnique(documents, "旅行团行程单或报名确认");
    passed.push("旅行团出行时，需核对团期、城市、停留天数和付款记录。");
  } else if (!input.travelCompanions) {
    fixes.push("补充同行人情况，避免 Travel Companions 页面遗漏。");
  }

  if (income > 0) {
    passed.push("已填写月收入参考值，需与工作、银行流水或资助材料大体一致。");
  } else {
    fixes.push("如 DS-160 要求填写收入，需按真实情况准备；不适用时再按页面允许选项处理。");
  }

  if (passportValidMonths >= 6) {
    passed.push("护照有效期看起来满足至少 6 个月的常见核对标准。");
  } else if (passportValidMonths > 0) {
    risks.push("护照有效期不足 6 个月可能影响签证或入境安排，请先核对领事馆和入境要求。");
  } else {
    fixes.push("补充护照剩余有效期，核对 Passport Information 页面。");
  }

  if (yes(input.hasPreviousUSVisa)) {
    passed.push("有美国签证历史时，需核对旧签证号码、签发日期和签证类别。");
    addUnique(documents, "旧美国签证页或签证记录");
  }

  if (yes(input.hasVisaRefusal)) {
    risks.push("有拒签史时，DS-160 相关问题必须如实披露，并准备拒签时间、类别和简要说明。建议咨询移民律师。");
    addUnique(documents, "拒签记录、旧 DS-160 或面签后说明单");
  }

  if (yes(input.hasOverstayOrViolation)) {
    risks.push("存在逾期停留、身份失效或移民违规属于高风险问题，提交前建议咨询移民律师。");
    addUnique(documents, "I-94、出入境记录、移民文件或相关说明");
  }

  if (yes(input.hasArrestOrConviction)) {
    risks.push("存在逮捕、犯罪或定罪记录属于安全背景高风险问题，务必咨询移民律师后再填写。");
    addUnique(documents, "法院记录、警方记录和判决/结案文件");
  }

  if (!risks.length) {
    passed.push("未勾选拒签、逾期/违规、逮捕/定罪等高风险项；仍需按真实情况逐题核对 DS-160。");
  }

  return {
    product: "B1/B2 Pro 核对报告",
    generatedAt: new Date().toISOString(),
    summary:
      risks.length > 0
        ? "发现高风险项，建议先暂停提交并咨询移民律师或领事馆。"
        : fixes.length > 0
          ? "未发现必须立即暂停的高风险项，但仍有信息需要补充或统一口径。"
          : "当前输入未发现明显冲突，可继续逐字段核对 DS-160。",
    passed,
    fixes,
    risks,
    documents,
    disclaimer:
      "本报告仅用于 B1/B2 DS-160 填写准备和一致性核对，不构成法律意见。涉及拒签、犯罪记录、逾期停留、虚假陈述、身份违规或安全背景问题时，请咨询有资质的移民律师或领事馆。",
  };
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "ds160-assistant",
      fieldCount: content.fields.length,
      coverageStatus: content.coverage?.status || "unknown",
    });
    return true;
  }

  if (url.pathname === "/api/meta") {
    sendJson(res, 200, {
      coverage: content.coverage,
      sections: content.sections,
      visaProfiles: content.visaProfiles,
      workflowFacts: content.workflowFacts,
      officialSources: content.officialSources,
    });
    return true;
  }

  if (url.pathname === "/api/fields") {
    const fields = filterFields(url.searchParams);
    sendJson(res, 200, {
      count: fields.length,
      coverageStatus: content.coverage?.status || "unknown",
      fields,
    });
    return true;
  }

  if (url.pathname.startsWith("/api/fields/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/fields/", ""));
    const field = content.fields.find((item) => item.id === id);
    if (!field) {
      sendNotFound(res);
      return true;
    }
    sendJson(res, 200, field);
    return true;
  }

  if (url.pathname === "/api/sources") {
    sendJson(res, 200, {
      officialSources: content.officialSources,
    });
    return true;
  }

  if (url.pathname === "/api/reports/b1b2") {
    if (req.method === "GET") {
      if (hasProAccess(req, url)) {
        sendJson(res, 200, {
          access: "pro",
          locked: false,
          count: readReportStore().length,
          reports: readReportStore().map(reportSummary),
        });
        return true;
      }

      sendJson(res, 200, {
        access: "free",
        locked: true,
        count: 0,
        reports: [],
        message: "历史记录属于 Pro 功能。升级后可查看最近报告并重新打开。",
      });
      return true;
    }

    if (req.method === "POST") {
      let input;
      try {
        input = await readJsonBody(req);
      } catch (error) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return true;
      }

      try {
        sendJson(res, 200, saveReport(buildB1B2Report(input), hasProAccess(req, url)));
      } catch (error) {
        if (error.code === "EPERM" || error.code === "EACCES") {
          const report = buildB1B2Report(input);
          report.reportId = createReportId();
          memoryReportStore.unshift({
            reportId: report.reportId,
            generatedAt: report.generatedAt,
            product: report.product,
            summary: report.summary,
            riskCount: report.risks.length,
            fixCount: report.fixes.length,
            report,
          });
          memoryReportStore = memoryReportStore.slice(0, reportStoreLimit);
          sendJson(res, 200, hasProAccess(req, url) ? fullReportView(report) : freeReportView(report));
          return true;
        }
        sendJson(res, 500, { error: "Report could not be saved" });
      }
      return true;
    }

    sendJson(res, 405, { error: "Method Not Allowed" });
    return true;
  }

  if (url.pathname.startsWith("/api/reports/b1b2/")) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method Not Allowed" });
      return true;
    }

    const reportId = decodeURIComponent(url.pathname.replace("/api/reports/b1b2/", ""));
    const record = getStoredReport(reportId);
    if (!record) {
      sendNotFound(res);
      return true;
    }
    sendJson(res, 200, hasProAccess(req, url) ? fullReportView(record.report) : freeReportView(record.report));
    return true;
  }

  return false;
}

function serveStatic(res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(requestPath);
  const absolutePath = path.resolve(rootDir, `.${decodedPath}`);

  if (!absolutePath.startsWith(rootDir)) {
    sendNotFound(res);
    return;
  }

  fs.readFile(absolutePath, (error, file) => {
    if (error) {
      sendNotFound(res);
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(file);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  if (url.pathname.startsWith("/api/") && await handleApi(req, res, url)) {
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }

  serveStatic(res, url.pathname);
});

server.listen(port, host, () => {
  console.log(`DS-160 assistant running at http://${host}:${port}`);
});
