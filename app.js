(function () {
const content = window.DS160_CONTENT;

if (!content) {
  document.querySelector("#answer-panel").innerHTML =
    '<div class="empty-state">数据文件未加载。请确认 ./data/ds160-content.js 与 index.html 在同一项目目录下，或使用本地服务器打开页面。</div>';
  throw new Error("DS160_CONTENT is missing");
}

const {
  fields,
  coverage,
  officialSources,
  sections,
  securityDisclaimer,
  visaProfiles,
  workflowFacts,
} = content;

const sectionList = document.querySelector("#section-list");
const fieldList = document.querySelector("#field-list");
const answerPanel = document.querySelector("#answer-panel");
const resultCount = document.querySelector("#result-count");
const searchInput = document.querySelector("#field-search");
const clearSearch = document.querySelector("#clear-search");
const customForm = document.querySelector("#custom-form");
const customInput = document.querySelector("#custom-input");
const profileTabs = document.querySelector("#profile-tabs");
const profileDescription = document.querySelector("#profile-description");
const workflowList = document.querySelector("#workflow-list");
const coverageNote = document.querySelector("#coverage-note");
const proReportForm = document.querySelector("#pro-report-form");
const proReportOutput = document.querySelector("#pro-report-output");
const reportHistoryList = document.querySelector("#report-history-list");
const upgradeModal = document.querySelector("#upgrade-modal");

let activeSectionId = "all";
const enabledProfiles = new Set(["b"]);
const proUnlockKey = "ds160-pro-demo-unlocked";

let activeProfileId = "b";
let activeField = fields[0];
let currentReport = null;

function isProUnlocked() {
  return window.localStorage.getItem(proUnlockKey) === "true";
}

function setProUnlocked(value) {
  window.localStorage.setItem(proUnlockKey, value ? "true" : "false");
}

function apiPath(path) {
  if (!isProUnlocked()) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}access=pro`;
}

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sourceById(sourceId) {
  return officialSources.find((source) => source.id === sourceId);
}

function sectionById(sectionId) {
  return sections.find((section) => section.id === sectionId);
}

function fieldAppliesToProfile(field) {
  return (
    activeProfileId === "all" ||
    field.appliesTo.includes("all") ||
    field.appliesTo.includes(activeProfileId)
  );
}

function getFilteredFields() {
  const query = normalize(searchInput.value);
  return fields
    .filter((field) => {
      const inSection = activeSectionId === "all" || field.sectionId === activeSectionId;
      const inProfile = fieldAppliesToProfile(field);
      const sourceText = field.sources
        .map((sourceId) => sourceById(sourceId)?.label || "")
        .join(" ");
      const haystack = normalize(
        [
          field.name,
          field.part,
          field.condition,
          field.meaning,
          field.format,
          field.examples.join(" "),
          field.mistakes.join(" "),
          sectionById(field.sectionId)?.label || "",
          sourceText,
        ].join(" "),
      );
      return inSection && inProfile && (!query || haystack.includes(query));
    })
    .sort((a, b) => (a.order || 99999) - (b.order || 99999));
}

function renderWorkflow() {
  workflowList.innerHTML = workflowFacts
    .map(
      (fact) => `
        <div class="workflow-item">
          <strong>${fact.title}</strong>
          <p>${fact.text}</p>
        </div>
      `,
    )
    .join("");
}

function renderProfiles() {
  profileTabs.innerHTML = visaProfiles
    .map(
      (profile) => {
        const enabled = enabledProfiles.has(profile.id);
        return `
        <button class="profile-tab ${profile.id === activeProfileId ? "active" : ""} ${enabled ? "" : "locked"}" type="button" data-profile="${profile.id}" ${enabled ? "" : "disabled"} title="${enabled ? profile.description : "暂未开放"}">
          ${profile.label}
          ${enabled ? "" : `<small>暂未开放</small>`}
        </button>
      `;
      },
    )
    .join("");

  const active = visaProfiles.find((profile) => profile.id === activeProfileId);
  profileDescription.textContent = active?.description || "当前仅开放 B1/B2。其他签证类别暂未开放，避免给出不确定指导。";
}

function renderSections() {
  sectionList.innerHTML = sections
    .map(
      (section) => `
        <button class="section-button ${section.id === activeSectionId ? "active" : ""}" type="button" data-section="${section.id}">
          <span>${section.label}</span>
          <small>${section.ceac}</small>
        </button>
      `,
    )
    .join("");
}

function renderFieldList() {
  const filtered = getFilteredFields();
  resultCount.textContent = `${filtered.length} 常见`;
  if (coverageNote) {
    coverageNote.textContent =
      coverage?.note || "当前字段库覆盖常见字段，不代表官方全量字段清单。";
  }

  if (!filtered.length) {
    fieldList.innerHTML = `<div class="empty-state">没有匹配字段。当前仅开放 B1/B2 常见字段；可以切换章节，或在下方粘贴截图中的英文问题生成保守核对模板。</div>`;
    return;
  }

  if (!filtered.includes(activeField)) {
    activeField = filtered[0];
  }

  fieldList.innerHTML = filtered
    .map((field) => {
      const section = sectionById(field.sectionId);
      return `
        <button class="field-button ${field === activeField ? "active" : ""}" type="button" data-id="${field.id}">
          <span class="field-name">${field.name}</span>
          <span class="field-meta">${section?.ceac || field.part}</span>
        </button>
      `;
    })
    .join("");
}

function listItems(items) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

function inferDocuments(field) {
  const text = normalize(`${field.name} ${field.part} ${field.meaning} ${field.format}`);
  const docs = new Set();

  if (text.includes("passport") || text.includes("birth") || text.includes("name")) {
    docs.add("护照个人信息页");
  }
  if (text.includes("i-20") || text.includes("sevis") || text.includes("student")) {
    docs.add("I-20 / DS-2019 / SEVIS 记录");
  }
  if (text.includes("i-797") || text.includes("petition") || text.includes("employer")) {
    docs.add("I-797 / I-129 / 雇主信");
  }
  if (text.includes("trip") || text.includes("arrival") || text.includes("travel")) {
    docs.add("行程计划 / 邀请信 / 酒店或活动信息");
  }
  if (text.includes("paying") || text.includes("fund") || text.includes("self")) {
    docs.add("资金证明 / 资助关系文件");
  }
  if (text.includes("refused") || text.includes("arrested") || text.includes("overstay")) {
    docs.add("旧签证记录 / 拒签单 / I-94 / 法院或警方记录");
  }

  if (!docs.size) {
    docs.add("护照");
    docs.add("与本题相关的官方支持文件");
  }

  return [...docs];
}

function makeActionSteps(field) {
  if (field.steps) return field.steps;

  const steps = [
    "先确认这道题是否出现在你当前签证类别和当前页面中。",
    "按真实事实填写，不为了看起来更容易获签而改变口径。",
    "提交前把答案和护照、预约类别、支持文件逐项核对。",
  ];

  if (field.format.includes("DD-MMM-YYYY")) {
    steps.push("日期统一按 DD-MMM-YYYY 准备，例如 15-AUG-2026。");
  }

  if (field.risk) {
    steps.push("如果你的情况落入风险提示，不要急着提交，先咨询领事馆或移民律师。");
  }

  return steps;
}

function renderSources(sourceIds = []) {
  const sources = sourceIds.map(sourceById).filter(Boolean);
  if (!sources.length) return "";

  return `
    <div class="answer-block">
      <strong>官方依据：</strong>
      <ul class="source-list">
        ${sources
          .map(
            (source) => `
              <li>
                <a href="${source.url}" target="_blank" rel="noreferrer">${source.label}</a>
                <span>${source.notes[0]}</span>
              </li>
            `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

function renderAnswer(field) {
  const section = sectionById(field.sectionId);
  const appliesTo = field.appliesTo
    .map((profileId) => visaProfiles.find((profile) => profile.id === profileId)?.label || profileId)
    .join(" / ");

  answerPanel.innerHTML = `
    <div class="tag-row">
      <span class="tag">${section?.ceac || field.part}</span>
      <span class="tag">适用：${appliesTo}</span>
      ${field.risk ? `<span class="tag risk-tag">风险字段</span>` : ""}
    </div>
    <h2>${field.name}</h2>
    <div class="answer-hero">
      <strong>这题怎么填</strong>
      <p>${field.format}</p>
    </div>
    <div class="answer-grid">
      <section class="action-panel">
        <strong>下一步照做</strong>
        <ol>${listItems(makeActionSteps(field))}</ol>
      </section>
      <section class="action-panel">
        <strong>提交前核对</strong>
        <ul>${listItems(inferDocuments(field))}</ul>
      </section>
    </div>
    <div class="answer-block">
      <strong>按你的情况选择</strong>
      <ul>${listItems(field.examples)}</ul>
    </div>
    <div class="answer-block">
      <strong>不要这样填</strong>
      <ol>${listItems(field.mistakes)}</ol>
    </div>
    ${
      field.risk
        ? `<div class="risk-box"><strong>先暂停核对</strong><p>${field.risk}</p></div>`
        : ""
    }
    ${
      field.legal
        ? `<div class="law-note"><strong>免责提示：</strong>${field.legal}</div>`
        : ""
    }
    <details class="detail-drawer">
      <summary>查看字段含义、显示条件和官方依据</summary>
      <div class="condition-box">
        <strong>CEAC 显示条件</strong>
        <p>${field.condition}</p>
      </div>
      <div class="answer-block">
        <strong>含义解读</strong>
        <p>${field.meaning}</p>
      </div>
      ${renderSources(field.sources)}
    </details>
  `;
}

function update() {
  renderProfiles();
  renderSections();
  renderFieldList();
  renderAnswer(activeField);
}

function renderCustomTemplate(question) {
  activeField = {
    id: "custom",
    sectionId: "all",
    name: question,
    part: "待核对字段",
    appliesTo: ["all"],
    condition: "你粘贴的是字段库尚未覆盖的问题。系统无法确认它的官方上下文、显示条件和签证类别适用范围。",
    sources: ["travel-faq"],
    meaning: "这是安全核对清单，不是确定答案。你需要回到 CEAC 页面上下文确认问题含义。",
    format: "先确认该问题所在页面、签证类别、是否为 Yes/No、下拉框、日期、地址或解释文本，是否允许 Does Not Apply，是否为 Optional。普通文本通常使用英文；日期按 DD-MMM-YYYY 准备。",
    examples: [
      "核对1：这题是不是只问事实状态？如果是，按真实情况选择，不要为了提高通过率改变事实。",
      "核对2：这题是不是要求填写姓名、地址、号码或日期？如果是，先对照护照、邀请信、预约信息或其他官方文件。",
      "核对3：这题是否涉及拒签、犯罪、移民违规、安全背景或虚假陈述？如果涉及，先暂停填写并咨询移民律师或领事馆。",
    ],
    mistakes: [
      "❌ 只根据中文直觉翻译作答 → ✅ 回到英文原文和页面上下文理解。",
      "❌ 不确定也强行填写 → ✅ 先核对官方文件、领事馆说明或咨询专业人士。",
      "❌ 忽略签证类别差异 → ✅ 区分 B 类短期访问、F/J 学生交流、H/L 等工作类签证。",
    ],
    risk: "⚠️ 如果这是安全背景、拒签、逮捕、非法滞留、虚假陈述或身份违规相关问题，错误填写可能产生严重后果。",
    legal: securityDisclaimer,
  };
  renderAnswer(activeField);
}

function formToPayload(form) {
  const data = new FormData(form);
  return {
    travelPurpose: data.get("travelPurpose") || "",
    intendedArrival: data.get("intendedArrival") || "",
    stayDays: data.get("stayDays") || "",
    usStayAddressType: data.get("usStayAddressType") || "",
    payer: data.get("payer") || "",
    employmentStatus: data.get("employmentStatus") || "",
    monthlyIncome: data.get("monthlyIncome") || "",
    passportValidMonths: data.get("passportValidMonths") || "",
    hasUSContact: data.get("hasUSContact") || "",
    usContactRelationship: data.get("usContactRelationship") || "",
    invitationStatus: data.get("invitationStatus") || "",
    tripSpecificity: data.get("tripSpecificity") || "",
    travelCompanions: data.get("travelCompanions") || "",
    homeTies: data.get("homeTies") || "",
    hasPreviousUSVisa: data.get("hasPreviousUSVisa") || "no",
    hasVisaRefusal: data.get("hasVisaRefusal") || "no",
    hasOverstayOrViolation: data.get("hasOverstayOrViolation") || "no",
    hasArrestOrConviction: data.get("hasArrestOrConviction") || "no",
  };
}

function renderReportList(title, items, tone) {
  if (!items.length) {
    return `
      <section class="report-card ${tone}">
        <strong>${title}</strong>
        <p>暂无。</p>
      </section>
    `;
  }

  return `
    <section class="report-card ${tone}">
      <strong>${title}</strong>
      <ul>${listItems(items)}</ul>
    </section>
  `;
}

function formatReportDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderLockedSection(title, text) {
  return `
    <section class="report-card locked-card">
      <strong>${title}</strong>
      <p>${text}</p>
      <span>Pro 解锁</span>
    </section>
  `;
}

function renderFreeReport(report) {
  const documents = report.documents || [];
  return `
    <div class="report-summary ${report.riskCount ? "has-risk" : ""}">
      <div class="report-title-row">
        <span>${report.product}</span>
        <span class="free-badge">免费预览</span>
      </div>
      <p class="report-id">报告编号：${report.reportId || "未保存"} · ${formatReportDate(report.generatedAt)}</p>
      <strong>${report.summary}</strong>
    </div>
    <div class="free-metrics">
      <div><span>${report.riskCount || 0}</span><strong>高风险项</strong></div>
      <div><span>${report.fixCount || 0}</span><strong>需补充项</strong></div>
      <div><span>${report.documentCount || documents.length}</span><strong>建议材料</strong></div>
    </div>
    <div class="report-grid">
      ${renderReportList("部分材料清单", documents, "docs")}
      ${renderReportList("免费预览提示", [report.preview?.risk, report.preview?.fixes].filter(Boolean), "fix")}
      ${renderLockedSection("完整逐项核对", "通过项、修改建议和高风险解释需要 Pro 解锁后查看。")}
      ${renderLockedSection("历史与导出", "报告历史、重新打开、打印 / PDF 属于 Pro 功能。")}
    </div>
    <div class="upgrade-box">
      <strong>${report.upgradeMessage || "升级 Pro 后可查看完整报告。"}</strong>
      <p>当前为开发版模拟解锁。后续接入真实支付后，会用支付回调替换本地解锁状态。</p>
      <button type="button" data-upgrade-pro>查看 Pro 解锁内容</button>
    </div>
    <div class="law-note"><strong>免责声明：</strong>${report.disclaimer}</div>
  `;
}

function renderProReport(report) {
  currentReport = report;
  const isPro = report.access === "pro" && !report.locked;

  if (!isPro) {
    proReportOutput.innerHTML = renderFreeReport(report);
    return;
  }

  proReportOutput.innerHTML = `
    <div class="report-summary ${report.risks.length ? "has-risk" : ""}">
      <div class="report-title-row">
        <span>${report.product}</span>
        <span class="pro-badge">Pro 已解锁</span>
        <button class="secondary-button compact-button" type="button" data-print-report>打印 / 导出</button>
      </div>
      <p class="report-id">报告编号：${report.reportId || "未保存"} · ${formatReportDate(report.generatedAt)}</p>
      <strong>${report.summary}</strong>
    </div>
    <div class="report-grid">
      ${renderReportList("通过项", report.passed || [], "pass")}
      ${renderReportList("需补充 / 需统一", report.fixes || [], "fix")}
      ${renderReportList("高风险项", report.risks || [], "risk")}
      ${renderReportList("建议材料清单", report.documents || [], "docs")}
    </div>
    <div class="law-note"><strong>免责声明：</strong>${report.disclaimer}</div>
  `;
}

function renderReportHistory(items) {
  if (!reportHistoryList) return;

  if (!items.length) {
    reportHistoryList.innerHTML = `<p>暂无历史报告。</p>`;
    return;
  }

  reportHistoryList.innerHTML = items
    .map(
      (item) => `
        <button class="history-item" type="button" data-report-id="${item.reportId}">
          <span>${item.reportId}</span>
          <strong>${item.summary}</strong>
          <small>${formatReportDate(item.generatedAt)} · 风险 ${item.riskCount} · 待补充 ${item.fixCount}</small>
        </button>
      `,
    )
    .join("");
}

async function generateProReport(payload) {
  const response = await fetch(apiPath("/api/reports/b1b2"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(isProUnlocked() ? { "x-ds160-pro": "demo" } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Report API failed");
  }

  return response.json();
}

async function loadReportHistory() {
  if (!reportHistoryList) return;

  try {
    const response = await fetch(apiPath("/api/reports/b1b2"), {
      headers: isProUnlocked() ? { "x-ds160-pro": "demo" } : {},
    });
    if (!response.ok) throw new Error("History API failed");
    const payload = await response.json();
    if (payload.locked) {
      reportHistoryList.innerHTML = `
        <div class="history-locked">
          <strong>Pro 功能</strong>
          <p>${payload.message || "历史记录需要升级 Pro 后使用。"}</p>
          <button type="button" data-upgrade-pro>查看 Pro</button>
        </div>
      `;
      return;
    }
    renderReportHistory(payload.reports || []);
  } catch (error) {
    reportHistoryList.innerHTML = `<p>历史记录暂时无法读取，请确认本地 Node 服务正在运行。</p>`;
  }
}

async function loadStoredReport(reportId) {
  const response = await fetch(apiPath(`/api/reports/b1b2/${encodeURIComponent(reportId)}`), {
    headers: isProUnlocked() ? { "x-ds160-pro": "demo" } : {},
  });
  if (!response.ok) throw new Error("Stored report not found");
  return response.json();
}

function printCurrentReport() {
  if (!currentReport) return;
  const printWindow = window.open("", "_blank", "width=920,height=720");
  if (!printWindow) return;

  const section = proReportOutput.innerHTML;
  printWindow.document.write(`
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${currentReport.reportId || "B1/B2 Pro 核对报告"}</title>
        <style>
          body { margin: 0; padding: 28px; color: #18212b; font-family: "Microsoft YaHei", Arial, sans-serif; }
          button { display: none; }
          .report-summary { padding: 16px; border: 1px solid #d9e0e7; background: #eef9f7; }
          .report-summary.has-risk { background: #fff8e8; }
          .report-title-row { display: flex; justify-content: space-between; gap: 12px; }
          .report-id { color: #5b6672; font-size: 13px; }
          .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
          .report-card { padding: 14px; border: 1px solid #d9e0e7; border-radius: 8px; }
          .report-card strong { display: block; margin-bottom: 8px; }
          li { margin-bottom: 6px; line-height: 1.55; }
          .law-note { margin-top: 14px; padding: 12px; background: #fff0ed; color: #62342e; }
          @media print { body { padding: 18px; } .report-grid { break-inside: avoid; } }
        </style>
      </head>
      <body>${section}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function openUpgradeModal() {
  if (!upgradeModal) return;
  const demoButton = upgradeModal.querySelector("[data-demo-unlock]");
  if (demoButton) {
    demoButton.textContent = isProUnlocked() ? "已模拟解锁 Pro" : "模拟解锁 Pro";
  }
  upgradeModal.hidden = false;
  document.body.classList.add("modal-open");
  const closeButton = upgradeModal.querySelector("[data-close-upgrade]");
  if (closeButton) closeButton.focus();
}

function closeUpgradeModal() {
  if (!upgradeModal) return;
  upgradeModal.hidden = true;
  document.body.classList.remove("modal-open");
}

async function unlockProDemo() {
  setProUnlocked(true);
  closeUpgradeModal();
  await loadReportHistory();

  if (currentReport?.reportId) {
    proReportOutput.innerHTML = `<div class="empty-state">正在加载完整 Pro 报告...</div>`;
    try {
      renderProReport(await loadStoredReport(currentReport.reportId));
      return;
    } catch (error) {
      proReportOutput.innerHTML = `<div class="empty-state">Pro 已模拟解锁。请重新生成报告查看完整内容。</div>`;
      return;
    }
  }

  proReportOutput.innerHTML = `<div class="empty-state">Pro 已模拟解锁。请填写左侧信息并生成完整核对报告。</div>`;
}

profileTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-profile]");
  if (!button) return;
  if (button.disabled || !enabledProfiles.has(button.dataset.profile)) return;
  activeProfileId = button.dataset.profile;
  const first = getFilteredFields()[0];
  if (first) activeField = first;
  update();
});

sectionList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-section]");
  if (!button) return;
  activeSectionId = button.dataset.section;
  searchInput.value = "";
  const first = getFilteredFields()[0];
  if (first) activeField = first;
  update();
});

fieldList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const next = fields.find((field) => field.id === button.dataset.id);
  if (!next) return;
  activeField = next;
  update();
});

searchInput.addEventListener("input", () => {
  renderFieldList();
  renderAnswer(activeField);
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  update();
  searchInput.focus();
});

customForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = customInput.value.trim();
  if (!value) return;
  renderCustomTemplate(value);
});

if (proReportForm) {
  proReportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = formToPayload(proReportForm);
    proReportOutput.innerHTML = `<div class="empty-state">正在生成 B1/B2 核对预览...</div>`;

    try {
      const report = await generateProReport(payload);
      renderProReport(report);
      loadReportHistory();
    } catch (error) {
      proReportOutput.innerHTML = `
        <div class="risk-box">
          <strong>报告暂时无法生成</strong>
          <p>请确认本地 Node 服务正在运行，再刷新页面重试。当前功能需要后端接口 /api/reports/b1b2。</p>
        </div>
      `;
    }
  });

  proReportForm.addEventListener("reset", () => {
    window.setTimeout(() => {
      currentReport = null;
      proReportOutput.innerHTML = `<div class="empty-state">填写左侧信息后生成报告。系统只做 B1/B2 一致性核对和风险分流，不替你判断应选 Yes 或 No。</div>`;
    }, 0);
  });
}

if (proReportOutput) {
  proReportOutput.addEventListener("click", (event) => {
    const upgradeButton = event.target.closest("[data-upgrade-pro]");
    if (upgradeButton) {
      openUpgradeModal();
      return;
    }

    const printButton = event.target.closest("[data-print-report]");
    if (!printButton) return;
    printCurrentReport();
  });
}

if (reportHistoryList) {
  reportHistoryList.addEventListener("click", async (event) => {
    const upgradeButton = event.target.closest("[data-upgrade-pro]");
    if (upgradeButton) {
      openUpgradeModal();
      return;
    }

    const button = event.target.closest("[data-report-id]");
    if (!button) return;
    proReportOutput.innerHTML = `<div class="empty-state">正在读取历史报告...</div>`;
    try {
      renderProReport(await loadStoredReport(button.dataset.reportId));
    } catch (error) {
      proReportOutput.innerHTML = `<div class="risk-box"><strong>历史报告无法读取</strong><p>这份报告可能已被清理，或本地服务没有正确运行。</p></div>`;
    }
  });
}

if (upgradeModal) {
  upgradeModal.addEventListener("click", (event) => {
    if (event.target === upgradeModal || event.target.closest("[data-close-upgrade]")) {
      closeUpgradeModal();
      return;
    }

    if (event.target.closest("[data-demo-unlock]")) {
      unlockProDemo();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !upgradeModal.hidden) {
      closeUpgradeModal();
    }
  });
}

renderWorkflow();
update();
loadReportHistory();
})();
