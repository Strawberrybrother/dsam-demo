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

let activeSectionId = "all";
let activeProfileId = "all";
let activeField = fields[0];

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
  return fields.filter((field) => {
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
  });
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
      (profile) => `
        <button class="profile-tab ${profile.id === activeProfileId ? "active" : ""}" type="button" data-profile="${profile.id}">
          ${profile.label}
        </button>
      `,
    )
    .join("");

  const active = visaProfiles.find((profile) => profile.id === activeProfileId);
  profileDescription.textContent = active?.description || "";
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
    fieldList.innerHTML = `<div class="empty-state">没有匹配字段。可以切换“全部类别/全部章节”，或在下方粘贴截图中的英文问题生成保守核对模板。</div>`;
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
    part: "待确认字段",
    appliesTo: ["all"],
    condition: "你粘贴的是自定义字段文字。当前静态版无法保证该字段的官方上下文、显示条件和签证类别适用范围。",
    sources: ["travel-faq"],
    meaning: "未知字段只能作为核对模板处理。不要把模板当作官方字段解释；需要回到 CEAC 页面上下文确认。",
    format: "先确认该问题所在页面、签证类别、是否有下拉项、是否允许 Does Not Apply、是否为 Optional。所有日期建议按 DD-MMM-YYYY 准备；普通文本通常应使用英文。",
    examples: [
      "情况A：如该字段要求选择事实状态，应根据真实情况选择，不要为了提高通过率改变事实。",
      "情况B：如该字段要求填写姓名、地址、号码或日期，应与护照、I-20、DS-2019、I-797、邀请信等文件一致。",
      "情况C：如该字段涉及拒签、犯罪、移民违规、安全背景或虚假陈述，请先咨询移民律师。",
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

profileTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-profile]");
  if (!button) return;
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

renderWorkflow();
update();
})();
